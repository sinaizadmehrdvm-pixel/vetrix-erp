"""Marketing-consent enforcement (Task 07, Section 4/C).

customers.marketing_consent (Task 02) existed as a plain boolean
defaulting to True with zero enforcement effect anywhere in the codebase
- Task 06's audit confirmed the ONLY place it was even read was the
campaign audience *estimate* (a pre-launch UI counter), never an actual
send path (none exists yet - see campaign_delivery.py, which posts one
message to a channel destination per campaign, never to individual
customers).

This module adds the missing pieces without rewriting the existing
column or fabricating historical provenance:
- marketing_consent_source/_recorded_at/_recorded_by on customers,
  distinguishing "explicitly set through this app" from "never touched,
  still whatever the row started as" - existing rows keep
  source='default' forever, since their true original intent is
  genuinely unknown and must not be invented.
- customer_consent_history: an append-only audit trail every explicit
  change writes to (Section 4.4).
- has_marketing_consent(): the one place any current-or-future
  per-customer marketing send must check before sending (Section 4.2) -
  reused, not duplicated, by online_commerce.py's audience estimate.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from app.database import engine
from app.company_scope import current_company_id

router = APIRouter(prefix="/api/customers", tags=["Marketing Consent"])

CONSENT_SOURCES = {"default", "explicit", "import"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS customer_consent_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            old_value BOOLEAN,
            new_value BOOLEAN NOT NULL,
            source VARCHAR NOT NULL DEFAULT 'explicit',
            changed_by INTEGER,
            changed_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    columns = {row[1] for row in conn.execute(text("PRAGMA table_info(customers)")).fetchall()}
    if "marketing_consent_source" not in columns:
        conn.execute(text("ALTER TABLE customers ADD COLUMN marketing_consent_source VARCHAR DEFAULT 'default'"))
    if "marketing_consent_recorded_at" not in columns:
        conn.execute(text("ALTER TABLE customers ADD COLUMN marketing_consent_recorded_at VARCHAR"))
    if "marketing_consent_recorded_by" not in columns:
        conn.execute(text("ALTER TABLE customers ADD COLUMN marketing_consent_recorded_by INTEGER"))


def record_consent_change(conn, customer_id, old_value, new_value, actor_user_id, company_id, source="explicit"):
    """Call only when a customer's marketing_consent value is actually
    CHANGING (compare before writing) - never for the silent default a
    brand-new row would otherwise carry with no real user action behind
    it. Updates the provenance columns on `customers` and appends one
    audit row."""
    now = _now()
    conn.execute(text("""
        UPDATE customers
        SET marketing_consent_source=:source, marketing_consent_recorded_at=:now, marketing_consent_recorded_by=:actor
        WHERE id=:id AND company_id=:company_id
    """), {"source": source, "now": now, "actor": actor_user_id, "id": customer_id, "company_id": company_id})
    conn.execute(text("""
        INSERT INTO customer_consent_history (customer_id, old_value, new_value, source, changed_by, changed_at, company_id)
        VALUES (:customer_id, :old_value, :new_value, :source, :changed_by, :changed_at, :company_id)
    """), {
        "customer_id": customer_id, "old_value": old_value, "new_value": new_value,
        "source": source, "changed_by": actor_user_id, "changed_at": now, "company_id": company_id,
    })


def has_marketing_consent(conn, customer_id, company_id) -> bool:
    """The one place any per-customer marketing send (none exists yet -
    see this module's own docstring) must check before sending. Reads the
    live value fresh every call, never a cached estimate."""
    row = conn.execute(
        text("SELECT marketing_consent FROM customers WHERE id=:id AND company_id=:company_id"),
        {"id": customer_id, "company_id": company_id},
    ).first()
    return bool(row[0]) if row else False


@router.get("/{customer_id}/consent-history")
def get_consent_history(customer_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        customer = conn.execute(
            text("SELECT id FROM customers WHERE id=:id AND company_id=:company_id"),
            {"id": customer_id, "company_id": company_id},
        ).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        rows = conn.execute(text("""
            SELECT h.id, h.old_value, h.new_value, h.source, h.changed_at, u.full_name AS changed_by_name
            FROM customer_consent_history h LEFT JOIN users u ON u.id=h.changed_by
            WHERE h.customer_id=:customer_id AND h.company_id=:company_id
            ORDER BY h.id DESC
        """), {"customer_id": customer_id, "company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}
