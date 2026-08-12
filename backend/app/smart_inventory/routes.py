from typing import Optional

from fastapi import APIRouter, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from app.database import SessionLocal, engine
from app.company_scope import current_company_id
from app.models.product import Product
from app.models.invoice import Invoice, InvoiceItem

router = APIRouter(prefix="/api/smart-inventory", tags=["Smart Inventory"])


def _safe_float(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _product_dict(product, scoped_stock=None):
    """scoped_stock, when given, overrides the company-wide Product.stock
    with a branch/warehouse-aggregated quantity (see _scoped_stock_map) -
    stock_value_buy/sell and every downstream risk computation then reflect
    that narrower scope, while company_stock always keeps the true
    company-wide total visible for comparison."""
    buy_price = _safe_float(getattr(product, "buy_price", 0))
    sell_price = _safe_float(getattr(product, "sell_price", None) or getattr(product, "price", 0))
    company_stock = _safe_float(getattr(product, "stock", 0))
    stock = company_stock if scoped_stock is None else _safe_float(scoped_stock)
    min_stock = _safe_float(getattr(product, "min_stock", 0))
    return {
        "id": product.id,
        "name": getattr(product, "name", "") or "",
        "code": getattr(product, "code", "") or getattr(product, "barcode", "") or "",
        "barcode": getattr(product, "barcode", "") or "",
        "sku": getattr(product, "sku", "") or "",
        "brand": getattr(product, "brand", "") or "",
        "unit": getattr(product, "unit", "") or "عدد",
        "category": getattr(product, "main_category", "") or "",
        "sub_category": getattr(product, "sub_category", "") or "",
        "buy_price": buy_price,
        "sell_price": sell_price,
        "price": _safe_float(getattr(product, "price", sell_price)),
        "stock": stock,
        "company_stock": company_stock,
        "min_stock": min_stock,
        "stock_value_buy": stock * buy_price,
        "stock_value_sell": stock * sell_price,
        "profit_per_unit": sell_price - buy_price,
        "preferred_supplier_id": getattr(product, "preferred_supplier_id", None),
        "lead_time_days": int(getattr(product, "lead_time_days", 0) or 0),
    }


def _scoped_stock_map(db: Session, company_id: int, product_ids: list, branch_id: Optional[int], warehouse_id: Optional[int]) -> dict:
    """{product_id: quantity} aggregated to the requested scope, using the
    REAL Product x Warehouse breakdown (app.warehouses.stock_breakdown) -
    never a new branch_id-on-Product shortcut. warehouse_id wins if both
    are given; branch_id aggregates every warehouse belonging to that
    branch. Returns {} (meaning "use company-wide Product.stock instead")
    when neither scope is requested."""
    if branch_id is None and warehouse_id is None:
        return {}
    from app.warehouses import Warehouse, stock_breakdown

    if warehouse_id is not None:
        target_warehouse_ids = {warehouse_id}
    else:
        target_warehouse_ids = {
            w.id for w in db.query(Warehouse.id).filter(Warehouse.company_id == company_id, Warehouse.branch_id == branch_id).all()
        }
    result = {}
    for product_id in product_ids:
        breakdown = stock_breakdown(db, product_id, company_id)
        result[product_id] = sum(qty for wid, qty in breakdown.items() if wid in target_warehouse_ids)
    return result


def _sales_metrics(db: Session, product_id: int, days: int = 90):
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(InvoiceItem, Invoice)
        .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
        .filter(InvoiceItem.product_id == product_id)
        .filter(Invoice.created_at >= since)
        .all()
    )

    sold_qty = 0.0
    returned_qty = 0.0
    revenue = 0.0
    last_sale_date = None

    for item, invoice in rows:
        qty = _safe_float(item.quantity)
        amount = _safe_float(getattr(item, "total_price", 0))
        if invoice.invoice_type == "sale":
            sold_qty += qty
            revenue += amount
            if invoice.created_at and (last_sale_date is None or invoice.created_at > last_sale_date):
                last_sale_date = invoice.created_at
        elif invoice.invoice_type == "return_sale":
            returned_qty += qty
            revenue -= amount

    net_qty = max(sold_qty - returned_qty, 0)
    avg_daily = net_qty / max(days, 1)
    return {
        "sold_qty_90d": sold_qty,
        "returned_qty_90d": returned_qty,
        "net_qty_90d": net_qty,
        "revenue_90d": revenue,
        "avg_daily_sales": avg_daily,
        "last_sale_date": last_sale_date.isoformat() if last_sale_date else None,
        "days_without_sale": (datetime.utcnow() - last_sale_date).days if last_sale_date else None,
    }


