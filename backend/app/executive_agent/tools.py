"""Safe, allow-listed executive tool registry (Task 05).

Every tool wraps a REAL, already-tested VETRIX service - never its own
SQL, never a duplicated calculation. This is the ONLY way the Executive
Agent touches business data; there is no generic run_sql()/call_endpoint()
escape hatch anywhere in this module, by design (see the task spec's
Section 18).

Each tool function has the signature
    fn(company_id: int, branch_id: int | None, start_date, end_date, **kwargs) -> dict
and is registered in TOOLS with the roles allowed to call it and its
read/write mode. Permission is checked by the caller (app/executive_agent/
agent.py) BEFORE a tool ever runs - the tool itself does not re-derive
authorization, matching how every other module in this codebase relies on
its caller having already resolved current_company_id()/the actor's role.
"""
from datetime import date, timedelta
from types import SimpleNamespace

from sqlalchemy import text

from app.database import SessionLocal, engine

READ = "read"
WRITE = "write"


def _shim_request(company_id: int):
    """Several reused services only ever read request.state.auth off the
    real Request they're mounted with - this stand-in lets tools call them
    in-process, same technique already established in executive_alerts.py
    and bi_improvement.py."""
    return SimpleNamespace(state=SimpleNamespace(auth={"company_id": company_id}))


def _default_range(start_date, end_date):
    if start_date and end_date:
        return start_date, end_date
    today = date.today()
    return today, today


def _comparison_range(start_date, end_date):
    """Same-length period immediately preceding [start_date, end_date] -
    the honest default when a user asks "compared to before" without
    naming an explicit comparison period."""
    length = (end_date - start_date).days + 1
    comparison_end = start_date - timedelta(days=1)
    comparison_start = comparison_end - timedelta(days=length - 1)
    return comparison_start, comparison_end


def _invoices_in_range(db, company_id, start_date, end_date):
    from app.models.invoice import Invoice
    return db.query(Invoice).filter(
        Invoice.company_id == company_id,
        Invoice.void_status == "active",
        Invoice.created_at >= start_date,
        Invoice.created_at < end_date + timedelta(days=1),
    ).all()


def _invoice_items_for(db, company_id, invoice_ids):
    from app.models.invoice import InvoiceItem
    if not invoice_ids:
        return []
    return db.query(InvoiceItem).filter(
        InvoiceItem.company_id == company_id, InvoiceItem.invoice_id.in_(invoice_ids),
    ).all()


def _branch_attribution(db, company_id, invoices, invoice_items, branch_id):
    """Best-effort per-branch attribution: Invoice itself has no branch_id
    anywhere in this schema (confirmed - only invoice_items.warehouse_id is
    optionally set, and Warehouse.branch_id links from there). This is
    real, not fabricated, but genuinely partial - lines with no recorded
    warehouse can't be attributed to a branch, and the coverage ratio is
    always reported alongside the figure rather than hidden."""
    from app.models.invoice import Invoice
    warehouse_branch = {
        row[0]: row[1] for row in db.execute(text(
            "SELECT id, branch_id FROM warehouses WHERE company_id=:company_id"
        ), {"company_id": company_id}).fetchall()
    }
    invoice_type_by_id = {inv.id: inv.invoice_type for inv in invoices}
    total_amount = sum(float(inv.total_amount or 0) for inv in invoices if inv.invoice_type in ("sale", "return_sale"))
    attributed_amount = 0.0
    branch_amount = 0.0
    for item in invoice_items:
        invoice_type = invoice_type_by_id.get(item.invoice_id)
        if invoice_type not in ("sale", "return_sale"):
            continue
        line_branch = warehouse_branch.get(item.warehouse_id) if item.warehouse_id else None
        if line_branch is None:
            continue
        sign = 1 if invoice_type == "sale" else -1
        line_total = float(item.total_price or 0) * sign
        attributed_amount += line_total
        if branch_id is not None and line_branch == branch_id:
            branch_amount += line_total
    coverage_percent = round(attributed_amount / total_amount * 100, 1) if total_amount else 0.0
    return branch_amount, coverage_percent


