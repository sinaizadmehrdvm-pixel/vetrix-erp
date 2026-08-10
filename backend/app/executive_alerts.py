"""Executive Alerts / Daily Situation Review - Task 02 Section 8.

Pure aggregation, deliberately: every number here is computed by an
existing, already-tested endpoint (aging.py's receivables/payables,
treasury.py's cheques, smart_inventory's low-stock overview) called
directly as plain Python functions rather than duplicated. The only new
logic is: (1) a small per-company threshold table so "large receivable" /
"days before due" are configurable, and (2) turning those three existing
result shapes into one flat, severity-ranked list a landing panel can
render without knowing about accounting/treasury/inventory internals.

Read/dismiss state is deliberately NOT tracked server-side: the task spec
explicitly says viewing an item must never hide it from the full Alerts
Center, and a session-only "dismiss the panel" is a pure frontend/
sessionStorage concern (see ExecutiveAlerts.jsx) - persisting a fake
"acknowledged" flag here would imply resolution state this module has no
authority over.

smart_inventory_overview() itself queries every Product with no company_id
filter (a pre-existing characteristic of that module, left untouched here
per this task's "don't rewrite working code" rule) - its low_stock items
are filtered down to this company's own product ids below so this
admin-facing summary never leaks another company's stock data.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.accounting.aging import aging_report
from app.accounting.treasury import list_cheques
from app.company_scope import current_company_id
from app.database import SessionLocal, engine
from app.models.product import Product
from app.smart_inventory.routes import smart_inventory_overview

router = APIRouter(prefix="/api/executive-alerts", tags=["Executive Alerts"])

DEFAULT_ALERT_DAYS_BEFORE_DUE = 3
DEFAULT_MINIMUM_RECEIVABLE_AMOUNT = 0


def _shim_request(company_id: int):
    """aging_report/list_cheques only ever read request.state.auth off the
    real Request they're mounted with - this minimal stand-in lets us call
    them directly, in-process, with this endpoint's own already-authorized
    company_id, instead of re-deriving their SQL."""
    return SimpleNamespace(state=SimpleNamespace(auth={"company_id": company_id}))


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS executive_alert_settings (
            company_id INTEGER PRIMARY KEY,
            alert_days_before_due INTEGER NOT NULL DEFAULT 3,
            minimum_receivable_amount FLOAT NOT NULL DEFAULT 0,
            updated_at VARCHAR NOT NULL
        )
    """))


def _get_settings(company_id: int) -> dict:
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("""
            SELECT * FROM executive_alert_settings WHERE company_id=:company_id
        """), {"company_id": company_id}).mappings().first()
    if not row:
        return {
            "alert_days_before_due": DEFAULT_ALERT_DAYS_BEFORE_DUE,
            "minimum_receivable_amount": DEFAULT_MINIMUM_RECEIVABLE_AMOUNT,
        }
    return {"alert_days_before_due": row["alert_days_before_due"], "minimum_receivable_amount": row["minimum_receivable_amount"]}


class SettingsUpdate(BaseModel):
    alert_days_before_due: int = DEFAULT_ALERT_DAYS_BEFORE_DUE
    minimum_receivable_amount: float = DEFAULT_MINIMUM_RECEIVABLE_AMOUNT


@router.get("/settings")
def get_alert_settings(request: Request):
    return _get_settings(current_company_id(request))


