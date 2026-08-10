"""Purchase order module.

Previously nonexistent: SmartInventory could compute a reorder suggestion
per product (suggested_reorder_qty) but nothing let that suggestion become
an actual order to a vendor. This module adds a minimal PO lifecycle
(draft -> sent -> received, or cancelled) and, on receive, increases
Product.stock the same way a manual "stock in" movement does - it also
writes a row to the existing stock_movements table so the change is
visible from the Warehouse page's movement log too.

Suppliers are not a separate entity: this app already models a supplier as
a Customer row with customer_type "supplier" or "both" (see Customers.jsx),
so purchase orders reference Customer.id via supplier_id, consistent with
that existing convention rather than introducing a parallel concept.
"""
import re
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.email_utils import send_email, smtp_configured
from app.message_templates import get_effective_template
from app.models.customer import Customer
from app.models.product import Product
from app.company_scope import current_company_id
from app.sms_utils import send_sms, sms_configured
from app.telegram_utils import send_telegram_message, telegram_configured
from app.whatsapp_utils import send_whatsapp_message, whatsapp_configured

router = APIRouter(prefix="/api/purchase-orders", tags=["Purchase Orders"])
MONEY_STEP = Decimal("0.01")

# email/sms/whatsapp/telegram are real, provider-backed sends (fail closed
# with an honest "not configured" status when the company hasn't set up
# that channel - see _dispatch_via_channel). manual/print_pdf/copy_text are
# staff-attested delivery: there is no real shareable PO link/portal in this
# app today (confirmed: app/supplier_portal.py only covers a supplier's own
# invoices/ledger, not receiving purchase orders), so these three simply
# record what the user says they did rather than faking a delivery channel
# that doesn't exist.
AUTOMATED_METHODS = {"email", "sms", "whatsapp", "telegram"}
STAFF_ATTESTED_METHODS = {"manual", "print_pdf", "copy_text"}
DISPATCH_METHODS = AUTOMATED_METHODS | STAFF_ATTESTED_METHODS


def _money(value):
    return float(Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP))


def _safe_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, nullable=True)
    supplier_name = Column(String, default="")
    status = Column(String, default="draft", nullable=False)  # draft / sent / received / cancelled
    note = Column(String, default="")
    total_amount = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    received_at = Column(DateTime, nullable=True)
    company_id = Column(Integer, nullable=True)


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, nullable=False)
    product_id = Column(Integer, nullable=False)
    product_name = Column(String, default="")
    quantity = Column(Float, default=0)
    unit_price = Column(Float, default=0)
    received_quantity = Column(Float, default=0)
    company_id = Column(Integer, nullable=True)


class PurchaseOrderDispatchLog(Base):
    """Mirrors app/payment_reminders.py's PaymentReminderLog convention:
    a per-feature log table rather than a generic audit_trail (which
    doesn't exist anywhere in this app) - every dispatch attempt is
    recorded regardless of outcome, so "sent" is never claimed without a
    real, visible record of how/when/by whom/with what result."""
    __tablename__ = "purchase_order_dispatch_log"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, nullable=False)
    method = Column(String, nullable=False)
    destination = Column(String, default="")
    status = Column(String, nullable=False)  # sending / sent / delivered / failed / cancelled
    detail = Column(String, default="")
    sent_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, nullable=True)


PurchaseOrder.__table__.create(bind=engine, checkfirst=True)
PurchaseOrderItem.__table__.create(bind=engine, checkfirst=True)
PurchaseOrderDispatchLog.__table__.create(bind=engine, checkfirst=True)


class POItemCreate(BaseModel):
    product_id: int
    quantity: float
    unit_price: float = 0


class POCreate(BaseModel):
    supplier_id: Optional[int] = None
    supplier_name: str = ""
    note: str = ""
    items: List[POItemCreate]


