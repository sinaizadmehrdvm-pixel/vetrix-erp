import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from app.online_commerce import _ensure_schema as _ensure_commerce_schema

router = APIRouter(prefix="/api/campaign-delivery", tags=["Campaign Delivery"])
MAX_CLOCK_SKEW_SECONDS = 300
MAX_ATTEMPTS = 3


def _now():
    return datetime.now(timezone.utc).isoformat()


def _secret():
    value = os.getenv("VETRIX_CAMPAIGN_DELIVERY_SECRET", "").strip()
    if len(value) < 24:
        raise HTTPException(
            status_code=503,
            detail="Campaign delivery secret is not configured securely",
        )
    return value


def _signature(timestamp, method, path, body, secret):
    body_hash = hashlib.sha256(body).hexdigest()
    canonical = (
        f"{timestamp}\n{method.upper()}\n{path}\n{body_hash}"
    ).encode("utf-8")
    return hmac.new(
        secret.encode("utf-8"), canonical, hashlib.sha256
    ).hexdigest()


def _verify(request, body=b"", now=None):
    timestamp = request.headers.get("X-Vetrix-Timestamp", "").strip()
    supplied = request.headers.get("X-Vetrix-Signature", "").strip().lower()
    try:
        timestamp_number = int(timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid delivery timestamp")
    current = int(time.time() if now is None else now)
    if abs(current - timestamp_number) > MAX_CLOCK_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="Delivery request expired")
    expected = _signature(
        timestamp, request.method, request.url.path, body, _secret()
    )
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid delivery signature")


def _manager(request):
    auth = getattr(request.state, "auth", {})
    if str(auth.get("role") or "").lower() not in {"admin", "accountant"}:
        raise HTTPException(status_code=403, detail="Manager access is required")
    return int(auth["sub"])


