from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.accounting.periods import assert_voucher_period_open
from app.database import engine

router = APIRouter(prefix="/api/accounting/approvals", tags=["Voucher Approvals"])


class DecisionPayload(BaseModel):
    note: str = ""


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS accounting_approval_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_id INTEGER NOT NULL UNIQUE,
            requested_by INTEGER NOT NULL,
            requested_at VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            decided_by INTEGER,
            decided_at VARCHAR,
            decision_note TEXT DEFAULT '',
            FOREIGN KEY(voucher_id) REFERENCES accounting_vouchers(id),
            FOREIGN KEY(requested_by) REFERENCES users(id),
            FOREIGN KEY(decided_by) REFERENCES users(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS accounting_approval_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            approval_id INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            actor_user_id INTEGER NOT NULL,
            note TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            FOREIGN KEY(approval_id) REFERENCES accounting_approval_requests(id)
        )
    """))


def _auth(request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _require_approver(request):
    user_id, role = _auth(request)
    if role not in {"admin", "accountant"}:
        raise HTTPException(status_code=403, detail="Admin or accountant approval is required")
    return user_id


def _approval(conn, approval_id):
    row = conn.execute(text("""
        SELECT ar.*, v.voucher_no, v.voucher_date, v.description,
               v.status AS voucher_status, v.source_type,
               v.total_debit, v.total_credit,
               requester.full_name AS requested_by_name,
               decider.full_name AS decided_by_name
        FROM accounting_approval_requests ar
        JOIN accounting_vouchers v ON v.id=ar.voucher_id
        LEFT JOIN users requester ON requester.id=ar.requested_by
        LEFT JOIN users decider ON decider.id=ar.decided_by
        WHERE ar.id=:id
    """), {"id": approval_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return dict(row)


def _event(conn, approval_id, event_type, actor, note=""):
    conn.execute(text("""
        INSERT INTO accounting_approval_events
          (approval_id, event_type, actor_user_id, note, created_at)
        VALUES (:approval_id, :event_type, :actor, :note, :created_at)
    """), {
        "approval_id": approval_id,
        "event_type": event_type,
        "actor": actor,
        "note": note.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


@router.get("")
def list_approvals(status: str = "pending"):
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT ar.*, v.voucher_no, v.voucher_date, v.description,
                   v.status AS voucher_status, v.source_type,
                   v.total_debit, v.total_credit,
                   requester.full_name AS requested_by_name,
                   decider.full_name AS decided_by_name
            FROM accounting_approval_requests ar
            JOIN accounting_vouchers v ON v.id=ar.voucher_id
            LEFT JOIN users requester ON requester.id=ar.requested_by
            LEFT JOIN users decider ON decider.id=ar.decided_by
            WHERE (:status='all' OR ar.status=:status)
            ORDER BY CASE WHEN ar.status='pending' THEN 0 ELSE 1 END,
                     ar.requested_at DESC, ar.id DESC
        """), {"status": status}).mappings().all()
        return [dict(row) for row in rows]


@router.get("/{approval_id}")
def approval_detail(approval_id: int):
    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _approval(conn, approval_id)
        events = conn.execute(text("""
            SELECT e.*, u.full_name AS actor_name, u.username AS actor_username
            FROM accounting_approval_events e
            LEFT JOIN users u ON u.id=e.actor_user_id
            WHERE e.approval_id=:id ORDER BY e.id
        """), {"id": approval_id}).mappings().all()
        approval["events"] = [dict(row) for row in events]
        return approval


