"""Idempotency-key support for mutating endpoints that must be safe to
retry (e.g. a client that submitted a request but never saw the response,
or the offline-sync queue replaying a queued create). No such mechanism
existed anywhere in this codebase before - this is the first one, modeled
on the standard "Idempotency-Key" HTTP header pattern.

Deliberately opt-in: a caller (HTTP or internal) that sends no key just
runs `handler()` directly, so every existing caller is unaffected."""
from datetime import datetime, timezone
import json

from fastapi import HTTPException
from sqlalchemy import text

from app.database import engine


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            key VARCHAR PRIMARY KEY,
            endpoint VARCHAR NOT NULL,
            company_id INTEGER,
            request_hash VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'in_progress',
            response_json TEXT,
            created_at VARCHAR NOT NULL,
            completed_at VARCHAR
        )
    """))


def run_idempotent(key, endpoint: str, company_id: int, request_hash: str, handler):
    """Runs `handler()` (a zero-arg callable returning a JSON-serializable
    dict) under idempotency-key protection. Without a key, just calls
    `handler()` - fully backward compatible for any caller that doesn't
    send one."""
    if not key:
        return handler()

    with engine.begin() as conn:
        _ensure_schema(conn)
        existing = conn.execute(
            text("SELECT * FROM idempotency_keys WHERE key=:key"), {"key": key}
        ).mappings().first()

        if existing and existing["status"] == "completed":
            if existing["request_hash"] != request_hash:
                raise HTTPException(status_code=409, detail="Idempotency key reused with a different request payload")
            return json.loads(existing["response_json"])

        if existing and existing["status"] == "in_progress":
            raise HTTPException(status_code=409, detail="A request with this idempotency key is already in progress")

        if not existing:
            conn.execute(text("""
                INSERT INTO idempotency_keys (key, endpoint, company_id, request_hash, status, created_at)
                VALUES (:key, :endpoint, :company_id, :request_hash, 'in_progress', :now)
            """), {
                "key": key, "endpoint": endpoint, "company_id": company_id,
                "request_hash": request_hash, "now": datetime.now(timezone.utc).isoformat(),
            })

    # handler() opens/commits/closes its own session (matches every
    # _create_*_impl in this codebase) - deliberately run outside the
    # `engine.begin()` block above so the idempotency-row insert is
    # committed and visible to a concurrent duplicate request immediately,
    # not held behind the (potentially slow) handler's own transaction.
    try:
        response = handler()
    except Exception:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM idempotency_keys WHERE key=:key"), {"key": key})
        raise

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE idempotency_keys
            SET status='completed', response_json=:response_json, completed_at=:now
            WHERE key=:key
        """), {
            "response_json": json.dumps(response, default=str),
            "now": datetime.now(timezone.utc).isoformat(),
            "key": key,
        })
    return response