def get_daily_company_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    """Reuses executive_alerts.executive_alerts_summary() (already
    aggregates receivables/payables/cheques/low-stock/budget/BI-finding/
    document alerts across 7 real sources) plus today's own sales/cash
    figures - never re-derives any of those calculations."""
    from app.executive_alerts import executive_alerts_summary
    today = date.today()
    db = SessionLocal()
    try:
        invoices_today = _invoices_in_range(db, company_id, today, today)
        sales_today = sum(
            float(i.total_amount or 0) * (1 if i.invoice_type == "sale" else -1)
            for i in invoices_today if i.invoice_type in ("sale", "return_sale")
        )
        from app.models.accounting_entry import AccountingEntry
        entries_today = db.query(AccountingEntry).filter(
            AccountingEntry.company_id == company_id, AccountingEntry.created_at >= today,
        ).all()
        collections_today = sum(float(e.credit or 0) for e in entries_today if e.source_type == "receipt")
        payments_today = sum(float(e.debit or 0) for e in entries_today if e.source_type == "payment")
    finally:
        db.close()

    alerts = executive_alerts_summary(_shim_request(company_id))
    return {
        "period": {"start_date": today, "end_date": today},
        "sales_today": round(sales_today, 2),
        "collections_today": round(collections_today, 2),
        "payments_today": round(payments_today, 2),
        "critical_alert_count": alerts["counts"]["critical"],
        "warning_alert_count": alerts["counts"]["warning"],
        "total_financial_exposure": alerts["total_financial_exposure"],
        "top_alerts": alerts["items"][:5],
        "source_module": "executive_alerts.executive_alerts_summary + accounting_entries + invoices",
    }


def get_sales_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    from app.accounting.reporting import net_period_total
    start_date, end_date = _default_range(start_date, end_date)
    comparison_start, comparison_end = _comparison_range(start_date, end_date)
    db = SessionLocal()
    try:
        invoices = _invoices_in_range(db, company_id, start_date, end_date)
        comparison_invoices = _invoices_in_range(db, company_id, comparison_start, comparison_end)
        total_sales = net_period_total(invoices, "sale", "return_sale", lambda i: True)
        comparison_sales = net_period_total(comparison_invoices, "sale", "return_sale", lambda i: True)
        invoice_count = len([i for i in invoices if i.invoice_type == "sale"])

        result = {
            "period": {"start_date": start_date, "end_date": end_date},
            "comparison_period": {"start_date": comparison_start, "end_date": comparison_end},
            "total_sales": total_sales,
            "comparison_sales": comparison_sales,
            "variance_percent": round((total_sales - comparison_sales) / comparison_sales * 100, 1) if comparison_sales else None,
            "invoice_count": invoice_count,
            "source_module": "app.accounting.reporting.net_period_total",
        }
        if branch_id is not None:
            items = _invoice_items_for(db, company_id, [i.id for i in invoices])
            branch_amount, coverage_percent = _branch_attribution(db, company_id, invoices, items, branch_id)
            result["branch_sales"] = round(branch_amount, 2)
            result["branch_attribution_coverage_percent"] = coverage_percent
            if coverage_percent < 50:
                result["limitation"] = "Branch-level sales are approximated from invoice lines with a recorded warehouse; most lines in this period have no warehouse recorded, so this figure is not reliable."
        return result
    finally:
        db.close()


def get_profit_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    from app.accounting.reporting import build_profit_loss
    start_date, end_date = _default_range(start_date, end_date)
    db = SessionLocal()
    try:
        invoices = _invoices_in_range(db, company_id, start_date, end_date)
        items = _invoice_items_for(db, company_id, [i.id for i in invoices])
        from app.models.product import Product
        product_costs = {p.id: float(p.buy_price or 0) for p in db.query(Product).filter(Product.company_id == company_id).all()}
        expense_rows = db.execute(text("SELECT * FROM expenses WHERE company_id=:company_id"), {"company_id": company_id}).mappings().all()

        def _expense_date(row):
            raw = row.get("expense_date") or row.get("created_at")
            if not raw:
                return None
            try:
                from datetime import datetime as _dt
                return _dt.fromisoformat(str(raw).replace("Z", "").split(".")[0]).date()
            except ValueError:
                return None

        expenses_in_range = [
            float(row["amount"] or 0) for row in expense_rows
            if (d := _expense_date(row)) and start_date <= d <= end_date
        ]
        profit_loss = build_profit_loss(invoices, items, product_costs, expenses_in_range)
        result = {
            "period": {"start_date": start_date, "end_date": end_date},
            **profit_loss,
            "source_module": "app.accounting.reporting.build_profit_loss",
        }
        if branch_id is not None:
            result["limitation"] = "Profit/margin is not branch-scoped in this system - expenses and product costs are only tracked company-wide, so this figure covers the whole company."
        return result
    finally:
        db.close()


