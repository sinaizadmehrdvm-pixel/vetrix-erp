import asyncio
import hashlib
import hmac
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import catalog_messaging, inbound_voice
from app.catalog import CatalogLink
from app.database import Base
from app.models.product import Product


class OrderMessageParsingTests(unittest.TestCase):
    def test_recognizes_order_header(self):
        self.assertTrue(catalog_messaging.is_catalog_order_message("ORDER 7\n2x SKU1"))
        self.assertTrue(catalog_messaging.is_catalog_order_message("order #7\n2x SKU1"))
        self.assertFalse(catalog_messaging.is_catalog_order_message("hello there"))
        self.assertFalse(catalog_messaging.is_catalog_order_message(""))

    def test_parses_items_and_note(self):
        parsed = catalog_messaging.parse_order_message(
            "ORDER 7\n2x SKU-1\n1 SKU-2\nNOTE deliver after 5pm"
        )
        self.assertEqual(parsed["catalog_id"], 7)
        self.assertEqual(parsed["item_lines"], [(2.0, "SKU-1"), (1.0, "SKU-2")])
        self.assertEqual(parsed["note"], "deliver after 5pm")

    def test_returns_none_without_order_header(self):
        self.assertIsNone(catalog_messaging.parse_order_message("2x SKU-1"))


