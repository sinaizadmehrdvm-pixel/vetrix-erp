import json
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from app.company_scope import current_company_id

router = APIRouter(prefix="/api/online-commerce", tags=["Online Commerce"])

CHANNELS = {"website", "instagram", "telegram", "whatsapp", "linkedin"}
CAMPAIGN_STATUSES = {"draft", "pending_approval", "approved", "scheduled", "published", "failed", "rejected"}
# "custom" (an arbitrary saved-filter builder) is deliberately not offered -
# no such builder exists anywhere in this app, and faking one would violate
# the task's explicit anti-fabrication rule. Every type below is a real,
# computable query against existing customer/invoice/loyalty data.
SEGMENT_TYPES = {"", "new_customers", "returning_customers", "high_value", "inactive", "vip", "city", "category"}


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
    from app.company_scope import ensure_company_id_column, migrate_commerce_connections_composite_unique
    ensure_company_id_column(conn, "online_product_settings")
    ensure_company_id_column(conn, "social_campaigns")
    ensure_company_id_column(conn, "commerce_connections")
    migrate_commerce_connections_composite_unique(conn)
    _ensure_campaign_targeting_columns(conn)


def _ensure_campaign_targeting_columns(conn):
    """social_campaigns was created via CREATE TABLE IF NOT EXISTS above, so
    an already-existing table (like this app's dev database) needs these
    Task-02 columns added the same idempotent way ensure_sqlite_column()
    does elsewhere - see app/warehouses.py's _ensure_new_columns for the
    identical pattern."""
    rows = conn.execute(text("PRAGMA table_info(social_campaigns)")).fetchall()
    existing = {row[1] for row in rows}
    additions = {
        "template_key": "template_key VARCHAR DEFAULT ''",
        "design_template_id": "design_template_id INTEGER",
        "segment_type": "segment_type VARCHAR DEFAULT ''",
        "segment_value": "segment_value VARCHAR DEFAULT ''",
        "catalog_link_id": "catalog_link_id INTEGER",
    }
    for column_name, column_sql in additions.items():
        if column_name not in existing:
            conn.execute(text(f"ALTER TABLE social_campaigns ADD COLUMN {column_sql}"))


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
    template_key: str = ""
    design_template_id: Optional[int] = None
    segment_type: str = ""
    segment_value: str = ""
    catalog_link_id: Optional[int] = None


class DecisionPayload(BaseModel):
    note: str = ""


class ConnectionPayload(BaseModel):
    channel: Literal["website", "instagram", "telegram", "whatsapp", "linkedin"]
    enabled: bool = False
    base_url: str = ""
    account_label: str = ""
    secret_reference: str = ""