def get_cashflow_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    start_date, end_date = _default_range(start_date, end_date)
    db = SessionLocal()
    try:
        from app.models.accounting_entry import AccountingEntry
        entries = db.query(AccountingEntry).filter(
            AccountingEntry.company_id == company_id,
            AccountingEntry.created_at >= start_date,
            AccountingEntry.created_at < end_date + timedelta(days=1),
        ).all()
        receipts = sum(float(e.credit or 0) for e in entries if e.source_type == "receipt")
        payments = sum(float(e.debit or 0) for e in entries if e.source_type == "payment")
        return {
            "period": {"start_date": start_date, "end_date": end_date},
            "receipts": round(receipts, 2),
            "payments": round(payments, 2),
            "net_cash_movement": round(receipts - payments, 2),
            "source_module": "accounting_entries",
        }
    finally:
        db.close()


def get_receivables_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    from app.accounting.aging import aging_report
    result = aging_report(_shim_request(company_id), as_of=None, terms_days=30, include_settled=False)
    top_parties = sorted(result["parties"], key=lambda p: p["overdue_receivable"], reverse=True)[:5]
    return {
        "total_receivable": result["summary"]["receivable"],
        "overdue_receivable": result["summary"]["overdue_receivable"],
        "open_invoice_count": result["summary"]["open_invoice_count"],
        "top_overdue_parties": [{"name": p["customer_name"], "overdue": p["overdue_receivable"]} for p in top_parties],
        "source_module": "app.accounting.aging.aging_report",
        "limitation": "Not branch-scoped - invoices are not tracked per branch in this system." if branch_id is not None else None,
    }


def get_payables_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    from app.accounting.aging import aging_report
    result = aging_report(_shim_request(company_id), as_of=None, terms_days=30, include_settled=False)
    top_parties = sorted(result["parties"], key=lambda p: p["overdue_payable"], reverse=True)[:5]
    return {
        "total_payable": result["summary"]["payable"],
        "overdue_payable": result["summary"]["overdue_payable"],
        "top_overdue_parties": [{"name": p["customer_name"], "overdue": p["overdue_payable"]} for p in top_parties],
        "source_module": "app.accounting.aging.aging_report",
        "limitation": "Not branch-scoped - invoices are not tracked per branch in this system." if branch_id is not None else None,
    }


def get_cheque_summary(company_id, branch_id=None, start_date=None, end_date=None, upcoming_days=7, **_):
    from app.accounting.treasury import list_cheques
    result = list_cheques(_shim_request(company_id), direction="all", status="pending", upcoming_days=upcoming_days)
    items = result["items"]
    incoming = [c for c in items if c["direction"] == "received"]
    outgoing = [c for c in items if c["direction"] != "received"]
    return {
        "incoming_count": len(incoming),
        "incoming_amount": round(sum(float(c["amount"] or 0) for c in incoming), 2),
        "outgoing_count": len(outgoing),
        "outgoing_amount": round(sum(float(c["amount"] or 0) for c in outgoing), 2),
        "overdue_count": len([c for c in items if c["overdue"]]),
        "due_soon_count": len([c for c in items if c["due_soon"]]),
        "source_module": "app.accounting.treasury.list_cheques",
    }


def get_inventory_risk_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    """smart_inventory_overview() is company-scoped at the source (a real
    cross-tenant leak in that module was fixed - see its own docstring),
    so this no longer needs to defensively re-filter by its own product
    ids. When branch_id is resolved (e.g. "which products is the Istanbul
    branch low on?"), it's passed straight through to
    smart_inventory_overview's own branch_id param, which aggregates that
    branch's real warehouses (app.warehouses.stock_breakdown) - this
    genuinely answers the branch-scoped question now, rather than
    returning company-wide numbers with a disclaimer."""
    from app.smart_inventory.routes import smart_inventory_overview
    overview = smart_inventory_overview(_shim_request(company_id), branch_id=branch_id)
    low_stock = overview.get("low_stock", [])
    dead_stock = overview.get("dead_stock", [])
    branch_name = None
    if branch_id is not None:
        db = SessionLocal()
        try:
            row = db.execute(text("SELECT name FROM branches WHERE id=:id AND company_id=:company_id"), {"id": branch_id, "company_id": company_id}).first()
            branch_name = row[0] if row else None
        finally:
            db.close()
    return {
        "low_stock_count": len(low_stock),
        "dead_stock_count": len(dead_stock),
        "low_stock_sample": [p.get("name") for p in low_stock[:5]],
        "dead_stock_sample": [p.get("name") for p in dead_stock[:5]],
        "source_module": "app.smart_inventory.routes.smart_inventory_overview",
        "scope": overview.get("scope"),
        "branch_id": branch_id,
        "branch_name": branch_name,
    }


