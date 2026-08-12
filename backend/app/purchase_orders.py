"""Purchase order module.

Previously nonexistent: SmartInventory could compute a reorder suggestion
per product (suggested_reorder_qty) but nothing let that suggestion become
an actual order to a vendor. This module adds a minimal PO lifecycle
(draft -> sent -> partially_received/received, or cancelled).

Suppliers are not a separate entity: this app already models a supplier as
a Customer row with customer_type "supplier" or "both" (see Customers.jsx),
so purchase orders reference Customer.id via supplier_id, consistent with
that existing convention rather than introducing a parallel concept.

Receiving (Task 07) reuses the REAL Product x Warehouse inventory model
from app/warehouses.py (WarehouseStock, apply_warehouse_delta) rather than
adding a product.warehouse_id shortcut - a receipt increases Product.stock
(the company-wide aggregate, unchanged) and, when a specific non-default
warehouse is chosen, also increments that warehouse's own bucket the same
way invoice posting/manual stock movements already do. Receiving is
append-only (purchase_order_receipts/purchase_order_receipt_items) and
partial: a PO item's received_quantity only ever increases, tracked
against its ordered quantity, and a receipt is rejected outright if it
would exceed what's still remaining (no silent over-receipt).

Purchase orders have NO accounting/payable effect anywhere in this
codebase today (confirmed: no accounting_entries/voucher posting is
triggered by create/dispatch/receive) - this module intentionally does
not invent one. Accounts payable in this app is driven by "buy"-type
invoices (a separate, manually-created record), not by POs; a PO's
purpose here is inventory intent + supplier communication + stock
receipt, not a payable trigger.
"""
import hashlib
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
from app.idempotency import run_idempotent
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
    status = Column(String, default="draft", nullable=False)  # draft / sent / partially_received / received / cancelled
    note = Column(String, default="")
    total_amount = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    received_at = Column(DateTime, nullable=True)
    company_id = Column(Integer, nullable=True)
    default_warehouse_id = Column(Integer, nullable=True)


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


class PurchaseOrderReceipt(Base):
    """One row per receiving submission (append-only) - never overwritten,
    never deleted, so "who received what, when, into which warehouse" stays
    a real audit trail rather than a single overwritten snapshot."""
    __tablename__ = "purchase_order_receipts"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, nullable=False)
    warehouse_id = Column(Integer, nullable=True)
    received_by = Column(Integer, nullable=True)
    received_at = Column(DateTime, default=datetime.utcnow)
    note = Column(String, default="")
    company_id = Column(Integer, nullable=True)


class PurchaseOrderReceiptItem(Base):
    __tablename__ = "purchase_order_receipt_items"

    id = Column(Integer, primary_key=True, index=True)
    receipt_id = Column(Integer, nullable=False)
    po_item_id = Column(Integer, nullable=False)
    product_id = Column(Integer, nullable=False)
    quantity = Column(Float, default=0)
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
PurchaseOrderReceipt.__table__.create(bind=engine, checkfirst=True)
PurchaseOrderReceiptItem.__table__.create(bind=engine, checkfirst=True)


def _ensure_new_columns(conn):
    """purchase_orders was created via Table.create(), which only handles
    brand-new tables - an already-existing table (like this app's dev
    database, or any company created before Task 07) needs
    default_warehouse_id added the same idempotent way warehouses.py's own
    _ensure_new_columns() does."""
    columns = {row[1] for row in conn.execute(text("PRAGMA table_info(purchase_orders)")).fetchall()}
    if "default_warehouse_id" not in columns:
        conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN default_warehouse_id INTEGER"))


with engine.begin() as _conn:
    _ensure_new_columns(_conn)


class POItemCreate(BaseModel):
    product_id: int
    quantity: float
    unit_price: float = 0


