from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/financial-policy", tags=["Financial Policy"])
ROUNDING_MODES = {"half_up", "half_even", "down", "up"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if str(auth.get("role") or "") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    try:
        return int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS financial_policy_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version VARCHAR NOT NULL UNIQUE,
            country_code VARCHAR NOT NULL,
            currency_code VARCHAR NOT NULL,
            decimal_places INTEGER NOT NULL,
            rounding_mode VARCHAR NOT NULL,
            effective_from VARCHAR NOT NULL,
            effective_to VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'draft',
            verification_note TEXT DEFAULT '',
            verified_by INTEGER,
            verified_at VARCHAR,
            created_by INTEGER NOT NULL,
            created_at VARCHAR NOT NULL,
            FOREIGN KEY(verified_by) REFERENCES users(id),
            FOREIGN KEY(created_by) REFERENCES users(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS financial_policy_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            policy_id INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            actor_user_id INTEGER NOT NULL,
            detail TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            FOREIGN KEY(policy_id) REFERENCES financial_policy_versions(id),
            FOREIGN KEY(actor_user_id) REFERENCES users(id)
        )
    """))


def _event(conn, policy_id, event_type, actor, detail=""):
    conn.execute(text("""
        INSERT INTO financial_policy_events
          (policy_id, event_type, actor_user_id, detail, created_at)
        VALUES (:policy_id, :event_type, :actor, :detail, :created_at)
    """), {"policy_id": policy_id, "event_type": event_type, "actor": actor, "detail": detail, "created_at": _now()})


def financial_policy_values(conn, business_date=None):
    _ensure_schema(conn)
    effective_date = business_date or date.today().isoformat()
    row = conn.execute(text("""
        SELECT decimal_places, rounding_mode, version, country_code, currency_code
        FROM financial_policy_versions
        WHERE status='active' AND effective_from<=:effective_date
          AND (effective_to IS NULL OR effective_to>=:effective_date)
        ORDER BY effective_from DESC, id DESC LIMIT 1
    """), {"effective_date": effective_date}).mappings().first()
    if not row:
        return {
            "decimal_places": 2,
            "rounding_mode": "half_up",
            "version": "compatibility-default",
            "verified": False,
        }
    result = dict(row)
    result["verified"] = True
    return result


class PolicyDraft(BaseModel):
    version: str = Field(min_length=1, max_length=80)
    country_code: str = Field(min_length=2, max_length=2)
    currency_code: str = Field(min_length=3, max_length=3)
    decimal_places: int = Field(ge=0, le=4)
    rounding_mode: str = "half_up"
    effective_from: str


class PolicyDecision(BaseModel):
    note: str = Field(min_length=3, max_length=2000)


def _validate(payload: PolicyDraft):
    if payload.rounding_mode not in ROUNDING_MODES:
        raise HTTPException(status_code=400, detail="Unsupported rounding mode")
    try:
        date.fromisoformat(payload.effective_from)
    except ValueError:
        raise HTTPException(status_code=400, detail="effective_from must be an ISO date")


@router.get("")
def list_policies():
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT p.*, creator.full_name created_by_name,
                   verifier.full_name verified_by_name
            FROM financial_policy_versions p
            LEFT JOIN users creator ON creator.id=p.created_by
            LEFT JOIN users verifier ON verifier.id=p.verified_by
            ORDER BY p.effective_from DESC, p.id DESC
        """)).mappings().all()
        return [dict(row) for row in rows]


@router.get("/active")
def active_policy():
    with engine.begin() as conn:
        _ensure_schema(conn)
        policy = financial_policy_values(conn)
        policy["status"] = "active" if policy.get("verified") else "compatibility_default"
        return policy


@router.post("")
def create_policy(payload: PolicyDraft, request: Request):
    actor = _admin(request)
    _validate(payload)
    with engine.begin() as conn:
        _ensure_schema(conn)
        try:
            result = conn.execute(text("""
                INSERT INTO financial_policy_versions
                  (version, country_code, currency_code, decimal_places,
                   rounding_mode, effective_from, status, created_by, created_at)
                VALUES
                  (:version, :country_code, :currency_code, :decimal_places,
                   :rounding_mode, :effective_from, 'draft', :actor, :now)
            """), {**payload.dict(), "country_code": payload.country_code.upper(),
                   "currency_code": payload.currency_code.upper(), "actor": actor, "now": _now()})
        except Exception as error:
            if "UNIQUE" in str(error).upper():
                raise HTTPException(status_code=409, detail="Policy version already exists")
            raise
        policy_id = result.lastrowid
        _event(conn, policy_id, "created", actor)
        return {"status": "draft", "policy_id": policy_id}


@router.post("/{policy_id}/activate")
def activate_policy(policy_id: int, decision: PolicyDecision, request: Request):
    actor = _admin(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        policy = conn.execute(text("SELECT * FROM financial_policy_versions WHERE id=:id"), {"id": policy_id}).mappings().first()
        if not policy:
            raise HTTPException(status_code=404, detail="Financial policy not found")
        if policy["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only draft policy can be activated")
        now = _now()
        conn.execute(text("""
            UPDATE financial_policy_versions
            SET status='retired', effective_to=:yesterday
            WHERE status='active' AND id<>:id
        """), {"yesterday": date.today().isoformat(), "id": policy_id})
        conn.execute(text("""
            UPDATE financial_policy_versions
            SET status='active', verified_by=:actor, verified_at=:now,
                verification_note=:note WHERE id=:id
        """), {"actor": actor, "now": now, "note": decision.note.strip(), "id": policy_id})
        conn.execute(text("""
            UPDATE app_settings SET decimal_places=:decimal_places,
              rounding_mode=:rounding_mode, currency_code=:currency_code,
              country_code=:country_code, tax_profile_version=:version,
              tax_profile_verified_at=:now
        """), {**dict(policy), "now": now})
        _event(conn, policy_id, "verified_and_activated", actor, decision.note.strip())
        return {"status": "active", "policy_id": policy_id, "version": policy["version"]}


@router.get("/{policy_id}/events")
def policy_events(policy_id: int):
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT e.*, u.full_name actor_name, u.username actor_username
            FROM financial_policy_events e
            LEFT JOIN users u ON u.id=e.actor_user_id
            WHERE e.policy_id=:id ORDER BY e.id
        """), {"id": policy_id}).mappings().all()
        return [dict(row) for row in rows]
