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
DEFAULT_BUDGET_USAGE_ALERT_PERCENT = 80


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
    columns = {row[1] for row in conn.execute(text("PRAGMA table_info(executive_alert_settings)")).fetchall()}
    if "budget_usage_alert_percent" not in columns:
        conn.execute(text("ALTER TABLE executive_alert_settings ADD COLUMN budget_usage_alert_percent INTEGER NOT NULL DEFAULT 80"))


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
            "budget_usage_alert_percent": DEFAULT_BUDGET_USAGE_ALERT_PERCENT,
        }
    return {
        "alert_days_before_due": row["alert_days_before_due"],
        "minimum_receivable_amount": row["minimum_receivable_amount"],
        "budget_usage_alert_percent": row["budget_usage_alert_percent"],
    }


class SettingsUpdate(BaseModel):
    alert_days_before_due: int = DEFAULT_ALERT_DAYS_BEFORE_DUE
    minimum_receivable_amount: float = DEFAULT_MINIMUM_RECEIVABLE_AMOUNT
    budget_usage_alert_percent: int = DEFAULT_BUDGET_USAGE_ALERT_PERCENT


@router.get("/settings")
def get_alert_settings(request: Request):
    return _get_settings(current_company_id(request))


@router.put("/settings")
def update_alert_settings(data: SettingsUpdate, request: Request):
    if data.alert_days_before_due < 0:
        raise HTTPException(status_code=400, detail="alert_days_before_due cannot be negative")
    if data.minimum_receivable_amount < 0:
        raise HTTPException(status_code=400, detail="minimum_receivable_amount cannot be negative")
    if not 0 < data.budget_usage_alert_percent <= 200:
        raise HTTPException(status_code=400, detail="budget_usage_alert_percent must be between 1 and 200")
    company_id = current_company_id(request)
    now = datetime.now(timezone.utc).isoformat()
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            INSERT INTO executive_alert_settings (company_id, alert_days_before_due, minimum_receivable_amount, budget_usage_alert_percent, updated_at)
            VALUES (:company_id, :days, :amount, :budget_percent, :now)
            ON CONFLICT(company_id) DO UPDATE SET
              alert_days_before_due=excluded.alert_days_before_due,
              minimum_receivable_amount=excluded.minimum_receivable_amount,
              budget_usage_alert_percent=excluded.budget_usage_alert_percent,
              updated_at=excluded.updated_at
        """), {"company_id": company_id, "days": data.alert_days_before_due, "amount": data.minimum_receivable_amount, "budget_percent": data.budget_usage_alert_percent, "now": now})
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


def _low_stock_item_alert(item, branch=None):
    risk = item.get("risk_level")
    severity = "critical" if risk in ("critical", "danger") else "warning"
    title = item.get("name")
    if branch:
        title = f"{title} — {branch['name']}"
    return {
        "category": "low_stock",
        "severity": severity,
        "title": title,
        "amount": item.get("stock"),
        "threshold": item.get("min_stock"),
        "due_date": None,
        "days_overdue": 0,
        "related_id": item["id"],
        "related_type": "product",
        "risk_level": risk,
        "branch_id": branch["id"] if branch else None,
        "branch_name": branch["name"] if branch else None,
        "quick_action": "view_stock" if item.get("suggested_reorder_qty") in (None, 0) else "create_purchase_order",
    }


def _low_stock_alerts(company_id: int) -> list:
    """smart_inventory_overview() is now itself company-scoped (a real
    cross-tenant leak - it used to query every Product with no company_id
    filter at all - was fixed at the source; see that module's own
    docstring), so this no longer needs to defensively re-filter by its
    own product ids the way it did before.

    For a multi-branch company, alerts are computed PER BRANCH instead of
    once company-wide, so a stock-out isolated to one branch is actually
    visible (a company-wide total can look healthy while one branch is
    empty) - deliberately either/or, never both, so the same underlying
    shortage never produces two alerts for the same admin to triage."""
    from app.branches import _ensure_schema as _ensure_branches_schema

    with SessionLocal() as db:
        conn = db.connection()
        _ensure_branches_schema(conn)
        branches = conn.execute(
            text("SELECT id, name FROM branches WHERE company_id=:company_id AND active=1"),
            {"company_id": company_id},
        ).mappings().all()

    alerts = []
    if len(branches) > 1:
        for branch in branches:
            result = smart_inventory_overview(_shim_request(company_id), branch_id=branch["id"])
            for item in result.get("low_stock", []):
                alerts.append(_low_stock_item_alert(item, branch))
    else:
        result = smart_inventory_overview(_shim_request(company_id))
        for item in result.get("low_stock", []):
            alerts.append(_low_stock_item_alert(item))
    return alerts


def _budget_alerts(company_id: int, settings: dict) -> list:
    """Reuses app/accounting/budgets.py's own compute_budget_variance (Task 07
    Section 4/H) for every open fiscal period that has budget lines - an
    over-budget expense category or a usage_percent past the configurable
    threshold becomes a real alert, not a decorative one, since it's the
    exact same numbers BudgetControl.jsx itself shows. This used to read
    app/accounting/budget_plans.py instead, which has no frontend anywhere in
    the app, so no user could ever create a row there - this alert was
    silently a permanent no-op regardless of how far over budget a real
    user's real budget went."""
    from app.accounting.budgets import compute_budget_variance, _ensure_schema as _ensure_budgets_schema

    threshold = settings["budget_usage_alert_percent"]
    alerts = []
    with engine.begin() as conn:
        _ensure_budgets_schema(conn)
        periods = conn.execute(text("""
            SELECT DISTINCT fp.id, fp.name FROM fiscal_periods fp
            JOIN accounting_budgets b ON b.fiscal_period_id = fp.id AND b.company_id = fp.company_id
            WHERE fp.company_id=:company_id AND fp.status='open'
        """), {"company_id": company_id}).mappings().all()
        summaries = [
            (period, compute_budget_variance(conn, company_id, period["id"]))
            for period in periods
        ]
    for period, summary in summaries:
        if not summary or not summary["items"]:
            continue
        planned_expense = sum(i["budget_amount"] for i in summary["items"] if i["account_type"] == "expense")
        actual_expense = sum(i["actual_amount"] for i in summary["items"] if i["account_type"] == "expense")
        usage_percent = (actual_expense / planned_expense * 100) if planned_expense else (100.0 if actual_expense else 0.0)
        if usage_percent < threshold:
            continue
        severity = "critical" if usage_percent >= 100 else "warning"
        alerts.append({
            "category": "budget",
            "severity": severity,
            "title": period["name"],
            "amount": round(actual_expense - planned_expense, 2),
            "due_date": None,
            "days_overdue": 0,
            "related_id": period["id"],
            "related_type": "fiscal_period",
            "usage_percent": round(usage_percent, 1),
            "quick_action": "view_budget_control",
        })
    return alerts


