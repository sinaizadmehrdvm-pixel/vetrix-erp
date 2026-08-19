"""BI Improvement Action Plan & Follow-up Engine (Task 04, Section 16).

Turns EXISTING, already-computed BI signals into a structured
Finding -> Evidence -> Action Plan -> Owner -> Deadline -> Progress ->
Verification -> Outcome workflow. This module never invents a metric: every
detector below calls a real, already-tested function elsewhere in the
codebase (ai_bi's dashboard payload, accounting/aging's aging_report,
smart_inventory/product_batches' expiry list, budget_plans' plan_summary,
ai_bi/cashflow_forecast's run-rate projection) and only wraps the result in
a finding when a plain, documented, rule-based threshold is crossed. There
is no AI/ML here, matching every other "BI" module in this codebase.

Where a signal source has no built-in "current vs previous period" value
(dead/low stock counts, receivables overdue amount, risky-customer count),
this module keeps its own lightweight point-in-time snapshot
(bi_metric_snapshots) so a later recalculation can honestly report a trend
- comparing two real, already-computed numbers over time, not fabricating
a forecast.
"""
import json
from datetime import date as date_cls, datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import SessionLocal, engine

router = APIRouter(prefix="/api/bi-improvement", tags=["BI Improvement"])

CATEGORIES = {
    "receivables_aging", "sales_decline", "dead_stock", "low_stock",
    "customer_risk", "budget_variance", "expiring_stock", "cashflow_pressure",
}
SEVERITIES = {"info", "warning", "critical"}
FINDING_STATUSES = {
    "new", "acknowledged", "action_planned", "in_progress", "monitoring",
    "resolved", "reopened", "dismissed",
}
OPEN_FINDING_STATUSES = {"new", "acknowledged", "action_planned", "in_progress", "monitoring", "reopened"}
PLAN_STATUSES = {"draft", "pending_approval", "approved", "in_progress", "completed", "cancelled"}
TASK_STATUSES = {"pending", "in_progress", "done", "blocked"}
PRIORITIES = {"low", "medium", "high", "critical"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return date_cls.today().isoformat()


def _shim_request(company_id: int):
    """Several reused signal sources (aging_report, list_expiring_batches)
    only ever read request.state.auth off the real Request they're mounted
    with - this stand-in lets us call them in-process with this endpoint's
    own already-authorized company_id, same technique as
    executive_alerts.py's own _shim_request."""
    return SimpleNamespace(state=SimpleNamespace(auth={"company_id": company_id}))


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bi_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER,
            category VARCHAR NOT NULL,
            severity VARCHAR NOT NULL DEFAULT 'warning',
            title VARCHAR NOT NULL,
            description TEXT DEFAULT '',
            evidence_json TEXT DEFAULT '{}',
            evidence_source VARCHAR DEFAULT '',
            current_metric FLOAT,
            baseline_metric FLOAT,
            variance_percent FLOAT,
            detection_date VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'new',
            related_entity_type VARCHAR,
            related_entity_id INTEGER,
            source_module VARCHAR DEFAULT '',
            last_recalculated_at VARCHAR NOT NULL,
            dismissed_reason TEXT,
            resolution_note TEXT,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bi_action_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            finding_id INTEGER NOT NULL,
            objective TEXT DEFAULT '',
            recommended_action TEXT DEFAULT '',
            selected_action TEXT DEFAULT '',
            responsible_user_id INTEGER,
            start_date VARCHAR,
            target_date VARCHAR,
            priority VARCHAR NOT NULL DEFAULT 'medium',
            expected_result TEXT DEFAULT '',
            target_kpi VARCHAR DEFAULT '',
            baseline_kpi FLOAT,
            target_value FLOAT,
            notes TEXT DEFAULT '',
            requires_approval BOOLEAN NOT NULL DEFAULT 0,
            approval_request_id INTEGER,
            status VARCHAR NOT NULL DEFAULT 'draft',
            created_by INTEGER,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            FOREIGN KEY(finding_id) REFERENCES bi_findings(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bi_action_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            title VARCHAR NOT NULL,
            owner_user_id INTEGER,
            deadline VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'pending',
            progress_percent INTEGER NOT NULL DEFAULT 0,
            notes TEXT DEFAULT '',
            completion_date VARCHAR,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            FOREIGN KEY(plan_id) REFERENCES bi_action_plans(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bi_finding_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            finding_id INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            actor_user_id INTEGER,
            note TEXT DEFAULT '',
            before_value VARCHAR,
            after_value VARCHAR,
            created_at VARCHAR NOT NULL,
            company_id INTEGER,
            FOREIGN KEY(finding_id) REFERENCES bi_findings(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bi_metric_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category VARCHAR NOT NULL,
            metric_key VARCHAR NOT NULL,
            value FLOAT NOT NULL,
            recorded_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    for table in ("bi_findings", "bi_action_plans", "bi_action_tasks", "bi_finding_history", "bi_metric_snapshots"):
        ensure_company_id_column(conn, table)


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _log_history(conn, finding_id, event_type, actor_user_id, note, before_value, after_value, company_id):
    conn.execute(text("""
        INSERT INTO bi_finding_history (finding_id, event_type, actor_user_id, note, before_value, after_value, created_at, company_id)
        VALUES (:finding_id, :event_type, :actor_user_id, :note, :before_value, :after_value, :now, :company_id)
    """), {
        "finding_id": finding_id, "event_type": event_type, "actor_user_id": actor_user_id, "note": note or "",
        "before_value": None if before_value is None else str(before_value),
        "after_value": None if after_value is None else str(after_value),
        "now": _now(), "company_id": company_id,
    })


def _snapshot_diff(company_id, category, metric_key, value):
    """Reads the last recorded snapshot for this metric and records the new
    one, in one short-lived transaction. Deliberately NOT held open around
    any call into another module's own engine.begin()/SessionLocal (those
    each open their own connection) - nesting a nested write transaction on
    top of an already-open one is what causes SQLite's single-writer lock
    to raise "database is locked" under this codebase's SQLite setup."""
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("""
            SELECT value FROM bi_metric_snapshots
            WHERE company_id=:company_id AND category=:category AND metric_key=:metric_key
            ORDER BY id DESC LIMIT 1
        """), {"company_id": company_id, "category": category, "metric_key": metric_key}).scalar()
        baseline = None if row is None else float(row)
        conn.execute(text("""
            INSERT INTO bi_metric_snapshots (category, metric_key, value, recorded_at, company_id)
            VALUES (:category, :metric_key, :value, :now, :company_id)
        """), {"category": category, "metric_key": metric_key, "value": value, "now": _now(), "company_id": company_id})
        return baseline


def _variance_percent(current, baseline):
    if baseline in (None, 0):
        return None
    return round((current - baseline) / abs(baseline) * 100, 1)


# --------------------------------------------------------------------------
# Detectors - each returns a candidate dict (or None if nothing to report),
# built strictly from a real, already-computed signal elsewhere.
# --------------------------------------------------------------------------

def _detect_receivables_aging(company_id):
    from app.accounting.aging import aging_report
    result = aging_report(_shim_request(company_id), as_of=None, terms_days=30, include_settled=False)
    current = float(result["summary"]["overdue_receivable"] or 0)
    baseline = _snapshot_diff(company_id, "receivables_aging", "overdue_receivable", current)
    if current <= 0:
        return {"category": "receivables_aging", "current_metric": current, "clear": True}
    variance = _variance_percent(current, baseline)
    severity = "info"
    if variance is not None and variance >= 40:
        severity = "critical"
    elif variance is not None and variance >= 20:
        severity = "warning"
    elif variance is None and current > 0:
        severity = "warning"
    if severity == "info":
        return {"category": "receivables_aging", "current_metric": current, "clear": True}
    return {
        "category": "receivables_aging", "severity": severity,
        "title": "Overdue receivables increased" if variance else "Overdue receivables outstanding",
        "description": f"Overdue receivables now {current:,.0f}" + (f", up {variance}% from the last check." if variance else "."),
        "evidence": {"summary": result["summary"], "top_parties": sorted(result["parties"], key=lambda p: p["overdue_receivable"], reverse=True)[:5]},
        "evidence_source": "app.accounting.aging.aging_report",
        "current_metric": current, "baseline_metric": baseline, "variance_percent": variance,
        "related_entity_type": None, "related_entity_id": None, "source_module": "accounting.aging",
    }


def _detect_sales_decline(company_id):
    from app.ai_bi.router import _build_payload
    try:
        payload = _build_payload(company_id)
    except Exception:
        # A transient failure in this one BI computation must not abort the
        # whole recalculation sweep - the other detector categories still
        # need to run. _build_payload now raises on internal errors instead
        # of returning an {"status":"error"} sentinel (security fix: the
        # sentinel path used to leak str(exception) to any direct caller of
        # the payload), so this detector must catch it itself instead of
        # checking a return-value shape that can no longer occur.
        return None
    kpis = payload["kpis"]
    growth = kpis.get("sales_growth_percent")
    current = float(kpis.get("current_month_sales") or 0)
    previous = float(kpis.get("previous_month_sales") or 0)
    if previous <= 0 or growth is None or growth >= -10:
        return {"category": "sales_decline", "current_metric": current, "clear": True}
    severity = "critical" if growth <= -25 else "warning"
    return {
        "category": "sales_decline", "severity": severity,
        "title": "Sales declined vs. previous month",
        "description": f"Net sales this month are {current:,.0f} vs {previous:,.0f} last month ({growth}%).",
        "evidence": {"current_month_sales": current, "previous_month_sales": previous, "sales_growth_percent": growth},
        "evidence_source": "app.ai_bi.router._build_payload",
        "current_metric": current, "baseline_metric": previous, "variance_percent": growth,
        "related_entity_type": None, "related_entity_id": None, "source_module": "ai_bi",
    }


def _detect_dead_stock(company_id):
    from app.ai_bi.router import _build_payload
    try:
        payload = _build_payload(company_id)
    except Exception:
        # A transient failure in this one BI computation must not abort the
        # whole recalculation sweep - the other detector categories still
        # need to run. _build_payload now raises on internal errors instead
        # of returning an {"status":"error"} sentinel (security fix: the
        # sentinel path used to leak str(exception) to any direct caller of
        # the payload), so this detector must catch it itself instead of
        # checking a return-value shape that can no longer occur.
        return None
    kpis = payload["kpis"]
    count = int(kpis.get("dead_stock_count") or 0)
    products_count = max(1, int(kpis.get("products_count") or 1))
    ratio = round(count / products_count * 100, 1)
    baseline = _snapshot_diff(company_id, "dead_stock", "ratio_percent", ratio)
    if ratio < 10:
        return {"category": "dead_stock", "current_metric": ratio, "clear": True}
    severity = "critical" if ratio >= 25 else "warning"
    return {
        "category": "dead_stock", "severity": severity,
        "title": "Dead stock share is elevated",
        "description": f"{count} products ({ratio}% of catalog) have stock but zero sales in the tracked window.",
        "evidence": {"dead_stock_count": count, "products_count": products_count, "sample": payload.get("dead_stock_products", [])[:10]},
        "evidence_source": "app.ai_bi.router._build_payload",
        "current_metric": ratio, "baseline_metric": baseline, "variance_percent": _variance_percent(ratio, baseline),
        "related_entity_type": None, "related_entity_id": None, "source_module": "ai_bi",
    }


def _detect_low_stock(company_id):
    from app.ai_bi.router import _build_payload
    try:
        payload = _build_payload(company_id)
    except Exception:
        # A transient failure in this one BI computation must not abort the
        # whole recalculation sweep - the other detector categories still
        # need to run. _build_payload now raises on internal errors instead
        # of returning an {"status":"error"} sentinel (security fix: the
        # sentinel path used to leak str(exception) to any direct caller of
        # the payload), so this detector must catch it itself instead of
        # checking a return-value shape that can no longer occur.
        return None
    kpis = payload["kpis"]
    count = int(kpis.get("low_stock_count") or 0)
    baseline = _snapshot_diff(company_id, "low_stock", "count", count)
    if count < 5:
        return {"category": "low_stock", "current_metric": count, "clear": True}
    severity = "critical" if count >= 10 else "warning"
    return {
        "category": "low_stock", "severity": severity,
        "title": "Multiple products are low on stock",
        "description": f"{count} products are at or below their minimum stock level.",
        "evidence": {"low_stock_count": count, "sample": payload.get("low_stock_products", [])[:10]},
        "evidence_source": "app.ai_bi.router._build_payload",
        "current_metric": count, "baseline_metric": baseline, "variance_percent": _variance_percent(count, baseline),
        "related_entity_type": None, "related_entity_id": None, "source_module": "ai_bi",
    }


def _detect_customer_risk(company_id):
    from app.ai_bi.router import _build_payload
    try:
        payload = _build_payload(company_id)
    except Exception:
        # A transient failure in this one BI computation must not abort the
        # whole recalculation sweep - the other detector categories still
        # need to run. _build_payload now raises on internal errors instead
        # of returning an {"status":"error"} sentinel (security fix: the
        # sentinel path used to leak str(exception) to any direct caller of
        # the payload), so this detector must catch it itself instead of
        # checking a return-value shape that can no longer occur.
        return None
    risky = payload.get("risky_customers", [])
    count = len(risky)
    baseline = _snapshot_diff(company_id, "customer_risk", "count", count)
    if count < 3:
        return {"category": "customer_risk", "current_metric": count, "clear": True}
    severity = "critical" if count >= 8 else "warning"
    return {
        "category": "customer_risk", "severity": severity,
        "title": "Multiple customers are high-risk / overdue",
        "description": f"{count} customers currently carry an outstanding balance with a high/medium risk flag.",
        "evidence": {"risky_customers": risky[:10]},
        "evidence_source": "app.ai_bi.router._build_payload",
        "current_metric": count, "baseline_metric": baseline, "variance_percent": _variance_percent(count, baseline),
        "related_entity_type": None, "related_entity_id": None, "source_module": "ai_bi",
    }


def _detect_budget_variance(company_id):
    """Reads the SAME line-level budgets BudgetControl.jsx actually writes
    (app/accounting/budgets.py's accounting_budgets, via compute_budget_variance)
    - not app/accounting/budget_plans.py, which this used to read from despite
    no page in the app ever creating a budget_plans row, so this detector was
    silently a permanent no-op for every real user (Task 07 Section 4/H)."""
    from app.accounting.budgets import compute_budget_variance, _ensure_schema as _ensure_budgets_schema
    with engine.begin() as conn:
        _ensure_schema(conn)
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
    candidates = []
    for period, summary in summaries:
        if not summary or not summary["items"]:
            continue
        planned_expense = sum(i["budget_amount"] for i in summary["items"] if i["account_type"] == "expense")
        actual_expense = sum(i["actual_amount"] for i in summary["items"] if i["account_type"] == "expense")
        if planned_expense <= 0:
            continue
        over_ratio = round((actual_expense - planned_expense) / planned_expense * 100, 1)
        if over_ratio < 10:
            candidates.append({"category": "budget_variance", "current_metric": over_ratio, "clear": True,
                                "related_entity_id": period["id"]})
            continue
        severity = "critical" if over_ratio >= 25 else "warning"
        over_lines = sorted(
            (i for i in summary["items"] if i["account_type"] == "expense" and i["over_budget"]),
            key=lambda i: i["variance"],
        )[:5]
        candidates.append({
            "category": "budget_variance", "severity": severity,
            "title": f"Budget for period '{period['name']}' is over expense budget",
            "description": f"Actual expense is {actual_expense:,.0f} vs a planned {planned_expense:,.0f} ({over_ratio}% over).",
            "evidence": {"summary": summary["summary"], "top_over_budget_lines": over_lines},
            "evidence_source": "app.accounting.budgets.compute_budget_variance",
            "current_metric": over_ratio, "baseline_metric": 0.0, "variance_percent": over_ratio,
            "related_entity_type": "fiscal_period", "related_entity_id": period["id"], "source_module": "accounting.budgets",
            "branch_id": None,
        })
    return candidates


def _detect_expiring_stock(company_id):
    from app.product_batches import list_expiring_batches
    batches = list_expiring_batches(_shim_request(company_id), days=30)
    count = len(batches)
    if count == 0:
        return {"category": "expiring_stock", "current_metric": 0, "clear": True}
    within_7 = [b for b in batches if b.get("days_to_expiry") is not None and b["days_to_expiry"] <= 7]
    severity = "critical" if within_7 else ("warning" if count >= 10 else "info")
    if severity == "info":
        return {"category": "expiring_stock", "current_metric": count, "clear": True}
    return {
        "category": "expiring_stock", "severity": severity,
        "title": "Product batches are expiring soon",
        "description": f"{count} batches expire within 30 days" + (f", {len(within_7)} within 7 days." if within_7 else "."),
        "evidence": {"count": count, "within_7_days": len(within_7), "sample": batches[:10]},
        "evidence_source": "app.product_batches.list_expiring_batches",
        "current_metric": count, "baseline_metric": None, "variance_percent": None,
        "related_entity_type": None, "related_entity_id": None, "source_module": "product_batches",
    }


def _detect_cashflow_pressure(company_id):
    from app.ai_bi.cashflow_forecast import build_cashflow_forecast
    db = SessionLocal()
    try:
        result = build_cashflow_forecast(db, company_id, horizon_days=30)
    finally:
        db.close()
    current = float(result.get("current_net_cash") or 0)
    projected = float(result.get("trend_projected_net_cash") or 0)
    if projected >= 0:
        return {"category": "cashflow_pressure", "current_metric": projected, "clear": True}
    severity = "critical" if current < 0 else "warning"
    return {
        "category": "cashflow_pressure", "severity": severity,
        "title": "Cash flow pressure projected",
        "description": f"30-day trend-projected net cash is {projected:,.0f} (current: {current:,.0f}).",
        "evidence": {"current_net_cash": current, "trend_projected_net_cash": projected, "scheduled_net": result.get("scheduled_net")},
        "evidence_source": "app.ai_bi.cashflow_forecast.build_cashflow_forecast",
        "current_metric": projected, "baseline_metric": current, "variance_percent": _variance_percent(projected, current),
        "related_entity_type": None, "related_entity_id": None, "source_module": "ai_bi.cashflow_forecast",
    }


_SIMPLE_DETECTORS = [
    _detect_receivables_aging, _detect_sales_decline, _detect_dead_stock,
    _detect_low_stock, _detect_customer_risk, _detect_expiring_stock, _detect_cashflow_pressure,
]

RECOMMENDED_ACTIONS = {
    "receivables_aging": ["Contact top overdue customers", "Create collection tasks", "Review credit limits"],
    "sales_decline": ["Review pricing vs. competitors", "Launch a targeted promotion", "Contact top customers who slowed down"],
    "dead_stock": ["Run a clearance promotion", "Bundle with fast-moving products", "Reduce future purchase quantities"],
    "low_stock": ["Create purchase orders for affected products", "Review supplier lead times", "Adjust minimum stock levels"],
    "customer_risk": ["Contact top overdue customers", "Review and adjust credit limits", "Require partial prepayment on new orders"],
    "budget_variance": ["Review the over-budget expense categories", "Freeze discretionary spending for the category", "Revise the budget plan if the variance is structural"],
    "expiring_stock": ["Discount or bundle expiring batches", "Prioritize FIFO issuance", "Notify sales team of expiring stock"],
    "cashflow_pressure": ["Accelerate collections on open receivables", "Delay non-critical payments", "Arrange short-term financing"],
}


def _find_existing_open(conn, company_id, category, related_entity_id):
    row = conn.execute(text("""
        SELECT * FROM bi_findings
        WHERE company_id=:company_id AND category=:category
          AND (related_entity_id IS :related_entity_id OR related_entity_id=:related_entity_id)
          AND status IN ('new','acknowledged','action_planned','in_progress','monitoring','reopened')
        ORDER BY id DESC LIMIT 1
    """), {"company_id": company_id, "category": category, "related_entity_id": related_entity_id}).mappings().first()
    return dict(row) if row else None


def _find_latest_resolved(conn, company_id, category, related_entity_id):
    row = conn.execute(text("""
        SELECT * FROM bi_findings
        WHERE company_id=:company_id AND category=:category
          AND (related_entity_id IS :related_entity_id OR related_entity_id=:related_entity_id)
          AND status='resolved'
        ORDER BY id DESC LIMIT 1
    """), {"company_id": company_id, "category": category, "related_entity_id": related_entity_id}).mappings().first()
    return dict(row) if row else None


def _finding_has_target_plan(conn, finding_id):
    return conn.execute(text("""
        SELECT id, target_value, target_kpi FROM bi_action_plans
        WHERE finding_id=:finding_id AND target_value IS NOT NULL AND status NOT IN ('cancelled')
        ORDER BY id DESC LIMIT 1
    """), {"finding_id": finding_id}).mappings().first()


@router.post("/recalculate")
def recalculate_findings(request: Request):
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    created, updated, resolved = [], [], []

    with engine.begin() as conn:
        _ensure_schema(conn)

    # Evidence-gathering happens with NO connection of ours held open - each
    # detector calls into another module's own function, which opens its
    # own short-lived engine.begin()/SessionLocal. Holding our own
    # transaction open across those calls is what triggers SQLite's
    # single-writer "database is locked" error under this codebase's setup.
    candidates = []
    for detector in _SIMPLE_DETECTORS:
        result = detector(company_id)
        if result:
            candidates.append(result)
    for result in _detect_budget_variance(company_id):
        candidates.append(result)

    with engine.begin() as conn:
        _ensure_schema(conn)
        for candidate in candidates:
            category = candidate["category"]
            related_entity_id = candidate.get("related_entity_id")
            existing = _find_existing_open(conn, company_id, category, related_entity_id)

            if candidate.get("clear"):
                if existing:
                    plan_row = _finding_has_target_plan(conn, existing["id"])
                    if plan_row:
                        continue  # target-bearing plan exists - resolution handled by /resolve, not silently here
                    conn.execute(text("""
                        UPDATE bi_findings SET status='resolved', resolution_note=:note, current_metric=:metric,
                          last_recalculated_at=:now, updated_at=:now WHERE id=:id
                    """), {"note": "Underlying metric returned to normal range (no target was set).", "metric": candidate["current_metric"], "now": _now(), "id": existing["id"]})
                    _log_history(conn, existing["id"], "resolved", actor, "Auto-resolved: metric back below trigger threshold.", existing["status"], "resolved", company_id)
                    resolved.append(existing["id"])
                continue

            now = _now()
            if existing:
                conn.execute(text("""
                    UPDATE bi_findings SET current_metric=:current_metric, baseline_metric=:baseline_metric,
                      variance_percent=:variance_percent, severity=:severity, description=:description,
                      evidence_json=:evidence_json, last_recalculated_at=:now, updated_at=:now
                    WHERE id=:id
                """), {
                    "current_metric": candidate["current_metric"], "baseline_metric": candidate.get("baseline_metric"),
                    "variance_percent": candidate.get("variance_percent"), "severity": candidate["severity"],
                    "description": candidate["description"], "evidence_json": json.dumps(candidate["evidence"], default=str),
                    "now": now, "id": existing["id"],
                })
                _log_history(conn, existing["id"], "evidence_updated", actor, "Recalculated.", existing["current_metric"], candidate["current_metric"], company_id)
                updated.append(existing["id"])
                continue

            resolved_before = _find_latest_resolved(conn, company_id, category, related_entity_id)
            status = "reopened" if resolved_before else "new"
            result = conn.execute(text("""
                INSERT INTO bi_findings
                  (branch_id, category, severity, title, description, evidence_json, evidence_source,
                   current_metric, baseline_metric, variance_percent, detection_date, status,
                   related_entity_type, related_entity_id, source_module, last_recalculated_at,
                   created_at, updated_at, company_id)
                VALUES
                  (:branch_id, :category, :severity, :title, :description, :evidence_json, :evidence_source,
                   :current_metric, :baseline_metric, :variance_percent, :now, :status,
                   :related_entity_type, :related_entity_id, :source_module, :now, :now, :now, :company_id)
            """), {
                "branch_id": candidate.get("branch_id"), "category": category, "severity": candidate["severity"],
                "title": candidate["title"], "description": candidate["description"],
                "evidence_json": json.dumps(candidate["evidence"], default=str), "evidence_source": candidate["evidence_source"],
                "current_metric": candidate["current_metric"], "baseline_metric": candidate.get("baseline_metric"),
                "variance_percent": candidate.get("variance_percent"), "now": now, "status": status,
                "related_entity_type": candidate.get("related_entity_type"), "related_entity_id": related_entity_id,
                "source_module": candidate.get("source_module", ""), "company_id": company_id,
            })
            new_id = result.lastrowid
            _log_history(conn, new_id, status, actor, "Detected by recalculation.", None, candidate["current_metric"], company_id)
            created.append(new_id)

        return {"status": "recalculated", "created": created, "updated": updated, "resolved": resolved}


def _finding_row(conn, finding_id, company_id):
    row = conn.execute(text("""
        SELECT * FROM bi_findings WHERE id=:id AND company_id=:company_id
    """), {"id": finding_id, "company_id": company_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Finding not found")
    return dict(row)


def _finding_to_dict(row):
    item = dict(row)
    try:
        item["evidence"] = json.loads(item.pop("evidence_json") or "{}")
    except (TypeError, ValueError):
        item["evidence"] = {}
    item["recommended_actions"] = RECOMMENDED_ACTIONS.get(item["category"], [])
    return item


@router.get("/findings")
def list_findings(request: Request, status: str = "", severity: str = "", category: str = "", branch_id: int | None = None):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        clauses = ["company_id=:company_id"]
        params = {"company_id": company_id}
        if status:
            clauses.append("status=:status")
            params["status"] = status
        if severity:
            clauses.append("severity=:severity")
            params["severity"] = severity
        if category:
            clauses.append("category=:category")
            params["category"] = category
        if branch_id is not None:
            clauses.append("branch_id=:branch_id")
            params["branch_id"] = branch_id
        rows = conn.execute(text(f"""
            SELECT * FROM bi_findings WHERE {' AND '.join(clauses)} ORDER BY
              CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, id DESC
        """), params).mappings().all()
        return {"items": [_finding_to_dict(row) for row in rows]}


@router.get("/findings/{finding_id}")
def finding_detail(finding_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        finding = _finding_to_dict(_finding_row(conn, finding_id, company_id))
        plans = conn.execute(text("""
            SELECT p.*, u.full_name AS responsible_user_name
            FROM bi_action_plans p LEFT JOIN users u ON u.id=p.responsible_user_id
            WHERE p.finding_id=:finding_id AND p.company_id=:company_id ORDER BY p.id
        """), {"finding_id": finding_id, "company_id": company_id}).mappings().all()
        plan_items = []
        for plan in plans:
            tasks = conn.execute(text("""
                SELECT t.*, u.full_name AS owner_user_name
                FROM bi_action_tasks t LEFT JOIN users u ON u.id=t.owner_user_id
                WHERE t.plan_id=:plan_id AND t.company_id=:company_id ORDER BY t.id
            """), {"plan_id": plan["id"], "company_id": company_id}).mappings().all()
            plan_items.append({**dict(plan), "tasks": [dict(t) for t in tasks]})
        history = conn.execute(text("""
            SELECT h.*, u.full_name AS actor_name
            FROM bi_finding_history h LEFT JOIN users u ON u.id=h.actor_user_id
            WHERE h.finding_id=:finding_id AND h.company_id=:company_id ORDER BY h.id
        """), {"finding_id": finding_id, "company_id": company_id}).mappings().all()
        return {**finding, "plans": plan_items, "history": [dict(h) for h in history]}


@router.put("/findings/{finding_id}/acknowledge")
def acknowledge_finding(finding_id: int, request: Request):
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        finding = _finding_row(conn, finding_id, company_id)
        if finding["status"] != "new":
            raise HTTPException(status_code=409, detail="Only a new finding can be acknowledged")
        conn.execute(text("UPDATE bi_findings SET status='acknowledged', updated_at=:now WHERE id=:id"), {"now": _now(), "id": finding_id})
        _log_history(conn, finding_id, "acknowledged", actor, "", "new", "acknowledged", company_id)
        return {"status": "acknowledged"}


class DismissPayload(BaseModel):
    reason: str


@router.put("/findings/{finding_id}/dismiss")
def dismiss_finding(finding_id: int, data: DismissPayload, request: Request):
    actor, _ = _auth(request)
    if not data.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required to dismiss a finding")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        finding = _finding_row(conn, finding_id, company_id)
        if finding["status"] not in OPEN_FINDING_STATUSES:
            raise HTTPException(status_code=409, detail="Only an open finding can be dismissed")
        conn.execute(text("""
            UPDATE bi_findings SET status='dismissed', dismissed_reason=:reason, updated_at=:now WHERE id=:id
        """), {"reason": data.reason, "now": _now(), "id": finding_id})
        _log_history(conn, finding_id, "dismissed", actor, data.reason, finding["status"], "dismissed", company_id)
        return {"status": "dismissed"}


class ReopenPayload(BaseModel):
    reason: str = ""


@router.put("/findings/{finding_id}/reopen")
def reopen_finding(finding_id: int, data: ReopenPayload, request: Request):
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        finding = _finding_row(conn, finding_id, company_id)
        if finding["status"] not in ("resolved", "dismissed"):
            raise HTTPException(status_code=409, detail="Only a resolved or dismissed finding can be reopened")
        conn.execute(text("UPDATE bi_findings SET status='reopened', updated_at=:now WHERE id=:id"), {"now": _now(), "id": finding_id})
        _log_history(conn, finding_id, "reopened", actor, data.reason, finding["status"], "reopened", company_id)
        return {"status": "reopened"}


class ResolvePayload(BaseModel):
    override: bool = False
    reason: str = ""


@router.post("/findings/{finding_id}/resolve")
def resolve_finding(finding_id: int, data: ResolvePayload, request: Request):
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        finding = _finding_row(conn, finding_id, company_id)
        if finding["status"] not in OPEN_FINDING_STATUSES:
            raise HTTPException(status_code=409, detail="Only an open finding can be resolved")
        plan_row = _finding_has_target_plan(conn, finding_id)
        if plan_row and not data.override:
            current = finding["current_metric"]
            target = plan_row["target_value"]
            # Every detector above records "lower is better" metrics except
            # sales_decline, which is "higher is better" - the only
            # category where the target represents a sales floor, not a cap.
            met = (current >= target) if finding["category"] == "sales_decline" else (current <= target)
            if not met:
                raise HTTPException(
                    status_code=409,
                    detail=f"Target not yet met (current={current}, target={target}). Pass override=true with a reason to resolve anyway.",
                )
            note = f"Target met: current={current}, target={target} ({plan_row['target_kpi']})."
        elif plan_row and data.override:
            if not data.reason.strip():
                raise HTTPException(status_code=400, detail="A reason is required to override target-based resolution")
            note = f"Manager override: {data.reason}"
        else:
            if not data.reason.strip():
                raise HTTPException(status_code=400, detail="A reason is required to resolve a finding with no measurable target")
            note = data.reason
        conn.execute(text("""
            UPDATE bi_findings SET status='resolved', resolution_note=:note, updated_at=:now WHERE id=:id
        """), {"note": note, "now": _now(), "id": finding_id})
        _log_history(conn, finding_id, "resolved", actor, note, finding["status"], "resolved", company_id)
        return {"status": "resolved", "note": note}


class ActionPlanCreate(BaseModel):
    objective: str = ""
    recommended_action: str = ""
    selected_action: str = ""
    responsible_user_id: int | None = None
    start_date: str | None = None
    target_date: str | None = None
    priority: str = "medium"
    expected_result: str = ""
    target_kpi: str = ""
    baseline_kpi: float | None = None
    target_value: float | None = None
    notes: str = ""
    requires_approval: bool = False


def _validate_plan(data: ActionPlanCreate):
    if data.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"priority must be one of: {', '.join(sorted(PRIORITIES))}")
    if not (data.objective.strip() or data.selected_action.strip()):
        raise HTTPException(status_code=400, detail="An objective or selected action is required")


@router.post("/findings/{finding_id}/plans")
def create_plan(finding_id: int, data: ActionPlanCreate, request: Request):
    _validate_plan(data)
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        finding = _finding_row(conn, finding_id, company_id)
        if finding["status"] not in OPEN_FINDING_STATUSES:
            raise HTTPException(status_code=409, detail="Cannot plan against a resolved/dismissed finding")
        now = _now()
        result = conn.execute(text("""
            INSERT INTO bi_action_plans
              (finding_id, objective, recommended_action, selected_action, responsible_user_id, start_date,
               target_date, priority, expected_result, target_kpi, baseline_kpi, target_value, notes,
               requires_approval, status, created_by, created_at, updated_at, company_id)
            VALUES
              (:finding_id, :objective, :recommended_action, :selected_action, :responsible_user_id, :start_date,
               :target_date, :priority, :expected_result, :target_kpi, :baseline_kpi, :target_value, :notes,
               :requires_approval, 'draft', :actor, :now, :now, :company_id)
        """), {**data.model_dump(), "finding_id": finding_id, "actor": actor, "now": now, "company_id": company_id})
        plan_id = result.lastrowid
        if finding["status"] == "new":
            conn.execute(text("UPDATE bi_findings SET status='action_planned', updated_at=:now WHERE id=:id"), {"now": now, "id": finding_id})
        else:
            conn.execute(text("UPDATE bi_findings SET status='action_planned', updated_at=:now WHERE id=:id AND status='acknowledged'"), {"now": now, "id": finding_id})
        _log_history(conn, finding_id, "plan_created", actor, data.selected_action or data.objective, None, None, company_id)
        return {"status": "created", "id": plan_id}


def _plan_row(conn, plan_id, company_id):
    row = conn.execute(text("SELECT * FROM bi_action_plans WHERE id=:id AND company_id=:company_id"), {"id": plan_id, "company_id": company_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Action plan not found")
    return dict(row)


@router.put("/plans/{plan_id}")
def update_plan(plan_id: int, data: ActionPlanCreate, request: Request):
    _validate_plan(data)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only a draft plan can be edited")
        conn.execute(text("""
            UPDATE bi_action_plans SET objective=:objective, recommended_action=:recommended_action,
              selected_action=:selected_action, responsible_user_id=:responsible_user_id, start_date=:start_date,
              target_date=:target_date, priority=:priority, expected_result=:expected_result, target_kpi=:target_kpi,
              baseline_kpi=:baseline_kpi, target_value=:target_value, notes=:notes, requires_approval=:requires_approval,
              updated_at=:now
            WHERE id=:id AND company_id=:company_id
        """), {**data.model_dump(), "now": _now(), "id": plan_id, "company_id": company_id})
        return {"status": "updated"}


@router.post("/plans/{plan_id}/submit")
def submit_plan(plan_id: int, request: Request):
    from app.approvals.engine import create_request

    actor, role = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only a draft plan can be submitted")
        if not plan["requires_approval"]:
            raise HTTPException(status_code=409, detail="This plan was not marked as requiring approval - use /start instead")
        result = create_request(
            conn, "bi_action_plan", plan_id, plan["target_value"] or 0, actor, role,
            f"Submit improvement action plan #{plan_id} for approval", company_id, request_obj=request,
        )
        conn.execute(text("""
            UPDATE bi_action_plans SET status='pending_approval', approval_request_id=:req_id, updated_at=:now
            WHERE id=:id AND company_id=:company_id
        """), {"req_id": result["id"], "now": _now(), "id": plan_id, "company_id": company_id})
        return {"status": "pending_approval", "approval_request_id": result["id"]}


def _execute_bi_action_plan_approval(plan_id: int, decided_by: int, company_id: int) -> dict:
    db = SessionLocal()
    try:
        conn = db.connection()
        _ensure_schema(conn)
        plan = conn.execute(text("SELECT * FROM bi_action_plans WHERE id=:id AND company_id=:company_id"), {"id": plan_id, "company_id": company_id}).mappings().first()
        if not plan:
            raise ValueError("Action plan no longer exists")
        conn.execute(text("UPDATE bi_action_plans SET status='approved', updated_at=:now WHERE id=:id"), {"now": _now(), "id": plan_id})
        db.commit()
        return {"plan_id": plan_id, "status": "approved"}
    finally:
        db.close()


def _register_executors():
    from app.approvals.engine import register_executor
    register_executor("bi_action_plan", _execute_bi_action_plan_approval)


_register_executors()


@router.post("/plans/{plan_id}/start")
def start_plan(plan_id: int, request: Request):
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        allowed = {"approved"} if plan["requires_approval"] else {"draft", "approved"}
        if plan["status"] not in allowed:
            raise HTTPException(status_code=409, detail=f"Plan must be in one of {allowed} to start")
        conn.execute(text("UPDATE bi_action_plans SET status='in_progress', updated_at=:now WHERE id=:id"), {"now": _now(), "id": plan_id})
        conn.execute(text("""
            UPDATE bi_findings SET status='in_progress', updated_at=:now
            WHERE id=:id AND status IN ('action_planned','acknowledged','new')
        """), {"now": _now(), "id": plan["finding_id"]})
        _log_history(conn, plan["finding_id"], "status_changed", actor, "Plan started", plan["status"], "in_progress", company_id)
        return {"status": "in_progress"}


class CompletePlanPayload(BaseModel):
    outcome: str = ""


@router.post("/plans/{plan_id}/complete")
def complete_plan(plan_id: int, data: CompletePlanPayload, request: Request):
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] != "in_progress":
            raise HTTPException(status_code=409, detail="Only an in-progress plan can be completed")
        conn.execute(text("UPDATE bi_action_plans SET status='completed', notes=notes || :outcome, updated_at=:now WHERE id=:id"),
                     {"outcome": (f"\nOutcome: {data.outcome}" if data.outcome else ""), "now": _now(), "id": plan_id})
        conn.execute(text("""
            UPDATE bi_findings SET status='monitoring', updated_at=:now WHERE id=:id AND status='in_progress'
        """), {"now": _now(), "id": plan["finding_id"]})
        _log_history(conn, plan["finding_id"], "status_changed", actor, f"Plan completed. {data.outcome}", "in_progress", "monitoring", company_id)
        return {"status": "completed"}


@router.post("/plans/{plan_id}/cancel")
def cancel_plan(plan_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=409, detail="Plan is already finished")
        conn.execute(text("UPDATE bi_action_plans SET status='cancelled', updated_at=:now WHERE id=:id"), {"now": _now(), "id": plan_id})
        return {"status": "cancelled"}


class TaskCreate(BaseModel):
    title: str
    owner_user_id: int | None = None
    deadline: str | None = None
    notes: str = ""


@router.post("/plans/{plan_id}/tasks")
def create_task(plan_id: int, data: TaskCreate, request: Request):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Task title is required")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _plan_row(conn, plan_id, company_id)
        now = _now()
        result = conn.execute(text("""
            INSERT INTO bi_action_tasks (plan_id, title, owner_user_id, deadline, status, progress_percent, notes, created_at, updated_at, company_id)
            VALUES (:plan_id, :title, :owner_user_id, :deadline, 'pending', 0, :notes, :now, :now, :company_id)
        """), {**data.model_dump(), "plan_id": plan_id, "now": now, "company_id": company_id})
        return {"status": "created", "id": result.lastrowid}


class TaskUpdate(BaseModel):
    title: str | None = None
    owner_user_id: int | None = None
    deadline: str | None = None
    status: str | None = None
    progress_percent: int | None = None
    notes: str | None = None


@router.put("/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        task = conn.execute(text("SELECT * FROM bi_action_tasks WHERE id=:id AND company_id=:company_id"), {"id": task_id, "company_id": company_id}).mappings().first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if data.status is not None and data.status not in TASK_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(sorted(TASK_STATUSES))}")
        if data.progress_percent is not None and not (0 <= data.progress_percent <= 100):
            raise HTTPException(status_code=400, detail="progress_percent must be between 0 and 100")
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            return {"status": "unchanged"}
        completion_date = task["completion_date"]
        if fields.get("status") == "done" and task["status"] != "done":
            completion_date = _today()
        set_clause = ", ".join(f"{k}=:{k}" for k in fields)
        conn.execute(text(f"""
            UPDATE bi_action_tasks SET {set_clause}, completion_date=:completion_date, updated_at=:now
            WHERE id=:id AND company_id=:company_id
        """), {**fields, "completion_date": completion_date, "now": _now(), "id": task_id, "company_id": company_id})
        return {"status": "updated"}


@router.get("/dashboard")
def improvement_dashboard(request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        today = _today()
        open_findings = conn.execute(text("""
            SELECT COUNT(*) FROM bi_findings WHERE company_id=:company_id AND status IN ('new','acknowledged','action_planned','in_progress','monitoring','reopened')
        """), {"company_id": company_id}).scalar() or 0
        critical_findings = conn.execute(text("""
            SELECT COUNT(*) FROM bi_findings WHERE company_id=:company_id AND severity='critical'
              AND status IN ('new','acknowledged','action_planned','in_progress','monitoring','reopened')
        """), {"company_id": company_id}).scalar() or 0
        plans_in_progress = conn.execute(text("""
            SELECT COUNT(*) FROM bi_action_plans WHERE company_id=:company_id AND status='in_progress'
        """), {"company_id": company_id}).scalar() or 0
        overdue_actions = conn.execute(text("""
            SELECT COUNT(*) FROM bi_action_tasks
            WHERE company_id=:company_id AND status NOT IN ('done') AND deadline IS NOT NULL AND deadline < :today
        """), {"company_id": company_id, "today": today}).scalar() or 0
        recently_resolved = conn.execute(text("""
            SELECT id, title, category, updated_at FROM bi_findings
            WHERE company_id=:company_id AND status='resolved' ORDER BY updated_at DESC LIMIT 10
        """), {"company_id": company_id}).mappings().all()
        reopened = conn.execute(text("""
            SELECT id, title, category, updated_at FROM bi_findings
            WHERE company_id=:company_id AND status='reopened' ORDER BY updated_at DESC LIMIT 10
        """), {"company_id": company_id}).mappings().all()
        kpi_rows = conn.execute(text("""
            SELECT category, current_metric, baseline_metric, variance_percent FROM bi_findings
            WHERE company_id=:company_id AND variance_percent IS NOT NULL
              AND status IN ('new','acknowledged','action_planned','in_progress','monitoring','reopened')
        """), {"company_id": company_id}).mappings().all()
        return {
            "generated_at": _now(),
            "open_findings": open_findings,
            "critical_findings": critical_findings,
            "plans_in_progress": plans_in_progress,
            "overdue_actions": overdue_actions,
            "recently_resolved": [dict(r) for r in recently_resolved],
            "reopened": [dict(r) for r in reopened],
            "kpi_deterioration": [dict(r) for r in kpi_rows if (r["variance_percent"] or 0) > 0],
            "kpi_improvement": [dict(r) for r in kpi_rows if (r["variance_percent"] or 0) < 0],
        }


def bi_action_plan_alerts(company_id: int, alert_days_before_due: int = 3) -> list:
    """Consumed by executive_alerts.py as its 5th alert source - critical
    open findings and overdue action-plan tasks, in the exact same shape as
    the other four alert sources (see that module's docstring)."""
    alerts = []
    with engine.begin() as conn:
        _ensure_schema(conn)
        today = _today()
        criticals = conn.execute(text("""
            SELECT id, title, current_metric, detection_date FROM bi_findings
            WHERE company_id=:company_id AND severity='critical'
              AND status IN ('new','acknowledged','action_planned','in_progress','monitoring','reopened')
        """), {"company_id": company_id}).mappings().all()
        for row in criticals:
            alerts.append({
                "category": "bi_finding", "severity": "critical", "title": row["title"],
                "amount": row["current_metric"], "due_date": None, "days_overdue": 0,
                "related_id": row["id"], "related_type": "bi_finding", "quick_action": "view_finding",
            })
        overdue_tasks = conn.execute(text("""
            SELECT t.id, t.title, t.deadline, p.finding_id, f.title AS finding_title
            FROM bi_action_tasks t
            JOIN bi_action_plans p ON p.id=t.plan_id
            JOIN bi_findings f ON f.id=p.finding_id
            WHERE t.company_id=:company_id AND t.status != 'done' AND t.deadline IS NOT NULL AND t.deadline < :today
        """), {"company_id": company_id, "today": today}).mappings().all()
        for row in overdue_tasks:
            days_overdue = (date_cls.today() - date_cls.fromisoformat(str(row["deadline"])[:10])).days
            alerts.append({
                "category": "bi_action_task", "severity": "critical" if days_overdue >= 7 else "warning",
                "title": f"{row['finding_title']} - {row['title']}",
                "amount": None, "due_date": row["deadline"], "days_overdue": days_overdue,
                "related_id": row["finding_id"], "related_type": "bi_finding", "quick_action": "view_finding",
            })
        return alerts