class POCreate(BaseModel):
    supplier_id: Optional[int] = None
    supplier_name: str = ""
    note: str = ""
    items: List[POItemCreate]
    default_warehouse_id: Optional[int] = None


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
        "default_warehouse_id": po.default_warehouse_id,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "quantity": item.quantity,
                "unit_price": _money(item.unit_price),
                "line_total": _money(item.quantity * item.unit_price),
                "received_quantity": item.received_quantity,
                "remaining_quantity": max(_safe_float(item.quantity) - _safe_float(item.received_quantity), 0),
            }
            for item in items
        ],
    }


def _validate_warehouse_for_company(db: Session, warehouse_id: Optional[int], company_id: int):
    """Server-side warehouse authorization, reused by PO creation (default
    destination) and receiving (per-receipt destination) - a client-supplied
    warehouse_id is never trusted, it must belong to this company and be
    active. This app's RBAC has no per-user branch restriction to enforce
    beyond company scope (confirmed absent - Task 06's audit) - documenting
    that rather than inventing a scope that doesn't exist elsewhere."""
    if warehouse_id is None:
        return
    from app.warehouses import Warehouse
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id, Warehouse.company_id == company_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Destination warehouse not found")
    if not warehouse.active:
        raise HTTPException(status_code=400, detail="Destination warehouse is not active")


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
        _validate_warehouse_for_company(db, data.default_warehouse_id, company_id)
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
            default_warehouse_id=data.default_warehouse_id,
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
        if row[0] in ("received", "partially_received"):
            raise HTTPException(status_code=400, detail="A purchase order with recorded receipts cannot be cancelled")
        conn.execute(text("UPDATE purchase_orders SET status='cancelled' WHERE id=:id"), {"id": po_id})
    return {"status": "cancelled", "id": po_id}


class ReceiveItemRequest(BaseModel):
    po_item_id: int
    quantity: float


class ReceiveRequest(BaseModel):
    warehouse_id: Optional[int] = None
    items: List[ReceiveItemRequest]
    note: str = ""


@router.post("/{po_id}/receive")
def receive_purchase_order(po_id: int, data: ReceiveRequest, request: Request):
    """Idempotency-Key protected (same run_idempotent() helper /invoices and
    /transactions use) - a lost-response retry must not increment inventory
    twice. The actual quantity/status update below is a single atomic
    UPDATE...WHERE per item (see the comment at that line) rather than a
    read-then-write, closing the race where two concurrent receipts both
    read the same stale "remaining" value."""
    key = request.headers.get("Idempotency-Key")
    request_hash = hashlib.sha256(data.json().encode("utf-8")).hexdigest()
    company_id = current_company_id(request)
    return run_idempotent(
        key, f"POST /api/purchase-orders/{po_id}/receive", company_id, request_hash,
        lambda: _receive_purchase_order_impl(po_id, data, request, company_id),
    )