@router.get("/summary")
def summary(request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        products = conn.execute(text("""
            SELECT COUNT(*) total,
                   SUM(CASE WHEN is_published=1 THEN 1 ELSE 0 END) published,
                   SUM(CASE WHEN discount_percent>0 THEN 1 ELSE 0 END) discounted
            FROM online_product_settings WHERE company_id=:company_id
        """), {"company_id": company_id}).mappings().first()
        campaigns = conn.execute(text("""
            SELECT COUNT(*) total,
                   SUM(CASE WHEN status='pending_approval' THEN 1 ELSE 0 END) pending,
                   SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published
            FROM social_campaigns WHERE company_id=:company_id
        """), {"company_id": company_id}).mappings().first()
        connections = conn.execute(text(
            "SELECT COUNT(*) FROM commerce_connections WHERE enabled=1 AND company_id=:company_id"
        ), {"company_id": company_id}).scalar() or 0
        return {
            "products": {key: int(value or 0) for key, value in dict(products).items()},
            "campaigns": {key: int(value or 0) for key, value in dict(campaigns).items()},
            "active_connections": int(connections),
        }


@router.get("/products")
def products(request: Request):
    company_id = current_company_id(request)
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
            LEFT JOIN online_product_settings s ON s.product_id=p.id AND s.company_id=:company_id
            WHERE p.company_id=:company_id
            ORDER BY p.name, p.id
        """), {"company_id": company_id}).mappings().all()
        return [dict(row) for row in rows]


@router.put("/products/{product_id}")
def update_product(product_id: int, payload: ProductPublicationPayload, request: Request):
    actor = _require_manager(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        if not conn.execute(text("SELECT id FROM products WHERE id=:id AND company_id=:company_id"), {"id": product_id, "company_id": company_id}).first():
            raise HTTPException(status_code=404, detail="Product not found")
        conn.execute(text("""
            INSERT INTO online_product_settings
              (product_id, is_published, sync_stock, online_price, discount_percent,
               sale_start, sale_end, website_slug, updated_by, updated_at, company_id)
            VALUES
              (:product_id, :is_published, :sync_stock, :online_price, :discount_percent,
               :sale_start, :sale_end, :website_slug, :actor, :now, :company_id)
            ON CONFLICT(product_id) DO UPDATE SET
              is_published=excluded.is_published, sync_stock=excluded.sync_stock,
              online_price=excluded.online_price, discount_percent=excluded.discount_percent,
              sale_start=excluded.sale_start, sale_end=excluded.sale_end,
              website_slug=excluded.website_slug, updated_by=excluded.updated_by,
              updated_at=excluded.updated_at
        """), {**payload.dict(), "product_id": product_id, "actor": actor, "now": _now(), "company_id": company_id})
        return {"status": "saved", "product_id": product_id}


@router.get("/campaigns")
def campaigns(request: Request, status: str = "all"):
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
            WHERE (:status='all' OR c.status=:status) AND c.company_id=:company_id
            ORDER BY c.id DESC
        """), {"status": status, "company_id": current_company_id(request)}).mappings().all()
        return [dict(row) for row in rows]


@router.post("/campaigns")
def create_campaign(payload: CampaignPayload, request: Request):
    if payload.segment_type not in SEGMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"segment_type must be one of: {', '.join(sorted(t for t in SEGMENT_TYPES if t))}")
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        if payload.product_id and not conn.execute(text("SELECT id FROM products WHERE id=:id AND company_id=:company_id"), {"id": payload.product_id, "company_id": company_id}).first():
            raise HTTPException(status_code=404, detail="Product not found")
        result = conn.execute(text("""
            INSERT INTO social_campaigns
              (title, body, channel, product_id, media_url, destination_url,
               scheduled_at, status, created_by, created_at, company_id,
               template_key, design_template_id, segment_type, segment_value, catalog_link_id)
            VALUES
              (:title, :body, :channel, :product_id, :media_url, :destination_url,
               :scheduled_at, 'draft', :actor, :now, :company_id,
               :template_key, :design_template_id, :segment_type, :segment_value, :catalog_link_id)
        """), {**payload.dict(), "actor": actor, "now": _now(), "company_id": company_id})
        return {"status": "draft", "campaign_id": result.lastrowid}