@router.post("/vouchers/{voucher_id}/submit")
def submit_voucher(voucher_id: int, request: Request):
    actor, _ = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        voucher = conn.execute(text("""
            SELECT * FROM accounting_vouchers WHERE id=:id
        """), {"id": voucher_id}).mappings().first()
        if not voucher:
            raise HTTPException(status_code=404, detail="Voucher not found")
        if voucher["source_type"] != "manual":
            raise HTTPException(status_code=409, detail="Only manual vouchers use approval workflow")
        if voucher["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only draft vouchers can be submitted")
        if abs(float(voucher["total_debit"] or 0) - float(voucher["total_credit"] or 0)) >= 0.01:
            raise HTTPException(status_code=409, detail="Unbalanced voucher cannot be submitted")
        try:
            assert_voucher_period_open(conn, voucher_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error))
        existing = conn.execute(text("""
            SELECT * FROM accounting_approval_requests WHERE voucher_id=:id
        """), {"id": voucher_id}).mappings().first()
        now = datetime.now(timezone.utc).isoformat()
        if existing and existing["status"] == "pending":
            raise HTTPException(status_code=409, detail="Voucher is already pending approval")
        if existing:
            approval_id = existing["id"]
            conn.execute(text("""
                UPDATE accounting_approval_requests
                SET requested_by=:actor, requested_at=:now, status='pending',
                    decided_by=NULL, decided_at=NULL, decision_note=''
                WHERE id=:id
            """), {"actor": actor, "now": now, "id": approval_id})
        else:
            result = conn.execute(text("""
                INSERT INTO accounting_approval_requests
                  (voucher_id, requested_by, requested_at, status)
                VALUES (:voucher_id, :actor, :now, 'pending')
            """), {"voucher_id": voucher_id, "actor": actor, "now": now})
            approval_id = result.lastrowid
        _event(conn, approval_id, "submitted", actor)
        return {"status": "pending", "approval_id": approval_id, "voucher_id": voucher_id}


@router.post("/{approval_id}/approve")
def approve_voucher(approval_id: int, payload: DecisionPayload, request: Request):
    actor = _require_approver(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _approval(conn, approval_id)
        if approval["status"] != "pending":
            raise HTTPException(status_code=409, detail="Approval request is not pending")
        if approval["requested_by"] == actor:
            raise HTTPException(status_code=409, detail="Maker-checker violation: requester cannot approve their own voucher")
        if approval["voucher_status"] != "draft":
            raise HTTPException(status_code=409, detail="Voucher is no longer draft")
        try:
            assert_voucher_period_open(conn, approval["voucher_id"])
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error))
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(text("""
            UPDATE accounting_vouchers
            SET status='posted', posted_at=:now, updated_at=:now
            WHERE id=:id
        """), {"now": now, "id": approval["voucher_id"]})
        conn.execute(text("""
            UPDATE accounting_approval_requests
            SET status='approved', decided_by=:actor, decided_at=:now,
                decision_note=:note WHERE id=:id
        """), {
            "actor": actor, "now": now, "note": payload.note.strip(),
            "id": approval_id,
        })
        _event(conn, approval_id, "approved", actor, payload.note)
        return {"status": "approved", "approval_id": approval_id, "voucher_id": approval["voucher_id"]}


@router.post("/{approval_id}/reject")
def reject_voucher(approval_id: int, payload: DecisionPayload, request: Request):
    actor = _require_approver(request)
    note = payload.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Rejection note is required")
    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _approval(conn, approval_id)
        if approval["status"] != "pending":
            raise HTTPException(status_code=409, detail="Approval request is not pending")
        if approval["requested_by"] == actor:
            raise HTTPException(status_code=409, detail="Maker-checker violation: requester cannot decide their own voucher")
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(text("""
            UPDATE accounting_approval_requests
            SET status='rejected', decided_by=:actor, decided_at=:now,
                decision_note=:note WHERE id=:id
        """), {"actor": actor, "now": now, "note": note, "id": approval_id})
        _event(conn, approval_id, "rejected", actor, note)
        return {"status": "rejected", "approval_id": approval_id, "voucher_id": approval["voucher_id"]}


@router.post("/{approval_id}/withdraw")
def withdraw_request(approval_id: int, request: Request):
    actor, _ = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        approval = _approval(conn, approval_id)
        if approval["status"] != "pending":
            raise HTTPException(status_code=409, detail="Only pending requests can be withdrawn")
        if approval["requested_by"] != actor:
            raise HTTPException(status_code=403, detail="Only the requester can withdraw this request")
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(text("""
            UPDATE accounting_approval_requests
            SET status='withdrawn', decided_by=:actor, decided_at=:now
            WHERE id=:id
        """), {"actor": actor, "now": now, "id": approval_id})
        _event(conn, approval_id, "withdrawn", actor)
        return {"status": "withdrawn", "approval_id": approval_id}
