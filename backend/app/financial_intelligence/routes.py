from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from app.database import SessionLocal
from app.models.customer import Customer
from app.models.product import Product
from app.models.invoice import Invoice, InvoiceItem
from app.models.accounting_entry import AccountingEntry

router = APIRouter(tags=["Financial Intelligence"])


class ScenarioRequest(BaseModel):
    sales_growth_percent: float = 0
    purchase_cost_change_percent: float = 0
    selling_price_change_percent: float = 0
    expense_change_percent: float = 0
    collection_improvement_percent: float = 0


def db_session():
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


def f(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def days_ago(days: int):
    return datetime.utcnow() - timedelta(days=days)


def safe_date(value):
    if not value:
        return None
    if hasattr(value, "date"):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "").replace("T", " ")[:19])
    except Exception:
        return None


def expense_total(db: Session, days: Optional[int] = None):
    try:
        if days is None:
            row = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM expenses")).first()
        else:
            since = days_ago(days).isoformat()
            row = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE created_at >= :since OR expense_date >= :since"), {"since": since}).first()
        return f(row[0] if row else 0)
    except Exception:
        return 0.0


def invoice_metrics(db: Session, days: Optional[int] = None):
    query = db.query(Invoice)
    if days is not None:
        query = query.filter(Invoice.created_at >= days_ago(days))
    invoices = query.all()

    sales = sum(f(i.total_amount) for i in invoices if i.invoice_type == "sale")
    purchases = sum(f(i.total_amount) for i in invoices if i.invoice_type == "buy")
    returns = sum(f(i.total_amount) for i in invoices if i.invoice_type in ["return_sale", "return_buy"])
    open_amount = sum(f(i.total_amount) for i in invoices if str(i.payment_status or "").lower() != "paid" and i.invoice_type == "sale")
    paid_amount = sum(f(i.total_amount) for i in invoices if str(i.payment_status or "").lower() == "paid" and i.invoice_type == "sale")
    return {
        "sales": sales,
        "purchases": purchases,
        "returns": returns,
        "open_amount": open_amount,
        "paid_amount": paid_amount,
        "invoice_count": len(invoices),
    }


def product_profitability(db: Session):
    rows = []
    products = {p.id: p for p in db.query(Product).all()}
    items = db.query(InvoiceItem, Invoice).join(Invoice, InvoiceItem.invoice_id == Invoice.id).all()
    grouped = {}
    for item, invoice in items:
        if invoice.invoice_type != "sale":
            continue
        product = products.get(item.product_id)
        key = item.product_id
        if key not in grouped:
            grouped[key] = {
                "product_id": key,
                "name": product.name if product else f"Product {key}",
                "qty": 0,
                "revenue": 0,
                "cost": 0,
                "profit": 0,
            }
        qty = f(item.quantity)
        unit = f(item.unit_price)
        cost_unit = f(product.buy_price if product else 0)
        revenue = f(item.total_price) or qty * unit
        cost = qty * cost_unit
        grouped[key]["qty"] += qty
        grouped[key]["revenue"] += revenue
        grouped[key]["cost"] += cost
        grouped[key]["profit"] += revenue - cost

    for row in grouped.values():
        row["margin_percent"] = round((row["profit"] / row["revenue"] * 100), 2) if row["revenue"] else 0
        rows.append(row)
    return sorted(rows, key=lambda x: x["profit"], reverse=True)


