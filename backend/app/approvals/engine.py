"""Generic, configurable multi-level approval engine - not specific to
payment voids. Any future feature (purchase approval, discounts, price
overrides, inventory adjustments, warehouse transfers, credit-limit
overrides, expense approval, journal entries, ...) can reuse this by
registering an executor for its own `resource_type` (see
`register_executor` below) rather than building a parallel workflow.

Deliberately a *sibling* to app/accounting/approvals.py, not an extension
of it - that module stays exactly as-is, still governing manual-voucher
maker-checker approval. This engine generalizes the same shape (request /
decide / event, maker != checker, period-lock awareness) over an arbitrary
resource_type/resource_id instead of being hardcoded to accounting_vouchers.

Multi-level chains: `approval_rules` rows for the same (resource_type,
amount band) at increasing `level` must all approve, in order, before the
request is fully approved and its executor runs.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import engine

router = APIRouter(prefix="/api/approvals", tags=["Approval Engine"])

# resource_type -> callable(resource_id, decided_by, company_id) -> dict
# Populated by each feature module at import time (e.g.
# app/invoice_payments.py registers "invoice_payment_void"/"invoice_payment_refund").
# A registry, not a direct import, so this module never needs to import its
# consumers (avoids a circular import) and a brand-new resource_type is
# "register a function," not a redesign of this engine. Each executor opens
# and commits its own DB session (matching every other *_impl function in
# this codebase, e.g. main.py's _create_invoice_impl) rather than sharing
# this engine's own connection - see app/invoice_payments.py's void/refund
# executors for why (they reuse the ORM-based add_customer_entry/
# post_transaction_to_general_ledger helpers, which need a Session).
EXECUTORS: dict = {}

# Roles that satisfy ANY approval level whenever no company-specific rule
# row exists yet - mirrors app/accounting/approvals.py's existing
# admin/accountant baseline so this engine works correctly out of the box.
DEFAULT_APPROVER_ROLES = {"admin", "accountant"}


def register_executor(resource_type: str, fn):
    EXECUTORS[resource_type] = fn


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS approval_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_type VARCHAR NOT NULL,
            min_amount REAL,
            max_amount REAL,
            role_filter VARCHAR DEFAULT '',
            required_role VARCHAR NOT NULL,
            level INTEGER NOT NULL DEFAULT 1,
            active BOOLEAN NOT NULL DEFAULT 1,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS approval_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_type VARCHAR NOT NULL,
            resource_id INTEGER NOT NULL,
            amount REAL,
            requested_by INTEGER NOT NULL,
            requested_at VARCHAR NOT NULL,
            reason VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            current_level INTEGER NOT NULL DEFAULT 1,
            required_levels TEXT NOT NULL DEFAULT '[]',
            before_state TEXT,
            after_state TEXT,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS approval_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            actor_user_id INTEGER NOT NULL,
            level INTEGER,
            note VARCHAR DEFAULT '',
            ip_address VARCHAR DEFAULT '',
            user_agent VARCHAR DEFAULT '',
            created_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    ensure_company_id_column(conn, "approval_rules")
    ensure_company_id_column(conn, "approval_requests")
    ensure_company_id_column(conn, "approval_events")


def resolve_required_levels(conn, resource_type: str, amount, requester_role: str, company_id: int) -> list:
    """Ordered list of required roles, one per level, for this
    resource_type/amount/requester combination. Empty list means "no
    approval needed - the action may execute immediately," which this
    engine never returns for a registered resource_type (every consumer
    goes through at least the default single level) - callers rely on
    that to always create a request."""
    amount = float(amount or 0)
    rows = conn.execute(text("""
        SELECT level, required_role, role_filter FROM approval_rules
        WHERE resource_type=:resource_type AND active=1 AND company_id=:company_id
          AND (min_amount IS NULL OR :amount >= min_amount)
          AND (max_amount IS NULL OR :amount <= max_amount)
        ORDER BY level ASC
    """), {"resource_type": resource_type, "company_id": company_id, "amount": amount}).mappings().all()
    applicable = [row for row in rows if not row["role_filter"] or row["role_filter"] == requester_role]
    if applicable:
        return [row["required_role"] for row in applicable]
    # No company-specific rule configured yet: a single default level,
    # satisfied by any role in DEFAULT_APPROVER_ROLES (see the sentinel
    # handling in approve() below) - this is what makes the engine work
    # correctly out of the box with zero configuration.
    return ["__default_approver__"]


def _auth(request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _event(conn, request_id, event_type, actor, company_id, level=None, note="", request_obj=None):
    conn.execute(text("""
        INSERT INTO approval_events
          (request_id, event_type, actor_user_id, level, note, ip_address, user_agent, created_at, company_id)
        VALUES (:request_id, :event_type, :actor, :level, :note, :ip, :ua, :now, :company_id)
    """), {
        "request_id": request_id, "event_type": event_type, "actor": actor, "level": level,
        "note": (note or "").strip(),
        "ip": request_obj.client.host if (request_obj and request_obj.client) else "",
        "ua": request_obj.headers.get("user-agent", "") if request_obj else "",
        "now": datetime.now(timezone.utc).isoformat(),
        "company_id": company_id,
    })


def create_request(conn, resource_type: str, resource_id: int, amount, requester_id: int, requester_role: str,
                    reason: str, company_id: int, before_state: str = "", request_obj=None) -> dict:
    """Always creates a pending approval_requests row - the caller (a
    feature's own void/refund/etc. endpoint) never executes its action
    directly; it calls this, returns "pending_approval" to the client, and
    the actual action only runs from `decide()` below once every required
    level has approved."""
    import json
    _ensure_schema(conn)
    if not (reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to request approval")
    required_levels = resolve_required_levels(conn, resource_type, amount, requester_role, company_id)
    now = datetime.now(timezone.utc).isoformat()
    result = conn.execute(text("""
        INSERT INTO approval_requests
          (resource_type, resource_id, amount, requested_by, requested_at, reason,
           status, current_level, required_levels, before_state, company_id)
        VALUES
          (:resource_type, :resource_id, :amount, :requested_by, :now, :reason,
           'pending', 1, :required_levels, :before_state, :company_id)
    """), {
        "resource_type": resource_type, "resource_id": resource_id, "amount": float(amount or 0),
        "requested_by": requester_id, "now": now, "reason": reason.strip(),
        "required_levels": json.dumps(required_levels), "before_state": before_state,
        "company_id": company_id,
    })
    request_id = result.lastrowid
    _event(conn, request_id, "requested", requester_id, company_id, level=1, note=reason, request_obj=request_obj)
    return {"id": request_id, "status": "pending", "required_levels": required_levels}


def _request_row(conn, request_id, company_id):
    row = conn.execute(text("""
        SELECT ar.*, requester.full_name AS requested_by_name, requester.role AS requested_by_role
        FROM approval_requests ar
        LEFT JOIN users requester ON requester.id=ar.requested_by
        WHERE ar.id=:id AND ar.company_id=:company_id
    """), {"id": request_id, "company_id": company_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return dict(row)


@router.get("")
def list_approvals(request: Request, status: str = "pending"):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT ar.*, requester.full_name AS requested_by_name
            FROM approval_requests ar
            LEFT JOIN users requester ON requester.id=ar.requested_by
            WHERE ar.company_id=:company_id AND (:status='all' OR ar.status=:status)
            ORDER BY CASE WHEN ar.status='pending' THEN 0 ELSE 1 END, ar.requested_at DESC, ar.id DESC
        """), {"status": status, "company_id": company_id}).mappings().all()
        return [dict(row) for row in rows]


