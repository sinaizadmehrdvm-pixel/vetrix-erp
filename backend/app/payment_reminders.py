"""Automated overdue payment reminders.

Invoices have no explicit due date in this app, so "overdue" means a sale
invoice still unpaid/partial VETRIX_PAYMENT_REMINDER_DAYS (default 7) after
it was created. Generation is wired into the same per-request hook as
auto-backup/recurring invoices/recurring-invoice generation
(maybe_create_automatic_backup) - see main.py's middleware - rather than a
real background scheduler, which this app has never had.

Sending requires SMTP configuration (VETRIX_SMTP_HOST and friends); when
it's absent, or the customer has no email on file, or a send genuinely
fails, every outcome is still recorded to payment_reminder_log so staff
have visibility - the same honest-logging pattern app/catalog_messaging.py
uses for inbound chat orders it couldn't complete.

Computing "remaining owed" reuses main.py's invoice_settled_amount() via a
deferred, function-local `import main` (see app/recurring_invoices.py's
docstring for why: that settlement logic is the delicate core of the
accounting engine and is deliberately left untouched here).
"""
import os
import re
import urllib.parse
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import Column, DateTime, Integer, String, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.email_utils import send_email, smtp_configured
from app.financial_policy import financial_policy_values
from app.message_templates import get_effective_template
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.company_scope import current_company_id
from app.telegram_utils import send_telegram_message, telegram_configured
from app.whatsapp_utils import send_whatsapp_message, whatsapp_configured

router = APIRouter(prefix="/api/payment-reminders", tags=["Automated Payment Reminders"])


class PaymentReminderLog(Base):
    __tablename__ = "payment_reminder_log"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, nullable=False)
    customer_id = Column(Integer, nullable=False)
    channel = Column(String, nullable=False)  # email
    status = Column(String, nullable=False)  # sent / failed / skipped_not_configured / skipped_no_email
    detail = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, nullable=True)


PaymentReminderLog.__table__.create(bind=engine, checkfirst=True)


def _overdue_days() -> int:
    return max(1, int(os.getenv("VETRIX_PAYMENT_REMINDER_DAYS", "7")))


def _cooldown_days() -> int:
    return max(1, int(os.getenv("VETRIX_PAYMENT_REMINDER_COOLDOWN_DAYS", "3")))


def _days_overdue(invoice: Invoice, today: date) -> int:
    due_date = getattr(invoice, "due_date", None)
    if due_date:
        try:
            return max(0, (today - date.fromisoformat(str(due_date)[:10])).days)
        except ValueError:
            pass
    return max(0, (datetime.utcnow() - invoice.created_at).days - _overdue_days())


def _escalation_tier(days_overdue: int) -> str:
    """friendly (just overdue) -> firm (over a week) -> urgent (over a month)."""
    if days_overdue >= 30:
        return "urgent"
    if days_overdue >= 8:
        return "firm"
    return "friendly"


def _language_for_policy(policy: dict) -> str:
    country = str(policy.get("country_code") or "IR").upper()
    if country == "IR":
        return "fa"
    if country == "TR":
        return "tr"
    if country in {"SA", "AE", "EG", "IQ", "JO", "KW", "QA", "BH", "OM"}:
        return "ar"
    return "en"


def _reminder_subject(db: Session, invoice: Invoice, tier: str, language: str) -> str:
    template = get_effective_template(db.connection(), f"payment_reminder_{tier}", "email", language, invoice.company_id)
    return (template["subject"] or "").format(id=invoice.id)


def _reminder_body(db: Session, invoice: Invoice, customer: Customer, remaining: float, tier: str = "friendly", language: str = "en") -> str:
    template = get_effective_template(db.connection(), f"payment_reminder_{tier}", "email", language, invoice.company_id)
    return template["body"].format(name=customer.name, id=invoice.id, amount=f"{remaining:,.0f}", brand="Vetrix ERP")


def _whatsapp_number(customer: Customer) -> str:
    raw = getattr(customer, "mobile", "") or getattr(customer, "phone", "") or ""
    digits = re.sub(r"\D", "", raw)
    return digits


def whatsapp_reminder_link(db: Session, invoice: Invoice, customer: Customer, remaining: float, policy: dict) -> dict:
    tier = _escalation_tier(_days_overdue(invoice, datetime.utcnow().date()))
    language = _language_for_policy(policy)
    message = _reminder_body(db, invoice, customer, remaining, tier, language)
    number = _whatsapp_number(customer)
    if not number:
        return {"available": False, "url": None, "message": message, "tier": tier, "number": ""}
    return {
        "available": True,
        "url": f"https://wa.me/{number}?text={urllib.parse.quote(message)}",
        "message": message,
        "tier": tier,
        "number": number,
    }


