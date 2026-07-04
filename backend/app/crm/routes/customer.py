from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import SessionLocal
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.accounting_entry import AccountingEntry

try:
    from app.crm.models.customer import CustomerNote, CustomerTransaction
except Exception:
    from app.crm.models import CustomerNote, CustomerTransaction


router = APIRouter(tags=["CRM"])


class CustomerNoteCreate(BaseModel):
    text: str
    note_type: str = "note"


class CustomerStatusUpdate(BaseModel):
    status: str = "active"


def _safe_float(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _customer_balance(db: Session, customer_id: int) -> float:
    entries = (
        db.query(AccountingEntry)
        .filter(AccountingEntry.customer_id == customer_id)
        .order_by(AccountingEntry.created_at.asc(), AccountingEntry.id.asc())
        .all()
    )
    return sum(_safe_float(e.debit) - _safe_float(e.credit) for e in entries)


def _customer_dict(db: Session, customer: Customer):
    balance = _customer_balance(db, customer.id)
    invoices = db.query(Invoice).filter(Invoice.customer_id == customer.id).all()
    total_sales = sum(_safe_float(i.total_amount) for i in invoices if i.invoice_type == "sale")
    total_purchases = sum(_safe_float(i.total_amount) for i in invoices if i.invoice_type == "buy")
    last_invoice = sorted(invoices, key=lambda x: x.created_at or datetime.min, reverse=True)[0] if invoices else None

    score = 50
    if total_sales > 0:
        score += 15
    if len(invoices) >= 3:
        score += 10
    if balance <= 0:
        score += 10
    if balance > 0:
        score -= 10
    score = max(0, min(100, score))

    return {
        "id": customer.id,
        "name": getattr(customer, "name", "") or "",
        "phone": getattr(customer, "phone", "") or "",
        "email": getattr(customer, "email", "") or "",
        "address": getattr(customer, "address", "") or "",
        "city": getattr(customer, "city", "") or "",
        "national_id": getattr(customer, "national_id", "") or "",
        "economic_code": getattr(customer, "economic_code", "") or "",
        "contact_person": getattr(customer, "contact_person", "") or "",
        "customer_type": getattr(customer, "customer_type", "customer") or "customer",
        "opening_balance": _safe_float(getattr(customer, "opening_balance", 0)),
        "credit_limit": _safe_float(getattr(customer, "credit_limit", 0)),
        "notes": getattr(customer, "notes", "") or "",
        "created_at": getattr(customer, "created_at", None),
        "balance": balance,
        "debit": balance if balance > 0 else 0,
        "credit": abs(balance) if balance < 0 else 0,
        "invoice_count": len(invoices),
        "total_sales": total_sales,
        "total_purchases": total_purchases,
        "last_invoice_date": getattr(last_invoice, "created_at", None) if last_invoice else None,
        "crm_score": score,
        "crm_status": "debtor" if balance > 0 else ("vip" if score >= 75 else "active"),
    }


@router.get("/customers")
def crm_customers():
    db: Session = SessionLocal()
    try:
        customers = db.query(Customer).order_by(Customer.id.desc()).all()
        result = [_customer_dict(db, c) for c in customers]
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@router.get("/customers/{customer_id}")
def crm_customer_profile(customer_id: int):
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            db.close()
            return {"status": "error", "message": "Customer not found"}

        notes = (
            db.query(CustomerNote)
            .filter(CustomerNote.customer_id == customer_id)
            .order_by(CustomerNote.created_at.desc(), CustomerNote.id.desc())
            .all()
        )

        entries = (
            db.query(AccountingEntry)
            .filter(AccountingEntry.customer_id == customer_id)
            .order_by(AccountingEntry.created_at.desc(), AccountingEntry.id.desc())
            .all()
        )

        invoices = (
            db.query(Invoice)
            .filter(Invoice.customer_id == customer_id)
            .order_by(Invoice.created_at.desc(), Invoice.id.desc())
            .all()
        )

        profile = _customer_dict(db, customer)

        result = {
            "status": "success",
            "customer": profile,
            "notes": [
                {
                    "id": n.id,
                    "customer_id": n.customer_id,
                    "text": n.text,
                    "note_type": getattr(n, "note_type", "note") or "note",
                    "created_at": n.created_at,
                }
                for n in notes
            ],
            "ledger": [
                {
                    "id": e.id,
                    "customer_id": e.customer_id,
                    "source_type": e.source_type,
                    "source_id": e.source_id,
                    "description": e.description,
                    "debit": _safe_float(e.debit),
                    "credit": _safe_float(e.credit),
                    "balance_after": _safe_float(getattr(e, "balance_after", 0)),
                    "created_at": e.created_at,
                }
                for e in entries
            ],
            "invoices": [
                {
                    "id": i.id,
                    "invoice_type": i.invoice_type,
                    "total_amount": _safe_float(i.total_amount),
                    "status": getattr(i, "status", ""),
                    "payment_status": getattr(i, "payment_status", ""),
                    "created_at": i.created_at,
                }
                for i in invoices
            ],
        }
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@router.post("/customers/{customer_id}/notes")
def add_customer_note(customer_id: int, data: CustomerNoteCreate):
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            db.close()
            return {"status": "error", "message": "Customer not found"}

        note = CustomerNote(
            customer_id=customer_id,
            text=data.text,
            note_type=data.note_type or "note",
            created_at=datetime.utcnow(),
        )
        db.add(note)
        db.commit()
        db.refresh(note)

        result = {
            "status": "created",
            "note": {
                "id": note.id,
                "customer_id": note.customer_id,
                "text": note.text,
                "note_type": getattr(note, "note_type", "note") or "note",
                "created_at": note.created_at,
            },
        }
        db.close()
        return result
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@router.delete("/notes/{note_id}")
def delete_customer_note(note_id: int):
    db: Session = SessionLocal()
    try:
        note = db.query(CustomerNote).filter(CustomerNote.id == note_id).first()
        if not note:
            db.close()
            return {"status": "error", "message": "Note not found"}

        db.delete(note)
        db.commit()
        db.close()
        return {"status": "deleted", "id": note_id}
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@router.patch("/customers/{customer_id}/status")
def update_customer_status(customer_id: int, data: CustomerStatusUpdate):
    # مدل اصلی Customer فعلاً ستون status ندارد؛ برای جلوگیری از خطای دیتابیس،
    # وضعیت CRM به صورت تحلیلی در خروجی محاسبه می‌شود.
    # این endpoint برای سازگاری frontend نگه داشته شده است.
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            db.close()
            return {"status": "error", "message": "Customer not found"}
        result = {"status": "success", "customer_id": customer_id, "crm_status": data.status}
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}
