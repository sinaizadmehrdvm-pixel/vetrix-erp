"""Multi-branch / multi-warehouse inventory - additive, opt-in.

Product.stock stays exactly what it's always been: the aggregate total,
updated by the existing apply_invoice_stock/reverse_invoice_stock/
create_stock_movement code paths in main.py, completely untouched here.

This module adds a per-location breakdown *on top* of that aggregate,
without ever needing to keep a running balance for the default ("Main")
warehouse in sync: only non-default warehouses get explicit ledger rows
(warehouse_stock), and Main's quantity for a product is always computed as
`Product.stock - sum(that product's rows in every non-default warehouse)`.
That means Main's number is correct forever regardless of how much of the
rest of the app never mentions warehouses at all - there's nothing to fall
out of sync, because it's derived rather than stored.

A transfer simply moves quantity between two warehouses' views of the same
total; it never touches Product.stock, since the company's total owned
quantity doesn't change when stock moves between its own locations.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models.product import Product

router = APIRouter(prefix="/api/warehouses", tags=["Multi-Branch Warehouses"])

DEFAULT_WAREHOUSE_NAME = "Main"


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, default="")
    address = Column(String, default="")
    is_default = Column(Boolean, default=False, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class WarehouseStock(Base):
    __tablename__ = "warehouse_stock"
    __table_args__ = (UniqueConstraint("warehouse_id", "product_id"),)

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, nullable=False)
    product_id = Column(Integer, nullable=False)
    quantity = Column(Float, default=0, nullable=False)


Warehouse.__table__.create(bind=engine, checkfirst=True)
WarehouseStock.__table__.create(bind=engine, checkfirst=True)


class WarehouseCreate(BaseModel):
    name: str
    code: str = ""
    address: str = ""


class TransferRequest(BaseModel):
    product_id: int
    from_warehouse_id: int
    to_warehouse_id: int
    quantity: float
    note: str = ""


def _ensure_default_warehouse(db: Session) -> Warehouse:
    default = db.query(Warehouse).filter(Warehouse.is_default.is_(True)).first()
    if default:
        return default
    default = Warehouse(name=DEFAULT_WAREHOUSE_NAME, is_default=True, active=True)
    db.add(default)
    db.commit()
    db.refresh(default)
    return default


def _non_default_rows(db: Session, product_id: int):
    return (
        db.query(WarehouseStock)
        .join(Warehouse, Warehouse.id == WarehouseStock.warehouse_id)
        .filter(WarehouseStock.product_id == product_id, Warehouse.is_default.is_(False))
        .all()
    )


def stock_breakdown(db: Session, product_id: int) -> dict:
    """{warehouse_id: quantity} for every active warehouse, for one product."""
    default = _ensure_default_warehouse(db)
    product = db.query(Product).filter(Product.id == product_id).first()
    total = float(product.stock or 0) if product else 0.0

    other_rows = _non_default_rows(db, product_id)
    allocated_elsewhere = sum(float(row.quantity or 0) for row in other_rows)

    breakdown = {default.id: total - allocated_elsewhere}
    for row in other_rows:
        breakdown[row.warehouse_id] = float(row.quantity or 0)
    return breakdown


def _get_or_create_row(db: Session, warehouse_id: int, product_id: int) -> WarehouseStock:
    row = (
        db.query(WarehouseStock)
        .filter(WarehouseStock.warehouse_id == warehouse_id, WarehouseStock.product_id == product_id)
        .first()
    )
    if row:
        return row
    row = WarehouseStock(warehouse_id=warehouse_id, product_id=product_id, quantity=0)
    db.add(row)
    db.flush()
    return row


def apply_warehouse_delta(db: Session, warehouse_id: Optional[int], product_id: int, delta: float):
    """Adjusts one warehouse's bucket by `delta` (positive = stock coming in,
    negative = stock going out). No-op for the default warehouse - its
    number is derived, not stored - and for warehouse_id=None (the caller
    didn't specify a warehouse for this line)."""
    if warehouse_id is None:
        return
    default = _ensure_default_warehouse(db)
    if warehouse_id == default.id:
        return
    row = _get_or_create_row(db, warehouse_id, product_id)
    row.quantity = float(row.quantity or 0) + delta


def invoice_warehouse_delta(invoice_type: str, quantity: float) -> float:
    """Same sign convention as main.py's apply_invoice_stock(), so a
    warehouse-tagged line's bucket moves the same direction as the aggregate."""
    if invoice_type in ("buy", "return_sale"):
        return quantity
    if invoice_type in ("sale", "return_buy"):
        return -quantity
    return 0.0


def _record_transfer_movement(db: Session, product: Product, from_name: str, to_name: str, quantity: float, note: str):
    now = datetime.utcnow().isoformat()
    db.execute(
        text("""
            INSERT INTO stock_movements
            (warehouse, product_id, product_name, quantity, movement_type, movement_date, note, created_at)
            VALUES (:warehouse, :product_id, :product_name, :quantity, 'out', :movement_date, :note, :created_at)
        """),
        {
            "warehouse": from_name, "product_id": product.id, "product_name": product.name,
            "quantity": quantity, "movement_date": now[:10],
            "note": f"Transfer to {to_name}" + (f" - {note}" if note else ""), "created_at": now,
        },
    )
    db.execute(
        text("""
            INSERT INTO stock_movements
            (warehouse, product_id, product_name, quantity, movement_type, movement_date, note, created_at)
            VALUES (:warehouse, :product_id, :product_name, :quantity, 'in', :movement_date, :note, :created_at)
        """),
        {
            "warehouse": to_name, "product_id": product.id, "product_name": product.name,
            "quantity": quantity, "movement_date": now[:10],
            "note": f"Transfer from {from_name}" + (f" - {note}" if note else ""), "created_at": now,
        },
    )


@router.post("")
def create_warehouse(data: WarehouseCreate):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Warehouse name is required")
    db: Session = SessionLocal()
    try:
        _ensure_default_warehouse(db)
        warehouse = Warehouse(name=data.name.strip(), code=data.code, address=data.address, is_default=False, active=True)
        db.add(warehouse)
        db.commit()
        db.refresh(warehouse)
        return {"status": "created", "id": warehouse.id}
    finally:
        db.close()


@router.get("")
def list_warehouses():
    db: Session = SessionLocal()
    try:
        _ensure_default_warehouse(db)
        warehouses = db.query(Warehouse).order_by(Warehouse.is_default.desc(), Warehouse.id.asc()).all()
        return {
            "items": [
                {
                    "id": w.id, "name": w.name, "code": w.code, "address": w.address,
                    "is_default": w.is_default, "active": w.active, "created_at": w.created_at,
                }
                for w in warehouses
            ]
        }
    finally:
        db.close()


@router.post("/{warehouse_id}/deactivate")
def deactivate_warehouse(warehouse_id: int):
    db: Session = SessionLocal()
    try:
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if warehouse.is_default:
            raise HTTPException(status_code=400, detail="The default warehouse cannot be deactivated")
        warehouse.active = False
        db.commit()
        return {"status": "deactivated"}
    finally:
        db.close()


@router.get("/stock")
def get_stock_breakdown(product_id: int):
    db: Session = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        breakdown = stock_breakdown(db, product_id)
        warehouses = {w.id: w.name for w in db.query(Warehouse).all()}
        return {
            "product_id": product_id,
            "total": float(product.stock or 0),
            "by_warehouse": [
                {"warehouse_id": wid, "warehouse_name": warehouses.get(wid, ""), "quantity": qty}
                for wid, qty in breakdown.items()
            ],
        }
    finally:
        db.close()


@router.post("/transfer")
def transfer_stock(data: TransferRequest):
    if data.from_warehouse_id == data.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must differ")
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    db: Session = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == data.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        warehouses = {w.id: w for w in db.query(Warehouse).all()}
        from_warehouse = warehouses.get(data.from_warehouse_id)
        to_warehouse = warehouses.get(data.to_warehouse_id)
        if not from_warehouse or not to_warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if not to_warehouse.active:
            raise HTTPException(status_code=400, detail="Destination warehouse is not active")

        breakdown = stock_breakdown(db, data.product_id)
        available = breakdown.get(data.from_warehouse_id, 0.0)
        if data.quantity > available:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock in {from_warehouse.name}; available: {available}",
            )

        apply_warehouse_delta(db, data.from_warehouse_id, data.product_id, -data.quantity)
        apply_warehouse_delta(db, data.to_warehouse_id, data.product_id, data.quantity)
        _record_transfer_movement(db, product, from_warehouse.name, to_warehouse.name, data.quantity, data.note)
        db.commit()

        return {"status": "transferred", "by_warehouse": stock_breakdown(db, data.product_id)}
    finally:
        db.close()


@router.get("/{warehouse_id}/products")
def list_warehouse_products(warehouse_id: int):
    db: Session = SessionLocal()
    try:
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")

        products = db.query(Product).all()
        items = []
        for product in products:
            breakdown = stock_breakdown(db, product.id)
            quantity = breakdown.get(warehouse_id, 0.0)
            if quantity:
                items.append({"product_id": product.id, "product_name": product.name, "quantity": quantity})
        return {"warehouse_id": warehouse_id, "warehouse_name": warehouse.name, "items": items}
    finally:
        db.close()