def _record(db: Session, invoice_id: int, customer_id: int, channel: str, status: str, detail: str = "", company_id: int = None) -> PaymentReminderLog:
    entry = PaymentReminderLog(
        invoice_id=invoice_id, customer_id=customer_id, channel=channel, status=status, detail=(detail or "")[:1000],
        company_id=company_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def _reminded_within_cooldown(db: Session, invoice_id: int) -> bool:
    cutoff = datetime.utcnow() - timedelta(days=_cooldown_days())
    return (
        db.query(PaymentReminderLog)
        .filter(PaymentReminderLog.invoice_id == invoice_id, PaymentReminderLog.created_at >= cutoff)
        .first()
        is not None
    )


def send_reminder_for_invoice(db: Session, invoice: Invoice, customer, remaining: float, force: bool = False):
    """Returns the log entry, or None if skipped silently due to cooldown
    (only relevant for the automatic background sweep - a manual "send now"
    always passes force=True so staff intent is never silently dropped).
    Tone escalates with how overdue the invoice is (friendly/firm/urgent),
    and the message language follows the shop's configured country instead
    of always being English."""
    if not force and _reminded_within_cooldown(db, invoice.id):
        return None

    tier = _escalation_tier(_days_overdue(invoice, datetime.utcnow().date()))
    policy = financial_policy_values(db.connection(), invoice.company_id)
    language = _language_for_policy(policy)

    # Telegram and WhatsApp auto-send are additional, best-effort channels -
    # logged the same way as email but never override its returned entry
    # (existing callers only look at the email result), so this stays fully
    # backward compatible while genuinely sending through every configured
    # automatic channel, not just email.
    if customer and telegram_configured(invoice.company_id) and getattr(customer, "telegram_chat_id", ""):
        try:
            send_telegram_message(invoice.company_id, customer.telegram_chat_id, _reminder_body(db, invoice, customer, remaining, tier, language))
            _record(db, invoice.id, invoice.customer_id, "telegram", "sent", f"Sent to chat {customer.telegram_chat_id} ({tier})", invoice.company_id)
        except Exception as error:
            _record(db, invoice.id, invoice.customer_id, "telegram", "failed", str(error), invoice.company_id)

    if customer and whatsapp_configured(invoice.company_id) and _whatsapp_number(customer):
        try:
            send_whatsapp_message(invoice.company_id, _whatsapp_number(customer), _reminder_body(db, invoice, customer, remaining, tier, language))
            _record(db, invoice.id, invoice.customer_id, "whatsapp_auto", "sent", f"Sent to {_whatsapp_number(customer)} ({tier})", invoice.company_id)
        except Exception as error:
            _record(db, invoice.id, invoice.customer_id, "whatsapp_auto", "failed", str(error), invoice.company_id)

    if not smtp_configured(invoice.company_id):
        return _record(db, invoice.id, invoice.customer_id, "email", "skipped_not_configured", "SMTP is not configured", invoice.company_id)
    if not customer or not customer.email:
        return _record(db, invoice.id, invoice.customer_id, "email", "skipped_no_email", "Customer has no email on file", invoice.company_id)
    try:
        send_email(
            invoice.company_id,
            customer.email,
            _reminder_subject(db, invoice, tier, language),
            _reminder_body(db, invoice, customer, remaining, tier, language),
        )
        return _record(db, invoice.id, invoice.customer_id, "email", "sent", f"Sent to {customer.email} ({tier})", invoice.company_id)
    except Exception as error:
        return _record(db, invoice.id, invoice.customer_id, "email", "failed", str(error), invoice.company_id)


def _is_overdue(invoice, today) -> bool:
    """Prefers the invoice's own due_date when it has one (set explicitly or
    derived from its payment_terms_days at creation); only invoices that
    predate this feature (due_date never set) fall back to the old flat
    VETRIX_PAYMENT_REMINDER_DAYS-after-creation assumption."""
    due_date = getattr(invoice, "due_date", None)
    if due_date:
        try:
            return date.fromisoformat(str(due_date)[:10]) < today
        except ValueError:
            pass
    cutoff = datetime.utcnow() - timedelta(days=_overdue_days())
    return invoice.created_at <= cutoff


def _overdue_candidates(db: Session, company_id: int = None):
    import main  # deferred - see module docstring

    today = datetime.utcnow().date()
    query = db.query(Invoice).filter(
        Invoice.invoice_type == "sale",
        Invoice.payment_status != "paid",
    )
    if company_id is not None:
        query = query.filter(Invoice.company_id == company_id)
    invoices = query.all()
    results = []
    for invoice in invoices:
        if not _is_overdue(invoice, today):
            continue
        # Policy is looked up per-invoice (not once for the whole batch) so
        # the unscoped background sweep (company_id=None, see
        # maybe_send_due_reminders below) still applies each company's own
        # rounding/decimal-places policy correctly.
        policy = financial_policy_values(db.connection(), invoice.company_id)
        remaining = float(main.accounting_money(
            invoice.total_amount - main.invoice_settled_amount(db, invoice, policy),
            policy["decimal_places"], policy["rounding_mode"],
        ))
        if remaining > 0:
            results.append((invoice, remaining))
    return results


def maybe_send_due_reminders():
    try:
        with engine.connect() as conn:
            table = conn.execute(text("""
                SELECT name FROM sqlite_master WHERE type='table' AND name='payment_reminder_log'
            """)).fetchone()
            if not table:
                return
        db: Session = SessionLocal()
        try:
            for invoice, remaining in _overdue_candidates(db):
                customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
                send_reminder_for_invoice(db, invoice, customer, remaining)
        finally:
            db.close()
    except Exception:
        # Background reminders must never turn a completed business
        # operation into a client-visible failure.
        pass


@router.get("/status")
def reminder_status(request: Request):
    return {
        "smtp_configured": smtp_configured(current_company_id(request)),
        "overdue_days_threshold": _overdue_days(),
        "cooldown_days": _cooldown_days(),
    }


@router.get("/overdue")
def list_overdue_invoices(request: Request):
    db: Session = SessionLocal()
    try:
        today = datetime.utcnow().date()
        company_id = current_company_id(request)
        customers = {c.id: c.name for c in db.query(Customer).filter(Customer.company_id == company_id).all()}
        items = [
            {
                "invoice_id": invoice.id,
                "customer_id": invoice.customer_id,
                "customer_name": customers.get(invoice.customer_id, ""),
                "remaining_amount": remaining,
                "created_at": invoice.created_at,
                "due_date": getattr(invoice, "due_date", "") or "",
                "days_overdue": _days_overdue(invoice, today),
                "tier": _escalation_tier(_days_overdue(invoice, today)),
            }
            for invoice, remaining in _overdue_candidates(db, company_id)
        ]
        return {"items": items, "overdue_days_threshold": _overdue_days()}
    finally:
        db.close()


@router.get("/whatsapp-link/{invoice_id}")
def get_whatsapp_reminder_link(invoice_id: int, request: Request):
    import main  # deferred - see module docstring

    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == current_company_id(request)).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

        policy = financial_policy_values(db.connection(), invoice.company_id)
        remaining = float(main.accounting_money(
            invoice.total_amount - main.invoice_settled_amount(db, invoice, policy),
            policy["decimal_places"], policy["rounding_mode"],
        ))
        result = whatsapp_reminder_link(db, invoice, customer, remaining, policy)
        if result["available"]:
            _record(db, invoice.id, invoice.customer_id, "whatsapp", "link_opened", f"Tier: {result['tier']}", invoice.company_id)
        return result
    finally:
        db.close()


