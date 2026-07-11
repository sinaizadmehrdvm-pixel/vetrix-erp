import json
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/online-commerce", tags=["Online Commerce"])

CHANNELS = {"website", "instagram", "telegram", "whatsapp", "linkedin"}
CAMPAIGN_STATUSES = {"draft", "pending_approval", "approved", "scheduled", "published", "failed", "rejected"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _require_manager(request: Request):
    user_id, role = _auth(request)
    if role not in {"admin", "accountant"}:
        raise HTTPException(status_code=403, detail="Manager approval is required")
    return user_id


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS online_product_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL UNIQUE,
            is_published BOOLEAN NOT NULL DEFAULT 0,
            sync_stock BOOLEAN NOT NULL DEFAULT 1,
            online_price FLOAT,
            discount_percent FLOAT NOT NULL DEFAULT 0,
            sale_start VARCHAR,
            sale_end VARCHAR,
            website_slug VARCHAR DEFAULT '',
            updated_by INTEGER NOT NULL,
            updated_at VARCHAR NOT NULL,
            FOREIGN KEY(product_id) REFERENCES products(id),
            FOREIGN KEY(updated_by) REFERENCES users(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS social_campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title VARCHAR NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            channel VARCHAR NOT NULL,
            product_id INTEGER,
            media_url TEXT DEFAULT '',
            destination_url TEXT DEFAULT '',
            scheduled_at VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'draft',
            created_by INTEGER NOT NULL,
            created_at VARCHAR NOT NULL,
            decided_by INTEGER,
            decided_at VARCHAR,
            decision_note TEXT DEFAULT '',
            published_at VARCHAR,
            external_reference VARCHAR DEFAULT '',
            FOREIGN KEY(product_id) REFERENCES products(id),
            FOREIGN KEY(created_by) REFERENCES users(id),
            FOREIGN KEY(decided_by) REFERENCES users(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS commerce_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel VARCHAR NOT NULL UNIQUE,
            enabled BOOLEAN NOT NULL DEFAULT 0,
            base_url TEXT DEFAULT '',
            account_label VARCHAR DEFAULT '',
            secret_reference VARCHAR DEFAULT '',
            last_test_status VARCHAR DEFAULT 'not_tested',
            last_tested_at VARCHAR,
            updated_by INTEGER NOT NULL,
            updated_at VARCHAR NOT NULL,
            FOREIGN KEY(updated_by) REFERENCES users(id)
        )
    """))


class ProductPublicationPayload(BaseModel):
    is_published: bool = False
    sync_stock: bool = True
    online_price: Optional[float] = Field(default=None, ge=0)
    discount_percent: float = Field(default=0, ge=0, le=100)
    sale_start: str = ""
    sale_end: str = ""
    website_slug: str = ""


class CampaignPayload(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    body: str = Field(default="", max_length=5000)
    channel: Literal["website", "instagram", "telegram", "whatsapp", "linkedin"]
    product_id: Optional[int] = None
    media_url: str = ""
    destination_url: str = ""
    scheduled_at: str = ""


class DecisionPayload(BaseModel):
    note: str = ""


class ConnectionPayload(BaseModel):
    channel: Literal["website", "instagram", "telegram", "whatsapp", "linkedin"]
    enabled: bool = False
    base_url: str = ""
    account_label: str = ""
    secret_reference: str = ""


@router.get("/summary")
def summary():
    with engine.begin() as conn:
        _ensure_schema(conn)
        products = conn.execute(text("""
            SELECT COUNT(*) total,
                   SUM(CASE WHEN is_published=1 THEN 1 ELSE 0 END) published,
                   SUM(CASE WHEN discount_percent>0 THEN 1 ELSE 0 END) discounted
            FROM online_product_settings
        """)).mappings().first()
        campaigns = conn.execute(text("""
            SELECT COUNT(*) total,
                   SUM(CASE WHEN status='pending_approval' THEN 1 ELSE 0 END) pending,
                   SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published
            FROM social_campaigns
        """)).mappings().first()
        connections = conn.execute(text("SELECT COUNT(*) FROM commerce_connections WHERE enabled=1")).scalar() or 0
        return {
            "products": {key: int(value or 0) for key, value in dict(products).items()},
            "campaigns": {key: int(value or 0) for key, value in dict(campaigns).items()},
            "active_connections": int(connections),
        }


@router.get("/products")
def products():
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT p.id, p.name, p.stock, p.sell_price,
                   COALESCE(s.is_published, 0) is_published,
                   COALESCE(s.sync_stock, 1) sync_stock,
                   s.online_price, COALESCE(s.discount_percent, 0) discount_percent,
                   COALESCE(s.sale_start, '') sale_start, COALESCE(s.sale_end, '') sale_end,
                   COALESCE(s.website_slug, '') website_slug, s.updated_at
            FROM products p
            LEFT JOIN online_product_settings s ON s.product_id=p.id
            ORDER BY p.name, p.id
        """)).mappings().all()
        return [dict(row) for row in rows]