@router.put("/settings")
def update_alert_settings(data: SettingsUpdate, request: Request):
    if data.alert_days_before_due < 0:
        raise HTTPException(status_code=400, detail="alert_days_before_due cannot be negative")
    if data.minimum_receivable_amount < 0:
        raise HTTPException(status_code=400, detail="minimum_receivable_amount cannot be negative")
    company_id = current_company_id(request)
    now = datetime.now(timezone.utc).isoformat()
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            INSERT INTO executive_alert_settings (company_id, alert_days_before_due, minimum_receivable_amount, updated_at)
            VALUES (:company_id, :days, :amount, :now)
            ON CONFLICT(company_id) DO UPDATE SET
              alert_days_before_due=excluded.alert_days_before_due,
              minimum_receivable_amount=excluded.minimum_receivable_amount,
              updated_at=excluded.updated_at
        """), {"company_id": company_id, "days": data.alert_days_before_due, "amount": data.minimum_receivable_amount, "now": now})
    return _get_settings(company_id)


def _receivable_payable_alerts(company_id: int, settings: dict) -> list:
    result = aging_report(_shim_request(company_id), as_of=None, terms_days=30, include_settled=False)
    alerts = []
    for item in result["items"]:
        if item["side"] == "receivable" and item["outstanding_amount"] < settings["minimum_receivable_amount"]:
            continue
        if item["days_overdue"] > 0:
            severity = "critical" if item["days_overdue"] >= 30 else "warning"
        elif item["days_overdue"] == 0:
            severity = "info"
        else:
            continue  # not due yet and not overdue - only surface due/overdue items, not the entire open book
        alerts.append({
            "category": item["side"],  # receivable / payable
            "severity": severity,
            "title": item["customer_name"],
            "amount": item["outstanding_amount"],
            "due_date": item["due_date"],
            "days_overdue": item["days_overdue"],
            "related_id": item["customer_id"],
            "related_type": "customer",
            "invoice_id": item["invoice_id"],
            "quick_action": "record_payment" if item["side"] == "receivable" else "view_receivable",
        })
    return alerts


def _cheque_alerts(company_id: int, settings: dict) -> list:
    result = list_cheques(_shim_request(company_id), direction="all", status="pending", upcoming_days=settings["alert_days_before_due"])
    alerts = []
    for item in result["items"]:
        if item["overdue"]:
            severity = "critical"
        elif item["due_soon"]:
            severity = "warning"
        else:
            continue
        category = "cheque_in" if item["direction"] == "received" else "cheque_out"
        alerts.append({
            "category": category,
            "severity": severity,
            "title": f"{item['customer_name']} - #{item['cheque_number']}",
            "amount": item["amount"],
            "due_date": item["due_date"],
            "days_overdue": max(0, -item["days_to_due"]),
            "related_id": item["id"],
            "related_type": "cheque",
            "quick_action": "open_cheque",
        })
    return alerts


def _low_stock_alerts(company_id: int) -> list:
    with SessionLocal() as db:
        own_product_ids = {row[0] for row in db.query(Product.id).filter(Product.company_id == company_id).all()}
    result = smart_inventory_overview()
    alerts = []
    for item in result.get("low_stock", []):
        if item["id"] not in own_product_ids:
            continue
        risk = item.get("risk_level")
        severity = "critical" if risk in ("critical", "danger") else "warning"
        alerts.append({
            "category": "low_stock",
            "severity": severity,
            "title": item.get("name"),
            "amount": item.get("stock"),
            "due_date": None,
            "days_overdue": 0,
            "related_id": item["id"],
            "related_type": "product",
            "risk_level": risk,
            "quick_action": "view_stock" if item.get("suggested_reorder_qty") in (None, 0) else "create_purchase_order",
        })
    return alerts


@router.get("/summary")
def executive_alerts_summary(request: Request):
    company_id = current_company_id(request)
    settings = _get_settings(company_id)

    receivable_payable = _receivable_payable_alerts(company_id, settings)
    cheques = _cheque_alerts(company_id, settings)
    low_stock = _low_stock_alerts(company_id)

    all_alerts = receivable_payable + cheques + low_stock
    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    all_alerts.sort(key=lambda a: (severity_rank.get(a["severity"], 3), -(a.get("amount") or 0)))

    total_exposure = sum(a["amount"] or 0 for a in all_alerts if a["category"] in ("receivable", "payable", "cheque_in", "cheque_out"))
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "settings": settings,
        "counts": {
            "critical": len([a for a in all_alerts if a["severity"] == "critical"]),
            "warning": len([a for a in all_alerts if a["severity"] == "warning"]),
            "info": len([a for a in all_alerts if a["severity"] == "info"]),
            "total": len(all_alerts),
        },
        "total_financial_exposure": total_exposure,
        "items": all_alerts,
    }