@router.get("/log")
def list_reminder_log(request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        rows = db.query(PaymentReminderLog).filter(PaymentReminderLog.company_id == company_id).order_by(PaymentReminderLog.id.desc()).limit(200).all()
        customers = {c.id: c.name for c in db.query(Customer).filter(Customer.company_id == company_id).all()}
        return {
            "items": [
                {
                    "id": row.id,
                    "invoice_id": row.invoice_id,
                    "customer_id": row.customer_id,
                    "customer_name": customers.get(row.customer_id, ""),
                    "channel": row.channel,
                    "status": row.status,
                    "detail": row.detail,
                    "created_at": row.created_at,
                }
                for row in rows
            ]
        }
    finally:
        db.close()


@router.post("/send/{invoice_id}")
def send_reminder_now(invoice_id: int, request: Request):
    import main  # deferred - see module docstring

    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == current_company_id(request)).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if invoice.invoice_type != "sale":
            raise HTTPException(status_code=400, detail="Only sale invoices can have payment reminders")

        policy = financial_policy_values(db.connection(), invoice.company_id)
        remaining = float(main.accounting_money(
            invoice.total_amount - main.invoice_settled_amount(db, invoice, policy),
            policy["decimal_places"], policy["rounding_mode"],
        ))
        if remaining <= 0:
            raise HTTPException(status_code=400, detail="Invoice is already fully paid")

        customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        entry = send_reminder_for_invoice(db, invoice, customer, remaining, force=True)
        return {"status": entry.status, "detail": entry.detail}
    finally:
        db.close()