def customer_profitability(db: Session):
    customers = {c.id: c for c in db.query(Customer).all()}
    invoices = db.query(Invoice).all()
    grouped = {}
    for inv in invoices:
        cid = inv.customer_id
        if not cid:
            continue
        if cid not in grouped:
            c = customers.get(cid)
            grouped[cid] = {
                "customer_id": cid,
                "name": c.name if c else f"Customer {cid}",
                "sales": 0,
                "purchases": 0,
                "open_amount": 0,
                "invoice_count": 0,
                "last_invoice_date": None,
            }
        if inv.invoice_type == "sale":
            grouped[cid]["sales"] += f(inv.total_amount)
            grouped[cid]["invoice_count"] += 1
            if str(inv.payment_status or "").lower() != "paid":
                grouped[cid]["open_amount"] += f(inv.total_amount)
        if inv.invoice_type == "buy":
            grouped[cid]["purchases"] += f(inv.total_amount)
        current_date = safe_date(inv.created_at)
        old_date = grouped[cid]["last_invoice_date"]
        if current_date and (old_date is None or current_date > old_date):
            grouped[cid]["last_invoice_date"] = current_date

    result = []
    for row in grouped.values():
        profit = row["sales"] - row["purchases"]
        days_since = None
        if row["last_invoice_date"]:
            days_since = (datetime.utcnow() - row["last_invoice_date"]).days
        row["profit"] = profit
        row["ltv"] = row["sales"]
        row["days_since_last_purchase"] = days_since
        row["risk_level"] = "high" if row["open_amount"] > 0 and (days_since or 0) > 30 else "medium" if (days_since or 0) > 45 else "safe"
        row["segment"] = "VIP" if row["sales"] >= 10000000 else "Gold" if row["sales"] >= 3000000 else "Regular"
        row["last_invoice_date"] = row["last_invoice_date"].isoformat() if row["last_invoice_date"] else None
        result.append(row)
    return sorted(result, key=lambda x: x["sales"], reverse=True)


def cashflow_forecast(db: Session):
    entries = db.query(AccountingEntry).all()
    receivables = sum(f(e.debit) for e in entries if e.entry_type == "debit")
    payables = sum(f(e.credit) for e in entries if e.entry_type == "credit")
    open_sales = invoice_metrics(db).get("open_amount", 0)
    expenses_30 = expense_total(db, 30)
    avg_daily_expense = expenses_30 / 30 if expenses_30 else 0
    sales_30 = invoice_metrics(db, 30).get("sales", 0)
    avg_daily_collection = max(sales_30 / 30, 0)

    periods = []
    for days in [7, 30, 90]:
        expected_in = open_sales * min(0.75, days / 90) + avg_daily_collection * days * 0.35
        expected_out = avg_daily_expense * days + payables * min(0.5, days / 90)
        net = expected_in - expected_out
        periods.append({
            "days": days,
            "expected_inflow": round(expected_in, 0),
            "expected_outflow": round(expected_out, 0),
            "net_cashflow": round(net, 0),
            "risk": "shortage" if net < 0 else "stable" if net < expected_out * 0.25 else "healthy",
        })
    return {
        "receivables": round(receivables, 0),
        "payables": round(payables, 0),
        "open_sales": round(open_sales, 0),
        "periods": periods,
    }


def build_recommendations(summary, products, customers, forecast):
    recs = []
    if summary["net_profit"] < 0:
        recs.append({"level": "danger", "title": "هشدار زیان", "message": "سود خالص منفی است. هزینه‌ها و قیمت فروش را بررسی کنید.", "action": "بررسی هزینه‌ها و قیمت کالاها"})
    if forecast["periods"] and any(p["risk"] == "shortage" for p in forecast["periods"]):
        recs.append({"level": "warning", "title": "ریسک کسری نقدینگی", "message": "در یکی از بازه‌های آینده احتمال کسری نقدینگی دیده می‌شود.", "action": "وصول مطالبات و کنترل خرید"})
    low_margin = [p for p in products if p.get("revenue", 0) > 0 and p.get("margin_percent", 0) < 10]
    if low_margin:
        recs.append({"level": "warning", "title": "حاشیه سود پایین", "message": f"{len(low_margin)} کالا حاشیه سود پایین دارند.", "action": "افزایش قیمت یا مذاکره خرید"})
    risky_customers = [c for c in customers if c.get("risk_level") == "high"]
    if risky_customers:
        recs.append({"level": "danger", "title": "مشتریان پرریسک", "message": f"{len(risky_customers)} مشتری نیاز به پیگیری وصول دارند.", "action": "پیگیری تماس و دریافت"})
    if not recs:
        recs.append({"level": "success", "title": "وضعیت پایدار", "message": "شرایط مالی فعلی پایدار است. برای رشد، روی کالاهای پرفروش تمرکز کنید.", "action": "تقویت فروش کالاهای سودده"})
    return recs


