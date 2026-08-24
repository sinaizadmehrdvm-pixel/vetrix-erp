import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, text

from app import storefront_sync


class SignedStorefrontSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{self.temp.name}/storefront.db",
            connect_args={"check_same_thread": False},
        )
        with self.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE app_settings (
                    id INTEGER PRIMARY KEY,
                    currency_code VARCHAR,
                    decimal_places INTEGER,
                    country_code VARCHAR,
                    locale_code VARCHAR
                )
            """))
            conn.execute(text("""
                INSERT INTO app_settings VALUES (1, 'IRR', 0, 'IR', 'fa-IR')
            """))
            conn.execute(text("""
                CREATE TABLE products (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR,
                    stock FLOAT,
                    sell_price FLOAT,
                    company_id INTEGER
                )
            """))
            conn.execute(text("""
                INSERT INTO products VALUES
                  (1, 'Published product', 8, 1000, 1),
                  (2, 'Hidden product', 4, 2000, 1),
                  (3, 'No stock sync', 9, 3000, 1),
                  (4, 'Other company product', 6, 4000, 2)
            """))
            conn.execute(text("""
                CREATE TABLE online_product_settings (
                    product_id INTEGER PRIMARY KEY,
                    is_published BOOLEAN,
                    sync_stock BOOLEAN,
                    online_price FLOAT,
                    discount_percent FLOAT,
                    sale_start VARCHAR,
                    sale_end VARCHAR,
                    website_slug VARCHAR,
                    updated_at VARCHAR,
                    company_id INTEGER
                )
            """))
            conn.execute(text("""
                INSERT INTO online_product_settings VALUES
                  (1, 1, 1, 900, 10, '', '', 'published', '2026-01-01T00:00:00Z', 1),
                  (2, 0, 1, 1800, 0, '', '', 'hidden', '2026-01-02T00:00:00Z', 1),
                  (3, 1, 0, NULL, 0, '', '', 'no-stock', '2026-01-03T00:00:00Z', 1),
                  (4, 1, 1, 3600, 0, '', '', 'other-company', '2026-01-04T00:00:00Z', 2)
            """))
        self.root_secret = "storefront-test-secret-long-enough"
        self.company_id = 1
        self.other_company_id = 2
        self.env = patch.dict(
            os.environ, {"VETRIX_STOREFRONT_SYNC_SECRET": self.root_secret}
        )
        self.engine_patch = patch.object(
            storefront_sync, "engine", self.engine
        )
        self.env.start()
        self.engine_patch.start()
        self.secret = storefront_sync.company_sync_secret(self.company_id)

    def tearDown(self):
        self.engine_patch.stop()
        self.env.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def _request(self, timestamp="1700000000", signature=None):
        path = "/api/storefront-sync/products"
        if signature is None:
            signature = storefront_sync.sign_request(
                timestamp, "GET", path, self.secret
            )
        return SimpleNamespace(
            headers={
                "X-Vetrix-Timestamp": timestamp,
                "X-Vetrix-Signature": signature,
            },
            method="GET",
            url=SimpleNamespace(path=path),
        )

    def test_valid_signature_and_clock_window_are_required(self):
        request = self._request()
        storefront_sync._verify_request(request, self.company_id, now=1700000000)

        with self.assertRaises(HTTPException) as stale:
            storefront_sync._verify_request(request, self.company_id, now=1700001000)
        self.assertEqual(stale.exception.status_code, 401)

        with self.assertRaises(HTTPException) as tampered:
            storefront_sync._verify_request(
                self._request(signature="0" * 64),
                self.company_id,
                now=1700000000,
            )
        self.assertEqual(tampered.exception.status_code, 401)

    def test_forged_company_id_is_rejected_even_with_a_valid_signature_for_another_company(self):
        """A signature computed for company 1's derived key must not verify
        against company 2 - a company can't just relabel its own signed
        request to read another tenant's feed."""
        request = self._request()  # signed with company 1's derived secret
        with self.assertRaises(HTTPException) as forged:
            storefront_sync._verify_request(request, self.other_company_id, now=1700000000)
        self.assertEqual(forged.exception.status_code, 401)

    def test_feed_is_scoped_to_one_company_and_contains_only_published_allowlisted_fields(self):
        feed = storefront_sync._feed(self.company_id)

        self.assertEqual(feed["count"], 2)
        self.assertEqual(feed["currency"], "IRR")
        self.assertEqual(
            [item["id"] for item in feed["products"]], [1, 3]
        )
        first = feed["products"][0]
        self.assertEqual(first["price"], 900.0)
        self.assertEqual(first["discounted_price"], 810.0)
        self.assertEqual(first["stock"], 8.0)
        no_stock = feed["products"][1]
        self.assertEqual(no_stock["price"], 3000.0)
        self.assertIsNone(no_stock["stock"])
        self.assertNotIn("sell_price", first)
        self.assertNotIn("is_published", first)

        # Never crosses into another company's published catalog.
        self.assertNotIn(4, [item["id"] for item in feed["products"]])

        other_feed = storefront_sync._feed(self.other_company_id)
        self.assertEqual([item["id"] for item in other_feed["products"]], [4])

    def test_incremental_cursor_returns_only_newer_changes(self):
        feed = storefront_sync._feed(self.company_id, "2026-01-02T12:00:00Z")
        self.assertEqual(feed["count"], 1)
        self.assertEqual(feed["products"][0]["id"], 3)

    def test_short_secret_fails_closed(self):
        with patch.dict(
            os.environ,
            {"VETRIX_STOREFRONT_SYNC_SECRET": "short"},
            clear=False,
        ):
            with self.assertRaises(HTTPException) as raised:
                storefront_sync._root_secret()
        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
