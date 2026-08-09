"""Shared SMTP helper - one place that resolves mail-server settings and
sends messages, used by payment reminders, scheduled report delivery, and
backup-copy emailing. DB-stored settings (Settings page > Email settings)
take priority over the VETRIX_SMTP_* environment variables, so an admin can
configure mail delivery entirely from the UI without server/file access;
the env vars remain as an ops-level fallback.
"""
import os
import smtplib
from email.message import EmailMessage

from app.database import SessionLocal


def smtp_settings(company_id: int | None) -> dict:
    from app.settings_routes import AppSettings

    db = SessionLocal()
    try:
        row = db.query(AppSettings).filter(AppSettings.company_id == company_id).first()
    finally:
        db.close()
    host = (row.smtp_host if row else "") or os.getenv("VETRIX_SMTP_HOST", "")
    port = (row.smtp_port if row and row.smtp_port else None) or int(os.getenv("VETRIX_SMTP_PORT", "587"))
    user = (row.smtp_user if row else "") or os.getenv("VETRIX_SMTP_USER", "")
    password = (row.smtp_password if row else "") or os.getenv("VETRIX_SMTP_PASSWORD", "")
    sender = ((row.smtp_from if row else "") or os.getenv("VETRIX_SMTP_FROM", "")).strip() or user or "no-reply@vetrix-erp.local"
    return {"host": host, "port": port, "user": user, "password": password, "sender": sender}


def smtp_configured(company_id: int | None = None) -> bool:
    return bool(smtp_settings(company_id)["host"].strip())


def send_email(company_id: int | None, to_email: str, subject: str, body: str, timeout: int = 15):
    smtp = smtp_settings(company_id)
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp["sender"]
    message["To"] = to_email
    message.set_content(body)
    with smtplib.SMTP(smtp["host"], smtp["port"], timeout=timeout) as server:
        server.starttls()
        if smtp["user"]:
            server.login(smtp["user"], smtp["password"])
        server.send_message(message)


def send_email_with_attachment(
    company_id: int | None, to_email: str, subject: str, body: str,
    filename: str, content: bytes, mime_type: str, timeout: int = 20,
):
    smtp = smtp_settings(company_id)
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp["sender"]
    message["To"] = to_email
    message.set_content(body)
    maintype, _, subtype = mime_type.partition("/")
    message.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)
    with smtplib.SMTP(smtp["host"], smtp["port"], timeout=timeout) as server:
        server.starttls()
        if smtp["user"]:
            server.login(smtp["user"], smtp["password"])
        server.send_message(message)