def _ensure_schema(conn):
    _ensure_commerce_schema(conn)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS campaign_delivery_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL UNIQUE,
            channel VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'queued',
            attempts INTEGER NOT NULL DEFAULT 0,
            lease_token VARCHAR DEFAULT '',
            queued_by INTEGER NOT NULL,
            queued_at VARCHAR NOT NULL,
            claimed_at VARCHAR,
            completed_at VARCHAR,
            last_error TEXT DEFAULT '',
            external_reference VARCHAR DEFAULT '',
            FOREIGN KEY(campaign_id) REFERENCES social_campaigns(id),
            FOREIGN KEY(queued_by) REFERENCES users(id)
        )
    """))


def _scheduled_due(value):
    if not value:
        return True
    try:
        scheduled = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid campaign schedule")
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    return scheduled <= datetime.now(timezone.utc)


class DeliveryResult(BaseModel):
    lease_token: str = Field(min_length=20, max_length=200)
    external_reference: str = Field(min_length=2, max_length=1000)


class DeliveryFailure(BaseModel):
    lease_token: str = Field(min_length=20, max_length=200)
    error: str = Field(min_length=2, max_length=2000)


@router.post("/queue/{campaign_id}")
def queue_campaign(campaign_id: int, request: Request):
    actor = _manager(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        campaign = conn.execute(text("""
            SELECT * FROM social_campaigns WHERE id=:id
        """), {"id": campaign_id}).mappings().first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if campaign["status"] not in {"approved", "scheduled"}:
            raise HTTPException(
                status_code=409,
                detail="Only approved campaigns can be queued",
            )
        if not _scheduled_due(campaign["scheduled_at"]):
            raise HTTPException(status_code=409, detail="Campaign is not due yet")
        existing = conn.execute(text("""
            SELECT id, status FROM campaign_delivery_jobs
            WHERE campaign_id=:campaign_id
        """), {"campaign_id": campaign_id}).mappings().first()
        if existing:
            return {
                "status": existing["status"],
                "job_id": existing["id"],
                "duplicate": True,
            }
        job = conn.execute(text("""
            INSERT INTO campaign_delivery_jobs
              (campaign_id, channel, status, queued_by, queued_at)
            VALUES (:campaign_id, :channel, 'queued', :actor, :now)
        """), {
            "campaign_id": campaign_id,
            "channel": campaign["channel"],
            "actor": actor,
            "now": _now(),
        })
        return {
            "status": "queued",
            "job_id": job.lastrowid,
            "duplicate": False,
        }


@router.post("/claim")
async def claim_campaign(request: Request):
    body = await request.body()
    _verify(request, body)
    with engine.begin() as conn:
        _ensure_schema(conn)
        job = conn.execute(text("""
            SELECT j.*, c.title, c.body, c.product_id, c.media_url,
                   c.destination_url, c.scheduled_at
            FROM campaign_delivery_jobs j
            JOIN social_campaigns c ON c.id=j.campaign_id
            WHERE j.status='queued' AND j.attempts<:max_attempts
            ORDER BY j.id LIMIT 1
        """), {"max_attempts": MAX_ATTEMPTS}).mappings().first()
        if not job:
            return {"status": "empty"}
        lease = secrets.token_urlsafe(32)
        updated = conn.execute(text("""
            UPDATE campaign_delivery_jobs
            SET status='delivering', lease_token=:lease,
                claimed_at=:now, attempts=attempts+1
            WHERE id=:id AND status='queued'
        """), {"lease": lease, "now": _now(), "id": job["id"]})
        if updated.rowcount != 1:
            return {"status": "retry"}
        return {
            "status": "delivering",
            "job_id": job["id"],
            "campaign_id": job["campaign_id"],
            "lease_token": lease,
            "channel": job["channel"],
            "title": job["title"],
            "body": job["body"],
            "product_id": job["product_id"],
            "media_url": job["media_url"],
            "destination_url": job["destination_url"],
            "scheduled_at": job["scheduled_at"],
        }


@router.post("/complete")
async def complete_campaign(request: Request):
    body = await request.body()
    _verify(request, body)
    try:
        payload = DeliveryResult(**json.loads(body or b"{}"))
    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    with engine.begin() as conn:
        _ensure_schema(conn)
        job = conn.execute(text("""
            SELECT * FROM campaign_delivery_jobs
            WHERE lease_token=:lease
        """), {"lease": payload.lease_token}).mappings().first()
        if not job:
            raise HTTPException(status_code=404, detail="Delivery lease not found")
        if job["status"] == "published":
            return {"status": "published", "job_id": job["id"], "duplicate": True}
        if job["status"] != "delivering":
            raise HTTPException(status_code=409, detail="Delivery is not active")
        now = _now()
        conn.execute(text("""
            UPDATE campaign_delivery_jobs
            SET status='published', completed_at=:now,
                external_reference=:external_reference, last_error=''
            WHERE id=:id
        """), {
            "now": now,
            "external_reference": payload.external_reference,
            "id": job["id"],
        })
        conn.execute(text("""
            UPDATE social_campaigns
            SET status='published', published_at=:now,
                external_reference=:external_reference
            WHERE id=:campaign_id
        """), {
            "now": now,
            "external_reference": payload.external_reference,
            "campaign_id": job["campaign_id"],
        })
        return {"status": "published", "job_id": job["id"], "duplicate": False}


@router.post("/fail")
async def fail_campaign(request: Request):
    body = await request.body()
    _verify(request, body)
    try:
        payload = DeliveryFailure(**json.loads(body or b"{}"))
    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    with engine.begin() as conn:
        _ensure_schema(conn)
        job = conn.execute(text("""
            SELECT * FROM campaign_delivery_jobs
            WHERE lease_token=:lease AND status='delivering'
        """), {"lease": payload.lease_token}).mappings().first()
        if not job:
            raise HTTPException(status_code=404, detail="Active delivery not found")
        next_status = "failed" if job["attempts"] >= MAX_ATTEMPTS else "queued"
        conn.execute(text("""
            UPDATE campaign_delivery_jobs
            SET status=:status, lease_token='', last_error=:error
            WHERE id=:id
        """), {
            "status": next_status,
            "error": payload.error,
            "id": job["id"],
        })
        if next_status == "failed":
            conn.execute(text("""
                UPDATE social_campaigns SET status='failed'
                WHERE id=:campaign_id
            """), {"campaign_id": job["campaign_id"]})
        return {"status": next_status, "job_id": job["id"]}


@router.get("/readiness")
def delivery_readiness(request: Request):
    _manager(request)
    secret = os.getenv("VETRIX_CAMPAIGN_DELIVERY_SECRET", "").strip()
    with engine.begin() as conn:
        _ensure_schema(conn)
        counts = conn.execute(text("""
            SELECT status, COUNT(*) count FROM campaign_delivery_jobs
            GROUP BY status
        """)).mappings().all()
    return {
        "ready": len(secret) >= 24,
        "signature_algorithm": "HMAC-SHA256",
        "max_attempts": MAX_ATTEMPTS,
        "jobs": {row["status"]: int(row["count"]) for row in counts},
        "secrets_exposed": False,
    }
