"""Shared WhatsApp helper - real WhatsApp Cloud API (Meta) send integration,
mirroring app/email_utils.py / app/sms_utils.py / app/telegram_utils.py's
shape and fail-closed convention. Settings page > WhatsApp phone number ID
+ access token gate sending; fails closed (503) until configured.

Like app/payment_gateway.py's ZarinPal integration, this follows the Cloud
API's published REST contract but has not been exercised against a live
Meta Business account in this environment - smoke-test against a real
account before relying on it in production.

Real-world constraint this app cannot bypass: WhatsApp only allows
freeform text to a number that messaged the business within the last 24
hours, or via a pre-approved message template outside that window. This
helper always sends freeform text; if Meta rejects it for template/window
reasons, that error surfaces as-is rather than being silently retried -
the existing manual wa.me share link (see PaymentReminders.jsx) remains
available as a fallback that always works with zero configuration.
"""
import httpx

from app.database import SessionLocal

WHATSAPP_API_URL = "https://graph.facebook.com/v20.0/{phone_number_id}/messages"


def whatsapp_credentials(company_id: int | None) -> dict:
    from app.settings_routes import AppSettings

    db = SessionLocal()
    try:
        row = db.query(AppSettings).filter(AppSettings.company_id == company_id).first()
    finally:
        db.close()
    return {
        "phone_number_id": ((row.whatsapp_phone_number_id if row else "") or "").strip(),
        "access_token": ((row.whatsapp_access_token if row else "") or "").strip(),
    }


def whatsapp_configured(company_id: int | None = None) -> bool:
    creds = whatsapp_credentials(company_id)
    return bool(creds["phone_number_id"] and creds["access_token"])


def send_whatsapp_message(company_id: int | None, to_number: str, text: str, timeout: int = 15) -> dict:
    creds = whatsapp_credentials(company_id)
    if not creds["phone_number_id"] or not creds["access_token"]:
        raise ValueError("WhatsApp is not configured (Settings > WhatsApp)")
    if not to_number:
        raise ValueError("This customer has no phone number on file")

    response = httpx.post(
        WHATSAPP_API_URL.format(phone_number_id=creds["phone_number_id"]),
        headers={"Authorization": f"Bearer {creds['access_token']}"},
        json={
            "messaging_product": "whatsapp",
            "to": to_number,
            "type": "text",
            "text": {"body": text},
        },
        timeout=timeout,
    )
    data = response.json()
    if "error" in data:
        raise ValueError((data["error"] or {}).get("message") or "WhatsApp rejected the request")
    return {"status": "sent", "provider": "whatsapp"}