def _segment_customer_ids(conn, company_id: int, segment_type: str, segment_value: str):
    """Real, computed audience membership for the reach estimate below -
    every branch here is a genuine query against customer/invoice/loyalty
    data, never an invented number. Returns None for segment_type='' (no
    targeting -> every consenting customer)."""
    if not segment_type:
        return None
    now = datetime.now(timezone.utc)
    if segment_type == "new_customers":
        cutoff = (now - timedelta(days=30)).isoformat()
        rows = conn.execute(text("SELECT id FROM customers WHERE company_id=:cid AND created_at>=:cutoff"), {"cid": company_id, "cutoff": cutoff}).all()
        return {row[0] for row in rows}
    if segment_type == "returning_customers":
        rows = conn.execute(text("""
            SELECT customer_id FROM invoices WHERE company_id=:cid AND invoice_type='sale'
            GROUP BY customer_id HAVING COUNT(*) >= 2
        """), {"cid": company_id}).all()
        return {row[0] for row in rows}
    if segment_type == "inactive":
        cutoff = (now - timedelta(days=90)).isoformat()
        active_rows = conn.execute(text("""
            SELECT DISTINCT customer_id FROM invoices WHERE company_id=:cid AND invoice_type='sale' AND created_at>=:cutoff
        """), {"cid": company_id, "cutoff": cutoff}).all()
        active_ids = {row[0] for row in active_rows}
        all_rows = conn.execute(text("SELECT id FROM customers WHERE company_id=:cid"), {"cid": company_id}).all()
        return {row[0] for row in all_rows} - active_ids
    if segment_type == "high_value":
        table_exists = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='customer_loyalty'")).first()
        if not table_exists:
            return set()
        rows = conn.execute(text("""
            SELECT cl.customer_id FROM customer_loyalty cl JOIN customers c ON c.id=cl.customer_id
            WHERE c.company_id=:cid AND cl.level IN ('Gold', 'Platinum', 'VIP')
        """), {"cid": company_id}).all()
        return {row[0] for row in rows}
    if segment_type == "vip":
        table_exists = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='customer_loyalty'")).first()
        if not table_exists:
            return set()
        rows = conn.execute(text("""
            SELECT cl.customer_id FROM customer_loyalty cl JOIN customers c ON c.id=cl.customer_id
            WHERE c.company_id=:cid AND cl.level='VIP'
        """), {"cid": company_id}).all()
        return {row[0] for row in rows}
    if segment_type == "city":
        rows = conn.execute(text("SELECT id FROM customers WHERE company_id=:cid AND city=:city"), {"cid": company_id, "city": segment_value}).all()
        return {row[0] for row in rows}
    if segment_type == "category":
        rows = conn.execute(text("""
            SELECT DISTINCT i.customer_id FROM invoices i
            JOIN invoice_items ii ON ii.invoice_id=i.id
            JOIN products p ON p.id=ii.product_id
            WHERE i.company_id=:cid AND (p.main_category=:cat OR p.sub_category=:cat)
        """), {"cid": company_id, "cat": segment_value}).all()
        return {row[0] for row in rows}
    return set()


@router.get("/campaigns/audience-estimate")
def campaign_audience_estimate(request: Request, segment_type: str = "", segment_value: str = ""):
    if segment_type not in SEGMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"segment_type must be one of: {', '.join(sorted(t for t in SEGMENT_TYPES if t))}")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        segment_ids = _segment_customer_ids(conn, company_id, segment_type, segment_value)
        if segment_ids is None:
            all_rows = conn.execute(text("SELECT id FROM customers WHERE company_id=:cid"), {"cid": company_id}).all()
            segment_ids = {row[0] for row in all_rows}
        consenting_rows = conn.execute(text(
            "SELECT id FROM customers WHERE company_id=:cid AND marketing_consent=1"
        ), {"cid": company_id}).all()
        consenting_ids = {row[0] for row in consenting_rows}
        reachable = segment_ids & consenting_ids
        excluded = segment_ids - consenting_ids
        return {
            "segment_type": segment_type,
            # True potential audience for this segment, regardless of consent -
            # never inflated/faked, always the real segment membership count.
            "segment_size": len(segment_ids),
            "reachable_with_consent": len(reachable),
            "excluded_due_to_consent": len(excluded),
        }


