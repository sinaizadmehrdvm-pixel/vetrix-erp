"""Payment provider/adapter configuration - the extensible foundation
Section 5B asks for, deliberately scoped to configuration + a real
provider-selection adapter, not a POS/checkout screen (none exists in
this app today, and Invoices.jsx's own Payment Panel - built earlier this
session - already is the real checkout/payment-collection flow).

Credentials are stored and returned to the admin the same way Settings
already handles smtp_password/sms_api_key/whatsapp_access_token
(app/settings_routes.py) - a company admin editing their own company's
config, not a public read - so this follows that exact precedent rather
than inventing a new secrets architecture.

`pos_terminal_generic` is a real, storable provider key (terminal_id +
branch config) but is NOT wired into app/payment_gateway.py's actual
charge-initiation path - there is no real card-terminal integration to
call, and building one without a real device/SDK would be exactly the
"fake capability" this task explicitly says not to insert. Selecting it
and trying to charge through it fails closed with a clear message.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import engine

router = APIRouter(prefix="/api/payment-providers", tags=["Payment Providers"])

# sandbox/zarinpal are real, wired providers (app/payment_gateway.py).
# pos_terminal_generic is configurable but not yet wired for charging -
# see module docstring.
PROVIDER_KEYS = {"sandbox", "zarinpal", "pos_terminal_generic"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _require_admin(request: Request):
    user_id, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user_id


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS payment_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_key VARCHAR NOT NULL,
            display_name VARCHAR NOT NULL DEFAULT '',
            enabled BOOLEAN NOT NULL DEFAULT 0,
            mode VARCHAR NOT NULL DEFAULT 'test',
            merchant_id VARCHAR DEFAULT '',
            api_key VARCHAR DEFAULT '',
            config_json TEXT DEFAULT '{}',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(company_id, provider_key)
        )
    """))
    ensure_company_id_column(conn, "payment_providers")


def _row_to_dict(row):
    return dict(row)


class ProviderUpsert(BaseModel):
    provider_key: str
    display_name: str = ""
    enabled: bool = False
    mode: str = "test"
    merchant_id: str = ""
    api_key: str = ""
    config: dict = {}


@router.get("")
def list_providers(request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT * FROM payment_providers WHERE company_id=:company_id ORDER BY provider_key
        """), {"company_id": company_id}).mappings().all()
    return {"items": [_row_to_dict(row) for row in rows], "available_keys": sorted(PROVIDER_KEYS)}


@router.post("")
def upsert_provider(data: ProviderUpsert, request: Request):
    _require_admin(request)
    if data.provider_key not in PROVIDER_KEYS:
        raise HTTPException(status_code=400, detail=f"provider_key must be one of: {', '.join(sorted(PROVIDER_KEYS))}")
    if data.mode not in {"test", "live"}:
        raise HTTPException(status_code=400, detail="mode must be 'test' or 'live'")
    company_id = current_company_id(request)
    now = _now()
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            INSERT INTO payment_providers
              (provider_key, display_name, enabled, mode, merchant_id, api_key, config_json, created_at, updated_at, company_id)
            VALUES
              (:provider_key, :display_name, :enabled, :mode, :merchant_id, :api_key, :config_json, :now, :now, :company_id)
            ON CONFLICT(company_id, provider_key) DO UPDATE SET
              display_name=excluded.display_name, enabled=excluded.enabled, mode=excluded.mode,
              merchant_id=excluded.merchant_id, api_key=excluded.api_key, config_json=excluded.config_json,
              updated_at=excluded.updated_at
        """), {
            "provider_key": data.provider_key,
            "display_name": data.display_name.strip(),
            "enabled": data.enabled,
            "mode": data.mode,
            "merchant_id": data.merchant_id.strip(),
            "api_key": data.api_key.strip(),
            "config_json": json.dumps(data.config, ensure_ascii=False),
            "now": now,
            "company_id": company_id,
        })
        row = conn.execute(text("""
            SELECT * FROM payment_providers WHERE company_id=:company_id AND provider_key=:provider_key
        """), {"company_id": company_id, "provider_key": data.provider_key}).mappings().first()
    return _row_to_dict(row)


@router.delete("/{provider_key}")
def reset_provider(provider_key: str, request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            DELETE FROM payment_providers WHERE company_id=:company_id AND provider_key=:provider_key
        """), {"company_id": company_id, "provider_key": provider_key})
    return {"status": "reset"}


def get_enabled_provider(company_id, preferred_keys=("zarinpal", "sandbox")):
    """Read-only lookup used by app/payment_gateway.py - the first enabled,
    DB-configured provider among preferred_keys, or None if none is
    configured (caller falls back to the legacy env-var behavior)."""
    with engine.begin() as conn:
        table_exists = conn.execute(text(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='payment_providers'"
        )).first()
        if not table_exists:
            return None
        rows = conn.execute(text("""
            SELECT * FROM payment_providers WHERE company_id=:company_id AND enabled=1
        """), {"company_id": company_id}).mappings().all()
    by_key = {row["provider_key"]: row for row in rows}
    for key in preferred_keys:
        if key in by_key:
            return _row_to_dict(by_key[key])
    return None
