"""Tiered & rule-based pricing.

PriceTier (the original quantity/customer-group model) is left completely
untouched - existing tiers keep resolving exactly as before. This module
adds a second, richer layer (PricingRule) on top: product/category/brand
scope, customer/group/loyalty-tier scope, branch/channel scope, date
validity, and four price-behavior modes. resolve_price() now checks
PricingRule first (deterministic precedence - see _rank_rule), then falls
back to the legacy PriceTier quantity-break logic, then the product's own
base price - so a company that never creates a PricingRule sees zero
behavior change.

Per explicit product decision, this stays a *suggestion*: nothing here
validates or rejects the unit_price a client actually submits when creating
an invoice (see main.py's _create_invoice_impl, which is untouched) -
resolve_price/quote only computes the best default to offer.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Column, Float, Integer, String, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models.customer import Customer
from app.models.product import Product
from app.company_scope import current_company_id, ensure_company_id_column

router = APIRouter(prefix="/api/pricing", tags=["Tiered & Wholesale Pricing"])

VALID_CUSTOMER_GROUPS = {"retail", "wholesale"}
LOYALTY_LEVELS = {"Bronze", "Silver", "Gold", "Platinum", "VIP"}
SCOPE_TYPES = {"all", "product", "category", "brand"}
CUSTOMER_SCOPE_TYPES = {"any", "group", "loyalty_tier", "customer"}
PRICE_MODES = {"fixed", "percent_discount", "fixed_discount", "markup"}


class PriceTier(Base):
    __tablename__ = "price_tiers"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, nullable=False)
    min_quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    # None applies to every customer group; otherwise restricted to "retail"
    # or "wholesale" (see Customer.pricing_group).
    customer_group = Column(String, nullable=True)
    company_id = Column(Integer, nullable=True)


PriceTier.__table__.create(bind=engine, checkfirst=True)


def _ensure_rules_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS pricing_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL DEFAULT '',
            priority INTEGER NOT NULL DEFAULT 100,
            scope_type VARCHAR NOT NULL DEFAULT 'all',
            scope_value VARCHAR DEFAULT '',
            customer_scope_type VARCHAR NOT NULL DEFAULT 'any',
            customer_scope_value VARCHAR DEFAULT '',
            branch_id INTEGER,
            channel VARCHAR DEFAULT '',
            min_quantity FLOAT NOT NULL DEFAULT 0,
            max_quantity FLOAT,
            price_mode VARCHAR NOT NULL DEFAULT 'fixed',
            price_value FLOAT NOT NULL DEFAULT 0,
            currency VARCHAR DEFAULT '',
            start_date VARCHAR,
            end_date VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'active',
            notes VARCHAR DEFAULT '',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    ensure_company_id_column(conn, "pricing_rules")


class PriceTierCreate(BaseModel):
    product_id: int
    min_quantity: float
    unit_price: float
    customer_group: Optional[str] = None


class PricingRuleUpsert(BaseModel):
    name: str = ""
    priority: int = 100
    scope_type: str = "all"
    scope_value: str = ""
    customer_scope_type: str = "any"
    customer_scope_value: str = ""
    branch_id: Optional[int] = None
    channel: str = ""
    min_quantity: float = 0
    max_quantity: Optional[float] = None
    price_mode: str = "fixed"
    price_value: float = 0
    currency: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "active"
    notes: str = ""


def _now():
    return datetime.now(timezone.utc).isoformat()


def _validate_rule(data: PricingRuleUpsert):
    if data.scope_type not in SCOPE_TYPES:
        raise HTTPException(status_code=400, detail=f"scope_type must be one of: {', '.join(sorted(SCOPE_TYPES))}")
    if data.scope_type != "all" and not data.scope_value.strip():
        raise HTTPException(status_code=400, detail="scope_value is required unless scope_type is 'all'")
    if data.customer_scope_type not in CUSTOMER_SCOPE_TYPES:
        raise HTTPException(status_code=400, detail=f"customer_scope_type must be one of: {', '.join(sorted(CUSTOMER_SCOPE_TYPES))}")
    if data.customer_scope_type != "any" and not data.customer_scope_value.strip():
        raise HTTPException(status_code=400, detail="customer_scope_value is required unless customer_scope_type is 'any'")
    if data.customer_scope_type == "group" and data.customer_scope_value not in VALID_CUSTOMER_GROUPS:
        raise HTTPException(status_code=400, detail=f"customer_scope_value must be one of: {', '.join(sorted(VALID_CUSTOMER_GROUPS))}")
    if data.customer_scope_type == "loyalty_tier" and data.customer_scope_value not in LOYALTY_LEVELS:
        raise HTTPException(status_code=400, detail=f"customer_scope_value must be one of: {', '.join(sorted(LOYALTY_LEVELS))}")
    if data.price_mode not in PRICE_MODES:
        raise HTTPException(status_code=400, detail=f"price_mode must be one of: {', '.join(sorted(PRICE_MODES))}")
    if data.min_quantity < 0:
        raise HTTPException(status_code=400, detail="min_quantity cannot be negative")
    if data.max_quantity is not None and data.max_quantity < data.min_quantity:
        raise HTTPException(status_code=400, detail="max_quantity cannot be less than min_quantity")
    if data.status not in {"active", "inactive"}:
        raise HTTPException(status_code=400, detail="status must be 'active' or 'inactive'")


def _tier_to_dict(tier: PriceTier):
    return {
        "id": tier.id,
        "product_id": tier.product_id,
        "min_quantity": tier.min_quantity,
        "unit_price": tier.unit_price,
        "customer_group": tier.customer_group,
    }


def _rule_row_to_dict(row) -> dict:
    return dict(row)


def _customer_context(db: Session, customer_id: Optional[int]) -> dict:
    """{group, loyalty_level, id} - group defaults to 'retail' (matches
    Customer.pricing_group's own column default); loyalty_level reads the
    existing customer_loyalty table (app/crm/router.py) rather than
    recomputing it, so pricing stays consistent with whatever tier CRM is
    already showing that customer."""
    context = {"group": "retail", "loyalty_level": "Bronze", "id": customer_id}
    if not customer_id:
        return context
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if customer and customer.pricing_group in VALID_CUSTOMER_GROUPS:
        context["group"] = customer.pricing_group
    row = db.execute(text("""
        SELECT 1 FROM sqlite_master WHERE type='table' AND name='customer_loyalty'
    """)).first()
    if row:
        loyalty = db.execute(text(
            "SELECT level FROM customer_loyalty WHERE customer_id=:cid"
        ), {"cid": customer_id}).first()
        if loyalty and loyalty[0] in LOYALTY_LEVELS:
            context["loyalty_level"] = loyalty[0]
    return context


def _date_in_range(rule_row, on_date: date) -> bool:
    start = rule_row["start_date"]
    end = rule_row["end_date"]
    if start:
        try:
            if on_date < date.fromisoformat(str(start)[:10]):
                return False
        except ValueError:
            pass
    if end:
        try:
            if on_date > date.fromisoformat(str(end)[:10]):
                return False
        except ValueError:
            pass
    return True


def _product_scope_matches(rule_row, product: Product) -> bool:
    scope_type = rule_row["scope_type"]
    if scope_type == "all":
        return True
    if scope_type == "product":
        return str(rule_row["scope_value"]) == str(product.id)
    if scope_type == "category":
        value = rule_row["scope_value"]
        return value in (product.main_category or "", product.sub_category or "")
    if scope_type == "brand":
        return rule_row["scope_value"] == (product.brand or "")
    return False


def _customer_scope_matches(rule_row, customer_ctx: dict) -> bool:
    scope_type = rule_row["customer_scope_type"]
    if scope_type == "any":
        return True
    if scope_type == "customer":
        return customer_ctx["id"] is not None and str(rule_row["customer_scope_value"]) == str(customer_ctx["id"])
    if scope_type == "group":
        return rule_row["customer_scope_value"] == customer_ctx["group"]
    if scope_type == "loyalty_tier":
        return rule_row["customer_scope_value"] == customer_ctx["loyalty_level"]
    return False


def _specificity(rule_row) -> tuple:
    """Deterministic precedence per the task spec's own example (no prior
    precedence model existed to preserve instead): specific customer beats
    customer group/loyalty tier beats any-customer; specific product beats
    category/brand beats an all-products rule. Rule.priority (lower wins)
    and then the widest matching min_quantity break remaining ties."""
    customer_rank = {"customer": 3, "loyalty_tier": 2, "group": 2, "any": 1}[rule_row["customer_scope_type"]]
    product_rank = {"product": 3, "category": 2, "brand": 2, "all": 1}[rule_row["scope_type"]]
    return (customer_rank, product_rank, -rule_row["priority"], rule_row["min_quantity"])


def _apply_price_mode(base_price: float, price_mode: str, price_value: float) -> float:
    if price_mode == "fixed":
        result = price_value
    elif price_mode == "percent_discount":
        result = base_price * (1 - price_value / 100)
    elif price_mode == "fixed_discount":
        result = base_price - price_value
    elif price_mode == "markup":
        result = base_price * (1 + price_value / 100)
    else:
        result = base_price
    return max(0.0, result)


def _matching_rules(db: Session, product: Product, quantity: float, customer_ctx: dict, company_id, branch_id, channel, on_date: date):
    _ensure_rules_schema(db.connection())
    rows = db.execute(text("""
        SELECT * FROM pricing_rules WHERE company_id=:company_id AND status='active'
    """), {"company_id": company_id}).mappings().all()
    matches = []
    for row in rows:
        if not _product_scope_matches(row, product):
            continue
        if not _customer_scope_matches(row, customer_ctx):
            continue
        if quantity < row["min_quantity"]:
            continue
        if row["max_quantity"] is not None and quantity > row["max_quantity"]:
            continue
        if row["branch_id"] is not None and branch_id is not None and row["branch_id"] != branch_id:
            continue
        if row["channel"] and channel and row["channel"] != channel:
            continue
        if not _date_in_range(row, on_date):
            continue
        matches.append(row)
    matches.sort(key=_specificity, reverse=True)
    return matches


def resolve_price(
    db: Session, product_id: int, quantity: float, customer_id: Optional[int] = None, company_id: Optional[int] = None,
    branch_id: Optional[int] = None, channel: Optional[str] = None, on_date: Optional[str] = None,
):
    query = db.query(Product).filter(Product.id == product_id)
    if company_id is not None:
        query = query.filter(Product.company_id == company_id)
    product = query.first()
    if not product:
        return None

    base_price = float(product.sell_price if product.sell_price is not None else (product.price or 0))
    customer_ctx = _customer_context(db, customer_id)
    quantity = float(quantity or 0)
    try:
        effective_date = date.fromisoformat(on_date) if on_date else datetime.utcnow().date()
    except ValueError:
        effective_date = datetime.utcnow().date()

    matches = _matching_rules(db, product, quantity, customer_ctx, company_id, branch_id, channel, effective_date)
    if matches:
        winner = matches[0]
        unit_price = _apply_price_mode(base_price, winner["price_mode"], winner["price_value"])
        return {
            "unit_price": unit_price,
            "tier_applied": True,
            "source": "pricing_rule",
            "rule_id": winner["id"],
            "rule_name": winner["name"],
            "base_price": base_price,
            "discount_amount": round(base_price - unit_price, 2),
            "customer_group": customer_ctx["group"],
            "loyalty_level": customer_ctx["loyalty_level"],
            "matched_rules": [{"id": r["id"], "name": r["name"], "priority": r["priority"]} for r in matches],
        }

    # Legacy quantity-break tiers - unchanged behavior for any company that
    # never creates a PricingRule.
    tiers = (
        db.query(PriceTier)
        .filter(PriceTier.product_id == product_id, PriceTier.min_quantity <= quantity)
        .all()
    )
    applicable = [t for t in tiers if not t.customer_group or t.customer_group == customer_ctx["group"]]
    if applicable:
        best = max(applicable, key=lambda t: t.min_quantity)
        return {
            "unit_price": float(best.unit_price),
            "tier_applied": True,
            "source": "price_tier",
            "tier_id": best.id,
            "base_price": base_price,
            "discount_amount": round(base_price - float(best.unit_price), 2),
            "customer_group": customer_ctx["group"],
            "loyalty_level": customer_ctx["loyalty_level"],
            "matched_rules": [],
        }

    return {
        "unit_price": base_price,
        "tier_applied": False,
        "source": "base",
        "base_price": base_price,
        "discount_amount": 0,
        "customer_group": customer_ctx["group"],
        "loyalty_level": customer_ctx["loyalty_level"],
        "matched_rules": [],
    }


@router.get("/tiers")
def list_price_tiers(request: Request, product_id: Optional[int] = None):
    db: Session = SessionLocal()
    try:
        query = db.query(PriceTier).filter(PriceTier.company_id == current_company_id(request))
        if product_id is not None:
            query = query.filter(PriceTier.product_id == product_id)
        tiers = query.order_by(PriceTier.product_id.asc(), PriceTier.min_quantity.asc()).all()
        return {"items": [_tier_to_dict(t) for t in tiers]}
    finally:
        db.close()


@router.post("/tiers")
def create_price_tier(data: PriceTierCreate, request: Request):
    if data.customer_group is not None and data.customer_group not in VALID_CUSTOMER_GROUPS:
        raise HTTPException(status_code=400, detail=f"customer_group must be one of: {', '.join(VALID_CUSTOMER_GROUPS)}")
    if data.min_quantity <= 0:
        raise HTTPException(status_code=400, detail="min_quantity must be greater than zero")
    if data.unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price cannot be negative")

    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        product = db.query(Product).filter(Product.id == data.product_id, Product.company_id == company_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        tier = PriceTier(
            product_id=data.product_id,
            min_quantity=data.min_quantity,
            unit_price=data.unit_price,
            customer_group=data.customer_group,
            company_id=company_id,
        )
        db.add(tier)
        db.commit()
        db.refresh(tier)
        return {"status": "created", **_tier_to_dict(tier)}
    finally:
        db.close()


@router.delete("/tiers/{tier_id}")
def delete_price_tier(tier_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        tier = db.query(PriceTier).filter(PriceTier.id == tier_id, PriceTier.company_id == current_company_id(request)).first()
        if not tier:
            raise HTTPException(status_code=404, detail="Price tier not found")
        db.delete(tier)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


@router.get("/rules")
def list_pricing_rules(request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_rules_schema(conn)
        rows = conn.execute(text("""
            SELECT * FROM pricing_rules WHERE company_id=:company_id ORDER BY priority ASC, id DESC
        """), {"company_id": company_id}).mappings().all()
    return {"items": [_rule_row_to_dict(row) for row in rows]}


@router.post("/rules")
def create_pricing_rule(data: PricingRuleUpsert, request: Request):
    _validate_rule(data)
    company_id = current_company_id(request)
    now = _now()
    with engine.begin() as conn:
        _ensure_rules_schema(conn)
        result = conn.execute(text("""
            INSERT INTO pricing_rules
              (name, priority, scope_type, scope_value, customer_scope_type, customer_scope_value,
               branch_id, channel, min_quantity, max_quantity, price_mode, price_value, currency,
               start_date, end_date, status, notes, created_at, updated_at, company_id)
            VALUES
              (:name, :priority, :scope_type, :scope_value, :customer_scope_type, :customer_scope_value,
               :branch_id, :channel, :min_quantity, :max_quantity, :price_mode, :price_value, :currency,
               :start_date, :end_date, :status, :notes, :now, :now, :company_id)
        """), {**data.model_dump(), "now": now, "company_id": company_id})
        rule_id = result.lastrowid
    return {"status": "created", "id": rule_id}


@router.put("/rules/{rule_id}")
def update_pricing_rule(rule_id: int, data: PricingRuleUpsert, request: Request):
    _validate_rule(data)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_rules_schema(conn)
        existing = conn.execute(text("""
            SELECT id FROM pricing_rules WHERE id=:id AND company_id=:company_id
        """), {"id": rule_id, "company_id": company_id}).first()
        if not existing:
            raise HTTPException(status_code=404, detail="Pricing rule not found")
        conn.execute(text("""
            UPDATE pricing_rules SET
              name=:name, priority=:priority, scope_type=:scope_type, scope_value=:scope_value,
              customer_scope_type=:customer_scope_type, customer_scope_value=:customer_scope_value,
              branch_id=:branch_id, channel=:channel, min_quantity=:min_quantity, max_quantity=:max_quantity,
              price_mode=:price_mode, price_value=:price_value, currency=:currency, start_date=:start_date,
              end_date=:end_date, status=:status, notes=:notes, updated_at=:now
            WHERE id=:id AND company_id=:company_id
        """), {**data.model_dump(), "id": rule_id, "company_id": company_id, "now": _now()})
    return {"status": "updated"}


@router.delete("/rules/{rule_id}")
def delete_pricing_rule(rule_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_rules_schema(conn)
        existing = conn.execute(text("""
            SELECT id FROM pricing_rules WHERE id=:id AND company_id=:company_id
        """), {"id": rule_id, "company_id": company_id}).first()
        if not existing:
            raise HTTPException(status_code=404, detail="Pricing rule not found")
        conn.execute(text("DELETE FROM pricing_rules WHERE id=:id AND company_id=:company_id"), {"id": rule_id, "company_id": company_id})
    return {"status": "deleted"}


@router.get("/quote")
def quote_price(
    product_id: int, request: Request, quantity: float = 1, customer_id: Optional[int] = None,
    branch_id: Optional[int] = None, channel: Optional[str] = None, on_date: Optional[str] = None,
):
    db: Session = SessionLocal()
    try:
        result = resolve_price(db, product_id, quantity, customer_id, current_company_id(request), branch_id, channel, on_date)
        if result is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return result
    finally:
        db.close()
