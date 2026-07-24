from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Float, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models.customer import Customer
from app.models.product import Product

router = APIRouter(prefix="/api/pricing", tags=["Tiered & Wholesale Pricing"])

VALID_CUSTOMER_GROUPS = {"retail", "wholesale"}


class PriceTier(Base):
    __tablename__ = "price_tiers"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, nullable=False)
    min_quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    # None applies to every customer group; otherwise restricted to "retail"
    # or "wholesale" (see Customer.pricing_group).
    customer_group = Column(String, nullable=True)


PriceTier.__table__.create(bind=engine, checkfirst=True)


class PriceTierCreate(BaseModel):
    product_id: int
    min_quantity: float
    unit_price: float
    customer_group: Optional[str] = None


def _tier_to_dict(tier: PriceTier):
    return {
        "id": tier.id,
        "product_id": tier.product_id,
        "min_quantity": tier.min_quantity,
        "unit_price": tier.unit_price,
        "customer_group": tier.customer_group,
    }


def resolve_price(db: Session, product_id: int, quantity: float, customer_id: Optional[int] = None):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return None

    base_price = float(product.sell_price if product.sell_price is not None else (product.price or 0))

    customer_group = "retail"
    if customer_id:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if customer and customer.pricing_group in VALID_CUSTOMER_GROUPS:
            customer_group = customer.pricing_group

    tiers = (
        db.query(PriceTier)
        .filter(PriceTier.product_id == product_id, PriceTier.min_quantity <= float(quantity or 0))
        .all()
    )
    applicable = [t for t in tiers if not t.customer_group or t.customer_group == customer_group]

    if not applicable:
        return {"unit_price": base_price, "tier_applied": False, "customer_group": customer_group}

    best = max(applicable, key=lambda t: t.min_quantity)
    return {
        "unit_price": float(best.unit_price),
        "tier_applied": True,
        "tier_id": best.id,
        "customer_group": customer_group,
    }


@router.get("/tiers")
def list_price_tiers(product_id: Optional[int] = None):
    db: Session = SessionLocal()
    try:
        query = db.query(PriceTier)
        if product_id is not None:
            query = query.filter(PriceTier.product_id == product_id)
        tiers = query.order_by(PriceTier.product_id.asc(), PriceTier.min_quantity.asc()).all()
        return {"items": [_tier_to_dict(t) for t in tiers]}
    finally:
        db.close()


@router.post("/tiers")
def create_price_tier(data: PriceTierCreate):
    if data.customer_group is not None and data.customer_group not in VALID_CUSTOMER_GROUPS:
        raise HTTPException(status_code=400, detail=f"customer_group must be one of: {', '.join(VALID_CUSTOMER_GROUPS)}")
    if data.min_quantity <= 0:
        raise HTTPException(status_code=400, detail="min_quantity must be greater than zero")
    if data.unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price cannot be negative")

    db: Session = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == data.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        tier = PriceTier(
            product_id=data.product_id,
            min_quantity=data.min_quantity,
            unit_price=data.unit_price,
            customer_group=data.customer_group,
        )
        db.add(tier)
        db.commit()
        db.refresh(tier)
        return {"status": "created", **_tier_to_dict(tier)}
    finally:
        db.close()


@router.delete("/tiers/{tier_id}")
def delete_price_tier(tier_id: int):
    db: Session = SessionLocal()
    try:
        tier = db.query(PriceTier).filter(PriceTier.id == tier_id).first()
        if not tier:
            raise HTTPException(status_code=404, detail="Price tier not found")
        db.delete(tier)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


@router.get("/quote")
def quote_price(product_id: int, quantity: float = 1, customer_id: Optional[int] = None):
    db: Session = SessionLocal()
    try:
        result = resolve_price(db, product_id, quantity, customer_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return result
    finally:
        db.close()
