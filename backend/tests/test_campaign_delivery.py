import asyncio
import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, text

from app import campaign_delivery


class AsyncRequest:
    def __init__(self, path, body, secret, timestamp="1700000000"):
        self._body = body
        self.method = "POST"
        self.url = SimpleNamespace(path=path)
        self.headers = {
            "X-Vetrix-Timestamp": timestamp,
            "X-Vetrix-Signature": campaign_delivery._signature(
                timestamp, "POST", path, body, secret
            ),
        }

    async def body(self):
        return self._body


class ControlledCampaignDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{self.temp.name}/delivery.db",
            connect_args={"check_same_thread": False},
        )
        with self.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY, role VARCHAR, full_name VARCHAR
                )
            """))
            conn.execute(text("INSERT INTO users VALUES (1, 'admin', 'Manager')"))
            conn.execute(text("""
                CREATE TABLE products (
                    id INTEGER PRIMARY KEY, name VARCHAR, stock FLOAT,
                    sell_price FLOAT
                )
            """))
            conn.execute(text("""
                CREATE TABLE social_campaigns (
                    id INTEGER PRIMARY KEY,
                    title VARCHAR, body TEXT, channel VARCHAR,
                    product_id INTEGER, media_url TEXT, destination_url TEXT,
                    scheduled_at VARCHAR, status VARCHAR, created_by INTEGER,
                    created_at VARCHAR, decided_by INTEGER, decided_at VARCHAR,
                    decision_note TEXT, published_at VARCHAR,
                    external_reference VARCHAR
                )
            """))
            conn.execute(text("""
                INSERT INTO social_campaigns
                  (id, title, body, channel, scheduled_at, status, created_by)
                VALUES (10, 'Approved post', 'Safe approved copy',
                        'instagram', '', 'approved', 1)
            """))
        self.secret = "campaign-delivery-secret-long-enough"
        self.env = patch.dict(
            os.environ, {"VETRIX_CAMPAIGN_DELIVERY_SECRET": self.secret}
        )
        self.engine_patch = patch.object(
            campaign_delivery, "engine", self.engine
        )
        self.env.start()
        self.engine_patch.start()
        self.manager = SimpleNamespace(
            state=SimpleNamespace(auth={"sub": "1", "role": "admin"})
        )

    def tearDown(self):
        self.engine_patch.stop()
        self.env.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def test_approved_campaign_is_queued_claimed_and_completed_once(self):
        queued = campaign_delivery.queue_campaign(10, self.manager)
        duplicate_queue = campaign_delivery.queue_campaign(10, self.manager)
        self.assertEqual(queued["status"], "queued")
        self.assertTrue(duplicate_queue["duplicate"])

        claim_request = AsyncRequest(
            "/api/campaign-delivery/claim", b"", self.secret
        )
        with patch("app.campaign_delivery.time.time", return_value=1700000000):
            claimed = asyncio.run(
                campaign_delivery.claim_campaign(claim_request)
            )
        self.assertEqual(claimed["status"], "delivering")
        self.assertEqual(claimed["campaign_id"], 10)
        self.assertEqual(claimed["body"], "Safe approved copy")

        body = json.dumps({
            "lease_token": claimed["lease_token"],
            "external_reference": "instagram:post-42",
        }).encode()
        complete_request = AsyncRequest(
            "/api/campaign-delivery/complete", body, self.secret
        )
        with patch("app.campaign_delivery.time.time", return_value=1700000000):
            completed = asyncio.run(
                campaign_delivery.complete_campaign(complete_request)
            )
            repeated = asyncio.run(
                campaign_delivery.complete_campaign(complete_request)
            )
        self.assertEqual(completed["status"], "published")
        self.assertFalse(completed["duplicate"])
        self.assertTrue(repeated["duplicate"])
        with self.engine.begin() as conn:
            campaign = conn.execute(text("""
                SELECT status, external_reference FROM social_campaigns
                WHERE id=10
            """)).mappings().one()
        self.assertEqual(campaign["status"], "published")
        self.assertEqual(
            campaign["external_reference"], "instagram:post-42"
        )

    def test_tampered_body_is_rejected(self):
        original = b'{"lease_token":"original-long-token","error":"failed"}'
        request = AsyncRequest(
            "/api/campaign-delivery/fail", original, self.secret
        )
        request._body = b'{"lease_token":"changed-long-token","error":"failed"}'
        with patch("app.campaign_delivery.time.time", return_value=1700000000):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(campaign_delivery.fail_campaign(request))
        self.assertEqual(raised.exception.status_code, 401)

    def test_unapproved_campaign_cannot_enter_delivery_queue(self):
        with self.engine.begin() as conn:
            conn.execute(text(
                "UPDATE social_campaigns SET status='draft' WHERE id=10"
            ))
        with self.assertRaises(HTTPException) as raised:
            campaign_delivery.queue_campaign(10, self.manager)
        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
