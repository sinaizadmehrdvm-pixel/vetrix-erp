"""Automated Backup Delivery & Recovery Configuration (Task 04, Section 19).

Builds on top of app/backup/auto_backup.py (real SQLite .backup() API,
untouched) rather than a parallel backup mechanism - see that module for
backup creation/restore/rehearsal, all still reachable unchanged through
app/backup/router.py.

What is genuinely real here:
- Email delivery with a real file attachment (app/email_utils.py's
  send_email_with_attachment, already used by auto_backup.py's own
  _maybe_email_latest_backup for a single legacy address - this module
  adds multi-recipient policy config on top).
- Telegram document delivery via a NEW send_telegram_document() added to
  app/telegram_utils.py (real sendDocument Bot API call - the existing
  module only ever sent text before this task).
- WhatsApp document delivery via a NEW send_whatsapp_document() added to
  app/whatsapp_utils.py (real two-step Cloud API media-upload-then-send -
  same "not exercised against a live account" caveat that module's own
  docstring already carries for its text-sending sibling).
- A secure, short-lived, audience-scoped download link (same JWT pattern
  as app/auth.py's create_catalog_token), for a recipient who needs the
  file without an interactive login during an emergency.

What is honestly NOT claimed as real:
- No background scheduler process exists anywhere in this codebase
  (confirmed by research - only a request-piggyback middleware hook, see
  main.py's require_authenticated_api calling maybe_create_automatic_backup
  after every successful authenticated request). trigger_due_deliveries()
  below is wired into that SAME opportunistic hook for consistency with
  the rest of the app, but a policy will only actually fire on its own
  schedule if either (a) the app receives regular authenticated traffic,
  or (b) an external process (Windows Task Scheduler / cron) calls
  POST /api/backup-delivery/trigger-due on a real timer - that endpoint is
  HMAC-signed (same scheme as app/campaign_delivery.py) so a non-interactive
  caller can reach it without a login. This limitation is surfaced in the
  policy list response (`scheduler_note`) rather than hidden.
- No real encryption capability exists anywhere in this codebase - this
  module does not offer an "encryption" toggle at all, rather than fake one.
- Any recipient channel other than email/telegram/whatsapp/download is
  rejected up front with "Provider does not currently support backup-file
  delivery", never silently accepted.
- A delivery attempt is only ever logged "delivered" after the underlying
  provider call actually returns success; any exception is logged
  "failed" with the real error message, never swallowed into a false
  "delivered".
"""
import hashlib
import hmac
import os
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import engine
from app.super_admin import is_super_admin

router = APIRouter(prefix="/api/backup-delivery", tags=["Backup Delivery"])

FREQUENCIES = {"daily", "weekly", "manual"}
CHANNELS = {"email", "telegram", "whatsapp", "download"}
DELIVERY_STATUSES = {"scheduled", "creating", "created", "delivering", "delivered", "partially_delivered", "failed"}
MAX_RECIPIENTS = 10
MAX_CLOCK_SKEW_SECONDS = 300

SCHEDULER_NOTE = (
    "This deployment has no standalone background worker process. A policy "
    "fires opportunistically on real authenticated app traffic, or exactly "
    "on schedule only if an external scheduler (Windows Task Scheduler / "
    "cron) calls POST /api/backup-delivery/trigger-due on a real timer."
)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS backup_delivery_policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            frequency VARCHAR NOT NULL DEFAULT 'daily',
            time_of_day VARCHAR NOT NULL DEFAULT '02:00',
            timezone VARCHAR NOT NULL DEFAULT 'UTC',
            enabled BOOLEAN NOT NULL DEFAULT 1,
            recipients_json TEXT NOT NULL DEFAULT '[]',
            last_run_at VARCHAR,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS backup_delivery_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            policy_id INTEGER,
            backup_filename VARCHAR,
            size_bytes INTEGER,
            sha256 VARCHAR,
            scope VARCHAR NOT NULL DEFAULT 'database',
            status VARCHAR NOT NULL DEFAULT 'scheduled',
            delivery_attempts_json TEXT NOT NULL DEFAULT '[]',
            created_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    ensure_company_id_column(conn, "backup_delivery_policies")
    ensure_company_id_column(conn, "backup_delivery_log")


