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

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models.product import Product
from app.company_scope import current_company_id

router = APIRouter(prefix="/api/warehouses", tags=["Multi-Branch Warehouses"])

DEFAULT_WAREHOUSE_NAME = "Main"
WAREHOUSE_TYPES = {"main", "branch_stockroom", "distribution_center", "retail_backroom", "other"}


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, default="")
    address = Column(String, default="")
    is_default = Column(Boolean, default=False, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, nullable=True)
    branch_id = Column(Integer, nullable=True)
    postal_code = Column(String, default="")
    phone = Column(String, default="")
    responsible_person = Column(String, default="")
    warehouse_type = Column(String, default="main")
    description = Column(String, default="")
    capacity = Column(Float, nullable=True)
    capacity_unit = Column(String, default="")


class WarehouseStock(Base):
    __tablename__ = "warehouse_stock"
    __table_args__ = (UniqueConstraint("warehouse_id", "product_id"),)

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, nullable=False)
    product_id = Column(Integer, nullable=False)
    quantity = Column(Float, default=0, nullable=False)
    company_id = Column(Integer, nullable=True)


Warehouse.__table__.create(bind=engine, checkfirst=True)
WarehouseStock.__table__.create(bind=engine, checkfirst=True)


def _ensure_new_columns(conn):
    """Warehouse was created via SQLAlchemy's declarative Table.create(),
    which only handles brand-new tables - an already-existing warehouses
    table (like this app's dev database) needs these Task-02 columns added
    the same idempotent way main.py's ensure_sqlite_column() does."""
    rows = conn.execute(text("PRAGMA table_info(warehouses)")).fetchall()
    existing = {row[1] for row in rows}
    additions = {
        "branch_id": "branch_id INTEGER",
        "postal_code": "postal_code VARCHAR DEFAULT ''",
        "phone": "phone VARCHAR DEFAULT ''",
        "responsible_person": "responsible_person VARCHAR DEFAULT ''",
        "warehouse_type": "warehouse_type VARCHAR DEFAULT 'main'",
        "description": "description VARCHAR DEFAULT ''",
        "capacity": "capacity FLOAT",
        "capacity_unit": "capacity_unit VARCHAR DEFAULT ''",
    }
    for column_name, column_sql in additions.items():
        if column_name not in existing:
            conn.execute(text(f"ALTER TABLE warehouses ADD COLUMN {column_sql}"))


with engine.begin() as _conn:
    _ensure_new_columns(_conn)


class WarehouseCreate(BaseModel):
    name: str
    code: str = ""
    address: str = ""
    branch_id: Optional[int] = None
    postal_code: str = ""
    phone: str = ""
    responsible_person: str = ""
    warehouse_type: str = "main"
    description: str = ""
    capacity: Optional[float] = None
    capacity_unit: str = ""


class WarehouseUpdate(BaseModel):
    name: str
    code: str = ""
    address: str = ""
    branch_id: Optional[int] = None
    postal_code: str = ""
    phone: str = ""
    responsible_person: str = ""
    warehouse_type: str = "main"
    description: str = ""
    capacity: Optional[float] = None
    capacity_unit: str = ""


class TransferRequest(BaseModel):
    product_id: int
    from_warehouse_id: int
    to_warehouse_id: int
    quantity: float
    note: str = ""


def _ensure_default_warehouse(db: Session, company_id: int) -> Warehouse:
    default = db.query(Warehouse).filter(Warehouse.is_default.is_(True), Warehouse.company_id == company_id).first()
    if default:
        return default
    default = Warehouse(name=DEFAULT_WAREHOUSE_NAME, is_default=True, active=True, company_id=company_id)
    db.add(default)
    db.commit()
    db.refresh(default)
    return default


def _non_default_rows(db: Session, product_id: int, company_id: int):
    return (
        db.query(WarehouseStock)
        .join(Warehouse, Warehouse.id == WarehouseStock.warehouse_id)
        .filter(
            WarehouseStock.product_id == product_id,
            Warehouse.is_default.is_(False),
            Warehouse.company_id == company_id,
        )
        .all()
    )