@router.put("/products/{product_id}")
def update_product(product_id: int, payload: ProductPublicationPayload, request: Request):
    actor = _require_manager(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        if not conn.execute(text("SELECT id FROM products WHERE id=:id"), {"id": product_id}).first():
            raise HTTPException(status_code=404, detail="Product not found")
        conn.execute(text("""
            INSERT INTO online_product_settings
              (product_id, is_published, sync_stock, online_price, discount_percent,
               sale_start, sale_end, website_slug, updated_by, updated_at)
            VALUES
              (:product_id, :is_published, :sync_stock, :online_price, :discount_percent,
               :sale_start, :sale_end, :website_slug, :actor, :now)
            ON CONFLICT(product_id) DO UPDATE SET
              is_published=excluded.is_published, sync_stock=excluded.sync_stock,
              online_price=excluded.online_price, discount_percent=excluded.discount_percent,
              sale_start=excluded.sale_start, sale_end=excluded.sale_end,
              website_slug=excluded.website_slug, updated_by=excluded.updated_by,
              updated_at=excluded.updated_at
        """), {**payload.model_dump(), "product_id": product_id, "actor": actor, "now": _now()})
        return {"status": "saved", "product_id": product_id}


@router.get("/campaigns")
def campaigns(status: str = "all"):
    if status != "all" and status not in CAMPAIGN_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid campaign status")
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT c.*, p.name product_name, creator.full_name created_by_name,
                   decider.full_name decided_by_name
            FROM social_campaigns c
            LEFT JOIN products p ON p.id=c.product_id
            LEFT JOIN users creator ON creator.id=c.created_by
            LEFT JOIN users decider ON decider.id=c.decided_by
            WHERE (:status='all' OR c.status=:status)
            ORDER BY c.id DESC
        """), {"status": status}).mappings().all()
        return [dict(row) for row in rows]


@router.post("/campaigns")
def create_campaign(payload: CampaignPayload, request: Request):
    actor, _ = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        if payload.product_id and not conn.execute(text("SELECT id FROM products WHERE id=:id"), {"id": payload.product_id}).first():
            raise HTTPException(status_code=404, detail="Product not found")
        result = conn.execute(text("""
            INSERT INTO social_campaigns
              (title, body, channel, product_id, media_url, destination_url,
               scheduled_at, status, created_by, created_at)
            VALUES
              (:title, :body, :channel, :product_id, :media_url, :destination_url,
               :scheduled_at, 'draft', :actor, :now)
        """), {**payload.model_dump(), "actor": actor, "now": _now()})
        return {"status": "draft", "campaign_id": result.lastrowid}


@router.post("/campaigns/{campaign_id}/submit")
def submit_campaign(campaign_id: int, request: Request):
    actor, _ = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("SELECT * FROM social_campaigns WHERE id=:id"), {"id": campaign_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if row["created_by"] != actor:
            raise HTTPException(status_code=403, detail="Only the creator can submit this campaign")
        if row["status"] not in {"draft", "rejected"}:
            raise HTTPException(status_code=409, detail="Campaign cannot be submitted")
        conn.execute(text("""
            UPDATE social_campaigns SET status='pending_approval',
            decided_by=NULL, decided_at=NULL, decision_note='' WHERE id=:id
        """), {"id": campaign_id})
        return {"status": "pending_approval", "campaign_id": campaign_id}


@router.post("/campaigns/{campaign_id}/approve")
def approve_campaign(campaign_id: int, payload: DecisionPayload, request: Request):
    actor = _require_manager(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("SELECT * FROM social_campaigns WHERE id=:id"), {"id": campaign_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if row["status"] != "pending_approval":
            raise HTTPException(status_code=409, detail="Campaign is not pending approval")
        if row["created_by"] == actor:
            raise HTTPException(status_code=409, detail="Maker-checker violation: creator cannot approve")
        next_status = "scheduled" if row["scheduled_at"] else "approved"
        conn.execute(text("""
            UPDATE social_campaigns SET status=:status, decided_by=:actor,
            decided_at=:now, decision_note=:note WHERE id=:id
        """), {"status": next_status, "actor": actor, "now": _now(), "note": payload.note.strip(), "id": campaign_id})
        return {"status": next_status, "campaign_id": campaign_id}


@router.post("/campaigns/{campaign_id}/reject")
def reject_campaign(campaign_id: int, payload: DecisionPayload, request: Request):
    actor = _require_manager(request)
    note = payload.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Rejection note is required")
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("SELECT * FROM social_campaigns WHERE id=:id"), {"id": campaign_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if row["status"] != "pending_approval":
            raise HTTPException(status_code=409, detail="Campaign is not pending approval")
        conn.execute(text("""
            UPDATE social_campaigns SET status='rejected', decided_by=:actor,
            decided_at=:now, decision_note=:note WHERE id=:id
        """), {"actor": actor, "now": _now(), "note": note, "id": campaign_id})
        return {"status": "rejected", "campaign_id": campaign_id}


@router.get("/connections")
def connections(request: Request):
    _require_manager(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT channel, enabled, base_url, account_label, secret_reference,
                   last_test_status, last_tested_at, updated_at
            FROM commerce_connections ORDER BY channel
        """)).mappings().all()
        return [dict(row) for row in rows]


@router.put("/connections/{channel}")
def save_connection(channel: str, payload: ConnectionPayload, request: Request):
    actor = _require_manager(request)
    if channel not in CHANNELS or payload.channel != channel:
        raise HTTPException(status_code=400, detail="Invalid channel")
    if payload.secret_reference and any(mark in payload.secret_reference.lower() for mark in ("bearer ", "token=", "api_key=")):
        raise HTTPException(status_code=400, detail="Store a secret reference, never a raw credential")
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            INSERT INTO commerce_connections
              (channel, enabled, base_url, account_label, secret_reference, updated_by, updated_at)
            VALUES (:channel, :enabled, :base_url, :account_label, :secret_reference, :actor, :now)
            ON CONFLICT(channel) DO UPDATE SET
              enabled=excluded.enabled, base_url=excluded.base_url,
              account_label=excluded.account_label,
              secret_reference=excluded.secret_reference,
              updated_by=excluded.updated_by, updated_at=excluded.updated_at
        """), {**payload.model_dump(), "actor": actor, "now": _now()})
        return {"status": "saved", "channel": channel}
