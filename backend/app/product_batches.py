"""Serial/batch/expiry tracking for products (MVP).

Previously completely absent: businesses selling warrantied (serial number)
or perishable (expiry date) goods had no way to record which physical lot
or unit a piece of stock belongs to. This adds a lightweight, opt-in
per-product batch/serial ledger with expiry visibility (an "expiring soon"
list) and lookup-by-number.

Scope note: this MVP covers *recording and visibility* only. It does not
yet make invoice/sale stock deduction batch-aware (FEFO auto-consumption)
- Product.stock stays the single aggregate number the rest of the app
already relies on (apply_invoice_stock in main.py, same as every other
stock path), and a batch's remaining_quantity is adjusted manually via
the /consume endpoint rather than automatically during a sale. Wiring
FEFO consumption into the sale/invoice path is real, additional follow-up
work, not something to bolt onto the core accounting-critical invoice flow
without its own dedicated review.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models.product import Product
from app.company_scope import current_company_id

router = APIRouter(prefix="/api/product-batches", tags=["Serial/Batch/Expiry Tracking"])


class ProductBatch(Base):
    __tablename__ = "product_batches"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, nullable=False)
    batch_number = Column(String, nullable=False)  # also doubles as a serial number for unit=1 items
    quantity = Column(Float, default=1)
    remaining_quantity = Column(Float, default=1)
    expiry_date = Column(String, nullable=True)  # ISO date string; nullable for non-perishables
    received_date = Column(String, nullable=True)
    note = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, nullable=True)


ProductBatch.__table__.create(bind=engine, checkfirst=True)


class BatchCreate(BaseModel):
    batch_number: str
    quantity: float = 1
    expiry_date: str = ""
    received_date: str = ""
    note: str = ""


class ConsumeRequest(BaseModel):
    quantity: float


def _batch_dict(row: ProductBatch, product_name: Optional[str] = None) -> dict:
    today = date.today()
    days_to_expiry = None
    expired = False
    if row.expiry_date:
        try:
            expiry = date.fromisoformat(str(row.expiry_date)[:10])
            days_to_expiry = (expiry - today).days
            expired = days_to_expiry < 0
        except ValueError:
            pass
    result = {
        "id": row.id,
        "product_id": row.product_id,
        "batch_number": row.batch_number,
        "quantity": row.quantity,
        "remaining_quantity": row.remaining_quantity,
        "expiry_date": row.expiry_date,
        "received_date": row.received_date,
        "note": row.note,
        "days_to_expiry": days_to_expiry,
        "expired": expired,
        "expiring_soon": days_to_expiry is not None and 0 <= days_to_expiry <= 30,
        "created_at": row.created_at,
    }
    if product_name is not None:
        result["product_name"] = product_name
    return result


@router.get("/product/{product_id}")
def list_batches_for_product(product_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        rows = (
            db.query(ProductBatch)
            .filter(ProductBatch.product_id == product_id, ProductBatch.company_id == current_company_id(request))
            .order_by(ProductBatch.id.desc())
            .all()
        )
        return [_batch_dict(r) for r in rows]
    finally:
        db.close()


@router.post("/product/{product_id}")
def create_batch(product_id: int, data: BatchCreate, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        product = db.query(Product).filter(Product.id == product_id, Product.company_id == company_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if not data.batch_number.strip():
            raise HTTPException(status_code=400, detail="batch_number is required")
        if data.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

        row = ProductBatch(
            product_id=product_id,
            batch_number=data.batch_number.strip(),
            quantity=data.quantity,
            remaining_quantity=data.quantity,
            expiry_date=data.expiry_date or None,
            received_date=data.received_date or datetime.utcnow().date().isoformat(),
            note=data.note,
            company_id=company_id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"status": "created", "id": row.id}
    finally:
        db.close()


@router.post("/{batch_id}/consume")
def consume_batch(batch_id: int, data: ConsumeRequest, request: Request):
    """Manually records that some quantity from this batch/serial was sold
    or used, so remaining_quantity stays accurate. Does not touch
    Product.stock - that is still updated the normal way (invoice/stock
    movement/purchase order), independently of which batch it came from."""
    db: Session = SessionLocal()
    try:
        row = db.query(ProductBatch).filter(ProductBatch.id == batch_id, ProductBatch.company_id == current_company_id(request)).first()
        if not row:
            raise HTTPException(status_code=404, detail="Batch not found")
        if data.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        if data.quantity > row.remaining_quantity:
            raise HTTPException(status_code=400, detail=f"Only {row.remaining_quantity} remaining in this batch")
        row.remaining_quantity -= data.quantity
        db.commit()
        return {"status": "updated", "id": batch_id, "remaining_quantity": row.remaining_quantity}
    finally:
        db.close()


@router.delete("/{batch_id}")
def delete_batch(batch_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        row = db.query(ProductBatch).filter(ProductBatch.id == batch_id, ProductBatch.company_id == current_company_id(request)).first()
        if not row:
            raise HTTPException(status_code=404, detail="Batch not found")
        db.delete(row)
        db.commit()
        return {"status": "deleted", "id": batch_id}
    finally:
        db.close()


@router.get("/expiring")
def list_expiring_batches(request: Request, days: int = 30):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        rows = db.query(ProductBatch).filter(ProductBatch.expiry_date.isnot(None), ProductBatch.company_id == company_id).all()
        products = {p.id: p.name for p in db.query(Product).filter(Product.company_id == company_id).all()}
        result = []
        for row in rows:
            if row.remaining_quantity <= 0:
                continue
            entry = _batch_dict(row, product_name=products.get(row.product_id, ""))
            if entry["days_to_expiry"] is not None and entry["days_to_expiry"] <= days:
                result.append(entry)
        result.sort(key=lambda x: (x["days_to_expiry"] is None, x["days_to_expiry"]))
        return result
    finally:
        db.close()


@router.get("/lookup/{batch_number}")
def lookup_batch(batch_number: str, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        rows = db.query(ProductBatch).filter(ProductBatch.batch_number == batch_number, ProductBatch.company_id == company_id).all()
        products = {p.id: p.name for p in db.query(Product).filter(Product.company_id == company_id).all()}
        return [_batch_dict(r, product_name=products.get(r.product_id, "")) for r in rows]
    finally:
        db.close()