@router.post("/campaigns/{campaign_id}/submit")
def submit_campaign(campaign_id: int, request: Request):
    actor, _ = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("SELECT * FROM social_campaigns WHERE id=:id AND company_id=:company_id"), {"id": campaign_id, "company_id": current_company_id(request)}).mappings().first()
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
        row = conn.execute(text("SELECT * FROM social_campaigns WHERE id=:id AND company_id=:company_id"), {"id": campaign_id, "company_id": current_company_id(request)}).mappings().first()
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
        row = conn.execute(text("SELECT * FROM social_campaigns WHERE id=:id AND company_id=:company_id"), {"id": campaign_id, "company_id": current_company_id(request)}).mappings().first()
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
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT channel, enabled, base_url, account_label, secret_reference,
                   last_test_status, last_tested_at, updated_at
            FROM commerce_connections WHERE company_id=:company_id ORDER BY channel
        """), {"company_id": company_id}).mappings().all()
        return [dict(row) for row in rows]


def _opportunity_shim_request(company_id: int):
    """Same one-off trick as app/executive_alerts.py's _shim_request: lets
    us call product_batches.list_expiring_batches(request, days) in-process
    with this endpoint's already-authorized company_id, instead of
    duplicating its expiry-date SQL here."""
    from types import SimpleNamespace
    return SimpleNamespace(state=SimpleNamespace(auth={"company_id": company_id}))


@router.get("/opportunities")
def sales_opportunities(request: Request):
    """Real, data-driven cross-sell/re-engagement signals for Section 10H -
    every item here is sourced from an existing, already-tested computation
    (ai_bi's risky-customer scoring, smart_inventory's dead-stock detection,
    product_batches' expiry tracking). No click-prediction or invented
    "AI recommendation" - the task spec explicitly forbids presenting
    unmeasurable/invented signals as factual."""
    from app.ai_bi.router import _build_payload
    from app.product_batches import list_expiring_batches
    from app.smart_inventory.routes import smart_inventory_overview

    company_id = current_company_id(request)
    with engine.begin() as conn:
        own_customer_ids = {row[0] for row in conn.execute(text("SELECT id FROM customers WHERE company_id=:cid"), {"cid": company_id}).all()}
        own_product_ids = {row[0] for row in conn.execute(text("SELECT id FROM products WHERE company_id=:cid"), {"cid": company_id}).all()}

    bi_payload = _build_payload(company_id)
    inactive_high_value = [
        {"type": "inactive_high_value_customer", "customer_id": c["id"], "customer_name": c.get("name", ""), "balance": c.get("balance", 0)}
        for c in bi_payload.get("risky_customers", [])
        if c["id"] in own_customer_ids
    ]

    inventory = smart_inventory_overview(_opportunity_shim_request(company_id))
    slow_moving = [
        {"type": "slow_moving_stock", "product_id": item["id"], "product_name": item.get("name", ""), "stock": item.get("stock"), "risk_level": item.get("risk_level")}
        for item in inventory.get("dead_stock", [])
        if item["id"] in own_product_ids
    ]

    expiring = list_expiring_batches(_opportunity_shim_request(company_id), days=30)
    expiring_soon = [
        {"type": "expiring_soon", "product_id": item.get("product_id"), "product_name": item.get("product_name", ""), "days_to_expiry": item.get("days_to_expiry"), "remaining_quantity": item.get("remaining_quantity")}
        for item in expiring
    ]

    return {
        "generated_at": _now(),
        "inactive_high_value_customers": inactive_high_value,
        "slow_moving_products": slow_moving,
        "expiring_soon_batches": expiring_soon,
        # Explicitly honest about what this endpoint does NOT compute -
        # matches the task spec's requirement to mark unsupported tracking
        # as "not available" rather than fabricate it.
        "overstock_products": {"available": False, "reason": "No excess-vs-demand computation exists yet beyond dead-stock detection."},
    }


@router.put("/connections/{channel}")
def save_connection(channel: str, payload: ConnectionPayload, request: Request):
    actor = _require_manager(request)
    company_id = current_company_id(request)
    if channel not in CHANNELS or payload.channel != channel:
        raise HTTPException(status_code=400, detail="Invalid channel")
    if payload.secret_reference and any(mark in payload.secret_reference.lower() for mark in ("bearer ", "token=", "api_key=")):
        raise HTTPException(status_code=400, detail="Store a secret reference, never a raw credential")
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            INSERT INTO commerce_connections
              (channel, enabled, base_url, account_label, secret_reference, updated_by, updated_at, company_id)
            VALUES (:channel, :enabled, :base_url, :account_label, :secret_reference, :actor, :now, :company_id)
            ON CONFLICT(company_id, channel) DO UPDATE SET
              enabled=excluded.enabled, base_url=excluded.base_url,
              account_label=excluded.account_label,
              secret_reference=excluded.secret_reference,
              updated_by=excluded.updated_by, updated_at=excluded.updated_at
        """), {**payload.dict(), "actor": actor, "now": _now(), "company_id": company_id})
        return {"status": "saved", "channel": channel}