def _risk_for_product(product, metrics, lead_time_days=7):
    stock = _safe_float(product.get("stock"))
    min_stock = _safe_float(product.get("min_stock"))
    avg_daily = _safe_float(metrics.get("avg_daily_sales"))
    days_left = stock / avg_daily if avg_daily > 0 else None
    forecast_need_30 = avg_daily * 30
    reorder_point = max(min_stock, avg_daily * lead_time_days)
    suggested_reorder = max(0, round((forecast_need_30 + reorder_point) - stock))

    risk_score = 0
    risk_level = "safe"
    reason = "موجودی در وضعیت پایدار است."

    if stock <= 0:
        risk_score = 100
        risk_level = "critical"
        reason = "موجودی کالا صفر شده است."
    elif min_stock > 0 and stock <= min_stock:
        risk_score = 85
        risk_level = "danger"
        reason = "موجودی به حداقل تعریف‌شده رسیده است."
    elif days_left is not None and days_left <= 7:
        risk_score = 80
        risk_level = "danger"
        reason = "با روند فروش فعلی، موجودی کمتر از یک هفته دوام دارد."
    elif days_left is not None and days_left <= 14:
        risk_score = 60
        risk_level = "warning"
        reason = "موجودی در دو هفته آینده ممکن است تمام شود."
    elif metrics.get("last_sale_date") is None and stock > 0:
        risk_score = 50
        risk_level = "dead_stock"
        reason = "برای این کالا فروش ثبت نشده و احتمال خواب سرمایه وجود دارد."
    elif metrics.get("days_without_sale") is not None and metrics.get("days_without_sale") > 60 and stock > 0:
        risk_score = 55
        risk_level = "slow"
        reason = "این کالا بیش از ۶۰ روز فروش نداشته است."

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "reason": reason,
        "days_left": round(days_left, 1) if days_left is not None else None,
        "forecast_need_30d": round(forecast_need_30, 2),
        "reorder_point": round(reorder_point, 2),
        "suggested_reorder_qty": suggested_reorder,
    }


def _abc_classification(items):
    total_value = sum(_safe_float(x.get("revenue_90d")) for x in items)
    if total_value <= 0:
        for item in items:
            item["abc_class"] = "C"
            item["abc_share_percent"] = 0
        return items

    sorted_items = sorted(items, key=lambda x: _safe_float(x.get("revenue_90d")), reverse=True)
    cumulative = 0
    for item in sorted_items:
        cumulative += _safe_float(item.get("revenue_90d"))
        share = cumulative / total_value * 100
        item["abc_share_percent"] = round(_safe_float(item.get("revenue_90d")) / total_value * 100, 2)
        if share <= 80:
            item["abc_class"] = "A"
        elif share <= 95:
            item["abc_class"] = "B"
        else:
            item["abc_class"] = "C"
    return sorted_items


