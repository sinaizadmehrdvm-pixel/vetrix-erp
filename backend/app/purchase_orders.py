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
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models.customer import Customer
from app.models.product import Product
from app.company_scope import current_company_id

router = APIRouter(prefix="/api/purchase-orders", tags=["Purchase Orders"])
MONEY_STEP = Decimal("0.01")


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


PurchaseOrder.__table__.create(bind=engine, checkfirst=True)
PurchaseOrderItem.__table__.create(bind=engine, checkfirst=True)


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


@router.post("/{po_id}/send")
def send_purchase_order(po_id: int, request: Request):
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT status FROM purchase_orders WHERE id=:id AND company_id=:company_id"),
            {"id": po_id, "company_id": current_company_id(request)},
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if row[0] != "draft":
            raise HTTPException(status_code=400, detail="Only a draft purchase order can be sent")
        conn.execute(text("UPDATE purchase_orders SET status='sent' WHERE id=:id"), {"id": po_id})
    return {"status": "sent", "id": po_id}


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
