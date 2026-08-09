import json
from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, Float, Integer, String, Text
from sqlalchemy.orm import Session

from app.company_scope import current_company_id
from app.database import Base, SessionLocal

router = APIRouter()


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    # Milestone 5: each company has its own settings/branding row - see
    # get_or_create_settings(db, company_id). Nullable only for the same
    # add-then-backfill reason company_id is nullable on every other table
    # (see app/company_scope.py's ensure_company_id_column convention).
    company_id = Column(Integer, nullable=True)
    company_name = Column(String, default="Vetrix ERP")
    manager_name = Column(String, default="")
    phone = Column(String, default="")
    mobile = Column(String, default="")
    email = Column(String, default="")
    website = Column(String, default="")
    address = Column(Text, default="")
    national_id = Column(String, default="")
    economic_code = Column(String, default="")
    currency = Column(String, default="تومان")
    country_code = Column(String, default="IR")
    locale_code = Column(String, default="fa-IR")
    currency_code = Column(String, default="IRR")
    calendar_system = Column(String, default="persian")
    time_zone = Column(String, default="Asia/Tehran")
    first_day_of_week = Column(Integer, default=6)
    fiscal_year_start = Column(String, default="01-01-persian")
    tax_profile_version = Column(String, default="")
    tax_profile_verified_at = Column(String, default="")
    rounding_mode = Column(String, default="half_up")
    decimal_places = Column(Integer, default=0)
    measurement_system = Column(String, default="metric")
    tax_percent = Column(Float, default=10)
    discount_percent = Column(Float, default=0)
    fiscal_year = Column(String, default="")
    invoice_footer = Column(Text, default="")
    show_qr = Column(Boolean, default=True)
    show_barcode = Column(Boolean, default=True)
    show_logo = Column(Boolean, default=True)
    logo_data = Column(Text, default="")
    stamp_data = Column(Text, default="")
    signature_data = Column(Text, default="")
    theme = Column(String, default="dark")
    low_stock_default = Column(Float, default=5)
    auto_backup = Column(Boolean, default=False)
    backup_email = Column(String, default="")
    backup_email_frequency_hours = Column(Integer, default=168)
    last_backup_email_at = Column(String, default="")
    sms_panel = Column(String, default="")
    sms_api_key = Column(String, default="")
    smtp_host = Column(String, default="")
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String, default="")
    smtp_password = Column(String, default="")
    smtp_from = Column(String, default="")
    # JSON array of {id, name, link_template} - additional local/regional
    # messengers (beyond the built-in WhatsApp share link) the admin wants
    # payment reminders offered through. link_template supports {phone} and
    # {message} placeholders, mirroring the wa.me manual-share-link pattern
    # already used for WhatsApp - no provider API/credentials required.
    reminder_channels_json = Column(Text, default="[]")
    # Which set of extra invoice fields to offer (veterinary/human_medical/
    # pharmacy/general) - see app/industry_fields.py.
    industry = Column(String, default="general")
    # Automatic-send channels (real API calls, not manual share links) -
    # see app/telegram_utils.py and app/whatsapp_utils.py. Both fail closed
    # (503) until configured, same convention as SMTP/SMS/ZarinPal above.
    telegram_bot_token = Column(String, default="")
    whatsapp_phone_number_id = Column(String, default="")
    whatsapp_access_token = Column(String, default="")
    updated_at = Column(String, default="")


class AppSettingsUpdate(BaseModel):
    company_name: str = "Vetrix ERP"
    manager_name: str = ""
    phone: str = ""
    mobile: str = ""
    email: str = ""
    website: str = ""
    address: str = ""
    national_id: str = ""
    economic_code: str = ""
    currency: str = "تومان"
    country_code: str = "IR"
    locale_code: str = "fa-IR"
    currency_code: str = "IRR"
    calendar_system: str = "persian"
    time_zone: str = "Asia/Tehran"
    first_day_of_week: int = 6
    fiscal_year_start: str = "01-01-persian"
    tax_profile_version: str = ""
    tax_profile_verified_at: str = ""
    rounding_mode: str = "half_up"
    decimal_places: int = 0
    measurement_system: str = "metric"
    tax_percent: float = 10
    discount_percent: float = 0
    fiscal_year: str = ""
    invoice_footer: str = ""
    show_qr: bool = True
    show_barcode: bool = True
    show_logo: bool = True
    logo_data: str = ""
    stamp_data: str = ""
    signature_data: str = ""
    theme: str = "dark"
    low_stock_default: float = 5
    auto_backup: bool = False
    backup_email: str = ""
    backup_email_frequency_hours: int = 168
    sms_panel: str = ""
    sms_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    reminder_channels: list = []
    industry: str = "general"
    telegram_bot_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""