@router.get("/dashboard-summary")
def dashboard_summary(request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        pending = conn.execute(text(
            "SELECT COUNT(*) FROM approval_requests WHERE company_id=:c AND status='pending'"
        ), {"c": company_id}).scalar() or 0
        rejected = conn.execute(text(
            "SELECT COUNT(*) FROM approval_requests WHERE company_id=:c AND status='rejected'"
        ), {"c": company_id}).scalar() or 0
        approvers = conn.execute(text("""
            SELECT u.full_name, COUNT(*) AS decisions
            FROM approval_events e JOIN users u ON u.id=e.actor_user_id
            WHERE e.company_id=:c AND e.event_type IN ('approved','rejected')
            GROUP BY e.actor_user_id ORDER BY decisions DESC LIMIT 5
        """), {"c": company_id}).mappings().all()
        return {
            "pending_count": pending,
            "rejected_count": rejected,
            "most_active_approvers": [dict(row) for row in approvers],
        }


@router.get("/{approval_id}")
def approval_detail(approval_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _request_row(conn, approval_id, company_id)
        events = conn.execute(text("""
            SELECT e.*, u.full_name AS actor_name FROM approval_events e
            LEFT JOIN users u ON u.id=e.actor_user_id
            WHERE e.request_id=:id ORDER BY e.id
        """), {"id": approval_id}).mappings().all()
        approval["events"] = [dict(row) for row in events]
        return approval


class DecisionPayload(BaseModel):
    note: str = ""


@router.post("/{approval_id}/approve")
def approve(approval_id: int, payload: DecisionPayload, request: Request):
    """Deliberately does NOT hold one long-lived transaction across the
    executor call - registered executors (see EXECUTORS) open their own
    SessionLocal() (so they can reuse the ORM-based add_customer_entry/
    post_transaction_to_general_ledger helpers), and SQLite allows only one
    writer at a time: an outer `engine.begin()` transaction still open while
    the executor's own session tries to write would deadlock as
    "database is locked". So this runs three short, separate transactions
    instead: validate+log (committed), the executor's own transaction
    (its own commit), then a final status-only update."""
    actor, role = _auth(request)
    company_id = current_company_id(request)
    import json

    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _request_row(conn, approval_id, company_id)
        if approval["status"] != "pending":
            raise HTTPException(status_code=409, detail="Approval request is not pending")
        if approval["requested_by"] == actor:
            raise HTTPException(status_code=409, detail="Maker-checker violation: requester cannot approve their own request")
        required_levels = json.loads(approval["required_levels"] or "[]")
        current_level = int(approval["current_level"] or 1)
        expected_role = required_levels[current_level - 1] if current_level - 1 < len(required_levels) else "__default_approver__"
        allowed = role in DEFAULT_APPROVER_ROLES if expected_role == "__default_approver__" else role == expected_role
        if not allowed:
            display_role = "admin/accountant" if expected_role == "__default_approver__" else expected_role
            raise HTTPException(status_code=403, detail=f"This level requires role: {display_role}")
        _event(conn, approval_id, "approved", actor, company_id, level=current_level, note=payload.note, request_obj=request)
        if current_level < len(required_levels):
            conn.execute(text("""
                UPDATE approval_requests SET current_level=:next_level WHERE id=:id AND company_id=:company_id
            """), {"next_level": current_level + 1, "id": approval_id, "company_id": company_id})
            return {"status": "pending", "approval_id": approval_id, "current_level": current_level + 1}
        resource_type = approval["resource_type"]
        resource_id = approval["resource_id"]

    executor = EXECUTORS.get(resource_type)
    if not executor:
        raise HTTPException(status_code=500, detail=f"No executor registered for {resource_type}")
    result = executor(resource_id, actor, company_id)

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE approval_requests SET status='approved', after_state=:after WHERE id=:id AND company_id=:company_id
        """), {"after": json.dumps(result, default=str), "id": approval_id, "company_id": company_id})
    return {"status": "approved", "approval_id": approval_id, "result": result}


@router.post("/{approval_id}/reject")
def reject(approval_id: int, payload: DecisionPayload, request: Request):
    actor, _role = _auth(request)
    company_id = current_company_id(request)
    note = (payload.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A rejection note is required")
    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _request_row(conn, approval_id, company_id)
        if approval["status"] != "pending":
            raise HTTPException(status_code=409, detail="Approval request is not pending")
        if approval["requested_by"] == actor:
            raise HTTPException(status_code=409, detail="Maker-checker violation: requester cannot decide their own request")
        conn.execute(text("""
            UPDATE approval_requests SET status='rejected' WHERE id=:id AND company_id=:company_id
        """), {"id": approval_id, "company_id": company_id})
        _event(conn, approval_id, "rejected", actor, company_id, note=note, request_obj=request)
        return {"status": "rejected", "approval_id": approval_id}


@router.post("/{approval_id}/withdraw")
def withdraw(approval_id: int, request: Request):
    actor, _role = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _request_row(conn, approval_id, company_id)
        if approval["status"] != "pending":
            raise HTTPException(status_code=409, detail="Only pending requests can be withdrawn")
        if approval["requested_by"] != actor:
            raise HTTPException(status_code=403, detail="Only the requester can withdraw this request")
        conn.execute(text("""
            UPDATE approval_requests SET status='withdrawn' WHERE id=:id AND company_id=:company_id
        """), {"id": approval_id, "company_id": company_id})
        _event(conn, approval_id, "withdrawn", actor, company_id, request_obj=request)
        return {"status": "withdrawn", "approval_id": approval_id}


@router.post("/{approval_id}/emergency-override")
def emergency_override(approval_id: int, payload: DecisionPayload, request: Request):
    """Force-approves a pending request outside the normal chain. Gated to
    admin only (the only role with a real, enforced emergency-override
    capability today - see app/rbac.py's ROLE_CAPABILITIES entry, which is
    otherwise descriptive-only elsewhere in this codebase). Always logged
    as its own distinct event type, never disguised as a normal approval."""
    actor, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Emergency override requires admin role")
    note = (payload.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A reason is required for an emergency override")
    company_id = current_company_id(request)
    import json

    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _request_row(conn, approval_id, company_id)
        if approval["status"] != "pending":
            raise HTTPException(status_code=409, detail="Approval request is not pending")
        resource_type = approval["resource_type"]
        resource_id = approval["resource_id"]

    executor = EXECUTORS.get(resource_type)
    if not executor:
        raise HTTPException(status_code=500, detail=f"No executor registered for {resource_type}")
    result = executor(resource_id, actor, company_id)

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE approval_requests SET status='approved', after_state=:after WHERE id=:id AND company_id=:company_id
        """), {"after": json.dumps(result, default=str), "id": approval_id, "company_id": company_id})
        _event(conn, approval_id, "emergency_override", actor, company_id, note=note, request_obj=request)
        return {"status": "approved", "approval_id": approval_id, "result": result}
