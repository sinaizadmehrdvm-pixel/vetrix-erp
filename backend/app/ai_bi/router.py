from fastapi import APIRouter
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models.customer import Customer
from app.models.product import Product
from app.models.invoice import Invoice, InvoiceItem
from app.models.accounting_entry import AccountingEntry
from app.ai_bi.anomaly_detection import detect_anomalies
from app.ai_bi.cashflow_forecast import build_cashflow_forecast
from app.settings_routes import get_or_create_settings

router = APIRouter(prefix="/api/ai-bi", tags=["AI Business Intelligence"])


def _num(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _month_start():
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1)


def _previous_month_start():
    now = datetime.utcnow()
    year = now.year
    month = now.month - 1
    if month == 0:
        month = 12
        year -= 1
    return datetime(year, month, 1)


def _pct_change(current, previous):
    current = _num(current)
    previous = _num(previous)
    if abs(previous) < 0.0001:
        return 100.0 if current > 0 else 0.0
    return ((current - previous) / abs(previous)) * 100


def _invoice_amounts(invoices):
    sales = sum(_num(i.total_amount) for i in invoices if i.invoice_type == "sale")
    buys = sum(_num(i.total_amount) for i in invoices if i.invoice_type == "buy")
    returns_sale = sum(_num(i.total_amount) for i in invoices if i.invoice_type == "return_sale")
    returns_buy = sum(_num(i.total_amount) for i in invoices if i.invoice_type == "return_buy")
    net_sales = sales - returns_sale
    net_purchases = buys - returns_buy
    gross_profit = net_sales - net_purchases
    return {
        "sales": sales,
        "purchases": buys,
        "sales_returns": returns_sale,
        "purchase_returns": returns_buy,
        "net_sales": net_sales,
        "net_purchases": net_purchases,
        "gross_profit": gross_profit,
    }


def _settlement(db: Session, invoice):
    total = _num(invoice.total_amount)
    receipt_entries = db.query(AccountingEntry).filter(
        AccountingEntry.source_type == "receipt",
        AccountingEntry.source_id == invoice.id,
    ).all()
    payment_entries = db.query(AccountingEntry).filter(
        AccountingEntry.source_type == "payment",
        AccountingEntry.source_id == invoice.id,
    ).all()
    received = sum(_num(e.credit) for e in receipt_entries)
    paid = sum(_num(e.debit) for e in payment_entries)
    settled = received if invoice.invoice_type in ["sale", "return_buy"] else paid if invoice.invoice_type in ["buy", "return_sale"] else 0
    remaining = max(total - settled, 0)
    return {"settled": settled, "remaining": remaining}


def _customer_balance(db: Session, customer_id: int):
    entries = db.query(AccountingEntry).filter(AccountingEntry.customer_id == customer_id).all()
    return sum(_num(e.debit) - _num(e.credit) for e in entries)