def _receive_purchase_order_impl(po_id: int, data: ReceiveRequest, request: Request, company_id: int):
    if not data.items:
        raise HTTPException(status_code=400, detail="At least one item is required to record a receipt")
    for line in data.items:
        if line.quantity <= 0:
            raise HTTPException(status_code=400, detail="Received quantity must be greater than zero")

    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        user_id = None

    now = datetime.utcnow()
    with engine.begin() as conn:
        po = conn.execute(
            text("SELECT * FROM purchase_orders WHERE id=:id AND company_id=:company_id"),
            {"id": po_id, "company_id": company_id},
        ).mappings().first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if po["status"] == "cancelled":
            raise HTTPException(status_code=400, detail="A cancelled purchase order cannot be received")
        if po["status"] == "received":
            raise HTTPException(status_code=400, detail="Purchase order is already fully received")
        if po["status"] == "draft":
            raise HTTPException(status_code=400, detail="Purchase order must be dispatched before it can be received")

        warehouse_id = data.warehouse_id if data.warehouse_id is not None else po["default_warehouse_id"]
        warehouse_name = "Main"
        warehouse_is_default = True
        if warehouse_id is not None:
            warehouse = conn.execute(
                text("SELECT id, name, active, is_default FROM warehouses WHERE id=:id AND company_id=:company_id"),
                {"id": warehouse_id, "company_id": company_id},
            ).mappings().first()
            if not warehouse:
                raise HTTPException(status_code=404, detail="Destination warehouse not found")
            if not warehouse["active"]:
                raise HTTPException(status_code=400, detail="Destination warehouse is not active")
            warehouse_name = warehouse["name"]
            warehouse_is_default = bool(warehouse["is_default"])

        receipt_lines = []
        for line in data.items:
            item_row = conn.execute(
                text("SELECT * FROM purchase_order_items WHERE id=:id AND purchase_order_id=:po_id AND company_id=:company_id"),
                {"id": line.po_item_id, "po_id": po_id, "company_id": company_id},
            ).mappings().first()
            if not item_row:
                raise HTTPException(status_code=404, detail=f"Purchase order item {line.po_item_id} not found")
            # Atomic claim: the WHERE clause's own remaining-quantity check
            # is evaluated and applied in the same statement, so a second,
            # concurrent request for the same item can never both pass a
            # Python-side check against a stale read - whichever request's
            # UPDATE commits first shrinks the remaining amount the other
            # request's WHERE clause will then see, and SQLite serializes
            # the two UPDATEs against each other regardless.
            claimed = conn.execute(text("""
                UPDATE purchase_order_items SET received_quantity = received_quantity + :qty
                WHERE id=:id AND company_id=:company_id AND (quantity - received_quantity) >= :qty
            """), {"id": line.po_item_id, "company_id": company_id, "qty": line.quantity})
            if claimed.rowcount == 0:
                # Re-read rather than reuse item_row's pre-claim snapshot -
                # under the exact race this guard exists for, a concurrent
                # request may have already consumed some/all of what was
                # remaining when item_row was read moments ago, and showing
                # that stale number here would misleadingly justify the
                # rejection with a figure that (by itself) looks sufficient.
                current = conn.execute(
                    text("SELECT quantity, received_quantity FROM purchase_order_items WHERE id=:id"),
                    {"id": line.po_item_id},
                ).mappings().first()
                remaining = _safe_float(current["quantity"]) - _safe_float(current["received_quantity"])
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot receive {line.quantity} of '{item_row['product_name']}' - only {remaining} remaining",
                )
            receipt_lines.append((item_row, line.quantity))

        receipt_result = conn.execute(text("""
            INSERT INTO purchase_order_receipts (purchase_order_id, warehouse_id, received_by, received_at, note, company_id)
            VALUES (:po_id, :warehouse_id, :received_by, :received_at, :note, :company_id)
        """), {
            "po_id": po_id, "warehouse_id": warehouse_id, "received_by": user_id,
            "received_at": now, "note": data.note.strip(), "company_id": company_id,
        })
        receipt_id = receipt_result.lastrowid

        for item_row, quantity in receipt_lines:
            product = conn.execute(
                text("SELECT id, name, stock FROM products WHERE id=:id AND company_id=:company_id"),
                {"id": item_row["product_id"], "company_id": company_id},
            ).mappings().first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item_row['product_id']} not found")

            conn.execute(
                text("UPDATE products SET stock = stock + :qty WHERE id=:id"),
                {"qty": quantity, "id": product["id"]},
            )

            conn.execute(text("""
                INSERT INTO purchase_order_receipt_items (receipt_id, po_item_id, product_id, quantity, company_id)
                VALUES (:receipt_id, :po_item_id, :product_id, :quantity, :company_id)
            """), {
                "receipt_id": receipt_id, "po_item_id": item_row["id"], "product_id": product["id"],
                "quantity": quantity, "company_id": company_id,
            })

            # Mirrors app/warehouses.py's apply_warehouse_delta() (a no-op
            # for the default warehouse, whose quantity is always derived -
            # see that module's docstring) - reimplemented against this raw
            # connection directly rather than mixing an ORM Session into
            # this same transaction, since WarehouseStock's upsert here is
            # simple enough not to need it.
            if warehouse_id is not None and not warehouse_is_default:
                existing_stock_row = conn.execute(
                    text("SELECT id FROM warehouse_stock WHERE warehouse_id=:wid AND product_id=:pid"),
                    {"wid": warehouse_id, "pid": product["id"]},
                ).first()
                if existing_stock_row:
                    conn.execute(
                        text("UPDATE warehouse_stock SET quantity = quantity + :qty WHERE id=:id"),
                        {"qty": quantity, "id": existing_stock_row[0]},
                    )
                else:
                    conn.execute(text("""
                        INSERT INTO warehouse_stock (warehouse_id, product_id, quantity, company_id)
                        VALUES (:wid, :pid, :qty, :company_id)
                    """), {"wid": warehouse_id, "pid": product["id"], "qty": quantity, "company_id": company_id})

            conn.execute(text("""
                INSERT INTO stock_movements
                (warehouse, warehouse_id, product_id, product_name, quantity,
                 movement_type, movement_date, note, created_at, company_id)
                VALUES (:warehouse, :warehouse_id, :product_id, :product_name, :quantity,
                        'in', :movement_date, :note, :created_at, :company_id)
            """), {
                "warehouse": warehouse_name,
                "warehouse_id": warehouse_id,
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": quantity,
                "movement_date": now.date().isoformat(),
                "note": f"Purchase order #{po_id} receipt #{receipt_id}" + (f" - {data.note.strip()}" if data.note.strip() else ""),
                "created_at": now,
                "company_id": company_id,
            })

        all_items = conn.execute(
            text("SELECT quantity, received_quantity FROM purchase_order_items WHERE purchase_order_id=:po_id AND company_id=:company_id"),
            {"po_id": po_id, "company_id": company_id},
        ).mappings().all()
        fully_received = all(_safe_float(i["received_quantity"]) >= _safe_float(i["quantity"]) - 1e-9 for i in all_items)
        any_received = any(_safe_float(i["received_quantity"]) > 0 for i in all_items)
        new_status = "received" if fully_received else "partially_received" if any_received else po["status"]

        conn.execute(text("""
            UPDATE purchase_orders SET status=:status, received_at=:received_at WHERE id=:id
        """), {
            "status": new_status,
            "received_at": now if fully_received else po["received_at"],
            "id": po_id,
        })

    return {"status": new_status, "id": po_id, "receipt_id": receipt_id}


