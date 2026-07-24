"""Recurring/subscription invoices.

Generation reuses main.py's create_invoice() function directly (via a
deferred, function-local `import main`) rather than reimplementing any of
its totals/stock/ledger logic - that logic is the delicate core of the
accounting engine and is deliberately left untouched. The import is safe
here because it only runs at request time, long after main.py has finished
its own module-level import of this file's router.
"""
import json
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, text
from sqlalchemy.orm import Session

from app.accounting.integrity import ALLOWED_INVOICE_TYPES
from app.database import Base, SessionLocal, engine
from app.models.customer import Customer

router = APIRouter(prefix="/api/recurring-invoices", tags=["Recurring Invoices"])

FREQUENCIES = {"weekly", "monthly", "custom"}


class RecurringInvoiceTemplate(Base):
    __tablename__ = "recurring_invoice_templates"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, nullable=False)
    invoice_type = Column(String, nullable=False, default="sale")
    items_json = Column(Text, nullable=False)
    discount_percent = Column(Float, default=0)
    tax_percent = Column(Float, default=0)
    shipping_cost = Column(Float, default=0)
    invoice_note = Column(String, default="")
    frequency = Column(String, nullable=False, default="monthly")
    custom_interval_days = Column(Integer, nullable=True)
    next_run_date = Column(String, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    last_generated_invoice_id = Column(Integer, nullable=True)
    last_generated_at = Column(DateTime, nullable=True)
    last_generation_error = Column(String, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


RecurringInvoiceTemplate.__table__.create(bind=engine, checkfirst=True)


class RecurringItem(BaseModel):
    product_id: int
    quantity: float
    unit_price: float


class RecurringInvoiceCreate(BaseModel):
    customer_id: int
    invoice_type: str = "sale"
    items: List[RecurringItem]
    discount_percent: float = 0
    tax_percent: float = 0
    shipping_cost: float = 0
    invoice_note: str = ""
    frequency: str = "monthly"
    custom_interval_days: Optional[int] = None
    start_date: Optional[str] = None


def _advance_date(current: date, frequency: str, custom_interval_days) -> date:
    if frequency == "weekly":
        return current + timedelta(days=7)
    if frequency == "custom":
        return current + timedelta(days=max(1, int(custom_interval_days or 30)))
    # monthly - preserve day-of-month, clamped to the target month's length
    # (e.g. the 31st of a template started in January lands on Feb 28th).
    month = current.month + 1
    year = current.year + (1 if month > 12 else 0)
    month = 1 if month > 12 else month
    day_count = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(current.day, day_count))


def _template_dict(template: RecurringInvoiceTemplate, customer_name: str) -> dict:
    return {
        "id": template.id,
        "customer_id": template.customer_id,
        "customer_name": customer_name,
        "invoice_type": template.invoice_type,
        "items": json.loads(template.items_json or "[]"),
        "discount_percent": template.discount_percent,
        "tax_percent": template.tax_percent,
        "shipping_cost": template.shipping_cost,
        "invoice_note": template.invoice_note,
        "frequency": template.frequency,
        "custom_interval_days": template.custom_interval_days,
        "next_run_date": template.next_run_date,
        "active": template.active,
        "last_generated_invoice_id": template.last_generated_invoice_id,
        "last_generated_at": template.last_generated_at,
        "last_generation_error": template.last_generation_error,
        "created_at": template.created_at,
    }


@router.post("")
def create_template(data: RecurringInvoiceCreate, request: Request):
    if data.invoice_type not in ALLOWED_INVOICE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid invoice_type")
    if data.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"frequency must be one of: {', '.join(sorted(FREQUENCIES))}")
    if data.frequency == "custom" and not data.custom_interval_days:
        raise HTTPException(status_code=400, detail="custom_interval_days is required for a custom frequency")
    if not data.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

        start = data.start_date or date.today().isoformat()
        try:
            date.fromisoformat(start)
        except ValueError:
            raise HTTPException(status_code=400, detail="start_date must be an ISO date (YYYY-MM-DD)")

        actor = getattr(request.state, "auth", {}).get("sub")
        template = RecurringInvoiceTemplate(
            customer_id=data.customer_id,
            invoice_type=data.invoice_type,
            items_json=json.dumps([item.dict() for item in data.items]),
            discount_percent=data.discount_percent,
            tax_percent=data.tax_percent,
            shipping_cost=data.shipping_cost,
            invoice_note=data.invoice_note,
            frequency=data.frequency,
            custom_interval_days=data.custom_interval_days,
            next_run_date=start,
            active=True,
            created_by=int(actor) if actor is not None else None,
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return {"status": "created", "id": template.id, "next_run_date": template.next_run_date}
    finally:
        db.close()


@router.get("")
def list_templates():
    db: Session = SessionLocal()
    try:
        templates = db.query(RecurringInvoiceTemplate).order_by(RecurringInvoiceTemplate.id.desc()).all()
        customers = {c.id: c.name for c in db.query(Customer).all()}
        return {
            "items": [
                _template_dict(template, customers.get(template.customer_id, ""))
                for template in templates
            ]
        }
    finally:
        db.close()


@router.post("/{template_id}/pause")
def pause_template(template_id: int):
    db: Session = SessionLocal()
    try:
        template = db.query(RecurringInvoiceTemplate).filter(RecurringInvoiceTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        template.active = False
        db.commit()
        return {"status": "paused"}
    finally:
        db.close()


@router.post("/{template_id}/resume")
def resume_template(template_id: int):
    db: Session = SessionLocal()
    try:
        template = db.query(RecurringInvoiceTemplate).filter(RecurringInvoiceTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        # A long-paused template shouldn't dump a backlog of missed invoices
        # the moment it's resumed - catch up to exactly one due date: today.
        if template.next_run_date < date.today().isoformat():
            template.next_run_date = date.today().isoformat()
        template.active = True
        template.last_generation_error = None
        db.commit()
        return {"status": "resumed", "next_run_date": template.next_run_date}
    finally:
        db.close()


@router.delete("/{template_id}")
def delete_template(template_id: int):
    db: Session = SessionLocal()
    try:
        template = db.query(RecurringInvoiceTemplate).filter(RecurringInvoiceTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        db.delete(template)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


def _generate_from_template(db: Session, template: RecurringInvoiceTemplate):
    import main  # deferred - see module docstring

    try:
        items = [main.InvoiceItemCreate(**item) for item in json.loads(template.items_json or "[]")]
        payload = main.InvoiceCreate(
            invoice_type=template.invoice_type,
            customer_id=template.customer_id,
            items=items,
            discount_percent=template.discount_percent,
            tax_percent=template.tax_percent,
            shipping_cost=template.shipping_cost,
            payment_status="unpaid",
            invoice_note=template.invoice_note,
        )
        result = main.create_invoice(payload)
        if result.get("status") != "created":
            template.last_generation_error = result.get("message", "Unknown error")
            db.commit()
            return

        template.last_generated_invoice_id = result["invoice_id"]
        template.last_generated_at = datetime.utcnow()
        template.last_generation_error = None
        template.next_run_date = _advance_date(
            date.fromisoformat(template.next_run_date), template.frequency, template.custom_interval_days
        ).isoformat()
        db.commit()
    except Exception as error:
        db.rollback()
        template.last_generation_error = str(error)
        db.commit()


def maybe_generate_due_recurring_invoices():
    try:
        with engine.connect() as conn:
            table = conn.execute(text("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='recurring_invoice_templates'
            """)).fetchone()
            if not table:
                return
        today_iso = date.today().isoformat()
        db: Session = SessionLocal()
        try:
            due = (
                db.query(RecurringInvoiceTemplate)
                .filter(
                    RecurringInvoiceTemplate.active.is_(True),
                    RecurringInvoiceTemplate.next_run_date <= today_iso,
                )
                .all()
            )
            for template in due:
                _generate_from_template(db, template)
        finally:
            db.close()
    except Exception:
        # Background generation must never turn a completed business
        # operation into a client-visible failure.
        pass
