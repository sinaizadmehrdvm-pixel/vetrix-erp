import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/audit", tags=["Audit Trail"])
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")


def ensure_audit_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id VARCHAR NOT NULL UNIQUE,
            actor_user_id INTEGER,
            actor_username VARCHAR NOT NULL,
            actor_role VARCHAR NOT NULL,
            method VARCHAR NOT NULL,
            path VARCHAR NOT NULL,
            action VARCHAR NOT NULL,
            status_code INTEGER NOT NULL,
            client_ip VARCHAR,
            user_agent VARCHAR,
            created_at VARCHAR NOT NULL,
            previous_hash VARCHAR NOT NULL,
            event_hash VARCHAR NOT NULL UNIQUE
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_audit_events_created_at
        ON audit_events(created_at)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_audit_events_actor
        ON audit_events(actor_username)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_audit_events_path
        ON audit_events(path)
    """))


def classify_action(method, path):
    method = method.upper()
    final_segment = path.rstrip("/").rsplit("/", 1)[-1]
    if method == "DELETE":
        return "delete"
    if method in {"PUT", "PATCH"}:
        return "update"
    if final_segment in {"close", "reopen", "post", "cancel", "convert", "toggle"}:
        return final_segment
    return "create"


def _event_hash(payload):
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def record_audit_event(request, status_code):
    method = request.method.upper()
    if method not in MUTATING_METHODS:
        return

    auth = getattr(request.state, "auth", {}) or {}
    username = str(auth.get("username") or "bootstrap")
    role = str(auth.get("role") or "unknown")
    user_id = auth.get("sub")
    try:
        user_id = int(user_id) if user_id is not None else None
    except (TypeError, ValueError):
        user_id = None

    client_ip = request.client.host if request.client else ""
    user_agent = request.headers.get("user-agent", "")[:500]
    created_at = datetime.now(timezone.utc).isoformat()
    request_id = str(uuid4())
    action = classify_action(method, request.url.path)

    with engine.begin() as conn:
        ensure_audit_schema(conn)
        previous_hash = conn.execute(
            text("SELECT event_hash FROM audit_events ORDER BY id DESC LIMIT 1")
        ).scalar() or ("0" * 64)
        hash_payload = {
            "request_id": request_id,
            "actor_user_id": user_id,
            "actor_username": username,
            "actor_role": role,
            "method": method,
            "path": request.url.path,
            "action": action,
            "status_code": int(status_code),
            "client_ip": client_ip,
            "user_agent": user_agent,
            "created_at": created_at,
            "previous_hash": previous_hash,
        }
        event_hash = _event_hash(hash_payload)
        conn.execute(text("""
            INSERT INTO audit_events
            (request_id, actor_user_id, actor_username, actor_role, method, path,
             action, status_code, client_ip, user_agent, created_at,
             previous_hash, event_hash)
            VALUES
            (:request_id, :actor_user_id, :actor_username, :actor_role, :method,
             :path, :action, :status_code, :client_ip, :user_agent, :created_at,
             :previous_hash, :event_hash)
        """), {**hash_payload, "event_hash": event_hash})


def verify_audit_chain(conn):
    ensure_audit_schema(conn)
    rows = conn.execute(
        text("SELECT * FROM audit_events ORDER BY id ASC")
    ).mappings().all()
    expected_previous = "0" * 64
    for row in rows:
        payload = {
            "request_id": row["request_id"],
            "actor_user_id": row["actor_user_id"],
            "actor_username": row["actor_username"],
            "actor_role": row["actor_role"],
            "method": row["method"],
            "path": row["path"],
            "action": row["action"],
            "status_code": row["status_code"],
            "client_ip": row["client_ip"] or "",
            "user_agent": row["user_agent"] or "",
            "created_at": row["created_at"],
            "previous_hash": row["previous_hash"],
        }
        calculated = _event_hash(payload)
        if row["previous_hash"] != expected_previous or row["event_hash"] != calculated:
            return {
                "valid": False,
                "events_checked": len(rows),
                "broken_event_id": row["id"],
            }
        expected_previous = row["event_hash"]
    return {
        "valid": True,
        "events_checked": len(rows),
        "broken_event_id": None,
        "latest_hash": expected_previous if rows else None,
    }


@router.get("/events")
def list_audit_events(
    request: Request,
    actor: str = "",
    action: str = "",
    path: str = "",
    success: str = "all",
    from_date: str = "",
    to_date: str = "",
    limit: int = 100,
    offset: int = 0,
):
    _require_admin(request)
    where = []
    params = {
        "limit": max(1, min(int(limit or 100), 500)),
        "offset": max(0, int(offset or 0)),
    }
    if actor:
        where.append("actor_username LIKE :actor")
        params["actor"] = f"%{actor}%"
    if action:
        where.append("action=:action")
        params["action"] = action
    if path:
        where.append("path LIKE :path")
        params["path"] = f"%{path}%"
    if success == "true":
        where.append("status_code < 400")
    elif success == "false":
        where.append("status_code >= 400")
    if from_date:
        where.append("created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("created_at < :to_date")
        params["to_date"] = f"{to_date}T23:59:59.999999+00:00"

    sql_where = f" WHERE {' AND '.join(where)}" if where else ""
    with engine.begin() as conn:
        ensure_audit_schema(conn)
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM audit_events{sql_where}"),
            params,
        ).scalar() or 0
        rows = conn.execute(text(f"""
            SELECT * FROM audit_events
            {sql_where}
            ORDER BY id DESC
            LIMIT :limit OFFSET :offset
        """), params).mappings().all()
        return {
            "items": [dict(row) for row in rows],
            "total": int(total),
            "limit": params["limit"],
            "offset": params["offset"],
        }


@router.get("/integrity")
def audit_integrity(request: Request):
    _require_admin(request)
    with engine.begin() as conn:
        return verify_audit_chain(conn)