def _build_payload():
    db = SessionLocal()
    try:
        invoices = db.query(Invoice).all()
        customers = db.query(Customer).all()
        products = db.query(Product).all()
        entries = db.query(AccountingEntry).all()

        now = datetime.utcnow()
        month_start = _month_start()
        prev_month_start = _previous_month_start()
        current_month_invoices = [i for i in invoices if i.created_at and i.created_at >= month_start]
        previous_month_invoices = [i for i in invoices if i.created_at and prev_month_start <= i.created_at < month_start]

        all_amounts = _invoice_amounts(invoices)
        current_amounts = _invoice_amounts(current_month_invoices)
        prev_amounts = _invoice_amounts(previous_month_invoices)

        cash_receipts = sum(_num(e.credit) for e in entries if e.source_type == "receipt")
        cash_payments = sum(_num(e.debit) for e in entries if e.source_type == "payment")
        net_cash = cash_receipts - cash_payments

        open_invoices = []
        overdue_like = []
        for inv in invoices:
            if inv.invoice_type == "proforma":
                continue
            st = _settlement(db, inv)
            if st["remaining"] > 0:
                customer = db.query(Customer).filter(Customer.id == inv.customer_id).first() if inv.customer_id else None
                age_days = (now - inv.created_at).days if inv.created_at else 0
                row = {
                    "invoice_id": inv.id,
                    "customer_id": inv.customer_id,
                    "customer_name": customer.name if customer else "",
                    "invoice_type": inv.invoice_type,
                    "total_amount": _num(inv.total_amount),
                    "remaining_amount": st["remaining"],
                    "age_days": age_days,
                    "created_at": inv.created_at,
                }
                open_invoices.append(row)
                if age_days >= 30:
                    overdue_like.append(row)

        low_stock = []
        dead_stock = []
        product_sales = {}
        for item, inv in db.query(InvoiceItem, Invoice).join(Invoice, InvoiceItem.invoice_id == Invoice.id).all():
            if inv.invoice_type == "sale":
                product_sales[item.product_id] = product_sales.get(item.product_id, 0) + _num(item.quantity)

        for product in products:
            stock = _num(getattr(product, "stock", 0))
            min_stock = _num(getattr(product, "min_stock", 0))
            price = _num(getattr(product, "price", 0))
            sold_qty = product_sales.get(product.id, 0)
            item = {
                "id": product.id,
                "name": getattr(product, "name", "") or "",
                "stock": stock,
                "min_stock": min_stock,
                "price": price,
                "stock_value": stock * price,
                "sold_qty": sold_qty,
            }
            if (min_stock > 0 and stock <= min_stock) or (min_stock == 0 and stock <= 2):
                low_stock.append(item)
            if stock > 0 and sold_qty <= 0:
                dead_stock.append(item)

        customer_rows = []
        for customer in customers:
            balance = _customer_balance(db, customer.id)
            sales_amount = sum(_num(i.total_amount) for i in invoices if i.customer_id == customer.id and i.invoice_type == "sale")
            invoice_count = len([i for i in invoices if i.customer_id == customer.id])
            last_invoice = max([i.created_at for i in invoices if i.customer_id == customer.id and i.created_at], default=None)
            days_since = (now - last_invoice).days if last_invoice else None
            score = 50
            if sales_amount > 0:
                score += min(30, sales_amount / 10000000)
            if balance > 0:
                score -= min(25, balance / 10000000)
            if days_since is not None and days_since > 60:
                score -= 15
            customer_rows.append({
                "id": customer.id,
                "name": customer.name,
                "phone": getattr(customer, "phone", "") or "",
                "balance": balance,
                "sales_amount": sales_amount,
                "invoice_count": invoice_count,
                "last_invoice": last_invoice,
                "days_since_last_invoice": days_since,
                "score": max(0, min(100, score)),
                "risk": "high" if balance > 0 and (days_since or 0) > 45 else "medium" if balance > 0 else "low",
            })

        top_customers = sorted(customer_rows, key=lambda x: x["sales_amount"], reverse=True)[:10]
        risky_customers = sorted([c for c in customer_rows if c["risk"] != "low"], key=lambda x: x["balance"], reverse=True)[:10]
        top_products = sorted([{"id": p.id, "name": p.name, "sold_qty": product_sales.get(p.id, 0), "stock": _num(getattr(p, "stock", 0))} for p in products], key=lambda x: x["sold_qty"], reverse=True)[:10]

        alerts = []
        recommendations = []

        if current_amounts["gross_profit"] < 0:
            alerts.append({"level": "danger", "title": "سود ناخالص منفی", "message": "خریدها و برگشتی‌ها از فروش ثبت‌شده بیشتر شده‌اند.", "action": "گزارش سود و خرید را بررسی کن."})
        if len(low_stock) > 0:
            alerts.append({"level": "danger", "title": "ریسک کمبود موجودی", "message": f"{len(low_stock)} کالا به نقطه هشدار موجودی رسیده‌اند.", "action": "لیست سفارش مجدد بساز."})
        if len(overdue_like) > 0:
            alerts.append({"level": "warning", "title": "مطالبات معوق", "message": f"{len(overdue_like)} فاکتور بیش از ۳۰ روز مانده باز دارد.", "action": "پیگیری وصول مطالبات را شروع کن."})
        if net_cash < 0:
            alerts.append({"level": "warning", "title": "جریان نقدی منفی", "message": "پرداختی‌ها از دریافتی‌ها بیشتر است.", "action": "پرداخت‌های غیرضروری را کنترل کن."})
        if not alerts:
            alerts.append({"level": "success", "title": "وضعیت پایدار", "message": "هشدار بحرانی در فروش، نقدینگی و موجودی دیده نشد.", "action": "پایش روزانه را ادامه بده."})

        if len(dead_stock) > 0:
            recommendations.append({"type": "inventory", "title": "کالاهای راکد", "text": f"{len(dead_stock)} کالا موجودی دارند اما فروش ثبت‌شده ندارند.", "impact": "کاهش خواب سرمایه"})
        if current_amounts["net_sales"] < prev_amounts["net_sales"]:
            recommendations.append({"type": "sales", "title": "افت فروش نسبت به ماه قبل", "text": "فروش ماه جاری کمتر از ماه قبل است. روی مشتریان فعال و کالاهای پرفروش تمرکز کن.", "impact": "افزایش فروش"})
        if risky_customers:
            recommendations.append({"type": "crm", "title": "پیگیری مشتریان بدهکار", "text": "برای مشتریان پرریسک یادآور تماس و برنامه وصول مطالبات بساز.", "impact": "بهبود نقدینگی"})
        if not recommendations:
            recommendations.append({"type": "growth", "title": "فرصت رشد", "text": "داده‌ها پایدار است؛ روی کمپین فروش مجدد مشتریان قبلی تمرکز کن.", "impact": "رشد درآمد"})

        health_score = 100
        if current_amounts["gross_profit"] < 0:
            health_score -= 25
        if net_cash < 0:
            health_score -= 15
        health_score -= min(20, len(low_stock) * 3)
        health_score -= min(20, len(overdue_like) * 2)
        if current_amounts["net_sales"] == 0:
            health_score -= 15
        health_score = max(0, min(100, health_score))

        payload = {
            "generated_at": now.isoformat(),
            "health_score": health_score,
            "kpis": {
                "net_sales": all_amounts["net_sales"],
                "net_purchases": all_amounts["net_purchases"],
                "gross_profit": all_amounts["gross_profit"],
                "current_month_sales": current_amounts["net_sales"],
                "previous_month_sales": prev_amounts["net_sales"],
                "sales_growth_percent": _pct_change(current_amounts["net_sales"], prev_amounts["net_sales"]),
                "cash_receipts": cash_receipts,
                "cash_payments": cash_payments,
                "net_cashflow": net_cash,
                "open_invoices_amount": sum(i["remaining_amount"] for i in open_invoices),
                "open_invoices_count": len(open_invoices),
                "low_stock_count": len(low_stock),
                "dead_stock_count": len(dead_stock),
                "customers_count": len(customers),
                "products_count": len(products),
            },
            "alerts": alerts,
            "recommendations": recommendations,
            "top_customers": top_customers,
            "risky_customers": risky_customers,
            "top_products": top_products,
            "low_stock_products": low_stock[:20],
            "dead_stock_products": dead_stock[:20],
            "open_invoices": sorted(open_invoices, key=lambda x: x["remaining_amount"], reverse=True)[:20],
            "narrative": _build_narrative(health_score, current_amounts, prev_amounts, low_stock, overdue_like, net_cash),
        }
        db.close()
        return payload
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