@router.get("/overview")
def smart_inventory_overview(
    request: Request,
    days: int = 90,
    lead_time_days: int = 7,
    branch_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
):
    """Company-scoped (fixing a real cross-tenant leak: this endpoint
    previously queried every Product with no company_id filter at all -
    every caller downstream had to defensively re-filter by their own
    product ids, which only protected THEIR OWN response, not this HTTP
    endpoint itself). branch_id/warehouse_id additionally narrow `stock`
    to that scope using the real Product x Warehouse breakdown (see
    _scoped_stock_map) - company-wide totals stay available via
    company_stock on every item."""
    company_id = current_company_id(request)
    db: Session = SessionLocal()
    try:
        products = db.query(Product).filter(Product.company_id == company_id).order_by(Product.id.desc()).all()
        scoped_stock = _scoped_stock_map(db, company_id, [p.id for p in products], branch_id, warehouse_id)
        items = []
        for product in products:
            base = _product_dict(product, scoped_stock.get(product.id) if scoped_stock else None)
            metrics = _sales_metrics(db, product.id, days=days)
            risk = _risk_for_product(base, metrics, lead_time_days=lead_time_days)
            items.append({**base, **metrics, **risk})

        items = _abc_classification(items)
        low_stock = [x for x in items if x.get("risk_level") in ["critical", "danger", "warning"]]
        dead_stock = [x for x in items if x.get("risk_level") in ["dead_stock", "slow"]]
        reorder_plan = [x for x in items if _safe_float(x.get("suggested_reorder_qty")) > 0]
        reorder_plan.sort(key=lambda x: (_safe_float(x.get("risk_score")), _safe_float(x.get("suggested_reorder_qty"))), reverse=True)

        stock_value_buy = sum(_safe_float(x.get("stock_value_buy")) for x in items)
        stock_value_sell = sum(_safe_float(x.get("stock_value_sell")) for x in items)
        revenue_90d = sum(_safe_float(x.get("revenue_90d")) for x in items)

        insights = []
        if low_stock:
            insights.append({
                "type": "danger",
                "title": "ریسک کمبود موجودی",
                "message": f"{len(low_stock)} کالا نیاز به بررسی فوری موجودی دارد.",
                "action": "برنامه سفارش مجدد را بررسی کن.",
            })
        if dead_stock:
            insights.append({
                "type": "warning",
                "title": "خواب سرمایه در انبار",
                "message": f"{len(dead_stock)} کالا فروش کند یا بدون فروش دارد.",
                "action": "برای این کالاها تخفیف، باندل یا توقف خرید تعریف کن.",
            })
        if stock_value_sell > 0:
            insights.append({
                "type": "info",
                "title": "ارزش فروش موجودی",
                "message": f"ارزش فروش موجودی فعلی حدود {stock_value_sell:,.0f} است.",
                "action": "کالاهای کلاس A را همیشه در موجودی امن نگه دار.",
            })
        if not insights:
            insights.append({
                "type": "success",
                "title": "انبار پایدار است",
                "message": "هشدار جدی در موجودی و گردش کالا دیده نشد.",
                "action": "پایش روزانه ادامه پیدا کند.",
            })

        result = {
            "summary": {
                "products_count": len(items),
                "low_stock_count": len(low_stock),
                "dead_stock_count": len(dead_stock),
                "reorder_count": len(reorder_plan),
                "stock_value_buy": stock_value_buy,
                "stock_value_sell": stock_value_sell,
                "potential_profit": stock_value_sell - stock_value_buy,
                "revenue_90d": revenue_90d,
            },
            "items": items,
            "low_stock": low_stock[:30],
            "dead_stock": dead_stock[:30],
            "reorder_plan": reorder_plan[:50],
            "abc": {
                "A": [x for x in items if x.get("abc_class") == "A"][:30],
                "B": [x for x in items if x.get("abc_class") == "B"][:30],
                "C": [x for x in items if x.get("abc_class") == "C"][:30],
            },
            "insights": insights,
            "scope": {
                "branch_id": branch_id,
                "warehouse_id": warehouse_id,
                "note": (
                    "Stock figures are scoped to this branch/warehouse; sales-velocity and reorder-quantity math still use company-wide sales history (no per-branch sales attribution is available for this computation)."
                    if scoped_stock else
                    "Company-wide stock (no branch/warehouse scope requested)."
                ),
            },
        }
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@router.get("/reorder-plan")
def reorder_plan(request: Request, days: int = 90, lead_time_days: int = 7, branch_id: Optional[int] = None, warehouse_id: Optional[int] = None):
    data = smart_inventory_overview(request, days=days, lead_time_days=lead_time_days, branch_id=branch_id, warehouse_id=warehouse_id)
    if isinstance(data, dict) and data.get("status") == "error":
        return data
    return {"items": data.get("reorder_plan", []), "summary": data.get("summary", {}), "scope": data.get("scope")}


@router.get("/product/{product_id}/insight")
def product_inventory_insight(product_id: int, request: Request, days: int = 90, lead_time_days: int = 7, branch_id: Optional[int] = None, warehouse_id: Optional[int] = None):
    company_id = current_company_id(request)
    db: Session = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id, Product.company_id == company_id).first()
        if not product:
            db.close()
            return {"status": "error", "message": "Product not found"}
        scoped_stock = _scoped_stock_map(db, company_id, [product.id], branch_id, warehouse_id)
        base = _product_dict(product, scoped_stock.get(product.id) if scoped_stock else None)
        metrics = _sales_metrics(db, product.id, days=days)
        risk = _risk_for_product(base, metrics, lead_time_days=lead_time_days)
        db.close()
        return {"product": {**base, **metrics, **risk}}
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}
