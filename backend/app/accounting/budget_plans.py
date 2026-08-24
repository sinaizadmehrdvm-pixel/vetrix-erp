"""Operational budgeting (Task 03, Section 15) - a versioned/scenario plan
layer built ON TOP of the existing app/accounting/budgets.py line-level
model, which stays completely untouched: `accounting_budgets` (one amount
per fiscal_period x account x cost_center x project) and its `/variance`
endpoint keep working exactly as before for any caller that never mentions
a plan.

A BudgetPlan groups a set of those same accounting_budgets rows (via a new
nullable budget_plan_id column) plus a new goods/inventory line type
(budget_goods_lines) that accounting_budgets was never designed to hold
(it's currency-only). This is deliberately additive layering, not a
parallel/competing budget system.

Approval reuses app/approvals/engine.py - a generic resource_type registry
built for exactly this kind of reuse - rather than inventing a third
approval workflow (the codebase already has app/accounting/approvals.py
for vouchers and app/change_requests.py for voice/text changes; this is
the third+ case the engine's own docstring says to register against
instead of building yet another one).

ARCHITECTURE STATUS (Task 07 Section 4/H, verified against the actual
frontend, not assumed): as of this note, no page anywhere in
frontend/src/pages links to any /api/accounting/budget-plans endpoint or
renders a BudgetPlan/budget_goods_lines row - `BudgetControl.jsx` (the only
reachable budget UI, wired into Sidebar.jsx) reads and writes exclusively
through app/accounting/budgets.py's accounting_budgets/`/variance`. This
module's endpoints are real, tested, and untouched here - not deprecated -
but they are currently backend-only capability with no way for a real user
to create a row through the app. bi_improvement.py's budget-variance
finding, executive_alerts.py's budget alert, and the Executive Agent's
budget_variance tool all used to read from budget_plans (via plan_summary)
and were consequently silent permanent no-ops for every real deployment;
they were repointed at app/accounting/budgets.py's compute_budget_variance
so those features actually reflect what BudgetControl.jsx shows. If a
dedicated budget-plans UI (versioning/approval/scenario comparison) is
built in the future, revisit those three call sites deliberately rather
than assuming they should switch back.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import SessionLocal, engine

router = APIRouter(prefix="/api/accounting/budget-plans", tags=["Budget Plans"])

BUDGET_TYPES = {
    "financial", "revenue", "expense", "purchase", "sales", "inventory",
    "department", "branch", "project", "capex",
}
SCENARIOS = {"base", "optimistic", "conservative", "custom"}
STATUSES = {"draft", "approved", "active", "closed", "archived"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(conn):
    # accounting_budgets (and its budget_plan_id column/index) is owned by
    # app/accounting/budgets.py - call its own schema-ensure first so this
    # module never assumes that table already exists, regardless of
    # whether a budgets.py or budget_plans.py endpoint was hit first.
    from app.accounting.budgets import _ensure_schema as _ensure_budgets_schema
    _ensure_budgets_schema(conn)

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS budget_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            budget_type VARCHAR NOT NULL DEFAULT 'financial',
            scenario VARCHAR NOT NULL DEFAULT 'base',
            fiscal_period_id INTEGER NOT NULL,
            branch_id INTEGER,
            status VARCHAR NOT NULL DEFAULT 'draft',
            version INTEGER NOT NULL DEFAULT 1,
            parent_plan_id INTEGER,
            approval_request_id INTEGER,
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            FOREIGN KEY(fiscal_period_id) REFERENCES fiscal_periods(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS budget_goods_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            budget_plan_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            planned_quantity FLOAT NOT NULL DEFAULT 0,
            unit_value FLOAT NOT NULL DEFAULT 0,
            note TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            FOREIGN KEY(budget_plan_id) REFERENCES budget_plans(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        )
    """))
    ensure_company_id_column(conn, "budget_plans")
    ensure_company_id_column(conn, "budget_goods_lines")

    # Extend the existing accounting_budgets table with an optional link to
    # a plan - additive column, existing plan-less rows (budget_plan_id
    # IS NULL) are completely unaffected.
    columns = {row[1] for row in conn.execute(text("PRAGMA table_info(accounting_budgets)")).fetchall()}
    if "budget_plan_id" not in columns:
        conn.execute(text("ALTER TABLE accounting_budgets ADD COLUMN budget_plan_id INTEGER"))
    # The original unique index (period, account, cost_center, project)
    # would otherwise block two different plans from both budgeting the
    # same account in the same period - replace it with a plan-aware
    # version. COALESCE(budget_plan_id,-1) keeps every pre-existing,
    # plan-less row's uniqueness behavior byte-for-byte identical.
    conn.execute(text("DROP INDEX IF EXISTS ux_budget_dimensions"))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_budget_dimensions_v2
        ON accounting_budgets(
            fiscal_period_id, account_id,
            COALESCE(cost_center_id, -1), COALESCE(project_id, -1), COALESCE(budget_plan_id, -1)
        )
    """))


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


class BudgetPlanCreate(BaseModel):
    name: str
    budget_type: str = "financial"
    scenario: str = "base"
    fiscal_period_id: int
    branch_id: int | None = None
    notes: str = ""


class GoodsLineUpsert(BaseModel):
    product_id: int
    planned_quantity: float
    unit_value: float = 0
    note: str = ""


def _validate_plan_fields(data: BudgetPlanCreate):
    if data.budget_type not in BUDGET_TYPES:
        raise HTTPException(status_code=400, detail=f"budget_type must be one of: {', '.join(sorted(BUDGET_TYPES))}")
    if data.scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"scenario must be one of: {', '.join(sorted(SCENARIOS))}")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Plan name is required")


def _plan_row(conn, plan_id, company_id):
    row = conn.execute(text("""
        SELECT bp.*, fp.name AS period_name, fp.start_date, fp.end_date, creator.full_name AS created_by_name
        FROM budget_plans bp
        LEFT JOIN fiscal_periods fp ON fp.id=bp.fiscal_period_id
        LEFT JOIN users creator ON creator.id=bp.created_by
        WHERE bp.id=:id AND bp.company_id=:company_id
    """), {"id": plan_id, "company_id": company_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Budget plan not found")
    return dict(row)


def _pending_approval(conn, approval_request_id, company_id) -> dict | None:
    if not approval_request_id:
        return None
    row = conn.execute(text("""
        SELECT id, status, current_level, required_levels FROM approval_requests
        WHERE id=:id AND company_id=:company_id
    """), {"id": approval_request_id, "company_id": company_id}).mappings().first()
    if not row or row["status"] != "pending":
        return None
    return dict(row)


@router.get("")
def list_plans(request: Request, fiscal_period_id: int | None = None, status: str = "", scenario: str = "", branch_id: int | None = None):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        clauses = ["bp.company_id=:company_id"]
        params = {"company_id": company_id}
        if fiscal_period_id is not None:
            clauses.append("bp.fiscal_period_id=:fiscal_period_id")
            params["fiscal_period_id"] = fiscal_period_id
        if status:
            clauses.append("bp.status=:status")
            params["status"] = status
        if scenario:
            clauses.append("bp.scenario=:scenario")
            params["scenario"] = scenario
        if branch_id is not None:
            clauses.append("bp.branch_id=:branch_id")
            params["branch_id"] = branch_id
        rows = conn.execute(text(f"""
            SELECT bp.*, fp.name AS period_name
            FROM budget_plans bp LEFT JOIN fiscal_periods fp ON fp.id=bp.fiscal_period_id
            WHERE {' AND '.join(clauses)}
            ORDER BY bp.id DESC
        """), params).mappings().all()
        items = []
        for row in rows:
            item = dict(row)
            pending = _pending_approval(conn, item.get("approval_request_id"), company_id)
            item["pending_approval"] = pending is not None
            items.append(item)
        return {"items": items}


@router.post("")
def create_plan(data: BudgetPlanCreate, request: Request):
    _validate_plan_fields(data)
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        period = conn.execute(text(
            "SELECT id FROM fiscal_periods WHERE id=:id AND company_id=:company_id"
        ), {"id": data.fiscal_period_id, "company_id": company_id}).first()
        if not period:
            raise HTTPException(status_code=404, detail="Fiscal period not found")
        now = _now()
        result = conn.execute(text("""
            INSERT INTO budget_plans
              (name, budget_type, scenario, fiscal_period_id, branch_id, status, version,
               notes, created_by, created_at, updated_at, company_id)
            VALUES
              (:name, :budget_type, :scenario, :fiscal_period_id, :branch_id, 'draft', 1,
               :notes, :actor, :now, :now, :company_id)
        """), {**data.model_dump(), "actor": actor, "now": now, "company_id": company_id})
        return {"status": "created", "id": result.lastrowid}


@router.get("/{plan_id}")
def plan_detail(plan_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        plan["pending_approval"] = _pending_approval(conn, plan.get("approval_request_id"), company_id) is not None

        budget_lines = conn.execute(text("""
            SELECT b.*, a.code AS account_code, a.name AS account_name, a.account_type
            FROM accounting_budgets b JOIN chart_accounts a ON a.id=b.account_id
            WHERE b.budget_plan_id=:plan_id AND b.company_id=:company_id
            ORDER BY a.code
        """), {"plan_id": plan_id, "company_id": company_id}).mappings().all()

        goods_lines = conn.execute(text("""
            SELECT g.*, p.name AS product_name, p.unit, p.stock AS current_stock
            FROM budget_goods_lines g JOIN products p ON p.id=g.product_id
            WHERE g.budget_plan_id=:plan_id AND g.company_id=:company_id
            ORDER BY p.name
        """), {"plan_id": plan_id, "company_id": company_id}).mappings().all()

        goods_items = []
        for row in goods_lines:
            item = dict(row)
            purchased = conn.execute(text("""
                SELECT COALESCE(SUM(poi.received_quantity), 0) FROM purchase_order_items poi
                JOIN purchase_orders po ON po.id=poi.purchase_order_id
                WHERE poi.product_id=:product_id AND po.company_id=:company_id
                  AND po.created_at >= :start_date AND po.created_at <= :end_date
            """), {"product_id": row["product_id"], "company_id": company_id, "start_date": plan["start_date"], "end_date": plan["end_date"]}).scalar() or 0
            sold = conn.execute(text("""
                SELECT COALESCE(SUM(ii.quantity), 0) FROM invoice_items ii
                JOIN invoices i ON i.id=ii.invoice_id
                WHERE ii.product_id=:product_id AND i.company_id=:company_id AND i.invoice_type='sale'
                  AND i.created_at >= :start_date AND i.created_at <= :end_date
            """), {"product_id": row["product_id"], "company_id": company_id, "start_date": plan["start_date"], "end_date": plan["end_date"]}).scalar() or 0
            item["actual_purchased"] = float(purchased)
            item["actual_sold"] = float(sold)
            item["quantity_variance"] = round(float(row["planned_quantity"]) - float(purchased), 2)
            goods_items.append(item)

        return {**plan, "budget_lines": [dict(row) for row in budget_lines], "goods_lines": goods_items}


@router.put("/{plan_id}")
def update_plan(plan_id: int, data: BudgetPlanCreate, request: Request):
    _validate_plan_fields(data)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only a draft plan can be edited - clone it to make changes to an approved plan")
        conn.execute(text("""
            UPDATE budget_plans SET name=:name, budget_type=:budget_type, scenario=:scenario,
              fiscal_period_id=:fiscal_period_id, branch_id=:branch_id, notes=:notes, updated_at=:now
            WHERE id=:id AND company_id=:company_id
        """), {**data.model_dump(), "now": _now(), "id": plan_id, "company_id": company_id})
        return {"status": "updated"}


@router.post("/{plan_id}/goods-lines")
def upsert_goods_line(plan_id: int, data: GoodsLineUpsert, request: Request):
    company_id = current_company_id(request)
    if data.planned_quantity < 0:
        raise HTTPException(status_code=400, detail="planned_quantity cannot be negative")
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only a draft plan can be edited")
        product = conn.execute(text(
            "SELECT id FROM products WHERE id=:id AND company_id=:company_id"
        ), {"id": data.product_id, "company_id": company_id}).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        existing = conn.execute(text("""
            SELECT id FROM budget_goods_lines WHERE budget_plan_id=:plan_id AND product_id=:product_id AND company_id=:company_id
        """), {"plan_id": plan_id, "product_id": data.product_id, "company_id": company_id}).scalar()
        now = _now()
        if existing:
            conn.execute(text("""
                UPDATE budget_goods_lines SET planned_quantity=:planned_quantity, unit_value=:unit_value, note=:note, updated_at=:now
                WHERE id=:id AND company_id=:company_id
            """), {**data.model_dump(), "now": now, "id": existing, "company_id": company_id})
            return {"status": "updated", "id": existing}
        result = conn.execute(text("""
            INSERT INTO budget_goods_lines (budget_plan_id, product_id, planned_quantity, unit_value, note, created_at, updated_at, company_id)
            VALUES (:budget_plan_id, :product_id, :planned_quantity, :unit_value, :note, :now, :now, :company_id)
        """), {**data.model_dump(), "budget_plan_id": plan_id, "now": now, "company_id": company_id})
        return {"status": "created", "id": result.lastrowid}


@router.delete("/goods-lines/{line_id}")
def delete_goods_line(line_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text(
            "DELETE FROM budget_goods_lines WHERE id=:id AND company_id=:company_id"
        ), {"id": line_id, "company_id": company_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Goods line not found")
        return {"status": "deleted"}


@router.post("/{plan_id}/submit")
def submit_plan(plan_id: int, request: Request):
    from app.approvals.engine import create_request

    actor, role = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only a draft plan can be submitted")
        total = conn.execute(text("""
            SELECT COALESCE(SUM(amount), 0) FROM accounting_budgets WHERE budget_plan_id=:plan_id AND company_id=:company_id
        """), {"plan_id": plan_id, "company_id": company_id}).scalar() or 0
        result = create_request(
            conn, "budget_plan", plan_id, total, actor, role,
            f"Submit budget plan '{plan['name']}' for approval", company_id, request_obj=request,
        )
        conn.execute(text("""
            UPDATE budget_plans SET approval_request_id=:req_id, updated_at=:now WHERE id=:id AND company_id=:company_id
        """), {"req_id": result["id"], "now": _now(), "id": plan_id, "company_id": company_id})
        return {"status": "pending_approval", "approval_request_id": result["id"]}


def _execute_budget_plan_approval(plan_id: int, decided_by: int, company_id: int) -> dict:
    """Approval-engine executor for resource_type='budget_plan' - only
    flips draft->approved. Activating (making it the live plan staff
    compare actuals against) is a deliberately separate, explicit step
    (see activate_plan below), matching the task spec's own
    Approve/Activate distinction."""
    db: Session = SessionLocal()
    try:
        conn = db.connection()
        _ensure_schema(conn)
        plan = conn.execute(text(
            "SELECT * FROM budget_plans WHERE id=:id AND company_id=:company_id"
        ), {"id": plan_id, "company_id": company_id}).mappings().first()
        if not plan:
            raise ValueError("Budget plan no longer exists")
        conn.execute(text("""
            UPDATE budget_plans SET status='approved', updated_at=:now WHERE id=:id
        """), {"now": _now(), "id": plan_id})
        db.commit()
        return {"plan_id": plan_id, "status": "approved"}
    finally:
        db.close()


def _register_executors():
    from app.approvals.engine import register_executor
    register_executor("budget_plan", _execute_budget_plan_approval)


_register_executors()


def _transition(plan_id, company_id, allowed_from, to_status):
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        if plan["status"] not in allowed_from:
            raise HTTPException(status_code=409, detail=f"Plan must be in one of {allowed_from} to become {to_status}")
        conn.execute(text("""
            UPDATE budget_plans SET status=:status, updated_at=:now WHERE id=:id AND company_id=:company_id
        """), {"status": to_status, "now": _now(), "id": plan_id, "company_id": company_id})
        return {"status": to_status}


@router.post("/{plan_id}/activate")
def activate_plan(plan_id: int, request: Request):
    return _transition(plan_id, current_company_id(request), {"approved"}, "active")


@router.post("/{plan_id}/close")
def close_plan(plan_id: int, request: Request):
    return _transition(plan_id, current_company_id(request), {"active"}, "closed")


@router.post("/{plan_id}/archive")
def archive_plan(plan_id: int, request: Request):
    return _transition(plan_id, current_company_id(request), {"draft", "approved", "active", "closed"}, "archived")


@router.post("/{plan_id}/clone")
def clone_plan(plan_id: int, request: Request, target_fiscal_period_id: int | None = None):
    actor, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        source = _plan_row(conn, plan_id, company_id)
        new_period_id = target_fiscal_period_id or source["fiscal_period_id"]
        period = conn.execute(text(
            "SELECT id FROM fiscal_periods WHERE id=:id AND company_id=:company_id"
        ), {"id": new_period_id, "company_id": company_id}).first()
        if not period:
            raise HTTPException(status_code=404, detail="Target fiscal period not found")
        now = _now()
        result = conn.execute(text("""
            INSERT INTO budget_plans
              (name, budget_type, scenario, fiscal_period_id, branch_id, status, version,
               parent_plan_id, notes, created_by, created_at, updated_at, company_id)
            VALUES
              (:name, :budget_type, :scenario, :fiscal_period_id, :branch_id, 'draft', :version,
               :parent_plan_id, :notes, :actor, :now, :now, :company_id)
        """), {
            "name": f"{source['name']} (clone)", "budget_type": source["budget_type"], "scenario": source["scenario"],
            "fiscal_period_id": new_period_id, "branch_id": source["branch_id"],
            "version": int(source["version"] or 1) + 1, "parent_plan_id": plan_id, "notes": source["notes"],
            "actor": actor, "now": now, "company_id": company_id,
        })
        new_plan_id = result.lastrowid

        budget_lines = conn.execute(text("""
            SELECT * FROM accounting_budgets WHERE budget_plan_id=:plan_id AND company_id=:company_id
        """), {"plan_id": plan_id, "company_id": company_id}).mappings().all()
        for line in budget_lines:
            conn.execute(text("""
                INSERT INTO accounting_budgets
                  (fiscal_period_id, account_id, cost_center_id, project_id, amount, note,
                   created_at, updated_at, company_id, budget_plan_id)
                VALUES
                  (:fiscal_period_id, :account_id, :cost_center_id, :project_id, :amount, :note,
                   :now, :now, :company_id, :budget_plan_id)
            """), {
                "fiscal_period_id": new_period_id, "account_id": line["account_id"],
                "cost_center_id": line["cost_center_id"], "project_id": line["project_id"],
                "amount": line["amount"], "note": line["note"], "now": now,
                "company_id": company_id, "budget_plan_id": new_plan_id,
            })

        goods_lines = conn.execute(text("""
            SELECT * FROM budget_goods_lines WHERE budget_plan_id=:plan_id AND company_id=:company_id
        """), {"plan_id": plan_id, "company_id": company_id}).mappings().all()
        for line in goods_lines:
            conn.execute(text("""
                INSERT INTO budget_goods_lines (budget_plan_id, product_id, planned_quantity, unit_value, note, created_at, updated_at, company_id)
                VALUES (:budget_plan_id, :product_id, :planned_quantity, :unit_value, :note, :now, :now, :company_id)
            """), {
                "budget_plan_id": new_plan_id, "product_id": line["product_id"],
                "planned_quantity": line["planned_quantity"], "unit_value": line["unit_value"],
                "note": line["note"], "now": now, "company_id": company_id,
            })

        return {"status": "created", "id": new_plan_id}


@router.get("/{plan_id}/summary")
def plan_summary(plan_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        rows = conn.execute(text("""
            SELECT b.amount AS budget_amount, a.account_type, a.code, a.name,
                   COALESCE(SUM(CASE WHEN a.account_type='expense' THEN l.debit-l.credit ELSE l.credit-l.debit END), 0) AS actual_amount
            FROM accounting_budgets b
            JOIN chart_accounts a ON a.id=b.account_id
            LEFT JOIN accounting_vouchers v ON v.fiscal_period_id=b.fiscal_period_id AND v.status='posted' AND v.company_id=b.company_id
            LEFT JOIN accounting_voucher_lines l ON l.voucher_id=v.id AND l.account_id=b.account_id
            WHERE b.budget_plan_id=:plan_id AND b.company_id=:company_id
            GROUP BY b.id, a.account_type, a.code, a.name
        """), {"plan_id": plan_id, "company_id": company_id}).mappings().all()

        planned_revenue = sum(float(r["budget_amount"]) for r in rows if r["account_type"] == "revenue")
        planned_expense = sum(float(r["budget_amount"]) for r in rows if r["account_type"] == "expense")
        actual_revenue = sum(float(r["actual_amount"]) for r in rows if r["account_type"] == "revenue")
        actual_expense = sum(float(r["actual_amount"]) for r in rows if r["account_type"] == "expense")

        over_budget = sorted(
            [{"code": r["code"], "name": r["name"], "budget": float(r["budget_amount"]), "actual": float(r["actual_amount"]),
              "over_by": float(r["actual_amount"]) - float(r["budget_amount"])}
             for r in rows if r["account_type"] == "expense" and float(r["actual_amount"]) > float(r["budget_amount"])],
            key=lambda x: x["over_by"], reverse=True,
        )[:5]
        underperforming_revenue = sorted(
            [{"code": r["code"], "name": r["name"], "budget": float(r["budget_amount"]), "actual": float(r["actual_amount"]),
              "shortfall": float(r["budget_amount"]) - float(r["actual_amount"])}
             for r in rows if r["account_type"] == "revenue" and float(r["actual_amount"]) < float(r["budget_amount"])],
            key=lambda x: x["shortfall"], reverse=True,
        )[:5]

        return {
            "plan": plan,
            "total_planned_revenue": round(planned_revenue, 2),
            "total_planned_expense": round(planned_expense, 2),
            "expected_profit": round(planned_revenue - planned_expense, 2),
            "actual_revenue": round(actual_revenue, 2),
            "actual_expense": round(actual_expense, 2),
            "actual_profit": round(actual_revenue - actual_expense, 2),
            "remaining_budget": round((planned_revenue + planned_expense) - (actual_revenue + actual_expense), 2),
            "top_over_budget_categories": over_budget,
            "underperforming_revenue_targets": underperforming_revenue,
        }


@router.get("/{plan_id}/forecast")
def plan_forecast(plan_id: int, request: Request):
    """Reuses ai_bi/cashflow_forecast.py's own daily-average-then-project
    method (not linear regression, not "AI") applied to this plan's actual
    revenue/expense progress so far, honestly labeled as a run-rate
    projection - never called an "AI prediction" per the task spec's own
    instruction."""
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        plan = _plan_row(conn, plan_id, company_id)
        start = plan["start_date"]
        end = plan["end_date"]
        if not start or not end:
            raise HTTPException(status_code=400, detail="This plan's fiscal period has no start/end date")

        from datetime import date as date_cls
        period_start = date_cls.fromisoformat(str(start)[:10])
        period_end = date_cls.fromisoformat(str(end)[:10])
        today = date_cls.today()
        elapsed_days = max(1, (min(today, period_end) - period_start).days + 1)
        total_days = max(1, (period_end - period_start).days + 1)

        rows = conn.execute(text("""
            SELECT a.account_type,
                   COALESCE(SUM(CASE WHEN a.account_type='expense' THEN l.debit-l.credit ELSE l.credit-l.debit END), 0) AS actual_amount
            FROM accounting_budgets b
            JOIN chart_accounts a ON a.id=b.account_id
            LEFT JOIN accounting_vouchers v ON v.fiscal_period_id=b.fiscal_period_id AND v.status='posted' AND v.company_id=b.company_id
            LEFT JOIN accounting_voucher_lines l ON l.voucher_id=v.id AND l.account_id=b.account_id
            WHERE b.budget_plan_id=:plan_id AND b.company_id=:company_id
            GROUP BY a.account_type
        """), {"plan_id": plan_id, "company_id": company_id}).mappings().all()

        actual_revenue = sum(float(r["actual_amount"]) for r in rows if r["account_type"] == "revenue")
        actual_expense = sum(float(r["actual_amount"]) for r in rows if r["account_type"] == "expense")

        daily_revenue_rate = actual_revenue / elapsed_days
        daily_expense_rate = actual_expense / elapsed_days

        return {
            "method": "run_rate_projection",
            "method_label": "Average daily run-rate, projected to period end (not an AI/ML prediction)",
            "elapsed_days": elapsed_days,
            "total_days": total_days,
            "actual_revenue_to_date": round(actual_revenue, 2),
            "actual_expense_to_date": round(actual_expense, 2),
            "projected_full_period_revenue": round(daily_revenue_rate * total_days, 2),
            "projected_full_period_expense": round(daily_expense_rate * total_days, 2),
        }