def stock_breakdown(db: Session, product_id: int, company_id: int) -> dict:
    """{warehouse_id: quantity} for every active warehouse, for one product."""
    default = _ensure_default_warehouse(db, company_id)
    product = db.query(Product).filter(Product.id == product_id, Product.company_id == company_id).first()
    total = float(product.stock or 0) if product else 0.0

    other_rows = _non_default_rows(db, product_id, company_id)
    allocated_elsewhere = sum(float(row.quantity or 0) for row in other_rows)

    breakdown = {default.id: total - allocated_elsewhere}
    for row in other_rows:
        breakdown[row.warehouse_id] = float(row.quantity or 0)
    return breakdown


def _get_or_create_row(db: Session, warehouse_id: int, product_id: int, company_id: int) -> WarehouseStock:
    row = (
        db.query(WarehouseStock)
        .filter(WarehouseStock.warehouse_id == warehouse_id, WarehouseStock.product_id == product_id)
        .first()
    )
    if row:
        return row
    row = WarehouseStock(warehouse_id=warehouse_id, product_id=product_id, quantity=0, company_id=company_id)
    db.add(row)
    db.flush()
    return row


def apply_warehouse_delta(db: Session, warehouse_id: Optional[int], product_id: int, delta: float, company_id: int):
    """Adjusts one warehouse's bucket by `delta` (positive = stock coming in,
    negative = stock going out). No-op for the default warehouse - its
    number is derived, not stored - and for warehouse_id=None (the caller
    didn't specify a warehouse for this line)."""
    if warehouse_id is None:
        return
    default = _ensure_default_warehouse(db, company_id)
    if warehouse_id == default.id:
        return
    # Every caller passes a client-suppliable warehouse_id (an invoice line,
    # a stock-movement request) - re-validate it belongs to this company
    # before writing a stock row against it, same as transfer_stock()/
    # purchase_orders.py already do for their own warehouse_id params.
    owned = db.query(Warehouse.id).filter(Warehouse.id == warehouse_id, Warehouse.company_id == company_id).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    row = _get_or_create_row(db, warehouse_id, product_id, company_id)
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


def _validate_warehouse_type(warehouse_type: str):
    if warehouse_type not in WAREHOUSE_TYPES:
        raise HTTPException(status_code=400, detail=f"warehouse_type must be one of: {', '.join(sorted(WAREHOUSE_TYPES))}")


@router.post("")
def create_warehouse(data: WarehouseCreate, request: Request):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Warehouse name is required")
    _validate_warehouse_type(data.warehouse_type)
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        _ensure_default_warehouse(db, company_id)
        warehouse = Warehouse(
            name=data.name.strip(), code=data.code, address=data.address, is_default=False, active=True,
            company_id=company_id, branch_id=data.branch_id, postal_code=data.postal_code, phone=data.phone,
            responsible_person=data.responsible_person, warehouse_type=data.warehouse_type,
            description=data.description, capacity=data.capacity, capacity_unit=data.capacity_unit,
        )
        db.add(warehouse)
        db.commit()
        db.refresh(warehouse)
        return {"status": "created", "id": warehouse.id}
    finally:
        db.close()


def _warehouse_to_dict(w: Warehouse) -> dict:
    return {
        "id": w.id, "name": w.name, "code": w.code, "address": w.address,
        "is_default": w.is_default, "active": w.active, "created_at": w.created_at,
        "branch_id": w.branch_id, "postal_code": w.postal_code, "phone": w.phone,
        "responsible_person": w.responsible_person, "warehouse_type": w.warehouse_type,
        "description": w.description, "capacity": w.capacity, "capacity_unit": w.capacity_unit,
    }