def _build_narrative(health_score, current_amounts, prev_amounts, low_stock, overdue_like, net_cash):
    parts = []
    if health_score >= 75:
        parts.append("وضعیت کلی کسب‌وکار پایدار و قابل قبول است.")
    elif health_score >= 45:
        parts.append("وضعیت کسب‌وکار نیازمند پیگیری مدیریتی است.")
    else:
        parts.append("وضعیت کسب‌وکار در محدوده پرریسک قرار دارد و باید فوری بررسی شود.")

    growth = _pct_change(current_amounts.get("net_sales"), prev_amounts.get("net_sales"))
    if growth > 0:
        parts.append(f"فروش ماه جاری نسبت به ماه قبل حدود {growth:.1f} درصد رشد داشته است.")
    elif growth < 0:
        parts.append(f"فروش ماه جاری نسبت به ماه قبل حدود {abs(growth):.1f} درصد کاهش داشته است.")
    else:
        parts.append("تغییر قابل توجهی در فروش ماه جاری نسبت به ماه قبل دیده نمی‌شود.")

    if low_stock:
        parts.append(f"{len(low_stock)} کالا در وضعیت هشدار موجودی قرار دارد.")
    if overdue_like:
        parts.append(f"{len(overdue_like)} فاکتور باز نیازمند پیگیری وصول مطالبات است.")
    if net_cash < 0:
        parts.append("جریان نقدی خالص منفی است و باید پرداخت‌ها کنترل شوند.")
    return " ".join(parts)


@router.get("/summary")
def ai_bi_summary():
    return _build_payload()


@router.get("/alerts")
def ai_bi_alerts():
    payload = _build_payload()
    return {"items": payload.get("alerts", [])}


@router.get("/recommendations")
def ai_bi_recommendations():
    payload = _build_payload()
    return {"items": payload.get("recommendations", [])}


@router.get("/anomalies")
def ai_bi_anomalies():
    db = SessionLocal()
    try:
        settings = get_or_create_settings(db)
        anomalies = detect_anomalies(db, time_zone_name=settings.time_zone or "UTC")
        return {
            "items": anomalies,
            "counts": {
                "high": sum(1 for item in anomalies if item["severity"] == "high"),
                "medium": sum(1 for item in anomalies if item["severity"] == "medium"),
                "low": sum(1 for item in anomalies if item["severity"] == "low"),
            },
        }
    finally:
        db.close()


@router.get("/cashflow-forecast")
def ai_bi_cashflow_forecast(days: int = 30):
    days = max(1, min(days, 180))
    db = SessionLocal()
    try:
        return build_cashflow_forecast(db, horizon_days=days)
    finally:
        db.close()
