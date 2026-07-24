import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import text

from app.catalog_messaging import ingest_catalog_order_message, is_catalog_order_message
from app.change_requests import _ensure_schema, _event
from app.database import engine

router = APIRouter(prefix="/api/inbound-voice", tags=["Verified Voice Webhooks"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _required_secret(name):
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(status_code=503, detail=f"{name} is not configured")
    return value


def _verify_telegram_secret(supplied):
    expected = _required_secret("VETRIX_TELEGRAM_WEBHOOK_SECRET")
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid Telegram webhook secret")


def _verify_whatsapp_signature(body, supplied):
    secret = _required_secret("VETRIX_WHATSAPP_APP_SECRET")
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid WhatsApp signature")


def _allowed_sender(sender):
    allowed = {
        value.strip()
        for value in os.getenv("VETRIX_VOICE_ALLOWED_CHAT_IDS", "").split(",")
        if value.strip()
    }
    if not allowed:
        raise HTTPException(
            status_code=503,
            detail="VETRIX_VOICE_ALLOWED_CHAT_IDS is not configured",
        )
    if str(sender) not in allowed:
        raise HTTPException(status_code=403, detail="Voice sender is not allow-listed")


def _service_user_id(conn):
    try:
        user_id = int(_required_secret("VETRIX_VOICE_SERVICE_USER_ID"))
    except ValueError:
        raise HTTPException(
            status_code=503, detail="VETRIX_VOICE_SERVICE_USER_ID must be numeric"
        )
    user = conn.execute(
        text("SELECT id, role FROM users WHERE id=:id"), {"id": user_id}
    ).mappings().first()
    if not user:
        raise HTTPException(status_code=503, detail="Voice service user does not exist")
    if str(user["role"]).lower() == "admin":
        raise HTTPException(
            status_code=503,
            detail="Voice service user must not be an administrator",
        )
    return user_id


def _ensure_inbound_schema(conn):
    _ensure_schema(conn)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inbound_voice_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source VARCHAR NOT NULL,
            external_event_id VARCHAR NOT NULL,
            sender_reference VARCHAR NOT NULL,
            change_request_id INTEGER NOT NULL,
            received_at VARCHAR NOT NULL,
            UNIQUE(source, external_event_id),
            FOREIGN KEY(change_request_id) REFERENCES managed_change_requests(id)
        )
    """))


def _ingest(source, event_id, sender, message_reference, transcript, media_reference):
    _allowed_sender(sender)
    clean_event = str(event_id or "").strip()
    if not clean_event or len(clean_event) > 300:
        raise HTTPException(status_code=400, detail="Invalid external event identifier")
    clean_transcript = str(transcript or "").strip()
    if not clean_transcript:
        clean_transcript = (
            "Voice message received; transcript and requested change require manager review."
        )
    clean_transcript = clean_transcript[:10000]
    with engine.begin() as conn:
        _ensure_inbound_schema(conn)
        existing = conn.execute(text("""
            SELECT change_request_id FROM inbound_voice_events
            WHERE source=:source AND external_event_id=:event_id
        """), {"source": source, "event_id": clean_event}).scalar()
        if existing:
            return {"status": "duplicate", "request_id": existing}
        actor = _service_user_id(conn)
        created = conn.execute(text("""
            INSERT INTO managed_change_requests
              (source, source_reference, audio_reference, transcript, action_type,
               target_id, proposed_changes, status, requested_by, requested_at,
               submitted_at)
            VALUES
              (:source, :source_reference, '', :transcript, 'note_only',
               NULL, '{}', 'needs_transcript_review', :actor, :now, NULL)
        """), {
            "source": source,
            "source_reference": str(message_reference or "")[:500],
            "transcript": clean_transcript,
            "actor": actor,
            "now": _now(),
        })
        request_id = created.lastrowid
        recorded = conn.execute(text("""
            INSERT OR IGNORE INTO inbound_voice_events
              (source, external_event_id, sender_reference,
               change_request_id, received_at)
            VALUES (:source, :event_id, :sender, :request_id, :now)
        """), {
            "source": source,
            "event_id": clean_event,
            "sender": str(sender)[:300],
            "request_id": request_id,
            "now": _now(),
        })
        if recorded.rowcount == 0:
            conn.execute(
                text("DELETE FROM managed_change_requests WHERE id=:id"),
                {"id": request_id},
            )
            duplicate = conn.execute(text("""
                SELECT change_request_id FROM inbound_voice_events
                WHERE source=:source AND external_event_id=:event_id
            """), {"source": source, "event_id": clean_event}).scalar()
            return {"status": "duplicate", "request_id": duplicate}
        _event(
            conn,
            request_id,
            "verified_external_voice_received",
            actor,
            f"source={source};media={str(media_reference or '')[:500]}",
        )
        return {"status": "needs_transcript_review", "request_id": request_id}


def _telegram_voice(payload):
    message = payload.get("message") or payload.get("channel_post") or {}
    media = message.get("voice") or message.get("audio")
    if not isinstance(media, dict):
        raise HTTPException(status_code=202, detail="No voice message in update")
    chat = message.get("chat") or {}
    sender = str(chat.get("id") or "")
    message_id = message.get("message_id")
    event_id = payload.get("update_id")
    return {
        "event_id": event_id,
        "sender": sender,
        "message_reference": f"{sender}:{message_id}",
        "transcript": message.get("caption") or message.get("text") or "",
        "media_reference": media.get("file_id") or "",
    }


def _whatsapp_voice(payload):
    try:
        value = payload["entry"][0]["changes"][0]["value"]
        message = value["messages"][0]
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=202, detail="No WhatsApp message in webhook")
    if message.get("type") not in {"audio", "voice"}:
        raise HTTPException(status_code=202, detail="No voice message in webhook")
    media = message.get("audio") or message.get("voice") or {}
    sender = str(message.get("from") or "")
    return {
        "event_id": message.get("id"),
        "sender": sender,
        "message_reference": message.get("id") or "",
        "transcript": message.get("text", {}).get("body", ""),
        "media_reference": media.get("id") or "",
    }


def _manager(request):
    auth = getattr(request.state, "auth", {})
    role = str(auth.get("role") or "").lower()
    if role not in {"admin", "accountant"}:
        raise HTTPException(status_code=403, detail="Manager access is required")


def _configuration_status():
    allowed = [
        value.strip()
        for value in os.getenv("VETRIX_VOICE_ALLOWED_CHAT_IDS", "").split(",")
        if value.strip()
    ]
    telegram_secret = bool(
        os.getenv("VETRIX_TELEGRAM_WEBHOOK_SECRET", "").strip()
    )
    whatsapp_secret = bool(
        os.getenv("VETRIX_WHATSAPP_APP_SECRET", "").strip()
    )
    whatsapp_verify = bool(
        os.getenv("VETRIX_WHATSAPP_VERIFY_TOKEN", "").strip()
    )
    service_user_value = os.getenv("VETRIX_VOICE_SERVICE_USER_ID", "").strip()
    service = {
        "configured": bool(service_user_value),
        "valid": False,
        "non_admin": False,
    }
    recent_events = {"total": 0, "last_received_at": None}
    with engine.begin() as conn:
        _ensure_inbound_schema(conn)
        if service_user_value.isdigit():
            user = conn.execute(
                text("SELECT role FROM users WHERE id=:id"),
                {"id": int(service_user_value)},
            ).mappings().first()
            service["valid"] = bool(user)
            service["non_admin"] = bool(
                user and str(user["role"]).lower() != "admin"
            )
        event_stats = conn.execute(text("""
            SELECT COUNT(*) total, MAX(received_at) last_received_at
            FROM inbound_voice_events
        """)).mappings().one()
        recent_events = {
            "total": int(event_stats["total"] or 0),
            "last_received_at": event_stats["last_received_at"],
        }
    common_ready = bool(allowed) and service["valid"] and service["non_admin"]
    return {
        "telegram": {
            "ready": common_ready and telegram_secret,
            "secret_configured": telegram_secret,
            "webhook_path": "/api/inbound-voice/telegram",
        },
        "whatsapp": {
            "ready": common_ready and whatsapp_secret and whatsapp_verify,
            "app_secret_configured": whatsapp_secret,
            "verify_token_configured": whatsapp_verify,
            "webhook_path": "/api/inbound-voice/whatsapp",
        },
        "allowed_sender_count": len(allowed),
        "service_user": service,
        "events": recent_events,
        "secrets_exposed": False,
    }


@router.get("/status")
def connection_status(request: Request):
    _manager(request)
    return _configuration_status()


@router.post("/diagnostics")
def run_connection_diagnostics(request: Request):
    _manager(request)
    result = _configuration_status()
    result["checked_at"] = _now()
    result["all_ready"] = (
        result["telegram"]["ready"] and result["whatsapp"]["ready"]
    )
    return result


@router.post("/telegram")
async def telegram_webhook(request: Request):
    _verify_telegram_secret(
        request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    )
    payload = await request.json()
    message = payload.get("message") or payload.get("channel_post") or {}
    text_body = message.get("text") or message.get("caption") or ""
    if is_catalog_order_message(text_body):
        chat = message.get("chat") or {}
        sender = str(chat.get("id") or "")
        sender_name = chat.get("first_name") or chat.get("username") or ""
        return ingest_catalog_order_message(
            source="telegram",
            event_id=payload.get("update_id"),
            sender=sender,
            sender_name=sender_name,
            message_text=text_body,
            message_reference=f"{sender}:{message.get('message_id')}",
        )
    return _ingest("telegram", **_telegram_voice(payload))


@router.get("/whatsapp")
def verify_whatsapp_webhook(request: Request):
    expected = _required_secret("VETRIX_WHATSAPP_VERIFY_TOKEN")
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge", "")
    if mode != "subscribe" or not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="Webhook verification failed")
    return PlainTextResponse(challenge)


@router.post("/whatsapp")
async def whatsapp_webhook(request: Request):
    body = await request.body()
    _verify_whatsapp_signature(
        body, request.headers.get("X-Hub-Signature-256")
    )
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    try:
        value = payload["entry"][0]["changes"][0]["value"]
        message = value["messages"][0]
    except (KeyError, IndexError, TypeError):
        message = None

    if message is not None:
        text_body = message.get("text", {}).get("body", "")
        if is_catalog_order_message(text_body):
            sender = str(message.get("from") or "")
            contacts = value.get("contacts") or [{}]
            sender_name = (contacts[0].get("profile") or {}).get("name", "")
            return ingest_catalog_order_message(
                source="whatsapp",
                event_id=message.get("id"),
                sender=sender,
                sender_name=sender_name,
                message_text=text_body,
                message_reference=message.get("id") or "",
            )

    return _ingest("whatsapp", **_whatsapp_voice(payload))