@router.get("")
def list_warehouses(request: Request, branch_id: Optional[int] = None):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        _ensure_default_warehouse(db, company_id)
        query = db.query(Warehouse).filter(Warehouse.company_id == company_id)
        if branch_id is not None:
            query = query.filter(Warehouse.branch_id == branch_id)
        warehouses = query.order_by(Warehouse.is_default.desc(), Warehouse.id.asc()).all()
        return {"items": [_warehouse_to_dict(w) for w in warehouses]}
    finally:
        db.close()


@router.put("/{warehouse_id}")
def update_warehouse(warehouse_id: int, data: WarehouseUpdate, request: Request):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Warehouse name is required")
    _validate_warehouse_type(data.warehouse_type)
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id, Warehouse.company_id == company_id).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        warehouse.name = data.name.strip()
        warehouse.code = data.code
        warehouse.address = data.address
        warehouse.branch_id = data.branch_id
        warehouse.postal_code = data.postal_code
        warehouse.phone = data.phone
        warehouse.responsible_person = data.responsible_person
        warehouse.warehouse_type = data.warehouse_type
        warehouse.description = data.description
        warehouse.capacity = data.capacity
        warehouse.capacity_unit = data.capacity_unit
        db.commit()
        return {"status": "updated"}
    finally:
        db.close()


@router.post("/{warehouse_id}/deactivate")
def deactivate_warehouse(warehouse_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id, Warehouse.company_id == current_company_id(request)).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if warehouse.is_default:
            raise HTTPException(status_code=400, detail="The default warehouse cannot be deactivated")
        warehouse.active = False
        db.commit()
        return {"status": "deactivated"}
    finally:
        db.close()


@router.post("/{warehouse_id}/activate")
def activate_warehouse(warehouse_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id, Warehouse.company_id == current_company_id(request)).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        warehouse.active = True
        db.commit()
        return {"status": "activated"}
    finally:
        db.close()


@router.get("/stock")
def get_stock_breakdown(product_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        product = db.query(Product).filter(Product.id == product_id, Product.company_id == company_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        breakdown = stock_breakdown(db, product_id, company_id)
        warehouses = {w.id: w.name for w in db.query(Warehouse).filter(Warehouse.company_id == company_id).all()}
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
def transfer_stock(data: TransferRequest, request: Request):
    if data.from_warehouse_id == data.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must differ")
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        product = db.query(Product).filter(Product.id == data.product_id, Product.company_id == company_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        warehouses = {w.id: w for w in db.query(Warehouse).filter(Warehouse.company_id == company_id).all()}
        from_warehouse = warehouses.get(data.from_warehouse_id)
        to_warehouse = warehouses.get(data.to_warehouse_id)
        if not from_warehouse or not to_warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if not to_warehouse.active:
            raise HTTPException(status_code=400, detail="Destination warehouse is not active")

        breakdown = stock_breakdown(db, data.product_id, company_id)
        available = breakdown.get(data.from_warehouse_id, 0.0)
        if data.quantity > available:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock in {from_warehouse.name}; available: {available}",
            )

        apply_warehouse_delta(db, data.from_warehouse_id, data.product_id, -data.quantity, company_id)
        apply_warehouse_delta(db, data.to_warehouse_id, data.product_id, data.quantity, company_id)
        _record_transfer_movement(db, product, from_warehouse.name, to_warehouse.name, data.quantity, data.note)
        db.commit()

        return {"status": "transferred", "by_warehouse": stock_breakdown(db, data.product_id, company_id)}
    finally:
        db.close()


@router.get("/{warehouse_id}/products")
def list_warehouse_products(warehouse_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id, Warehouse.company_id == company_id).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")

        products = db.query(Product).filter(Product.company_id == company_id).all()
        items = []
        for product in products:
            breakdown = stock_breakdown(db, product.id, company_id)
            quantity = breakdown.get(warehouse_id, 0.0)
            if quantity:
                items.append({"product_id": product.id, "product_name": product.name, "quantity": quantity})
        return {"warehouse_id": warehouse_id, "warehouse_name": warehouse.name, "items": items}
    finally:
        db.close()
