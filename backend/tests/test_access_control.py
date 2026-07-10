import os
import tempfile
import unittest
from pathlib import Path

TEST_DATABASE = Path(tempfile.gettempdir()) / f"vetrix-test-{os.getpid()}.db"
os.environ["VETRIX_DATABASE_URL"] = f"sqlite:///{TEST_DATABASE}"
os.environ["VETRIX_JWT_SECRET"] = "integration-test-secret-not-for-production"

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import engine
from main import app


class ApiAccessControlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        TEST_DATABASE.unlink(missing_ok=True)

    def test_complete_authentication_and_authorization_flow(self):
        protected = self.client.get("/customers")
        self.assertEqual(protected.status_code, 401)

        export = self.client.get("/export/invoices-pdf")
        self.assertEqual(export.status_code, 401)

        admin_payload = {
            "full_name": "Test Administrator",
            "username": "ci-admin",
            "password": "StrongAdminPassword!42",
            "role": "admin",
        }
        bootstrap = self.client.post("/users", json=admin_payload)
        self.assertEqual(bootstrap.status_code, 200, bootstrap.text)

        wrong_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "wrong"},
        )
        self.assertEqual(wrong_login.status_code, 401)

        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(login.status_code, 200, login.text)
        admin_token = login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        customers = self.client.get("/customers", headers=admin_headers)
        self.assertEqual(customers.status_code, 200, customers.text)

        unauthenticated_user_create = self.client.post(
            "/users",
            json={
                "full_name": "Blocked User",
                "username": "blocked-user",
                "password": "BlockedPassword!42",
                "role": "user",
            },
        )
        self.assertEqual(unauthenticated_user_create.status_code, 401)

        user_create = self.client.post(
            "/users",
            headers=admin_headers,
            json={
                "full_name": "Standard User",
                "username": "ci-user",
                "password": "StrongUserPassword!42",
                "role": "user",
            },
        )
        self.assertEqual(user_create.status_code, 200, user_create.text)

        user_login = self.client.post(
            "/login",
            json={"username": "ci-user", "password": "StrongUserPassword!42"},
        )
        user_token = user_login.json()["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}

        forbidden_users = self.client.get("/users", headers=user_headers)
        self.assertEqual(forbidden_users.status_code, 403)

        users = self.client.get("/users", headers=admin_headers)
        self.assertEqual(users.status_code, 200, users.text)
        self.assertTrue(users.json())
        self.assertTrue(all("password" not in item for item in users.json()))


    def test_general_ledger_is_balanced(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        trial = self.client.get(
            "/api/accounting/entries/reports/trial-balance",
            headers=headers,
            params={"status": "posted", "include_zero": "false"},
        )
        self.assertEqual(trial.status_code, 200, trial.text)
        payload = trial.json()
        self.assertTrue(payload["totals"]["balanced"], payload)
        self.assertEqual(payload["totals"]["difference"], 0.0)

        rows = {row["account_code"]: row for row in payload["rows"]}
        self.assertEqual(rows["1103"]["debit_balance"], 1000.0)
        self.assertEqual(rows["4101"]["credit_balance"], 2000.0)
        self.assertEqual(rows["4102"]["debit_balance"], 1000.0)
        self.assertEqual(rows["5101"]["debit_balance"], 400.0)
        self.assertEqual(rows["1201"]["credit_balance"], 400.0)
        self.assertEqual(rows["5102"]["debit_balance"], 100.0)
        self.assertEqual(rows["1101"]["credit_balance"], 100.0)

        journal = self.client.get(
            "/api/accounting/entries/reports/journal",
            headers=headers,
            params={"status": "posted"},
        )
        self.assertEqual(journal.status_code, 200, journal.text)
        self.assertGreaterEqual(len(journal.json()), 10)

        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted"},
        )
        sources = {item["source_type"] for item in vouchers.json()}
        self.assertIn("invoice", sources)
        self.assertIn("expense", sources)

    def test_invoice_integrity_flow(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        customer = self.client.post(
            "/customers",
            headers=headers,
            json={"name": "Accounting Test Customer"},
        )
        customer_id = customer.json()["id"]

        product = self.client.post(
            "/products",
            headers=headers,
            json={"name": "Integrity Test Product", "sell_price": 1000, "stock": 10},
        )
        product_id = product.json()["id"]

        duplicate_stock_payload = {
            "invoice_type": "sale",
            "customer_id": customer_id,
            "payment_status": "unpaid",
            "items": [
                {"product_id": product_id, "quantity": 6, "unit_price": 1000},
                {"product_id": product_id, "quantity": 5, "unit_price": 1000},
            ],
        }
        rejected = self.client.post("/invoices", headers=headers, json=duplicate_stock_payload)
        self.assertEqual(rejected.json()["status"], "error")
        products = self.client.get("/products", headers=headers).json()
        self.assertEqual(next(item for item in products if item["id"] == product_id)["stock"], 10)

        invoice_payload = {
            "invoice_type": "sale",
            "customer_id": customer_id,
            "discount_percent": 10,
            "tax_percent": 10,
            "shipping_cost": 50,
            "payment_status": "unpaid",
            "items": [
                {"product_id": product_id, "quantity": 2, "unit_price": 1000},
            ],
        }
        created = self.client.post("/invoices", headers=headers, json=invoice_payload)
        self.assertEqual(created.json()["status"], "created", created.text)
        self.assertEqual(created.json()["total_amount"], 2030.0)
        invoice_id = created.json()["invoice_id"]

        products = self.client.get("/products", headers=headers).json()
        self.assertEqual(next(item for item in products if item["id"] == product_id)["stock"], 8)

        partial = self.client.post(
            "/transactions",
            headers=headers,
            json={
                "customer_id": customer_id,
                "invoice_id": invoice_id,
                "transaction_type": "receipt",
                "amount": 1000,
            },
        )
        self.assertEqual(partial.json()["invoice_payment_status"], "partial")
        self.assertEqual(partial.json()["invoice_remaining"], 1030.0)

        overpayment = self.client.post(
            "/transactions",
            headers=headers,
            json={
                "customer_id": customer_id,
                "invoice_id": invoice_id,
                "transaction_type": "receipt",
                "amount": 1031,
            },
        )
        self.assertEqual(overpayment.json()["status"], "error")

        paid = self.client.post(
            "/transactions",
            headers=headers,
            json={
                "customer_id": customer_id,
                "invoice_id": invoice_id,
                "transaction_type": "receipt",
                "amount": 1030,
            },
        )
        self.assertEqual(paid.json()["invoice_payment_status"], "paid")
        self.assertEqual(paid.json()["invoice_remaining"], 0.0)

        blocked_edit = self.client.put(
            f"/invoices/{invoice_id}",
            headers=headers,
            json=invoice_payload,
        )
        self.assertEqual(blocked_edit.json()["status"], "error")

        blocked_delete = self.client.delete(f"/invoices/{invoice_id}", headers=headers)
        self.assertEqual(blocked_delete.json()["status"], "error")

        transactions = self.client.get("/transactions", headers=headers).json()
        receipt_ids = [
            item["id"]
            for item in transactions
            if item["source_id"] == invoice_id and item["source_type"] == "receipt"
        ]
        self.assertEqual(len(receipt_ids), 2)

        self.client.delete(f"/transactions/{receipt_ids[0]}", headers=headers)
        invoices = self.client.get("/invoices", headers=headers).json()
        invoice = next(item for item in invoices if item["id"] == invoice_id)
        self.assertEqual(invoice["payment_status"], "partial")
        self.assertEqual(invoice["remaining_amount"], 1030.0)

        self.client.delete(f"/transactions/{receipt_ids[1]}", headers=headers)
        deleted = self.client.delete(f"/invoices/{invoice_id}", headers=headers)
        self.assertEqual(deleted.json()["status"], "deleted", deleted.text)

        products = self.client.get("/products", headers=headers).json()
        self.assertEqual(next(item for item in products if item["id"] == product_id)["stock"], 10)


    def test_financial_reports_use_cogs_and_net_returns(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        customer = self.client.post(
            "/customers",
            headers=headers,
            json={"name": "Reporting Test Customer"},
        )
        customer_id = customer.json()["id"]

        product = self.client.post(
            "/products",
            headers=headers,
            json={
                "name": "Reporting Test Product",
                "buy_price": 400,
                "sell_price": 1000,
                "stock": 20,
            },
        )
        self.assertEqual(product.json()["buy_price"], 400.0)
        self.assertEqual(product.json()["sell_price"], 1000.0)
        product_id = product.json()["id"]

        def invoice(invoice_type, quantity, unit_price):
            response = self.client.post(
                "/invoices",
                headers=headers,
                json={
                    "invoice_type": invoice_type,
                    "customer_id": customer_id,
                    "payment_status": "unpaid",
                    "items": [{
                        "product_id": product_id,
                        "quantity": quantity,
                        "unit_price": unit_price,
                    }],
                },
            )
            self.assertEqual(response.json()["status"], "created", response.text)
            return response.json()["invoice_id"]

        invoice("sale", 2, 1000)
        invoice("return_sale", 1, 1000)
        invoice("proforma", 1, 1000)

        expense = self.client.post(
            "/expenses",
            headers=headers,
            json={"title": "Reporting expense", "amount": 100},
        )
        self.assertEqual(expense.json()["status"], "created")

        report = self.client.get("/reports/overview", headers=headers)
        self.assertEqual(report.status_code, 200, report.text)
        payload = report.json()
        profit = payload["profit_loss"]

        self.assertEqual(profit["sales"], 2000.0)
        self.assertEqual(profit["sales_returns"], 1000.0)
        self.assertEqual(profit["net_sales"], 1000.0)
        self.assertEqual(profit["cost_of_goods_sold"], 400.0)
        self.assertEqual(profit["gross_profit"], 600.0)
        self.assertEqual(profit["expenses"], 100.0)
        self.assertEqual(profit["net_profit"], 500.0)

        self.assertEqual(payload["today_month"]["sales_today"], 1000.0)
        self.assertEqual(payload["invoice_summary"]["open_count"], 2)
        self.assertEqual(payload["invoice_summary"]["unpaid_count"], 2)

        top_customer = next(
            item for item in payload["top_customers"]
            if item["customer_id"] == customer_id
        )
        self.assertEqual(top_customer["sales_amount"], 1000.0)

        inventory_product = next(
            item for item in payload["inventory"]["products"]
            if item["id"] == product_id
        )
        self.assertEqual(inventory_product["stock"], 19.0)
        self.assertEqual(inventory_product["stock_value_buy"], 7600.0)
        self.assertEqual(inventory_product["stock_value_sell"], 19000.0)


    def test_fiscal_period_closing_and_period_numbering(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_login.json()['access_token']}"
        }
        user_login = self.client.post(
            "/login",
            json={"username": "ci-user", "password": "StrongUserPassword!42"},
        )
        user_headers = {
            "Authorization": f"Bearer {user_login.json()['access_token']}"
        }

        periods_response = self.client.get(
            "/api/accounting/periods",
            headers=admin_headers,
        )
        self.assertEqual(periods_response.status_code, 200, periods_response.text)
        periods = periods_response.json()
        self.assertTrue(periods)
        period = next(item for item in periods if item["status"] == "open")
        period_id = period["id"]
        self.assertGreater(period["vouchers_count"], 0)
        self.assertAlmostEqual(
            float(period["total_debit"]),
            float(period["total_credit"]),
            places=2,
        )

        vouchers_response = self.client.get(
            "/api/accounting/entries",
            headers=admin_headers,
            params={"status": "posted", "limit": 500},
        )
        self.assertEqual(vouchers_response.status_code, 200, vouchers_response.text)
        period_vouchers = [
            item
            for item in vouchers_response.json()
            if item["fiscal_period_id"] == period_id
        ]
        numbers = sorted(item["period_voucher_no"] for item in period_vouchers)
        self.assertEqual(numbers, list(range(1, len(numbers) + 1)))

        forbidden = self.client.post(
            f"/api/accounting/periods/{period_id}/close",
            headers=user_headers,
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        overlap = self.client.post(
            "/api/accounting/periods",
            headers=admin_headers,
            json={
                "name": "Overlapping test period",
                "start_date": period["start_date"],
                "end_date": period["end_date"],
            },
        )
        self.assertEqual(overlap.status_code, 400, overlap.text)

        close = self.client.post(
            f"/api/accounting/periods/{period_id}/close",
            headers=admin_headers,
        )
        self.assertEqual(close.status_code, 200, close.text)
        self.assertEqual(close.json()["status"], "closed")

        expenses_before = self.client.get(
            "/expenses",
            headers=admin_headers,
        ).json()
        blocked_create = self.client.post(
            "/expenses",
            headers=admin_headers,
            json={"title": "Blocked closed-period expense", "amount": 25},
        )
        self.assertEqual(blocked_create.json()["status"], "error")
        self.assertIn("closed", blocked_create.json()["message"].lower())
        expenses_after = self.client.get(
            "/expenses",
            headers=admin_headers,
        ).json()
        self.assertEqual(len(expenses_after), len(expenses_before))

        existing_expense = next(
            item for item in expenses_before if item["title"] == "Reporting expense"
        )
        blocked_delete = self.client.delete(
            f"/expenses/{existing_expense['id']}",
            headers=admin_headers,
        )
        self.assertEqual(blocked_delete.json()["status"], "error")
        self.assertTrue(
            any(
                item["id"] == existing_expense["id"]
                for item in self.client.get(
                    "/expenses",
                    headers=admin_headers,
                ).json()
            )
        )

        chart = self.client.get(
            "/api/accounting/entries/chart",
            headers=admin_headers,
        ).json()
        cash_id = next(item["id"] for item in chart if item["code"] == "1101")
        expense_id = next(item["id"] for item in chart if item["code"] == "5102")
        blocked_manual = self.client.post(
            "/api/accounting/entries",
            headers=admin_headers,
            json={
                "description": "Blocked manual voucher",
                "status": "posted",
                "lines": [
                    {"account_id": expense_id, "debit": 10},
                    {"account_id": cash_id, "credit": 10},
                ],
            },
        )
        self.assertEqual(blocked_manual.status_code, 400, blocked_manual.text)
        self.assertIn("closed", blocked_manual.json()["detail"].lower())

        reopen = self.client.post(
            f"/api/accounting/periods/{period_id}/reopen",
            headers=admin_headers,
        )
        self.assertEqual(reopen.status_code, 200, reopen.text)
        self.assertEqual(reopen.json()["status"], "open")

        created = self.client.post(
            "/expenses",
            headers=admin_headers,
            json={"title": "Reopened-period expense", "amount": 25},
        )
        self.assertEqual(created.json()["status"], "created", created.text)
        vouchers_after = self.client.get(
            "/api/accounting/entries",
            headers=admin_headers,
            params={"status": "posted", "limit": 500},
        ).json()
        created_voucher = next(
            item
            for item in vouchers_after
            if item["source_type"] == "expense"
            and item["source_id"] == created.json()["id"]
        )
        self.assertEqual(created_voucher["fiscal_period_id"], period_id)
        self.assertEqual(created_voucher["period_voucher_no"], max(numbers) + 1)

        cleanup = self.client.delete(
            f"/expenses/{created.json()['id']}",
            headers=admin_headers,
        )
        self.assertEqual(cleanup.json()["status"], "deleted", cleanup.text)


    def test_z_audit_trail_is_admin_only_and_tamper_evident(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_login.json()['access_token']}"
        }
        user_login = self.client.post(
            "/login",
            json={"username": "ci-user", "password": "StrongUserPassword!42"},
        )
        user_headers = {
            "Authorization": f"Bearer {user_login.json()['access_token']}"
        }

        created = self.client.post(
            "/customers",
            headers=admin_headers,
            json={"name": "Audited Customer"},
        )
        self.assertEqual(created.status_code, 200, created.text)

        periods = self.client.get(
            "/api/accounting/periods",
            headers=admin_headers,
        ).json()
        period = periods[0]
        forbidden_mutation = self.client.post(
            f"/api/accounting/periods/{period['id']}/close",
            headers=user_headers,
        )
        self.assertEqual(forbidden_mutation.status_code, 403)

        forbidden_read = self.client.get(
            "/api/audit/events",
            headers=user_headers,
        )
        self.assertEqual(forbidden_read.status_code, 403)

        events_response = self.client.get(
            "/api/audit/events",
            headers=admin_headers,
            params={"limit": 500},
        )
        self.assertEqual(events_response.status_code, 200, events_response.text)
        payload = events_response.json()
        self.assertGreater(payload["total"], 0)
        events = payload["items"]

        customer_event = next(
            event
            for event in events
            if event["path"] == "/customers"
            and event["method"] == "POST"
            and event["actor_username"] == "ci-admin"
        )
        self.assertEqual(customer_event["action"], "create")
        self.assertLess(customer_event["status_code"], 400)

        denied_event = next(
            event
            for event in events
            if event["path"].endswith("/close")
            and event["actor_username"] == "ci-user"
        )
        self.assertEqual(denied_event["action"], "close")
        self.assertEqual(denied_event["status_code"], 403)

        integrity = self.client.get(
            "/api/audit/integrity",
            headers=admin_headers,
        )
        self.assertEqual(integrity.status_code, 200, integrity.text)
        self.assertTrue(integrity.json()["valid"])
        self.assertGreater(integrity.json()["events_checked"], 0)

        latest = events[0]
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE audit_events SET actor_username='tampered' WHERE id=:id"),
                {"id": latest["id"]},
            )
        broken = self.client.get(
            "/api/audit/integrity",
            headers=admin_headers,
        ).json()
        self.assertFalse(broken["valid"])
        self.assertEqual(broken["broken_event_id"], latest["id"])

        with engine.begin() as conn:
            conn.execute(
                text("UPDATE audit_events SET actor_username=:actor WHERE id=:id"),
                {"actor": latest["actor_username"], "id": latest["id"]},
            )
        restored = self.client.get(
            "/api/audit/integrity",
            headers=admin_headers,
        ).json()
        self.assertTrue(restored["valid"])


    def test_role_based_permissions_follow_least_privilege(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        admin_user = admin_login.json()["user"]
        admin_headers = {
            "Authorization": f"Bearer {admin_login.json()['access_token']}"
        }

        role_users = {}
        for role in ["accountant", "sales", "warehouse", "viewer"]:
            response = self.client.post(
                "/users",
                headers=admin_headers,
                json={
                    "full_name": f"{role.title()} Test",
                    "username": f"ci-{role}",
                    "password": f"Strong{role.title()}Password!42",
                    "role": role,
                },
            )
            self.assertEqual(response.status_code, 200, response.text)
            role_users[role] = response.json()

        invalid_role = self.client.post(
            "/users",
            headers=admin_headers,
            json={
                "full_name": "Invalid Role",
                "username": "ci-invalid-role",
                "password": "StrongInvalidPassword!42",
                "role": "superuser",
            },
        )
        self.assertEqual(invalid_role.status_code, 400, invalid_role.text)

        def headers_for(role):
            login = self.client.post(
                "/login",
                json={
                    "username": f"ci-{role}",
                    "password": f"Strong{role.title()}Password!42",
                },
            )
            self.assertEqual(login.status_code, 200, login.text)
            return {"Authorization": f"Bearer {login.json()['access_token']}"}

        viewer_headers = headers_for("viewer")
        self.assertEqual(
            self.client.get("/customers", headers=viewer_headers).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/customers",
                headers=viewer_headers,
                json={"name": "Viewer must not create"},
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/settings", headers=viewer_headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(
                "/api/accounting/entries",
                headers=viewer_headers,
            ).status_code,
            200,
        )

        sales_headers = headers_for("sales")
        self.assertEqual(
            self.client.get(
                "/api/accounting/entries",
                headers=sales_headers,
            ).status_code,
            403,
        )
        sales_customer = self.client.post(
            "/customers",
            headers=sales_headers,
            json={"name": "Sales-created customer"},
        )
        self.assertEqual(sales_customer.status_code, 200, sales_customer.text)
        self.assertEqual(
            self.client.post(
                "/expenses",
                headers=sales_headers,
                json={"title": "Sales must not expense", "amount": 10},
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/products",
                headers=sales_headers,
                json={"name": "Sales must not create product"},
            ).status_code,
            403,
        )

        warehouse_headers = headers_for("warehouse")
        self.assertEqual(
            self.client.get(
                "/api/accounting/entries",
                headers=warehouse_headers,
            ).status_code,
            403,
        )
        warehouse_product = self.client.post(
            "/products",
            headers=warehouse_headers,
            json={"name": "Warehouse-created product", "stock": 3},
        )
        self.assertEqual(warehouse_product.status_code, 200, warehouse_product.text)
        self.assertEqual(
            self.client.post(
                "/customers",
                headers=warehouse_headers,
                json={"name": "Warehouse must not create customer"},
            ).status_code,
            403,
        )

        accountant_headers = headers_for("accountant")
        accountant_expense = self.client.post(
            "/expenses",
            headers=accountant_headers,
            json={"title": "Temporary accountant expense", "amount": 15},
        )
        self.assertEqual(
            accountant_expense.json()["status"],
            "created",
            accountant_expense.text,
        )
        self.assertEqual(
            self.client.post(
                "/products",
                headers=accountant_headers,
                json={"name": "Accountant must not create product"},
            ).status_code,
            403,
        )
        cleanup = self.client.delete(
            f"/expenses/{accountant_expense.json()['id']}",
            headers=accountant_headers,
        )
        self.assertEqual(cleanup.json()["status"], "deleted", cleanup.text)

        role_update = self.client.put(
            f"/users/{role_users['viewer']['id']}/role",
            headers=admin_headers,
            json={"role": "sales"},
        )
        self.assertEqual(role_update.status_code, 200, role_update.text)
        self.assertEqual(role_update.json()["user"]["role"], "sales")

        self_change = self.client.put(
            f"/users/{admin_user['id']}/role",
            headers=admin_headers,
            json={"role": "viewer"},
        )
        self.assertEqual(self_change.status_code, 400, self_change.text)

        refreshed_login = self.client.post(
            "/login",
            json={
                "username": "ci-viewer",
                "password": "StrongViewerPassword!42",
            },
        )
        self.assertEqual(refreshed_login.json()["user"]["role"], "sales")
        refreshed_headers = {
            "Authorization": f"Bearer {refreshed_login.json()['access_token']}"
        }
        promoted_write = self.client.post(
            "/customers",
            headers=refreshed_headers,
            json={"name": "Promoted sales customer"},
        )
        self.assertEqual(promoted_write.status_code, 200, promoted_write.text)


if __name__ == "__main__":
    unittest.main()