def settings_to_dict(settings: AppSettings):
    return {
        "id": settings.id,
        "company_name": settings.company_name or "Vetrix ERP",
        "manager_name": settings.manager_name or "",
        "phone": settings.phone or "",
        "mobile": settings.mobile or "",
        "email": settings.email or "",
        "website": settings.website or "",
        "address": settings.address or "",
        "national_id": settings.national_id or "",
        "economic_code": settings.economic_code or "",
        "currency": settings.currency or "تومان",
        "country_code": settings.country_code or "IR",
        "locale_code": settings.locale_code or "fa-IR",
        "currency_code": settings.currency_code or "IRR",
        "calendar_system": settings.calendar_system or "persian",
        "time_zone": settings.time_zone or "Asia/Tehran",
        "first_day_of_week": int(settings.first_day_of_week if settings.first_day_of_week is not None else 6),
        "fiscal_year_start": settings.fiscal_year_start or "01-01-persian",
        "tax_profile_version": settings.tax_profile_version or "",
        "tax_profile_verified_at": settings.tax_profile_verified_at or "",
        "rounding_mode": settings.rounding_mode or "half_up",
        "decimal_places": int(settings.decimal_places if settings.decimal_places is not None else 0),
        "measurement_system": settings.measurement_system or "metric",
        "tax_percent": float(settings.tax_percent or 0),
        "discount_percent": float(settings.discount_percent or 0),
        "fiscal_year": settings.fiscal_year or "",
        "invoice_footer": settings.invoice_footer or "",
        "show_qr": bool(settings.show_qr),
        "show_barcode": bool(settings.show_barcode),
        "show_logo": bool(settings.show_logo),
        "logo_data": settings.logo_data or "",
        "stamp_data": settings.stamp_data or "",
        "signature_data": settings.signature_data or "",
        "theme": settings.theme or "dark",
        "low_stock_default": float(settings.low_stock_default or 0),
        "auto_backup": bool(settings.auto_backup),
        "backup_email": settings.backup_email or "",
        "backup_email_frequency_hours": int(settings.backup_email_frequency_hours or 168),
        "last_backup_email_at": settings.last_backup_email_at or "",
        "sms_panel": settings.sms_panel or "",
        "sms_api_key": settings.sms_api_key or "",
        "smtp_host": settings.smtp_host or "",
        "smtp_port": int(settings.smtp_port or 587),
        "smtp_user": settings.smtp_user or "",
        "smtp_password": settings.smtp_password or "",
        "smtp_from": settings.smtp_from or "",
        "reminder_channels": _load_reminder_channels(settings.reminder_channels_json),
        "industry": settings.industry or "general",
        "telegram_bot_token": settings.telegram_bot_token or "",
        "whatsapp_phone_number_id": settings.whatsapp_phone_number_id or "",
        "whatsapp_access_token": settings.whatsapp_access_token or "",
        "updated_at": settings.updated_at or "",
    }


def _load_reminder_channels(raw):
    try:
        parsed = json.loads(raw or "[]")
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError):
        return []


def get_or_create_settings(db: Session, company_id: int):
    settings = db.query(AppSettings).filter(AppSettings.company_id == company_id).first()
    if not settings:
        settings = AppSettings(updated_at=datetime.utcnow().isoformat(), company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/settings")
def get_settings(request: Request):
    db: Session = SessionLocal()
    try:
        settings = get_or_create_settings(db, current_company_id(request))
        result = settings_to_dict(settings)
        db.close()
        return result
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@router.post("/settings")
def save_settings(data: AppSettingsUpdate, request: Request):
    db: Session = SessionLocal()
    try:
        settings = get_or_create_settings(db, current_company_id(request))
        payload = data.dict()
        reminder_channels = payload.pop("reminder_channels", None)

        for key, value in payload.items():
            if hasattr(settings, key):
                setattr(settings, key, value)

        if reminder_channels is not None:
            settings.reminder_channels_json = json.dumps(reminder_channels, ensure_ascii=False)

        settings.updated_at = datetime.utcnow().isoformat()
        db.commit()
        db.refresh(settings)

        result = {"status": "saved", "settings": settings_to_dict(settings)}
        db.close()
        return result
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@router.put("/settings")
def update_settings(data: AppSettingsUpdate, request: Request):
    return save_settings(data, request)
