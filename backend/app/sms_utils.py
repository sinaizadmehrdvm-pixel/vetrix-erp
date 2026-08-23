"""Shared SMS helper - mirrors app/email_utils.py's shape and fail-closed
convention. Settings page > SMS panel stores the provider name + API key;
until an admin configures those, sending is disabled (fails closed, same
as VETRIX_PAYMENT_PROVIDER in app/payment_gateway.py) rather than silently
pretending to succeed.

Kavenegar is the only wired provider today (the dominant Iranian SMS
gateway, matching the ZarinPal precedent of shipping one real, tested
integration rather than several speculative ones). Any other sms_panel
value fails closed with a clear "not supported" error instead of guessing
at an API shape that was never verified against a real account.
"""
import httpx

from app.database import SessionLocal

KAVENEGAR_SEND_URL = "https://api.kavenegar.com/v1/{api_key}/sms/send.json"


def sms_settings(company_id: int | None) -> dict:
    from app.settings_routes import AppSettings

    db = SessionLocal()
    try:
        row = db.query(AppSettings).filter(AppSettings.company_id == company_id).first()
    finally:
        db.close()
    return {
        "panel": ((row.sms_panel if row else "") or "").strip().lower(),
        "api_key": ((row.sms_api_key if row else "") or "").strip(),
    }


def sms_configured(company_id: int | None = None) -> bool:
    settings = sms_settings(company_id)
    return bool(settings["panel"] and settings["api_key"])


def send_sms(company_id: int | None, to_number: str, text: str, timeout: int = 15) -> dict:
    settings = sms_settings(company_id)
    if not settings["panel"] or not settings["api_key"]:
        raise ValueError("SMS panel is not configured (Settings > SMS panel)")
    if settings["panel"] != "kavenegar":
        raise ValueError(f"SMS provider '{settings['panel']}' is not supported yet")

    try:
        response = httpx.post(
            KAVENEGAR_SEND_URL.format(api_key=settings["api_key"]),
            data={"receptor": to_number, "message": text},
            timeout=timeout,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        # httpx's own exception message (and any connection-level error
        # below) includes the full request URL, which embeds the API key
        # for this provider - never let that reach a caller that might
        # persist or display str(error) (e.g. a dispatch-log entry visible
        # in the UI). The status code alone is safe and useful to surface.
        raise ValueError(f"SMS provider returned an error (HTTP {error.response.status_code})") from None
    except httpx.HTTPError as error:
        raise ValueError(f"Could not reach the SMS provider ({type(error).__name__})") from None
    data = response.json()
    status = (data.get("return") or {}).get("status")
    if status != 200:
        raise ValueError((data.get("return") or {}).get("message") or "SMS provider rejected the request")
    return {"status": "sent", "provider": "kavenegar"}