def _po_dict(db: Session, po: PurchaseOrder) -> dict:
    items = (
        db.query(PurchaseOrderItem)
        .filter(PurchaseOrderItem.purchase_order_id == po.id)
        .all()
    )
    return {
        "id": po.id,
        "supplier_id": po.supplier_id,
        "supplier_name": po.supplier_name,
        "status": po.status,
        "note": po.note,
        "total_amount": _money(po.total_amount),
        "created_at": po.created_at,
        "received_at": po.received_at,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "quantity": item.quantity,
                "unit_price": _money(item.unit_price),
                "line_total": _money(item.quantity * item.unit_price),
                "received_quantity": item.received_quantity,
            }
            for item in items
        ],
    }


@router.get("")
def list_purchase_orders(request: Request):
    db: Session = SessionLocal()
    try:
        orders = db.query(PurchaseOrder).filter(PurchaseOrder.company_id == current_company_id(request)).order_by(PurchaseOrder.id.desc()).all()
        return [_po_dict(db, po) for po in orders]
    finally:
        db.close()


@router.get("/{po_id}")
def get_purchase_order(po_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.company_id == current_company_id(request)).first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        return _po_dict(db, po)
    finally:
        db.close()


@router.post("")
def create_purchase_order(data: POCreate, request: Request):
    if not data.items:
        raise HTTPException(status_code=400, detail="Purchase order must have at least one item")
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        supplier_name = data.supplier_name.strip()
        if data.supplier_id and not supplier_name:
            supplier = db.query(Customer).filter(Customer.id == data.supplier_id, Customer.company_id == company_id).first()
            supplier_name = supplier.name if supplier else ""

        po = PurchaseOrder(
            supplier_id=data.supplier_id,
            supplier_name=supplier_name,
            status="draft",
            note=data.note,
            total_amount=0,
            company_id=company_id,
        )
        db.add(po)
        db.flush()

        total = 0.0
        for item in data.items:
            if item.quantity <= 0:
                raise HTTPException(status_code=400, detail="Item quantity must be greater than zero")
            product = db.query(Product).filter(Product.id == item.product_id, Product.company_id == company_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
            unit_price = item.unit_price if item.unit_price else _safe_float(getattr(product, "buy_price", 0))
            total += item.quantity * unit_price
            db.add(PurchaseOrderItem(
                purchase_order_id=po.id,
                product_id=product.id,
                product_name=product.name,
                quantity=item.quantity,
                unit_price=unit_price,
                received_quantity=0,
                company_id=company_id,
            ))

        po.total_amount = _money(total)
        db.commit()
        return {"status": "created", "id": po.id}
    finally:
        db.close()


class DispatchRequest(BaseModel):
    method: str
    destination: str = ""
    note: str = ""


def _dispatch_log_dict(row: PurchaseOrderDispatchLog) -> dict:
    return {
        "id": row.id, "purchase_order_id": row.purchase_order_id, "method": row.method,
        "destination": row.destination, "status": row.status, "detail": row.detail,
        "sent_by_user_id": row.sent_by_user_id, "created_at": row.created_at,
    }


def _record_dispatch(db: Session, po_id: int, method: str, destination: str, status: str, detail: str, user_id, company_id) -> PurchaseOrderDispatchLog:
    entry = PurchaseOrderDispatchLog(
        purchase_order_id=po_id, method=method, destination=(destination or "")[:255],
        status=status, detail=(detail or "")[:1000], sent_by_user_id=user_id, company_id=company_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def _dispatch_language(supplier: Optional[Customer]) -> str:
    # No per-supplier language preference exists on Customer; the app's own
    # UI language convention is Persian-first (see payment_reminders.py's
    # _language_for_policy default), used here as the same honest default
    # rather than guessing a supplier's language from unrelated fields.
    return "fa"


def _dispatch_message(db: Session, po: PurchaseOrder, supplier_name: str, channel: str, company_id) -> dict:
    language = _dispatch_language(None)
    template = get_effective_template(db.connection(), "purchase_order_dispatch", channel, language, company_id)
    fmt = {"id": po.id, "name": supplier_name or "", "amount": f"{po.total_amount:,.0f}", "brand": "Vetrix ERP"}
    return {
        "subject": (template.get("subject") or "").format(**fmt),
        "body": (template.get("body") or "").format(**fmt),
    }


def _whatsapp_number(raw: str) -> str:
    return re.sub(r"\D", "", raw or "")


@router.post("/{po_id}/dispatch")
def dispatch_purchase_order(po_id: int, data: DispatchRequest, request: Request):
    if data.method not in DISPATCH_METHODS:
        raise HTTPException(status_code=400, detail=f"method must be one of: {', '.join(sorted(DISPATCH_METHODS))}")

    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        user_id = None

    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.company_id == company_id).first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if po.status in ("received", "cancelled"):
            raise HTTPException(status_code=400, detail=f"A {po.status} purchase order cannot be dispatched")

        supplier = db.query(Customer).filter(Customer.id == po.supplier_id, Customer.company_id == company_id).first() if po.supplier_id else None
        supplier_name = po.supplier_name or (supplier.name if supplier else "")

        if data.method in STAFF_ATTESTED_METHODS:
            destination = data.destination.strip() or (supplier_name or "—")
            entry = _record_dispatch(
                db, po_id, data.method, destination, "sent",
                data.note.strip() or f"Recorded manually by user {user_id}", user_id, company_id,
            )
            if po.status == "draft":
                po.status = "sent"
                db.commit()
            return {"status": entry.status, "id": entry.id, "method": entry.method}

        # Automated channels: a real send is attempted; the PO only ever
        # flips to "sent" if the provider actually accepted the message -
        # matching payment_reminders.py's send_reminder_for_invoice pattern.
        if data.method == "email":
            destination = data.destination.strip() or (supplier.email if supplier else "")
            if not smtp_configured(company_id):
                entry = _record_dispatch(db, po_id, "email", destination, "failed", "Email is not configured", user_id, company_id)
                return {"status": entry.status, "id": entry.id, "method": entry.method, "detail": entry.detail}
            if not destination:
                entry = _record_dispatch(db, po_id, "email", destination, "failed", "Supplier has no email on file", user_id, company_id)
                return {"status": entry.status, "id": entry.id, "method": entry.method, "detail": entry.detail}
            message = _dispatch_message(db, po, supplier_name, "email", company_id)
            try:
                send_email(company_id, destination, message["subject"], message["body"])
                entry = _record_dispatch(db, po_id, "email", destination, "sent", f"Sent to {destination}", user_id, company_id)
            except Exception as error:
                entry = _record_dispatch(db, po_id, "email", destination, "failed", str(error), user_id, company_id)
        elif data.method == "sms":
            destination = data.destination.strip() or (getattr(supplier, "mobile", "") or getattr(supplier, "phone", "") if supplier else "")
            if not sms_configured(company_id):
                entry = _record_dispatch(db, po_id, "sms", destination, "failed", "SMS is not configured", user_id, company_id)
            elif not destination:
                entry = _record_dispatch(db, po_id, "sms", destination, "failed", "Supplier has no phone number on file", user_id, company_id)
            else:
                message = _dispatch_message(db, po, supplier_name, "message", company_id)
                try:
                    send_sms(company_id, destination, message["body"])
                    entry = _record_dispatch(db, po_id, "sms", destination, "sent", f"Sent to {destination}", user_id, company_id)
                except Exception as error:
                    entry = _record_dispatch(db, po_id, "sms", destination, "failed", str(error), user_id, company_id)
        elif data.method == "whatsapp":
            destination = _whatsapp_number(data.destination) or _whatsapp_number(getattr(supplier, "mobile", "") or getattr(supplier, "phone", "") if supplier else "")
            if not whatsapp_configured(company_id):
                entry = _record_dispatch(db, po_id, "whatsapp", destination, "failed", "WhatsApp is not configured", user_id, company_id)
            elif not destination:
                entry = _record_dispatch(db, po_id, "whatsapp", destination, "failed", "Supplier has no phone number on file", user_id, company_id)
            else:
                message = _dispatch_message(db, po, supplier_name, "message", company_id)
                try:
                    send_whatsapp_message(company_id, destination, message["body"])
                    entry = _record_dispatch(db, po_id, "whatsapp", destination, "sent", f"Sent to {destination}", user_id, company_id)
                except Exception as error:
                    entry = _record_dispatch(db, po_id, "whatsapp", destination, "failed", str(error), user_id, company_id)
        else:  # telegram
            destination = data.destination.strip() or (getattr(supplier, "telegram_chat_id", "") if supplier else "")
            if not telegram_configured(company_id):
                entry = _record_dispatch(db, po_id, "telegram", destination, "failed", "Telegram is not configured", user_id, company_id)
            elif not destination:
                entry = _record_dispatch(db, po_id, "telegram", destination, "failed", "Supplier has no Telegram chat on file (they must message the bot first)", user_id, company_id)
            else:
                message = _dispatch_message(db, po, supplier_name, "message", company_id)
                try:
                    send_telegram_message(company_id, destination, message["body"])
                    entry = _record_dispatch(db, po_id, "telegram", destination, "sent", f"Sent to chat {destination}", user_id, company_id)
                except Exception as error:
                    entry = _record_dispatch(db, po_id, "telegram", destination, "failed", str(error), user_id, company_id)

        if entry.status == "sent" and po.status == "draft":
            po.status = "sent"
            db.commit()
        return {"status": entry.status, "id": entry.id, "method": entry.method, "detail": entry.detail}
    finally:
        db.close()


@router.get("/{po_id}/dispatch-log")
def list_dispatch_log(po_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.company_id == company_id).first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        rows = (
            db.query(PurchaseOrderDispatchLog)
            .filter(PurchaseOrderDispatchLog.purchase_order_id == po_id, PurchaseOrderDispatchLog.company_id == company_id)
            .order_by(PurchaseOrderDispatchLog.id.desc())
            .all()
        )
        return {"items": [_dispatch_log_dict(row) for row in rows]}
    finally:
        db.close()


@router.post("/{po_id}/cancel")
def cancel_purchase_order(po_id: int, request: Request):
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT status FROM purchase_orders WHERE id=:id AND company_id=:company_id"),
            {"id": po_id, "company_id": current_company_id(request)},
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if row[0] == "received":
            raise HTTPException(status_code=400, detail="A received purchase order cannot be cancelled")
        conn.execute(text("UPDATE purchase_orders SET status='cancelled' WHERE id=:id"), {"id": po_id})
    return {"status": "cancelled", "id": po_id}


@router.post("/{po_id}/receive")
def receive_purchase_order(po_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.company_id == company_id).first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if po.status == "received":
            raise HTTPException(status_code=400, detail="Purchase order already received")
        if po.status == "cancelled":
            raise HTTPException(status_code=400, detail="A cancelled purchase order cannot be received")

        items = (
            db.query(PurchaseOrderItem)
            .filter(PurchaseOrderItem.purchase_order_id == po_id)
            .all()
        )
        now = datetime.utcnow()
        for item in items:
            product = db.query(Product).filter(Product.id == item.product_id, Product.company_id == company_id).first()
            if not product:
                continue
            product.stock = _safe_float(getattr(product, "stock", 0)) + item.quantity
            item.received_quantity = item.quantity
            db.execute(text("""
                INSERT INTO stock_movements
                (warehouse, warehouse_id, product_id, product_name, quantity,
                 movement_type, movement_date, note, created_at, company_id)
                VALUES (:warehouse, NULL, :product_id, :product_name, :quantity,
                        'in', :movement_date, :note, :created_at, :company_id)
            """), {
                "warehouse": "Main",
                "product_id": product.id,
                "product_name": product.name,
                "quantity": item.quantity,
                "movement_date": now.date().isoformat(),
                "note": f"Purchase order #{po_id}",
                "created_at": now,
                "company_id": company_id,
            })

        po.status = "received"
        po.received_at = now
        db.commit()
        return {"status": "received", "id": po_id}
    finally:
        db.close()
