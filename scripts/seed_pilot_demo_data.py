"""Optional pilot/demo seed script (Task 08 Section 5).

Populates a running Vetrix ERP instance with a realistic-but-clearly-fake
dataset so a pilot administrator can exercise the app's real workflows
(multi-warehouse stock, invoicing, purchasing, budgeting, catalog, HR leave,
marketing consent) without waiting for real business data to accumulate.

Every record this script creates is prefixed/tagged "DEMO" or "PILOT TEST
DATA" so it is unmistakable in the UI and easy to find/delete later. Nothing
here runs automatically - it must be invoked explicitly, and it refuses to
run against a database that already has real users unless you pass
--i-understand-this-is-not-a-fresh-database, and refuses to run against a
production-flagged server unless you also pass
--i-understand-this-is-production. It never touches a database directly
(no raw SQL) - every record is created through the same real HTTP API
endpoints and validation a real user's browser would call.

Usage:
    python scripts/seed_pilot_demo_data.py --base-url http://127.0.0.1:8001 --yes

Requires the target server to already be running. Requires the `httpx`
package (already a backend dependency - see backend/requirements.txt).
"""
import argparse
import sys
from datetime import date, timedelta

import httpx

DEMO_TAG = "DEMO"


def _today():
    return date.today()


def _iso(d):
    return d.isoformat()


class SeedError(RuntimeError):
    pass


