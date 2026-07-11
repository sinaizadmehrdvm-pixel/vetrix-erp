from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/accounting/budgets", tags=["Budgets & Cost Centers"])
MONEY_STEP = Decimal("0.01")


def _money(value):
    return float(Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP))


class DimensionCreate(BaseModel):
    code: str
    name: str
    description: str = ""


class BudgetLineCreate(BaseModel):
    fiscal_period_id: int
    account_id: int
    amount: float
    cost_center_id: int | None = None
    project_id: int | None = None
    note: str = ""


def _ensure_column(conn, table, column, definition):
    columns = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
    if column not in columns:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {definition}"))


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS cost_centers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR NOT NULL UNIQUE,
            name VARCHAR NOT NULL,
            description TEXT DEFAULT '',
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR NOT NULL
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS accounting_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR NOT NULL UNIQUE,
            name VARCHAR NOT NULL,
            description TEXT DEFAULT '',
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR NOT NULL
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS accounting_budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fiscal_period_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            cost_center_id INTEGER,
            project_id INTEGER,
            amount FLOAT NOT NULL,
            note TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            FOREIGN KEY(fiscal_period_id) REFERENCES fiscal_periods(id),
            FOREIGN KEY(account_id) REFERENCES chart_accounts(id)
        )
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_budget_dimensions
        ON accounting_budgets(
            fiscal_period_id, account_id,
            COALESCE(cost_center_id, -1), COALESCE(project_id, -1)
        )
    """))
    table = conn.execute(text("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='accounting_voucher_lines'
    """)).first()
    if table:
        _ensure_column(conn, "accounting_voucher_lines", "cost_center_id", "cost_center_id INTEGER")
        _ensure_column(conn, "accounting_voucher_lines", "project_id", "project_id INTEGER")