@router.get("/overview")
def financial_overview():
    db = db_session()
    try:
        all_metrics = invoice_metrics(db)
        month_metrics = invoice_metrics(db, 30)
        expenses_all = expense_total(db)
        expenses_30 = expense_total(db, 30)
        products = product_profitability(db)
        customers = customer_profitability(db)
        forecast = cashflow_forecast(db)

        gross_profit = all_metrics["sales"] - all_metrics["purchases"]
        net_profit = gross_profit - expenses_all
        gross_margin = (gross_profit / all_metrics["sales"] * 100) if all_metrics["sales"] else 0
        net_margin = (net_profit / all_metrics["sales"] * 100) if all_metrics["sales"] else 0
        inventory_value = sum(f(p.stock) * f(p.buy_price) for p in db.query(Product).all())
        working_capital = forecast["receivables"] - forecast["payables"] + inventory_value

        summary = {
            "total_sales": round(all_metrics["sales"], 0),
            "sales_30d": round(month_metrics["sales"], 0),
            "total_purchases": round(all_metrics["purchases"], 0),
            "expenses_total": round(expenses_all, 0),
            "expenses_30d": round(expenses_30, 0),
            "gross_profit": round(gross_profit, 0),
            "net_profit": round(net_profit, 0),
            "gross_margin_percent": round(gross_margin, 2),
            "net_margin_percent": round(net_margin, 2),
            "inventory_value": round(inventory_value, 0),
            "working_capital": round(working_capital, 0),
            "open_receivables": forecast["open_sales"],
            "cash_health": "danger" if net_profit < 0 else "warning" if working_capital < 0 else "healthy",
        }

        sales_forecast = []
        avg_daily_sales = month_metrics["sales"] / 30 if month_metrics["sales"] else 0
        for days in [7, 30, 90]:
            sales_forecast.append({"days": days, "expected_sales": round(avg_daily_sales * days, 0)})

        return {
            "summary": summary,
            "cashflow": forecast,
            "product_profitability": products[:20],
            "customer_profitability": customers[:20],
            "sales_forecast": sales_forecast,
            "recommendations": build_recommendations(summary, products, customers, forecast),
            "kpis": {
                "roi_percent": round((net_profit / max(all_metrics["purchases"] + expenses_all, 1)) * 100, 2),
                "working_capital": round(working_capital, 0),
                "cash_ratio": round((forecast["receivables"] / max(forecast["payables"], 1)), 2),
                "top_customer": customers[0]["name"] if customers else "-",
                "top_product": products[0]["name"] if products else "-",
            },
        }
    finally:
        db.close()


@router.post("/simulate")
def simulate_scenario(payload: ScenarioRequest):
    db = db_session()
    try:
        overview = financial_overview()
        summary = overview["summary"]
        base_sales = f(summary["total_sales"])
        base_purchases = f(summary["total_purchases"])
        base_expenses = f(summary["expenses_total"])

        simulated_sales = base_sales * (1 + payload.sales_growth_percent / 100) * (1 + payload.selling_price_change_percent / 100)
        simulated_purchases = base_purchases * (1 + payload.purchase_cost_change_percent / 100)
        simulated_expenses = base_expenses * (1 + payload.expense_change_percent / 100)
        simulated_gross_profit = simulated_sales - simulated_purchases
        simulated_net_profit = simulated_gross_profit - simulated_expenses
        delta_profit = simulated_net_profit - f(summary["net_profit"])

        return {
            "base": summary,
            "scenario": payload.dict(),
            "result": {
                "simulated_sales": round(simulated_sales, 0),
                "simulated_purchases": round(simulated_purchases, 0),
                "simulated_expenses": round(simulated_expenses, 0),
                "simulated_gross_profit": round(simulated_gross_profit, 0),
                "simulated_net_profit": round(simulated_net_profit, 0),
                "profit_delta": round(delta_profit, 0),
                "status": "better" if delta_profit > 0 else "worse" if delta_profit < 0 else "neutral",
            },
        }
    finally:
        db.close()
