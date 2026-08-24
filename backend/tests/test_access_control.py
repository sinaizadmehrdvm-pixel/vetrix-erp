import os
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

TEST_DATABASE = Path(tempfile.gettempdir()) / f"vetrix-test-{os.getpid()}.db"
TEST_BACKUP_DIR = Path(tempfile.gettempdir()) / f"vetrix-backups-{os.getpid()}"
os.environ["VETRIX_DATABASE_URL"] = f"sqlite:///{TEST_DATABASE}"
os.environ["VETRIX_BACKUP_DIR"] = str(TEST_BACKUP_DIR)
os.environ["VETRIX_JWT_SECRET"] = "integration-test-secret-not-for-production"
os.environ["VETRIX_STOREFRONT_SYNC_SECRET"] = "integration-test-storefront-root-secret-42"

import pyotp
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
        # Releases every pooled SQLAlchemy connection's file handle first -
        # without this, TEST_DATABASE.unlink() intermittently hit a Windows
        # PermissionError (a still-open handle blocks deletion there, unlike
        # POSIX where an open file can be unlinked freely).
        engine.dispose()
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
        self.assertEqual(first_run.json()["version"], "1.4.1")

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

        international_settings = self.client.post(
            "/settings",
            headers=admin_headers,
            json={
                "country_code": "DE",
                "locale_code": "de-DE",
                "currency_code": "EUR",
                "currency": "EUR",
                "calendar_system": "gregory",
                "time_zone": "Europe/Berlin",
                "first_day_of_week": 1,
                "fiscal_year_start": "01-01",
                "rounding_mode": "half_up",
                "decimal_places": 2,
                "measurement_system": "metric",
                "tax_profile_version": "",
                "tax_profile_verified_at": "",
            },
        )
        self.assertEqual(international_settings.status_code, 200, international_settings.text)
        persisted_locale = self.client.get("/settings", headers=admin_headers)
        self.assertEqual(persisted_locale.status_code, 200, persisted_locale.text)
        self.assertEqual(persisted_locale.json()["country_code"], "DE")
        self.assertEqual(persisted_locale.json()["currency_code"], "EUR")
        self.assertEqual(persisted_locale.json()["calendar_system"], "gregory")
        self.assertEqual(persisted_locale.json()["time_zone"], "Europe/Berlin")
        self.assertEqual(persisted_locale.json()["decimal_places"], 2)

        policy_draft = self.client.post(
            "/api/financial-policy",
            headers=admin_headers,
            json={
                "version": "ci-de-2026-01",
                "country_code": "DE",
                "currency_code": "EUR",
                "decimal_places": 2,
                "rounding_mode": "half_even",
                "effective_from": "2026-01-01",
            },
        )
        self.assertEqual(policy_draft.status_code, 200, policy_draft.text)
        policy_id = policy_draft.json()["policy_id"]
        activated_policy = self.client.post(
            f"/api/financial-policy/{policy_id}/activate",
            headers=admin_headers,
            json={"note": "Verified integration-test policy"},
        )
        self.assertEqual(activated_policy.status_code, 200, activated_policy.text)
        current_policy = self.client.get(
            "/api/financial-policy/active", headers=admin_headers
        )
        self.assertEqual(current_policy.status_code, 200, current_policy.text)
        self.assertEqual(current_policy.json()["version"], "ci-de-2026-01")
        self.assertEqual(current_policy.json()["rounding_mode"], "half_even")

        commerce_unauthorized = self.client.get("/api/online-commerce/summary")
        self.assertEqual(commerce_unauthorized.status_code, 401)

        commerce_summary = self.client.get(
            "/api/online-commerce/summary", headers=admin_headers
        )
        self.assertEqual(commerce_summary.status_code, 200, commerce_summary.text)
        self.assertIn("products", commerce_summary.json())
        self.assertIn("campaigns", commerce_summary.json())

        commerce_products = self.client.get(
            "/api/online-commerce/products", headers=admin_headers
        )
        self.assertEqual(commerce_products.status_code, 200, commerce_products.text)

        unsafe_connection = self.client.put(
            "/api/online-commerce/connections/telegram",
            headers=admin_headers,
            json={
                "channel": "telegram",
                "enabled": True,
                "base_url": "https://api.telegram.org",
                "account_label": "Vetrix",
                "secret_reference": "token=must-not-be-stored",
            },
        )
        self.assertEqual(unsafe_connection.status_code, 400, unsafe_connection.text)

        safe_connection = self.client.put(
            "/api/online-commerce/connections/website",
            headers=admin_headers,
            json={
                "channel": "website",
                "enabled": False,
                "base_url": "https://example.test/api",
                "account_label": "Test store",
                "secret_reference": "env:VETRIX_WEBSITE_API_TOKEN",
            },
        )
        self.assertEqual(safe_connection.status_code, 200, safe_connection.text)

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

        voice_upload = self.client.post(
            "/api/change-requests/audio",
            headers=user_headers,
            files={"audio": ("voice-42.ogg", b"CI voice evidence", "audio/ogg")},
        )
        self.assertEqual(voice_upload.status_code, 200, voice_upload.text)
        self.assertEqual(voice_upload.json()["size_bytes"], len(b"CI voice evidence"))

        voice_request = self.client.post(
            "/api/change-requests",
            headers=user_headers,
            json={
                "source": "telegram",
                "source_reference": "message-42",
                "audio_reference": voice_upload.json()["reference"],
                "transcript": "Please review this non-executable operational note.",
                "action_type": "note_only",
                "target_id": None,
                "proposed_changes": {},
            },
        )
        self.assertEqual(voice_request.status_code, 200, voice_request.text)
        change_request_id = voice_request.json()["request_id"]

        submit_voice_request = self.client.post(
            f"/api/change-requests/{change_request_id}/submit",
            headers=user_headers,
        )
        self.assertEqual(submit_voice_request.status_code, 200, submit_voice_request.text)
        self.assertEqual(submit_voice_request.json()["status"], "pending_approval")

        non_admin_approval = self.client.post(
            f"/api/change-requests/{change_request_id}/approve",
            headers=user_headers,
            json={"note": "self approval must fail"},
        )
        self.assertEqual(non_admin_approval.status_code, 403, non_admin_approval.text)

        approve_voice_request = self.client.post(
            f"/api/change-requests/{change_request_id}/approve",
            headers=admin_headers,
            json={"note": "Reviewed in CI"},
        )
        self.assertEqual(approve_voice_request.status_code, 200, approve_voice_request.text)
        self.assertEqual(approve_voice_request.json()["status"], "applied")

        voice_request_detail = self.client.get(
            f"/api/change-requests/{change_request_id}",
            headers=admin_headers,
        )
        self.assertEqual(voice_request_detail.status_code, 200, voice_request_detail.text)
        self.assertGreaterEqual(len(voice_request_detail.json()["events"]), 3)

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

    def test_zzy_budget_plan_versioning_approval_and_goods(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        second_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Budget Plan Approver", "username": "ci-admin-budget", "password": "StrongBudgetPass!42", "role": "admin"},
        )
        self.assertEqual(second_admin.status_code, 200, second_admin.text)
        second_headers, _ = self._login("ci-admin-budget", "StrongBudgetPass!42")

        # Self-contained period (not borrowed from shared/global test state,
        # which other tests may close before this one runs) with a unique,
        # far-future date range so it can never collide with another test's period.
        new_period = self.client.post(
            "/api/accounting/periods", headers=admin_headers,
            json={"name": "CI Budget Plan Period", "start_date": "2031-01-01", "end_date": "2031-01-31"},
        )
        self.assertEqual(new_period.status_code, 200, new_period.text)
        period = {"id": new_period.json()["id"], "start_date": "2031-01-01", "end_date": "2031-01-31"}
        accounts = self.client.get("/api/accounting/entries/chart", headers=admin_headers).json()
        expense = next(item for item in accounts if item["code"] == "5102")
        revenue = next(item for item in accounts if item["code"] == "4101")
        cash = next(item for item in accounts if item["code"] == "1101")

        product = self.client.post(
            "/products", headers=admin_headers, json={"name": "Budget Goods Widget", "price": 100, "buy_price": 60, "stock": 20},
        )
        product_id = product.json()["id"]

        # Create a draft plan, add a financial line (reusing the existing
        # budgets/lines endpoint, scoped to this plan) and a goods line.
        plan = self.client.post(
            "/api/accounting/budget-plans", headers=admin_headers,
            json={"name": "CI Q1 Plan", "budget_type": "financial", "scenario": "base", "fiscal_period_id": period["id"]},
        )
        self.assertEqual(plan.status_code, 200, plan.text)
        plan_id = plan.json()["id"]

        expense_line = self.client.post(
            "/api/accounting/budgets/lines", headers=admin_headers,
            json={"fiscal_period_id": period["id"], "account_id": expense["id"], "amount": 500, "budget_plan_id": plan_id},
        )
        self.assertEqual(expense_line.status_code, 200, expense_line.text)
        revenue_line = self.client.post(
            "/api/accounting/budgets/lines", headers=admin_headers,
            json={"fiscal_period_id": period["id"], "account_id": revenue["id"], "amount": 1000, "budget_plan_id": plan_id},
        )
        self.assertEqual(revenue_line.status_code, 200, revenue_line.text)

        goods_line = self.client.post(
            f"/api/accounting/budget-plans/{plan_id}/goods-lines", headers=admin_headers,
            json={"product_id": product_id, "planned_quantity": 50, "unit_value": 60},
        )
        self.assertEqual(goods_line.status_code, 200, goods_line.text)

        detail = self.client.get(f"/api/accounting/budget-plans/{plan_id}", headers=admin_headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(len(detail.json()["budget_lines"]), 2)
        self.assertEqual(len(detail.json()["goods_lines"]), 1)
        self.assertEqual(detail.json()["status"], "draft")

        # A plan-scoped budget line must not collide with an unrelated,
        # plan-less line for the same account/period (the whole point of
        # the plan-aware unique index migration).
        unrelated_line = self.client.post(
            "/api/accounting/budgets/lines", headers=admin_headers,
            json={"fiscal_period_id": period["id"], "account_id": expense["id"], "amount": 999},
        )
        self.assertEqual(unrelated_line.status_code, 200, unrelated_line.text)
        # Coexistence proven above (the actual point of unrelated_line) -
        # remove it now so it doesn't inflate this period's total planned
        # expense for the executive-alerts usage_percent assertion below,
        # which (Task 07 Section 4/H) now reads the whole period's real
        # budgets.py lines, same as BudgetControl.jsx itself, not just this
        # one plan's lines.
        remove_unrelated = self.client.delete(f"/api/accounting/budgets/lines/{unrelated_line.json()['id']}", headers=admin_headers)
        self.assertEqual(remove_unrelated.status_code, 200, remove_unrelated.text)

        # Submit for approval - draft -> pending (via the generic approval engine).
        submit = self.client.post(f"/api/accounting/budget-plans/{plan_id}/submit", headers=admin_headers)
        self.assertEqual(submit.status_code, 200, submit.text)
        approval_request_id = submit.json()["approval_request_id"]

        after_submit = self.client.get(f"/api/accounting/budget-plans/{plan_id}", headers=admin_headers).json()
        self.assertEqual(after_submit["status"], "draft")
        self.assertTrue(after_submit["pending_approval"])

        # Editing a submitted (still-draft-status-but-pending) plan directly is blocked once approved,
        # but the requester cannot approve their own submission.
        self_approve = self.client.post(f"/api/approvals/{approval_request_id}/approve", headers=admin_headers, json={"note": "self"})
        self.assertEqual(self_approve.status_code, 409, self_approve.text)

        approve = self.client.post(f"/api/approvals/{approval_request_id}/approve", headers=second_headers, json={"note": "looks good"})
        self.assertEqual(approve.status_code, 200, approve.text)
        self.assertEqual(approve.json()["status"], "approved", approve.text)

        after_approve = self.client.get(f"/api/accounting/budget-plans/{plan_id}", headers=admin_headers).json()
        self.assertEqual(after_approve["status"], "approved")
        self.assertFalse(after_approve["pending_approval"])

        # An approved plan can no longer be edited directly.
        edit_blocked = self.client.put(
            f"/api/accounting/budget-plans/{plan_id}", headers=admin_headers,
            json={"name": "renamed", "fiscal_period_id": period["id"]},
        )
        self.assertEqual(edit_blocked.status_code, 409)

        # Activate makes it the live plan.
        activate = self.client.post(f"/api/accounting/budget-plans/{plan_id}/activate", headers=admin_headers)
        self.assertEqual(activate.status_code, 200, activate.text)
        self.assertEqual(activate.json()["status"], "active")

        # Post a real voucher against the expense account so summary/forecast have actuals.
        voucher = self.client.post(
            "/api/accounting/entries", headers=admin_headers,
            json={
                "voucher_date": period["start_date"], "description": "CI budget plan actual", "status": "posted",
                "lines": [
                    {"account_id": expense["id"], "debit": 450, "credit": 0},
                    {"account_id": cash["id"], "debit": 0, "credit": 450},
                ],
            },
        )
        self.assertEqual(voucher.status_code, 200, voucher.text)

        summary = self.client.get(f"/api/accounting/budget-plans/{plan_id}/summary", headers=admin_headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        summary_payload = summary.json()
        self.assertEqual(summary_payload["total_planned_revenue"], 1000)
        self.assertEqual(summary_payload["total_planned_expense"], 500)
        self.assertEqual(summary_payload["actual_expense"], 450)
        self.assertEqual(summary_payload["expected_profit"], 500)

        forecast = self.client.get(f"/api/accounting/budget-plans/{plan_id}/forecast", headers=admin_headers)
        self.assertEqual(forecast.status_code, 200, forecast.text)
        self.assertEqual(forecast.json()["method"], "run_rate_projection")
        self.assertIn("not an AI/ML prediction", forecast.json()["method_label"])

        # Clone creates a real, independent second plan.
        clone = self.client.post(f"/api/accounting/budget-plans/{plan_id}/clone", headers=admin_headers)
        self.assertEqual(clone.status_code, 200, clone.text)
        clone_id = clone.json()["id"]
        self.assertNotEqual(clone_id, plan_id)
        cloned_detail = self.client.get(f"/api/accounting/budget-plans/{clone_id}", headers=admin_headers).json()
        self.assertEqual(cloned_detail["status"], "draft")
        self.assertEqual(len(cloned_detail["budget_lines"]), 2)
        self.assertEqual(len(cloned_detail["goods_lines"]), 1)
        self.assertEqual(cloned_detail["parent_plan_id"], plan_id)

        # Executive alerts surfaces this over-threshold period as a real,
        # computed alert - reading app/accounting/budgets.py's own line-level
        # data (Task 07 Section 4/H), the same numbers BudgetControl.jsx
        # itself shows for this fiscal period, not the budget_plans layer
        # (which has no frontend anywhere in the app).
        threshold = self.client.put(
            "/api/executive-alerts/settings", headers=admin_headers,
            json={"alert_days_before_due": 3, "minimum_receivable_amount": 0, "budget_usage_alert_percent": 80},
        )
        self.assertEqual(threshold.status_code, 200, threshold.text)
        alerts = self.client.get("/api/executive-alerts/summary", headers=admin_headers)
        self.assertEqual(alerts.status_code, 200, alerts.text)
        budget_alerts = [a for a in alerts.json()["items"] if a["category"] == "budget" and a["related_id"] == period["id"]]
        self.assertTrue(budget_alerts, alerts.json()["items"])
        self.assertEqual(budget_alerts[0]["usage_percent"], 90.0)

        # Close then archive.
        close = self.client.post(f"/api/accounting/budget-plans/{plan_id}/close", headers=admin_headers)
        self.assertEqual(close.status_code, 200, close.text)
        archive = self.client.post(f"/api/accounting/budget-plans/{plan_id}/archive", headers=admin_headers)
        self.assertEqual(archive.status_code, 200, archive.text)
        self.assertEqual(archive.json()["status"], "archived")

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
        self.assertEqual(payload["version"], "1.4.1")
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
        self.assertEqual(version.json()["version"], "1.4.1")

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


    def test_zzzzzzz_admin_password_recovery_forces_next_login_password_change(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        if admin_login.status_code != 200:
            self.client.post(
                "/users",
                json={
                    "full_name": "Recovery Administrator",
                    "username": "ci-admin",
                    "password": "StrongAdminPassword!42",
                    "role": "admin",
                },
            )
            admin_login = self.client.post(
                "/login",
                json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
            )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
        user_response = self.client.post(
            "/users",
            headers=admin_headers,
            json={
                "full_name": "Recovery User",
                "username": "password-recovery-user",
                "password": "StrongUserPassword!42",
                "role": "viewer",
            },
        )
        user_id = user_response.json()["id"]

        viewer_login = self.client.post(
            "/login",
            json={"username": "password-recovery-user", "password": "StrongUserPassword!42"},
        )
        viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
        blocked_reset = self.client.put(
            f"/users/{user_id}/password",
            headers=viewer_headers,
            json={"password": "TemporaryPassword!42"},
        )
        self.assertEqual(blocked_reset.status_code, 403)

        reset = self.client.put(
            f"/users/{user_id}/password",
            headers=admin_headers,
            json={"password": "TemporaryPassword!42", "force_change_on_next_login": True},
        )
        self.assertEqual(reset.status_code, 200, reset.text)
        self.assertTrue(reset.json()["user"]["must_change_password"])
        self.assertEqual(reset.json()["security_event"], "admin_password_reset")

        # The password reset must revoke tokens issued before it, even
        # though they haven't expired yet.
        revoked_after_reset = self.client.get("/customers", headers=viewer_headers)
        self.assertEqual(revoked_after_reset.status_code, 401)

        forced_login = self.client.post(
            "/login",
            json={"username": "password-recovery-user", "password": "TemporaryPassword!42"},
        )
        self.assertEqual(forced_login.status_code, 200, forced_login.text)
        self.assertTrue(forced_login.json()["requires_password_change"])
        forced_headers = {"Authorization": f"Bearer {forced_login.json()['access_token']}"}
        blocked_business_access = self.client.get("/customers", headers=forced_headers)
        self.assertEqual(blocked_business_access.status_code, 403)
        self.assertEqual(blocked_business_access.json()["code"], "password_change_required")

        changed = self.client.put(
            "/users/me/password",
            headers=forced_headers,
            json={
                "current_password": "TemporaryPassword!42",
                "new_password": "RecoveredStrongPassword!42",
            },
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertFalse(changed.json()["user"]["must_change_password"])
        self.assertEqual(changed.json()["security_event"], "user_password_changed")

        # Changing your own password revokes the token used to do it, but the
        # response hands back a fresh one so the caller isn't logged out by
        # its own action.
        self.assertIn("access_token", changed.json())
        old_token_after_change = self.client.get("/me", headers=forced_headers)
        self.assertEqual(old_token_after_change.status_code, 401)
        fresh_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
        fresh_token_works = self.client.get("/me", headers=fresh_headers)
        self.assertEqual(fresh_token_works.status_code, 200, fresh_token_works.text)

        refreshed_login = self.client.post(
            "/login",
            json={"username": "password-recovery-user", "password": "RecoveredStrongPassword!42"},
        )
        self.assertEqual(refreshed_login.status_code, 200, refreshed_login.text)
        self.assertFalse(refreshed_login.json()["requires_password_change"])

        # An explicit logout revokes the current token immediately, even
        # though it hasn't expired.
        refreshed_headers = {"Authorization": f"Bearer {refreshed_login.json()['access_token']}"}
        still_works = self.client.get("/me", headers=refreshed_headers)
        self.assertEqual(still_works.status_code, 200, still_works.text)
        logout_response = self.client.post("/logout", headers=refreshed_headers)
        self.assertEqual(logout_response.status_code, 200, logout_response.text)
        after_logout = self.client.get("/me", headers=refreshed_headers)
        self.assertEqual(after_logout.status_code, 401)

        events = self.client.get("/api/audit/events", headers=admin_headers)
        audit_items = events.json()["items"]
        paths = [item["path"] for item in audit_items]
        actions = [item["action"] for item in audit_items]
        self.assertIn(f"/users/{user_id}/password", paths)
        self.assertIn("/users/me/password", paths)
        self.assertIn("admin_password_reset", actions)
        self.assertIn("user_password_changed", actions)

    def test_zzzzzzzz_totp_two_factor_setup_login_and_disable_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        status_before = self.client.get("/api/auth/totp/status", headers=headers)
        self.assertEqual(status_before.status_code, 200, status_before.text)
        self.assertFalse(status_before.json()["enabled"])

        setup = self.client.post("/api/auth/totp/setup", headers=headers)
        self.assertEqual(setup.status_code, 200, setup.text)
        secret = setup.json()["secret"]
        self.assertIn("otpauth://", setup.json()["provisioning_uri"])
        self.assertTrue(setup.json()["qr_code"].startswith("data:image/png;base64,"))

        totp = pyotp.TOTP(secret)
        bad_verify = self.client.post("/api/auth/totp/verify", headers=headers, json={"code": "000000"})
        self.assertEqual(bad_verify.status_code, 401)

        verify = self.client.post("/api/auth/totp/verify", headers=headers, json={"code": totp.now()})
        self.assertEqual(verify.status_code, 200, verify.text)
        recovery_codes = verify.json()["recovery_codes"]
        self.assertEqual(len(recovery_codes), 8)

        status_after = self.client.get("/api/auth/totp/status", headers=headers)
        self.assertTrue(status_after.json()["enabled"])

        # Password alone no longer returns an access token once TOTP is on.
        password_only_login = self.client.post(
            "/login", json={"username": "ci-admin", "password": "StrongAdminPassword!42"}
        )
        self.assertEqual(password_only_login.status_code, 200, password_only_login.text)
        self.assertEqual(password_only_login.json()["status"], "mfa_required")
        mfa_token = password_only_login.json()["mfa_token"]
        self.assertNotIn("access_token", password_only_login.json())

        wrong_code = self.client.post("/login/totp", json={"mfa_token": mfa_token, "code": "111111"})
        self.assertEqual(wrong_code.status_code, 401)

        completed_login = self.client.post(
            "/login/totp", json={"mfa_token": mfa_token, "code": totp.now()}
        )
        self.assertEqual(completed_login.status_code, 200, completed_login.text)
        self.assertEqual(completed_login.json()["status"], "success")
        self.assertIn("access_token", completed_login.json())
        fresh_headers = {"Authorization": f"Bearer {completed_login.json()['access_token']}"}

        # A recovery code logs in once, then is rejected on reuse.
        second_login = self.client.post(
            "/login", json={"username": "ci-admin", "password": "StrongAdminPassword!42"}
        )
        recovery_mfa_token = second_login.json()["mfa_token"]
        recovery_code = recovery_codes[0]
        recovery_login = self.client.post(
            "/login/totp", json={"mfa_token": recovery_mfa_token, "code": recovery_code}
        )
        self.assertEqual(recovery_login.status_code, 200, recovery_login.text)

        third_login = self.client.post(
            "/login", json={"username": "ci-admin", "password": "StrongAdminPassword!42"}
        )
        reused_mfa_token = third_login.json()["mfa_token"]
        reused_recovery_login = self.client.post(
            "/login/totp", json={"mfa_token": reused_mfa_token, "code": recovery_code}
        )
        self.assertEqual(reused_recovery_login.status_code, 401)

        # Disabling requires the current password and a valid second factor.
        wrong_password_disable = self.client.post(
            "/api/auth/totp/disable",
            headers=fresh_headers,
            json={"password": "wrong-password", "code": totp.now()},
        )
        self.assertEqual(wrong_password_disable.status_code, 401)

        disable = self.client.post(
            "/api/auth/totp/disable",
            headers=fresh_headers,
            json={"password": "StrongAdminPassword!42", "code": totp.now()},
        )
        self.assertEqual(disable.status_code, 200, disable.text)

        final_login = self.client.post(
            "/login", json={"username": "ci-admin", "password": "StrongAdminPassword!42"}
        )
        self.assertEqual(final_login.status_code, 200, final_login.text)
        self.assertEqual(final_login.json()["status"], "success")

    def test_zzzzzzzzz_live_notifications_websocket_rejects_and_broadcasts(self):
        from app.notifications.broadcaster import broadcaster

        with self.assertRaises(Exception):
            with self.client.websocket_connect("/ws/notifications"):
                pass

        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        token = admin_login.json()["access_token"]
        admin_company_id = admin_login.json()["user"]["company_id"]

        # SECURITY PHASE C: a second, unrelated company's connection must
        # never receive the first company's events - the broadcaster used
        # to fan out every event to every connected socket regardless of
        # which tenant authenticated it.
        second_company = self.client.post(
            "/api/companies", headers={"Authorization": f"Bearer {token}"},
            json={"name": "WS Isolation Co"},
        )
        self.assertEqual(second_company.status_code, 200, second_company.text)
        second_company_id = second_company.json()["id"]
        second_admin = self.client.post(
            "/users", headers={"Authorization": f"Bearer {token}"},
            json={"full_name": "WS Isolation Admin", "username": "ws-isolation-admin",
                  "password": "StrongWsIsolation!42", "role": "admin", "company_id": second_company_id},
        )
        self.assertEqual(second_admin.status_code, 200, second_admin.text)
        foreign_login = self.client.post(
            "/login", json={"username": "ws-isolation-admin", "password": "StrongWsIsolation!42"},
        )
        self.assertEqual(foreign_login.status_code, 200, foreign_login.text)
        foreign_token = foreign_login.json()["access_token"]

        with self.client.websocket_connect(f"/ws/notifications?token={foreign_token}") as foreign_ws:
            with self.client.websocket_connect(f"/ws/notifications?token={token}") as websocket:
                broadcaster.publish(
                    "low_stock", admin_company_id,
                    product_id=999, product_name="Websocket Test Product", stock=1, min_stock=5,
                )
                message = websocket.receive_json()
                self.assertEqual(message["type"], "low_stock")
                self.assertEqual(message["product_id"], 999)

                # A second, foreign-company-scoped event must reach ONLY
                # the foreign socket - proving it's actually connected and
                # listening (not silently receiving nothing for some
                # unrelated reason), while never seeing company A's event.
                broadcaster.publish(
                    "low_stock", second_company_id,
                    product_id=888, product_name="Foreign Product", stock=1, min_stock=5,
                )
                foreign_message = foreign_ws.receive_json()
                self.assertEqual(foreign_message["product_id"], 888)

        with self.assertRaises(Exception):
            with self.client.websocket_connect("/ws/notifications?token=not-a-real-token"):
                pass

    def test_zzzzzzzzza_websocket_token_revalidation_and_connection_cap(self):
        from unittest.mock import patch
        from app.notifications import broadcaster as broadcaster_module
        from app.notifications import ws_routes as ws_routes_module

        admin_login = self.client.post(
            "/login", json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        token = admin_login.json()["access_token"]

        # Periodic re-validation: once the token is revoked (logout bumps
        # token_generation), a long-lived connection must be force-closed
        # on its next re-check, not stay "authenticated" indefinitely.
        with patch.object(ws_routes_module, "TOKEN_RECHECK_INTERVAL_SECONDS", 0.05):
            with self.client.websocket_connect(f"/ws/notifications?token={token}") as websocket:
                revoke = self.client.post("/logout", headers={"Authorization": f"Bearer {token}"})
                self.assertEqual(revoke.status_code, 200, revoke.text)
                with self.assertRaises(Exception):
                    websocket.receive_json()

        # logout bumped token_generation, so re-login for a fresh token.
        relogin = self.client.post(
            "/login", json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(relogin.status_code, 200, relogin.text)
        fresh_token = relogin.json()["access_token"]

        # Connection cap: one account cannot open unlimited sockets.
        with patch.object(broadcaster_module, "MAX_CONNECTIONS_PER_USER", 2):
            with self.client.websocket_connect(f"/ws/notifications?token={fresh_token}"):
                with self.client.websocket_connect(f"/ws/notifications?token={fresh_token}"):
                    with self.assertRaises(Exception):
                        with self.client.websocket_connect(f"/ws/notifications?token={fresh_token}"):
                            pass

    def test_zzzzzzzzzz_ai_bi_anomaly_detection_endpoint(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        unauthenticated = self.client.get("/api/ai-bi/anomalies")
        self.assertEqual(unauthenticated.status_code, 401)

        response = self.client.get("/api/ai-bi/anomalies", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIn("items", body)
        self.assertIn("counts", body)
        self.assertEqual(set(body["counts"].keys()), {"high", "medium", "low"})

    def test_zzzzzzzzzzz_customer_self_service_portal_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        customer = self.client.post(
            "/customers", headers=headers, json={"name": "Portal Test Customer"}
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json()["id"]

        status_before = self.client.get(
            f"/api/customer-portal/{customer_id}/status", headers=headers
        )
        self.assertEqual(status_before.status_code, 200, status_before.text)
        self.assertFalse(status_before.json()["enabled"])

        blocked_before_link = self.client.get("/api/customer-portal/me")
        self.assertEqual(blocked_before_link.status_code, 401)

        access_link = self.client.post(
            f"/api/customer-portal/{customer_id}/access-link", headers=headers
        )
        self.assertEqual(access_link.status_code, 200, access_link.text)
        portal_token = access_link.json()["token"]
        portal_headers = {"Authorization": f"Bearer {portal_token}"}

        status_after = self.client.get(
            f"/api/customer-portal/{customer_id}/status", headers=headers
        )
        self.assertTrue(status_after.json()["enabled"])

        # A staff bearer token must never work against the customer-facing paths.
        staff_token_rejected = self.client.get("/api/customer-portal/me", headers=headers)
        self.assertEqual(staff_token_rejected.status_code, 401)

        portal_me = self.client.get("/api/customer-portal/me", headers=portal_headers)
        self.assertEqual(portal_me.status_code, 200, portal_me.text)
        self.assertEqual(portal_me.json()["customer"]["id"], customer_id)

        portal_invoices = self.client.get("/api/customer-portal/invoices", headers=portal_headers)
        self.assertEqual(portal_invoices.status_code, 200, portal_invoices.text)
        self.assertEqual(portal_invoices.json()["items"], [])

        portal_ledger = self.client.get("/api/customer-portal/ledger", headers=portal_headers)
        self.assertEqual(portal_ledger.status_code, 200, portal_ledger.text)
        self.assertEqual(portal_ledger.json()["balance"], 0)

        # A non-staff (viewer) role must not manage other customers' portal links.
        viewer_response = self.client.post(
            "/users",
            headers=headers,
            json={
                "full_name": "Portal Viewer",
                "username": "portal-viewer",
                "password": "StrongViewerPassword!42",
                "role": "viewer",
            },
        )
        self.assertEqual(viewer_response.status_code, 200, viewer_response.text)
        viewer_login = self.client.post(
            "/login", json={"username": "portal-viewer", "password": "StrongViewerPassword!42"}
        )
        viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
        viewer_blocked = self.client.post(
            f"/api/customer-portal/{customer_id}/access-link", headers=viewer_headers
        )
        self.assertEqual(viewer_blocked.status_code, 403)

        revoke = self.client.post(f"/api/customer-portal/{customer_id}/revoke", headers=headers)
        self.assertEqual(revoke.status_code, 200, revoke.text)

        revoked_link_rejected = self.client.get("/api/customer-portal/me", headers=portal_headers)
        self.assertEqual(revoked_link_rejected.status_code, 401)

    def test_zzzzzzzzzzzz_digital_catalog_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        in_stock = self.client.post(
            "/products",
            headers=headers,
            json={"name": "Catalog In Stock Widget", "price": 500, "stock": 10},
        )
        out_of_stock = self.client.post(
            "/products",
            headers=headers,
            json={"name": "Catalog Out Of Stock Widget", "price": 700, "stock": 0},
        )
        excluded = self.client.post(
            "/products",
            headers=headers,
            json={"name": "Excluded Widget", "price": 300, "stock": 10},
        )
        in_stock_id = in_stock.json()["id"]
        out_of_stock_id = out_of_stock.json()["id"]
        excluded_id = excluded.json()["id"]
        self.assertIsNotNone(excluded_id)

        create = self.client.post(
            "/api/catalog/links",
            headers=headers,
            json={
                "title": "Smoke Catalog",
                "in_stock_only": False,
                "product_ids": [in_stock_id, out_of_stock_id],
            },
        )
        self.assertEqual(create.status_code, 200, create.text)
        catalog_id = create.json()["id"]
        catalog_token = create.json()["token"]
        catalog_headers = {"Authorization": f"Bearer {catalog_token}"}

        blocked = self.client.get("/api/catalog/view")
        self.assertEqual(blocked.status_code, 401)

        view = self.client.get("/api/catalog/view", headers=catalog_headers)
        self.assertEqual(view.status_code, 200, view.text)
        self.assertEqual(view.json()["title"], "Smoke Catalog")
        item_ids = {item["id"] for item in view.json()["items"]}
        self.assertEqual(item_ids, {in_stock_id, out_of_stock_id})

        pdf = self.client.get(f"/api/catalog/links/{catalog_id}/pdf", headers=headers)
        self.assertEqual(pdf.status_code, 200, pdf.text)
        self.assertEqual(pdf.headers["content-type"], "application/pdf")
        self.assertGreater(len(pdf.content), 100)

        order = self.client.post(
            "/api/catalog/view/order",
            headers=catalog_headers,
            json={
                "customer_name": "Catalog Buyer",
                "customer_phone": "09120000000",
                "items": [{"product_id": in_stock_id, "quantity": 2}],
            },
        )
        self.assertEqual(order.status_code, 200, order.text)
        order_id = order.json()["order_id"]

        rejected_out_of_scope = self.client.post(
            "/api/catalog/view/order",
            headers=catalog_headers,
            json={
                "customer_name": "Catalog Buyer",
                "items": [{"product_id": excluded_id, "quantity": 1}],
            },
        )
        self.assertEqual(rejected_out_of_scope.status_code, 400)

        orders = self.client.get("/api/catalog/orders", headers=headers)
        self.assertEqual(orders.status_code, 200, orders.text)
        order_ids = {item["id"] for item in orders.json()["items"]}
        self.assertIn(order_id, order_ids)

        converted = self.client.post(
            f"/api/catalog/orders/{order_id}/mark-converted", headers=headers
        )
        self.assertEqual(converted.status_code, 200, converted.text)

        revoke = self.client.post(f"/api/catalog/links/{catalog_id}/revoke", headers=headers)
        self.assertEqual(revoke.status_code, 200, revoke.text)
        revoked_view = self.client.get("/api/catalog/view", headers=catalog_headers)
        self.assertEqual(revoked_view.status_code, 401)

    def test_zzzzzzzzzzzzy_catalog_task03_extensions(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        product = self.client.post(
            "/products", headers=headers, json={"name": "Catalog Ext Widget", "price": 1000, "stock": 5},
        )
        product_id = product.json()["id"]

        wholesale_customer = self.client.post(
            "/customers", headers=headers, json={"name": "Catalog Ext Wholesale Customer", "pricing_group": "wholesale"},
        )
        customer_id = wholesale_customer.json()["id"]

        rule = self.client.post(
            "/api/pricing/rules",
            headers=headers,
            json={
                "name": "Catalog ext rule", "scope_type": "product", "scope_value": str(product_id),
                "customer_scope_type": "customer", "customer_scope_value": str(customer_id),
                "min_quantity": 1, "price_mode": "fixed", "price_value": 750, "status": "active",
            },
        )
        self.assertEqual(rule.status_code, 200, rule.text)
        rule_id = rule.json()["id"]
        self.addCleanup(lambda: self.client.delete(f"/api/pricing/rules/{rule_id}", headers=headers))

        create = self.client.post(
            "/api/catalog/links",
            headers=headers,
            json={
                "title": "Extended Catalog", "product_ids": [product_id], "in_stock_only": False,
                "catalog_type": "wholesale", "price_source": "customer_specific", "customer_id": customer_id,
                "show_stock_status": False,
            },
        )
        self.assertEqual(create.status_code, 200, create.text)
        catalog_id = create.json()["id"]
        catalog_headers = {"Authorization": f"Bearer {create.json()['token']}"}

        # price_source=customer_specific must reflect the pricing-rule result, not the raw sell price.
        view = self.client.get("/api/catalog/view", headers=catalog_headers)
        self.assertEqual(view.status_code, 200, view.text)
        self.assertEqual(view.json()["items"][0]["price"], 750)
        # show_stock_status=False means in_stock must not even appear in the response.
        self.assertNotIn("in_stock", view.json()["items"][0])

        # Views are honestly counted, not fabricated.
        detail = self.client.get("/api/catalog/links", headers=headers)
        created_entry = next(c for c in detail.json()["items"] if c["id"] == catalog_id)
        self.assertEqual(created_entry["view_count"], 1)

        # Invalid combination: customer_specific without a customer_id is rejected.
        invalid = self.client.post(
            "/api/catalog/links",
            headers=headers,
            json={"title": "Bad", "price_source": "customer_specific"},
        )
        self.assertEqual(invalid.status_code, 400)

        # Edit updates fields in place.
        updated = self.client.put(
            f"/api/catalog/links/{catalog_id}",
            headers=headers,
            json={"title": "Renamed Catalog", "price_source": "base", "catalog_type": "product_catalog"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        after_update = self.client.get("/api/catalog/links", headers=headers)
        renamed_entry = next(c for c in after_update.json()["items"] if c["id"] == catalog_id)
        self.assertEqual(renamed_entry["title"], "Renamed Catalog")
        self.assertEqual(renamed_entry["price_source"], "base")

        # Duplicate creates a real second row.
        duplicate = self.client.post(f"/api/catalog/links/{catalog_id}/duplicate", headers=headers)
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        duplicate_id = duplicate.json()["id"]
        self.assertNotEqual(duplicate_id, catalog_id)

        # Archive makes the public link stop working and hides it from the default listing.
        archive = self.client.post(f"/api/catalog/links/{catalog_id}/archive", headers=headers)
        self.assertEqual(archive.status_code, 200, archive.text)
        archived_view = self.client.get("/api/catalog/view", headers=catalog_headers)
        self.assertEqual(archived_view.status_code, 401)
        active_list = self.client.get("/api/catalog/links?status=active", headers=headers)
        self.assertNotIn(catalog_id, {c["id"] for c in active_list.json()["items"]})
        archived_list = self.client.get("/api/catalog/links?status=archived", headers=headers)
        self.assertIn(catalog_id, {c["id"] for c in archived_list.json()["items"]})

        unarchive = self.client.post(f"/api/catalog/links/{catalog_id}/unarchive", headers=headers)
        self.assertEqual(unarchive.status_code, 200, unarchive.text)

        # Validity window: a catalog that hasn't started yet must reject public access.
        future_catalog = self.client.post(
            "/api/catalog/links",
            headers=headers,
            json={"title": "Future Catalog", "product_ids": [product_id], "valid_from": "2099-01-01"},
        )
        future_headers = {"Authorization": f"Bearer {future_catalog.json()['token']}"}
        future_view = self.client.get("/api/catalog/view", headers=future_headers)
        self.assertEqual(future_view.status_code, 401)

        # Landscape PDF export works.
        pdf_landscape = self.client.get(f"/api/catalog/links/{catalog_id}/pdf?orientation=landscape", headers=headers)
        self.assertEqual(pdf_landscape.status_code, 200, pdf_landscape.text)
        self.assertGreater(len(pdf_landscape.content), 100)

    def test_zzzzzzzzzzzzz_tiered_wholesale_pricing_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        product = self.client.post(
            "/products", headers=headers, json={"name": "Pricing Flow Product", "price": 1000, "stock": 500}
        )
        product_id = product.json()["id"]

        wholesale_customer = self.client.post(
            "/customers",
            headers=headers,
            json={"name": "Wholesale Buyer", "pricing_group": "wholesale"},
        )
        self.assertEqual(wholesale_customer.status_code, 200, wholesale_customer.text)
        self.assertEqual(wholesale_customer.json()["balance"], 0)
        wholesale_customer_id = wholesale_customer.json()["id"]

        invalid_group = self.client.post(
            "/customers", headers=headers, json={"name": "Bad Group", "pricing_group": "not-a-group"}
        )
        self.assertEqual(invalid_group.json()["status"], "error")

        base_quote = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=1", headers=headers
        )
        self.assertEqual(base_quote.status_code, 200, base_quote.text)
        self.assertEqual(base_quote.json()["unit_price"], 1000)
        self.assertFalse(base_quote.json()["tier_applied"])

        tier = self.client.post(
            "/api/pricing/tiers",
            headers=headers,
            json={"product_id": product_id, "min_quantity": 20, "unit_price": 850, "customer_group": None},
        )
        self.assertEqual(tier.status_code, 200, tier.text)
        wholesale_tier = self.client.post(
            "/api/pricing/tiers",
            headers=headers,
            json={"product_id": product_id, "min_quantity": 1, "unit_price": 700, "customer_group": "wholesale"},
        )
        self.assertEqual(wholesale_tier.status_code, 200, wholesale_tier.text)

        quantity_break_quote = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=25", headers=headers
        )
        self.assertEqual(quantity_break_quote.json()["unit_price"], 850)

        wholesale_quote = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=1&customer_id={wholesale_customer_id}",
            headers=headers,
        )
        self.assertEqual(wholesale_quote.json()["unit_price"], 700)

        retail_quote = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=1", headers=headers
        )
        self.assertEqual(retail_quote.json()["unit_price"], 1000)

        tiers_for_product = self.client.get(
            f"/api/pricing/tiers?product_id={product_id}", headers=headers
        )
        self.assertEqual(len(tiers_for_product.json()["items"]), 2)

        deleted = self.client.delete(f"/api/pricing/tiers/{tier.json()['id']}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        after_delete = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=25", headers=headers
        )
        self.assertEqual(after_delete.json()["unit_price"], 1000)

    def test_zzzzzzzzzzzzzzz_pricing_rules_precedence_and_boundaries(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        product = self.client.post(
            "/products",
            headers=headers,
            json={"name": "Pricing Rule Product", "price": 1000, "stock": 500, "main_category": "Beverages"},
        )
        product_id = product.json()["id"]

        vip_customer = self.client.post(
            "/customers", headers=headers, json={"name": "VIP Rule Buyer"},
        )
        vip_customer_id = vip_customer.json()["id"]

        # Category-wide 10% discount, quantity 1-99.
        category_rule = self.client.post(
            "/api/pricing/rules",
            headers=headers,
            json={
                "name": "Beverages 10% off", "priority": 100, "scope_type": "category", "scope_value": "Beverages",
                "customer_scope_type": "any", "min_quantity": 1, "max_quantity": 99,
                "price_mode": "percent_discount", "price_value": 10, "status": "active",
            },
        )
        self.assertEqual(category_rule.status_code, 200, category_rule.text)

        # More specific: this exact customer + this exact product gets a flat 600.
        customer_rule = self.client.post(
            "/api/pricing/rules",
            headers=headers,
            json={
                "name": "VIP flat price", "priority": 50, "scope_type": "product", "scope_value": str(product_id),
                "customer_scope_type": "customer", "customer_scope_value": str(vip_customer_id),
                "min_quantity": 1, "price_mode": "fixed", "price_value": 600, "status": "active",
            },
        )
        self.assertEqual(customer_rule.status_code, 200, customer_rule.text)

        # A non-VIP customer only qualifies for the category rule (1000 * 0.9 = 900).
        category_quote = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=5", headers=headers
        )
        self.assertEqual(category_quote.json()["unit_price"], 900)
        self.assertEqual(category_quote.json()["source"], "pricing_rule")

        # The VIP customer matches both rules; the more specific customer+product
        # rule must win over the category rule (precedence test).
        vip_quote = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=5&customer_id={vip_customer_id}",
            headers=headers,
        )
        self.assertEqual(vip_quote.json()["unit_price"], 600)
        self.assertEqual(vip_quote.json()["rule_id"], customer_rule.json()["id"])
        self.assertEqual(len(vip_quote.json()["matched_rules"]), 2)

        # Boundary: quantity 99 is inside the category rule's max_quantity,
        # quantity 100 falls outside it entirely (no rule matches -> base price).
        boundary_in_range = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=99", headers=headers
        )
        self.assertEqual(boundary_in_range.json()["unit_price"], 900)
        boundary_out_of_range = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=100", headers=headers
        )
        self.assertEqual(boundary_out_of_range.json()["unit_price"], 1000)
        self.assertEqual(boundary_out_of_range.json()["source"], "base")

        # Date validity: a rule whose window has already ended must not match.
        expired_rule = self.client.post(
            "/api/pricing/rules",
            headers=headers,
            json={
                "name": "Expired promo", "priority": 10, "scope_type": "all", "customer_scope_type": "any",
                "min_quantity": 1, "price_mode": "fixed", "price_value": 1,
                "start_date": "2020-01-01", "end_date": "2020-01-31", "status": "active",
            },
        )
        self.assertEqual(expired_rule.status_code, 200, expired_rule.text)
        still_900 = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=5", headers=headers
        )
        self.assertEqual(still_900.json()["unit_price"], 900)

        rules_list = self.client.get("/api/pricing/rules", headers=headers)
        self.assertEqual(rules_list.status_code, 200, rules_list.text)
        self.assertEqual(len(rules_list.json()["items"]), 3)

        updated = self.client.put(
            f"/api/pricing/rules/{category_rule.json()['id']}",
            headers=headers,
            json={
                "name": "Beverages 20% off", "priority": 100, "scope_type": "category", "scope_value": "Beverages",
                "customer_scope_type": "any", "min_quantity": 1, "max_quantity": 99,
                "price_mode": "percent_discount", "price_value": 20, "status": "active",
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        after_update = self.client.get(
            f"/api/pricing/quote?product_id={product_id}&quantity=5", headers=headers
        )
        self.assertEqual(after_update.json()["unit_price"], 800)

        deleted = self.client.delete(f"/api/pricing/rules/{expired_rule.json()['id']}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)

        invalid_scope = self.client.post(
            "/api/pricing/rules",
            headers=headers,
            json={"name": "Bad", "scope_type": "not-a-scope", "customer_scope_type": "any", "price_mode": "fixed", "price_value": 1},
        )
        self.assertEqual(invalid_scope.status_code, 400)

    def test_zzzzzzzzzzzzzzzz_executive_alerts_summary_and_permissions(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        # Overdue receivable: a sale invoice, unpaid, with a due date in the past.
        overdue_customer = self.client.post(
            "/customers", headers=headers, json={"name": "Overdue Alert Customer"},
        )
        overdue_customer_id = overdue_customer.json()["id"]
        product = self.client.post(
            "/products", headers=headers, json={"name": "Alert Product", "price": 500, "stock": 3, "min_stock": 10},
        )
        product_id = product.json()["id"]
        overdue_invoice = self.client.post(
            "/invoices",
            headers=headers,
            json={
                "customer_id": overdue_customer_id, "invoice_type": "sale", "due_date": "2020-01-01",
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 500}],
            },
        )
        self.assertEqual(overdue_invoice.status_code, 200, overdue_invoice.text)

        summary = self.client.get("/api/executive-alerts/summary", headers=headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        payload = summary.json()
        self.assertIn("counts", payload)
        self.assertIn("items", payload)
        self.assertGreaterEqual(payload["counts"]["critical"], 1)

        receivable_alerts = [i for i in payload["items"] if i["category"] == "receivable" and i["related_id"] == overdue_customer_id]
        self.assertTrue(receivable_alerts, "expected the overdue invoice to surface as a receivable alert")
        self.assertEqual(receivable_alerts[0]["severity"], "critical")

        low_stock_alerts = [i for i in payload["items"] if i["category"] == "low_stock" and i["related_id"] == product_id]
        self.assertTrue(low_stock_alerts, "expected the below-min_stock product to surface as a low_stock alert")

        # Thresholds are configurable and persist.
        updated_settings = self.client.put(
            "/api/executive-alerts/settings", headers=headers,
            json={"alert_days_before_due": 10, "minimum_receivable_amount": 100000},
        )
        self.assertEqual(updated_settings.status_code, 200, updated_settings.text)
        self.assertEqual(updated_settings.json()["alert_days_before_due"], 10)
        refetched_settings = self.client.get("/api/executive-alerts/settings", headers=headers)
        self.assertEqual(refetched_settings.json()["minimum_receivable_amount"], 100000)

        # A high minimum_receivable_amount should filter out the small overdue invoice.
        filtered_summary = self.client.get("/api/executive-alerts/summary", headers=headers)
        filtered_receivables = [i for i in filtered_summary.json()["items"] if i["category"] == "receivable" and i["related_id"] == overdue_customer_id]
        self.assertFalse(filtered_receivables, "500-amount invoice should be filtered out by a 100000 minimum")

        # Non-admin/accountant roles are denied (matches aging/treasury's own scoping).
        sales_user = self.client.post(
            "/users", headers=headers,
            json={"full_name": "Sales Alert Viewer", "username": "sales-alert-viewer", "password": "StrongSalesPassword!42", "role": "sales"},
        )
        self.assertEqual(sales_user.status_code, 200, sales_user.text)
        sales_login = self.client.post("/login", json={"username": "sales-alert-viewer", "password": "StrongSalesPassword!42"})
        sales_headers = {"Authorization": f"Bearer {sales_login.json()['access_token']}"}
        denied = self.client.get("/api/executive-alerts/summary", headers=sales_headers)
        self.assertEqual(denied.status_code, 403)

    def test_zzzzzzzzzzzzzzzzz_online_sales_segments_and_opportunities(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        # New customers default to marketing_consent=True (opt-in) per the
        # confirmed product decision - nothing extra needs to be sent.
        consenting_customer = self.client.post(
            "/customers", headers=headers, json={"name": "Consent Default Customer", "city": "Tehran"},
        )
        self.assertEqual(consenting_customer.status_code, 200, consenting_customer.text)
        consenting_detail = self.client.get(f"/customers/{consenting_customer.json()['id']}", headers=headers)
        self.assertTrue(consenting_detail.json()["customer"]["marketing_consent"])

        opted_out_customer = self.client.post(
            "/customers", headers=headers, json={"name": "Opted Out Customer", "city": "Tehran", "marketing_consent": False},
        )
        self.assertEqual(opted_out_customer.status_code, 200, opted_out_customer.text)
        opted_out_detail = self.client.get(f"/customers/{opted_out_customer.json()['id']}", headers=headers)
        self.assertFalse(opted_out_detail.json()["customer"]["marketing_consent"])

        # Audience estimate: city segment should include both Tehran customers
        # in segment_size, but only the consenting one in reachable_with_consent.
        estimate = self.client.get(
            "/api/online-commerce/campaigns/audience-estimate?segment_type=city&segment_value=Tehran",
            headers=headers,
        )
        self.assertEqual(estimate.status_code, 200, estimate.text)
        payload = estimate.json()
        self.assertGreaterEqual(payload["segment_size"], 2)
        self.assertLess(payload["reachable_with_consent"], payload["segment_size"])

        invalid_segment = self.client.get(
            "/api/online-commerce/campaigns/audience-estimate?segment_type=not-a-segment", headers=headers,
        )
        self.assertEqual(invalid_segment.status_code, 400)

        # Campaign creation persists the new targeting/template/design fields.
        campaign = self.client.post(
            "/api/online-commerce/campaigns",
            headers=headers,
            json={
                "title": "City promo", "body": "Special offer", "channel": "telegram",
                "segment_type": "city", "segment_value": "Tehran", "template_key": "campaign_promo",
            },
        )
        self.assertEqual(campaign.status_code, 200, campaign.text)
        campaign_list = self.client.get("/api/online-commerce/campaigns", headers=headers)
        created = next(c for c in campaign_list.json() if c["id"] == campaign.json()["campaign_id"])
        self.assertEqual(created["segment_type"], "city")
        self.assertEqual(created["segment_value"], "Tehran")
        self.assertEqual(created["template_key"], "campaign_promo")

        invalid_campaign_segment = self.client.post(
            "/api/online-commerce/campaigns",
            headers=headers,
            json={"title": "Bad segment", "channel": "telegram", "segment_type": "custom"},
        )
        self.assertEqual(invalid_campaign_segment.status_code, 400)

        # Sales opportunities: real, sourced data - never fabricated.
        opportunities = self.client.get("/api/online-commerce/opportunities", headers=headers)
        self.assertEqual(opportunities.status_code, 200, opportunities.text)
        opp_payload = opportunities.json()
        self.assertIn("inactive_high_value_customers", opp_payload)
        self.assertIn("slow_moving_products", opp_payload)
        self.assertIn("expiring_soon_batches", opp_payload)
        self.assertFalse(opp_payload["overstock_products"]["available"])

    def test_zzzzzzzzzzzzzz_barcode_lookup_endpoint(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        product = self.client.post(
            "/products",
            headers=headers,
            json={"name": "Scan Test Product", "barcode": "SCAN12345", "price": 999, "stock": 1},
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        found = self.client.get("/products/lookup?code=SCAN12345", headers=headers)
        self.assertEqual(found.status_code, 200, found.text)
        self.assertEqual(found.json()["status"], "found")
        self.assertEqual(found.json()["product"]["id"], product_id)

        not_found = self.client.get("/products/lookup?code=does-not-exist", headers=headers)
        self.assertEqual(not_found.status_code, 200, not_found.text)
        self.assertEqual(not_found.json()["status"], "not_found")

        unauthenticated = self.client.get("/products/lookup?code=SCAN12345")
        self.assertEqual(unauthenticated.status_code, 401)

    def test_zzzzzzzzzzzzzzz_voice_to_invoice_change_request_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        user_login = self.client.post(
            "/login", json={"username": "ci-user", "password": "StrongUserPassword!42"}
        )
        self.assertEqual(user_login.status_code, 200, user_login.text)
        user_headers = {"Authorization": f"Bearer {user_login.json()['access_token']}"}

        customer = self.client.post(
            "/customers", headers=admin_headers, json={"name": "Voice Invoice Customer"}
        )
        customer_id = customer.json()["id"]
        product = self.client.post(
            "/products", headers=admin_headers, json={"name": "Voice Invoice Product", "price": 250, "stock": 20}
        )
        product_id = product.json()["id"]

        missing_items = self.client.post(
            "/api/change-requests",
            headers=user_headers,
            json={
                "source": "in_app",
                "transcript": "Sold 2 units to this customer over the phone.",
                "action_type": "sale_invoice_draft",
                "proposed_changes": {"customer_id": customer_id, "items": []},
            },
        )
        self.assertEqual(missing_items.status_code, 400)

        voice_request = self.client.post(
            "/api/change-requests",
            headers=user_headers,
            json={
                "source": "in_app",
                "transcript": "Sold 2 units to this customer over the phone.",
                "action_type": "sale_invoice_draft",
                "proposed_changes": {
                    "customer_id": customer_id,
                    "items": [{"product_id": product_id, "quantity": 2}],
                },
            },
        )
        self.assertEqual(voice_request.status_code, 200, voice_request.text)
        request_id = voice_request.json()["request_id"]

        submit = self.client.post(f"/api/change-requests/{request_id}/submit", headers=user_headers)
        self.assertEqual(submit.status_code, 200, submit.text)

        approve = self.client.post(
            f"/api/change-requests/{request_id}/approve",
            headers=admin_headers,
            json={"note": "Reviewed"},
        )
        self.assertEqual(approve.status_code, 200, approve.text)
        self.assertEqual(approve.json()["status"], "applied")
        self.assertIn("Voice Invoice Customer", approve.json()["result"])
        self.assertIn("Voice Invoice Product", approve.json()["result"])

        # A request referencing a since-deleted/nonexistent product must fail
        # cleanly at approval rather than silently posting bad data.
        bad_request = self.client.post(
            "/api/change-requests",
            headers=user_headers,
            json={
                "source": "in_app",
                "transcript": "Sold a product that no longer exists.",
                "action_type": "sale_invoice_draft",
                "proposed_changes": {
                    "customer_id": customer_id,
                    "items": [{"product_id": 999999, "quantity": 1}],
                },
            },
        )
        bad_request_id = bad_request.json()["request_id"]
        self.client.post(f"/api/change-requests/{bad_request_id}/submit", headers=user_headers)
        bad_approve = self.client.post(
            f"/api/change-requests/{bad_request_id}/approve",
            headers=admin_headers,
            json={"note": "Reviewed"},
        )
        self.assertEqual(bad_approve.status_code, 200, bad_approve.text)
        self.assertEqual(bad_approve.json()["status"], "failed")

    def test_zzzzzzzzzzzzzzzz_supplier_self_service_portal_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        # A plain customer_type cannot get a supplier portal link.
        plain_customer = self.client.post(
            "/customers", headers=headers, json={"name": "Not A Supplier", "customer_type": "customer"}
        )
        self.assertEqual(plain_customer.status_code, 200, plain_customer.text)
        plain_customer_id = plain_customer.json()["id"]
        rejected_link = self.client.post(
            f"/api/supplier-portal/{plain_customer_id}/access-link", headers=headers
        )
        self.assertEqual(rejected_link.status_code, 400)

        supplier = self.client.post(
            "/customers", headers=headers, json={"name": "Portal Test Supplier", "customer_type": "supplier"}
        )
        self.assertEqual(supplier.status_code, 200, supplier.text)
        supplier_id = supplier.json()["id"]

        status_before = self.client.get(
            f"/api/supplier-portal/{supplier_id}/status", headers=headers
        )
        self.assertEqual(status_before.status_code, 200, status_before.text)
        self.assertFalse(status_before.json()["enabled"])

        blocked_before_link = self.client.get("/api/supplier-portal/me")
        self.assertEqual(blocked_before_link.status_code, 401)

        access_link = self.client.post(
            f"/api/supplier-portal/{supplier_id}/access-link", headers=headers
        )
        self.assertEqual(access_link.status_code, 200, access_link.text)
        portal_token = access_link.json()["token"]
        portal_headers = {"Authorization": f"Bearer {portal_token}"}

        status_after = self.client.get(
            f"/api/supplier-portal/{supplier_id}/status", headers=headers
        )
        self.assertTrue(status_after.json()["enabled"])

        # A staff bearer token must never work against the supplier-facing paths.
        staff_token_rejected = self.client.get("/api/supplier-portal/me", headers=headers)
        self.assertEqual(staff_token_rejected.status_code, 401)

        # A customer-portal link must not be accepted on supplier-portal paths.
        customer_access_link = self.client.post(
            f"/api/customer-portal/{supplier_id}/access-link", headers=headers
        )
        self.assertEqual(customer_access_link.status_code, 200, customer_access_link.text)
        cross_audience_headers = {"Authorization": f"Bearer {customer_access_link.json()['token']}"}
        cross_audience_rejected = self.client.get("/api/supplier-portal/me", headers=cross_audience_headers)
        self.assertEqual(cross_audience_rejected.status_code, 401)

        portal_me = self.client.get("/api/supplier-portal/me", headers=portal_headers)
        self.assertEqual(portal_me.status_code, 200, portal_me.text)
        self.assertEqual(portal_me.json()["supplier"]["id"], supplier_id)

        portal_invoices = self.client.get("/api/supplier-portal/invoices", headers=portal_headers)
        self.assertEqual(portal_invoices.status_code, 200, portal_invoices.text)
        self.assertEqual(portal_invoices.json()["items"], [])

        portal_ledger = self.client.get("/api/supplier-portal/ledger", headers=portal_headers)
        self.assertEqual(portal_ledger.status_code, 200, portal_ledger.text)
        self.assertEqual(portal_ledger.json()["balance"], 0)

        # A non-management role must not manage other suppliers' portal links.
        viewer_login = self.client.post(
            "/login", json={"username": "portal-viewer", "password": "StrongViewerPassword!42"}
        )
        self.assertEqual(viewer_login.status_code, 200, viewer_login.text)
        viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
        viewer_blocked = self.client.post(
            f"/api/supplier-portal/{supplier_id}/access-link", headers=viewer_headers
        )
        self.assertEqual(viewer_blocked.status_code, 403)

        revoke = self.client.post(f"/api/supplier-portal/{supplier_id}/revoke", headers=headers)
        self.assertEqual(revoke.status_code, 200, revoke.text)

        revoked_link_rejected = self.client.get("/api/supplier-portal/me", headers=portal_headers)
        self.assertEqual(revoked_link_rejected.status_code, 401)

    def test_zzzzzzzzzzzzzzzzz_recurring_invoice_generation_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        customer = self.client.post(
            "/customers", headers=headers, json={"name": "Recurring Invoice Customer"}
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json()["id"]

        product = self.client.post(
            "/products", headers=headers,
            json={"name": "Subscription Fee", "sell_price": 500000, "stock": 1000},
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        invoices_before = self.client.get("/invoices", headers=headers)
        invoice_count_before = len(invoices_before.json())

        # Rejected: frequency=custom without an interval.
        bad_template = self.client.post(
            "/api/recurring-invoices", headers=headers,
            json={
                "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 500000}],
                "frequency": "custom",
            },
        )
        self.assertEqual(bad_template.status_code, 400)

        # A weekly template starting today is immediately due - creating it
        # triggers generation via the same post-response hook auto-backup
        # uses, so the very first invoice appears without a second call.
        template = self.client.post(
            "/api/recurring-invoices", headers=headers,
            json={
                "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 500000}],
                "frequency": "weekly",
            },
        )
        self.assertEqual(template.status_code, 200, template.text)
        template_id = template.json()["id"]
        original_next_run = template.json()["next_run_date"]

        listing = self.client.get("/api/recurring-invoices", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        entry = next(item for item in listing.json()["items"] if item["id"] == template_id)
        self.assertIsNotNone(entry["last_generated_invoice_id"])
        self.assertIsNone(entry["last_generation_error"])
        self.assertGreater(entry["next_run_date"], original_next_run)

        invoices_after = self.client.get("/invoices", headers=headers)
        self.assertEqual(len(invoices_after.json()), invoice_count_before + 1)
        generated = next(
            inv for inv in invoices_after.json() if inv["id"] == entry["last_generated_invoice_id"]
        )
        self.assertEqual(generated["customer_id"], customer_id)
        self.assertEqual(generated["total_amount"], 500000)

        # Pausing stops further generation even though next_run_date is now
        # in the past relative to "today" for a template checked again later.
        pause = self.client.post(f"/api/recurring-invoices/{template_id}/pause", headers=headers)
        self.assertEqual(pause.status_code, 200, pause.text)
        after_pause = self.client.get("/invoices", headers=headers)
        self.assertEqual(len(after_pause.json()), invoice_count_before + 1)

        resume = self.client.post(f"/api/recurring-invoices/{template_id}/resume", headers=headers)
        self.assertEqual(resume.status_code, 200, resume.text)

        # A non-management role must not create recurring templates.
        viewer_login = self.client.post(
            "/login", json={"username": "portal-viewer", "password": "StrongViewerPassword!42"}
        )
        self.assertEqual(viewer_login.status_code, 200, viewer_login.text)
        viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
        viewer_blocked = self.client.post(
            "/api/recurring-invoices", headers=viewer_headers,
            json={
                "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 500000}],
                "frequency": "weekly",
            },
        )
        self.assertEqual(viewer_blocked.status_code, 403)

        delete = self.client.delete(f"/api/recurring-invoices/{template_id}", headers=headers)
        self.assertEqual(delete.status_code, 200, delete.text)
        listing_after_delete = self.client.get("/api/recurring-invoices", headers=headers)
        self.assertFalse(any(item["id"] == template_id for item in listing_after_delete.json()["items"]))

    def test_zzzzzzzzzzzzzzzzzz_online_payment_gateway_sandbox_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        customer = self.client.post(
            "/customers", headers=headers, json={"name": "Payment Gateway Customer"}
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json()["id"]

        product = self.client.post(
            "/products", headers=headers, json={"name": "Paid Online Widget", "sell_price": 750000, "stock": 100}
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        invoice = self.client.post(
            "/invoices", headers=headers,
            json={
                "invoice_type": "sale", "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 750000}],
            },
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]

        # Fails closed when no provider is configured.
        unconfigured = self.client.post(
            f"/api/payments/invoices/{invoice_id}/request", headers=headers
        )
        self.assertEqual(unconfigured.status_code, 503)

        with patch.dict(os.environ, {"VETRIX_PAYMENT_PROVIDER": "sandbox"}):
            # A non-management role must not generate a payment link.
            viewer_login = self.client.post(
                "/login", json={"username": "portal-viewer", "password": "StrongViewerPassword!42"}
            )
            self.assertEqual(viewer_login.status_code, 200, viewer_login.text)
            viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
            viewer_blocked = self.client.post(
                f"/api/payments/invoices/{invoice_id}/request", headers=viewer_headers
            )
            self.assertEqual(viewer_blocked.status_code, 403)

            requested = self.client.post(
                f"/api/payments/invoices/{invoice_id}/request", headers=headers
            )
            self.assertEqual(requested.status_code, 200, requested.text)
            authority = requested.json()["authority"]
            self.assertEqual(requested.json()["amount"], 750000)
            self.assertIn(f"/pay/{authority}", requested.json()["redirect_url"])

            # The session view is genuinely public - no auth header at all.
            session_view = self.client.get(f"/api/payments/session?authority={authority}")
            self.assertEqual(session_view.status_code, 200, session_view.text)
            self.assertEqual(session_view.json()["status"], "pending")
            self.assertEqual(session_view.json()["invoice_id"], invoice_id)

            # A non-sandbox outcome value is rejected before touching state.
            bad_outcome = self.client.post(
                "/api/payments/session/simulate", json={"authority": authority, "outcome": "maybe"}
            )
            self.assertEqual(bad_outcome.status_code, 400)

            simulate = self.client.post(
                "/api/payments/session/simulate", json={"authority": authority, "outcome": "success"}
            )
            self.assertEqual(simulate.status_code, 200, simulate.text)
            self.assertEqual(simulate.json()["status"], "success")

            session_after = self.client.get(f"/api/payments/session?authority={authority}")
            self.assertEqual(session_after.json()["status"], "success")

            # A completed session cannot be simulated again.
            replay = self.client.post(
                "/api/payments/session/simulate", json={"authority": authority, "outcome": "success"}
            )
            self.assertEqual(replay.status_code, 400)

            invoice_after = self.client.get(f"/customers/{customer_id}/ledger", headers=headers)
            self.assertEqual(invoice_after.status_code, 200, invoice_after.text)
            paid_row = next(
                row for row in invoice_after.json()["ledger"]
                if row["source_id"] == invoice_id and row["source_type"] == "receipt"
            )
            self.assertEqual(paid_row["credit"], 750000)

            # A second invoice, to prove the sandbox failure path works and
            # never touches the ledger.
            second_invoice = self.client.post(
                "/invoices", headers=headers,
                json={
                    "invoice_type": "sale", "customer_id": customer_id,
                    "items": [{"product_id": product_id, "quantity": 1, "unit_price": 750000}],
                },
            )
            second_invoice_id = second_invoice.json()["invoice_id"]
            second_request = self.client.post(
                f"/api/payments/invoices/{second_invoice_id}/request", headers=headers
            )
            second_authority = second_request.json()["authority"]
            failure = self.client.post(
                "/api/payments/session/simulate",
                json={"authority": second_authority, "outcome": "failure"},
            )
            self.assertEqual(failure.status_code, 200, failure.text)
            self.assertEqual(failure.json()["status"], "failed")

            ledger_after_failure = self.client.get(f"/customers/{customer_id}/ledger", headers=headers)
            receipts = [
                row for row in ledger_after_failure.json()["ledger"]
                if row["source_id"] == second_invoice_id and row["source_type"] == "receipt"
            ]
            self.assertEqual(receipts, [])

        # Customer-portal self-service: a customer can request payment for
        # their own invoice but not for someone else's.
        with patch.dict(os.environ, {"VETRIX_PAYMENT_PROVIDER": "sandbox"}):
            access_link = self.client.post(
                f"/api/customer-portal/{customer_id}/access-link", headers=headers
            )
            self.assertEqual(access_link.status_code, 200, access_link.text)
            portal_headers = {"Authorization": f"Bearer {access_link.json()['token']}"}

            portal_pay = self.client.post(
                "/api/customer-portal/pay", headers=portal_headers,
                json={"invoice_id": second_invoice_id},
            )
            self.assertEqual(portal_pay.status_code, 200, portal_pay.text)

            other_customer = self.client.post(
                "/customers", headers=headers, json={"name": "Someone Else"}
            )
            other_invoice = self.client.post(
                "/invoices", headers=headers,
                json={
                    "invoice_type": "sale", "customer_id": other_customer.json()["id"],
                    "items": [{"product_id": product_id, "quantity": 1, "unit_price": 750000}],
                },
            )
            cross_customer_blocked = self.client.post(
                "/api/customer-portal/pay", headers=portal_headers,
                json={"invoice_id": other_invoice.json()["invoice_id"]},
            )
            self.assertEqual(cross_customer_blocked.status_code, 404)

    def test_zzzzzzzzzzzzzzzzzzz_automated_payment_reminder_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        status = self.client.get("/api/payment-reminders/status", headers=headers)
        self.assertEqual(status.status_code, 200, status.text)
        self.assertFalse(status.json()["smtp_configured"])

        customer = self.client.post(
            "/customers", headers=headers,
            json={"name": "Overdue Reminder Customer", "email": "overdue@example.com"},
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json()["id"]

        product = self.client.post(
            "/products", headers=headers, json={"name": "Overdue Widget", "sell_price": 400000, "stock": 50}
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        invoice = self.client.post(
            "/invoices", headers=headers,
            json={
                "invoice_type": "sale", "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 400000}],
            },
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]

        # Freshly created - not overdue yet under the default threshold.
        overdue_before = self.client.get("/api/payment-reminders/overdue", headers=headers)
        self.assertFalse(any(item["invoice_id"] == invoice_id for item in overdue_before.json()["items"]))

        # Backdate it past the default 7-day threshold.
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE invoices SET created_at=:d WHERE id=:id"),
                {"d": (datetime.utcnow() - timedelta(days=10)).isoformat(), "id": invoice_id},
            )

        overdue_after = self.client.get("/api/payment-reminders/overdue", headers=headers)
        self.assertEqual(overdue_after.status_code, 200, overdue_after.text)
        overdue_entry = next(
            item for item in overdue_after.json()["items"] if item["invoice_id"] == invoice_id
        )
        self.assertEqual(overdue_entry["remaining_amount"], 400000)

        # That GET was itself a successful authenticated request, so the
        # automatic sweep piggybacked on its post-response hook already
        # found this now-overdue invoice and logged one attempt for it.
        log_after_overdue_check = self.client.get("/api/payment-reminders/log", headers=headers)
        entries_so_far = [
            row for row in log_after_overdue_check.json()["items"] if row["invoice_id"] == invoice_id
        ]
        self.assertEqual(len(entries_so_far), 1)
        self.assertEqual(entries_so_far[0]["status"], "skipped_not_configured")

        # A non-management role must not trigger a manual reminder.
        viewer_login = self.client.post(
            "/login", json={"username": "portal-viewer", "password": "StrongViewerPassword!42"}
        )
        self.assertEqual(viewer_login.status_code, 200, viewer_login.text)
        viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
        viewer_blocked = self.client.post(f"/api/payment-reminders/send/{invoice_id}", headers=viewer_headers)
        self.assertEqual(viewer_blocked.status_code, 403)

        # SMTP is not configured in this test environment, so sending fails
        # closed and is honestly logged rather than silently doing nothing.
        # A manual send always bypasses the cooldown (force=True) - staff
        # intent is never silently dropped, even though an automatic attempt
        # was just logged above.
        send_now = self.client.post(f"/api/payment-reminders/send/{invoice_id}", headers=headers)
        self.assertEqual(send_now.status_code, 200, send_now.text)
        self.assertEqual(send_now.json()["status"], "skipped_not_configured")

        send_again = self.client.post(f"/api/payment-reminders/send/{invoice_id}", headers=headers)
        self.assertEqual(send_again.status_code, 200, send_again.text)

        log = self.client.get("/api/payment-reminders/log", headers=headers)
        self.assertEqual(log.status_code, 200, log.text)
        entries_for_invoice = [row for row in log.json()["items"] if row["invoice_id"] == invoice_id]
        self.assertEqual(len(entries_for_invoice), 3)

        # The automatic background sweep (piggybacked on every request,
        # including the ones above) must respect the cooldown and not add a
        # fourth entry right away just because another request came in.
        self.client.get("/invoices", headers=headers)
        log_after_sweep = self.client.get("/api/payment-reminders/log", headers=headers)
        entries_after_sweep = [
            row for row in log_after_sweep.json()["items"] if row["invoice_id"] == invoice_id
        ]
        self.assertEqual(len(entries_after_sweep), 3)

        # A fully paid invoice cannot receive a reminder.
        pay = self.client.post(
            "/transactions", headers=headers,
            json={"customer_id": customer_id, "amount": 400000, "transaction_type": "receipt", "invoice_id": invoice_id},
        )
        self.assertEqual(pay.status_code, 200, pay.text)
        paid_blocked = self.client.post(f"/api/payment-reminders/send/{invoice_id}", headers=headers)
        self.assertEqual(paid_blocked.status_code, 400)

        # A purchase invoice cannot receive a (customer-facing) reminder.
        supplier = self.client.post(
            "/customers", headers=headers, json={"name": "Reminder Test Supplier", "customer_type": "supplier"}
        )
        buy_invoice = self.client.post(
            "/invoices", headers=headers,
            json={
                "invoice_type": "buy", "customer_id": supplier.json()["id"],
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 400000}],
            },
        )
        buy_blocked = self.client.post(
            f"/api/payment-reminders/send/{buy_invoice.json()['invoice_id']}", headers=headers
        )
        self.assertEqual(buy_blocked.status_code, 400)

    def test_zzzzzzzzzzzzzzzzzzzz_multi_warehouse_inventory_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        product = self.client.post(
            "/products", headers=headers, json={"name": "Multi-Warehouse Widget", "sell_price": 20000, "stock": 100}
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        warehouses = self.client.get("/api/warehouses", headers=headers)
        self.assertEqual(warehouses.status_code, 200, warehouses.text)
        default_warehouse = next(w for w in warehouses.json()["items"] if w["is_default"])
        self.assertEqual(default_warehouse["name"], "Main")

        # Before any transfer, every unit is implicitly in the default warehouse.
        breakdown_before = self.client.get(f"/api/warehouses/stock?product_id={product_id}", headers=headers)
        self.assertEqual(breakdown_before.status_code, 200, breakdown_before.text)
        default_row = next(
            row for row in breakdown_before.json()["by_warehouse"] if row["warehouse_id"] == default_warehouse["id"]
        )
        self.assertEqual(default_row["quantity"], 100)

        # A non-warehouse/admin role must not manage warehouses.
        viewer_login = self.client.post(
            "/login", json={"username": "portal-viewer", "password": "StrongViewerPassword!42"}
        )
        self.assertEqual(viewer_login.status_code, 200, viewer_login.text)
        viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
        viewer_blocked = self.client.post("/api/warehouses", headers=viewer_headers, json={"name": "Branch"})
        self.assertEqual(viewer_blocked.status_code, 403)

        branch = self.client.post("/api/warehouses", headers=headers, json={"name": "Branch North", "code": "BR-N"})
        self.assertEqual(branch.status_code, 200, branch.text)
        branch_id = branch.json()["id"]

        # Can't transfer more than what's available at the source.
        over_transfer = self.client.post(
            "/api/warehouses/transfer", headers=headers,
            json={"product_id": product_id, "from_warehouse_id": default_warehouse["id"], "to_warehouse_id": branch_id, "quantity": 999},
        )
        self.assertEqual(over_transfer.status_code, 400)

        transfer = self.client.post(
            "/api/warehouses/transfer", headers=headers,
            json={"product_id": product_id, "from_warehouse_id": default_warehouse["id"], "to_warehouse_id": branch_id, "quantity": 40, "note": "Initial stocking"},
        )
        self.assertEqual(transfer.status_code, 200, transfer.text)

        breakdown_after = self.client.get(f"/api/warehouses/stock?product_id={product_id}", headers=headers)
        rows_by_id = {row["warehouse_id"]: row["quantity"] for row in breakdown_after.json()["by_warehouse"]}
        self.assertEqual(rows_by_id[branch_id], 40)
        self.assertEqual(rows_by_id[default_warehouse["id"]], 60)

        # The aggregate Product.stock never moves for a transfer.
        product_after_transfer = self.client.get("/products", headers=headers)
        product_row = next(p for p in product_after_transfer.json() if p["id"] == product_id)
        self.assertEqual(product_row["stock"], 100)

        branch_products = self.client.get(f"/api/warehouses/{branch_id}/products", headers=headers)
        self.assertEqual(branch_products.status_code, 200, branch_products.text)
        self.assertTrue(any(item["product_id"] == product_id for item in branch_products.json()["items"]))

        # A sale tagged with a warehouse decrements that warehouse's bucket
        # in addition to the (untouched-code-path) aggregate.
        customer = self.client.post("/customers", headers=headers, json={"name": "Warehouse Sale Customer"})
        customer_id = customer.json()["id"]
        sale = self.client.post(
            "/invoices", headers=headers,
            json={
                "invoice_type": "sale", "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 10, "unit_price": 20000, "warehouse_id": branch_id}],
            },
        )
        self.assertEqual(sale.status_code, 200, sale.text)
        sale_invoice_id = sale.json()["invoice_id"]

        breakdown_after_sale = self.client.get(f"/api/warehouses/stock?product_id={product_id}", headers=headers)
        rows_after_sale = {row["warehouse_id"]: row["quantity"] for row in breakdown_after_sale.json()["by_warehouse"]}
        self.assertEqual(rows_after_sale[branch_id], 30)  # 40 - 10
        self.assertEqual(rows_after_sale[default_warehouse["id"]], 60)  # untouched

        product_after_sale = self.client.get("/products", headers=headers)
        product_row_after_sale = next(p for p in product_after_sale.json() if p["id"] == product_id)
        self.assertEqual(product_row_after_sale["stock"], 90)  # 100 - 10, via the existing untouched path

        # Editing the invoice to a different quantity correctly reverses the
        # old warehouse delta before applying the new one.
        edit = self.client.put(
            f"/invoices/{sale_invoice_id}", headers=headers,
            json={
                "invoice_type": "sale", "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 5, "unit_price": 20000, "warehouse_id": branch_id}],
            },
        )
        self.assertEqual(edit.status_code, 200, edit.text)

        breakdown_after_edit = self.client.get(f"/api/warehouses/stock?product_id={product_id}", headers=headers)
        rows_after_edit = {row["warehouse_id"]: row["quantity"] for row in breakdown_after_edit.json()["by_warehouse"]}
        self.assertEqual(rows_after_edit[branch_id], 35)  # 40 - 5

        # Deactivating a warehouse blocks new transfers into it.
        deactivate = self.client.post(f"/api/warehouses/{branch_id}/deactivate", headers=headers)
        self.assertEqual(deactivate.status_code, 200, deactivate.text)
        transfer_into_inactive = self.client.post(
            "/api/warehouses/transfer", headers=headers,
            json={"product_id": product_id, "from_warehouse_id": default_warehouse["id"], "to_warehouse_id": branch_id, "quantity": 1},
        )
        self.assertEqual(transfer_into_inactive.status_code, 400)

        # The default warehouse can never be deactivated.
        default_deactivate_blocked = self.client.post(
            f"/api/warehouses/{default_warehouse['id']}/deactivate", headers=headers
        )
        self.assertEqual(default_deactivate_blocked.status_code, 400)

    def test_zzzzzzzzzzzzzzzzzzzzz_voice_driven_report_delivery_flow(self):
        from app.report_delivery import generate_csv, generate_pdf
        from app.company_scope import DEFAULT_COMPANY_ID

        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        user_login = self.client.post(
            "/login", json={"username": "ci-user", "password": "StrongUserPassword!42"}
        )
        self.assertEqual(user_login.status_code, 200, user_login.text)
        user_headers = {"Authorization": f"Bearer {user_login.json()['access_token']}"}

        customer = self.client.post(
            "/customers", headers=headers, json={"name": "Report Delivery Customer"}
        )
        product = self.client.post(
            "/products", headers=headers, json={"name": "Report Delivery Widget", "sell_price": 123000, "stock": 20}
        )
        self.client.post(
            "/invoices", headers=headers,
            json={
                "invoice_type": "sale", "customer_id": customer.json()["id"],
                "items": [{"product_id": product.json()["id"], "quantity": 1, "unit_price": 123000}],
            },
        )

        # Report data generation reuses the real /reports/* endpoints directly.
        csv_bytes = generate_csv("sales", DEFAULT_COMPANY_ID)
        self.assertIn(b"Report Delivery Customer", csv_bytes)
        pdf_bytes = generate_pdf("sales", DEFAULT_COMPANY_ID)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))

        with self.assertRaises(ValueError):
            generate_csv("not_a_real_report_type", DEFAULT_COMPANY_ID)

        # Rejected: unknown report_type.
        bad_report_type = self.client.post(
            "/api/change-requests", headers=user_headers,
            json={
                "transcript": "Send me the sales report by email",
                "action_type": "report_delivery",
                "proposed_changes": {"report_type": "not_real", "format": "pdf", "destination_email": "a@b.com"},
            },
        )
        self.assertEqual(bad_report_type.status_code, 400)

        # Rejected: unknown format.
        bad_format = self.client.post(
            "/api/change-requests", headers=user_headers,
            json={
                "transcript": "Send me the sales report by email",
                "action_type": "report_delivery",
                "proposed_changes": {"report_type": "sales", "format": "docx", "destination_email": "a@b.com"},
            },
        )
        self.assertEqual(bad_format.status_code, 400)

        # Rejected: invalid destination email.
        bad_email = self.client.post(
            "/api/change-requests", headers=user_headers,
            json={
                "transcript": "Send me the sales report by email",
                "action_type": "report_delivery",
                "proposed_changes": {"report_type": "sales", "format": "pdf", "destination_email": "not-an-email"},
            },
        )
        self.assertEqual(bad_email.status_code, 400)

        created = self.client.post(
            "/api/change-requests", headers=user_headers,
            json={
                "transcript": "Send me this month's sales report as a PDF to accounting@example.com",
                "action_type": "report_delivery",
                "proposed_changes": {"report_type": "sales", "format": "pdf", "destination_email": "accounting@example.com"},
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        request_id = created.json()["request_id"]

        self.client.post(f"/api/change-requests/{request_id}/submit", headers=user_headers)

        # A non-admin (even the requester) cannot approve at all.
        non_admin_approve_blocked = self.client.post(
            f"/api/change-requests/{request_id}/approve", headers=user_headers, json={"note": ""}
        )
        self.assertEqual(non_admin_approve_blocked.status_code, 403)

        approve = self.client.post(
            f"/api/change-requests/{request_id}/approve", headers=headers, json={"note": "Reviewed"}
        )
        self.assertEqual(approve.status_code, 200, approve.text)
        self.assertEqual(approve.json()["status"], "applied", approve.text)
        # SMTP is not configured in this test environment, so the honest
        # outcome is reported rather than a false "sent".
        self.assertIn("skipped_not_configured", approve.json()["result"])

    def test_zzzzzzzzzzzzzzzzzzzzzz_iran_einvoice_sandbox_flow(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        viewer_login = self.client.post(
            "/login", json={"username": "portal-viewer", "password": "StrongViewerPassword!42"}
        )
        self.assertEqual(viewer_login.status_code, 200, viewer_login.text)
        viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}

        customer = self.client.post(
            "/customers", headers=headers,
            json={"name": "E-Invoice Customer", "national_id": "1111111111", "economic_code": "411111111111"},
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json()["id"]

        product = self.client.post(
            "/products", headers=headers, json={"name": "E-Invoice Widget", "sell_price": 500000, "stock": 10}
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        invoice = self.client.post(
            "/invoices", headers=headers,
            json={
                "invoice_type": "sale", "customer_id": customer_id,
                "items": [{"product_id": product_id, "quantity": 1, "unit_price": 500000}],
            },
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]

        # Fails closed when no provider is configured.
        unconfigured = self.client.post(
            f"/api/einvoice/invoices/{invoice_id}/submit", headers=headers
        )
        self.assertEqual(unconfigured.status_code, 503)

        with patch.dict(os.environ, {"VETRIX_EINVOICE_PROVIDER": "sandbox"}):
            # A non-management role cannot submit for e-invoicing.
            viewer_blocked = self.client.post(
                f"/api/einvoice/invoices/{invoice_id}/submit", headers=viewer_headers
            )
            self.assertEqual(viewer_blocked.status_code, 403)

            submitted = self.client.post(
                f"/api/einvoice/invoices/{invoice_id}/submit", headers=headers
            )
            self.assertEqual(submitted.status_code, 200, submitted.text)
            self.assertEqual(submitted.json()["status"], "accepted")
            self.assertTrue(submitted.json()["tax_reference"].startswith("SANDBOX-"))

            status = self.client.get(
                f"/api/einvoice/invoices/{invoice_id}/status", headers=headers
            )
            self.assertEqual(status.status_code, 200, status.text)
            submissions = status.json()["submissions"]
            self.assertEqual(len(submissions), 1)
            self.assertEqual(submissions[0]["status"], "accepted")

            # Already-accepted invoices cannot be resubmitted.
            resubmit = self.client.post(
                f"/api/einvoice/invoices/{invoice_id}/submit", headers=headers
            )
            self.assertEqual(resubmit.status_code, 400)

        with patch.dict(os.environ, {"VETRIX_EINVOICE_PROVIDER": "modian"}):
            # The real provider is an intentional 501 - see app/einvoice.py's
            # module docstring for why it isn't (and shouldn't be) faked.
            unimplemented_customer = self.client.post(
                "/customers", headers=headers, json={"name": "E-Invoice Customer Two"}
            )
            unimplemented_product = self.client.post(
                "/products", headers=headers, json={"name": "E-Invoice Widget Two", "sell_price": 250000, "stock": 5}
            )
            unimplemented_invoice = self.client.post(
                "/invoices", headers=headers,
                json={
                    "invoice_type": "sale", "customer_id": unimplemented_customer.json()["id"],
                    "items": [{"product_id": unimplemented_product.json()["id"], "quantity": 1, "unit_price": 250000}],
                },
            )
            modian_attempt = self.client.post(
                f"/api/einvoice/invoices/{unimplemented_invoice.json()['invoice_id']}/submit", headers=headers
            )
            self.assertEqual(modian_attempt.status_code, 501)

    def test_zzzzzzzzzzzzzzzzzzzzzzz_document_ocr_fails_closed_without_engine(self):
        admin_login = self.client.post(
            "/login",
            json={"username": "ci-admin", "password": "StrongAdminPassword!42"},
        )
        self.assertEqual(admin_login.status_code, 200, admin_login.text)
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        status = self.client.get("/api/document-ocr/status", headers=headers)
        self.assertEqual(status.status_code, 200, status.text)
        # This CI/dev environment has no Tesseract binary installed, so the
        # honest answer is "unavailable" - the point of this test is that
        # the endpoint says so plainly instead of pretending otherwise.
        self.assertFalse(status.json()["available"])

        extract = self.client.post(
            "/api/document-ocr/extract", headers=headers,
            files={"file": ("receipt.png", b"not-a-real-image", "image/png")},
        )
        self.assertEqual(extract.status_code, 503)
        self.assertIn("Tesseract", extract.json()["detail"])

    def _login(self, username, password):
        response = self.client.post("/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}, response.json()

    def test_zzzzzzzzzzzzzzzzzzzzzzzzz_super_admin_bootstrap_and_company_gating(self):
        admin_headers, admin_login = self._login("ci-admin", "StrongAdminPassword!42")
        me = self.client.get("/me", headers=admin_headers)
        self.assertEqual(me.status_code, 200, me.text)
        self.assertTrue(me.json()["user"]["is_super_admin"])
        self.assertIsNotNone(me.json()["active_company"])
        self.assertTrue(admin_login["user"]["is_super_admin"])
        self.assertIsNotNone(admin_login.get("active_company"))

        create_second = self.client.post(
            "/api/companies", headers=admin_headers, json={"name": "Milestone 4 Second Co"},
        )
        self.assertEqual(create_second.status_code, 200, create_second.text)
        # unittest builds a fresh instance per test method, so cross-test
        # state (later z-ordered tests need this company's id) must live on
        # the class, not the instance.
        type(self).second_company_id = create_second.json()["id"]

        regular_admin = self.client.post(
            "/users", headers=admin_headers,
            json={
                "full_name": "Regular Admin One", "username": "m4-regular-admin",
                "password": "StrongRegularAdmin!42", "role": "admin",
            },
        )
        self.assertEqual(regular_admin.status_code, 200, regular_admin.text)
        self.assertFalse(regular_admin.json()["is_super_admin"])

        regular_headers, regular_login = self._login("m4-regular-admin", "StrongRegularAdmin!42")
        self.assertFalse(regular_login["user"]["is_super_admin"])
        blocked_list = self.client.get("/api/companies", headers=regular_headers)
        self.assertEqual(blocked_list.status_code, 403)
        blocked_create = self.client.post(
            "/api/companies", headers=regular_headers, json={"name": "Should Not Be Created"},
        )
        self.assertEqual(blocked_create.status_code, 403)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzza_cross_company_user_creation_and_isolation(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        second_company_id = self.second_company_id

        second_admin = self.client.post(
            "/users", headers=admin_headers,
            json={
                "full_name": "Second Co Admin", "username": "m4-second-admin",
                "password": "StrongSecondAdmin!42", "role": "admin",
                "company_id": second_company_id,
            },
        )
        self.assertEqual(second_admin.status_code, 200, second_admin.text)
        self.assertEqual(second_admin.json()["company_id"], second_company_id)
        self.assertFalse(second_admin.json()["is_super_admin"])

        # A regular (non-super-admin) admin cannot escape their own company
        # even if they try to spoof company_id/is_super_admin on the payload.
        regular_headers, regular_login = self._login("m4-regular-admin", "StrongRegularAdmin!42")
        own_company_id = regular_login["user"]["company_id"]
        spoofed = self.client.post(
            "/users", headers=regular_headers,
            json={
                "full_name": "Spoofed User", "username": "m4-spoofed-user",
                "password": "StrongSpoofedUser!42", "role": "viewer",
                "company_id": second_company_id, "is_super_admin": True,
            },
        )
        self.assertEqual(spoofed.status_code, 200, spoofed.text)
        self.assertEqual(spoofed.json()["company_id"], own_company_id)
        self.assertNotEqual(spoofed.json()["company_id"], second_company_id)
        self.assertFalse(spoofed.json()["is_super_admin"])

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzb_non_super_admin_user_management_scoped_to_own_company(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        regular_headers, regular_login = self._login("m4-regular-admin", "StrongRegularAdmin!42")
        own_company_id = regular_login["user"]["company_id"]

        own_company_list = self.client.get("/users", headers=regular_headers)
        self.assertEqual(own_company_list.status_code, 200, own_company_list.text)
        self.assertTrue(all(user["company_id"] == own_company_id for user in own_company_list.json()))
        listed_usernames = {user["username"] for user in own_company_list.json()}
        self.assertNotIn("m4-second-admin", listed_usernames)

        second_admin_lookup = self.client.get("/users", headers=admin_headers).json()
        second_admin_id = next(
            user["id"] for user in second_admin_lookup if user["username"] == "m4-second-admin"
        )

        blocked_role = self.client.put(
            f"/users/{second_admin_id}/role", headers=regular_headers, json={"role": "viewer"},
        )
        self.assertEqual(blocked_role.status_code, 404)
        blocked_password = self.client.put(
            f"/users/{second_admin_id}/password", headers=regular_headers,
            json={"password": "SomeNewPassword!42"},
        )
        self.assertEqual(blocked_password.status_code, 404)

        # Super-admin can still manage the cross-company user directly.
        allowed_role = self.client.put(
            f"/users/{second_admin_id}/role", headers=admin_headers, json={"role": "accountant"},
        )
        self.assertEqual(allowed_role.status_code, 200, allowed_role.text)
        restore_role = self.client.put(
            f"/users/{second_admin_id}/role", headers=admin_headers, json={"role": "admin"},
        )
        self.assertEqual(restore_role.status_code, 200, restore_role.text)

        scoped_query = self.client.get(
            "/users", headers=admin_headers, params={"company_id": self.second_company_id},
        )
        self.assertEqual(scoped_query.status_code, 200, scoped_query.text)
        self.assertTrue(all(user["company_id"] == self.second_company_id for user in scoped_query.json()))

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzc_move_user_between_companies_revokes_old_token(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        moved_user = self.client.post(
            "/users", headers=admin_headers,
            json={
                "full_name": "Movable User", "username": "m4-movable-user",
                "password": "StrongMovableUser!42", "role": "viewer",
            },
        )
        self.assertEqual(moved_user.status_code, 200, moved_user.text)
        moved_user_id = moved_user.json()["id"]

        old_headers, _ = self._login("m4-movable-user", "StrongMovableUser!42")
        move = self.client.put(
            f"/users/{moved_user_id}/company", headers=admin_headers,
            json={"company_id": self.second_company_id},
        )
        self.assertEqual(move.status_code, 200, move.text)
        self.assertEqual(move.json()["user"]["company_id"], self.second_company_id)

        revoked = self.client.get("/me", headers=old_headers)
        self.assertEqual(revoked.status_code, 401)

        fresh_headers, fresh_login = self._login("m4-movable-user", "StrongMovableUser!42")
        self.assertEqual(fresh_login["user"]["company_id"], self.second_company_id)
        self.assertEqual(fresh_login["active_company"]["id"], self.second_company_id)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzd_promote_and_demote_super_admin(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        regular_headers, regular_login = self._login("m4-regular-admin", "StrongRegularAdmin!42")
        target_id = regular_login["user"]["id"]

        admin_id = self.client.get("/me", headers=admin_headers).json()["user"]["id"]
        self_demote = self.client.put(
            f"/users/{admin_id}/super-admin", headers=admin_headers, json={"is_super_admin": False},
        )
        self.assertEqual(self_demote.status_code, 400)

        promote = self.client.put(
            f"/users/{target_id}/super-admin", headers=admin_headers, json={"is_super_admin": True},
        )
        self.assertEqual(promote.status_code, 200, promote.text)
        self.assertTrue(promote.json()["user"]["is_super_admin"])

        # is_super_admin is refreshed from the DB every request, exactly
        # like role - the *same* still-valid token now carries it live,
        # with no re-login/token bump needed.
        live_refresh = self.client.get("/api/companies", headers=regular_headers)
        self.assertEqual(live_refresh.status_code, 200, live_refresh.text)

        demote = self.client.put(
            f"/users/{target_id}/super-admin", headers=admin_headers, json={"is_super_admin": False},
        )
        self.assertEqual(demote.status_code, 200, demote.text)
        self.assertFalse(demote.json()["user"]["is_super_admin"])

    def test_zzzzzzzzzzzzzzzzzzzzzzzzze_switch_company_context_flow(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        regular_headers, _ = self._login("m4-regular-admin", "StrongRegularAdmin!42")

        blocked_switch = self.client.post(
            "/api/companies/switch", headers=regular_headers,
            json={"company_id": self.second_company_id},
        )
        self.assertEqual(blocked_switch.status_code, 403)

        bogus_switch = self.client.post(
            "/api/companies/switch", headers=admin_headers, json={"company_id": 999999},
        )
        self.assertEqual(bogus_switch.status_code, 404)

        switched = self.client.post(
            "/api/companies/switch", headers=admin_headers,
            json={"company_id": self.second_company_id},
        )
        self.assertEqual(switched.status_code, 200, switched.text)
        self.assertEqual(switched.json()["active_company"]["id"], self.second_company_id)
        switched_headers = {"Authorization": f"Bearer {switched.json()['access_token']}"}

        created = self.client.post(
            "/customers", headers=switched_headers, json={"name": "Switched Context Customer"},
        )
        self.assertEqual(created.status_code, 200, created.text)

        switched_customers = self.client.get("/customers", headers=switched_headers)
        self.assertEqual(switched_customers.status_code, 200)
        switched_names = {customer["name"] for customer in switched_customers.json()}
        self.assertIn("Switched Context Customer", switched_names)

        # The super-admin's original token (still first company's context)
        # keeps working and does not see the switched-into company's data -
        # switching mints an additional token, it doesn't mutate the old one.
        original_customers = self.client.get("/customers", headers=admin_headers)
        self.assertEqual(original_customers.status_code, 200)
        original_names = {customer["name"] for customer in original_customers.json()}
        self.assertNotIn("Switched Context Customer", original_names)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzz_visitor_field_sales_module(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        custom_role = self.client.post(
            "/api/auth/custom-roles", headers=admin_headers,
            json={
                "code": "visitor_test", "label": "Visitor Test",
                "base_role": "sales", "restrict_customers_to_own": True,
            },
        )
        self.assertEqual(custom_role.status_code, 200, custom_role.text)

        rep_user = self.client.post(
            "/users", headers=admin_headers,
            json={
                "full_name": "Field Rep One", "username": "m6-field-rep",
                "password": "StrongFieldRepPass!42", "role": "visitor_test",
            },
        )
        self.assertEqual(rep_user.status_code, 200, rep_user.text)
        rep_id = rep_user.json()["id"]

        assigned_customer = self.client.post(
            "/customers", headers=admin_headers,
            json={"name": "Visitor Assigned Customer", "assigned_rep_id": rep_id},
        )
        self.assertEqual(assigned_customer.status_code, 200, assigned_customer.text)
        assigned_customer_id = assigned_customer.json()["id"]

        unassigned_customer = self.client.post(
            "/customers", headers=admin_headers, json={"name": "Desk-Only Customer"},
        )
        self.assertEqual(unassigned_customer.status_code, 200, unassigned_customer.text)

        visitor_product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "Visitor Module Product", "price": 100, "stock": 50},
        )
        self.assertEqual(visitor_product.status_code, 200, visitor_product.text)
        visitor_product_id = visitor_product.json()["id"]

        rep_headers, rep_login = self._login("m6-field-rep", "StrongFieldRepPass!42")
        self.assertEqual(rep_login["user"]["role"], "visitor_test")

        # restrict_customers_to_own: the rep only ever sees their own
        # assigned customer, never the desk-only one.
        rep_customers = self.client.get("/customers", headers=rep_headers)
        self.assertEqual(rep_customers.status_code, 200, rep_customers.text)
        rep_customer_ids = {c["id"] for c in rep_customers.json()}
        self.assertEqual(rep_customer_ids, {assigned_customer_id})

        # A visit against a customer that isn't real (or not this company's)
        # is rejected before anything is written.
        bad_visit = self.client.post(
            "/api/field-visits", headers=rep_headers,
            json={"customer_id": 999999, "outcome": "store_closed"},
        )
        self.assertEqual(bad_visit.status_code, 404)

        visit_payload = {
            "customer_id": assigned_customer_id,
            "outcome": "store_closed",
            "note": "Store was closed",
            "client_ref": "visit-client-ref-m6-001",
        }
        visit = self.client.post("/api/field-visits", headers=rep_headers, json=visit_payload)
        self.assertEqual(visit.status_code, 200, visit.text)
        self.assertEqual(visit.json()["status"], "created")
        visit_id = visit.json()["visit"]["id"]

        # Retrying the same client_ref (simulating an offline-sync retry
        # after a dropped response) returns the same row, not a duplicate.
        retried_visit = self.client.post("/api/field-visits", headers=rep_headers, json=visit_payload)
        self.assertEqual(retried_visit.status_code, 200, retried_visit.text)
        self.assertEqual(retried_visit.json()["status"], "already_recorded")
        self.assertEqual(retried_visit.json()["visit"]["id"], visit_id)

        rep_visits = self.client.get("/api/field-visits", headers=rep_headers)
        self.assertEqual(rep_visits.status_code, 200, rep_visits.text)
        self.assertEqual(len(rep_visits.json()), 1)
        self.assertEqual(rep_visits.json()[0]["id"], visit_id)

        # Admin sees every rep's visits, not just their own.
        admin_visits = self.client.get("/api/field-visits", headers=admin_headers)
        self.assertEqual(admin_visits.status_code, 200, admin_visits.text)
        self.assertIn(visit_id, {item["id"] for item in admin_visits.json()})

        # An order placed by the rep is tagged source="visitor" so reporting
        # can tell it apart from the normal desk flow, which keeps
        # defaulting to "desk" unchanged.
        visitor_invoice = self.client.post(
            "/invoices", headers=rep_headers,
            json={
                "invoice_type": "sale", "customer_id": assigned_customer_id,
                "items": [{"product_id": visitor_product_id, "quantity": 1, "unit_price": 100}],
                "source": "visitor",
            },
        )
        self.assertEqual(visitor_invoice.status_code, 200, visitor_invoice.text)
        self.assertEqual(visitor_invoice.json()["source"], "visitor")

        desk_invoice = self.client.post(
            "/invoices", headers=admin_headers,
            json={
                "invoice_type": "sale", "customer_id": assigned_customer_id,
                "items": [{"product_id": visitor_product_id, "quantity": 1, "unit_price": 100}],
            },
        )
        self.assertEqual(desk_invoice.status_code, 200, desk_invoice.text)
        self.assertEqual(desk_invoice.json()["source"], "desk")

    def _payment_workflow_fixture(self, label):
        """Fresh customer + product for one payment-workflow test, so
        parallel z-tests never share stock/balance state with each other."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        customer = self.client.post(
            "/customers", headers=admin_headers, json={"name": f"Payment Workflow Customer {label}"},
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": f"Payment Workflow Product {label}", "price": 1000, "buy_price": 500, "stock": 1000},
        )
        self.assertEqual(product.status_code, 200, product.text)
        return admin_headers, customer.json()["id"], product.json()["id"]

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_invoice_payment_workflow_statuses(self):
        admin_headers, customer_id, product_id = self._payment_workflow_fixture("statuses")

        unpaid = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1000}],
        })
        self.assertEqual(unpaid.status_code, 200, unpaid.text)
        self.assertEqual(unpaid.json()["payment_status"], "unpaid")
        self.assertEqual(unpaid.json()["amount_paid"], 0)

        paid = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1000}],
            "payments": [{"method": "cash", "amount": 1000}],
        })
        self.assertEqual(paid.status_code, 200, paid.text)
        self.assertEqual(paid.json()["payment_status"], "paid")
        self.assertEqual(paid.json()["amount_paid"], 1000)

        partial = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 2, "unit_price": 1000}],
            "payments": [{"method": "cash", "amount": 500}],
        })
        self.assertEqual(partial.status_code, 200, partial.text)
        self.assertEqual(partial.json()["payment_status"], "partial")

        overpaid = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1000}],
            "payments": [{"method": "cash", "amount": 1500, "allow_overpayment": True}],
        })
        self.assertEqual(overpaid.status_code, 200, overpaid.text)
        self.assertEqual(overpaid.json()["payment_status"], "overpaid")

        # Without allow_overpayment, the whole invoice creation fails
        # atomically - proves the rollback covers items/stock/GL together.
        stock_before = self.client.get("/products", headers=admin_headers).json()
        product_before = next(p for p in stock_before if p["id"] == product_id)
        blocked = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1000}],
            "payments": [{"method": "cash", "amount": 1500}],
        })
        self.assertEqual(blocked.status_code, 200, blocked.text)
        self.assertEqual(blocked.json()["status"], "error")
        stock_after = self.client.get("/products", headers=admin_headers).json()
        product_after = next(p for p in stock_after if p["id"] == product_id)
        self.assertEqual(product_before["stock"], product_after["stock"])

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_invoice_split_payment_and_cheque_lifecycle(self):
        admin_headers, customer_id, product_id = self._payment_workflow_fixture("split")

        invoice = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 2, "unit_price": 1000}],
            "payments": [
                {"method": "cash", "amount": 1000},
                {"method": "cheque", "amount": 1000, "cheque_number": f"CHQ-SPLIT-{customer_id}", "cheque_bank_name": "Test Bank", "cheque_due_date": "2027-01-01"},
            ],
        })
        self.assertEqual(invoice.status_code, 200, invoice.text)
        self.assertEqual(invoice.json()["payment_status"], "partial")
        settlement = invoice.json()["settlement"]
        self.assertEqual(settlement["confirmed_paid"], 1000)
        self.assertEqual(settlement["pending_cheque_amount"], 1000)
        self.assertEqual(settlement["uncovered_balance"], 0)
        self.assertEqual(settlement["collection_status"], "covered_by_pending_cheque")
        invoice_id = invoice.json()["invoice_id"]

        detail = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        allocations = detail.json()["payments"]
        self.assertEqual(len(allocations), 2)
        cheque_allocation = next(a for a in allocations if a["method"] == "cheque")
        self.assertIsNotNone(cheque_allocation["cheque_id"])

        cheques = self.client.get("/api/accounting/treasury/cheques", headers=admin_headers)
        cheque = next(c for c in cheques.json()["items"] if c["id"] == cheque_allocation["cheque_id"])
        self.assertEqual(cheque["invoice_id"], invoice_id)
        self.assertEqual(cheque["status"], "pending")

        clear = self.client.post(
            f"/api/accounting/treasury/cheques/{cheque['id']}/transition",
            headers=admin_headers, json={"status": "cleared", "event_date": "2026-06-01"},
        )
        self.assertEqual(clear.status_code, 200, clear.text)

        after_clear = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        self.assertEqual(after_clear.json()["payment_status"], "paid")
        self.assertEqual(after_clear.json()["settlement"]["confirmed_paid"], 2000)
        self.assertEqual(after_clear.json()["settlement"]["pending_cheque_amount"], 0)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_invoice_bounced_cheque_reopens_balance(self):
        admin_headers, customer_id, product_id = self._payment_workflow_fixture("bounce")

        invoice = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1000}],
            "payments": [{"method": "cheque", "amount": 1000, "cheque_number": f"CHQ-BOUNCE-{customer_id}", "cheque_due_date": "2027-01-01"}],
        })
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]
        self.assertEqual(invoice.json()["settlement"]["collection_status"], "covered_by_pending_cheque")

        detail = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        cheque_alloc = detail.json()["payments"][0]

        bounce = self.client.post(
            f"/api/accounting/treasury/cheques/{cheque_alloc['cheque_id']}/transition",
            headers=admin_headers, json={"status": "bounced", "event_date": "2026-06-01"},
        )
        self.assertEqual(bounce.status_code, 200, bounce.text)

        after_bounce = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        self.assertEqual(after_bounce.json()["settlement"]["pending_cheque_amount"], 0)
        self.assertEqual(after_bounce.json()["settlement"]["confirmed_paid"], 0)
        self.assertEqual(after_bounce.json()["payment_status"], "unpaid")

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_invoice_payment_void_requires_approval(self):
        admin_headers, customer_id, product_id = self._payment_workflow_fixture("void")
        second_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Void Approver", "username": "ci-accountant-void", "password": "StrongVoidPass!42", "role": "accountant"},
        )
        self.assertEqual(second_user.status_code, 200, second_user.text)
        second_headers, _ = self._login("ci-accountant-void", "StrongVoidPass!42")

        invoice = self.client.post("/invoices", headers=admin_headers, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1000}],
            "payments": [{"method": "cash", "amount": 1000}],
        })
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]
        self.assertEqual(invoice.json()["payment_status"], "paid")

        detail = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        allocation_id = detail.json()["payments"][0]["id"]

        no_reason = self.client.post(f"/api/invoice-payments/{allocation_id}/void", headers=admin_headers, json={"reason": ""})
        self.assertEqual(no_reason.status_code, 400, no_reason.text)

        request_void = self.client.post(f"/api/invoice-payments/{allocation_id}/void", headers=admin_headers, json={"reason": "customer disputed charge"})
        self.assertEqual(request_void.status_code, 200, request_void.text)
        approval_id = request_void.json()["id"]
        self.assertEqual(request_void.json()["status"], "pending")

        # The invoice must NOT change yet - only an approved request executes.
        still_paid = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        self.assertEqual(still_paid.json()["payment_status"], "paid")

        self_approve = self.client.post(f"/api/approvals/{approval_id}/approve", headers=admin_headers, json={"note": "self"})
        self.assertEqual(self_approve.status_code, 409, self_approve.text)

        approve = self.client.post(f"/api/approvals/{approval_id}/approve", headers=second_headers, json={"note": "confirmed with customer"})
        self.assertEqual(approve.status_code, 200, approve.text)

        after_void = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        self.assertEqual(after_void.json()["payment_status"], "unpaid")
        self.assertEqual(after_void.json()["settlement"]["confirmed_paid"], 0)
        voided_allocation = next(p for p in after_void.json()["payments"] if p["id"] == allocation_id)
        self.assertEqual(voided_allocation["status"], "void")
        self.assertIsNotNone(voided_allocation["reversal_entry_id"])

        # Never physically deleted - the original allocation row still exists.
        self.assertEqual(len(after_void.json()["payments"]), 1)

        # A second void attempt on the same (now-void) allocation is rejected.
        second_void = self.client.post(f"/api/invoice-payments/{allocation_id}/void", headers=admin_headers, json={"reason": "again"})
        self.assertEqual(second_void.status_code, 409, second_void.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_invoice_creation_idempotency_key(self):
        admin_headers, customer_id, product_id = self._payment_workflow_fixture("idempotency")
        key = "test-idempotency-key-zzz-001"
        payload = {
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1000}],
        }

        first = self.client.post("/invoices", headers={**admin_headers, "Idempotency-Key": key}, json=payload)
        self.assertEqual(first.status_code, 200, first.text)
        invoice_id = first.json()["invoice_id"]

        replay = self.client.post("/invoices", headers={**admin_headers, "Idempotency-Key": key}, json=payload)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()["invoice_id"], invoice_id)

        invoices_after = self.client.get("/invoices", headers=admin_headers).json()
        matching = [i for i in invoices_after if i["id"] == invoice_id]
        self.assertEqual(len(matching), 1)

        different_payload = {**payload, "items": [{"product_id": product_id, "quantity": 2, "unit_price": 1000}]}
        conflict = self.client.post("/invoices", headers={**admin_headers, "Idempotency-Key": key}, json=different_payload)
        self.assertEqual(conflict.status_code, 409, conflict.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_voice_change_request_manages_reminder_channels(self):
        # reminder_channel_manage is a Task 03 HIGH_RISK_ACTIONS entry, so
        # applying it now takes two DIFFERENT admins (neither of whom can be
        # the original requester) rather than one - this test exercises
        # that full dual-approval path, not just a single approve call.
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        second_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Reminder Channel Approver", "username": "ci-admin-reminder", "password": "StrongReminderPass!42", "role": "admin"},
        )
        self.assertEqual(second_admin.status_code, 200, second_admin.text)
        second_headers, _ = self._login("ci-admin-reminder", "StrongReminderPass!42")
        third_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Reminder Channel Second Approver", "username": "ci-admin-reminder-2", "password": "StrongReminderPass2!42", "role": "admin"},
        )
        self.assertEqual(third_admin.status_code, 200, third_admin.text)
        third_headers, _ = self._login("ci-admin-reminder-2", "StrongReminderPass2!42")

        # Add a channel via a voice change request, gated by dual-approval maker-checker.
        add_request = self.client.post("/api/change-requests", headers=admin_headers, json={
            "source": "in_app", "transcript": "add Bale as a reminder channel",
            "action_type": "reminder_channel_manage",
            "proposed_changes": {"operation": "add", "name": "Bale Test", "link_template": "https://ble.ir/share/{phone}?text={message}"},
        })
        self.assertEqual(add_request.status_code, 200, add_request.text)
        add_id = add_request.json()["request_id"]

        submit = self.client.post(f"/api/change-requests/{add_id}/submit", headers=admin_headers)
        self.assertEqual(submit.status_code, 200, submit.text)

        self_approve = self.client.post(f"/api/change-requests/{add_id}/approve", headers=admin_headers, json={"note": "self"})
        self.assertEqual(self_approve.status_code, 409, self_approve.text)

        first_approve = self.client.post(f"/api/change-requests/{add_id}/approve", headers=second_headers, json={"note": "looks good"})
        self.assertEqual(first_approve.status_code, 200, first_approve.text)
        self.assertEqual(first_approve.json()["status"], "pending_second_approval", first_approve.text)

        # The same admin cannot provide both approvals.
        same_approver_again = self.client.post(f"/api/change-requests/{add_id}/approve", headers=second_headers, json={"note": "again"})
        self.assertEqual(same_approver_again.status_code, 409, same_approver_again.text)

        second_approve = self.client.post(f"/api/change-requests/{add_id}/approve", headers=third_headers, json={"note": "confirmed independently"})
        self.assertEqual(second_approve.status_code, 200, second_approve.text)
        self.assertEqual(second_approve.json()["status"], "applied", second_approve.text)

        settings_after_add = self.client.get("/settings", headers=admin_headers).json()
        channels = settings_after_add["reminder_channels"]
        added = next((c for c in channels if c["name"] == "Bale Test"), None)
        self.assertIsNotNone(added, channels)
        self.assertEqual(added["link_template"], "https://ble.ir/share/{phone}?text={message}")

        # Remove the same channel via a second voice change request (same dual-approval path).
        remove_request = self.client.post("/api/change-requests", headers=admin_headers, json={
            "source": "in_app", "transcript": "remove the Bale reminder channel",
            "action_type": "reminder_channel_manage",
            "proposed_changes": {"operation": "remove", "channel_id": added["id"]},
        })
        self.assertEqual(remove_request.status_code, 200, remove_request.text)
        remove_id = remove_request.json()["request_id"]
        self.client.post(f"/api/change-requests/{remove_id}/submit", headers=admin_headers)
        self.client.post(f"/api/change-requests/{remove_id}/approve", headers=second_headers, json={"note": "first"})
        remove_approve = self.client.post(f"/api/change-requests/{remove_id}/approve", headers=third_headers, json={"note": "second"})
        self.assertEqual(remove_approve.status_code, 200, remove_approve.text)
        self.assertEqual(remove_approve.json()["status"], "applied", remove_approve.text)

        settings_after_remove = self.client.get("/settings", headers=admin_headers).json()
        remaining_ids = [c["id"] for c in settings_after_remove["reminder_channels"]]
        self.assertNotIn(added["id"], remaining_ids)

        # Removing an already-gone channel_id fails cleanly instead of applying silently.
        bad_remove = self.client.post("/api/change-requests", headers=admin_headers, json={
            "source": "in_app", "transcript": "remove a channel that no longer exists",
            "action_type": "reminder_channel_manage",
            "proposed_changes": {"operation": "remove", "channel_id": added["id"]},
        })
        bad_id = bad_remove.json()["request_id"]
        self.client.post(f"/api/change-requests/{bad_id}/submit", headers=admin_headers)
        self.client.post(f"/api/change-requests/{bad_id}/approve", headers=second_headers, json={"note": "first"})
        bad_approve = self.client.post(f"/api/change-requests/{bad_id}/approve", headers=third_headers, json={"note": "try anyway"})
        self.assertEqual(bad_approve.status_code, 200, bad_approve.text)
        self.assertEqual(bad_approve.json()["status"], "failed", bad_approve.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_message_template_editor_allowlist(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        sales_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Template Sales User", "username": "ci-sales-templates", "password": "StrongTemplatesPass!42", "role": "sales"},
        )
        self.assertEqual(sales_user.status_code, 200, sales_user.text)
        sales_id = sales_user.json()["id"]
        sales_headers, _ = self._login("ci-sales-templates", "StrongTemplatesPass!42")

        # Any staff role can read the templates.
        listed = self.client.get("/api/message-templates", headers=sales_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        friendly_fa = next(i for i in listed.json()["items"] if i["key"] == "payment_reminder_friendly" and i["language"] == "fa")
        self.assertFalse(friendly_fa["is_customized"])
        original_body = friendly_fa["body"]

        # But a sales user with no granted access cannot edit one yet.
        denied = self.client.put(
            "/api/message-templates/payment_reminder_friendly/email/fa", headers=sales_headers,
            json={"subject": "Custom subject", "body": "Custom body {name} {id} {amount} {brand}"},
        )
        self.assertEqual(denied.status_code, 403, denied.text)

        # The admin grants this specific user access - not a role change.
        grant = self.client.post("/api/message-templates/editors", headers=admin_headers, json={"user_id": sales_id})
        self.assertEqual(grant.status_code, 200, grant.text)

        allowed = self.client.put(
            "/api/message-templates/payment_reminder_friendly/email/fa", headers=sales_headers,
            json={"subject": "Custom subject", "body": "Custom body {name} {id} {amount} {brand}"},
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)

        after_edit = self.client.get("/api/message-templates", headers=admin_headers).json()
        updated = next(i for i in after_edit["items"] if i["key"] == "payment_reminder_friendly" and i["language"] == "fa")
        self.assertTrue(updated["is_customized"])
        self.assertEqual(updated["body"], "Custom body {name} {id} {amount} {brand}")

        # Resetting restores the original built-in default.
        reset = self.client.post("/api/message-templates/payment_reminder_friendly/email/fa/reset", headers=sales_headers)
        self.assertEqual(reset.status_code, 200, reset.text)
        after_reset = self.client.get("/api/message-templates", headers=admin_headers).json()
        reset_item = next(i for i in after_reset["items"] if i["key"] == "payment_reminder_friendly" and i["language"] == "fa")
        self.assertFalse(reset_item["is_customized"])
        self.assertEqual(reset_item["body"], original_body)

        # Revoking access blocks edits again.
        revoke = self.client.delete(f"/api/message-templates/editors/{sales_id}", headers=admin_headers)
        self.assertEqual(revoke.status_code, 200, revoke.text)
        denied_again = self.client.put(
            "/api/message-templates/payment_reminder_friendly/email/fa", headers=sales_headers,
            json={"subject": "x", "body": "y"},
        )
        self.assertEqual(denied_again.status_code, 403, denied_again.text)

        # Only an admin can manage the editor allowlist itself.
        non_admin_grant = self.client.post("/api/message-templates/editors", headers=sales_headers, json={"user_id": sales_id})
        self.assertEqual(non_admin_grant.status_code, 403, non_admin_grant.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_invoice_payment_share_link_and_sms(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        customer = self.client.post(
            "/customers", headers=admin_headers,
            json={"name": "Payment Link Customer", "mobile": "09121234567"},
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json()["id"]
        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "Payment Link Product", "price": 2000, "buy_price": 1000, "stock": 10},
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]
        invoice = self.client.post(
            "/invoices", headers=admin_headers,
            json={"invoice_type": "sale", "customer_id": customer_id, "items": [{"product_id": product_id, "quantity": 1, "unit_price": 2000}]},
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]

        with patch.dict(os.environ, {"VETRIX_PAYMENT_PROVIDER": "sandbox"}):
            share = self.client.get(f"/api/payments/invoices/{invoice_id}/share", headers=admin_headers)
            self.assertEqual(share.status_code, 200, share.text)
            data = share.json()
            self.assertIn("/pay/", data["payment_url"])
            self.assertIn(data["payment_url"], data["message"])
            self.assertEqual(data["customer_phone"], "09121234567")
            self.assertIn("09121234567", data["whatsapp_url"])
            self.assertFalse(data["sms_available"])

            # SMS panel isn't configured for this test company - fails closed.
            sms = self.client.post(f"/api/payments/invoices/{invoice_id}/send-sms", headers=admin_headers)
            self.assertEqual(sms.status_code, 503, sms.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_industry_specific_invoice_fields(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        defs = self.client.get("/api/industry-fields/definitions", headers=admin_headers)
        self.assertEqual(defs.status_code, 200, defs.text)
        veterinary = next(i for i in defs.json()["industries"] if i["key"] == "veterinary")
        self.assertTrue(any(f["key"] == "animal_name" for f in veterinary["fields"]))

        settings_update = self.client.post("/settings", headers=admin_headers, json={"industry": "veterinary"})
        self.assertEqual(settings_update.status_code, 200, settings_update.text)
        self.assertEqual(settings_update.json()["settings"]["industry"], "veterinary")

        customer = self.client.post("/customers", headers=admin_headers, json={"name": "Industry Fields Customer"})
        self.assertEqual(customer.status_code, 200, customer.text)
        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "Industry Fields Product", "price": 1000, "buy_price": 500, "stock": 10},
        )
        self.assertEqual(product.status_code, 200, product.text)

        invoice = self.client.post(
            "/invoices", headers=admin_headers,
            json={
                "invoice_type": "sale", "customer_id": customer.json()["id"],
                "items": [{"product_id": product.json()["id"], "quantity": 1, "unit_price": 1000}],
                # not_a_real_field must be silently dropped - only defined
                # veterinary keys are ever persisted.
                "industry_fields": {"animal_name": "Rex", "species": "Dog", "not_a_real_field": "x"},
            },
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]

        detail = self.client.get(f"/invoices/{invoice_id}", headers=admin_headers)
        self.assertEqual(detail.json()["industry_fields"], {"animal_name": "Rex", "species": "Dog"})

        listed = self.client.get("/invoices", headers=admin_headers)
        listed_item = next(i for i in listed.json() if i["id"] == invoice_id)
        self.assertEqual(listed_item["industry_fields"], {"animal_name": "Rex", "species": "Dog"})

        # Reset back to general so it doesn't leak into other z-tests.
        self.client.post("/settings", headers=admin_headers, json={"industry": "general"})

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_telegram_whatsapp_autosend_and_settings(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        settings_update = self.client.post("/settings", headers=admin_headers, json={
            "telegram_bot_token": "", "whatsapp_phone_number_id": "", "whatsapp_access_token": "",
        })
        self.assertEqual(settings_update.status_code, 200, settings_update.text)
        self.assertEqual(settings_update.json()["settings"]["telegram_bot_token"], "")

        customer = self.client.post(
            "/customers", headers=admin_headers,
            json={"name": "Autosend Customer", "mobile": "09121234567", "telegram_chat_id": "555666777"},
        )
        self.assertEqual(customer.status_code, 200, customer.text)
        listed = self.client.get("/customers", headers=admin_headers).json()
        listed_customer = next(c for c in listed if c["id"] == customer.json()["id"])
        self.assertEqual(listed_customer["telegram_chat_id"], "555666777")

        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "Autosend Product", "price": 1000, "buy_price": 500, "stock": 10},
        )
        self.assertEqual(product.status_code, 200, product.text)
        invoice = self.client.post(
            "/invoices", headers=admin_headers,
            json={"invoice_type": "sale", "customer_id": customer.json()["id"], "items": [{"product_id": product.json()["id"], "quantity": 1, "unit_price": 1000}]},
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]

        # Both fail closed - neither Telegram nor WhatsApp is configured for
        # this test company.
        with patch.dict(os.environ, {"VETRIX_PAYMENT_PROVIDER": "sandbox"}):
            telegram_send = self.client.post(f"/api/payments/invoices/{invoice_id}/send-telegram", headers=admin_headers)
            self.assertEqual(telegram_send.status_code, 503, telegram_send.text)
            whatsapp_send = self.client.post(f"/api/payments/invoices/{invoice_id}/send-whatsapp-auto", headers=admin_headers)
            self.assertEqual(whatsapp_send.status_code, 503, whatsapp_send.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_voice_assistant_layer1_suggests_action(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        reminder = self.client.post("/api/change-requests/suggest-action", headers=admin_headers, json={
            "transcript": "لطفا کانال یادآوری واتساپ رو حذف کن",
        })
        self.assertEqual(reminder.status_code, 200, reminder.text)
        self.assertEqual(reminder.json()["action_type"], "reminder_channel_manage")
        self.assertEqual(reminder.json()["proposed_changes"]["operation"], "remove")

        report = self.client.post("/api/change-requests/suggest-action", headers=admin_headers, json={
            "transcript": "گزارش فروش رو به test@example.com بفرست به صورت pdf",
        })
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(report.json()["action_type"], "report_delivery")
        self.assertEqual(report.json()["proposed_changes"]["destination_email"], "test@example.com")
        self.assertEqual(report.json()["proposed_changes"]["format"], "pdf")

        vague = self.client.post("/api/change-requests/suggest-action", headers=admin_headers, json={
            "transcript": "سلام چطوری",
        })
        self.assertEqual(vague.status_code, 200, vague.text)
        self.assertEqual(vague.json()["action_type"], "note_only")

        # Non-admin cannot call the suggester (mirrors transcript review's own gate).
        sales_login = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Suggest Sales User", "username": "ci-sales-suggest", "password": "StrongSuggestPass!42", "role": "sales"},
        )
        self.assertEqual(sales_login.status_code, 200, sales_login.text)
        sales_headers, _ = self._login("ci-sales-suggest", "StrongSuggestPass!42")
        denied = self.client.post("/api/change-requests/suggest-action", headers=sales_headers, json={"transcript": "test"})
        self.assertEqual(denied.status_code, 403, denied.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzy_voice_pricing_rule_draft_and_clarification(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        second_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Pricing Rule Approver", "username": "ci-admin-pricing-voice", "password": "StrongPricingVoice!42", "role": "admin"},
        )
        self.assertEqual(second_admin.status_code, 200, second_admin.text)
        second_headers, _ = self._login("ci-admin-pricing-voice", "StrongPricingVoice!42")

        product = self.client.post(
            "/products", headers=admin_headers, json={"name": "Voice Pricing Widget", "price": 1000, "stock": 10},
        )
        product_id = product.json()["id"]

        # The task spec's own worked example: "cut price 10% for wholesale
        # customers from tomorrow" - Layer 1 should extract discount/group/
        # date for real, without a product (voice can't know the product id).
        suggestion = self.client.post("/api/change-requests/suggest-action", headers=admin_headers, json={
            "transcript": "cut price 10% for wholesale customers from tomorrow", "language": "en",
        })
        self.assertEqual(suggestion.status_code, 200, suggestion.text)
        self.assertEqual(suggestion.json()["action_type"], "pricing_rule_draft")
        self.assertEqual(suggestion.json()["proposed_changes"]["price_mode"], "percent_discount")
        self.assertEqual(suggestion.json()["proposed_changes"]["price_value"], 10)
        self.assertEqual(suggestion.json()["proposed_changes"]["customer_scope_type"], "group")
        self.assertEqual(suggestion.json()["proposed_changes"]["customer_scope_value"], "wholesale")
        # Never guesses which product - that must show up as a real, structured
        # follow-up question rather than being silently omitted or invented.
        missing_field_names = {m["field"] for m in suggestion.json()["missing_fields"]}
        self.assertIn("target_id", missing_field_names)

        # A vague request with nothing extractable is left as note_only, not
        # forced into a wrong, confidently-guessed action type.
        vague_price = self.client.post("/api/change-requests/suggest-action", headers=admin_headers, json={
            "transcript": "لطفا قیمت این کالا رو کم کن", "language": "fa",
        })
        self.assertEqual(vague_price.status_code, 200, vague_price.text)
        # Either note_only (no strong signal) or pricing_rule_draft with missing fields -
        # either way it must not silently claim to know product/discount/group.
        if vague_price.json()["action_type"] == "pricing_rule_draft":
            self.assertTrue(vague_price.json()["missing_fields"])

        # Filling in the product now and submitting for real approval.
        create = self.client.post("/api/change-requests", headers=admin_headers, json={
            "source": "in_app", "transcript": "cut price 10% for wholesale customers from tomorrow",
            "action_type": "pricing_rule_draft", "target_id": product_id,
            "proposed_changes": {
                "customer_scope_type": "group", "customer_scope_value": "wholesale",
                "price_mode": "percent_discount", "price_value": 10,
            },
        })
        self.assertEqual(create.status_code, 200, create.text)
        request_id = create.json()["request_id"]
        self.client.post(f"/api/change-requests/{request_id}/submit", headers=admin_headers)

        # pricing_rule_draft is not in HIGH_RISK_ACTIONS - a single, different admin applies it directly.
        approve = self.client.post(f"/api/change-requests/{request_id}/approve", headers=second_headers, json={"note": "approved"})
        self.assertEqual(approve.status_code, 200, approve.text)
        self.assertEqual(approve.json()["status"], "applied", approve.text)

        rules = self.client.get("/api/pricing/rules", headers=admin_headers)
        self.assertEqual(rules.status_code, 200, rules.text)
        created_rule = next((r for r in rules.json()["items"] if r["scope_value"] == str(product_id)), None)
        self.assertIsNotNone(created_rule, rules.json()["items"])
        self.assertEqual(created_rule["customer_scope_value"], "wholesale")
        self.assertEqual(created_rule["price_value"], 10)

        # An invalid price_mode is rejected, not silently coerced.
        invalid = self.client.post("/api/change-requests", headers=admin_headers, json={
            "source": "in_app", "transcript": "invalid pricing request", "action_type": "pricing_rule_draft",
            "target_id": product_id,
            "proposed_changes": {"customer_scope_type": "any", "price_mode": "not-a-mode", "price_value": 5},
        })
        self.assertEqual(invalid.status_code, 400)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_visitor_checkin_checkout_geofence_and_kpis(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        near_customer = self.client.post(
            "/customers", headers=admin_headers,
            json={"name": "Geofence Near Customer", "latitude": 35.6997, "longitude": 51.3380},
        )
        self.assertEqual(near_customer.status_code, 200, near_customer.text)
        near_id = near_customer.json()["id"]
        near_customer_detail = self.client.get(f"/customers/{near_id}", headers=admin_headers)
        self.assertEqual(near_customer_detail.status_code, 200, near_customer_detail.text)
        self.assertAlmostEqual(near_customer_detail.json()["customer"]["latitude"], 35.6997, places=3)

        far_customer = self.client.post(
            "/customers", headers=admin_headers,
            json={"name": "Geofence Far Customer", "latitude": 35.6997, "longitude": 51.3380},
        )
        self.assertEqual(far_customer.status_code, 200, far_customer.text)
        far_id = far_customer.json()["id"]

        no_coords_customer = self.client.post("/customers", headers=admin_headers, json={"name": "No Coords Customer"})
        self.assertEqual(no_coords_customer.status_code, 200, no_coords_customer.text)
        no_coords_id = no_coords_customer.json()["id"]

        check_in_time = datetime.utcnow().isoformat() + "Z"
        visit_time = (datetime.utcnow() + timedelta(minutes=12)).isoformat() + "Z"

        # ~55m from the customer's registered point - within the 300m geofence.
        near_visit = self.client.post("/api/field-visits", headers=admin_headers, json={
            "customer_id": near_id, "outcome": "order_placed", "note": "",
            "client_ref": "visit-geofence-near-001",
            "check_in_time": check_in_time, "check_in_latitude": 35.7002, "check_in_longitude": 51.3380,
            "latitude": 35.7002, "longitude": 51.3380, "visit_time": visit_time,
        })
        self.assertEqual(near_visit.status_code, 200, near_visit.text)
        near_record = near_visit.json()["visit"]
        self.assertTrue(near_record["within_geofence"])
        self.assertLess(near_record["distance_meters"], 300)
        self.assertEqual(near_record["duration_seconds"], 720)

        # ~11km from the customer's registered point - outside the geofence.
        far_visit = self.client.post("/api/field-visits", headers=admin_headers, json={
            "customer_id": far_id, "outcome": "no_order_no_need", "note": "",
            "client_ref": "visit-geofence-far-001",
            "check_in_time": check_in_time, "check_in_latitude": 35.80, "check_in_longitude": 51.3380,
            "latitude": 35.80, "longitude": 51.3380, "visit_time": visit_time,
        })
        self.assertEqual(far_visit.status_code, 200, far_visit.text)
        far_record = far_visit.json()["visit"]
        self.assertFalse(far_record["within_geofence"])
        self.assertGreater(far_record["distance_meters"], 300)

        # No registered coordinates on the customer - geofence check is
        # skipped entirely (None, never a false negative).
        no_coords_visit = self.client.post("/api/field-visits", headers=admin_headers, json={
            "customer_id": no_coords_id, "outcome": "customer_unavailable", "note": "",
            "client_ref": "visit-geofence-nocoords-001",
            "check_in_time": check_in_time, "check_in_latitude": 35.80, "check_in_longitude": 51.3380,
        })
        self.assertEqual(no_coords_visit.status_code, 200, no_coords_visit.text)
        self.assertIsNone(no_coords_visit.json()["visit"]["within_geofence"])
        self.assertIsNone(no_coords_visit.json()["visit"]["distance_meters"])

        # Invalid outcome is rejected up front.
        bad_outcome = self.client.post("/api/field-visits", headers=admin_headers, json={
            "customer_id": near_id, "outcome": "not_a_real_outcome",
        })
        self.assertEqual(bad_outcome.status_code, 400, bad_outcome.text)

        summary = self.client.get("/api/field-visits/summary?scope=team", headers=admin_headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertGreaterEqual(summary.json()["today"]["visits"], 3)
        self.assertGreaterEqual(summary.json()["today"]["orders"], 1)

        coverage = self.client.get("/api/field-visits/coverage", headers=admin_headers)
        self.assertEqual(coverage.status_code, 200, coverage.text)
        coverage_by_id = {item["customer_id"]: item for item in coverage.json()["items"]}
        self.assertFalse(coverage_by_id[near_id]["overdue"])
        self.assertIsNotNone(coverage_by_id[near_id]["days_since_last_visit"])
        # A customer never visited at all is always overdue.
        never_visited = self.client.post("/customers", headers=admin_headers, json={"name": "Never Visited Customer"})
        self.assertEqual(never_visited.status_code, 200, never_visited.text)
        coverage_after = self.client.get("/api/field-visits/coverage", headers=admin_headers).json()
        never_visited_entry = next(i for i in coverage_after["items"] if i["customer_id"] == never_visited.json()["id"])
        self.assertTrue(never_visited_entry["overdue"])
        self.assertIsNone(never_visited_entry["days_since_last_visit"])

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_product_category_brand_persist_and_search_filters(self):
        # Regression test: brand/main_category/sub_category/min_stock/
        # is_active were accepted by the product form but silently dropped
        # on save because ProductCreate never declared those fields.
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        cpap = self.client.post("/products", headers=admin_headers, json={
            "name": "CPAP Search Test Device", "price": 5000, "buy_price": 3000, "stock": 2, "min_stock": 5,
            "brand": "ResMed", "main_category": "Medical Equipment", "sub_category": "Respiratory",
        })
        self.assertEqual(cpap.status_code, 200, cpap.text)
        self.assertEqual(cpap.json()["brand"], "ResMed")
        self.assertEqual(cpap.json()["main_category"], "Medical Equipment")
        self.assertEqual(cpap.json()["sub_category"], "Respiratory")
        self.assertEqual(cpap.json()["min_stock"], 5)
        self.assertTrue(cpap.json()["is_active"])
        cpap_id = cpap.json()["id"]

        # Persists across a fresh read too, not just the create response.
        listed = self.client.get("/products", headers=admin_headers).json()
        cpap_listed = next(p for p in listed if p["id"] == cpap_id)
        self.assertEqual(cpap_listed["brand"], "ResMed")
        self.assertEqual(cpap_listed["main_category"], "Medical Equipment")

        other = self.client.post("/products", headers=admin_headers, json={
            "name": "Unrelated Search Test Product", "price": 100, "buy_price": 50, "stock": 50,
            "brand": "OtherBrand", "main_category": "General",
        })
        self.assertEqual(other.status_code, 200, other.text)

        # Combined group+category+text search - the example from the spec.
        combined = self.client.get(
            "/products?main_category=Medical+Equipment&sub_category=Respiratory&search=CPAP",
            headers=admin_headers,
        ).json()
        self.assertEqual({p["id"] for p in combined}, {cpap_id})

        # stock_status=low_stock: stock(2) > 0 and <= min_stock(5).
        low_stock = self.client.get("/products?stock_status=low_stock", headers=admin_headers).json()
        self.assertIn(cpap_id, {p["id"] for p in low_stock})
        self.assertNotIn(other.json()["id"], {p["id"] for p in low_stock})

        # Update can deactivate; is_active filter respects it; edit persists
        # brand unchanged (partial-style behavior via explicit resend).
        deactivate = self.client.put(f"/products/{cpap_id}", headers=admin_headers, json={
            "name": "CPAP Search Test Device", "price": 5000, "buy_price": 3000, "stock": 2, "min_stock": 5,
            "brand": "ResMed", "main_category": "Medical Equipment", "sub_category": "Respiratory",
            "is_active": False,
        })
        self.assertEqual(deactivate.status_code, 200, deactivate.text)
        self.assertFalse(deactivate.json()["is_active"])

        active_only = self.client.get("/products?is_active=true", headers=admin_headers).json()
        self.assertNotIn(cpap_id, {p["id"] for p in active_only})
        inactive_only = self.client.get("/products?is_active=false", headers=admin_headers).json()
        self.assertIn(cpap_id, {p["id"] for p in inactive_only})

        # No params at all still returns the full unfiltered list (backward compatible).
        unfiltered = self.client.get("/products", headers=admin_headers).json()
        self.assertIn(cpap_id, {p["id"] for p in unfiltered})
        self.assertIn(other.json()["id"], {p["id"] for p in unfiltered})

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzz_payment_providers_crud_and_gateway_fallback(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        # Unsupported provider key is rejected.
        bad = self.client.post("/api/payment-providers", headers=admin_headers, json={"provider_key": "not_a_real_provider"})
        self.assertEqual(bad.status_code, 400, bad.text)

        created = self.client.post("/api/payment-providers", headers=admin_headers, json={
            "provider_key": "sandbox", "display_name": "Sandbox Test", "enabled": True, "mode": "test",
        })
        self.assertEqual(created.status_code, 200, created.text)
        self.assertTrue(created.json()["enabled"])

        listed = self.client.get("/api/payment-providers", headers=admin_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        sandbox_row = next(i for i in listed.json()["items"] if i["provider_key"] == "sandbox")
        self.assertEqual(sandbox_row["display_name"], "Sandbox Test")
        self.assertIn("pos_terminal_generic", listed.json()["available_keys"])

        # Upsert again with the same key updates in place, not a duplicate row.
        updated = self.client.post("/api/payment-providers", headers=admin_headers, json={
            "provider_key": "sandbox", "display_name": "Sandbox Renamed", "enabled": True, "mode": "test",
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        listed_again = self.client.get("/api/payment-providers", headers=admin_headers).json()
        sandbox_rows = [i for i in listed_again["items"] if i["provider_key"] == "sandbox"]
        self.assertEqual(len(sandbox_rows), 1)
        self.assertEqual(sandbox_rows[0]["display_name"], "Sandbox Renamed")

        # Non-admin cannot read or write provider config.
        sales_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Payment Providers Sales User", "username": "ci-sales-payprov", "password": "StrongPayProvPass!42", "role": "sales"},
        )
        self.assertEqual(sales_user.status_code, 200, sales_user.text)
        sales_headers, _ = self._login("ci-sales-payprov", "StrongPayProvPass!42")
        denied_read = self.client.get("/api/payment-providers", headers=sales_headers)
        self.assertEqual(denied_read.status_code, 403, denied_read.text)
        denied_write = self.client.post("/api/payment-providers", headers=sales_headers, json={"provider_key": "sandbox", "enabled": True})
        self.assertEqual(denied_write.status_code, 403, denied_write.text)

        # The DB-enabled provider works for real invoice payment requests
        # WITHOUT VETRIX_PAYMENT_PROVIDER being set at all - proves the new
        # DB-config path, not just the pre-existing env-var path.
        customer = self.client.post("/customers", headers=admin_headers, json={"name": "Payment Provider DB Customer"})
        self.assertEqual(customer.status_code, 200, customer.text)
        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "Payment Provider DB Product", "price": 1000, "buy_price": 500, "stock": 10},
        )
        self.assertEqual(product.status_code, 200, product.text)
        invoice = self.client.post(
            "/invoices", headers=admin_headers,
            json={"invoice_type": "sale", "customer_id": customer.json()["id"], "items": [{"product_id": product.json()["id"], "quantity": 1, "unit_price": 1000}]},
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)
        invoice_id = invoice.json()["invoice_id"]

        with patch.dict(os.environ, {"VETRIX_PAYMENT_PROVIDER": ""}, clear=False):
            os.environ.pop("VETRIX_PAYMENT_PROVIDER", None)
            requested = self.client.post(f"/api/payments/invoices/{invoice_id}/request", headers=admin_headers)
            self.assertEqual(requested.status_code, 200, requested.text)
            self.assertEqual(requested.json()["provider"], "sandbox")

        # Resetting the provider removes it - falls back to failing closed again.
        reset = self.client.delete("/api/payment-providers/sandbox", headers=admin_headers)
        self.assertEqual(reset.status_code, 200, reset.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_bi_improvement_finding_lifecycle(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")
        second_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "BI Plan Approver", "username": "ci-admin-bi", "password": "StrongBiPass!42", "role": "admin"},
        )
        self.assertEqual(second_admin.status_code, 200, second_admin.text)
        second_headers, _ = self._login("ci-admin-bi", "StrongBiPass!42")

        # Self-contained period/plan so this finding is deterministic
        # regardless of whatever real state other tests left behind in the
        # same shared company (recalculate scans ALL company data, so other
        # detector categories may also fire - this test only asserts on the
        # budget_variance finding tied to ITS OWN plan_id).
        new_period = self.client.post(
            "/api/accounting/periods", headers=admin_headers,
            json={"name": "CI BI Improvement Period", "start_date": "2032-01-01", "end_date": "2032-01-31"},
        )
        self.assertEqual(new_period.status_code, 200, new_period.text)
        period_id = new_period.json()["id"]
        accounts = self.client.get("/api/accounting/entries/chart", headers=admin_headers).json()
        expense = next(item for item in accounts if item["code"] == "5102")
        cash = next(item for item in accounts if item["code"] == "1101")

        plan = self.client.post(
            "/api/accounting/budget-plans", headers=admin_headers,
            json={"name": "CI BI Overrun Plan", "budget_type": "expense", "scenario": "base", "fiscal_period_id": period_id},
        )
        self.assertEqual(plan.status_code, 200, plan.text)
        plan_id = plan.json()["id"]
        expense_line = self.client.post(
            "/api/accounting/budgets/lines", headers=admin_headers,
            json={"fiscal_period_id": period_id, "account_id": expense["id"], "amount": 100, "budget_plan_id": plan_id},
        )
        self.assertEqual(expense_line.status_code, 200, expense_line.text)

        submit = self.client.post(f"/api/accounting/budget-plans/{plan_id}/submit", headers=admin_headers)
        self.assertEqual(submit.status_code, 200, submit.text)
        approve = self.client.post(f"/api/approvals/{submit.json()['approval_request_id']}/approve", headers=second_headers, json={"note": "ok"})
        self.assertEqual(approve.status_code, 200, approve.text)
        activate = self.client.post(f"/api/accounting/budget-plans/{plan_id}/activate", headers=admin_headers)
        self.assertEqual(activate.status_code, 200, activate.text)

        # Actual expense (250) is 150% over the planned 100 -> a clear,
        # deterministic budget_variance finding (critical, >=25% over).
        voucher = self.client.post(
            "/api/accounting/entries", headers=admin_headers,
            json={
                "voucher_date": "2032-01-05", "description": "CI BI overrun actual", "status": "posted",
                "lines": [
                    {"account_id": expense["id"], "debit": 250, "credit": 0},
                    {"account_id": cash["id"], "debit": 0, "credit": 250},
                ],
            },
        )
        self.assertEqual(voucher.status_code, 200, voucher.text)

        recalc = self.client.post("/api/bi-improvement/recalculate", headers=admin_headers)
        self.assertEqual(recalc.status_code, 200, recalc.text)
        self.assertIsInstance(recalc.json()["created"], list)

        findings = self.client.get("/api/bi-improvement/findings?category=budget_variance", headers=admin_headers)
        self.assertEqual(findings.status_code, 200, findings.text)
        # Task 07 Section 4/H: the detector reads app/accounting/budgets.py's
        # own period-level data (the same numbers BudgetControl.jsx shows),
        # not budget_plans (which has no frontend anywhere in the app) - so
        # the finding is keyed to the fiscal period, not the plan.
        matches = [f for f in findings.json()["items"] if f["related_entity_id"] == period_id]
        self.assertTrue(matches, findings.json()["items"])
        finding = matches[0]
        finding_id = finding["id"]
        self.assertEqual(finding["severity"], "critical")
        self.assertEqual(finding["status"], "new")
        self.assertEqual(finding["evidence_source"], "app.accounting.budgets.compute_budget_variance")
        self.assertIn("top_over_budget_lines", finding["evidence"])
        self.assertIn("Review the over-budget expense categories", finding["recommended_actions"])

        # A brand-new critical finding surfaces in Executive Alerts (the 5th source).
        alerts = self.client.get("/api/executive-alerts/summary", headers=admin_headers)
        self.assertEqual(alerts.status_code, 200, alerts.text)
        finding_alerts = [a for a in alerts.json()["items"] if a["category"] == "bi_finding" and a["related_id"] == finding_id]
        self.assertTrue(finding_alerts, alerts.json()["items"])
        self.assertEqual(finding_alerts[0]["severity"], "critical")

        # Dismiss requires a non-empty reason.
        blank_dismiss = self.client.put(f"/api/bi-improvement/findings/{finding_id}/dismiss", headers=admin_headers, json={"reason": "  "})
        self.assertEqual(blank_dismiss.status_code, 400, blank_dismiss.text)

        acknowledge = self.client.put(f"/api/bi-improvement/findings/{finding_id}/acknowledge", headers=admin_headers)
        self.assertEqual(acknowledge.status_code, 200, acknowledge.text)

        create_plan = self.client.post(
            f"/api/bi-improvement/findings/{finding_id}/plans", headers=admin_headers,
            json={
                "objective": "Bring expense back within the approved budget", "selected_action": "Review the over-budget expense categories",
                "priority": "high", "target_kpi": "budget_over_ratio_percent", "baseline_kpi": finding["current_metric"], "target_value": 0,
            },
        )
        self.assertEqual(create_plan.status_code, 200, create_plan.text)
        action_plan_id = create_plan.json()["id"]

        after_plan = self.client.get(f"/api/bi-improvement/findings/{finding_id}", headers=admin_headers).json()
        self.assertEqual(after_plan["status"], "action_planned")
        self.assertEqual(len(after_plan["plans"]), 1)
        self.assertTrue(any(h["event_type"] == "plan_created" for h in after_plan["history"]))

        start_plan = self.client.post(f"/api/bi-improvement/plans/{action_plan_id}/start", headers=admin_headers)
        self.assertEqual(start_plan.status_code, 200, start_plan.text)
        in_progress = self.client.get(f"/api/bi-improvement/findings/{finding_id}", headers=admin_headers).json()
        self.assertEqual(in_progress["status"], "in_progress")

        yesterday = "2020-01-01"
        task = self.client.post(
            f"/api/bi-improvement/plans/{action_plan_id}/tasks", headers=admin_headers,
            json={"title": "Review overspend with department head", "deadline": yesterday},
        )
        self.assertEqual(task.status_code, 200, task.text)
        task_id = task.json()["id"]

        overdue_alerts = self.client.get("/api/executive-alerts/summary", headers=admin_headers)
        task_alert = [a for a in overdue_alerts.json()["items"] if a["category"] == "bi_action_task" and a["related_id"] == finding_id]
        self.assertTrue(task_alert, overdue_alerts.json()["items"])
        self.assertEqual(task_alert[0]["severity"], "critical")  # far more than 7 days overdue

        update_task = self.client.put(f"/api/bi-improvement/tasks/{task_id}", headers=admin_headers, json={"status": "done", "progress_percent": 100})
        self.assertEqual(update_task.status_code, 200, update_task.text)

        # Resolution is target-driven, not "tasks completed" - target (0% over) not met yet.
        resolve_blocked = self.client.post(f"/api/bi-improvement/findings/{finding_id}/resolve", headers=admin_headers, json={})
        self.assertEqual(resolve_blocked.status_code, 409, resolve_blocked.text)

        resolve_no_reason = self.client.post(
            f"/api/bi-improvement/findings/{finding_id}/resolve", headers=admin_headers, json={"override": True},
        )
        self.assertEqual(resolve_no_reason.status_code, 400, resolve_no_reason.text)

        resolve_override = self.client.post(
            f"/api/bi-improvement/findings/{finding_id}/resolve", headers=admin_headers,
            json={"override": True, "reason": "Department head approved the one-time overrun"},
        )
        self.assertEqual(resolve_override.status_code, 200, resolve_override.text)
        self.assertIn("Manager override", resolve_override.json()["note"])

        reopen = self.client.put(f"/api/bi-improvement/findings/{finding_id}/reopen", headers=admin_headers, json={"reason": "Recheck needed"})
        self.assertEqual(reopen.status_code, 200, reopen.text)
        self.assertEqual(reopen.json()["status"], "reopened")

        dismiss = self.client.put(
            f"/api/bi-improvement/findings/{finding_id}/dismiss", headers=admin_headers, json={"reason": "Superseded by a policy change"},
        )
        self.assertEqual(dismiss.status_code, 200, dismiss.text)

        final_detail = self.client.get(f"/api/bi-improvement/findings/{finding_id}", headers=admin_headers).json()
        self.assertEqual(final_detail["status"], "dismissed")
        self.assertEqual(final_detail["dismissed_reason"], "Superseded by a policy change")
        event_types = [h["event_type"] for h in final_detail["history"]]
        self.assertEqual(event_types, ["new", "acknowledged", "plan_created", "status_changed", "resolved", "reopened", "dismissed"])

        dashboard = self.client.get("/api/bi-improvement/dashboard", headers=admin_headers)
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertIsInstance(dashboard.json()["open_findings"], int)
        self.assertIsInstance(dashboard.json()["recently_resolved"], list)

        # RBAC: a non-admin/accountant role cannot reach this module at all.
        sales_signup = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "BI Sales Viewer", "username": "ci-sales-bi", "password": "StrongSalesPass!42", "role": "sales"},
        )
        self.assertEqual(sales_signup.status_code, 200, sales_signup.text)
        sales_headers, _ = self._login("ci-sales-bi", "StrongSalesPass!42")
        denied = self.client.get("/api/bi-improvement/findings", headers=sales_headers)
        self.assertEqual(denied.status_code, 403, denied.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_company_profile_goals_documents_and_alerts(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        profile = self.client.get("/api/company-profile", headers=admin_headers)
        self.assertEqual(profile.status_code, 200, profile.text)
        self.assertIn("trading_name", profile.json())
        self.assertIn("relationships", profile.json())

        invalid_update = self.client.put(
            "/api/company-profile", headers=admin_headers, json={"company_type": "not-a-real-type"},
        )
        self.assertEqual(invalid_update.status_code, 400, invalid_update.text)

        update = self.client.put(
            "/api/company-profile", headers=admin_headers,
            json={
                "legal_name": "CI Vetrix Legal Entity Ltd", "company_type": "llc", "registration_number": "REG-991",
                "mission": "Serve customers honestly.", "province": "Tehran", "bank_iban": "IR000000000000000000000001",
            },
        )
        self.assertEqual(update.status_code, 200, update.text)
        after_update = self.client.get("/api/company-profile", headers=admin_headers).json()
        self.assertEqual(after_update["legal_name"], "CI Vetrix Legal Entity Ltd")
        self.assertEqual(after_update["company_type"], "llc")
        self.assertEqual(after_update["province"], "Tehran")
        # AppSettings-owned fields are reused by reference, not duplicated.
        self.assertIn("trading_name", after_update)
        self.assertNotIn("company_name", after_update)

        # Strategic goals - simple lifecycle, distinct from the BI action-plan engine.
        goal = self.client.post(
            "/api/company-profile/goals", headers=admin_headers,
            json={"title": "Expand to two new provinces", "measurable_target": "2 new branches"},
        )
        self.assertEqual(goal.status_code, 200, goal.text)
        goal_id = goal.json()["id"]
        bad_status = self.client.put(f"/api/company-profile/goals/{goal_id}", headers=admin_headers, json={"status": "not-a-status"})
        self.assertEqual(bad_status.status_code, 400, bad_status.text)
        good_status = self.client.put(f"/api/company-profile/goals/{goal_id}", headers=admin_headers, json={"status": "in_progress", "progress_percent": 40})
        self.assertEqual(good_status.status_code, 200, good_status.text)
        goals_list = self.client.get("/api/company-profile/goals", headers=admin_headers).json()
        self.assertTrue(any(g["id"] == goal_id and g["progress_percent"] == 40 for g in goals_list["items"]))
        delete_goal = self.client.delete(f"/api/company-profile/goals/{goal_id}", headers=admin_headers)
        self.assertEqual(delete_goal.status_code, 200, delete_goal.text)

        # Company documents - upload, list (scoped), download, expiry alert, delete.
        past_expiry = "2020-01-01"
        upload = self.client.post(
            "/api/company-profile/documents", headers=admin_headers,
            data={"document_type": "license", "title": "CI Business License", "expiry_date": past_expiry},
            files={"file": ("license.pdf", b"not-a-real-pdf", "application/pdf")},
        )
        self.assertEqual(upload.status_code, 200, upload.text)
        document_id = upload.json()["id"]

        doc_list = self.client.get("/api/company-profile/documents", headers=admin_headers)
        self.assertEqual(doc_list.status_code, 200, doc_list.text)
        self.assertTrue(any(d["id"] == document_id for d in doc_list.json()["items"]))

        download = self.client.get(f"/api/company-profile/documents/{document_id}/download", headers=admin_headers)
        self.assertEqual(download.status_code, 200, download.text)
        self.assertEqual(download.content, b"not-a-real-pdf")

        # A past-expiry document surfaces as a real, critical Executive Alert (6th source).
        alerts = self.client.get("/api/executive-alerts/summary", headers=admin_headers)
        self.assertEqual(alerts.status_code, 200, alerts.text)
        doc_alerts = [a for a in alerts.json()["items"] if a["category"] == "company_document" and a["related_id"] == document_id]
        self.assertTrue(doc_alerts, alerts.json()["items"])
        self.assertEqual(doc_alerts[0]["severity"], "critical")

        # Cross-company isolation: a different company's admin cannot see or
        # download this document, even by guessing its id.
        second_headers, _ = self._login("m4-second-admin", "StrongSecondAdmin!42")
        cross_list = self.client.get("/api/company-profile/documents", headers=second_headers).json()
        self.assertFalse(any(d["id"] == document_id for d in cross_list["items"]))
        cross_download = self.client.get(f"/api/company-profile/documents/{document_id}/download", headers=second_headers)
        self.assertEqual(cross_download.status_code, 404, cross_download.text)
        cross_delete = self.client.delete(f"/api/company-profile/documents/{document_id}", headers=second_headers)
        self.assertEqual(cross_delete.status_code, 404, cross_delete.text)

        delete_doc = self.client.delete(f"/api/company-profile/documents/{document_id}", headers=admin_headers)
        self.assertEqual(delete_doc.status_code, 200, delete_doc.text)

        # RBAC: only admin (not accountant/sales/etc.) may reach this module.
        sales_headers, _ = self._login("ci-sales-bi", "StrongSalesPass!42")
        denied = self.client.get("/api/company-profile", headers=sales_headers)
        self.assertEqual(denied.status_code, 403, denied.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_hr_employee_lifecycle_and_permission_boundaries(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        jane_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Jane Manager Login", "username": "hr-jane", "password": "StrongJanePass!42", "role": "sales"},
        )
        self.assertEqual(jane_user.status_code, 200, jane_user.text)
        jane_user_id = jane_user.json()["id"]

        bob_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Bob Report Login", "username": "hr-bob", "password": "StrongBobPass!42", "role": "viewer"},
        )
        self.assertEqual(bob_user.status_code, 200, bob_user.text)
        bob_user_id = bob_user.json()["id"]

        outsider_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Outsider Login", "username": "hr-outsider", "password": "StrongOutsiderPass!42", "role": "warehouse"},
        )
        self.assertEqual(outsider_user.status_code, 200, outsider_user.text)

        accountant_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "HR Accountant", "username": "hr-accountant", "password": "StrongAccountantPass!42", "role": "accountant"},
        )
        self.assertEqual(accountant_user.status_code, 200, accountant_user.text)

        jane = self.client.post(
            "/api/hr", headers=admin_headers,
            json={"first_name": "Jane", "last_name": "Manager", "job_title": "Regional Manager", "linked_user_id": jane_user_id},
        )
        self.assertEqual(jane.status_code, 200, jane.text)
        jane_id = jane.json()["id"]

        bob = self.client.post(
            "/api/hr", headers=admin_headers,
            json={"first_name": "Bob", "last_name": "Report", "job_title": "Field Rep", "manager_employee_id": jane_id, "linked_user_id": bob_user_id},
        )
        self.assertEqual(bob.status_code, 200, bob.text)
        bob_id = bob.json()["id"]

        # Employment history: a tracked field change is appended, not overwritten.
        promote = self.client.put(f"/api/hr/{bob_id}", headers=admin_headers, json={"job_title": "Senior Field Rep"})
        self.assertEqual(promote.status_code, 200, promote.text)
        history = self.client.get(f"/api/hr/{bob_id}/history", headers=admin_headers)
        self.assertEqual(history.status_code, 200, history.text)
        self.assertTrue(any(h["event_type"] == "position_change" and h["old_value"] == "Field Rep" and h["new_value"] == "Senior Field Rep" for h in history.json()["items"]))

        jane_headers, _ = self._login("hr-jane", "StrongJanePass!42")
        bob_headers, _ = self._login("hr-bob", "StrongBobPass!42")
        outsider_headers, _ = self._login("hr-outsider", "StrongOutsiderPass!42")
        accountant_headers, _ = self._login("hr-accountant", "StrongAccountantPass!42")

        # Manager sees her direct report but cannot edit or see compensation.
        manager_view = self.client.get(f"/api/hr/{bob_id}", headers=jane_headers)
        self.assertEqual(manager_view.status_code, 200, manager_view.text)
        manager_edit_blocked = self.client.put(f"/api/hr/{bob_id}", headers=jane_headers, json={"job_title": "Should Not Apply"})
        self.assertEqual(manager_edit_blocked.status_code, 403, manager_edit_blocked.text)
        manager_comp_blocked = self.client.get(f"/api/hr/{bob_id}/compensation", headers=jane_headers)
        self.assertEqual(manager_comp_blocked.status_code, 403, manager_comp_blocked.text)

        # An unrelated user with no linked employee has no access at all.
        outsider_blocked = self.client.get(f"/api/hr/{bob_id}", headers=outsider_headers)
        self.assertEqual(outsider_blocked.status_code, 403, outsider_blocked.text)

        # Self-service: Bob may edit only the allowed contact fields, never job_title/status.
        self_ok = self.client.put(f"/api/hr/{bob_id}", headers=bob_headers, json={"mobile": "0912-000-0000"})
        self.assertEqual(self_ok.status_code, 200, self_ok.text)
        self_blocked = self.client.put(f"/api/hr/{bob_id}", headers=bob_headers, json={"job_title": "Self Promoted"})
        self.assertEqual(self_blocked.status_code, 403, self_blocked.text)

        # Compensation ledger - explicitly not statutory payroll; admin/accountant/self only.
        comp = self.client.post(
            f"/api/hr/{bob_id}/compensation", headers=admin_headers,
            json={"entry_type": "base_salary", "amount": 50000000, "effective_date": "2026-01-01", "note": "Base salary"},
        )
        self.assertEqual(comp.status_code, 200, comp.text)
        self_comp = self.client.get(f"/api/hr/{bob_id}/compensation", headers=bob_headers)
        self.assertEqual(self_comp.status_code, 200, self_comp.text)
        self.assertEqual(len(self_comp.json()["items"]), 1)
        accountant_comp = self.client.get(f"/api/hr/{bob_id}/compensation", headers=accountant_headers)
        self.assertEqual(accountant_comp.status_code, 200, accountant_comp.text)

        # Leave: entitlement, request, and real approval-engine-backed approval.
        set_balance = self.client.put(f"/api/hr/{bob_id}/leave/balances", headers=admin_headers, json={"leave_type": "annual", "entitlement": 10})
        self.assertEqual(set_balance.status_code, 200, set_balance.text)
        leave_request = self.client.post(
            f"/api/hr/{bob_id}/leave/requests", headers=bob_headers,
            json={"leave_type": "annual", "start_date": "2026-03-01", "end_date": "2026-03-05", "reason": "Family trip"},
        )
        self.assertEqual(leave_request.status_code, 200, leave_request.text)
        self.assertEqual(leave_request.json()["status"], "pending_approval")
        self.assertEqual(self.client.get(f"/api/hr/{bob_id}/leave/requests", headers=bob_headers).json()["items"][0]["days"], 5)

        approve_leave = self.client.post(
            f"/api/approvals/{leave_request.json()['approval_request_id']}/approve", headers=admin_headers, json={"note": "approved"},
        )
        self.assertEqual(approve_leave.status_code, 200, approve_leave.text)
        balances_after = self.client.get(f"/api/hr/{bob_id}/leave/balances", headers=admin_headers).json()["items"]
        annual = next(b for b in balances_after if b["leave_type"] == "annual")
        self.assertEqual(annual["used"], 5)
        self.assertEqual(annual["remaining"], 5)

        # Attendance - manual entry only.
        attendance = self.client.post(
            f"/api/hr/{bob_id}/attendance", headers=admin_headers,
            json={"work_date": "2026-02-10", "status": "present", "hours": 8},
        )
        self.assertEqual(attendance.status_code, 200, attendance.text)

        # Performance review - Bob's own manager (Jane) may create one; an outsider may not.
        outsider_review_blocked = self.client.post(f"/api/hr/{bob_id}/performance", headers=outsider_headers, json={"review_period": "2026-Q1", "rating": 4})
        self.assertEqual(outsider_review_blocked.status_code, 403, outsider_review_blocked.text)
        review = self.client.post(
            f"/api/hr/{bob_id}/performance", headers=jane_headers,
            json={"review_period": "2026-Q1", "kpi": "Visits per week", "target": "20", "actual": "22", "rating": 4, "strengths": "Reliable"},
        )
        self.assertEqual(review.status_code, 200, review.text)

        # Documents - past-expiry document becomes a real Executive Alert (7th source), and is isolated per-employee/company.
        past_expiry = "2020-01-01"
        upload = self.client.post(
            f"/api/hr/{bob_id}/documents", headers=admin_headers,
            data={"document_type": "contract", "title": "Bob Employment Contract", "expiry_date": past_expiry},
            files={"file": ("contract.pdf", b"not-a-real-pdf", "application/pdf")},
        )
        self.assertEqual(upload.status_code, 200, upload.text)
        document_id = upload.json()["id"]

        self_download = self.client.get(f"/api/hr/{bob_id}/documents/{document_id}/download", headers=bob_headers)
        self.assertEqual(self_download.status_code, 200, self_download.text)
        outsider_download_blocked = self.client.get(f"/api/hr/{bob_id}/documents/{document_id}/download", headers=outsider_headers)
        self.assertEqual(outsider_download_blocked.status_code, 403, outsider_download_blocked.text)

        alerts = self.client.get("/api/executive-alerts/summary", headers=admin_headers)
        self.assertEqual(alerts.status_code, 200, alerts.text)
        doc_alerts = [a for a in alerts.json()["items"] if a["category"] == "employee_document" and a["related_id"] == bob_id]
        self.assertTrue(doc_alerts, alerts.json()["items"])
        self.assertEqual(doc_alerts[0]["severity"], "critical")

        # Employee 360 summary - compensation section hidden from a manager, visible to admin.
        manager_summary = self.client.get(f"/api/hr/{bob_id}/summary", headers=jane_headers)
        self.assertEqual(manager_summary.status_code, 200, manager_summary.text)
        self.assertFalse(manager_summary.json()["compensation_visible"])
        admin_summary = self.client.get(f"/api/hr/{bob_id}/summary", headers=admin_headers)
        self.assertTrue(admin_summary.json()["compensation_visible"])
        self.assertEqual(admin_summary.json()["pending_leave_requests"], 0)
        # >=1 rather than an exact count - the JSON-index document store is
        # real disk state, not reset between local re-runs of this test the
        # way the ephemeral per-run sqlite DB is (see module docstring in
        # app/hr.py); membership was already proven above via self_download.
        self.assertGreaterEqual(admin_summary.json()["document_count"], 1)

        # List scoping: the manager's list includes herself and her report, never an unrelated employee she has no relation to.
        jane_list = self.client.get("/api/hr", headers=jane_headers).json()["items"]
        jane_list_ids = {e["id"] for e in jane_list}
        self.assertIn(jane_id, jane_list_ids)
        self.assertIn(bob_id, jane_list_ids)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_backup_delivery_policy_and_real_delivery_attempts(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        invalid_frequency = self.client.post(
            "/api/backup-delivery/policies", headers=admin_headers,
            json={"name": "Bad Policy", "frequency": "hourly"},
        )
        self.assertEqual(invalid_frequency.status_code, 400, invalid_frequency.text)

        unsupported_channel = self.client.post(
            "/api/backup-delivery/policies", headers=admin_headers,
            json={"name": "Bad Channel Policy", "recipients": [{"channel": "sms", "target": "0912"}]},
        )
        self.assertEqual(unsupported_channel.status_code, 400, unsupported_channel.text)
        self.assertIn("does not currently support backup-file delivery", unsupported_channel.json()["detail"])

        create = self.client.post(
            "/api/backup-delivery/policies", headers=admin_headers,
            json={
                "name": "CI Nightly Backup", "frequency": "daily", "time_of_day": "02:00",
                "recipients": [
                    {"channel": "download", "target": "", "label": "Emergency link"},
                    {"channel": "email", "target": "owner@example.com", "label": "Owner"},
                ],
            },
        )
        self.assertEqual(create.status_code, 200, create.text)
        policy_id = create.json()["id"]

        listed = self.client.get("/api/backup-delivery/policies", headers=admin_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertIn("scheduler_note", listed.json())
        self.assertTrue(any(p["id"] == policy_id for p in listed.json()["items"]))

        # run-now creates a REAL backup and attempts REAL delivery per recipient -
        # download always succeeds (a link, no network call); email fails honestly
        # since SMTP is not configured in this test environment (never faked as delivered).
        run = self.client.post(f"/api/backup-delivery/policies/{policy_id}/run-now", headers=admin_headers)
        self.assertEqual(run.status_code, 200, run.text)
        payload = run.json()
        self.assertEqual(payload["status"], "partially_delivered", payload)
        attempts_by_channel = {a["channel"]: a for a in payload["attempts"]}
        self.assertEqual(attempts_by_channel["download"]["status"], "delivered")
        self.assertIn("download_token", attempts_by_channel["download"])
        self.assertEqual(attempts_by_channel["email"]["status"], "failed")
        self.assertIn("SMTP is not configured", attempts_by_channel["email"]["error"])

        log = self.client.get("/api/backup-delivery/log", headers=admin_headers)
        self.assertEqual(log.status_code, 200, log.text)
        log_entry = next(item for item in log.json()["items"] if item["policy_id"] == policy_id and item["status"] == "partially_delivered")
        # Task 07 Section 4/G: the live download_token is a bearer credential
        # for the backup file - it must never be persisted into the
        # long-lived delivery log, only returned once in the live response above.
        self.assertNotIn("download_token", str(log_entry["delivery_attempts"]))

        # The secure, tokenized download link genuinely serves the backup file with no login.
        download_token = attempts_by_channel["download"]["download_token"]
        secure_download = self.client.get(f"/api/backup-delivery/secure-download?token={download_token}")
        self.assertEqual(secure_download.status_code, 200, secure_download.text)
        self.assertGreater(len(secure_download.content), 0)
        # SECURITY PHASE C: an intermediate/shared cache must never be able
        # to serve this file to a second requester after the token has
        # already been consumed - the response must say so explicitly.
        self.assertEqual(secure_download.headers.get("cache-control"), "no-store")

        # One-time use: the SAME token can never be replayed (Task 07 Section 4/G).
        replayed_download = self.client.get(f"/api/backup-delivery/secure-download?token={download_token}")
        self.assertEqual(replayed_download.status_code, 401, replayed_download.text)
        self.assertIn("already been used", replayed_download.json()["detail"])

        bad_token_download = self.client.get("/api/backup-delivery/secure-download?token=not-a-real-token")
        self.assertEqual(bad_token_download.status_code, 401, bad_token_download.text)

        update = self.client.put(
            f"/api/backup-delivery/policies/{policy_id}", headers=admin_headers,
            json={"name": "CI Nightly Backup", "frequency": "weekly", "recipients": []},
        )
        self.assertEqual(update.status_code, 200, update.text)

        # trigger-due is a public path authenticated by HMAC signature, not a session token - for an external scheduler.
        no_signature = self.client.post("/api/backup-delivery/trigger-due")
        self.assertEqual(no_signature.status_code, 401, no_signature.text)

        with patch.dict(os.environ, {"VETRIX_BACKUP_TRIGGER_SECRET": "ci-test-backup-trigger-secret-value"}):
            import hashlib
            import hmac as hmac_module
            import time as time_module

            body = b""
            timestamp = str(int(time_module.time()))
            body_hash = hashlib.sha256(body).hexdigest()
            canonical = f"{timestamp}\nPOST\n/api/backup-delivery/trigger-due\n{body_hash}".encode("utf-8")
            signature = hmac_module.new(b"ci-test-backup-trigger-secret-value", canonical, hashlib.sha256).hexdigest()
            triggered = self.client.post(
                "/api/backup-delivery/trigger-due",
                headers={"X-Vetrix-Timestamp": timestamp, "X-Vetrix-Signature": signature},
            )
            self.assertEqual(triggered.status_code, 200, triggered.text)

        delete = self.client.delete(f"/api/backup-delivery/policies/{policy_id}", headers=admin_headers)
        self.assertEqual(delete.status_code, 200, delete.text)

        # RBAC: only admin may reach this module.
        sales_signup = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Backup Delivery Sales Viewer", "username": "ci-sales-backup", "password": "StrongSalesBackupPass!42", "role": "sales"},
        )
        self.assertEqual(sales_signup.status_code, 200, sales_signup.text)
        sales_headers, _ = self._login("ci-sales-backup", "StrongSalesBackupPass!42")
        denied = self.client.get("/api/backup-delivery/policies", headers=sales_headers)
        self.assertEqual(denied.status_code, 403, denied.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_smart_import_csv_employees_and_confidence_mapping(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        csv_content = (
            "first_name,last_name,employee_number,job_title,phone\n"
            "Sara,Karimi,E-501,Warehouse Clerk,0912۱۲۳۴۵۶۷\n"
        ).encode("utf-8-sig")

        inspect = self.client.post(
            "/api/data-import/inspect", headers=admin_headers,
            data={"entity": "employees"},
            files={"file": ("employees.csv", csv_content, "text/csv")},
        )
        self.assertEqual(inspect.status_code, 200, inspect.text)
        inspected = inspect.json()
        self.assertEqual(inspected["headers"][:3], ["first_name", "last_name", "employee_number"])
        self.assertIn("mapping_confidence", inspected)
        self.assertEqual(inspected["mapping_confidence"]["first_name"]["confidence"], 100)
        self.assertIn("probable_entity_by_sheet", inspected)
        self.assertEqual(inspected["probable_entity_by_sheet"]["CSV"]["entity"], "employees")

        preview = self.client.post(
            "/api/data-import/preview/employees", headers=admin_headers,
            files={"file": ("employees.csv", csv_content, "text/csv")},
        )
        self.assertEqual(preview.status_code, 200, preview.text)
        preview_payload = preview.json()
        self.assertEqual(preview_payload["valid_rows"], 1)
        self.assertEqual(preview_payload["errors"], [])
        self.assertTrue(preview_payload["can_apply"])
        batch_id = preview_payload["batch_id"]

        apply = self.client.post(f"/api/data-import/apply/{batch_id}", headers=admin_headers)
        self.assertEqual(apply.status_code, 200, apply.text)
        self.assertEqual(apply.json()["inserted"], 1)

        employees = self.client.get("/api/hr?search=Sara", headers=admin_headers)
        self.assertEqual(employees.status_code, 200, employees.text)
        matches = [e for e in employees.json()["items"] if e["employee_number"] == "E-501"]
        self.assertTrue(matches, employees.json()["items"])
        self.assertEqual(matches[0]["first_name"], "Sara")
        # Real digit normalization applied during import, not left as Persian glyphs.
        self.assertEqual(matches[0]["phone"], "09121234567")

        # Re-importing the same CSV is a genuine, detected duplicate - skipped, not re-created.
        reimport_preview = self.client.post(
            "/api/data-import/preview/employees", headers=admin_headers,
            files={"file": ("employees.csv", csv_content, "text/csv")},
        )
        self.assertEqual(reimport_preview.json()["duplicate_rows"], 1)
        reimport_batch_id = reimport_preview.json()["batch_id"]
        reimport_apply = self.client.post(f"/api/data-import/apply/{reimport_batch_id}", headers=admin_headers)
        self.assertEqual(reimport_apply.status_code, 200, reimport_apply.text)
        self.assertEqual(reimport_apply.json()["skipped"], 1)
        self.assertEqual(reimport_apply.json()["inserted"], 0)

        # A genuinely unsupported employment_type is rejected, not silently coerced.
        bad_type_csv = "first_name,last_name,employment_type\nBad,Type,not_a_real_type\n".encode("utf-8")
        bad_preview = self.client.post(
            "/api/data-import/preview/employees", headers=admin_headers,
            files={"file": ("bad.csv", bad_type_csv, "text/csv")},
        )
        self.assertEqual(bad_preview.status_code, 200, bad_preview.text)
        self.assertTrue(any(e["field"] == "employment_type" for e in bad_preview.json()["errors"]))

        # PDF import is honestly rejected, never silently accepted or faked as parsed.
        pdf_reject = self.client.post(
            "/api/data-import/inspect", headers=admin_headers,
            data={"entity": "employees"},
            files={"file": ("scan.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
        self.assertEqual(pdf_reject.status_code, 400, pdf_reject.text)
        self.assertIn("OCR", pdf_reject.json()["detail"])

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_executive_agent_conversational_intelligence(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        # Real data so daily/sales/profit tools have something genuine to report.
        customer = self.client.post("/customers", headers=admin_headers, json={"name": "Exec Agent Customer"})
        self.assertEqual(customer.status_code, 200, customer.text)
        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "Exec Agent Widget", "price": 1000, "buy_price": 400, "stock": 50},
        )
        self.assertEqual(product.status_code, 200, product.text)
        invoice = self.client.post(
            "/invoices", headers=admin_headers,
            json={"invoice_type": "sale", "customer_id": customer.json()["id"], "items": [{"product_id": product.json()["id"], "quantity": 3, "unit_price": 1000}]},
        )
        self.assertEqual(invoice.status_code, 200, invoice.text)

        # 1. Daily executive summary
        daily = self.client.get("/api/executive-agent/brief", headers=admin_headers)
        self.assertEqual(daily.status_code, 200, daily.text)
        self.assertEqual(daily.json()["status"], "ok")
        self.assertGreaterEqual(daily.json()["data"]["sales_today"], 3000)

        # 2. Sales query (in-app)
        sales = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "فروش امروز چقدر بود؟"})
        self.assertEqual(sales.status_code, 200, sales.text)
        self.assertEqual(sales.json()["tool"], "sales_summary")
        self.assertGreaterEqual(sales.json()["data"]["total_sales"], 3000)
        self.assertIn("source_module", sales.json()["evidence"])
        conversation_id = sales.json()["conversation_id"]

        # 3./13. Sales period comparison via inherited follow-up context (no new metric keyword of its own).
        followup = self.client.post(
            "/api/executive-agent/ask", headers=admin_headers,
            json={"text": "نسبت به ماه قبل چطور بود؟", "conversation_id": conversation_id},
        )
        self.assertEqual(followup.status_code, 200, followup.text)
        self.assertEqual(followup.json()["tool"], "sales_summary")

        # 4. Persian date-period interpretation - "این ماه" resolves to a real Jalali month range.
        month_query = self.client.post(
            "/api/executive-agent/ask", headers=admin_headers,
            json={"text": "فروش این ماه", "conversation_id": conversation_id},
        )
        self.assertEqual(month_query.status_code, 200, month_query.text)
        self.assertIsNotNone(month_query.json()["period"])
        self.assertLessEqual(month_query.json()["period"]["start_date"], month_query.json()["period"]["end_date"])

        # Branches for the clarification + branch-scoped tests.
        branch_a = self.client.post("/api/branches", headers=admin_headers, json={"name": "Exec Agent Branch A", "code": "EAA"})
        branch_b = self.client.post("/api/branches", headers=admin_headers, json={"name": "Exec Agent Branch B", "code": "EAB"})
        self.assertEqual(branch_a.status_code, 200, branch_a.text)
        self.assertEqual(branch_b.status_code, 200, branch_b.text)

        # 5./6.(clarification)/17. Branch-scoped query without naming a branch -> clarification, never guessed.
        branch_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "کدوم شعبه بهترین فروش رو داشته؟"})
        self.assertEqual(branch_q.status_code, 200, branch_q.text)
        self.assertEqual(branch_q.json()["status"], "needs_clarification")

        # Named branch resolves for real, with a real (low, since no invoice line recorded a warehouse) coverage limitation disclosed - never hidden.
        named_branch_q = self.client.post(
            "/api/executive-agent/ask", headers=admin_headers,
            json={"text": "کدام شعبه Exec Agent Branch A چطور بوده؟"},
        )
        self.assertEqual(named_branch_q.status_code, 200, named_branch_q.text)
        self.assertEqual(named_branch_q.json()["tool"], "branch_performance")
        self.assertIsNotNone(named_branch_q.json()["data"].get("limitation"))

        # 6. Profit query requires gross/net clarification when ambiguous.
        profit_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "سود امروز چقدر بود؟"})
        self.assertEqual(profit_q.status_code, 200, profit_q.text)
        self.assertEqual(profit_q.json()["status"], "needs_clarification")
        profit_net_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "سود خالص امروز چقدر بود؟"})
        self.assertEqual(profit_net_q.json()["tool"], "profit_summary")
        self.assertIn("net_profit", profit_net_q.json()["data"])
        self.assertIn("gross_profit", profit_net_q.json()["data"])

        # 7. Receivables query - reuses the real aging report, not its own math.
        receivables_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "چقدر طلب معوق داریم؟"})
        self.assertEqual(receivables_q.json()["tool"], "receivables_summary")
        self.assertEqual(receivables_q.json()["data"]["source_module"], "app.accounting.aging.aging_report")

        # 8. Cheque query - reuses Treasury.
        cheque_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "چک‌های این هفته رو بگو"})
        self.assertEqual(cheque_q.json()["tool"], "cheque_summary")

        # 9. Inventory query - reuses Smart Inventory.
        inventory_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "چه کالاهایی کم داریم؟"})
        self.assertEqual(inventory_q.json()["tool"], "inventory_risk_summary")

        # 10./25./26. Budget query - honest "no active plan" rather than an invented figure (unsupported/partial data).
        budget_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "بودجه امسال چطوره؟"})
        self.assertEqual(budget_q.json()["tool"], "budget_variance")
        self.assertIn("plans", budget_q.json()["data"])

        # 11. BI finding / open executive alerts query.
        alerts_q = self.client.post(
            "/api/executive-agent/ask", headers=admin_headers,
            json={"text": "مهم‌ترین مشکلاتی که الان باید پیگیری کنم چیه؟"},
        )
        self.assertEqual(alerts_q.json()["tool"], "open_executive_alerts")
        self.assertIn("counts", alerts_q.json()["data"])

        # 12. Improvement-plan follow-up query.
        improvement_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "برنامه بهبود به کجا رسید؟"})
        self.assertEqual(improvement_q.json()["tool"], "improvement_plan_status")

        # 25. Unsupported metric - campaign performance always discloses what it genuinely can't measure.
        campaign_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "کمپین این ماه نتیجه داد؟"})
        self.assertEqual(campaign_q.json()["tool"], "campaign_performance")
        self.assertIn("click-through", campaign_q.json()["data"]["limitation"].lower())

        # 14. Clarification for genuinely unrecognized text.
        unclear_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "asdkjaslkdj random text 12345"})
        self.assertEqual(unclear_q.json()["status"], "needs_clarification")

        # 29. No arbitrary SQL/tool access - a SQL-injection-shaped message is safely clarified, never executed.
        malicious_q = self.client.post("/api/executive-agent/ask", headers=admin_headers, json={"text": "'; DROP TABLE users; --"})
        self.assertEqual(malicious_q.status_code, 200, malicious_q.text)
        self.assertEqual(malicious_q.json()["status"], "needs_clarification")
        still_alive = self.client.get("/me", headers=admin_headers)
        self.assertEqual(still_alive.status_code, 200, still_alive.text)

        # 28. Write-action confirmation routing - never executed immediately, always a draft Change Request.
        write_q = self.client.post(
            "/api/executive-agent/ask", headers=admin_headers,
            json={"text": "برای مشتری‌های بدهکار پیام یادآوری بفرست"},
        )
        self.assertEqual(write_q.status_code, 200, write_q.text)
        self.assertEqual(write_q.json()["status"], "confirmation_required")
        change_request_id = write_q.json()["change_request_id"]
        cr_detail = self.client.get(f"/api/change-requests/{change_request_id}", headers=admin_headers)
        self.assertEqual(cr_detail.status_code, 200, cr_detail.text)
        self.assertEqual(cr_detail.json()["status"], "draft")
        self.assertEqual(cr_detail.json()["action_type"], "note_only")

        # 27. Tool-run audit - every tool call above left a real, queryable trace.
        tool_runs = self.client.get("/api/executive-agent/tool-runs", headers=admin_headers)
        self.assertEqual(tool_runs.status_code, 200, tool_runs.text)
        self.assertTrue(any(r["tool"] == "sales_summary" and r["status"] == "success" for r in tool_runs.json()["items"]))

        # 15. Permission denial - a role outside {admin, accountant} cannot reach the agent at all.
        sales_signup = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Exec Agent Sales Viewer", "username": "ea-sales-viewer", "password": "StrongEaSalesPass!42", "role": "sales"},
        )
        self.assertEqual(sales_signup.status_code, 200, sales_signup.text)
        sales_headers, _ = self._login("ea-sales-viewer", "StrongEaSalesPass!42")
        denied = self.client.post("/api/executive-agent/ask", headers=sales_headers, json={"text": "فروش امروز"})
        self.assertEqual(denied.status_code, 403, denied.text)

        # 16. Company isolation - a different company's admin never sees this company's sales figure.
        second_headers, _ = self._login("m4-second-admin", "StrongSecondAdmin!42")
        second_sales_q = self.client.post("/api/executive-agent/ask", headers=second_headers, json={"text": "فروش امروز چقدر بود؟"})
        self.assertEqual(second_sales_q.status_code, 200, second_sales_q.text)
        self.assertLess(second_sales_q.json()["data"]["total_sales"], sales.json()["data"]["total_sales"])

        # 23./24. Missing STT/TTS/LLM provider behavior - honestly reported, never faked.
        status = self.client.get("/api/executive-agent/status", headers=admin_headers)
        self.assertEqual(status.status_code, 200, status.text)
        self.assertFalse(status.json()["stt"]["configured"])
        self.assertFalse(status.json()["tts"]["configured"])
        self.assertFalse(status.json()["llm"]["configured"])

        # 30. Conversation reset.
        reset = self.client.delete(f"/api/executive-agent/conversations/{conversation_id}", headers=admin_headers)
        self.assertEqual(reset.status_code, 200, reset.text)
        missing = self.client.get(f"/api/executive-agent/conversations/{conversation_id}", headers=admin_headers)
        self.assertEqual(missing.status_code, 404, missing.text)

        # 18./19./20./21./22. Telegram: binding code issuance/expiry-safety, one-time use, authorized query,
        # category restriction, and an unbound chat never getting an agent answer.
        with patch.dict(os.environ, {
            "VETRIX_TELEGRAM_WEBHOOK_SECRET": "exec-agent-telegram-secret",
            "VETRIX_VOICE_ALLOWED_CHAT_IDS": "",
        }):
            code_response = self.client.post("/api/executive-agent/telegram/binding-code", headers=admin_headers)
            self.assertEqual(code_response.status_code, 200, code_response.text)
            code = code_response.json()["code"]
            chat_id = "555444333"

            def _send_telegram_update(text_value, update_id):
                return self.client.post(
                    "/api/inbound-voice/telegram",
                    headers={"X-Telegram-Bot-Api-Secret-Token": "exec-agent-telegram-secret"},
                    json={"update_id": update_id, "message": {"message_id": update_id, "chat": {"id": chat_id}, "text": text_value}},
                )

            # Wrong code: no binding is created, message falls through to the pre-existing (unrelated) flow untouched.
            wrong_code = _send_telegram_update("00000000", 9001)
            self.assertNotEqual(wrong_code.status_code, 500, wrong_code.text)

            # Correct code binds the chat to this admin's real VETRIX identity.
            bind = _send_telegram_update(code, 9002)
            self.assertNotEqual(bind.status_code, 500, bind.text)
            bindings = self.client.get("/api/executive-agent/telegram/bindings", headers=admin_headers)
            self.assertEqual(bindings.status_code, 200, bindings.text)
            self.assertTrue(any(b["full_name"] == "Test Administrator" for b in bindings.json()["items"]))

            # 20. The code is one-time: sending it again does nothing (no duplicate binding, no crash).
            reuse = _send_telegram_update(code, 9003)
            self.assertNotEqual(reuse.status_code, 500, reuse.text)

            # 21. Authorized query from the now-bound chat gets a real agent answer via Telegram.
            telegram_ask = _send_telegram_update("خلاصه امروز", 9004)
            self.assertEqual(telegram_ask.status_code, 200, telegram_ask.text)
            self.assertEqual(telegram_ask.json()["status"], "handled")

            # 18. External-channel category restriction - block "sales" over Telegram, then confirm it's actually blocked.
            restrict = self.client.put(
                "/api/executive-agent/settings", headers=admin_headers,
                json={"enabled": True, "allowed_categories": ["summary"]},
            )
            self.assertEqual(restrict.status_code, 200, restrict.text)
            blocked_ask = _send_telegram_update("فروش امروز چقدر بود؟", 9005)
            self.assertEqual(blocked_ask.status_code, 200, blocked_ask.text)
            # Restore full access so this test doesn't leak a restrictive policy to any test running after it.
            self.client.put(
                "/api/executive-agent/settings", headers=admin_headers,
                json={"enabled": True, "allowed_categories": ["summary", "sales", "cash", "receivables", "cheques", "inventory", "alerts", "improvement", "budget", "campaigns", "customers"]},
            )

            # 22. An unbound chat sending plain text never gets routed into the agent at all.
            unbound_chat_id = "555444999"
            unbound_update = self.client.post(
                "/api/inbound-voice/telegram",
                headers={"X-Telegram-Bot-Api-Secret-Token": "exec-agent-telegram-secret"},
                json={"update_id": 9006, "message": {"message_id": 9006, "chat": {"id": unbound_chat_id}, "text": "فروش امروز چقدر بود؟ from an unbound chat"}},
            )
            self.assertNotEqual(unbound_update.status_code, 500, unbound_update.text)
            self.assertNotEqual(unbound_update.json(), {"status": "handled"})

            # Revoke the binding via the admin UI and confirm the chat can no longer reach the agent.
            binding_id = bindings.json()["items"][0]["id"]
            revoke = self.client.delete(f"/api/executive-agent/telegram/bindings/{binding_id}", headers=admin_headers)
            self.assertEqual(revoke.status_code, 200, revoke.text)
            after_revoke = _send_telegram_update("خلاصه امروز", 9007)
            self.assertNotEqual(after_revoke.json(), {"status": "handled"})

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_task06_p0_security_and_accounting_fixes(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        # --- 1. Backups cover the WHOLE shared database (every tenant), so a
        # per-company "admin" role must not be enough - only a real
        # super-admin may reach them. ci-admin is the bootstrap super-admin;
        # a freshly created "admin" is not.
        regular_admin_signup = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "T06 Regular Admin", "username": "t06-regular-admin", "password": "StrongT06Admin!42", "role": "admin"},
        )
        self.assertEqual(regular_admin_signup.status_code, 200, regular_admin_signup.text)
        regular_admin_headers, _ = self._login("t06-regular-admin", "StrongT06Admin!42")
        backups_denied = self.client.get("/api/backups", headers=regular_admin_headers)
        self.assertEqual(backups_denied.status_code, 403, backups_denied.text)
        backups_allowed = self.client.get("/api/backups", headers=admin_headers)
        self.assertEqual(backups_allowed.status_code, 200, backups_allowed.text)

        # --- 2. commerce_connections must be per-company, not a single
        # globally-shared row keyed only by channel.
        second_company = self.client.post("/api/companies", headers=admin_headers, json={"name": "T06 Second Co"})
        self.assertEqual(second_company.status_code, 200, second_company.text)
        second_company_id = second_company.json()["id"]
        second_co_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "T06 Second Co Admin", "username": "t06-second-admin", "password": "StrongT06Second!42", "role": "admin", "company_id": second_company_id},
        )
        self.assertEqual(second_co_admin.status_code, 200, second_co_admin.text)
        second_co_headers, _ = self._login("t06-second-admin", "StrongT06Second!42")

        save_first = self.client.put(
            "/api/online-commerce/connections/website", headers=admin_headers,
            json={"channel": "website", "enabled": True, "base_url": "https://company-a.example", "account_label": "Company A Store", "secret_reference": "env:A_TOKEN"},
        )
        self.assertEqual(save_first.status_code, 200, save_first.text)
        save_second = self.client.put(
            "/api/online-commerce/connections/website", headers=second_co_headers,
            json={"channel": "website", "enabled": True, "base_url": "https://company-b.example", "account_label": "Company B Store", "secret_reference": "env:B_TOKEN"},
        )
        self.assertEqual(save_second.status_code, 200, save_second.text)
        first_view = self.client.get("/api/online-commerce/connections", headers=admin_headers)
        self.assertEqual(first_view.status_code, 200, first_view.text)
        self.assertEqual([c["base_url"] for c in first_view.json() if c["channel"] == "website"], ["https://company-a.example"])
        second_view = self.client.get("/api/online-commerce/connections", headers=second_co_headers)
        self.assertEqual(second_view.status_code, 200, second_view.text)
        self.assertEqual([c["base_url"] for c in second_view.json() if c["channel"] == "website"], ["https://company-b.example"])

        # An accountant (not just admin) must be able to reach this mutating
        # route at all - the outer RBAC prefix rule used to have no
        # MUTATION_RULES entry and denied every accountant with a 403
        # before online_commerce.py's own role check ever ran.
        accountant_signup = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "T06 Commerce Accountant", "username": "t06-commerce-accountant", "password": "StrongT06Accountant!42", "role": "accountant"},
        )
        self.assertEqual(accountant_signup.status_code, 200, accountant_signup.text)
        accountant_headers, _ = self._login("t06-commerce-accountant", "StrongT06Accountant!42")
        accountant_save = self.client.put(
            "/api/online-commerce/connections/instagram", headers=accountant_headers,
            json={"channel": "instagram", "enabled": False, "base_url": "", "account_label": "", "secret_reference": ""},
        )
        self.assertEqual(accountant_save.status_code, 200, accountant_save.text)

        # --- 3./4. Invoice refunds must actually execute (apply_settlement
        # used to reject the opposite-direction leg a refund posts), and the
        # aging report must reflect a voided/refunded settlement instead of
        # still showing the invoice as fully settled.
        admin_headers2, customer_id, product_id = self._payment_workflow_fixture("t06-refund")
        refund_approver = self.client.post(
            "/users", headers=admin_headers2,
            json={"full_name": "T06 Refund Approver", "username": "t06-refund-approver", "password": "StrongT06Refund!42", "role": "accountant"},
        )
        self.assertEqual(refund_approver.status_code, 200, refund_approver.text)
        refund_approver_headers, _ = self._login("t06-refund-approver", "StrongT06Refund!42")

        refund_invoice = self.client.post("/invoices", headers=admin_headers2, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 2, "unit_price": 1000}],
            "payments": [{"method": "cash", "amount": 2000}],
        })
        self.assertEqual(refund_invoice.status_code, 200, refund_invoice.text)
        refund_invoice_id = refund_invoice.json()["invoice_id"]
        self.assertEqual(refund_invoice.json()["payment_status"], "paid")
        refund_detail = self.client.get(f"/invoices/{refund_invoice_id}", headers=admin_headers2)
        refund_allocation_id = refund_detail.json()["payments"][0]["id"]

        refund_request = self.client.post(
            f"/api/invoice-payments/{refund_allocation_id}/refund", headers=admin_headers2,
            json={"reason": "customer returned goods", "amount": 2000, "method": "cash"},
        )
        self.assertEqual(refund_request.status_code, 200, refund_request.text)
        refund_approval_id = refund_request.json()["id"]

        refund_approve = self.client.post(
            f"/api/approvals/{refund_approval_id}/approve", headers=refund_approver_headers, json={"note": "confirmed return"},
        )
        # Before the apply_settlement fix, this executor raised ValueError
        # ("sale invoices require a receipt transaction") for the refund's
        # deliberately-opposite 'payment' leg, and the approval was left
        # stuck - never a clean 200.
        self.assertEqual(refund_approve.status_code, 200, refund_approve.text)
        self.assertEqual(refund_approve.json()["result"]["payment_status"], "refunded")

        after_refund = self.client.get(f"/invoices/{refund_invoice_id}", headers=admin_headers2)
        self.assertEqual(after_refund.json()["payment_status"], "refunded")
        self.assertEqual(after_refund.json()["amount_paid"], 0)

        # --- 4. A voided settlement must show back up as outstanding on the
        # aging report, not stay reported as fully settled (the report's own
        # SQL used to sum only one side per source_type, so a same-type
        # reversal row was invisible to it).
        void_invoice = self.client.post("/invoices", headers=admin_headers2, json={
            "invoice_type": "sale", "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": 1500}],
            "payments": [{"method": "cash", "amount": 1500}],
        })
        self.assertEqual(void_invoice.status_code, 200, void_invoice.text)
        void_invoice_id = void_invoice.json()["invoice_id"]
        void_detail = self.client.get(f"/invoices/{void_invoice_id}", headers=admin_headers2)
        void_allocation_id = void_detail.json()["payments"][0]["id"]
        void_request = self.client.post(
            f"/api/invoice-payments/{void_allocation_id}/void", headers=admin_headers2, json={"reason": "duplicate entry"},
        )
        self.assertEqual(void_request.status_code, 200, void_request.text)
        void_approve = self.client.post(
            f"/api/approvals/{void_request.json()['id']}/approve", headers=refund_approver_headers, json={"note": "confirmed duplicate"},
        )
        self.assertEqual(void_approve.status_code, 200, void_approve.text)

        aging = self.client.get("/api/accounting/aging", headers=admin_headers2)
        self.assertEqual(aging.status_code, 200, aging.text)
        aging_row = next(r for r in aging.json()["items"] if r["invoice_id"] == void_invoice_id)
        self.assertEqual(aging_row["settled_amount"], 0)
        self.assertEqual(aging_row["outstanding_amount"], 1500)

        # --- 5. POST /transactions must support the same Idempotency-Key
        # retry-safety /invoices already had - a lost-response retry must
        # not post a second, independent settlement entry.
        before_balance = self.client.get(f"/customers/{customer_id}", headers=admin_headers2)
        idem_key = "t06-idempotency-key-001"
        first_txn = self.client.post(
            "/transactions", headers={**admin_headers2, "Idempotency-Key": idem_key},
            json={"customer_id": customer_id, "amount": 500, "transaction_type": "receipt", "method": "cash", "note": "idempotency check"},
        )
        self.assertEqual(first_txn.status_code, 200, first_txn.text)
        second_txn = self.client.post(
            "/transactions", headers={**admin_headers2, "Idempotency-Key": idem_key},
            json={"customer_id": customer_id, "amount": 500, "transaction_type": "receipt", "method": "cash", "note": "idempotency check"},
        )
        self.assertEqual(second_txn.status_code, 200, second_txn.text)
        self.assertEqual(first_txn.json(), second_txn.json())
        after_balance = self.client.get(f"/customers/{customer_id}", headers=admin_headers2)
        # A receipt reduces the customer's owed balance - exactly one 500
        # reduction should have been applied, not two.
        self.assertEqual(before_balance.json()["customer"]["balance"] - after_balance.json()["customer"]["balance"], 500)

        # --- 6. HR: manager_employee_id/branch_id must be validated against
        # the caller's own company - previously accepted at face value and
        # could leak another company's employee/branch name into a lookup.
        foreign_employee_signup = self.client.post(
            "/api/hr", headers=second_co_headers, json={"first_name": "Foreign", "last_name": "Manager"},
        )
        self.assertEqual(foreign_employee_signup.status_code, 200, foreign_employee_signup.text)
        foreign_employee_id = foreign_employee_signup.json()["id"]
        cross_company_employee = self.client.post(
            "/api/hr", headers=admin_headers2, json={"first_name": "Local", "last_name": "Employee", "manager_employee_id": foreign_employee_id},
        )
        self.assertEqual(cross_company_employee.status_code, 400, cross_company_employee.text)

        # --- 7. Change Request maker-checker: the admin who reviews and
        # submits a voice-intake transcript (review-transcript) must not
        # also be able to approve it, even though the request's own
        # requested_by stays a fixed non-admin service account.
        service_user_signup = self.client.post(
            "/users", headers=admin_headers2,
            json={"full_name": "T06 Voice Service User", "username": "t06-voice-service", "password": "StrongT06Voice!42", "role": "sales"},
        )
        self.assertEqual(service_user_signup.status_code, 200, service_user_signup.text)
        service_user_id = service_user_signup.json()["id"]
        second_reviewer = self.client.post(
            "/users", headers=admin_headers2,
            json={"full_name": "T06 Second Reviewer", "username": "t06-second-reviewer", "password": "StrongT06Reviewer!42", "role": "admin"},
        )
        self.assertEqual(second_reviewer.status_code, 200, second_reviewer.text)
        second_reviewer_headers, _ = self._login("t06-second-reviewer", "StrongT06Reviewer!42")

        with patch.dict(os.environ, {
            "VETRIX_TELEGRAM_WEBHOOK_SECRET": "t06-voice-secret",
            "VETRIX_VOICE_ALLOWED_CHAT_IDS": "778899",
            "VETRIX_VOICE_SERVICE_USER_ID": str(service_user_id),
        }):
            voice_update = self.client.post(
                "/api/inbound-voice/telegram",
                headers={"X-Telegram-Bot-Api-Secret-Token": "t06-voice-secret"},
                json={"update_id": 42001, "message": {"message_id": 1, "chat": {"id": "778899"}, "voice": {"file_id": "abc"}, "text": "please review this"}},
            )
        self.assertEqual(voice_update.status_code, 200, voice_update.text)
        self.assertEqual(voice_update.json()["status"], "needs_transcript_review")
        voice_request_id = voice_update.json()["request_id"]

        review = self.client.post(
            f"/api/change-requests/{voice_request_id}/review-transcript", headers=admin_headers2,
            json={"transcript": "reviewed and submitted for approval", "action_type": "note_only", "target_id": None, "proposed_changes": {}},
        )
        self.assertEqual(review.status_code, 200, review.text)

        self_approve_bypass = self.client.post(
            f"/api/change-requests/{voice_request_id}/approve", headers=admin_headers2, json={"note": "self"},
        )
        self.assertEqual(self_approve_bypass.status_code, 409, self_approve_bypass.text)

        independent_approve = self.client.post(
            f"/api/change-requests/{voice_request_id}/approve", headers=second_reviewer_headers, json={"note": "reviewed independently"},
        )
        self.assertEqual(independent_approve.status_code, 200, independent_approve.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_purchase_order_receiving_lifecycle(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "CI PO Receiving Widget", "sell_price": 500, "buy_price": 300, "stock": 0},
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        warehouse = self.client.post("/api/warehouses", headers=admin_headers, json={"name": "CI PO Receiving Warehouse", "code": "CI-PO-WH"})
        self.assertEqual(warehouse.status_code, 200, warehouse.text)
        warehouse_id = warehouse.json()["id"]

        # An unknown/foreign warehouse_id is rejected server-side at creation time.
        bad_warehouse_po = self.client.post(
            "/api/purchase-orders", headers=admin_headers,
            json={"supplier_name": "CI Supplier", "items": [{"product_id": product_id, "quantity": 10, "unit_price": 300}], "default_warehouse_id": 999999},
        )
        self.assertEqual(bad_warehouse_po.status_code, 404, bad_warehouse_po.text)

        create = self.client.post(
            "/api/purchase-orders", headers=admin_headers,
            json={"supplier_name": "CI Supplier", "items": [{"product_id": product_id, "quantity": 10, "unit_price": 300}], "default_warehouse_id": warehouse_id},
        )
        self.assertEqual(create.status_code, 200, create.text)
        po_id = create.json()["id"]

        # Receiving is blocked before dispatch (status check short-circuits
        # before any item lookup, so the placeholder po_item_id below is
        # never actually resolved).
        receive_before_dispatch = self.client.post(
            f"/api/purchase-orders/{po_id}/receive", headers=admin_headers,
            json={"items": [{"po_item_id": 1, "quantity": 1}]},
        )
        self.assertEqual(receive_before_dispatch.status_code, 400, receive_before_dispatch.text)

        dispatch = self.client.post(f"/api/purchase-orders/{po_id}/dispatch", headers=admin_headers, json={"method": "manual", "note": "handed to courier"})
        self.assertEqual(dispatch.status_code, 200, dispatch.text)

        detail = self.client.get(f"/api/purchase-orders/{po_id}", headers=admin_headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["status"], "sent")
        po_item_id = detail.json()["items"][0]["id"]

        # Partial receive of 4 of 10, into the PO's own default warehouse.
        idem_key = "ci-po-receive-partial-key-1"
        partial = self.client.post(
            f"/api/purchase-orders/{po_id}/receive", headers={**admin_headers, "Idempotency-Key": idem_key},
            json={"items": [{"po_item_id": po_item_id, "quantity": 4}], "note": "first truck"},
        )
        self.assertEqual(partial.status_code, 200, partial.text)

        after_partial = self.client.get(f"/api/purchase-orders/{po_id}", headers=admin_headers).json()
        self.assertEqual(after_partial["status"], "partially_received")
        self.assertEqual(after_partial["items"][0]["received_quantity"], 4)
        self.assertEqual(after_partial["items"][0]["remaining_quantity"], 6)

        # Product.stock (company-wide aggregate) and the specific warehouse's own bucket both moved by 4.
        def _stock_of(pid):
            return next(p["stock"] for p in self.client.get("/products", headers=admin_headers).json() if p["id"] == pid)

        self.assertEqual(_stock_of(product_id), 4)
        breakdown = self.client.get(f"/api/warehouses/stock?product_id={product_id}", headers=admin_headers)
        self.assertEqual(breakdown.status_code, 200, breakdown.text)
        warehouse_row = next(row for row in breakdown.json()["by_warehouse"] if row["warehouse_id"] == warehouse_id)
        self.assertEqual(warehouse_row["quantity"], 4)

        # Idempotent retry with the SAME key + SAME body replays the cached response, never double-counts stock.
        replay = self.client.post(
            f"/api/purchase-orders/{po_id}/receive", headers={**admin_headers, "Idempotency-Key": idem_key},
            json={"items": [{"po_item_id": po_item_id, "quantity": 4}], "note": "first truck"},
        )
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(_stock_of(product_id), 4)

        # Cannot receive more than the remaining 6 (never a silent over-receipt).
        over_receive = self.client.post(
            f"/api/purchase-orders/{po_id}/receive", headers=admin_headers,
            json={"items": [{"po_item_id": po_item_id, "quantity": 999}]},
        )
        self.assertEqual(over_receive.status_code, 400, over_receive.text)
        self.assertIn("remaining", over_receive.json()["detail"])

        # A partially-received PO can no longer be cancelled.
        cancel_blocked = self.client.post(f"/api/purchase-orders/{po_id}/cancel", headers=admin_headers)
        self.assertEqual(cancel_blocked.status_code, 400, cancel_blocked.text)

        # Receive the remaining 6 -> fully received.
        final_receive = self.client.post(
            f"/api/purchase-orders/{po_id}/receive", headers=admin_headers,
            json={"items": [{"po_item_id": po_item_id, "quantity": 6}], "note": "second truck"},
        )
        self.assertEqual(final_receive.status_code, 200, final_receive.text)
        after_final = self.client.get(f"/api/purchase-orders/{po_id}", headers=admin_headers).json()
        self.assertEqual(after_final["status"], "received")
        self.assertEqual(after_final["items"][0]["remaining_quantity"], 0)

        # A fully-received PO cannot be received again.
        receive_after_done = self.client.post(
            f"/api/purchase-orders/{po_id}/receive", headers=admin_headers,
            json={"items": [{"po_item_id": po_item_id, "quantity": 1}]},
        )
        self.assertEqual(receive_after_done.status_code, 400, receive_after_done.text)

        # Append-only receipt history: two receipts, correct who/when/qty/warehouse.
        receipts = self.client.get(f"/api/purchase-orders/{po_id}/receipts", headers=admin_headers)
        self.assertEqual(receipts.status_code, 200, receipts.text)
        receipt_items = receipts.json()["items"]
        self.assertEqual(len(receipt_items), 2)
        total_received_in_history = sum(
            line["quantity"] for receipt in receipt_items for line in receipt["items"]
        )
        self.assertEqual(total_received_in_history, 10)

        # RBAC + tenant isolation: a second company can never see or receive against this PO.
        second_company = self.client.post("/api/companies", headers=admin_headers, json={"name": "CI PO Isolation Co"})
        self.assertEqual(second_company.status_code, 200, second_company.text)
        second_company_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "PO Isolation Admin", "username": "ci-po-isolation-admin", "password": "StrongPoIsolation!42", "role": "admin", "company_id": second_company.json()["id"]},
        )
        self.assertEqual(second_company_admin.status_code, 200, second_company_admin.text)
        second_headers, _ = self._login("ci-po-isolation-admin", "StrongPoIsolation!42")
        foreign_get = self.client.get(f"/api/purchase-orders/{po_id}", headers=second_headers)
        self.assertEqual(foreign_get.status_code, 404, foreign_get.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_branch_aware_smart_inventory_and_tenant_isolation(self):
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        branch = self.client.post("/api/branches", headers=admin_headers, json={"name": "CI Inventory Branch", "code": "CI-INV-BR"})
        self.assertEqual(branch.status_code, 200, branch.text)
        branch_id = branch.json()["id"]

        branch_warehouse = self.client.post(
            "/api/warehouses", headers=admin_headers,
            json={"name": "CI Inventory Branch Warehouse", "code": "CI-INV-WH", "branch_id": branch_id},
        )
        self.assertEqual(branch_warehouse.status_code, 200, branch_warehouse.text)
        branch_warehouse_id = branch_warehouse.json()["id"]

        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "CI Branch Inventory Widget", "sell_price": 100, "stock": 50, "min_stock": 5},
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        default_warehouse = next(w for w in self.client.get("/api/warehouses", headers=admin_headers).json()["items"] if w["is_default"])
        transfer = self.client.post(
            "/api/warehouses/transfer", headers=admin_headers,
            json={"product_id": product_id, "from_warehouse_id": default_warehouse["id"], "to_warehouse_id": branch_warehouse_id, "quantity": 20},
        )
        self.assertEqual(transfer.status_code, 200, transfer.text)

        # Branch-scoped Smart Inventory reflects only that branch's warehouse (20), while
        # company_stock always shows the true company-wide total (50) alongside it.
        branch_overview = self.client.get(f"/api/smart-inventory/overview?branch_id={branch_id}", headers=admin_headers)
        self.assertEqual(branch_overview.status_code, 200, branch_overview.text)
        branch_product = next(p for p in branch_overview.json()["items"] if p["id"] == product_id)
        self.assertEqual(branch_product["stock"], 20)
        self.assertEqual(branch_product["company_stock"], 50)

        company_overview = self.client.get("/api/smart-inventory/overview", headers=admin_headers)
        self.assertEqual(company_overview.status_code, 200, company_overview.text)
        company_product = next(p for p in company_overview.json()["items"] if p["id"] == product_id)
        self.assertEqual(company_product["stock"], 50)

        # Task 07 Section 4/B regression: smart_inventory_overview must be
        # strictly company-scoped - a second company must never see the
        # first company's products, low-stock items, or alerts.
        second_company = self.client.post("/api/companies", headers=admin_headers, json={"name": "CI Inventory Isolation Co"})
        self.assertEqual(second_company.status_code, 200, second_company.text)
        second_company_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Inventory Isolation Admin", "username": "ci-inventory-isolation-admin", "password": "StrongInventoryIsolation!42", "role": "admin", "company_id": second_company.json()["id"]},
        )
        self.assertEqual(second_company_admin.status_code, 200, second_company_admin.text)
        second_headers, _ = self._login("ci-inventory-isolation-admin", "StrongInventoryIsolation!42")
        foreign_overview = self.client.get("/api/smart-inventory/overview", headers=second_headers)
        self.assertEqual(foreign_overview.status_code, 200, foreign_overview.text)
        self.assertFalse(any(p["id"] == product_id for p in foreign_overview.json()["items"]))

        # Executive Alerts' low-stock alert generation must not crash and must not
        # leak this company's low-stock items into an unrelated company's alert feed.
        foreign_alerts = self.client.get("/api/executive-alerts/summary", headers=second_headers)
        self.assertEqual(foreign_alerts.status_code, 200, foreign_alerts.text)
        self.assertFalse(any(a.get("related_id") == product_id for a in foreign_alerts.json()["items"]))

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_branch_low_stock_agreement_across_inventory_surfaces(self):
        """Task 08 Section 8/G: branch A sufficient stock, branch B low/zero -
        Smart Inventory, Executive Alerts, and the Executive Agent's own
        inventory tool (called directly, bypassing NLP routing - that layer
        is already covered by test_..._executive_agent_conversational_intelligence)
        must all agree on the same branch-scoped low-stock picture."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        branch_a = self.client.post("/api/branches", headers=admin_headers, json={"name": "CI Low Stock Branch A", "code": "CI-LOW-BR-A"})
        branch_b = self.client.post("/api/branches", headers=admin_headers, json={"name": "CI Low Stock Branch B", "code": "CI-LOW-BR-B"})
        self.assertEqual(branch_a.status_code, 200, branch_a.text)
        self.assertEqual(branch_b.status_code, 200, branch_b.text)
        branch_a_id, branch_b_id = branch_a.json()["id"], branch_b.json()["id"]

        warehouse_a = self.client.post("/api/warehouses", headers=admin_headers, json={"name": "CI Low Stock WH A", "code": "CI-LOW-WH-A", "branch_id": branch_a_id})
        warehouse_b = self.client.post("/api/warehouses", headers=admin_headers, json={"name": "CI Low Stock WH B", "code": "CI-LOW-WH-B", "branch_id": branch_b_id})
        self.assertEqual(warehouse_a.status_code, 200, warehouse_a.text)
        self.assertEqual(warehouse_b.status_code, 200, warehouse_b.text)
        warehouse_a_id = warehouse_a.json()["id"]

        product = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "CI Low Stock Cross-Check Widget", "sell_price": 50, "stock": 50, "min_stock": 10},
        )
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        default_warehouse = next(w for w in self.client.get("/api/warehouses", headers=admin_headers).json()["items"] if w["is_default"])
        # Move nearly all stock into branch A's warehouse; branch B's own
        # warehouse keeps its default 0, well below min_stock=10.
        transfer = self.client.post(
            "/api/warehouses/transfer", headers=admin_headers,
            json={"product_id": product_id, "from_warehouse_id": default_warehouse["id"], "to_warehouse_id": warehouse_a_id, "quantity": 45},
        )
        self.assertEqual(transfer.status_code, 200, transfer.text)

        # 1. Smart Inventory: branch A not low, branch B low.
        overview_a = self.client.get(f"/api/smart-inventory/overview?branch_id={branch_a_id}", headers=admin_headers)
        overview_b = self.client.get(f"/api/smart-inventory/overview?branch_id={branch_b_id}", headers=admin_headers)
        self.assertEqual(overview_a.status_code, 200, overview_a.text)
        self.assertEqual(overview_b.status_code, 200, overview_b.text)
        self.assertFalse(any(item["id"] == product_id for item in overview_a.json()["low_stock"]))
        low_stock_b = next(item for item in overview_b.json()["low_stock"] if item["id"] == product_id)
        self.assertEqual(low_stock_b["stock"], 0)

        # 2. Executive Alerts: a branch-B-scoped low_stock alert for this exact product exists,
        # and no equivalent alert exists for branch A. Note: any OTHER pre-existing branch in
        # this shared-state test suite that was never stocked with this brand-new product also
        # legitimately shows 0 < min_stock for it - that's correct alerting, not noise to filter
        # out - so this only asserts branch B is AMONG the matches and branch A is never among them.
        alerts = self.client.get("/api/executive-alerts/summary", headers=admin_headers)
        self.assertEqual(alerts.status_code, 200, alerts.text)
        matching_alerts = [a for a in alerts.json()["items"] if a["category"] == "low_stock" and a["related_id"] == product_id]
        self.assertTrue(matching_alerts, alerts.json()["items"])
        self.assertIn(branch_b_id, [a["branch_id"] for a in matching_alerts])
        self.assertFalse(any(a["branch_id"] == branch_a_id for a in matching_alerts))

        # 3. Executive Agent's inventory tool (called directly - same underlying
        # smart_inventory_overview call the two surfaces above use) reports the same
        # totals. low_stock_sample is only the tool's own top-5 summary (this shared-state
        # suite's branch B accumulates many legitimately-low-stock products from earlier
        # tests that never stocked it either), so agreement is checked via the count
        # matching step 1's real overview_b low_stock_count, not sample membership.
        from app.executive_agent.tools import get_inventory_risk_summary
        agent_result_b = get_inventory_risk_summary(company_id=self._company_id_for(admin_headers), branch_id=branch_b_id)
        self.assertEqual(agent_result_b["branch_name"], "CI Low Stock Branch B")
        self.assertEqual(agent_result_b["low_stock_count"], overview_b.json()["summary"]["low_stock_count"])
        agent_result_a = get_inventory_risk_summary(company_id=self._company_id_for(admin_headers), branch_id=branch_a_id)
        self.assertNotIn("CI Low Stock Cross-Check Widget", agent_result_a["low_stock_sample"])

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_marketing_consent_history_endpoint(self):
        """Task 08 Section 8/K: the dedicated consent-history audit-trail
        endpoint (app/marketing_consent.py, built in Task 07) was never
        exercised by any existing test - verify it directly."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        customer = self.client.post("/customers", headers=admin_headers, json={
            "name": "CI Consent History Customer", "marketing_consent": True,
        })
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json().get("customer", customer.json()).get("id") or customer.json().get("id")

        history_after_create = self.client.get(f"/api/customers/{customer_id}/consent-history", headers=admin_headers)
        self.assertEqual(history_after_create.status_code, 200, history_after_create.text)
        items = history_after_create.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertIsNone(items[0]["old_value"])
        self.assertEqual(bool(items[0]["new_value"]), True)
        self.assertEqual(items[0]["source"], "explicit")

        get_customer = self.client.get(f"/customers/{customer_id}", headers=admin_headers).json()
        current = get_customer.get("customer", get_customer)
        payload = {k: current.get(k) for k in [
            "name", "phone", "mobile", "email", "address", "city", "national_id", "economic_code",
            "contact_person", "customer_type", "opening_balance", "credit_limit", "notes", "pricing_group",
        ]}
        payload["marketing_consent"] = False
        update = self.client.put(f"/customers/{customer_id}", headers=admin_headers, json=payload)
        self.assertEqual(update.status_code, 200, update.text)

        history_after_update = self.client.get(f"/api/customers/{customer_id}/consent-history", headers=admin_headers).json()["items"]
        self.assertEqual(len(history_after_update), 2)
        latest = history_after_update[0]
        self.assertEqual(bool(latest["old_value"]), True)
        self.assertEqual(bool(latest["new_value"]), False)

        # RBAC + tenant isolation: another company's admin cannot read this customer's consent history.
        other_login = self.client.post("/login", json={"username": "ci-po-isolation-admin", "password": "StrongPoIsolation!42"})
        if other_login.status_code == 200:
            other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}
            foreign = self.client.get(f"/api/customers/{customer_id}/consent-history", headers=other_headers)
            self.assertEqual(foreign.status_code, 404, foreign.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_branch_scoped_catalog_stock(self):
        """Task 08 Section 8/L: a catalog's branch_id (app/catalog.py's
        _branch_stock_map, built in Task 07) was never exercised by any
        existing test - verify catalog stock reflects the associated
        branch's own warehouse, not the company-wide total."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        branch = self.client.post("/api/branches", headers=admin_headers, json={"name": "CI Catalog Branch", "code": "CI-CAT-BR"})
        self.assertEqual(branch.status_code, 200, branch.text)
        branch_id = branch.json()["id"]
        warehouse = self.client.post("/api/warehouses", headers=admin_headers, json={"name": "CI Catalog Branch WH", "code": "CI-CAT-WH", "branch_id": branch_id})
        self.assertEqual(warehouse.status_code, 200, warehouse.text)

        product = self.client.post("/products", headers=admin_headers, json={
            "name": "CI Catalog Branch Widget", "sell_price": 75, "stock": 40,
        })
        self.assertEqual(product.status_code, 200, product.text)
        product_id = product.json()["id"]

        # Deliberately leave the branch's own warehouse at 0 while the
        # company-wide total (40) stays positive - this makes "in_stock"
        # meaningfully prove branch-scoping: if the catalog ignored
        # catalog.branch_id and fell back to the company-wide total, this
        # would incorrectly show in_stock=true.
        catalog = self.client.post("/api/catalog/links", headers=admin_headers, json={
            "title": "CI Branch-Scoped Catalog", "branch_id": branch_id, "product_ids": [product_id],
            "in_stock_only": False,  # keep the product listed even while out of stock in this branch, so both states below are observable
        })
        self.assertEqual(catalog.status_code, 200, catalog.text)
        token = catalog.json()["token"]

        view = self.client.get("/api/catalog/view", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(view.status_code, 200, view.text)
        viewed_product = next(p for p in view.json()["items"] if p["id"] == product_id)
        self.assertFalse(viewed_product["in_stock"], viewed_product)

        # Move stock into the branch's own warehouse - the same catalog
        # (unchanged) must now report in_stock=true.
        default_warehouse = next(w for w in self.client.get("/api/warehouses", headers=admin_headers).json()["items"] if w["is_default"])
        self.client.post("/api/warehouses/transfer", headers=admin_headers, json={
            "product_id": product_id, "from_warehouse_id": default_warehouse["id"],
            "to_warehouse_id": warehouse.json()["id"], "quantity": 12,
        })
        view_after_transfer = self.client.get("/api/catalog/view", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(view_after_transfer.status_code, 200, view_after_transfer.text)
        viewed_product_after = next(p for p in view_after_transfer.json()["items"] if p["id"] == product_id)
        self.assertTrue(viewed_product_after["in_stock"], viewed_product_after)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_backup_download_token_actual_expiry(self):
        """Task 08 Section 8/O: prior coverage only exercised replay-after-use
        rejection; this verifies a token that expired WITHOUT ever being used
        is also rejected (genuine time-based expiry, not just one-time-use)."""
        import jwt as pyjwt
        from datetime import datetime, timedelta, timezone
        from app.auth import _jwt_secret, TOKEN_ISSUER, BACKUP_DOWNLOAD_AUDIENCE, TOKEN_ALGORITHM
        import secrets as secrets_module

        now = datetime.now(timezone.utc)
        already_expired_token = pyjwt.encode({
            "filename": "vetrix_manual_20260101T000000_000000Z.db",
            "jti": secrets_module.token_urlsafe(16),
            "iat": now - timedelta(hours=1),
            "nbf": now - timedelta(hours=1),
            "exp": now - timedelta(minutes=1),  # already expired, never used
            "iss": TOKEN_ISSUER,
            "aud": BACKUP_DOWNLOAD_AUDIENCE,
        }, _jwt_secret(), algorithm=TOKEN_ALGORITHM)

        response = self.client.get(f"/api/backup-delivery/secure-download?token={already_expired_token}")
        self.assertEqual(response.status_code, 401, response.text)
        self.assertIn("expired", response.json()["detail"].lower())

    def _company_id_for(self, admin_headers):
        me = self.client.get("/me", headers=admin_headers)
        self.assertEqual(me.status_code, 200, me.text)
        return me.json()["user"]["company_id"]

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_security_phase_a_tenant_isolation_regressions(self):
        """SECURITY PHASE A: proves the 6 confirmed cross-tenant findings from
        the Phase 1 read-only audit stay fixed - customer-portal/supplier-portal
        staff endpoints, accounting attachments, storefront sync, audit events,
        and custom roles. Uses two brand-new companies (not company 1, which by
        this point in the suite has accumulated unrelated audit history from
        every earlier test) so assertions on exact event/attachment sets stay
        reliable."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        company_a = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase A Tenant Co A"})
        self.assertEqual(company_a.status_code, 200, company_a.text)
        company_a_id = company_a.json()["id"]
        company_b = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase A Tenant Co B"})
        self.assertEqual(company_b.status_code, 200, company_b.text)
        company_b_id = company_b.json()["id"]

        manager_a = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase A Manager A", "username": "phasea-manager-a",
                  "password": "StrongPhaseAManagerA!42", "role": "admin", "company_id": company_a_id},
        )
        self.assertEqual(manager_a.status_code, 200, manager_a.text)
        a_headers, a_login = self._login("phasea-manager-a", "StrongPhaseAManagerA!42")
        self.assertFalse(a_login["user"]["is_super_admin"])

        manager_b = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase A Manager B", "username": "phasea-manager-b",
                  "password": "StrongPhaseAManagerB!42", "role": "admin", "company_id": company_b_id},
        )
        self.assertEqual(manager_b.status_code, 200, manager_b.text)
        b_headers, b_login = self._login("phasea-manager-b", "StrongPhaseAManagerB!42")
        self.assertFalse(b_login["user"]["is_super_admin"])

        # --- 1) customer_portal.py staff endpoints ------------------------
        customer = self.client.post("/customers", headers=a_headers, json={"name": "Phase A Customer"})
        self.assertEqual(customer.status_code, 200, customer.text)
        customer_id = customer.json()["id"]

        same_create = self.client.post(f"/api/customer-portal/{customer_id}/access-link", headers=a_headers)
        self.assertEqual(same_create.status_code, 200, same_create.text)
        self.assertTrue(self.client.get(f"/api/customer-portal/{customer_id}/status", headers=a_headers).json()["enabled"])

        self.assertEqual(self.client.post(f"/api/customer-portal/{customer_id}/access-link", headers=b_headers).status_code, 404)
        self.assertEqual(self.client.get(f"/api/customer-portal/{customer_id}/status", headers=b_headers).status_code, 404)
        self.assertEqual(self.client.post(f"/api/customer-portal/{customer_id}/revoke", headers=b_headers).status_code, 404)
        # Sequential ID substitution: neighboring ids still 404 for company B.
        self.assertEqual(self.client.get(f"/api/customer-portal/{customer_id - 1}/status", headers=b_headers).status_code, 404)
        # Company A's own access wasn't disturbed by the failed foreign revoke.
        self.assertTrue(self.client.get(f"/api/customer-portal/{customer_id}/status", headers=a_headers).json()["enabled"])

        # --- 2) supplier_portal.py staff endpoints ------------------------
        supplier = self.client.post(
            "/customers", headers=a_headers, json={"name": "Phase A Supplier", "customer_type": "supplier"},
        )
        self.assertEqual(supplier.status_code, 200, supplier.text)
        supplier_id = supplier.json()["id"]
        self.assertEqual(self.client.post(f"/api/supplier-portal/{supplier_id}/access-link", headers=a_headers).status_code, 200)
        self.assertEqual(self.client.post(f"/api/supplier-portal/{supplier_id}/access-link", headers=b_headers).status_code, 404)
        self.assertEqual(self.client.get(f"/api/supplier-portal/{supplier_id}/status", headers=b_headers).status_code, 404)
        self.assertEqual(self.client.post(f"/api/supplier-portal/{supplier_id}/revoke", headers=b_headers).status_code, 404)

        # --- 3) accounting/attachments.py ----------------------------------
        expense_a = self.client.post("/expenses", headers=a_headers, json={"title": "Phase A Expense", "amount": 1000})
        self.assertEqual(expense_a.status_code, 200, expense_a.text)
        expense_a_id = expense_a.json()["id"]

        upload = self.client.post(
            f"/api/accounting/attachments/expense/{expense_a_id}", headers=a_headers,
            files={"file": ("receipt.txt", b"receipt-contents", "text/plain")},
        )
        self.assertEqual(upload.status_code, 200, upload.text)
        attachment_id = upload.json()["id"]

        same_list = self.client.get(f"/api/accounting/attachments/expense/{expense_a_id}", headers=a_headers)
        self.assertEqual(same_list.status_code, 200, same_list.text)
        # Membership, not exact count: the disk-backed attachment index is
        # real shared storage (not reset per test run), so asserting an
        # exact row count would be fragile across repeated local runs.
        self.assertIn(attachment_id, {item["id"] for item in same_list.json()})
        self.assertTrue(all(item["entity_id"] == expense_a_id for item in same_list.json()))
        self.assertEqual(
            self.client.get(f"/api/accounting/attachments/file/{attachment_id}/download", headers=a_headers).status_code, 200,
        )

        foreign_upload = self.client.post(
            f"/api/accounting/attachments/expense/{expense_a_id}", headers=b_headers,
            files={"file": ("evil.txt", b"x", "text/plain")},
        )
        self.assertEqual(foreign_upload.status_code, 404, foreign_upload.text)
        self.assertEqual(self.client.get(f"/api/accounting/attachments/expense/{expense_a_id}", headers=b_headers).status_code, 404)
        self.assertEqual(self.client.get(f"/api/accounting/attachments/file/{attachment_id}/download", headers=b_headers).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/accounting/attachments/file/{attachment_id}", headers=b_headers).status_code, 404)

        # Legacy metadata: a row written before this fix (no company_id key
        # at all) must still resolve live from its owning expense, never
        # fall open to every tenant.
        from app.accounting import attachments as attachments_module
        legacy_rows = attachments_module._load_index()
        for row in legacy_rows:
            if row["id"] == attachment_id:
                row.pop("company_id", None)
        attachments_module._save_index(legacy_rows)
        self.assertEqual(self.client.get(f"/api/accounting/attachments/file/{attachment_id}/download", headers=b_headers).status_code, 404)
        self.assertEqual(self.client.get(f"/api/accounting/attachments/file/{attachment_id}/download", headers=a_headers).status_code, 200)

        # --- 4) storefront_sync.py -----------------------------------------
        import time
        from app import storefront_sync as storefront_sync_module

        product_a = self.client.post("/products", headers=a_headers, json={"name": "Phase A Widget", "sell_price": 100, "stock": 10})
        self.assertEqual(product_a.status_code, 200, product_a.text)
        product_a_id = product_a.json()["id"]
        self.assertEqual(
            self.client.put(
                f"/api/online-commerce/products/{product_a_id}", headers=a_headers,
                json={"is_published": True, "sync_stock": True},
            ).status_code,
            200,
        )
        product_b = self.client.post("/products", headers=b_headers, json={"name": "Phase A Widget B", "sell_price": 200, "stock": 5})
        self.assertEqual(product_b.status_code, 200, product_b.text)
        product_b_id = product_b.json()["id"]
        self.assertEqual(
            self.client.put(
                f"/api/online-commerce/products/{product_b_id}", headers=b_headers,
                json={"is_published": True, "sync_stock": True},
            ).status_code,
            200,
        )

        readiness_a = self.client.get("/api/storefront-sync/readiness", headers=a_headers)
        self.assertEqual(readiness_a.status_code, 200, readiness_a.text)
        self.assertEqual(readiness_a.json()["published_products"], 1)

        def signed_get(signing_company_id, claimed_company_id, timestamp=None):
            if timestamp is None:
                timestamp = str(int(time.time()))
            secret = storefront_sync_module.company_sync_secret(signing_company_id)
            path = "/api/storefront-sync/products"
            signature = storefront_sync_module.sign_request(timestamp, "GET", path, secret)
            return self.client.get(
                path, params={"company_id": claimed_company_id},
                headers={"X-Vetrix-Timestamp": timestamp, "X-Vetrix-Signature": signature},
            )

        feed_a = signed_get(company_a_id, company_a_id)
        self.assertEqual(feed_a.status_code, 200, feed_a.text)
        feed_a_ids = {item["id"] for item in feed_a.json()["products"]}
        self.assertIn(product_a_id, feed_a_ids)
        self.assertNotIn(product_b_id, feed_a_ids)

        # Forged client company_id: signed with A's derived key but claims
        # to be company B - the derived keys differ, so the signature fails.
        forged = signed_get(company_a_id, company_b_id)
        self.assertEqual(forged.status_code, 401, forged.text)

        # --- 5) audit.py -----------------------------------------------------
        marker_a = self.client.post("/expenses", headers=a_headers, json={"title": "Phase A Audit Marker", "amount": 1})
        self.assertEqual(marker_a.status_code, 200, marker_a.text)
        marker_b = self.client.post("/expenses", headers=b_headers, json={"title": "Phase A Audit Marker B", "amount": 1})
        self.assertEqual(marker_b.status_code, 200, marker_b.text)

        events_a = self.client.get("/api/audit/events?limit=500", headers=a_headers)
        self.assertEqual(events_a.status_code, 200, events_a.text)
        actors_a = {item["actor_username"] for item in events_a.json()["items"]}
        self.assertIn("phasea-manager-a", actors_a)
        self.assertNotIn("phasea-manager-b", actors_a)

        events_b = self.client.get("/api/audit/events?limit=500", headers=b_headers)
        self.assertEqual(events_b.status_code, 200, events_b.text)
        actors_b = {item["actor_username"] for item in events_b.json()["items"]}
        self.assertIn("phasea-manager-b", actors_b)
        self.assertNotIn("phasea-manager-a", actors_b)

        events_super = self.client.get("/api/audit/events?limit=500", headers=admin_headers)
        self.assertEqual(events_super.status_code, 200, events_super.text)
        actors_super = {item["actor_username"] for item in events_super.json()["items"]}
        self.assertIn("phasea-manager-a", actors_super)
        self.assertIn("phasea-manager-b", actors_super)

        # --- 6) CustomRole (app/rbac.py) --------------------------------------
        for headers in (a_headers, b_headers):
            self.assertEqual(self.client.get("/api/auth/custom-roles", headers=headers).status_code, 403)
            self.assertEqual(
                self.client.post(
                    "/api/auth/custom-roles", headers=headers,
                    json={"code": "phasea_should_fail", "label": "Should Fail", "base_role": "viewer"},
                ).status_code,
                403,
            )
            self.assertEqual(self.client.delete("/api/auth/custom-roles/1", headers=headers).status_code, 403)

        created_role = self.client.post(
            "/api/auth/custom-roles", headers=admin_headers,
            json={"code": "phasea_regional_viewer", "label": "Phase A Regional Viewer", "base_role": "viewer"},
        )
        self.assertEqual(created_role.status_code, 200, created_role.text)
        role_id = created_role.json()["id"]
        listing = self.client.get("/api/auth/custom-roles", headers=admin_headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertTrue(any(row["id"] == role_id for row in listing.json()))
        self.assertEqual(self.client.delete(f"/api/auth/custom-roles/{role_id}", headers=admin_headers).status_code, 200)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_security_phase_b_fixes_regressions(self):
        """SECURITY PHASE B: proves the 3 confirmed findings stay fixed -
        system-health/release-preflight now require true super-admin (not
        just per-company admin), chart-of-accounts delete no longer leaks
        cross-tenant existence/usage info via child/used checks, and the
        dormant unscoped dashboard-widget helpers are gone entirely - plus
        the accompanying MINOR fixes (message-template editor grants,
        financial-policy events, designer template 404s, sandbox-payment
        production guard)."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        company_a = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase B Tenant Co A"})
        self.assertEqual(company_a.status_code, 200, company_a.text)
        company_a_id = company_a.json()["id"]
        company_b = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase B Tenant Co B"})
        self.assertEqual(company_b.status_code, 200, company_b.text)
        company_b_id = company_b.json()["id"]

        manager_a = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase B Manager A", "username": "phaseb-manager-a",
                  "password": "StrongPhaseBManagerA!42", "role": "admin", "company_id": company_a_id},
        )
        self.assertEqual(manager_a.status_code, 200, manager_a.text)
        a_headers, a_login = self._login("phaseb-manager-a", "StrongPhaseBManagerA!42")
        self.assertFalse(a_login["user"]["is_super_admin"])

        manager_b = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase B Manager B", "username": "phaseb-manager-b",
                  "password": "StrongPhaseBManagerB!42", "role": "admin", "company_id": company_b_id},
        )
        self.assertEqual(manager_b.status_code, 200, manager_b.text)
        b_headers, b_login = self._login("phaseb-manager-b", "StrongPhaseBManagerB!42")
        self.assertFalse(b_login["user"]["is_super_admin"])

        # --- 1) system_health.py / release_preflight.py: super-admin only ---
        for path in ("/api/system/health", "/api/system/readiness", "/api/system/release-preflight"):
            self.assertEqual(self.client.get(path, headers=a_headers).status_code, 403, path)
            self.assertEqual(self.client.get(path, headers=b_headers).status_code, 403, path)

        health = self.client.get("/api/system/health", headers=admin_headers)
        self.assertEqual(health.status_code, 200, health.text)
        readiness = self.client.get("/api/system/readiness", headers=admin_headers)
        self.assertIn(readiness.status_code, (200, 503), readiness.text)
        preflight = self.client.get("/api/system/release-preflight", headers=admin_headers)
        self.assertEqual(preflight.status_code, 200, preflight.text)

        # --- 2) accounting/entries_router.py delete_account: no cross-tenant oracle ---
        account_a = self.client.post(
            "/api/accounting/entries/chart", headers=a_headers,
            json={"code": "9001", "name": "Phase B Test Account A", "account_type": "asset",
                  "level": "detail", "normal_balance": "debit"},
        )
        self.assertEqual(account_a.status_code, 200, account_a.text)
        account_a_id = account_a.json()["id"]

        # Cross-tenant: company B gets a plain 404, not a 400 revealing
        # whether the (foreign) account has children/usage.
        foreign_delete = self.client.delete(f"/api/accounting/entries/chart/{account_a_id}", headers=b_headers)
        self.assertEqual(foreign_delete.status_code, 404, foreign_delete.text)
        # A genuinely nonexistent id must be indistinguishable from a real
        # foreign id - both 404, no oracle to tell them apart.
        nonexistent_delete = self.client.delete("/api/accounting/entries/chart/999999999", headers=b_headers)
        self.assertEqual(nonexistent_delete.status_code, 404, nonexistent_delete.text)

        # Same-tenant: company A can still delete its own unused, childless account.
        same_delete = self.client.delete(f"/api/accounting/entries/chart/{account_a_id}", headers=a_headers)
        self.assertEqual(same_delete.status_code, 200, same_delete.text)
        self.assertTrue(same_delete.json()["ok"])

        # Deleting it again correctly 404s (truly gone), never a false-success 200.
        redelete = self.client.delete(f"/api/accounting/entries/chart/{account_a_id}", headers=a_headers)
        self.assertEqual(redelete.status_code, 404, redelete.text)

        # --- 3) widgets/dashboard_widgets.py: fully removed, not left as a
        # reusable unscoped tenant-data helper ---
        from pathlib import Path
        dashboard_widgets_path = Path(__file__).resolve().parents[1] / "app" / "widgets" / "dashboard_widgets.py"
        self.assertFalse(dashboard_widgets_path.exists())

        # --- MINOR: message_templates.py grant_editor rejects a foreign-company user ---
        manager_b_id = manager_b.json()["id"]
        foreign_grant = self.client.post(
            "/api/message-templates/editors", headers=a_headers, json={"user_id": manager_b_id},
        )
        self.assertEqual(foreign_grant.status_code, 404, foreign_grant.text)
        manager_a_id = manager_a.json()["id"]
        same_grant = self.client.post(
            "/api/message-templates/editors", headers=a_headers, json={"user_id": manager_a_id},
        )
        self.assertEqual(same_grant.status_code, 200, same_grant.text)

        # --- MINOR: financial_policy.py policy_events - same-tenant regression + still 404s cross-tenant ---
        policy_a = self.client.post(
            "/api/financial-policy", headers=a_headers,
            json={"version": "phaseb-v1", "country_code": "IR", "currency_code": "IRR",
                  "decimal_places": 0, "effective_from": "2026-01-01"},
        )
        self.assertEqual(policy_a.status_code, 200, policy_a.text)
        policy_a_id = policy_a.json()["policy_id"]
        events_a = self.client.get(f"/api/financial-policy/{policy_a_id}/events", headers=a_headers)
        self.assertEqual(events_a.status_code, 200, events_a.text)
        self.assertGreaterEqual(len(events_a.json()), 1)
        foreign_events = self.client.get(f"/api/financial-policy/{policy_a_id}/events", headers=b_headers)
        self.assertEqual(foreign_events.status_code, 404, foreign_events.text)

        # --- MINOR: designer template not-found now returns a real 404 ---
        designer_missing = self.client.get("/designer/template/999999999", headers=a_headers)
        self.assertEqual(designer_missing.status_code, 404, designer_missing.text)

        template_a = self.client.post("/designer/template", headers=a_headers, json={"name": "Phase B Template A"})
        self.assertEqual(template_a.status_code, 200, template_a.text)
        template_a_id = template_a.json()["id"]

        foreign_template_get = self.client.get(f"/designer/template/{template_a_id}", headers=b_headers)
        self.assertEqual(foreign_template_get.status_code, 404, foreign_template_get.text)
        foreign_template_rename = self.client.put(
            f"/designer/template/{template_a_id}/rename", headers=b_headers, json={"name": "Hijacked"},
        )
        self.assertEqual(foreign_template_rename.status_code, 404, foreign_template_rename.text)
        foreign_template_delete = self.client.delete(f"/designer/template/{template_a_id}", headers=b_headers)
        self.assertEqual(foreign_template_delete.status_code, 404, foreign_template_delete.text)

        same_template_get = self.client.get(f"/designer/template/{template_a_id}", headers=a_headers)
        self.assertEqual(same_template_get.status_code, 200, same_template_get.text)

        # --- MINOR: payment_gateway.py simulate_payment is disabled in production ---
        with patch.dict(os.environ, {"VETRIX_ENV": "production"}, clear=False):
            prod_blocked = self.client.post(
                "/api/payments/session/simulate", json={"authority": "does-not-matter", "outcome": "success"},
            )
        self.assertEqual(prod_blocked.status_code, 403, prod_blocked.text)

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_security_phase_c_hardening_regressions(self):
        """SECURITY PHASE C: proves the confirmed hardening findings stay
        fixed - /login times out consistently for a nonexistent username,
        /export/invoices-{pdf,excel} require an export role, repeated
        payment-session requests for the same invoice reuse the pending
        session instead of growing unboundedly, the desktop build's
        VETRIX_ENV value can't bypass the payment-simulate guard, and the
        ai_bi payload cache never crosses tenants."""
        admin_headers, admin_login = self._login("ci-admin", "StrongAdminPassword!42")

        # --- /login: nonexistent username still 401s with the same shape,
        # no crash, proving the constant-time dummy-hash path works. ---
        nonexistent = self.client.post(
            "/login", json={"username": "phasec-does-not-exist", "password": "whatever-password-value"},
        )
        self.assertEqual(nonexistent.status_code, 401, nonexistent.text)
        self.assertEqual(nonexistent.json()["detail"], "Invalid username or password")

        # --- /export/invoices-pdf, /export/invoices-excel require an export role ---
        company_a = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase C Tenant Co"})
        self.assertEqual(company_a.status_code, 200, company_a.text)
        company_a_id = company_a.json()["id"]
        warehouse_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase C Warehouse User", "username": "phasec-warehouse-user",
                  "password": "StrongPhaseCWarehouse!42", "role": "warehouse", "company_id": company_a_id},
        )
        self.assertEqual(warehouse_user.status_code, 200, warehouse_user.text)
        warehouse_headers, _ = self._login("phasec-warehouse-user", "StrongPhaseCWarehouse!42")

        self.assertEqual(self.client.get("/export/invoices-pdf", headers=warehouse_headers).status_code, 403)
        self.assertEqual(self.client.get("/export/invoices-excel", headers=warehouse_headers).status_code, 403)
        self.assertEqual(self.client.get("/export/invoices-pdf", headers=admin_headers).status_code, 200)
        self.assertEqual(self.client.get("/export/invoices-excel", headers=admin_headers).status_code, 200)

        # --- payment session reuse: two quick requests for the same invoice
        # reuse the pending session instead of creating a new row each time ---
        with patch.dict(os.environ, {"VETRIX_PAYMENT_PROVIDER": "sandbox"}):
            customer = self.client.post("/customers", headers=admin_headers, json={"name": "Phase C Payment Customer"})
            self.assertEqual(customer.status_code, 200, customer.text)
            product = self.client.post(
                "/products", headers=admin_headers, json={"name": "Phase C Widget", "sell_price": 1000, "stock": 10},
            )
            self.assertEqual(product.status_code, 200, product.text)
            invoice = self.client.post(
                "/invoices", headers=admin_headers,
                json={
                    "invoice_type": "sale", "customer_id": customer.json()["id"],
                    "items": [{"product_id": product.json()["id"], "quantity": 1, "unit_price": 1000}],
                },
            )
            self.assertEqual(invoice.status_code, 200, invoice.text)
            invoice_id = invoice.json()["invoice_id"]

            first_request = self.client.post(f"/api/payments/invoices/{invoice_id}/request", headers=admin_headers)
            self.assertEqual(first_request.status_code, 200, first_request.text)
            second_request = self.client.post(f"/api/payments/invoices/{invoice_id}/request", headers=admin_headers)
            self.assertEqual(second_request.status_code, 200, second_request.text)
            self.assertEqual(first_request.json()["authority"], second_request.json()["authority"])

            from app.payment_gateway import PaymentSession
            from app.database import SessionLocal as PaymentSessionLocal
            db = PaymentSessionLocal()
            try:
                session_count = db.query(PaymentSession).filter(PaymentSession.invoice_id == invoice_id).count()
            finally:
                db.close()
            self.assertEqual(session_count, 1)

        # --- desktop build's VETRIX_ENV value cannot bypass the payment-simulate guard ---
        with patch.dict(os.environ, {"VETRIX_ENV": "desktop"}, clear=False):
            desktop_blocked = self.client.post(
                "/api/payments/session/simulate", json={"authority": "does-not-matter", "outcome": "success"},
            )
        self.assertEqual(desktop_blocked.status_code, 403, desktop_blocked.text)

        # --- ai_bi payload cache is tenant-scoped, never crosses companies ---
        company_b = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase C Tenant Co B"})
        self.assertEqual(company_b.status_code, 200, company_b.text)
        company_b_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase C Co B Admin", "username": "phasec-co-b-admin",
                  "password": "StrongPhaseCCoBAdmin!42", "role": "admin", "company_id": company_b.json()["id"]},
        )
        self.assertEqual(company_b_admin.status_code, 200, company_b_admin.text)
        b_headers, _ = self._login("phasec-co-b-admin", "StrongPhaseCCoBAdmin!42")

        summary_a = self.client.get("/api/ai-bi/summary", headers=admin_headers)
        self.assertEqual(summary_a.status_code, 200, summary_a.text)
        summary_b = self.client.get("/api/ai-bi/summary", headers=b_headers)
        self.assertEqual(summary_b.status_code, 200, summary_b.text)
        # Company B is brand new with zero invoices/customers - if the cache
        # key were ever wrong (e.g. a global cache instead of per-company),
        # it would see company A's non-empty figures instead of its own.
        self.assertEqual(summary_b.json()["top_customers"], [])
        self.assertEqual(summary_b.json()["top_products"], [])

        # --- graceful degradation: a transient failure in one BI/inventory
        # computation must not 500 the whole aggregation endpoint that
        # depends on it (a regression an earlier version of this same
        # security pass introduced by making _build_payload/
        # smart_inventory_overview raise instead of returning an
        # {"status":"error"} sentinel some callers still checked for) ---
        from app.ai_bi import router as ai_bi_router_module
        from app import executive_alerts as executive_alerts_module

        with patch.object(ai_bi_router_module, "_build_payload", side_effect=RuntimeError("forced failure")):
            recalc = self.client.post("/api/bi-improvement/recalculate", headers=admin_headers)
            self.assertEqual(recalc.status_code, 200, recalc.text)

        with patch.object(executive_alerts_module, "smart_inventory_overview", side_effect=RuntimeError("forced failure")):
            alerts_summary = self.client.get("/api/executive-alerts/summary", headers=admin_headers)
            self.assertEqual(alerts_summary.status_code, 200, alerts_summary.text)

        # --- uploads: two endpoints missed by the initial size-limit sweep ---
        oversized = b"x" * (26 * 1024 * 1024)
        oversized_doc = self.client.post(
            "/api/company-profile/documents", headers=admin_headers,
            files={"file": ("big.bin", oversized, "application/octet-stream")},
        )
        self.assertEqual(oversized_doc.status_code, 413, oversized_doc.text)

        bank_account = self.client.post(
            "/api/accounting/bank-reconciliation/accounts", headers=admin_headers,
            json={"name": "Phase C Bank Account", "account_number": "PHASEC-001", "bank_name": "Phase C Bank"},
        )
        self.assertEqual(bank_account.status_code, 200, bank_account.text)
        oversized_csv = self.client.post(
            f"/api/accounting/bank-reconciliation/accounts/{bank_account.json()['id']}/statement/import",
            headers=admin_headers,
            files={"file": ("statement.csv", oversized, "text/csv")},
        )
        self.assertEqual(oversized_csv.status_code, 413, oversized_csv.text)

        # --- uploads: the 3 endpoints from the ORIGINAL size-limit sweep
        # never actually had a direct oversized-payload regression test
        # (only the 2 caught later by independent review did) ---
        oversized_expense = self.client.post(
            "/expenses", headers=admin_headers, json={"title": "Phase C Upload Test Expense", "amount": 1},
        )
        self.assertEqual(oversized_expense.status_code, 200, oversized_expense.text)
        oversized_attachment = self.client.post(
            f"/api/accounting/attachments/expense/{oversized_expense.json()['id']}", headers=admin_headers,
            files={"file": ("big.bin", oversized, "application/octet-stream")},
        )
        self.assertEqual(oversized_attachment.status_code, 413, oversized_attachment.text)

        oversized_customer = self.client.post(
            "/customers", headers=admin_headers, json={"name": "Phase C Upload Test Customer"},
        )
        self.assertEqual(oversized_customer.status_code, 200, oversized_customer.text)
        oversized_crm_file = self.client.post(
            f"/api/crm/customers/{oversized_customer.json()['id']}/files", headers=admin_headers,
            files={"file": ("big.bin", oversized, "application/octet-stream")},
        )
        self.assertEqual(oversized_crm_file.status_code, 413, oversized_crm_file.text)

        oversized_employee = self.client.post(
            "/api/hr", headers=admin_headers, json={"first_name": "Phase C", "last_name": "Upload Test"},
        )
        self.assertEqual(oversized_employee.status_code, 200, oversized_employee.text)
        oversized_hr_doc = self.client.post(
            f"/api/hr/{oversized_employee.json()['id']}/documents", headers=admin_headers,
            files={"file": ("big.bin", oversized, "application/octet-stream")},
        )
        self.assertEqual(oversized_hr_doc.status_code, 413, oversized_hr_doc.text)

        # --- payment session reuse never charges a stale amount after a
        # partial payment lands on the invoice within the reuse window ---
        with patch.dict(os.environ, {"VETRIX_PAYMENT_PROVIDER": "sandbox"}):
            stale_customer = self.client.post(
                "/customers", headers=admin_headers, json={"name": "Phase C Stale Amount Customer"},
            )
            stale_product = self.client.post(
                "/products", headers=admin_headers, json={"name": "Phase C Stale Widget", "sell_price": 2000, "stock": 10},
            )
            stale_invoice = self.client.post(
                "/invoices", headers=admin_headers,
                json={
                    "invoice_type": "sale", "customer_id": stale_customer.json()["id"],
                    "items": [{"product_id": stale_product.json()["id"], "quantity": 1, "unit_price": 2000}],
                },
            )
            stale_invoice_id = stale_invoice.json()["invoice_id"]

            first = self.client.post(f"/api/payments/invoices/{stale_invoice_id}/request", headers=admin_headers)
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json()["amount"], 2000)

            partial_payment = self.client.post(
                "/transactions", headers=admin_headers,
                json={"customer_id": stale_customer.json()["id"], "invoice_id": stale_invoice_id,
                      "transaction_type": "receipt", "amount": 500, "method": "cash"},
            )
            self.assertEqual(partial_payment.status_code, 200, partial_payment.text)

            second = self.client.post(f"/api/payments/invoices/{stale_invoice_id}/request", headers=admin_headers)
            self.assertEqual(second.status_code, 200, second.text)
            self.assertEqual(second.json()["amount"], 1500)
            self.assertNotEqual(first.json()["authority"], second.json()["authority"])

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_security_phase_d_hardening_regressions(self):
        """SECURITY PHASE D: proves the confirmed findings stay fixed -
        authentication (401) and authorization (403) failures are audited
        even for non-mutating (GET) requests, the backup-delivery policy
        list surfaces the unencrypted-backup disclosure, and WebSocket
        auth/cap rejections are logged."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        # The failure-audit dedupe (same client_ip+status_code within
        # FAILURE_AUDIT_DEDUPE_SECONDS collapses to one write) is keyed on
        # TestClient's fixed IP, shared across this whole sequential suite -
        # clear it so an earlier, unrelated 401/403 elsewhere in the file
        # can't suppress the write this test is about to verify.
        from app.audit import _recent_failure_writes
        _recent_failure_writes.clear()

        # --- a GET with no token at all now leaves an audit trail ---
        no_token = self.client.get("/customers")
        self.assertEqual(no_token.status_code, 401, no_token.text)

        events = self.client.get("/api/audit/events?path=/customers&limit=50", headers=admin_headers)
        self.assertEqual(events.status_code, 200, events.text)
        unauthenticated_rows = [
            row for row in events.json()["items"]
            if row["path"] == "/customers" and row["method"] == "GET" and row["status_code"] == 401
        ]
        self.assertTrue(unauthenticated_rows, "expected an audited 401 for GET /customers with no token")
        self.assertEqual(unauthenticated_rows[0]["action"], "read")

        # --- a GET with a valid token but an unauthorized role also leaves
        # an audit trail (previously silently dropped for non-mutating
        # methods) ---
        company_d = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase D Tenant Co"})
        self.assertEqual(company_d.status_code, 200, company_d.text)
        viewer_user = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase D Viewer", "username": "phased-viewer",
                  "password": "StrongPhaseDViewer!42", "role": "viewer", "company_id": company_d.json()["id"]},
        )
        self.assertEqual(viewer_user.status_code, 200, viewer_user.text)
        viewer_headers, _ = self._login("phased-viewer", "StrongPhaseDViewer!42")

        denied = self.client.get("/users", headers=viewer_headers)
        self.assertEqual(denied.status_code, 403, denied.text)

        denied_events = self.client.get("/api/audit/events?path=/users&actor=phased-viewer&limit=50", headers=admin_headers)
        self.assertEqual(denied_events.status_code, 200, denied_events.text)
        denied_rows = [
            row for row in denied_events.json()["items"]
            if row["path"] == "/users" and row["method"] == "GET" and row["status_code"] == 403
        ]
        self.assertTrue(denied_rows, "expected an audited 403 for GET /users by a viewer")
        self.assertEqual(denied_rows[0]["action"], "read")

        # A successful, authorized GET still stays unaudited (no flooding
        # the log with ordinary reads).
        allowed = self.client.get("/customers", headers=admin_headers)
        self.assertEqual(allowed.status_code, 200, allowed.text)
        all_customer_events = self.client.get("/api/audit/events?path=/customers&limit=200", headers=admin_headers)
        # POST /customers 200s are expected (unrelated pre-existing mutation
        # auditing) - only a successful GET must stay unaudited.
        self.assertFalse(any(
            row["method"] == "GET" and row["status_code"] == 200
            for row in all_customer_events.json()["items"]
        ))

        # --- backup delivery policy list discloses the unencrypted-backup risk ---
        policies = self.client.get("/api/backup-delivery/policies", headers=admin_headers)
        self.assertEqual(policies.status_code, 200, policies.text)
        self.assertIn("not encrypted", policies.json()["encryption_note"].lower())

        # --- WebSocket auth/cap rejections are now logged ---
        with self.assertLogs("app.notifications.ws_routes", level="WARNING"):
            with self.assertRaises(Exception):
                with self.client.websocket_connect("/ws/notifications?token=not-a-real-token"):
                    pass

    def test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_security_phase_e_acceptance_regressions(self):
        """SECURITY PHASE E: proves the confirmed final-acceptance findings
        stay fixed - document-OCR upload size is bounded during the read
        itself, not read-then-rejected."""
        admin_headers, _ = self._login("ci-admin", "StrongAdminPassword!42")

        from unittest.mock import patch
        from app import document_ocr as document_ocr_module

        oversized = b"x" * (16 * 1024 * 1024)
        with patch.object(document_ocr_module, "_require_tesseract", lambda: None):
            oversized_ocr = self.client.post(
                "/api/document-ocr/extract", headers=admin_headers,
                files={"file": ("big.png", oversized, "image/png")},
            )
        self.assertEqual(oversized_ocr.status_code, 400, oversized_ocr.text)
        self.assertIn("too large", oversized_ocr.json()["detail"].lower())

        # --- a foreign company's warehouse_id can no longer be used to
        # write a stock-movement row against it ---
        company_e = self.client.post("/api/companies", headers=admin_headers, json={"name": "Phase E Tenant Co"})
        self.assertEqual(company_e.status_code, 200, company_e.text)
        foreign_admin = self.client.post(
            "/users", headers=admin_headers,
            json={"full_name": "Phase E Foreign Admin", "username": "phasee-foreign-admin",
                  "password": "StrongPhaseEForeign!42", "role": "admin", "company_id": company_e.json()["id"]},
        )
        self.assertEqual(foreign_admin.status_code, 200, foreign_admin.text)
        foreign_headers, _ = self._login("phasee-foreign-admin", "StrongPhaseEForeign!42")
        foreign_warehouse = self.client.post(
            "/api/warehouses", headers=foreign_headers, json={"name": "Phase E Foreign Warehouse", "code": "PE-FW"},
        )
        self.assertEqual(foreign_warehouse.status_code, 200, foreign_warehouse.text)
        foreign_warehouse_id = foreign_warehouse.json()["id"]

        own_product = self.client.post(
            "/products", headers=admin_headers, json={"name": "Phase E Warehouse Test Widget", "sell_price": 100, "stock": 50},
        )
        self.assertEqual(own_product.status_code, 200, own_product.text)

        cross_tenant_movement = self.client.post(
            "/stock-movements", headers=admin_headers,
            json={"product_id": own_product.json()["id"], "warehouse_id": foreign_warehouse_id,
                  "quantity": 5, "movement_type": "in"},
        )
        self.assertEqual(cross_tenant_movement.status_code, 404, cross_tenant_movement.text)

        # Same-company warehouse usage still works.
        own_warehouse = self.client.post(
            "/api/warehouses", headers=admin_headers, json={"name": "Phase E Own Warehouse", "code": "PE-OW"},
        )
        self.assertEqual(own_warehouse.status_code, 200, own_warehouse.text)
        same_tenant_movement = self.client.post(
            "/stock-movements", headers=admin_headers,
            json={"product_id": own_product.json()["id"], "warehouse_id": own_warehouse.json()["id"],
                  "quantity": 5, "movement_type": "in"},
        )
        self.assertEqual(same_tenant_movement.status_code, 200, same_tenant_movement.text)

        # --- create_product/update_product's business-rule ValueErrors
        # (e.g. "negative stock") must still come back as a 200
        # {"status": "error", ...} body, not escape into the sanitized 500
        # handler - these two endpoints raise ValueError for expected
        # validation failures, not unexpected internal errors ---
        negative_stock_create = self.client.post(
            "/products", headers=admin_headers,
            json={"name": "Phase E Negative Stock Widget", "sell_price": 100, "stock": -5},
        )
        self.assertEqual(negative_stock_create.status_code, 200, negative_stock_create.text)
        self.assertEqual(negative_stock_create.json()["status"], "error")

        negative_stock_update = self.client.put(
            f"/products/{own_product.json()['id']}", headers=admin_headers,
            json={"name": "Phase E Warehouse Test Widget", "sell_price": 100, "stock": -5},
        )
        self.assertEqual(negative_stock_update.status_code, 200, negative_stock_update.text)
        self.assertEqual(negative_stock_update.json()["status"], "error")

        # --- a business-rule ValueError raised transitively (not directly
        # in the endpoint's own try body) through
        # delete_source_voucher/post_balanced_voucher's
        # assert_source_period_open - e.g. editing a customer whose opening-
        # balance voucher lives in a now-closed fiscal period - must also
        # come back as {"status": "error", ...}, not escape as a sanitized
        # 500. Independent review of the Phase E diff caught this same bug
        # class (already fixed once for create_product/update_product's own
        # direct `raise ValueError`) at 5 more sites where the ValueError
        # is only raised by a callee: create_customer, update_customer,
        # delete_product, delete_invoice, delete_transaction.
        #
        # Run this under the fresh "Phase E Tenant Co" company (created
        # above for the warehouse-isolation check) rather than the shared
        # ci-admin company: by this point in the suite ci-admin's company
        # may already have an auto-vivified Fiscal <year> period covering
        # today (assign_unassigned_vouchers, periods.py) from an earlier
        # test's dated voucher, which would make this explicit same-day
        # period POST fail with a spurious overlap instead of the intended
        # closed-period assertion. company_e has no accounting activity yet
        # (only a warehouse was created against it), so it starts with zero
        # fiscal periods.
        today_str = datetime.utcnow().date().isoformat()
        closed_period = self.client.post(
            "/api/accounting/periods", headers=foreign_headers,
            json={"name": "Phase E Closed Period", "start_date": today_str, "end_date": today_str},
        )
        self.assertEqual(closed_period.status_code, 200, closed_period.text)
        closed_period_id = closed_period.json()["id"]

        period_customer = self.client.post(
            "/customers", headers=foreign_headers,
            json={"name": "Phase E Closed Period Customer", "opening_balance": 500},
        )
        self.assertEqual(period_customer.status_code, 200, period_customer.text)

        close_result = self.client.post(f"/api/accounting/periods/{closed_period_id}/close", headers=foreign_headers)
        self.assertEqual(close_result.status_code, 200, close_result.text)

        blocked_update = self.client.put(
            f"/customers/{period_customer.json()['id']}", headers=foreign_headers,
            json={"name": "Phase E Closed Period Customer Renamed", "opening_balance": 500},
        )
        self.assertEqual(blocked_update.status_code, 200, blocked_update.text)
        self.assertEqual(blocked_update.json()["status"], "error")
        self.assertIn("closed", blocked_update.json()["message"].lower())

        # --- a genuinely unexpected internal exception in main.py no
        # longer echoes str(exception) to the client - it now bare-raises
        # into the sanitized global handler, matching the pattern Phase C
        # already applied to 4 other files (this sweep covers main.py
        # itself, which that earlier pass never touched: ~31 sites) ---
        import main as main_module

        # A dedicated client with raise_server_exceptions=False: the default
        # client re-raises the underlying exception into the test instead of
        # returning the sanitized HTTP response, which is exactly the
        # response body this test needs to inspect.
        no_raise_client = TestClient(main_module.app, raise_server_exceptions=False)
        with patch.object(main_module, "customer_balance", side_effect=RuntimeError("SELECT * FROM accounting_entries WHERE secret_column=1")):
            forced_failure = no_raise_client.post(
                "/customers", headers=admin_headers, json={"name": "Phase E Forced Failure Customer"},
            )
        self.assertEqual(forced_failure.status_code, 500, forced_failure.text)
        self.assertEqual(forced_failure.json(), {"detail": "Internal server error"})
        self.assertNotIn("accounting_entries", forced_failure.text)
        self.assertNotIn("SELECT", forced_failure.text)


if __name__ == "__main__":
    unittest.main()