class Seeder:
    def __init__(self, base_url: str):
        self.client = httpx.Client(base_url=base_url, timeout=30.0)
        self.token = None
        self.created = {"branches": [], "warehouses": [], "users": [], "products": [],
                         "customers": [], "invoices": [], "purchase_orders": [], "cheques": [],
                         "employees": [], "catalogs": []}

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def request(self, method, path, expect=(200,), **kwargs):
        response = self.client.request(method, path, headers=self._headers(), **kwargs)
        if response.status_code not in expect:
            raise SeedError(f"{method} {path} -> {response.status_code}: {response.text[:400]}")
        return response

    def bootstrap_or_login(self, username, password, full_name):
        status = self.request("GET", "/setup/status").json()
        if not status["initialized"]:
            print(f"Fresh instance detected - bootstrapping first admin '{username}'.")
            self.request("POST", "/users", json={
                "full_name": full_name, "username": username, "password": password, "role": "admin",
            })
        login = self.request("POST", "/login", json={"username": username, "password": password})
        self.token = login.json()["access_token"]
        print(f"Authenticated as '{username}'.")

    # -- Company / branches / warehouses -----------------------------------
    def seed_structure(self):
        branch_a = self.request("POST", "/api/branches", json={
            "name": f"{DEMO_TAG} Branch - Downtown", "code": "DEMO-BR-A",
        }).json()
        branch_b = self.request("POST", "/api/branches", json={
            "name": f"{DEMO_TAG} Branch - Uptown", "code": "DEMO-BR-B",
        }).json()
        self.created["branches"] = [branch_a["id"], branch_b["id"]]

        warehouses = self.request("GET", "/api/warehouses").json()["items"]
        default_warehouse = next(w for w in warehouses if w["is_default"])
        warehouse_a = self.request("POST", "/api/warehouses", json={
            "name": f"{DEMO_TAG} Warehouse A", "code": "DEMO-WH-A", "branch_id": branch_a["id"],
        }).json()
        warehouse_b = self.request("POST", "/api/warehouses", json={
            "name": f"{DEMO_TAG} Warehouse B", "code": "DEMO-WH-B", "branch_id": branch_b["id"],
        }).json()
        self.created["warehouses"] = [default_warehouse["id"], warehouse_a["id"], warehouse_b["id"]]
        print(f"Created 2 branches, 2 additional warehouses (plus the existing default '{default_warehouse['name']}').")
        return branch_a, branch_b, default_warehouse, warehouse_a, warehouse_b

    def seed_users(self):
        roster = [
            ("demo-accountant", "DemoAccountant!2026", "accountant", "Demo Accountant"),
            ("demo-sales", "DemoSalesUser!2026", "sales", "Demo Sales Rep"),
            ("demo-warehouse", "DemoWarehouse!2026", "warehouse", "Demo Warehouse Staff"),
            ("demo-viewer", "DemoViewerUser!2026", "viewer", "Demo Viewer"),
        ]
        for username, password, role, full_name in roster:
            response = self.client.post("/users", headers=self._headers(), json={
                "full_name": full_name, "username": username, "password": password, "role": role,
            })
            if response.status_code == 200:
                self.created["users"].append(response.json()["id"])
            elif response.status_code == 409:
                pass  # already seeded on a prior run - not an error
            else:
                raise SeedError(f"POST /users ({username}) -> {response.status_code}: {response.text[:300]}")
        print(f"Ensured {len(roster)} role-representative demo users exist (admin/accountant/sales/warehouse/viewer).")

    # -- Products / stock ----------------------------------------------------
    def seed_products(self, default_warehouse, warehouse_a, warehouse_b):
        catalog = [
            (f"{DEMO_TAG} Widget Standard", "Widgets", 150.0, 90.0, 200),
            (f"{DEMO_TAG} Widget Pro", "Widgets", 300.0, 180.0, 80),
            (f"{DEMO_TAG} Gadget Mini", "Gadgets", 60.0, 35.0, 15),  # deliberately low stock
        ]
        products = []
        for name, category, sell_price, buy_price, stock in catalog:
            created = self.request("POST", "/products", json={
                "name": name, "main_category": category, "sell_price": sell_price,
                "buy_price": buy_price, "stock": stock, "min_stock": 20,
            }).json()
            products.append(created)
        self.created["products"] = [p["id"] for p in products]

        # Split the first product across both branch warehouses so Smart
        # Inventory/Executive Alerts/Executive Agent have real branch-level
        # numbers to agree on (branch A well-stocked, branch B thin).
        widget = products[0]
        self.request("POST", "/api/warehouses/transfer", json={
            "product_id": widget["id"], "from_warehouse_id": default_warehouse["id"],
            "to_warehouse_id": warehouse_a["id"], "quantity": 80,
        })
        self.request("POST", "/api/warehouses/transfer", json={
            "product_id": widget["id"], "from_warehouse_id": default_warehouse["id"],
            "to_warehouse_id": warehouse_b["id"], "quantity": 5,
        })
        print(f"Created {len(products)} demo products (2 categories); split stock across branch A (well-stocked) and branch B (thin).")
        return products

    # -- Customers / supplier / consent --------------------------------------
    def seed_parties(self):
        opted_in = self.request("POST", "/customers", json={
            "name": f"{DEMO_TAG} Customer - Opted In", "phone": "09120000001",
            "marketing_consent": True,
        }).json()
        opted_out = self.request("POST", "/customers", json={
            "name": f"{DEMO_TAG} Customer - Opted Out", "phone": "09120000002",
            "marketing_consent": False,
        }).json()
        supplier = self.request("POST", "/customers", json={
            "name": f"{DEMO_TAG} Supplier Co", "phone": "09120000003",
            "customer_type": "supplier",
        }).json()
        for c in (opted_in, opted_out, supplier):
            self.created["customers"].append(c.get("id") or c.get("customer", {}).get("id"))
        print("Created 2 demo customers (one opted-in, one opted-out of marketing) and 1 demo supplier.")
        return opted_in, opted_out, supplier

    # -- Pricing --------------------------------------------------------------
    def seed_pricing(self, product):
        self.request("POST", "/api/pricing/rules", json={
            "name": f"{DEMO_TAG} 10% off Widgets", "priority": 50,
            "scope_type": "product", "scope_value": str(product["id"]),
            "price_mode": "percent_discount", "price_value": 10,
            "status": "active", "notes": "Pilot demo pricing rule.",
        })
        print("Created 1 demo pricing rule (10% off a demo product).")

    # -- Fiscal period / budget ------------------------------------------------
    def seed_fiscal_period_and_budget(self):
        # A default fiscal year period already exists for a freshly-bootstrapped
        # company - reuse it rather than trying to create an overlapping one
        # (fiscal periods for a company may never overlap).
        existing = self.request("GET", "/api/accounting/periods").json()
        period = next((p for p in existing if p["status"] == "open"), None)
        if period is None:
            start = _today().replace(day=1)
            end = (start + timedelta(days=40)).replace(day=1) - timedelta(days=1)
            period = self.request("POST", "/api/accounting/periods", json={
                "name": f"{DEMO_TAG} Fiscal Period", "start_date": _iso(start), "end_date": _iso(end),
            }).json()
        accounts = self.request("GET", "/api/accounting/entries/chart").json()
        expense = next(a for a in accounts if a["account_type"] == "expense")
        cash = next(a for a in accounts if a["code"].startswith("11"))
        self.request("POST", "/api/accounting/budgets/lines", json={
            "fiscal_period_id": period["id"], "account_id": expense["id"], "amount": 100,
            "note": f"{DEMO_TAG} intentionally small budget so a real voucher below overshoots it.",
        })
        # A deliberately over-budget posted voucher, so /api/bi-improvement/recalculate
        # has a genuine budget_variance finding to detect, and Executive Alerts/the
        # Executive Agent's budget tool have a real number to agree on.
        self.request("POST", "/api/accounting/entries", json={
            "voucher_date": _iso(_today()), "description": f"{DEMO_TAG} over-budget expense", "status": "posted",
            "lines": [
                {"account_id": expense["id"], "debit": 250, "credit": 0},
                {"account_id": cash["id"], "debit": 0, "credit": 250},
            ],
        })
        recalculated = self.request("POST", "/api/bi-improvement/recalculate").json()
        findings = self.request("GET", "/api/bi-improvement/findings?category=budget_variance").json()["items"]
        if findings:
            self.request("POST", f"/api/bi-improvement/findings/{findings[0]['id']}/plans", json={
                "objective": f"{DEMO_TAG} bring expense spending back within the approved budget",
                "selected_action": "Review the over-budget expense category and freeze discretionary spending.",
                "priority": "medium",
            })
        print(f"Created fiscal period '{period['name']}', a demo budget line, a deliberately over-budget "
              f"voucher, {len(recalculated.get('created', []))} new BI finding(s), and 1 demo improvement action plan.")
        return period, expense, cash

    # -- Invoice / settlement ---------------------------------------------------
    def seed_invoice(self, customer, product):
        invoice = self.request("POST", "/invoices", json={
            "invoice_type": "sale", "customer_id": customer["id"],
            "items": [{"product_id": product["id"], "quantity": 2, "unit_price": product["sell_price"]}],
        }).json()
        invoice_id = invoice["invoice_id"]
        self.created["invoices"].append(invoice_id)
        total = product["sell_price"] * 2
        self.request("POST", "/transactions", json={
            "type": "receipt", "customer_id": customer["id"], "invoice_id": invoice_id,
            "amount": round(total / 2, 2), "method": "cash", "note": f"{DEMO_TAG} partial settlement",
        })
        print(f"Created 1 demo invoice (#{invoice_id}) with a partial payment, so receivables/aging have real data.")
        return invoice_id

    # -- Purchase order ---------------------------------------------------------
    def seed_purchase_order(self, supplier, product, warehouse_b):
        po = self.request("POST", "/api/purchase-orders", json={
            "supplier_id": supplier["id"], "supplier_name": supplier["name"],
            "items": [{"product_id": product["id"], "quantity": 30, "unit_price": product["buy_price"]}],
            "default_warehouse_id": warehouse_b["id"],
        }).json()
        po_id = po["id"]
        self.created["purchase_orders"].append(po_id)
        self.request("POST", f"/api/purchase-orders/{po_id}/dispatch", json={"method": "manual", "note": f"{DEMO_TAG} dispatch"})
        detail = self.request("GET", f"/api/purchase-orders/{po_id}").json()
        item_id = detail["items"][0]["id"]
        self.request("POST", f"/api/purchase-orders/{po_id}/receive", json={
            "items": [{"po_item_id": item_id, "quantity": 15}], "note": f"{DEMO_TAG} partial receipt",
        })
        print(f"Created 1 demo purchase order (#{po_id}), dispatched and partially received into branch B's warehouse.")
        return po_id

    # -- Cheque -------------------------------------------------------------------
    def seed_cheque(self, customer):
        self.request("POST", "/api/accounting/treasury/cheques", json={
            "direction": "received", "customer_id": customer["id"], "amount": 500,
            "cheque_number": "DEMO-0001", "bank_name": "Demo Bank",
            "issue_date": _iso(_today()), "due_date": _iso(_today() + timedelta(days=30)),
            "note": f"{DEMO_TAG} receivable cheque example",
        })
        print("Created 1 demo receivable cheque example.")

    # -- Catalog --------------------------------------------------------------------
    def seed_catalog(self, branch_a, product):
        catalog = self.request("POST", "/api/catalog/links", json={
            "title": f"{DEMO_TAG} Branch A Product Catalog", "branch_id": branch_a["id"],
            "product_ids": [product["id"]], "language": "fa",
        }).json()
        self.created["catalogs"].append(catalog.get("id"))
        print("Created 1 demo branch-scoped catalog.")

    # -- Employee / leave -------------------------------------------------------------
    def seed_employee(self, branch_a):
        employee = self.request("POST", "/api/hr", json={
            "first_name": "Demo", "last_name": "Employee", "job_title": "Warehouse Associate",
            "department": "Operations", "branch_id": branch_a["id"], "start_date": _iso(_today()),
        }).json()
        employee_id = employee["id"]
        self.created["employees"].append(employee_id)
        self.request("PUT", f"/api/hr/{employee_id}/leave/balances", json={"leave_type": "annual", "entitlement": 20})
        self.request("POST", f"/api/hr/{employee_id}/leave/requests", json={
            "leave_type": "annual", "start_date": _iso(_today() + timedelta(days=10)),
            "end_date": _iso(_today() + timedelta(days=12)), "reason": f"{DEMO_TAG} leave request example",
        })
        print(f"Created 1 demo employee (#{employee_id}) with a leave balance and a pending leave request.")

    def summary(self):
        print("\n=== DEMO / PILOT TEST DATA seeded ===")
        for kind, ids in self.created.items():
            if ids:
                print(f"  {kind}: {ids}")
        print("Every record above is tagged 'DEMO' in its name/note field for easy identification and cleanup.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--admin-username", default="demo-admin")
    parser.add_argument("--admin-password", default="DemoAdminPassword!2026")
    parser.add_argument("--yes", action="store_true", help="Required - confirms you intend to write demo data.")
    parser.add_argument("--i-understand-this-is-not-a-fresh-database", action="store_true",
                         help="Required if the target instance already has users, to avoid seeding demo data into a real deployment by accident.")
    parser.add_argument("--i-understand-this-is-production", action="store_true",
                         help="Required if the target instance reports VETRIX_ENV=production.")
    args = parser.parse_args()

    if not args.yes:
        print("Refusing to run without --yes (this writes real records to the target instance).", file=sys.stderr)
        sys.exit(1)

    seeder = Seeder(args.base_url)

    status = seeder.client.get("/setup/status").json()
    if status.get("initialized") and not args.i_understand_this_is_not_a_fresh_database:
        print(f"Target already has {status.get('user_count')} user(s) - this is not a fresh database. "
              "Refusing without --i-understand-this-is-not-a-fresh-database.", file=sys.stderr)
        sys.exit(1)

    try:
        seeder.bootstrap_or_login(args.admin_username, args.admin_password, "Demo Admin")

        # /api/system/version requires auth, so this check only happens
        # after login/bootstrap - before any demo record is written.
        version = seeder.client.get("/api/system/version", headers=seeder._headers()).json()
        if version.get("environment") == "production" and not args.i_understand_this_is_production:
            print("Target reports VETRIX_ENV=production. Refusing without --i-understand-this-is-production.", file=sys.stderr)
            sys.exit(1)

        branch_a, branch_b, default_warehouse, warehouse_a, warehouse_b = seeder.seed_structure()
        seeder.seed_users()
        products = seeder.seed_products(default_warehouse, warehouse_a, warehouse_b)
        opted_in, opted_out, supplier = seeder.seed_parties()
        seeder.seed_pricing(products[0])
        seeder.seed_fiscal_period_and_budget()
        seeder.seed_invoice(opted_in, products[0])
        seeder.seed_purchase_order(supplier, products[1], warehouse_b)
        seeder.seed_cheque(opted_in)
        seeder.seed_catalog(branch_a, products[0])
        seeder.seed_employee(branch_a)
    except SeedError as error:
        print(f"\nSeeding failed: {error}", file=sys.stderr)
        sys.exit(1)

    seeder.summary()


if __name__ == "__main__":
    main()