def _bi_improvement_alerts(company_id: int, settings: dict) -> list:
    """5th alert source (Task 04, Section 16) - critical open BI findings
    and overdue improvement-plan tasks, computed by bi_improvement.py and
    wrapped here unchanged, same reuse-not-duplicate pattern as the other
    four sources above."""
    from app.bi_improvement import bi_action_plan_alerts
    return bi_action_plan_alerts(company_id, settings["alert_days_before_due"])


def _company_document_alerts(company_id: int, settings: dict) -> list:
    """6th alert source (Task 04, Section 17) - company documents (tax,
    license, registration...) nearing or past their real expiry_date."""
    from app.company_profile import company_document_alerts
    return company_document_alerts(company_id, settings["alert_days_before_due"])


def _employee_document_alerts(company_id: int, settings: dict) -> list:
    """7th alert source (Task 04, Section 18) - HR documents (contracts,
    licenses, certifications...) nearing or past their real expiry_date."""
    from app.hr import employee_document_alerts
    return employee_document_alerts(company_id, settings["alert_days_before_due"])


@router.get("/summary")
def executive_alerts_summary(request: Request):
    company_id = current_company_id(request)
    settings = _get_settings(company_id)

    receivable_payable = _receivable_payable_alerts(company_id, settings)
    cheques = _cheque_alerts(company_id, settings)
    low_stock = _low_stock_alerts(company_id)
    budget = _budget_alerts(company_id, settings)
    improvement = _bi_improvement_alerts(company_id, settings)
    documents = _company_document_alerts(company_id, settings)
    employee_documents = _employee_document_alerts(company_id, settings)

    all_alerts = receivable_payable + cheques + low_stock + budget + improvement + documents + employee_documents
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
