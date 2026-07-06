from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/accounting", tags=["Accounting Core"])


class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: str = "asset"
    level: str = "group"
    parent_id: Optional[int] = None
    normal_balance: str = "debit"
    description: str = ""
    color: str = "#22d3ee"
    is_active: bool = True
    cost_center_id: Optional[int] = None
    project_id: Optional[int] = None
    currency_id: Optional[int] = None


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    account_type: Optional[str] = None
    level: Optional[str] = None
    parent_id: Optional[int] = None
    normal_balance: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    cost_center_id: Optional[int] = None
    project_id: Optional[int] = None
    currency_id: Optional[int] = None


VALID_TYPES = {"asset", "liability", "equity", "revenue", "expense", "contra"}
VALID_LEVELS = {"group", "ledger", "subsidiary", "detail"}
VALID_BALANCES = {"debit", "credit"}


def _dict(row):
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)


def _ensure_tables():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chart_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code VARCHAR NOT NULL UNIQUE,
                name VARCHAR NOT NULL,
                account_type VARCHAR DEFAULT 'asset',
                level VARCHAR DEFAULT 'group',
                parent_id INTEGER,
                normal_balance VARCHAR DEFAULT 'debit',
                description TEXT DEFAULT '',
                color VARCHAR DEFAULT '#22d3ee',
                is_active BOOLEAN DEFAULT 1,
                cost_center_id INTEGER,
                project_id INTEGER,
                currency_id INTEGER,
                created_at VARCHAR,
                updated_at VARCHAR
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS cost_centers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code VARCHAR UNIQUE,
                name VARCHAR NOT NULL,
                is_active BOOLEAN DEFAULT 1
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS accounting_projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code VARCHAR UNIQUE,
                name VARCHAR NOT NULL,
                is_active BOOLEAN DEFAULT 1
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS accounting_currencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code VARCHAR UNIQUE,
                name VARCHAR NOT NULL,
                symbol VARCHAR DEFAULT '',
                rate FLOAT DEFAULT 1,
                is_base BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1
            )
        """))
        conn.commit()


def _seed_defaults():
    _ensure_tables()
    defaults = [
        ("1", "دارایی‌ها", "asset", "group", None, "debit", "#22d3ee"),
        ("11", "دارایی‌های جاری", "asset", "ledger", 1, "debit", "#38bdf8"),
        ("1101", "صندوق", "asset", "subsidiary", 2, "debit", "#06b6d4"),
        ("1102", "بانک", "asset", "subsidiary", 2, "debit", "#06b6d4"),
        ("1103", "حساب‌های دریافتنی", "asset", "subsidiary", 2, "debit", "#06b6d4"),
        ("2", "بدهی‌ها", "liability", "group", None, "credit", "#fb7185"),
        ("21", "بدهی‌های جاری", "liability", "ledger", 6, "credit", "#f97316"),
        ("2101", "حساب‌های پرداختنی", "liability", "subsidiary", 7, "credit", "#fb7185"),
        ("3", "حقوق صاحبان سرمایه", "equity", "group", None, "credit", "#a78bfa"),
        ("4", "درآمدها", "revenue", "group", None, "credit", "#34d399"),
        ("4101", "فروش کالا و خدمات", "revenue", "subsidiary", 10, "credit", "#10b981"),
        ("5", "هزینه‌ها", "expense", "group", None, "debit", "#facc15"),
        ("5101", "بهای تمام شده کالا", "expense", "subsidiary", 12, "debit", "#f59e0b"),
        ("5102", "هزینه‌های اداری و عمومی", "expense", "subsidiary", 12, "debit", "#f59e0b"),
    ]
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM chart_accounts")).scalar() or 0
        if count == 0:
            now = datetime.utcnow().isoformat()
            for code, name, account_type, level, parent_id, normal_balance, color in defaults:
                conn.execute(text("""
                    INSERT INTO chart_accounts
                    (code, name, account_type, level, parent_id, normal_balance, color, is_active, created_at, updated_at)
                    VALUES (:code, :name, :account_type, :level, :parent_id, :normal_balance, :color, 1, :now, :now)
                """), dict(code=code, name=name, account_type=account_type, level=level, parent_id=parent_id, normal_balance=normal_balance, color=color, now=now))
        if (conn.execute(text("SELECT COUNT(*) FROM accounting_currencies")).scalar() or 0) == 0:
            conn.execute(text("INSERT INTO accounting_currencies (code, name, symbol, rate, is_base, is_active) VALUES ('IRR', 'ریال / تومان', 'تومان', 1, 1, 1)"))
        if (conn.execute(text("SELECT COUNT(*) FROM cost_centers")).scalar() or 0) == 0:
            conn.execute(text("INSERT INTO cost_centers (code, name, is_active) VALUES ('MAIN', 'مرکز اصلی', 1)"))
        if (conn.execute(text("SELECT COUNT(*) FROM accounting_projects")).scalar() or 0) == 0:
            conn.execute(text("INSERT INTO accounting_projects (code, name, is_active) VALUES ('GENERAL', 'پروژه عمومی', 1)"))
        conn.commit()


_seed_defaults()


def _validate_account(payload):
    if payload.account_type and payload.account_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid account_type")
    if payload.level and payload.level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level")
    if payload.normal_balance and payload.normal_balance not in VALID_BALANCES:
        raise HTTPException(status_code=400, detail="Invalid normal_balance")


@router.get("/health")
def accounting_health():
    _ensure_tables()
    return {"ok": True, "module": "accounting_core", "version": "7.1"}


@router.get("/chart")
def list_accounts(q: str = "", account_type: str = "", level: str = "", active: str = "all"):
    _ensure_tables()
    where = []
    params = {}
    if q:
        where.append("(code LIKE :q OR name LIKE :q OR description LIKE :q)")
        params["q"] = f"%{q}%"
    if account_type:
        where.append("account_type = :account_type")
        params["account_type"] = account_type
    if level:
        where.append("level = :level")
        params["level"] = level
    if active != "all":
        where.append("is_active = :is_active")
        params["is_active"] = 1 if active in ["1", "true", "active"] else 0
    sql = "SELECT * FROM chart_accounts"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY code ASC"
    with engine.connect() as conn:
        return [_dict(r) for r in conn.execute(text(sql), params).fetchall()]


@router.get("/chart/tree")
def account_tree():
    accounts = list_accounts()
    by_parent = {}
    for account in accounts:
        by_parent.setdefault(account.get("parent_id"), []).append({**account, "children": []})

    def attach(parent_id):
        nodes = by_parent.get(parent_id, [])
        for node in nodes:
            node["children"] = attach(node["id"])
        return nodes

    return attach(None)


@router.get("/chart/{account_id}")
def get_account(account_id: int):
    _ensure_tables()
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM chart_accounts WHERE id=:id"), {"id": account_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found")
        return _dict(row)


@router.post("/chart")
def create_account(payload: AccountCreate):
    _ensure_tables()
    _validate_account(payload)
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        exists = conn.execute(text("SELECT id FROM chart_accounts WHERE code=:code"), {"code": payload.code}).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="Account code already exists")
        result = conn.execute(text("""
            INSERT INTO chart_accounts
            (code, name, account_type, level, parent_id, normal_balance, description, color, is_active, cost_center_id, project_id, currency_id, created_at, updated_at)
            VALUES (:code, :name, :account_type, :level, :parent_id, :normal_balance, :description, :color, :is_active, :cost_center_id, :project_id, :currency_id, :now, :now)
        """), {**payload.dict(), "now": now})
        conn.commit()
        new_id = result.lastrowid
    return get_account(new_id)


@router.put("/chart/{account_id}")
def update_account(account_id: int, payload: AccountUpdate):
    _ensure_tables()
    current = get_account(account_id)
    merged = {**current, **{k: v for k, v in payload.dict().items() if v is not None}}
    checker = AccountCreate(**{k: merged[k] for k in AccountCreate.__fields__.keys()})
    _validate_account(checker)
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        duplicate = conn.execute(text("SELECT id FROM chart_accounts WHERE code=:code AND id != :id"), {"code": merged["code"], "id": account_id}).fetchone()
        if duplicate:
            raise HTTPException(status_code=400, detail="Account code already exists")
        conn.execute(text("""
            UPDATE chart_accounts SET
            code=:code, name=:name, account_type=:account_type, level=:level, parent_id=:parent_id,
            normal_balance=:normal_balance, description=:description, color=:color, is_active=:is_active,
            cost_center_id=:cost_center_id, project_id=:project_id, currency_id=:currency_id, updated_at=:now
            WHERE id=:id
        """), {**merged, "id": account_id, "now": now})
        conn.commit()
    return get_account(account_id)


@router.delete("/chart/{account_id}")
def delete_account(account_id: int):
    _ensure_tables()
    with engine.connect() as conn:
        child = conn.execute(text("SELECT id FROM chart_accounts WHERE parent_id=:id LIMIT 1"), {"id": account_id}).fetchone()
        if child:
            raise HTTPException(status_code=400, detail="Cannot delete account with children")
        conn.execute(text("DELETE FROM chart_accounts WHERE id=:id"), {"id": account_id})
        conn.commit()
    return {"ok": True, "deleted_id": account_id}


@router.post("/chart/{account_id}/toggle")
def toggle_account(account_id: int):
    current = get_account(account_id)
    return update_account(account_id, AccountUpdate(is_active=not bool(current.get("is_active"))))


@router.post("/seed")
def seed_accounting():
    _seed_defaults()
    return {"ok": True, "accounts": len(list_accounts())}


@router.get("/meta")
def accounting_meta():
    _ensure_tables()
    with engine.connect() as conn:
        return {
            "cost_centers": [_dict(r) for r in conn.execute(text("SELECT * FROM cost_centers ORDER BY code")).fetchall()],
            "projects": [_dict(r) for r in conn.execute(text("SELECT * FROM accounting_projects ORDER BY code")).fetchall()],
            "currencies": [_dict(r) for r in conn.execute(text("SELECT * FROM accounting_currencies ORDER BY code")).fetchall()],
            "account_types": sorted(VALID_TYPES),
            "levels": sorted(VALID_LEVELS),
            "normal_balances": sorted(VALID_BALANCES),
        }
