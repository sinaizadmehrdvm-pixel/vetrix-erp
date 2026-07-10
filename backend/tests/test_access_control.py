import os
import tempfile
import unittest
from pathlib import Path

TEST_DATABASE = Path(tempfile.gettempdir()) / f"vetrix-test-{os.getpid()}.db"
os.environ["VETRIX_DATABASE_URL"] = f"sqlite:///{TEST_DATABASE}"
os.environ["VETRIX_JWT_SECRET"] = "integration-test-secret-not-for-production"

from fastapi.testclient import TestClient

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


if __name__ == "__main__":
    unittest.main()
