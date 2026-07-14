import hashlib
import hmac
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, text

from app import inbound_voice


class VerifiedVoiceWebhookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{self.temp.name}/webhooks.db",
            connect_args={"check_same_thread": False},
        )
        with self.engine.begin() as conn:
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
        self.env = patch.dict(os.environ, {
            "VETRIX_TELEGRAM_WEBHOOK_SECRET": "telegram-secret",
            "VETRIX_WHATSAPP_APP_SECRET": "whatsapp-secret",
            "VETRIX_WHATSAPP_VERIFY_TOKEN": "verify-token",
            "VETRIX_VOICE_ALLOWED_CHAT_IDS": "1001,989000000000",
            "VETRIX_VOICE_SERVICE_USER_ID": "7",
        })
        self.engine_patch = patch.object(inbound_voice, "engine", self.engine)
        self.env.start()
        self.engine_patch.start()

    def tearDown(self):
        self.engine_patch.stop()
        self.env.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def test_telegram_secret_uses_exact_match(self):
        inbound_voice._verify_telegram_secret("telegram-secret")
        with self.assertRaises(HTTPException) as raised:
            inbound_voice._verify_telegram_secret("wrong")
        self.assertEqual(raised.exception.status_code, 401)

    def test_whatsapp_hmac_signature_is_verified(self):
        body = b'{"entry":[]}'
        signature = "sha256=" + hmac.new(
            b"whatsapp-secret", body, hashlib.sha256
        ).hexdigest()
        inbound_voice._verify_whatsapp_signature(body, signature)
        with self.assertRaises(HTTPException) as raised:
            inbound_voice._verify_whatsapp_signature(body, "sha256=bad")
        self.assertEqual(raised.exception.status_code, 401)

    def test_duplicate_external_event_creates_one_pending_request(self):
        first = inbound_voice._ingest(
            "telegram", "update-42", "1001", "1001:42", "", "file-42"
        )
        second = inbound_voice._ingest(
            "telegram", "update-42", "1001", "1001:42", "", "file-42"
        )

        self.assertEqual(first["status"], "pending_approval")
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(first["request_id"], second["request_id"])
        with self.engine.begin() as conn:
            request = conn.execute(text("""
                SELECT status, action_type, requested_by
                FROM managed_change_requests
            """)).mappings().one()
            events = conn.execute(
                text("SELECT COUNT(*) FROM inbound_voice_events")
            ).scalar()
        self.assertEqual(request["status"], "pending_approval")
        self.assertEqual(request["action_type"], "note_only")
        self.assertEqual(request["requested_by"], 7)
        self.assertEqual(events, 1)

    def test_unlisted_sender_is_rejected_before_database_write(self):
        with self.assertRaises(HTTPException) as raised:
            inbound_voice._ingest(
                "whatsapp", "wamid.1", "unknown", "wamid.1", "", "media-1"
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_whatsapp_voice_payload_is_parsed(self):
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "id": "wamid.42",
                            "from": "989000000000",
                            "type": "audio",
                            "audio": {"id": "media-42"},
                        }]
                    }
                }]
            }]
        }
        parsed = inbound_voice._whatsapp_voice(payload)
        self.assertEqual(parsed["event_id"], "wamid.42")
        self.assertEqual(parsed["media_reference"], "media-42")


if __name__ == "__main__":
    unittest.main()