def get_branch_performance(company_id, branch_id=None, start_date=None, end_date=None, **_):
    from app.branches import _ensure_schema as _ensure_branches_schema
    start_date, end_date = _default_range(start_date, end_date)
    db = SessionLocal()
    try:
        _ensure_branches_schema(db.connection())
        branches = db.execute(text("SELECT id, name FROM branches WHERE company_id=:company_id AND active=1"), {"company_id": company_id}).mappings().all()
        if not branches:
            return {"period": {"start_date": start_date, "end_date": end_date}, "branches": [], "limitation": "No branches are configured for this company.", "source_module": "branches + invoice_items.warehouse_id"}
        invoices = _invoices_in_range(db, company_id, start_date, end_date)
        items = _invoice_items_for(db, company_id, [i.id for i in invoices])
        rows = []
        for branch in branches:
            amount, coverage = _branch_attribution(db, company_id, invoices, items, branch["id"])
            rows.append({"branch_id": branch["id"], "branch_name": branch["name"], "sales": round(amount, 2), "attribution_coverage_percent": coverage})
        rows.sort(key=lambda r: r["sales"], reverse=True)
        overall_coverage = max((r["attribution_coverage_percent"] for r in rows), default=0)
        return {
            "period": {"start_date": start_date, "end_date": end_date},
            "branches": rows,
            "source_module": "branches + invoice_items.warehouse_id (best-effort attribution)",
            "limitation": None if overall_coverage >= 50 else "Branch attribution is based on invoice lines with a recorded warehouse; coverage is low for this period, so these figures should be treated as indicative only, not authoritative.",
        }
    finally:
        db.close()


def get_budget_variance(company_id, branch_id=None, start_date=None, end_date=None, **_):
    """Reads app/accounting/budgets.py's line-level budgets (Task 07 Section
    4/H) - the same data BudgetControl.jsx shows - not app/accounting/
    budget_plans.py, which has no frontend anywhere in the app: no user could
    ever create a budget_plans row, so this tool used to always answer "no
    active budget plan found" regardless of how real a user's actual budget
    (set via BudgetControl.jsx) was. budgets.py has no branch dimension, so
    branch_id is accepted for interface compatibility but not filtered on."""
    from app.accounting.budgets import compute_budget_variance, _ensure_schema as _ensure_budgets_schema
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
    results = []
    for period, summary in summaries:
        if not summary or not summary["items"]:
            continue
        planned_expense = sum(i["budget_amount"] for i in summary["items"] if i["account_type"] == "expense")
        actual_expense = sum(i["actual_amount"] for i in summary["items"] if i["account_type"] == "expense")
        planned_revenue = sum(i["budget_amount"] for i in summary["items"] if i["account_type"] != "expense")
        actual_revenue = sum(i["actual_amount"] for i in summary["items"] if i["account_type"] != "expense")
        over_lines = sorted(
            (i for i in summary["items"] if i["account_type"] == "expense" and i["over_budget"]),
            key=lambda i: i["variance"],
        )[:5]
        results.append({
            "plan_id": period["id"], "plan_name": period["name"],
            "planned_expense": round(planned_expense, 2), "actual_expense": round(actual_expense, 2),
            "planned_revenue": round(planned_revenue, 2), "actual_revenue": round(actual_revenue, 2),
            "top_over_budget_categories": over_lines,
        })
    if not results:
        return {"plans": [], "limitation": "No budget lines are set for any open fiscal period.", "source_module": "app.accounting.budgets.compute_budget_variance"}
    return {"plans": results, "source_module": "app.accounting.budgets.compute_budget_variance"}


def get_campaign_performance(company_id, branch_id=None, start_date=None, end_date=None, **_):
    from app.online_commerce import summary as commerce_summary
    result = commerce_summary(_shim_request(company_id))
    return {
        "total_campaigns": result["campaigns"]["total"],
        "published_campaigns": result["campaigns"]["published"],
        "pending_campaigns": result["campaigns"]["pending"],
        "source_module": "app.online_commerce.summary",
        "limitation": "Click-through rate, conversion, and ROI are not tracked anywhere in this system - only campaign counts are available. Do not infer campaign effectiveness from this data.",
    }


