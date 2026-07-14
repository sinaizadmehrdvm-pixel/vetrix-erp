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
                    sell_price FLOAT
                )
            """))
            conn.execute(text("""
                INSERT INTO products VALUES
                  (1, 'Published product', 8, 1000),
                  (2, 'Hidden product', 4, 2000),
                  (3, 'No stock sync', 9, 3000)
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
                    updated_at VARCHAR
                )
            """))
            conn.execute(text("""
                INSERT INTO online_product_settings VALUES
                  (1, 1, 1, 900, 10, '', '', 'published', '2026-01-01T00:00:00Z'),
                  (2, 0, 1, 1800, 0, '', '', 'hidden', '2026-01-02T00:00:00Z'),
                  (3, 1, 0, NULL, 0, '', '', 'no-stock', '2026-01-03T00:00:00Z')
            """))
        self.secret = "storefront-test-secret-long-enough"
        self.env = patch.dict(
            os.environ, {"VETRIX_STOREFRONT_SYNC_SECRET": self.secret}
        )
        self.engine_patch = patch.object(
            storefront_sync, "engine", self.engine
        )
        self.env.start()
        self.engine_patch.start()

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
        storefront_sync._verify_request(request, now=1700000000)

        with self.assertRaises(HTTPException) as stale:
            storefront_sync._verify_request(request, now=1700001000)
        self.assertEqual(stale.exception.status_code, 401)

        with self.assertRaises(HTTPException) as tampered:
            storefront_sync._verify_request(
                self._request(signature="0" * 64),
                now=1700000000,
            )
        self.assertEqual(tampered.exception.status_code, 401)

    def test_feed_contains_only_published_allowlisted_fields(self):
        feed = storefront_sync._feed()

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

    def test_incremental_cursor_returns_only_newer_changes(self):
        feed = storefront_sync._feed("2026-01-02T12:00:00Z")
        self.assertEqual(feed["count"], 1)
        self.assertEqual(feed["products"][0]["id"], 3)

    def test_short_secret_fails_closed(self):
        with patch.dict(
            os.environ,
            {"VETRIX_STOREFRONT_SYNC_SECRET": "short"},
            clear=False,
        ):
            with self.assertRaises(HTTPException) as raised:
                storefront_sync._sync_secret()
        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