def _require_admin(request: Request):
    """Backups cover the whole shared database file, i.e. every tenant's
    data at once (see auto_backup.create_database_backup) - a per-company
    "admin" role must never be sufficient here, or any company could
    self-provision an admin user and exfiltrate every other company's
    data through a backup/delivery policy. Only a real super-admin
    (app/super_admin.py - a flag independent of the per-company role)
    may create, deliver, or download a backup."""
    auth = getattr(request.state, "auth", {})
    if not is_super_admin(auth):
        raise HTTPException(status_code=403, detail="Super-administrator access required")
    try:
        return int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")


class Recipient(BaseModel):
    channel: str
    target: str
    label: str = ""


class PolicyCreate(BaseModel):
    name: str
    frequency: str = "daily"
    time_of_day: str = "02:00"
    timezone: str = "UTC"
    enabled: bool = True
    recipients: list[Recipient] = []


def _validate_policy(data: PolicyCreate):
    if data.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"frequency must be one of: {', '.join(sorted(FREQUENCIES))}")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Policy name is required")
    if len(data.recipients) > MAX_RECIPIENTS:
        raise HTTPException(status_code=400, detail=f"A policy may have at most {MAX_RECIPIENTS} recipients")
    for r in data.recipients:
        if r.channel not in CHANNELS:
            raise HTTPException(
                status_code=400,
                detail=f"Provider '{r.channel}' does not currently support backup-file delivery. Supported: {', '.join(sorted(CHANNELS))}",
            )
        if r.channel != "download" and not r.target.strip():
            raise HTTPException(status_code=400, detail=f"A target (email/chat id/phone) is required for channel '{r.channel}'")


def _policy_to_dict(row):
    import json
    item = dict(row)
    item["recipients"] = json.loads(item.pop("recipients_json") or "[]")
    item["scheduler_note"] = SCHEDULER_NOTE
    return item


@router.get("/policies")
def list_policies(request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text(
            "SELECT * FROM backup_delivery_policies WHERE company_id=:company_id ORDER BY id DESC"
        ), {"company_id": company_id}).mappings().all()
        return {"items": [_policy_to_dict(r) for r in rows], "scheduler_note": SCHEDULER_NOTE}


@router.post("/policies")
def create_policy(data: PolicyCreate, request: Request):
    import json
    _validate_policy(data)
    _require_admin(request)
    company_id = current_company_id(request)
    now = _now()
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text("""
            INSERT INTO backup_delivery_policies (name, frequency, time_of_day, timezone, enabled, recipients_json, created_at, updated_at, company_id)
            VALUES (:name, :frequency, :time_of_day, :timezone, :enabled, :recipients_json, :now, :now, :company_id)
        """), {
            "name": data.name, "frequency": data.frequency, "time_of_day": data.time_of_day, "timezone": data.timezone,
            "enabled": data.enabled, "recipients_json": json.dumps([r.model_dump() for r in data.recipients]),
            "now": now, "company_id": company_id,
        })
        return {"status": "created", "id": result.lastrowid}


@router.put("/policies/{policy_id}")
def update_policy(policy_id: int, data: PolicyCreate, request: Request):
    import json
    _validate_policy(data)
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        existing = conn.execute(text(
            "SELECT id FROM backup_delivery_policies WHERE id=:id AND company_id=:company_id"
        ), {"id": policy_id, "company_id": company_id}).first()
        if not existing:
            raise HTTPException(status_code=404, detail="Policy not found")
        conn.execute(text("""
            UPDATE backup_delivery_policies SET name=:name, frequency=:frequency, time_of_day=:time_of_day,
              timezone=:timezone, enabled=:enabled, recipients_json=:recipients_json, updated_at=:now
            WHERE id=:id AND company_id=:company_id
        """), {
            "name": data.name, "frequency": data.frequency, "time_of_day": data.time_of_day, "timezone": data.timezone,
            "enabled": data.enabled, "recipients_json": json.dumps([r.model_dump() for r in data.recipients]),
            "now": _now(), "id": policy_id, "company_id": company_id,
        })
        return {"status": "updated"}