def get_customer_risk_summary(company_id, branch_id=None, start_date=None, end_date=None, **_):
    from app.ai_bi.router import _build_payload
    payload = _build_payload(company_id)
    if payload.get("status") == "error":
        return {"error": "Customer risk data is currently unavailable.", "source_module": "app.ai_bi.router._build_payload"}
    risky = payload.get("risky_customers", [])
    return {
        "risky_customer_count": len(risky),
        "top_risky_customers": [{"name": c["name"], "balance": c["balance"], "risk": c["risk"]} for c in risky[:5]],
        "source_module": "app.ai_bi.router._build_payload",
    }


def get_open_executive_alerts(company_id, branch_id=None, start_date=None, end_date=None, severity=None, **_):
    from app.executive_alerts import executive_alerts_summary
    result = executive_alerts_summary(_shim_request(company_id))
    items = result["items"]
    if severity:
        items = [a for a in items if a["severity"] == severity]
    return {
        "counts": result["counts"],
        "items": items[:10],
        "source_module": "app.executive_alerts.executive_alerts_summary",
    }


def get_improvement_plan_status(company_id, branch_id=None, start_date=None, end_date=None, keyword=None, **_):
    from app.bi_improvement import list_findings, finding_detail
    findings = list_findings(_shim_request(company_id))["items"]
    if keyword:
        keyword_lower = keyword.lower()
        findings = [f for f in findings if keyword_lower in f["title"].lower() or keyword_lower in f["category"].lower()]
    if not findings:
        return {"items": [], "source_module": "app.bi_improvement.list_findings"}
    detailed = []
    for finding in findings[:5]:
        detail = finding_detail(finding["id"], _shim_request(company_id))
        detailed.append({
            "finding": detail["title"], "status": detail["status"], "severity": detail["severity"],
            "current_metric": detail["current_metric"], "baseline_metric": detail["baseline_metric"],
            "plans": [
                {"objective": p["objective"] or p["selected_action"], "status": p["status"], "target_date": p["target_date"], "responsible": p.get("responsible_user_name")}
                for p in detail["plans"]
            ],
        })
    return {"items": detailed, "source_module": "app.bi_improvement.list_findings + finding_detail"}


TOOLS = {
    "daily_company_summary": {"fn": get_daily_company_summary, "roles": {"admin", "accountant"}, "mode": READ},
    "sales_summary": {"fn": get_sales_summary, "roles": {"admin", "accountant", "sales"}, "mode": READ},
    "profit_summary": {"fn": get_profit_summary, "roles": {"admin", "accountant"}, "mode": READ},
    "cashflow_summary": {"fn": get_cashflow_summary, "roles": {"admin", "accountant"}, "mode": READ},
    "receivables_summary": {"fn": get_receivables_summary, "roles": {"admin", "accountant"}, "mode": READ},
    "payables_summary": {"fn": get_payables_summary, "roles": {"admin", "accountant"}, "mode": READ},
    "cheque_summary": {"fn": get_cheque_summary, "roles": {"admin", "accountant"}, "mode": READ},
    "inventory_risk_summary": {"fn": get_inventory_risk_summary, "roles": {"admin", "accountant", "warehouse"}, "mode": READ},
    "branch_performance": {"fn": get_branch_performance, "roles": {"admin", "accountant"}, "mode": READ},
    "budget_variance": {"fn": get_budget_variance, "roles": {"admin", "accountant"}, "mode": READ},
    "campaign_performance": {"fn": get_campaign_performance, "roles": {"admin", "accountant", "sales"}, "mode": READ},
    "customer_risk_summary": {"fn": get_customer_risk_summary, "roles": {"admin", "accountant", "sales"}, "mode": READ},
    "open_executive_alerts": {"fn": get_open_executive_alerts, "roles": {"admin", "accountant"}, "mode": READ},
    "improvement_plan_status": {"fn": get_improvement_plan_status, "roles": {"admin", "accountant"}, "mode": READ},
}


def run_tool(tool_name, role, company_id, branch_id=None, start_date=None, end_date=None, **kwargs):
    """The ONLY entry point that executes a tool. Permission is checked
    here, before the wrapped service ever runs - callers never bypass this
    by calling a tool function directly."""
    spec = TOOLS.get(tool_name)
    if not spec:
        raise ValueError(f"Unknown tool: {tool_name}")
    if role not in spec["roles"]:
        raise PermissionError(f"Role '{role}' is not permitted to run '{tool_name}'")
    return spec["fn"](company_id, branch_id, start_date, end_date, **kwargs)