def _dimension(conn, table, dimension_id, label):
    row = conn.execute(text(f"SELECT * FROM {table} WHERE id=:id"), {"id": dimension_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return dict(row)


@router.get("/dimensions")
def list_dimensions():
    with engine.begin() as conn:
        _ensure_schema(conn)
        centers = conn.execute(text("SELECT * FROM cost_centers ORDER BY active DESC, code")).mappings().all()
        projects = conn.execute(text("SELECT * FROM accounting_projects ORDER BY active DESC, code")).mappings().all()
        return {"cost_centers": [dict(row) for row in centers], "projects": [dict(row) for row in projects]}


@router.post("/cost-centers")
def create_cost_center(data: DimensionCreate):
    return _create_dimension("cost_centers", data)


@router.post("/projects")
def create_project(data: DimensionCreate):
    return _create_dimension("accounting_projects", data)


def _create_dimension(table, data):
    code, name = data.code.strip(), data.name.strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="Code and name are required")
    try:
        with engine.begin() as conn:
            _ensure_schema(conn)
            result = conn.execute(text(f"""
                INSERT INTO {table} (code, name, description, active, created_at)
                VALUES (:code, :name, :description, 1, :created_at)
            """), {
                "code": code, "name": name, "description": data.description.strip(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            return {"status": "created", "id": result.lastrowid}
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=409, detail="Dimension code already exists")
        raise


@router.delete("/cost-centers/{dimension_id}")
def delete_cost_center(dimension_id: int):
    return _delete_dimension("cost_centers", "cost_center_id", dimension_id, "Cost center")


@router.delete("/projects/{dimension_id}")
def delete_project(dimension_id: int):
    return _delete_dimension("accounting_projects", "project_id", dimension_id, "Project")


def _delete_dimension(table, column, dimension_id, label):
    with engine.begin() as conn:
        _ensure_schema(conn)
        _dimension(conn, table, dimension_id, label)
        used_budget = conn.execute(text(f"SELECT id FROM accounting_budgets WHERE {column}=:id LIMIT 1"), {"id": dimension_id}).first()
        used_entry = conn.execute(text(f"SELECT id FROM accounting_voucher_lines WHERE {column}=:id LIMIT 1"), {"id": dimension_id}).first()
        if used_budget or used_entry:
            raise HTTPException(status_code=409, detail=f"{label} has accounting history")
        conn.execute(text(f"DELETE FROM {table} WHERE id=:id"), {"id": dimension_id})
        return {"status": "deleted", "id": dimension_id}


@router.post("/lines")
def upsert_budget_line(data: BudgetLineCreate):
    amount = _money(data.amount)
    if amount < 0:
        raise HTTPException(status_code=400, detail="Budget amount cannot be negative")
    with engine.begin() as conn:
        _ensure_schema(conn)
        period = conn.execute(text("SELECT * FROM fiscal_periods WHERE id=:id"), {"id": data.fiscal_period_id}).mappings().first()
        if not period:
            raise HTTPException(status_code=404, detail="Fiscal period not found")
        account = conn.execute(text("""
            SELECT * FROM chart_accounts
            WHERE id=:id AND account_type IN ('revenue','expense','contra')
        """), {"id": data.account_id}).mappings().first()
        if not account:
            raise HTTPException(status_code=400, detail="Budget account must be a revenue or expense account")
        if data.cost_center_id:
            _dimension(conn, "cost_centers", data.cost_center_id, "Cost center")
        if data.project_id:
            _dimension(conn, "accounting_projects", data.project_id, "Project")
        existing = conn.execute(text("""
            SELECT id FROM accounting_budgets
            WHERE fiscal_period_id=:period_id AND account_id=:account_id
              AND COALESCE(cost_center_id,-1)=COALESCE(:cost_center_id,-1)
              AND COALESCE(project_id,-1)=COALESCE(:project_id,-1)
        """), {
            "period_id": data.fiscal_period_id, "account_id": data.account_id,
            "cost_center_id": data.cost_center_id, "project_id": data.project_id,
        }).scalar()
        now = datetime.now(timezone.utc).isoformat()
        if existing:
            conn.execute(text("""
                UPDATE accounting_budgets SET amount=:amount, note=:note, updated_at=:now
                WHERE id=:id
            """), {"amount": amount, "note": data.note.strip(), "now": now, "id": existing})
            return {"status": "updated", "id": existing}
        result = conn.execute(text("""
            INSERT INTO accounting_budgets
              (fiscal_period_id, account_id, cost_center_id, project_id,
               amount, note, created_at, updated_at)
            VALUES
              (:fiscal_period_id, :account_id, :cost_center_id, :project_id,
               :amount, :note, :now, :now)
        """), {**data.dict(), "amount": amount, "note": data.note.strip(), "now": now})
        return {"status": "created", "id": result.lastrowid}


@router.delete("/lines/{line_id}")
def delete_budget_line(line_id: int):
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text("DELETE FROM accounting_budgets WHERE id=:id"), {"id": line_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Budget line not found")
        return {"status": "deleted", "id": line_id}


@router.get("/variance")
def budget_variance(
    fiscal_period_id: int,
    cost_center_id: int | None = None,
    project_id: int | None = None,
):
    with engine.begin() as conn:
        _ensure_schema(conn)
        period = conn.execute(text("SELECT * FROM fiscal_periods WHERE id=:id"), {"id": fiscal_period_id}).mappings().first()
        if not period:
            raise HTTPException(status_code=404, detail="Fiscal period not found")
        rows = conn.execute(text("""
            SELECT b.id AS budget_id, b.amount AS budget_amount, b.note,
                   a.id AS account_id, a.code AS account_code,
                   a.name AS account_name, a.account_type,
                   cc.id AS cost_center_id, cc.code AS cost_center_code,
                   cc.name AS cost_center_name,
                   p.id AS project_id, p.code AS project_code,
                   p.name AS project_name,
                   COALESCE(SUM(CASE
                     WHEN a.account_type='expense' THEN l.debit-l.credit
                     ELSE l.credit-l.debit END),0) AS actual_amount
            FROM accounting_budgets b
            JOIN chart_accounts a ON a.id=b.account_id
            LEFT JOIN cost_centers cc ON cc.id=b.cost_center_id
            LEFT JOIN accounting_projects p ON p.id=b.project_id
            LEFT JOIN accounting_vouchers v
              ON v.fiscal_period_id=b.fiscal_period_id AND v.status='posted'
            LEFT JOIN accounting_voucher_lines l
              ON l.voucher_id=v.id AND l.account_id=b.account_id
             AND (b.cost_center_id IS NULL OR l.cost_center_id=b.cost_center_id)
             AND (b.project_id IS NULL OR l.project_id=b.project_id)
            WHERE b.fiscal_period_id=:period_id
              AND (:cost_center_id IS NULL OR b.cost_center_id=:cost_center_id)
              AND (:project_id IS NULL OR b.project_id=:project_id)
            GROUP BY b.id, a.id, cc.id, p.id
            ORDER BY a.code, cc.code, p.code
        """), {
            "period_id": fiscal_period_id,
            "cost_center_id": cost_center_id,
            "project_id": project_id,
        }).mappings().all()
        items = []
        for row in rows:
            budget = _money(row["budget_amount"])
            actual = _money(row["actual_amount"])
            variance = _money(budget - actual)
            usage = round((actual / budget * 100), 2) if budget else (100.0 if actual else 0.0)
            items.append({
                **dict(row), "budget_amount": budget, "actual_amount": actual,
                "variance": variance, "usage_percent": usage,
                "over_budget": actual > budget,
            })
        total_budget = _money(sum(item["budget_amount"] for item in items))
        total_actual = _money(sum(item["actual_amount"] for item in items))
        return {
            "period": dict(period),
            "filters": {"cost_center_id": cost_center_id, "project_id": project_id},
            "summary": {
                "budget": total_budget, "actual": total_actual,
                "variance": _money(total_budget-total_actual),
                "usage_percent": round(total_actual/total_budget*100,2) if total_budget else 0,
                "over_budget_count": len([item for item in items if item["over_budget"]]),
            },
            "items": items,
        }