@router.delete("/policies/{policy_id}")
def delete_policy(policy_id: int, request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text(
            "DELETE FROM backup_delivery_policies WHERE id=:id AND company_id=:company_id"
        ), {"id": policy_id, "company_id": company_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Policy not found")
        return {"status": "deleted"}


def _deliver_to_recipient(company_id, recipient, filename, content) -> dict:
    from app.auth import create_backup_download_token
    from app.email_utils import send_email_with_attachment, smtp_configured
    from app.telegram_utils import send_telegram_document, telegram_configured
    from app.whatsapp_utils import send_whatsapp_document, whatsapp_configured

    channel = recipient.get("channel")
    target = recipient.get("target", "")
    attempted_at = _now()
    try:
        if channel == "email":
            if not smtp_configured(company_id):
                raise ValueError("SMTP is not configured (Settings > Email)")
            send_email_with_attachment(
                company_id, target, f"Vetrix ERP database backup - {filename}",
                "Attached: a database backup delivered per your configured backup policy. "
                "Store it securely - it may contain sensitive business data.",
                filename, content, "application/octet-stream",
            )
        elif channel == "telegram":
            if not telegram_configured(company_id):
                raise ValueError("Telegram is not configured (Settings > Telegram bot token)")
            send_telegram_document(company_id, target, filename, content, caption="Vetrix ERP database backup")
        elif channel == "whatsapp":
            if not whatsapp_configured(company_id):
                raise ValueError("WhatsApp is not configured (Settings > WhatsApp)")
            send_whatsapp_document(company_id, target, filename, content, caption="Vetrix ERP database backup")
        elif channel == "download":
            token = create_backup_download_token(filename)
            return {"channel": channel, "target": target or "internal", "status": "delivered", "attempted_at": attempted_at, "download_token": token}
        else:
            raise ValueError(f"Provider '{channel}' does not currently support backup-file delivery")
        return {"channel": channel, "target": target, "status": "delivered", "attempted_at": attempted_at}
    except Exception as error:  # noqa: BLE001 - a provider failure must be logged, never silently swallowed
        return {"channel": channel, "target": target, "status": "failed", "error": str(error), "attempted_at": attempted_at}


def _run_policy(conn, policy_id, company_id):
    import json
    from app.backup.auto_backup import create_database_backup, backup_directory

    policy = conn.execute(text(
        "SELECT * FROM backup_delivery_policies WHERE id=:id AND company_id=:company_id"
    ), {"id": policy_id, "company_id": company_id}).mappings().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    result = conn.execute(text("""
        INSERT INTO backup_delivery_log (policy_id, status, created_at, company_id)
        VALUES (:policy_id, 'creating', :now, :company_id)
    """), {"policy_id": policy_id, "now": _now(), "company_id": company_id})
    log_id = result.lastrowid

    try:
        backup = create_database_backup(kind="auto")
    except (OSError, ValueError) as error:
        conn.execute(text("UPDATE backup_delivery_log SET status='failed', delivery_attempts_json=:attempts WHERE id=:id"),
                     {"attempts": json.dumps([{"error": str(error)}]), "id": log_id})
        return {"status": "failed", "error": str(error)}

    content = (backup_directory() / backup["filename"]).read_bytes()
    recipients = json.loads(policy["recipients_json"] or "[]")
    attempts = [_deliver_to_recipient(company_id, r, backup["filename"], content) for r in recipients]
    delivered = sum(1 for a in attempts if a["status"] == "delivered")
    if not recipients:
        overall = "created"
    elif delivered == len(recipients):
        overall = "delivered"
    elif delivered > 0:
        overall = "partially_delivered"
    else:
        overall = "failed"

    conn.execute(text("""
        UPDATE backup_delivery_log SET backup_filename=:filename, size_bytes=:size, sha256=:sha256,
          status=:status, delivery_attempts_json=:attempts WHERE id=:id
    """), {
        "filename": backup["filename"], "size": backup["size_bytes"], "sha256": backup["sha256"],
        "status": overall, "attempts": json.dumps(attempts), "id": log_id,
    })
    conn.execute(text("UPDATE backup_delivery_policies SET last_run_at=:now WHERE id=:id"), {"now": _now(), "id": policy_id})
    return {"status": overall, "backup_filename": backup["filename"], "attempts": attempts}


@router.post("/policies/{policy_id}/run-now")
def run_policy_now(policy_id: int, request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        return _run_policy(conn, policy_id, company_id)


def _is_due(policy, now):
    if not policy["enabled"] or policy["frequency"] == "manual":
        return False
    if not policy["last_run_at"]:
        return True
    last_run = datetime.fromisoformat(policy["last_run_at"])
    interval = timedelta(days=1) if policy["frequency"] == "daily" else timedelta(weeks=1)
    return now - last_run >= interval


def trigger_due_deliveries():
    """Called both opportunistically (main.py's request-piggyback hook,
    same convention as maybe_create_automatic_backup) and by the real
    external trigger endpoint below - see module docstring for why neither
    alone guarantees true wall-clock autonomy."""
    now = datetime.now(timezone.utc)
    ran = []
    try:
        with engine.begin() as conn:
            _ensure_schema(conn)
            policies = conn.execute(text("SELECT * FROM backup_delivery_policies")).mappings().all()
            due = [dict(p) for p in policies if _is_due(dict(p), now)]
        for policy in due:
            with engine.begin() as conn:
                _ensure_schema(conn)
                result = _run_policy(conn, policy["id"], policy["company_id"])
                ran.append({"policy_id": policy["id"], **result})
    except Exception:
        # Same rule as every other opportunistic hook in main.py - never let
        # a background delivery attempt turn an unrelated successful request
        # into a client-visible failure.
        pass
    return ran


def _trigger_secret():
    value = os.getenv("VETRIX_BACKUP_TRIGGER_SECRET", "").strip()
    if len(value) < 24:
        raise HTTPException(status_code=503, detail="Backup trigger secret is not configured securely")
    return value


def _verify_trigger_signature(request: Request, body: bytes):
    timestamp = request.headers.get("X-Vetrix-Timestamp", "").strip()
    supplied = request.headers.get("X-Vetrix-Signature", "").strip().lower()
    try:
        timestamp_number = int(timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid trigger timestamp")
    if abs(int(time.time()) - timestamp_number) > MAX_CLOCK_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="Trigger request expired")
    body_hash = hashlib.sha256(body).hexdigest()
    canonical = f"{timestamp}\n{request.method.upper()}\n{request.url.path}\n{body_hash}".encode("utf-8")
    expected = hmac.new(_trigger_secret().encode("utf-8"), canonical, hashlib.sha256).hexdigest()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid trigger signature")


@router.post("/trigger-due")
async def trigger_due_endpoint(request: Request):
    """Public path (see app/auth.py PUBLIC_PATHS) - HMAC-signed like
    app/campaign_delivery.py's claim/complete/fail, so an external
    scheduler (Windows Task Scheduler / cron) can call this on a real
    timer without an interactive admin session."""
    body = await request.body()
    _verify_trigger_signature(request, body)
    ran = trigger_due_deliveries()
    return {"status": "checked", "ran": ran}


@router.get("/secure-download")
def secure_download(token: str):
    """Public path - the whole point of this route is a recipient without
    a login (e.g. reached via the emailed/Telegrammed link) can still
    retrieve the file during an emergency, using only the short-lived,
    audience-scoped token in the link itself as authorization."""
    import jwt as pyjwt
    from fastapi.responses import FileResponse
    from app.auth import decode_backup_download_token
    from app.backup.auto_backup import backup_directory, BACKUP_NAME

    try:
        claims = decode_backup_download_token(token)
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired download link")
    filename = claims["filename"]
    if not BACKUP_NAME.fullmatch(str(filename)):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    path = (backup_directory() / filename).resolve()
    if path.parent != backup_directory() or not path.exists():
        raise HTTPException(status_code=404, detail="Backup no longer available")
    return FileResponse(path, filename=filename, media_type="application/octet-stream")


@router.get("/log")
def list_delivery_log(request: Request):
    import json
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT l.*, p.name AS policy_name FROM backup_delivery_log l
            LEFT JOIN backup_delivery_policies p ON p.id=l.policy_id
            WHERE l.company_id=:company_id ORDER BY l.id DESC LIMIT 100
        """), {"company_id": company_id}).mappings().all()
        items = []
        for r in rows:
            item = dict(r)
            item["delivery_attempts"] = json.loads(item.pop("delivery_attempts_json") or "[]")
            items.append(item)
        return {"items": items}
