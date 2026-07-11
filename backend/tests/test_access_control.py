import os
import shutil
import tempfile
import unittest
from pathlib import Path

TEST_DATABASE = Path(tempfile.gettempdir()) / f"vetrix-test-{os.getpid()}.db"
TEST_BACKUP_DIR = Path(tempfile.gettempdir()) / f"vetrix-backups-{os.getpid()}"
os.environ["VETRIX_DATABASE_URL"] = f"sqlite:///{TEST_DATABASE}"
os.environ["VETRIX_BACKUP_DIR"] = str(TEST_BACKUP_DIR)
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
        shutil.rmtree(TEST_BACKUP_DIR, ignore_errors=True)

    def test_complete_authentication_and_authorization_flow(self):
        protected = self.client.get("/customers")
        self.assertEqual(protected.status_code, 401)

        export = self.client.get("/export/invoices-pdf")
        self.assertEqual(export.status_code, 401)

        first_run = self.client.get("/setup/status")
        self.assertEqual(first_run.status_code, 200, first_run.text)
        self.assertTrue(first_run.json()["requires_admin"])
        self.assertFalse(first_run.json()["initialized"])
        self.assertEqual(first_run.json()["version"], "1.0.1")

        weak_bootstrap = self.client.post(
            "/users",
            json={
                "full_name": "Weak Administrator",
                "username": "weak-admin",
                "password": "short",
                "role": "admin",
            },
        )
        self.assertEqual(weak_bootstrap.status_code, 400)

        admin_payload = {
            "full_name": "Test Administrator",
            "username": "ci-admin",
            "password": "StrongAdminPassword!42",
            "role": "admin",
        }
        bootstrap = self.client.post("/users", json=admin_payload)
        self.assertEqual(bootstrap.status_code, 200, bootstrap.text)

        initialized = self.client.get("/setup/status")
        self.assertEqual(initialized.status_code, 200, initialized.text)
        self.assertTrue(initialized.json()["initialized"])
        self.assertFalse(initialized.json()["requires_admin"])
        self.assertEqual(initialized.json()["user_count"], 1)

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
        self.assertEqual(rows["1201"]["debit_balance"], 7600.0)
        self.assertEqual(rows["1201"]["credit_balance"], 0.0)
        self.assertEqual(rows["3101"]["credit_balance"], 8000.0)
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

        preview = self.client.get(
            f"/api/accounting/periods/{period_id}/close-preview",
            headers=admin_headers,
        )
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertTrue(preview.json()["balanced"], preview.json())
        self.assertEqual(preview.json()["net_income"], 500.0)
        preview_codes = {
            line["account_code"] for line in preview.json()["lines"]
        }
        self.assertTrue(
            {"4101", "4102", "5101", "5102", "3201"} <= preview_codes
        )

        close = self.client.post(
            f"/api/accounting/periods/{period_id}/close",
            headers=admin_headers,
        )
        self.assertEqual(close.status_code, 200, close.text)
        self.assertEqual(close.json()["status"], "closed")
        self.assertEqual(close.json()["net_income"], 500.0)
        self.assertIsNotNone(close.json()["closing_voucher_id"])

        closing_voucher = self.client.get(
            f"/api/accounting/entries/{close.json()['closing_voucher_id']}",
            headers=admin_headers,
        )
        self.assertEqual(
            closing_voucher.status_code,
            200,
            closing_voucher.text,
        )
        closing_lines = {
            line["account_code"]: line
            for line in closing_voucher.json()["lines"]
        }
        self.assertEqual(closing_lines["3201"]["credit"], 500.0)

        closed_statements = self.client.get(
            "/api/accounting/statements",
            headers=admin_headers,
            params={"fiscal_period_id": period_id},
        )
        self.assertEqual(
            closed_statements.status_code,
            200,
            closed_statements.text,
        )
        self.assertEqual(
            closed_statements.json()["income_statement"]["net_income"],
            500.0,
        )
        self.assertTrue(
            closed_statements.json()["balance_sheet"]["balanced"]
        )
        self.assertEqual(
            closed_statements.json()["balance_sheet"]["accumulated_earnings"],
            0.0,
        )

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
        self.assertTrue(reopen.json()["closing_voucher_removed"])
        vouchers_reopened = self.client.get(
            "/api/accounting/entries",
            headers=admin_headers,
            params={"status": "posted", "limit": 500},
        ).json()
        self.assertFalse(any(
            item["source_type"] == "fiscal_close"
            and item["source_id"] == period_id
            for item in vouchers_reopened
        ))

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


    def test_zz_backup_verify_download_and_restore_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_login.json()['access_token']}"
        }
        viewer_login = self.client.post(
            "/login",
            json={
                "username": "ci-warehouse",
                "password": "StrongWarehousePassword!42",
            },
        )
        viewer_headers = {
            "Authorization": f"Bearer {viewer_login.json()['access_token']}"
        }

        forbidden = self.client.get(
            "/api/backups",
            headers=viewer_headers,
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        created = self.client.post(
            "/api/backups",
            headers=admin_headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        backup = created.json()
        self.assertEqual(backup["status"], "success")
        self.assertTrue(backup["valid"])
        self.assertEqual(len(backup["sha256"]), 64)
        filename = backup["filename"]

        listed = self.client.get(
            "/api/backups",
            headers=admin_headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertTrue(
            any(item["filename"] == filename for item in listed.json()["items"])
        )

        verified = self.client.get(
            f"/api/backups/{filename}/verify",
            headers=admin_headers,
        )
        self.assertEqual(verified.status_code, 200, verified.text)
        self.assertTrue(verified.json()["valid"])
        self.assertEqual(verified.json()["sha256"], backup["sha256"])

        download = self.client.get(
            f"/api/backups/{filename}/download",
            headers=admin_headers,
        )
        self.assertEqual(download.status_code, 200, download.text)
        self.assertTrue(download.content.startswith(b"SQLite format 3"))

        wrong_confirmation = self.client.post(
            f"/api/backups/{filename}/restore",
            headers=admin_headers,
            json={"confirmation": "RESTORE wrong-file.db"},
        )
        self.assertEqual(wrong_confirmation.status_code, 400)

        marker = self.client.post(
            "/customers",
            headers=admin_headers,
            json={"name": "Must disappear after restore"},
        )
        self.assertEqual(marker.status_code, 200, marker.text)
        marker_id = marker.json()["id"]

        restored = self.client.post(
            f"/api/backups/{filename}/restore",
            headers=admin_headers,
            json={"confirmation": f"RESTORE {filename}"},
        )
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()["status"], "restored")
        self.assertTrue(restored.json()["safety_backup"].startswith(
            "vetrix_pre_restore_"
        ))

        customers = self.client.get(
            "/customers",
            headers=admin_headers,
        )
        self.assertEqual(customers.status_code, 200, customers.text)
        self.assertFalse(
            any(item["id"] == marker_id for item in customers.json())
        )

        deleted = self.client.delete(
            f"/api/backups/{filename}",
            headers=admin_headers,
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(deleted.json()["status"], "deleted")
        missing = self.client.get(
            f"/api/backups/{filename}/verify",
            headers=admin_headers,
        )
        self.assertEqual(missing.status_code, 404)


    def test_zzz_system_health_detects_financial_corruption(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_login.json()['access_token']}"
        }
        warehouse_login = self.client.post(
            "/login",
            json={
                "username": "ci-warehouse",
                "password": "StrongWarehousePassword!42",
            },
        )
        warehouse_headers = {
            "Authorization": f"Bearer {warehouse_login.json()['access_token']}"
        }

        forbidden = self.client.get(
            "/api/system/health",
            headers=warehouse_headers,
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        health = self.client.get(
            "/api/system/health",
            headers=admin_headers,
        )
        self.assertEqual(health.status_code, 200, health.text)
        payload = health.json()
        self.assertEqual(payload["summary"]["failures"], 0, payload)
        checks = {item["id"]: item for item in payload["checks"]}
        for check_id in [
            "database_integrity",
            "required_tables",
            "general_ledger_balance",
            "voucher_structure",
            "fiscal_assignment",
            "closed_period_consistency",
            "negative_inventory",
            "audit_chain",
            "backup_availability",
        ]:
            self.assertIn(check_id, checks)
            self.assertNotEqual(checks[check_id]["status"], "fail", checks[check_id])

        readiness = self.client.get(
            "/api/system/readiness",
            headers=admin_headers,
        )
        self.assertEqual(readiness.status_code, 200, readiness.text)

        with engine.begin() as conn:
            voucher = conn.execute(text("""
                SELECT id, total_credit
                FROM accounting_vouchers
                WHERE status='posted'
                ORDER BY id ASC
                LIMIT 1
            """)).mappings().first()
            self.assertIsNotNone(voucher)
            conn.execute(text("""
                UPDATE accounting_vouchers
                SET total_credit=:total_credit
                WHERE id=:id
            """), {
                "id": voucher["id"],
                "total_credit": float(voucher["total_credit"] or 0) + 1,
            })

        broken = self.client.get(
            "/api/system/readiness",
            headers=admin_headers,
        )
        self.assertEqual(broken.status_code, 503, broken.text)
        broken_checks = {
            item["id"]: item for item in broken.json()["checks"]
        }
        self.assertEqual(
            broken_checks["general_ledger_balance"]["status"],
            "fail",
        )

        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE accounting_vouchers
                SET total_credit=:total_credit
                WHERE id=:id
            """), {
                "id": voucher["id"],
                "total_credit": voucher["total_credit"],
            })

        restored = self.client.get(
            "/api/system/health",
            headers=admin_headers,
        )
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()["summary"]["failures"], 0)


    def test_opening_balances_and_inventory_adjustments_are_double_entry(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {
            "Authorization": f"Bearer {login.json()['access_token']}"
        }

        customer = self.client.post(
            "/customers",
            headers=headers,
            json={
                "name": "Opening Balance Customer",
                "opening_balance": 500,
            },
        )
        self.assertEqual(customer.json()["status"], "created", customer.text)
        customer_id = customer.json()["id"]
        self.assertEqual(customer.json()["balance"], 500)

        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted", "limit": 500},
        ).json()
        opening = [
            item for item in vouchers
            if item["source_type"] == "customer_opening"
            and item["source_id"] == customer_id
        ]
        self.assertEqual(len(opening), 1)
        detail = self.client.get(
            f"/api/accounting/entries/{opening[0]['id']}",
            headers=headers,
        ).json()
        lines = {line["account_code"]: line for line in detail["lines"]}
        self.assertEqual(lines["1103"]["debit"], 500)
        self.assertEqual(lines["3101"]["credit"], 500)

        changed = self.client.put(
            f"/customers/{customer_id}",
            headers=headers,
            json={
                "name": "Opening Balance Customer",
                "opening_balance": -300,
            },
        )
        self.assertEqual(changed.json()["status"], "updated", changed.text)
        self.assertEqual(changed.json()["customer"]["balance"], -300)

        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted", "limit": 500},
        ).json()
        opening = [
            item for item in vouchers
            if item["source_type"] == "customer_opening"
            and item["source_id"] == customer_id
        ]
        self.assertEqual(len(opening), 1)
        detail = self.client.get(
            f"/api/accounting/entries/{opening[0]['id']}",
            headers=headers,
        ).json()
        lines = {line["account_code"]: line for line in detail["lines"]}
        self.assertEqual(lines["3101"]["debit"], 300)
        self.assertEqual(lines["2101"]["credit"], 300)

        zeroed = self.client.put(
            f"/customers/{customer_id}",
            headers=headers,
            json={
                "name": "Opening Balance Customer",
                "opening_balance": 0,
            },
        )
        self.assertEqual(zeroed.json()["customer"]["balance"], 0)
        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted", "limit": 500},
        ).json()
        self.assertFalse(any(
            item["source_type"] == "customer_opening"
            and item["source_id"] == customer_id
            for item in vouchers
        ))
        deleted_customer = self.client.delete(
            f"/customers/{customer_id}",
            headers=headers,
        )
        self.assertEqual(
            deleted_customer.json()["status"],
            "deleted",
            deleted_customer.text,
        )

        product = self.client.post(
            "/products",
            headers=headers,
            json={
                "name": "Opening Inventory Product",
                "buy_price": 20,
                "sell_price": 35,
                "stock": 5,
            },
        )
        self.assertEqual(product.json()["status"], "created", product.text)
        product_id = product.json()["id"]

        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted", "limit": 500},
        ).json()
        product_opening = next(
            item for item in vouchers
            if item["source_type"] == "product_opening"
            and item["source_id"] == product_id
        )
        self.assertEqual(product_opening["total_debit"], 100)

        updated = self.client.put(
            f"/products/{product_id}",
            headers=headers,
            json={
                "name": "Opening Inventory Product",
                "buy_price": 25,
                "sell_price": 40,
                "stock": 6,
            },
        )
        self.assertEqual(updated.json()["status"], "updated", updated.text)
        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted", "limit": 500},
        ).json()
        openings = [
            item for item in vouchers
            if item["source_type"] == "product_opening"
            and item["source_id"] == product_id
        ]
        self.assertEqual(len(openings), 1)
        self.assertEqual(openings[0]["total_debit"], 150)

        movement = self.client.post(
            "/stock-movements",
            headers=headers,
            json={
                "warehouse": "Main",
                "product_id": product_id,
                "quantity": 2,
                "movement_type": "out",
                "note": "Opening integrity test",
            },
        )
        self.assertEqual(movement.json()["status"], "created", movement.text)
        self.assertEqual(movement.json()["previous_stock"], 6)
        self.assertEqual(movement.json()["stock_delta"], -2)
        self.assertEqual(movement.json()["stock"], 4)

        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted", "limit": 500},
        ).json()
        adjustment = next(
            item for item in vouchers
            if item["source_type"] == "inventory_adjustment"
            and item["source_id"] == movement.json()["id"]
        )
        self.assertEqual(adjustment["total_debit"], 50)

        blocked_direct_edit = self.client.put(
            f"/products/{product_id}",
            headers=headers,
            json={
                "name": "Opening Inventory Product",
                "buy_price": 25,
                "sell_price": 40,
                "stock": 99,
            },
        )
        self.assertEqual(blocked_direct_edit.json()["status"], "error")
        products = self.client.get("/products", headers=headers).json()
        current = next(item for item in products if item["id"] == product_id)
        self.assertEqual(current["stock"], 4)

        trial = self.client.get(
            "/api/accounting/entries/reports/trial-balance",
            headers=headers,
            params={"status": "posted", "include_zero": "false"},
        )
        self.assertEqual(trial.status_code, 200, trial.text)
        self.assertTrue(trial.json()["totals"]["balanced"], trial.json())


    def test_standard_financial_statements_reconcile_from_general_ledger(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {
            "Authorization": f"Bearer {login.json()['access_token']}"
        }
        periods = self.client.get(
            "/api/accounting/periods",
            headers=headers,
        )
        self.assertEqual(periods.status_code, 200, periods.text)
        current_period = periods.json()[0]

        response = self.client.get(
            "/api/accounting/statements",
            headers=headers,
            params={"fiscal_period_id": current_period["id"]},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["scope"], "fiscal_period")
        self.assertEqual(payload["period"]["id"], current_period["id"])
        self.assertTrue(payload["valid"], payload)
        self.assertGreater(payload["posted_vouchers"], 0)

        income = payload["income_statement"]
        self.assertEqual(income["total_revenue"], 1000.0)
        self.assertEqual(income["total_expenses"], 500.0)
        self.assertEqual(income["net_income"], 500.0)
        revenue = {
            item["account_code"]: item["amount"]
            for item in income["revenue_items"]
        }
        expenses = {
            item["account_code"]: item["amount"]
            for item in income["expense_items"]
        }
        self.assertEqual(revenue["4101"], 2000.0)
        self.assertEqual(revenue["4102"], -1000.0)
        self.assertEqual(expenses["5101"], 400.0)
        self.assertEqual(expenses["5102"], 100.0)

        balance = payload["balance_sheet"]
        self.assertTrue(balance["balanced"], balance)
        self.assertEqual(balance["difference"], 0.0)
        self.assertEqual(
            balance["total_assets"],
            balance["liabilities_and_equity"],
        )
        self.assertEqual(balance["accumulated_earnings"], 500.0)
        self.assertEqual(balance["period_net_income"], 500.0)

        cash = payload["cash_flow"]
        self.assertTrue(cash["reconciled"], cash)
        self.assertEqual(cash["opening_balance"], 0.0)
        self.assertEqual(cash["inflows"], 0.0)
        self.assertEqual(cash["outflows"], 100.0)
        self.assertEqual(cash["net_change"], -100.0)
        self.assertEqual(cash["ending_balance"], -100.0)

        all_time = self.client.get(
            "/api/accounting/statements",
            headers=headers,
        )
        self.assertEqual(all_time.status_code, 200, all_time.text)
        self.assertEqual(all_time.json()["scope"], "all_time")
        self.assertTrue(all_time.json()["valid"])

        missing = self.client.get(
            "/api/accounting/statements",
            headers=headers,
            params={"fiscal_period_id": 999999},
        )
        self.assertEqual(missing.status_code, 404, missing.text)


    def test_tax_accounting_separates_vat_shipping_and_net_revenue(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {
            "Authorization": f"Bearer {login.json()['access_token']}"
        }
        customer = self.client.post(
            "/customers",
            headers=headers,
            json={"name": "VAT Test Party"},
        )
        customer_id = customer.json()["id"]
        product = self.client.post(
            "/products",
            headers=headers,
            json={
                "name": "VAT Test Product",
                "buy_price": 50,
                "sell_price": 300,
                "stock": 10,
            },
        )
        product_id = product.json()["id"]

        purchase = self.client.post(
            "/invoices",
            headers=headers,
            json={
                "invoice_type": "buy",
                "customer_id": customer_id,
                "tax_percent": 10,
                "shipping_cost": 20,
                "payment_status": "unpaid",
                "items": [{
                    "product_id": product_id,
                    "quantity": 2,
                    "unit_price": 100,
                }],
            },
        )
        self.assertEqual(purchase.json()["status"], "created", purchase.text)
        purchase_id = purchase.json()["invoice_id"]
        self.assertEqual(purchase.json()["total_amount"], 240.0)

        sale = self.client.post(
            "/invoices",
            headers=headers,
            json={
                "invoice_type": "sale",
                "customer_id": customer_id,
                "tax_percent": 10,
                "shipping_cost": 10,
                "payment_status": "unpaid",
                "items": [{
                    "product_id": product_id,
                    "quantity": 1,
                    "unit_price": 300,
                }],
            },
        )
        self.assertEqual(sale.json()["status"], "created", sale.text)
        sale_id = sale.json()["invoice_id"]
        self.assertEqual(sale.json()["total_amount"], 340.0)

        vouchers = self.client.get(
            "/api/accounting/entries",
            headers=headers,
            params={"status": "posted", "limit": 500},
        ).json()
        purchase_voucher = next(
            item for item in vouchers
            if item["source_type"] == "invoice"
            and item["source_id"] == purchase_id
        )
        sale_voucher = next(
            item for item in vouchers
            if item["source_type"] == "invoice"
            and item["source_id"] == sale_id
        )

        purchase_detail = self.client.get(
            f"/api/accounting/entries/{purchase_voucher['id']}",
            headers=headers,
        ).json()
        purchase_lines = {
            line["account_code"]: line
            for line in purchase_detail["lines"]
        }
        self.assertEqual(purchase_lines["1201"]["debit"], 220.0)
        self.assertEqual(purchase_lines["1301"]["debit"], 20.0)
        self.assertEqual(purchase_lines["2101"]["credit"], 240.0)

        sale_detail = self.client.get(
            f"/api/accounting/entries/{sale_voucher['id']}",
            headers=headers,
        ).json()
        sale_lines = {
            line["account_code"]: line
            for line in sale_detail["lines"]
        }
        self.assertEqual(sale_lines["1103"]["debit"], 340.0)
        self.assertEqual(sale_lines["4101"]["credit"], 300.0)
        self.assertEqual(sale_lines["2201"]["credit"], 30.0)
        self.assertEqual(sale_lines["4103"]["credit"], 10.0)
        self.assertEqual(sale_lines["5101"]["debit"], 50.0)
        self.assertEqual(sale_lines["1201"]["credit"], 50.0)

        periods = self.client.get(
            "/api/accounting/periods",
            headers=headers,
        ).json()
        period_id = periods[0]["id"]
        report = self.client.get(
            "/api/accounting/tax",
            headers=headers,
            params={"fiscal_period_id": period_id},
        )
        self.assertEqual(report.status_code, 200, report.text)
        tax = report.json()
        self.assertEqual(tax["output_vat"], 30.0)
        self.assertEqual(tax["input_vat"], 20.0)
        self.assertEqual(tax["net_vat"], 10.0)
        self.assertEqual(tax["position"], "payable")
        self.assertEqual(tax["invoice_count"], 2)

        deleted_sale = self.client.delete(
            f"/invoices/{sale_id}",
            headers=headers,
        )
        self.assertEqual(
            deleted_sale.json()["status"],
            "deleted",
            deleted_sale.text,
        )
        deleted_purchase = self.client.delete(
            f"/invoices/{purchase_id}",
            headers=headers,
        )
        self.assertEqual(
            deleted_purchase.json()["status"],
            "deleted",
            deleted_purchase.text,
        )
        cleared = self.client.get(
            "/api/accounting/tax",
            headers=headers,
            params={"fiscal_period_id": period_id},
        ).json()
        self.assertEqual(cleared["output_vat"], 0.0)
        self.assertEqual(cleared["input_vat"], 0.0)
        self.assertEqual(cleared["net_vat"], 0.0)

        deleted_product = self.client.delete(
            f"/products/{product_id}",
            headers=headers,
        )
        self.assertEqual(
            deleted_product.json()["status"],
            "deleted",
            deleted_product.text,
        )
        deleted_customer = self.client.delete(
            f"/customers/{customer_id}",
            headers=headers,
        )
        self.assertEqual(
            deleted_customer.json()["status"],
            "deleted",
            deleted_customer.text,
        )


    def test_receivables_and_payables_aging_report(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        customer = self.client.post(
            "/customers",
            headers=headers,
            json={
                "name": "Aging Test Party",
                "customer_type": "partner",
                "credit_limit": 50,
            },
        )
        self.assertEqual(customer.json()["status"], "created", customer.text)
        customer_id = customer.json()["id"]

        product = self.client.post(
            "/products",
            headers=headers,
            json={
                "name": "Aging Test Product",
                "sell_price": 100,
                "buy_price": 40,
                "stock": 5,
            },
        )
        self.assertEqual(product.json()["status"], "created", product.text)
        product_id = product.json()["id"]

        sale = self.client.post(
            "/invoices",
            headers=headers,
            json={
                "invoice_type": "sale",
                "customer_id": customer_id,
                "items": [
                    {"product_id": product_id, "quantity": 1, "unit_price": 100}
                ],
            },
        )
        self.assertEqual(sale.json()["status"], "created", sale.text)
        sale_id = sale.json()["invoice_id"]

        purchase = self.client.post(
            "/invoices",
            headers=headers,
            json={
                "invoice_type": "buy",
                "customer_id": customer_id,
                "items": [
                    {"product_id": product_id, "quantity": 2, "unit_price": 40}
                ],
            },
        )
        self.assertEqual(purchase.json()["status"], "created", purchase.text)
        purchase_id = purchase.json()["invoice_id"]

        report = self.client.get(
            "/api/accounting/aging",
            headers=headers,
            params={"as_of": "2099-12-31", "terms_days": 30},
        )
        self.assertEqual(report.status_code, 200, report.text)
        payload = report.json()
        self.assertGreaterEqual(payload["summary"]["receivable"], 100.0)
        self.assertGreaterEqual(payload["summary"]["payable"], 80.0)
        self.assertGreaterEqual(payload["summary"]["overdue_receivable"], 100.0)
        self.assertEqual(
            next(
                item for item in payload["items"]
                if item["invoice_id"] == sale_id
            )["bucket"],
            "over_90",
        )
        party = next(
            item for item in payload["parties"]
            if item["customer_id"] == customer_id
        )
        self.assertEqual(party["receivable"], 100.0)
        self.assertEqual(party["payable"], 80.0)
        self.assertEqual(party["net_position"], 20.0)
        self.assertTrue(party["over_credit_limit"])

        invalid_date = self.client.get(
            "/api/accounting/aging",
            headers=headers,
            params={"as_of": "31-12-2099"},
        )
        self.assertEqual(invalid_date.status_code, 400)

        for invoice_id in (sale_id, purchase_id):
            deleted = self.client.delete(
                f"/invoices/{invoice_id}",
                headers=headers,
            )
            self.assertEqual(deleted.json()["status"], "deleted", deleted.text)
        deleted_product = self.client.delete(
            f"/products/{product_id}",
            headers=headers,
        )
        self.assertEqual(deleted_product.json()["status"], "deleted")
        deleted_customer = self.client.delete(
            f"/customers/{customer_id}",
            headers=headers,
        )
        self.assertEqual(deleted_customer.json()["status"], "deleted")


    def test_z_bank_reconciliation_matching_flow(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        customer = self.client.post(
            "/customers",
            headers=headers,
            json={"name": "Bank Reconciliation Test Party"},
        )
        self.assertEqual(customer.json()["status"], "created", customer.text)
        customer_id = customer.json()["id"]

        receipt = self.client.post(
            "/transactions",
            headers=headers,
            json={
                "customer_id": customer_id,
                "amount": 125,
                "transaction_type": "receipt",
                "method": "bank",
                "note": "bank reconciliation integration test",
            },
        )
        self.assertEqual(receipt.json()["status"], "created", receipt.text)

        account = self.client.post(
            "/api/accounting/bank-reconciliation/accounts",
            headers=headers,
            json={
                "name": "CI Bank Account",
                "bank_name": "Vetrix Test Bank",
                "account_number": "CI-001",
                "ledger_account_code": "1102",
            },
        )
        self.assertEqual(account.status_code, 200, account.text)
        account_id = account.json()["id"]

        statement = self.client.post(
            f"/api/accounting/bank-reconciliation/accounts/{account_id}/statement",
            headers=headers,
            json={
                "transaction_date": "2099-01-15",
                "description": "Customer receipt",
                "reference": "CI-BANK-001",
                "amount": 125,
            },
        )
        self.assertEqual(statement.status_code, 200, statement.text)
        statement_id = statement.json()["id"]

        candidates = self.client.get(
            f"/api/accounting/bank-reconciliation/accounts/{account_id}/candidates",
            headers=headers,
            params={"statement_line_id": statement_id},
        )
        self.assertEqual(candidates.status_code, 200, candidates.text)
        exact = next(
            item for item in candidates.json()
            if item["source_type"] == "receipt"
            and item["source_id"] == receipt.json()["entry_id"]
        )
        self.assertTrue(exact["exact_amount"])
        self.assertEqual(exact["amount"], 125.0)

        matched = self.client.post(
            f"/api/accounting/bank-reconciliation/statement/{statement_id}/match",
            headers=headers,
            json={"voucher_line_id": exact["voucher_line_id"]},
        )
        self.assertEqual(matched.status_code, 200, matched.text)
        self.assertEqual(matched.json()["status"], "matched")

        summary = self.client.get(
            f"/api/accounting/bank-reconciliation/accounts/{account_id}/summary",
            headers=headers,
        )
        self.assertEqual(summary.status_code, 200, summary.text)
        payload = summary.json()
        self.assertEqual(payload["statement"]["matched_count"], 1)
        self.assertEqual(payload["statement"]["matched_amount"], 125.0)
        self.assertGreaterEqual(payload["ledger"]["matched_count"], 1)

        lines = self.client.get(
            f"/api/accounting/bank-reconciliation/accounts/{account_id}/statement",
            headers=headers,
        ).json()
        self.assertTrue(lines[0]["matched"])
        self.assertEqual(lines[0]["voucher_line_id"], exact["voucher_line_id"])

        unmatched = self.client.delete(
            f"/api/accounting/bank-reconciliation/statement/{statement_id}/match",
            headers=headers,
        )
        self.assertEqual(unmatched.json()["status"], "unmatched")
        deleted_line = self.client.delete(
            f"/api/accounting/bank-reconciliation/statement/{statement_id}",
            headers=headers,
        )
        self.assertEqual(deleted_line.json()["status"], "deleted")
        deleted_account = self.client.delete(
            f"/api/accounting/bank-reconciliation/accounts/{account_id}",
            headers=headers,
        )
        self.assertEqual(deleted_account.json()["status"], "deleted")


    def test_z_fixed_asset_straight_line_depreciation(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        created = self.client.post(
            "/api/accounting/fixed-assets",
            headers=headers,
            json={
                "name": "CI Medical Equipment",
                "asset_code": "CI-ASSET-001",
                "category": "equipment",
                "purchase_date": "2098-01-01",
                "acquisition_cost": 1200,
                "salvage_value": 0,
                "useful_life_months": 12,
                "payment_method": "bank",
                "serial_number": "CI-SERIAL-001",
                "location": "Test Lab",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        asset_id = created.json()["id"]

        acquisition = self.client.get(
            f"/api/accounting/entries/{created.json()['voucher_id']}",
            headers=headers,
        ).json()
        acquisition_lines = {
            line["account_code"]: line for line in acquisition["lines"]
        }
        self.assertEqual(acquisition_lines["1202"]["debit"], 1200.0)
        self.assertEqual(acquisition_lines["1102"]["credit"], 1200.0)

        run = self.client.post(
            "/api/accounting/fixed-assets/depreciation/run",
            headers=headers,
            json={"through_date": "2098-04-01", "asset_id": asset_id},
        )
        self.assertEqual(run.status_code, 200, run.text)
        result = run.json()
        self.assertEqual(result["posted_count"], 1)
        self.assertEqual(result["total_depreciation"], 300.0)
        self.assertEqual(result["posted"][0]["months_recognized"], 3)
        self.assertEqual(result["posted"][0]["book_value_after"], 900.0)

        depreciation = self.client.get(
            f"/api/accounting/entries/{result['posted'][0]['voucher_id']}",
            headers=headers,
        ).json()
        depreciation_lines = {
            line["account_code"]: line for line in depreciation["lines"]
        }
        self.assertEqual(depreciation_lines["5103"]["debit"], 300.0)
        self.assertEqual(depreciation_lines["1203"]["credit"], 300.0)

        repeated = self.client.post(
            "/api/accounting/fixed-assets/depreciation/run",
            headers=headers,
            json={"through_date": "2098-04-01", "asset_id": asset_id},
        )
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(repeated.json()["posted_count"], 0)

        detail = self.client.get(
            f"/api/accounting/fixed-assets/{asset_id}",
            headers=headers,
        )
        self.assertEqual(detail.status_code, 200, detail.text)
        asset = detail.json()
        self.assertEqual(asset["acquisition_cost"], 1200.0)
        self.assertEqual(asset["accumulated_depreciation"], 300.0)
        self.assertEqual(asset["book_value"], 900.0)
        self.assertEqual(len(asset["depreciation_history"]), 1)

        blocked_delete = self.client.delete(
            f"/api/accounting/fixed-assets/{asset_id}",
            headers=headers,
        )
        self.assertEqual(blocked_delete.status_code, 409)


    def test_zz_budget_cost_center_variance_control(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        center = self.client.post(
            "/api/accounting/budgets/cost-centers",
            headers=headers,
            json={"code": "CI-OPS", "name": "CI Operations"},
        )
        self.assertEqual(center.status_code, 200, center.text)
        center_id = center.json()["id"]
        project = self.client.post(
            "/api/accounting/budgets/projects",
            headers=headers,
            json={"code": "CI-PROJ", "name": "CI Project"},
        )
        self.assertEqual(project.status_code, 200, project.text)
        project_id = project.json()["id"]

        periods = self.client.get(
            "/api/accounting/periods", headers=headers
        ).json()
        period = next(item for item in periods if item["status"] == "open")
        accounts = self.client.get(
            "/api/accounting/entries/chart", headers=headers
        ).json()
        expense = next(item for item in accounts if item["code"] == "5102")
        cash = next(item for item in accounts if item["code"] == "1101")

        budget = self.client.post(
            "/api/accounting/budgets/lines",
            headers=headers,
            json={
                "fiscal_period_id": period["id"],
                "account_id": expense["id"],
                "cost_center_id": center_id,
                "project_id": project_id,
                "amount": 100,
                "note": "CI operating budget",
            },
        )
        self.assertEqual(budget.status_code, 200, budget.text)

        voucher = self.client.post(
            "/api/accounting/entries",
            headers=headers,
            json={
                "voucher_date": period["start_date"],
                "description": "CI budget variance voucher",
                "status": "posted",
                "lines": [
                    {
                        "account_id": expense["id"],
                        "debit": 120,
                        "credit": 0,
                        "cost_center_id": center_id,
                        "project_id": project_id,
                    },
                    {
                        "account_id": cash["id"],
                        "debit": 0,
                        "credit": 120,
                        "cost_center_id": center_id,
                        "project_id": project_id,
                    },
                ],
            },
        )
        self.assertEqual(voucher.status_code, 200, voucher.text)

        variance = self.client.get(
            "/api/accounting/budgets/variance",
            headers=headers,
            params={
                "fiscal_period_id": period["id"],
                "cost_center_id": center_id,
                "project_id": project_id,
            },
        )
        self.assertEqual(variance.status_code, 200, variance.text)
        payload = variance.json()
        self.assertEqual(payload["summary"]["budget"], 100.0)
        self.assertEqual(payload["summary"]["actual"], 120.0)
        self.assertEqual(payload["summary"]["variance"], -20.0)
        self.assertEqual(payload["summary"]["over_budget_count"], 1)
        self.assertTrue(payload["items"][0]["over_budget"])
        self.assertEqual(payload["items"][0]["usage_percent"], 120.0)

        meta = self.client.get(
            "/api/accounting/entries/meta", headers=headers
        ).json()
        self.assertTrue(
            any(item["id"] == center_id for item in meta["cost_centers"])
        )
        self.assertTrue(
            any(item["id"] == project_id for item in meta["projects"])
        )


    def test_zzz_multi_currency_rate_and_balance_reporting(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        periods = self.client.get(
            "/api/accounting/periods", headers=headers
        ).json()
        period = next(item for item in periods if item["status"] == "open")

        currency = self.client.post(
            "/api/accounting/currencies",
            headers=headers,
            json={"code": "USD", "name": "US Dollar", "symbol": "$"},
        )
        self.assertEqual(currency.status_code, 200, currency.text)

        initial_rate = self.client.post(
            "/api/accounting/currencies/rates",
            headers=headers,
            json={
                "currency_code": "USD",
                "rate_date": period["start_date"],
                "rate_to_base": 50000,
            },
        )
        self.assertEqual(initial_rate.status_code, 200, initial_rate.text)

        accounts = self.client.get(
            "/api/accounting/entries/chart", headers=headers
        ).json()
        bank = next(item for item in accounts if item["code"] == "1102")
        revenue = next(item for item in accounts if item["code"] == "4101")
        voucher = self.client.post(
            "/api/accounting/entries",
            headers=headers,
            json={
                "voucher_date": period["start_date"],
                "description": "CI foreign currency receipt",
                "status": "posted",
                "lines": [
                    {
                        "account_id": bank["id"],
                        "debit": 100000,
                        "credit": 0,
                        "currency_code": "USD",
                        "foreign_amount": 2,
                        "exchange_rate": 50000,
                    },
                    {
                        "account_id": revenue["id"],
                        "debit": 0,
                        "credit": 100000,
                    },
                ],
            },
        )
        self.assertEqual(voucher.status_code, 200, voucher.text)
        foreign_line = next(
            line for line in voucher.json()["lines"]
            if line["account_code"] == "1102"
        )
        self.assertEqual(foreign_line["currency_code"], "USD")
        self.assertEqual(foreign_line["foreign_amount"], 2)
        self.assertEqual(foreign_line["exchange_rate"], 50000)

        invalid = self.client.post(
            "/api/accounting/entries",
            headers=headers,
            json={
                "voucher_date": period["start_date"],
                "description": "Invalid conversion",
                "status": "posted",
                "lines": [
                    {
                        "account_id": bank["id"],
                        "debit": 90000,
                        "currency_code": "USD",
                        "foreign_amount": 2,
                        "exchange_rate": 50000,
                    },
                    {"account_id": revenue["id"], "credit": 90000},
                ],
            },
        )
        self.assertEqual(invalid.status_code, 400)

        current_rate = self.client.post(
            "/api/accounting/currencies/rates",
            headers=headers,
            json={
                "currency_code": "USD",
                "rate_date": period["end_date"],
                "rate_to_base": 60000,
            },
        )
        self.assertEqual(current_rate.status_code, 200, current_rate.text)

        balances = self.client.get(
            "/api/accounting/currencies/reports/balances",
            headers=headers,
            params={
                "fiscal_period_id": period["id"],
                "as_of": period["end_date"],
            },
        )
        self.assertEqual(balances.status_code, 200, balances.text)
        item = next(
            row for row in balances.json()["items"]
            if row["currency_code"] == "USD"
            and row["account_code"] == "1102"
        )
        self.assertEqual(item["foreign_balance"], 2.0)
        self.assertEqual(item["base_balance"], 100000.0)
        self.assertEqual(item["current_rate"], 60000.0)
        self.assertEqual(item["current_base_value"], 120000.0)
        self.assertEqual(item["unrealized_difference"], 20000.0)


    def test_zzzz_maker_checker_voucher_approval(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_login.json()['access_token']}"
        }
        accountant_create = self.client.post(
            "/users",
            headers=admin_headers,
            json={
                "full_name": "CI Approval Accountant",
                "username": "ci-approval-accountant",
                "password": "StrongApprovalPassword!42",
                "role": "accountant",
            },
        )
        self.assertEqual(
            accountant_create.status_code, 200, accountant_create.text
        )
        accountant_login = self.client.post(
            "/login",
            json={
                "username": "ci-approval-accountant",
                "password": "StrongApprovalPassword!42",
            },
        )
        accountant_headers = {
            "Authorization": (
                f"Bearer {accountant_login.json()['access_token']}"
            )
        }

        accounts = self.client.get(
            "/api/accounting/entries/chart", headers=admin_headers
        ).json()
        cash = next(item for item in accounts if item["code"] == "1101")
        expense = next(item for item in accounts if item["code"] == "5102")
        draft = self.client.post(
            "/api/accounting/entries",
            headers=admin_headers,
            json={
                "description": "CI approval workflow voucher",
                "status": "draft",
                "lines": [
                    {"account_id": expense["id"], "debit": 75},
                    {"account_id": cash["id"], "credit": 75},
                ],
            },
        )
        self.assertEqual(draft.status_code, 200, draft.text)
        voucher_id = draft.json()["id"]

        submitted = self.client.post(
            f"/api/accounting/approvals/vouchers/{voucher_id}/submit",
            headers=admin_headers,
        )
        self.assertEqual(submitted.status_code, 200, submitted.text)
        approval_id = submitted.json()["approval_id"]

        self_approval = self.client.post(
            f"/api/accounting/approvals/{approval_id}/approve",
            headers=admin_headers,
            json={"note": "must be blocked"},
        )
        self.assertEqual(self_approval.status_code, 409)

        approved = self.client.post(
            f"/api/accounting/approvals/{approval_id}/approve",
            headers=accountant_headers,
            json={"note": "independently reviewed"},
        )
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["status"], "approved")

        voucher = self.client.get(
            f"/api/accounting/entries/{voucher_id}",
            headers=admin_headers,
        ).json()
        self.assertEqual(voucher["status"], "posted")

        detail = self.client.get(
            f"/api/accounting/approvals/{approval_id}",
            headers=admin_headers,
        )
        self.assertEqual(detail.status_code, 200, detail.text)
        approval = detail.json()
        self.assertEqual(approval["status"], "approved")
        self.assertEqual(
            [event["event_type"] for event in approval["events"]],
            ["submitted", "approved"],
        )
        self.assertNotEqual(
            approval["requested_by"], approval["decided_by"]
        )

        pending = self.client.get(
            "/api/accounting/approvals",
            headers=admin_headers,
            params={"status": "pending"},
        )
        self.assertEqual(pending.status_code, 200, pending.text)
        self.assertFalse(
            any(item["id"] == approval_id for item in pending.json())
        )


    def test_zzzzz_received_cheque_treasury_lifecycle(self):
        login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        customer = self.client.post(
            "/customers",
            headers=headers,
            json={"name": "CI Treasury Party"},
        )
        self.assertEqual(customer.json()["status"], "created", customer.text)
        customer_id = customer.json()["id"]

        created = self.client.post(
            "/api/accounting/treasury/cheques",
            headers=headers,
            json={
                "direction": "received",
                "customer_id": customer_id,
                "amount": 100,
                "cheque_number": "CI-CHQ-001",
                "bank_name": "CI Bank",
                "issue_date": "2099-01-01",
                "due_date": "2099-02-01",
                "note": "integration test",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        cheque_id = created.json()["id"]

        registration = self.client.get(
            f"/api/accounting/entries/{created.json()['voucher_id']}",
            headers=headers,
        ).json()
        registration_lines = {
            line["account_code"]: line for line in registration["lines"]
        }
        self.assertEqual(registration_lines["1104"]["debit"], 100.0)
        self.assertEqual(registration_lines["1103"]["credit"], 100.0)

        customer_after_receipt = self.client.get(
            f"/customers/{customer_id}", headers=headers
        ).json()["customer"]
        self.assertEqual(customer_after_receipt["balance"], -100.0)

        duplicate = self.client.post(
            "/api/accounting/treasury/cheques",
            headers=headers,
            json={
                "direction": "received",
                "customer_id": customer_id,
                "amount": 100,
                "cheque_number": "CI-CHQ-001",
                "issue_date": "2099-01-01",
                "due_date": "2099-02-01",
            },
        )
        self.assertEqual(duplicate.status_code, 409)

        bounced = self.client.post(
            f"/api/accounting/treasury/cheques/{cheque_id}/transition",
            headers=headers,
            json={
                "status": "bounced",
                "event_date": "2099-02-02",
                "note": "bank returned cheque",
            },
        )
        self.assertEqual(bounced.status_code, 200, bounced.text)
        self.assertEqual(bounced.json()["status"], "bounced")

        bounce_voucher = self.client.get(
            f"/api/accounting/entries/{bounced.json()['voucher_id']}",
            headers=headers,
        ).json()
        bounce_lines = {
            line["account_code"]: line for line in bounce_voucher["lines"]
        }
        self.assertEqual(bounce_lines["1103"]["debit"], 100.0)
        self.assertEqual(bounce_lines["1104"]["credit"], 100.0)

        customer_after_bounce = self.client.get(
            f"/customers/{customer_id}", headers=headers
        ).json()["customer"]
        self.assertEqual(customer_after_bounce["balance"], 0.0)

        second_transition = self.client.post(
            f"/api/accounting/treasury/cheques/{cheque_id}/transition",
            headers=headers,
            json={"status": "cleared", "event_date": "2099-02-03"},
        )
        self.assertEqual(second_transition.status_code, 409)

        detail = self.client.get(
            f"/api/accounting/treasury/cheques/{cheque_id}",
            headers=headers,
        )
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["status"], "bounced")
        self.assertEqual(len(detail.json()["events"]), 1)


    def test_zzzzzz_release_preflight_contract(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_login.json()['access_token']}"
        }
        preflight = self.client.get(
            "/api/system/release-preflight",
            headers=admin_headers,
        )
        self.assertEqual(preflight.status_code, 200, preflight.text)
        payload = preflight.json()
        self.assertEqual(payload["version"], "1.0.1")
        self.assertTrue(payload["release_ready"], payload)
        self.assertEqual(payload["api_contract"]["missing_routes"], [])
        self.assertGreaterEqual(payload["database"]["administrators"], 1)
        self.assertEqual(payload["database"]["missing_release_tables"], [])
        self.assertTrue(payload["security"]["jwt_secret_length_ok"])

        version = self.client.get(
            "/api/system/version",
            headers=admin_headers,
        )
        self.assertEqual(version.status_code, 200, version.text)
        self.assertEqual(version.json()["version"], "1.0.1")

        viewer_login = self.client.post(
            "/login",
            json={"username": "ci-user", "password": "StrongUserPassword!42"},
        )
        viewer_headers = {
            "Authorization": f"Bearer {viewer_login.json()['access_token']}"
        }
        forbidden = self.client.get(
            "/api/system/release-preflight",
            headers=viewer_headers,
        )
        self.assertEqual(forbidden.status_code, 403)


if __name__ == "__main__":
    unittest.main()