class CatalogMessageIngestionTests(unittest.TestCase):
    """Isolated engine/tables so this suite doesn't depend on the shared
    app.database engine or test collection order across files."""

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.engine = create_engine(
            f"sqlite:///{cls.temp.name}/catalog_messaging.db",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()
        cls.temp.cleanup()

    def setUp(self):
        self.session_patch = patch.object(catalog_messaging, "SessionLocal", self.SessionLocal)
        self.session_patch.start()
        db = self.SessionLocal()
        try:
            self.product = Product(name="Chat Order Widget", sku="SKU-1", sell_price=1000, stock=50)
            db.add(self.product)
            self.catalog = CatalogLink(title="Chat catalog", enabled=True)
            db.add(self.catalog)
            db.commit()
            db.refresh(self.product)
            db.refresh(self.catalog)
        finally:
            db.close()

    def tearDown(self):
        self.session_patch.stop()
        db = self.SessionLocal()
        try:
            db.execute(text("DELETE FROM inbound_catalog_messages"))
            db.execute(text("DELETE FROM catalog_orders"))
            db.execute(text("DELETE FROM catalog_links"))
            db.execute(text("DELETE FROM products"))
            db.commit()
        finally:
            db.close()

    def test_valid_order_creates_pending_catalog_order(self):
        result = catalog_messaging.ingest_catalog_order_message(
            source="telegram",
            event_id="evt-1",
            sender="1001",
            sender_name="Ali",
            message_text=f"ORDER {self.catalog.id}\n2x SKU-1",
            message_reference="1001:1",
        )
        self.assertEqual(result["status"], "created")
        db = self.SessionLocal()
        try:
            order = db.execute(text("SELECT * FROM catalog_orders WHERE id=:id"), {"id": result["order_id"]}).mappings().one()
            self.assertEqual(order["customer_name"], "Ali")
            self.assertEqual(order["status"], "pending")
            items = json.loads(order["items_json"])
            self.assertEqual(items, [{"product_id": self.product.id, "name": "Chat Order Widget", "quantity": 2.0}])
            logged = db.execute(text("SELECT status, catalog_order_id FROM inbound_catalog_messages WHERE external_event_id='evt-1'")).mappings().one()
            self.assertEqual(logged["status"], "created")
            self.assertEqual(logged["catalog_order_id"], result["order_id"])
        finally:
            db.close()

    def test_duplicate_event_id_is_not_reprocessed(self):
        first = catalog_messaging.ingest_catalog_order_message(
            source="telegram", event_id="evt-dup", sender="1001", sender_name="Ali",
            message_text=f"ORDER {self.catalog.id}\n2x SKU-1", message_reference="1001:2",
        )
        second = catalog_messaging.ingest_catalog_order_message(
            source="telegram", event_id="evt-dup", sender="1001", sender_name="Ali",
            message_text=f"ORDER {self.catalog.id}\n2x SKU-1", message_reference="1001:2",
        )
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(second["order_id"], first["order_id"])
        db = self.SessionLocal()
        try:
            count = db.execute(text("SELECT COUNT(*) FROM catalog_orders")).scalar()
            self.assertEqual(count, 1)
        finally:
            db.close()

    def test_unknown_catalog_is_rejected(self):
        result = catalog_messaging.ingest_catalog_order_message(
            source="telegram", event_id="evt-unknown", sender="1001", sender_name="Ali",
            message_text="ORDER 999999\n2x SKU-1", message_reference="1001:3",
        )
        self.assertEqual(result["status"], "rejected")

    def test_disabled_catalog_is_rejected(self):
        db = self.SessionLocal()
        try:
            db.execute(text("UPDATE catalog_links SET enabled=0 WHERE id=:id"), {"id": self.catalog.id})
            db.commit()
        finally:
            db.close()
        result = catalog_messaging.ingest_catalog_order_message(
            source="telegram", event_id="evt-disabled", sender="1001", sender_name="Ali",
            message_text=f"ORDER {self.catalog.id}\n2x SKU-1", message_reference="1001:4",
        )
        self.assertEqual(result["status"], "rejected")

    def test_no_matching_products_is_rejected(self):
        result = catalog_messaging.ingest_catalog_order_message(
            source="telegram", event_id="evt-nomatch", sender="1001", sender_name="Ali",
            message_text=f"ORDER {self.catalog.id}\n3x NOT-A-REAL-CODE", message_reference="1001:5",
        )
        self.assertEqual(result["status"], "rejected")

    def test_non_order_message_is_ignored(self):
        result = catalog_messaging.ingest_catalog_order_message(
            source="telegram", event_id="evt-chatter", sender="1001", sender_name="Ali",
            message_text="hi is this catalog still available?", message_reference="1001:6",
        )
        self.assertEqual(result["status"], "ignored")


class FakeHeaders:
    def __init__(self, data):
        self._data = data

    def get(self, key):
        return self._data.get(key)


class FakeRequest:
    def __init__(self, headers=None, json_body=None, body_bytes=b""):
        self.headers = FakeHeaders(headers or {})
        self._json_body = json_body
        self._body_bytes = body_bytes

    async def json(self):
        return self._json_body

    async def body(self):
        return self._body_bytes


class WebhookDispatchTests(unittest.TestCase):
    """Verifies the real telegram_webhook/whatsapp_webhook route handlers
    route text order messages to catalog_messaging and leave the existing
    voice change-request path untouched for voice media."""

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.engine = create_engine(
            f"sqlite:///{cls.temp.name}/webhook_dispatch.db",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)
        with cls.engine.begin() as conn:
            # Base.metadata is a process-wide registry: if some other test
            # module already imported app.models.User by the time this class
            # runs, create_all() above will have created the *real* users
            # table (password NOT NULL) instead of nothing. Drop and recreate
            # a minimal table unconditionally so this suite behaves the same
            # standalone or inside the full run.
            conn.execute(text("DROP TABLE IF EXISTS users"))
            conn.execute(text("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    full_name VARCHAR,
                    username VARCHAR,
                    role VARCHAR NOT NULL
                )
            """))
            conn.execute(text("""
                INSERT INTO users (id, full_name, username, role)
                VALUES (7, 'Voice Service', 'voice-service', 'viewer')
            """))

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()
        cls.temp.cleanup()

    def setUp(self):
        self.env = patch.dict(os.environ, {
            "VETRIX_TELEGRAM_WEBHOOK_SECRET": "telegram-secret",
            "VETRIX_WHATSAPP_APP_SECRET": "whatsapp-secret",
            "VETRIX_WHATSAPP_VERIFY_TOKEN": "verify-token",
            "VETRIX_VOICE_ALLOWED_CHAT_IDS": "1001,989000000000",
            "VETRIX_VOICE_SERVICE_USER_ID": "7",
        })
        self.env.start()
        self.voice_engine_patch = patch.object(inbound_voice, "engine", self.engine)
        self.voice_engine_patch.start()
        self.session_patch = patch.object(catalog_messaging, "SessionLocal", self.SessionLocal)
        self.session_patch.start()

        db = self.SessionLocal()
        try:
            self.product = Product(name="Dispatch Widget", sku="SKU-D", sell_price=500, stock=10)
            db.add(self.product)
            self.catalog = CatalogLink(title="Dispatch catalog", enabled=True)
            db.add(self.catalog)
            db.commit()
            db.refresh(self.product)
            db.refresh(self.catalog)
        finally:
            db.close()

    def tearDown(self):
        self.session_patch.stop()
        self.voice_engine_patch.stop()
        self.env.stop()
        db = self.SessionLocal()
        try:
            db.execute(text("DELETE FROM inbound_catalog_messages"))
            db.execute(text("DELETE FROM catalog_orders"))
            db.execute(text("DELETE FROM catalog_links"))
            db.execute(text("DELETE FROM products"))
            db.execute(text("DELETE FROM managed_change_requests"))
            db.execute(text("DELETE FROM inbound_voice_events"))
            db.commit()
        finally:
            db.close()

    def test_telegram_webhook_creates_catalog_order_from_text_message(self):
        payload = {
            "update_id": 4001,
            "message": {
                "message_id": 55,
                "chat": {"id": 1001, "first_name": "Sara"},
                "text": f"ORDER {self.catalog.id}\n1x SKU-D",
            },
        }
        request = FakeRequest(
            headers={"X-Telegram-Bot-Api-Secret-Token": "telegram-secret"},
            json_body=payload,
        )
        result = asyncio.run(inbound_voice.telegram_webhook(request))
        self.assertEqual(result["status"], "created")
        db = self.SessionLocal()
        try:
            count = db.execute(text("SELECT COUNT(*) FROM catalog_orders")).scalar()
            self.assertEqual(count, 1)
            voice_requests = db.execute(text("SELECT COUNT(*) FROM managed_change_requests")).scalar()
            self.assertEqual(voice_requests, 0)
        finally:
            db.close()

    def test_whatsapp_webhook_creates_catalog_order_from_text_message(self):
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "contacts": [{"profile": {"name": "Reza"}}],
                        "messages": [{
                            "id": "wamid.order-1",
                            "from": "989000000001",
                            "type": "text",
                            "text": {"body": f"ORDER {self.catalog.id}\n1x SKU-D"},
                        }],
                    }
                }]
            }]
        }
        body = json.dumps(payload).encode("utf-8")
        signature = "sha256=" + hmac.new(b"whatsapp-secret", body, hashlib.sha256).hexdigest()
        request = FakeRequest(
            headers={"X-Hub-Signature-256": signature},
            body_bytes=body,
        )
        result = asyncio.run(inbound_voice.whatsapp_webhook(request))
        self.assertEqual(result["status"], "created")
        db = self.SessionLocal()
        try:
            count = db.execute(text("SELECT COUNT(*) FROM catalog_orders")).scalar()
            self.assertEqual(count, 1)
        finally:
            db.close()

    def test_telegram_voice_message_still_creates_change_request(self):
        payload = {
            "update_id": 4002,
            "message": {
                "message_id": 56,
                "chat": {"id": 1001},
                "voice": {"file_id": "file-voice-1"},
            },
        }
        request = FakeRequest(
            headers={"X-Telegram-Bot-Api-Secret-Token": "telegram-secret"},
            json_body=payload,
        )
        result = asyncio.run(inbound_voice.telegram_webhook(request))
        self.assertEqual(result["status"], "needs_transcript_review")
        db = self.SessionLocal()
        try:
            orders = db.execute(text("SELECT COUNT(*) FROM catalog_orders")).scalar()
            self.assertEqual(orders, 0)
            requests_count = db.execute(text("SELECT COUNT(*) FROM managed_change_requests")).scalar()
            self.assertEqual(requests_count, 1)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