@router.get("/{po_id}/receipts")
def list_purchase_order_receipts(po_id: int, request: Request):
    """Append-only receiving history - who received what, when, into which
    warehouse, per PO (Task 07, Section 2.4)."""
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.company_id == company_id).first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")

        rows = db.execute(text("""
            SELECT r.id, r.warehouse_id, w.name AS warehouse_name, r.received_by, u.full_name AS received_by_name,
                   r.received_at, r.note
            FROM purchase_order_receipts r
            LEFT JOIN warehouses w ON w.id = r.warehouse_id AND w.company_id = r.company_id
            LEFT JOIN users u ON u.id = r.received_by
            WHERE r.purchase_order_id = :po_id AND r.company_id = :company_id
            ORDER BY r.id DESC
        """), {"po_id": po_id, "company_id": company_id}).mappings().all()

        receipts = []
        for row in rows:
            items = db.execute(text("""
                SELECT ri.product_id, p.name AS product_name, ri.quantity
                FROM purchase_order_receipt_items ri
                LEFT JOIN products p ON p.id = ri.product_id
                WHERE ri.receipt_id = :receipt_id AND ri.company_id = :company_id
            """), {"receipt_id": row["id"], "company_id": company_id}).mappings().all()
            receipts.append({
                "id": row["id"],
                "warehouse_id": row["warehouse_id"],
                "warehouse_name": row["warehouse_name"] or "Main",
                "received_by": row["received_by"],
                "received_by_name": row["received_by_name"] or "",
                "received_at": row["received_at"],
                "note": row["note"],
                "items": [{"product_id": i["product_id"], "product_name": i["product_name"] or "", "quantity": i["quantity"]} for i in items],
            })
        return {"items": receipts}
    finally:
        db.close()
