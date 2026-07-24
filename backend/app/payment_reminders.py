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
import smtplib
from datetime import datetime, timedelta
from email.message import EmailMessage

from fastapi import APIRouter, HTTPException
from sqlalchemy import Column, DateTime, Integer, String, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.financial_policy import financial_policy_values
from app.models.customer import Customer
from app.models.invoice import Invoice

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


PaymentReminderLog.__table__.create(bind=engine, checkfirst=True)


def _overdue_days() -> int:
    return max(1, int(os.getenv("VETRIX_PAYMENT_REMINDER_DAYS", "7")))


def _cooldown_days() -> int:
    return max(1, int(os.getenv("VETRIX_PAYMENT_REMINDER_COOLDOWN_DAYS", "3")))


def _smtp_configured() -> bool:
    return bool(os.getenv("VETRIX_SMTP_HOST", "").strip())


def _send_email(to_email: str, subject: str, body: str):
    host = os.getenv("VETRIX_SMTP_HOST", "")
    port = int(os.getenv("VETRIX_SMTP_PORT", "587"))
    user = os.getenv("VETRIX_SMTP_USER", "")
    password = os.getenv("VETRIX_SMTP_PASSWORD", "")
    sender = os.getenv("VETRIX_SMTP_FROM", "").strip() or user or "no-reply@vetrix-erp.local"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls()
        if user:
            server.login(user, password)
        server.send_message(message)


def _reminder_body(invoice: Invoice, customer: Customer, remaining: float) -> str:
    return (
        f"Dear {customer.name},\n\n"
        f"This is a reminder that invoice #{invoice.id} for {remaining:,.0f} IRR "
        f"is still unpaid. Please arrange payment at your earliest convenience.\n\n"
        f"Thank you,\nVetrix ERP"
    )


def _record(db: Session, invoice_id: int, customer_id: int, channel: str, status: str, detail: str = "") -> PaymentReminderLog:
    entry = PaymentReminderLog(
        invoice_id=invoice_id, customer_id=customer_id, channel=channel, status=status, detail=(detail or "")[:1000],
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
    always passes force=True so staff intent is never silently dropped)."""
    if not force and _reminded_within_cooldown(db, invoice.id):
        return None
    if not _smtp_configured():
        return _record(db, invoice.id, invoice.customer_id, "email", "skipped_not_configured", "SMTP is not configured")
    if not customer or not customer.email:
        return _record(db, invoice.id, invoice.customer_id, "email", "skipped_no_email", "Customer has no email on file")
    try:
        _send_email(customer.email, f"Payment reminder - Invoice #{invoice.id}", _reminder_body(invoice, customer, remaining))
        return _record(db, invoice.id, invoice.customer_id, "email", "sent", f"Sent to {customer.email}")
    except Exception as error:
        return _record(db, invoice.id, invoice.customer_id, "email", "failed", str(error))


def _overdue_candidates(db: Session):
    import main  # deferred - see module docstring

    cutoff = datetime.utcnow() - timedelta(days=_overdue_days())
    policy = financial_policy_values(db.connection())
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.invoice_type == "sale",
            Invoice.payment_status != "paid",
            Invoice.created_at <= cutoff,
        )
        .all()
    )
    results = []
    for invoice in invoices:
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
def reminder_status():
    return {
        "smtp_configured": _smtp_configured(),
        "overdue_days_threshold": _overdue_days(),
        "cooldown_days": _cooldown_days(),
    }


@router.get("/overdue")
def list_overdue_invoices():
    db: Session = SessionLocal()
    try:
        customers = {c.id: c.name for c in db.query(Customer).all()}
        items = [
            {
                "invoice_id": invoice.id,
                "customer_id": invoice.customer_id,
                "customer_name": customers.get(invoice.customer_id, ""),
                "remaining_amount": remaining,
                "created_at": invoice.created_at,
            }
            for invoice, remaining in _overdue_candidates(db)
        ]
        return {"items": items, "overdue_days_threshold": _overdue_days()}
    finally:
        db.close()


@router.get("/log")
def list_reminder_log():
    db: Session = SessionLocal()
    try:
        rows = db.query(PaymentReminderLog).order_by(PaymentReminderLog.id.desc()).limit(200).all()
        customers = {c.id: c.name for c in db.query(Customer).all()}
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
def send_reminder_now(invoice_id: int):
    import main  # deferred - see module docstring

    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if invoice.invoice_type != "sale":
            raise HTTPException(status_code=400, detail="Only sale invoices can have payment reminders")

        policy = financial_policy_values(db.connection())
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
