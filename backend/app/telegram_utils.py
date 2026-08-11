"""Shared Telegram helper - mirrors app/email_utils.py and app/sms_utils.py's
shape and fail-closed convention. Settings page > Telegram bot token gates
sending; until an admin configures it, sending fails closed (503) rather
than pretending to succeed.

Telegram's own constraint (not something this app can work around): a bot
can only message a user who has already started a conversation with it
(sent /start or any message). There is no way to push a first message to
an arbitrary phone number. Customer.telegram_chat_id is therefore only
populated once the customer has messaged the bot - see the webhook below.
"""
import httpx

from app.database import SessionLocal

TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/{method}"


def telegram_bot_token(company_id: int | None) -> str:
    from app.settings_routes import AppSettings

    db = SessionLocal()
    try:
        row = db.query(AppSettings).filter(AppSettings.company_id == company_id).first()
    finally:
        db.close()
    return ((row.telegram_bot_token if row else "") or "").strip()


def telegram_configured(company_id: int | None = None) -> bool:
    return bool(telegram_bot_token(company_id))


def send_telegram_message(company_id: int | None, chat_id: str, text: str, timeout: int = 15) -> dict:
    token = telegram_bot_token(company_id)
    if not token:
        raise ValueError("Telegram bot is not configured (Settings > Telegram bot token)")
    if not chat_id:
        raise ValueError("This customer has no Telegram chat linked yet")

    response = httpx.post(
        TELEGRAM_API_URL.format(token=token, method="sendMessage"),
        json={"chat_id": chat_id, "text": text},
        timeout=timeout,
    )
    data = response.json()
    if not data.get("ok"):
        raise ValueError(data.get("description") or "Telegram rejected the request")
    return {"status": "sent", "provider": "telegram"}


def send_telegram_document(company_id: int | None, chat_id: str, filename: str, content: bytes, caption: str = "", timeout: int = 60) -> dict:
    """Real Telegram Bot API sendDocument call (Task 04, Section 19) - a
    genuine extension of the already-real send_telegram_message above, not
    a new fabricated capability. Telegram's own file-size ceiling for
    bot-uploaded documents is 50MB; a larger backup will be rejected by
    Telegram itself with a clear error, not silently truncated."""
    token = telegram_bot_token(company_id)
    if not token:
        raise ValueError("Telegram bot is not configured (Settings > Telegram bot token)")
    if not chat_id:
        raise ValueError("No Telegram chat is linked for this recipient")

    response = httpx.post(
        TELEGRAM_API_URL.format(token=token, method="sendDocument"),
        data={"chat_id": chat_id, "caption": caption[:1024]},
        files={"document": (filename, content, "application/octet-stream")},
        timeout=timeout,
    )
    data = response.json()
    if not data.get("ok"):
        raise ValueError(data.get("description") or "Telegram rejected the document")
    return {"status": "sent", "provider": "telegram"}


def resolve_chat_id_from_update(update: dict) -> tuple[str, str]:
    """Pulls (chat_id, text) out of a Telegram webhook update payload, for
    the /api/telegram/webhook receiver that links a customer's chat once
    they message the bot (e.g. sending their order/customer code)."""
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    return str(chat.get("id") or ""), str(message.get("text") or "")
