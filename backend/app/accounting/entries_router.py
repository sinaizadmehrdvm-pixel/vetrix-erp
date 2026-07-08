from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy import text
from app.database import engine

router = APIRouter(prefix="/api/accounting/entries", tags=["Accounting Entries"])


class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: str = "asset"
    level: str = "subsidiary"
    parent_id: Optional[int] = None
    normal_balance: str = "debit"
    description: str = ""
    color: str = "#22d3ee"
    is_active: bool = True


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


class VoucherLineIn(BaseModel):
    account_id: int
    description: str = ""
    debit: float = 0
    credit: float = 0


class VoucherCreate(BaseModel):
    voucher_date: str = ""
    description: str = ""
    status: str = "draft"
    source_type: str = "manual"
    source_id: Optional[int] = None
    lines: List[VoucherLineIn]


class VoucherUpdate(BaseModel):
    voucher_date: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    lines: Optional[List[VoucherLineIn]] = None


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
                level VARCHAR DEFAULT 'subsidiary',
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
            CREATE TABLE IF NOT EXISTS accounting_vouchers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                voucher_no INTEGER NOT NULL UNIQUE,
                voucher_date VARCHAR,
                description TEXT DEFAULT '',
                status VARCHAR DEFAULT 'draft',
                source_type VARCHAR DEFAULT 'manual',
                source_id INTEGER,
                total_debit FLOAT DEFAULT 0,
                total_credit FLOAT DEFAULT 0,
                created_at VARCHAR,
                updated_at VARCHAR,
                posted_at VARCHAR
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS accounting_voucher_lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                voucher_id INTEGER NOT NULL,
                account_id INTEGER NOT NULL,
                account_code VARCHAR DEFAULT '',
                account_name VARCHAR DEFAULT '',
                description TEXT DEFAULT '',
                debit FLOAT DEFAULT 0,
                credit FLOAT DEFAULT 0,
                created_at VARCHAR
            )
        """))
        count = conn.execute(text("SELECT COUNT(*) FROM chart_accounts")).scalar() or 0
        if count == 0:
            now = datetime.utcnow().isoformat()
            defaults = [
                ("1", "دارایی‌ها", "asset", "group", None, "debit", "#22d3ee"),
                ("11", "دارایی‌های جاری", "asset", "ledger", 1, "debit", "#38bdf8"),
                ("1101", "صندوق", "asset", "subsidiary", 2, "debit", "#06b6d4"),
                ("1102", "بانک", "asset", "subsidiary", 2, "debit", "#06b6d4"),
                ("1103", "حساب‌های دریافتنی", "asset", "subsidiary", 2, "debit", "#06b6d4"),
                ("12", "موجودی و دارایی عملیاتی", "asset", "ledger", 1, "debit", "#38bdf8"),
                ("1201", "موجودی کالا", "asset", "subsidiary", 6, "debit", "#06b6d4"),
                ("2", "بدهی‌ها", "liability", "group", None, "credit", "#fb7185"),
                ("21", "بدهی‌های جاری", "liability", "ledger", 8, "credit", "#f97316"),
                ("2101", "حساب‌های پرداختنی", "liability", "subsidiary", 9, "credit", "#fb7185"),
                ("3", "حقوق صاحبان سرمایه", "equity", "group", None, "credit", "#a78bfa"),
                ("3101", "سرمایه", "equity", "subsidiary", 11, "credit", "#a78bfa"),
                ("4", "درآمدها", "revenue", "group", None, "credit", "#34d399"),
                ("4101", "فروش کالا و خدمات", "revenue", "subsidiary", 13, "credit", "#10b981"),
                ("5", "هزینه‌ها", "expense", "group", None, "debit", "#facc15"),
                ("5101", "بهای تمام شده کالا", "expense", "subsidiary", 15, "debit", "#f59e0b"),
                ("5102", "هزینه‌های اداری و عمومی", "expense", "subsidiary", 15, "debit", "#f59e0b"),
            ]
            for code, name, account_type, level, parent_id, normal_balance, color in defaults:
                conn.execute(text("""
                    INSERT INTO chart_accounts
                    (code, name, account_type, level, parent_id, normal_balance, color, is_active, created_at, updated_at)
                    VALUES (:code, :name, :account_type, :level, :parent_id, :normal_balance, :color, 1, :now, :now)
                """), dict(code=code, name=name, account_type=account_type, level=level, parent_id=parent_id, normal_balance=normal_balance, color=color, now=now))
        conn.commit()


def _validate_account_payload(payload):
    if payload.account_type and payload.account_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid account_type")
    if payload.level and payload.level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level")
    if payload.normal_balance and payload.normal_balance not in VALID_BALANCES:
        raise HTTPException(status_code=400, detail="Invalid normal_balance")


def _next_voucher_no(conn):
    return int(conn.execute(text("SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM accounting_vouchers")).scalar() or 1)


def _get_account(conn, account_id: int):
    row = conn.execute(text("SELECT id, code, name, account_type, normal_balance, is_active FROM chart_accounts WHERE id=:id"), {"id": account_id}).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail=f"Account not found: {account_id}")
    account = _dict(row)
    if account.get("is_active") in [0, False]:
        raise HTTPException(status_code=400, detail=f"Account is inactive: {account.get('name')}")
    return account


def _validate_lines(conn, lines):
    if len(lines) < 2:
        raise HTTPException(status_code=400, detail="Voucher needs at least 2 lines")
    debit = round(sum(float(x.debit or 0) for x in lines), 2)
    credit = round(sum(float(x.credit or 0) for x in lines), 2)
    if debit <= 0 or credit <= 0:
        raise HTTPException(status_code=400, detail="Debit and credit must be greater than zero")
    if debit != credit:
        raise HTTPException(status_code=400, detail=f"Voucher is not balanced: debit={debit}, credit={credit}")
    for line in lines:
        d = float(line.debit or 0)
        c = float(line.credit or 0)
        if d < 0 or c < 0:
            raise HTTPException(status_code=400, detail="Debit/Credit cannot be negative")
        if d > 0 and c > 0:
            raise HTTPException(status_code=400, detail="A line cannot have both debit and credit")
        if d == 0 and c == 0:
            raise HTTPException(status_code=400, detail="A line must have debit or credit")
        _get_account(conn, line.account_id)
    return debit, credit


def _date_filters(alias="v", from_date: str = "", to_date: str = ""):
    where = []
    params = {}
    if from_date:
        where.append(f"{alias}.voucher_date >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append(f"{alias}.voucher_date <= :to_date")
        params["to_date"] = to_date
    return where, params


@router.get("/health")
def entries_health():
    _ensure_tables()
    return {"ok": True, "module": "accounting_entries", "version": "7.3"}


@router.get("/chart")
def list_accounts(q: str = "", account_type: str = "", level: str = "", active: str = "all"):
    _ensure_tables()
    where = []
    params = {}
    if q:
        where.append("(code LIKE :q OR name LIKE :q OR description LIKE :q)")
        params["q"] = f"%{q}%"
    if account_type:
        where.append("account_type=:account_type")
        params["account_type"] = account_type
    if level:
        where.append("level=:level")
        params["level"] = level
    if active != "all":
        where.append("is_active=:is_active")
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
    _validate_account_payload(payload)
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        duplicate = conn.execute(text("SELECT id FROM chart_accounts WHERE code=:code"), {"code": payload.code}).fetchone()
        if duplicate:
            raise HTTPException(status_code=400, detail="Account code already exists")
        result = conn.execute(text("""
            INSERT INTO chart_accounts
            (code, name, account_type, level, parent_id, normal_balance, description, color, is_active, created_at, updated_at)
            VALUES (:code, :name, :account_type, :level, :parent_id, :normal_balance, :description, :color, :is_active, :now, :now)
        """), {**payload.dict(), "now": now})
        conn.commit()
        return get_account(result.lastrowid)


@router.put("/chart/{account_id}")
def update_account(account_id: int, payload: AccountUpdate):
    current = get_account(account_id)
    merged = {**current, **{k: v for k, v in payload.dict().items() if v is not None}}
    checker = AccountCreate(**{k: merged[k] for k in AccountCreate.__fields__.keys()})
    _validate_account_payload(checker)
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        duplicate = conn.execute(text("SELECT id FROM chart_accounts WHERE code=:code AND id != :id"), {"code": merged["code"], "id": account_id}).fetchone()
        if duplicate:
            raise HTTPException(status_code=400, detail="Account code already exists")
        conn.execute(text("""
            UPDATE chart_accounts SET
            code=:code, name=:name, account_type=:account_type, level=:level, parent_id=:parent_id,
            normal_balance=:normal_balance, description=:description, color=:color, is_active=:is_active,
            updated_at=:now
            WHERE id=:id
        """), {**merged, "id": account_id, "now": now})
        conn.commit()
    return get_account(account_id)


@router.post("/chart/{account_id}/toggle")
def toggle_account(account_id: int):
    current = get_account(account_id)
    return update_account(account_id, AccountUpdate(is_active=not bool(current.get("is_active"))))


@router.delete("/chart/{account_id}")
def delete_account(account_id: int):
    _ensure_tables()
    with engine.connect() as conn:
        child = conn.execute(text("SELECT id FROM chart_accounts WHERE parent_id=:id LIMIT 1"), {"id": account_id}).fetchone()
        used = conn.execute(text("SELECT id FROM accounting_voucher_lines WHERE account_id=:id LIMIT 1"), {"id": account_id}).fetchone()
        if child:
            raise HTTPException(status_code=400, detail="Cannot delete account with children")
        if used:
            raise HTTPException(status_code=400, detail="Cannot delete account used in vouchers")
        conn.execute(text("DELETE FROM chart_accounts WHERE id=:id"), {"id": account_id})
        conn.commit()
    return {"ok": True, "deleted_id": account_id}


@router.post("/seed")
def seed_accounting_entries():
    _ensure_tables()
    return {"ok": True, "accounts": len(list_accounts())}


@router.get("/meta")
def accounting_entries_meta():
    _ensure_tables()
    return {
        "cost_centers": [],
        "projects": [],
        "currencies": [{"code": "IRR", "name": "ریال / تومان", "symbol": "تومان", "rate": 1, "is_base": True, "is_active": True}],
        "account_types": sorted(VALID_TYPES),
        "levels": sorted(VALID_LEVELS),
        "normal_balances": sorted(VALID_BALANCES),
    }


@router.get("")
def list_vouchers(status: str = "", q: str = "", limit: int = 100):
    _ensure_tables()
    where = []
    params = {"limit": max(1, min(int(limit or 100), 500))}
    if status:
        where.append("status=:status")
        params["status"] = status
    if q:
        where.append("(description LIKE :q OR source_type LIKE :q)")
        params["q"] = f"%{q}%"
    sql = "SELECT * FROM accounting_vouchers"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY voucher_no DESC LIMIT :limit"
    with engine.connect() as conn:
        return [_dict(r) for r in conn.execute(text(sql), params).fetchall()]


@router.get("/reports/summary")
def accounting_summary(from_date: str = "", to_date: str = ""):
    _ensure_tables()
    where, params = _date_filters("v", from_date, to_date)
    sql_where = ""
    if where:
        sql_where = " WHERE " + " AND ".join(where)
    with engine.connect() as conn:
        row = conn.execute(text(f"""
            SELECT COUNT(*) AS vouchers_count,
                   SUM(CASE WHEN status='posted' THEN 1 ELSE 0 END) AS posted_count,
                   SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft_count,
                   SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
                   COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_debit ELSE 0 END), 0) AS total_debit,
                   COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_credit ELSE 0 END), 0) AS total_credit
            FROM accounting_vouchers v
            {sql_where}
        """), params).fetchone()
        data = _dict(row)
        data["difference"] = round(float(data.get("total_debit") or 0) - float(data.get("total_credit") or 0), 2)
        data["balanced"] = abs(data["difference"]) < 0.01
        return data


@router.get("/reports/journal")
def journal_report(status: str = "posted", q: str = "", from_date: str = "", to_date: str = "", limit: int = 1000):
    _ensure_tables()
    where, params = _date_filters("v", from_date, to_date)
    params["limit"] = max(1, min(int(limit or 1000), 5000))
    if status and status != "all":
        where.append("v.status=:status")
        params["status"] = status
    if q:
        where.append("(v.description LIKE :q OR l.description LIKE :q OR l.account_name LIKE :q OR l.account_code LIKE :q)")
        params["q"] = f"%{q}%"
    sql = """
        SELECT v.id as voucher_id, v.voucher_no, v.voucher_date, v.status,
               v.description as voucher_description, v.source_type, v.source_id,
               l.id as line_id, l.account_id, l.account_code, l.account_name,
               l.description as line_description, l.debit, l.credit
        FROM accounting_vouchers v
        JOIN accounting_voucher_lines l ON l.voucher_id = v.id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY v.voucher_date ASC, v.voucher_no ASC, l.id ASC LIMIT :limit"
    with engine.connect() as conn:
        return [_dict(r) for r in conn.execute(text(sql), params).fetchall()]


@router.get("/reports/ledger")
def ledger_report(account_id: Optional[int] = None, account_code: str = "", status: str = "posted", from_date: str = "", to_date: str = ""):
    _ensure_tables()
    where, params = _date_filters("v", from_date, to_date)
    if status and status != "all":
        where.append("v.status=:status")
        params["status"] = status
    if account_id:
        where.append("l.account_id=:account_id")
        params["account_id"] = account_id
    if account_code:
        where.append("l.account_code=:account_code")
        params["account_code"] = account_code
    sql = """
        SELECT v.id as voucher_id, v.voucher_no, v.voucher_date, v.status,
               v.description as voucher_description,
               l.id as line_id, l.account_id, l.account_code, l.account_name,
               l.description as line_description, l.debit, l.credit
        FROM accounting_vouchers v
        JOIN accounting_voucher_lines l ON l.voucher_id = v.id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY l.account_code ASC, v.voucher_date ASC, v.voucher_no ASC, l.id ASC"
    with engine.connect() as conn:
        rows = [_dict(r) for r in conn.execute(text(sql), params).fetchall()]
    balances = {}
    out = []
    for row in rows:
        key = str(row.get("account_id"))
        current = float(balances.get(key, 0) or 0) + float(row.get("debit") or 0) - float(row.get("credit") or 0)
        balances[key] = current
        out.append({**row, "running_balance": round(current, 2)})
    return out


@router.get("/reports/trial-balance")
def trial_balance(status: str = "posted", from_date: str = "", to_date: str = "", include_zero: bool = False):
    _ensure_tables()
    where, params = _date_filters("v", from_date, to_date)
    if status and status != "all":
        where.append("v.status=:status")
        params["status"] = status
    sql_where = ""
    if where:
        sql_where = " AND " + " AND ".join(where)
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT a.id AS account_id, a.code AS account_code, a.name AS account_name,
                   a.account_type, a.normal_balance,
                   COALESCE(SUM(l.debit), 0) AS debit,
                   COALESCE(SUM(l.credit), 0) AS credit
            FROM chart_accounts a
            LEFT JOIN accounting_voucher_lines l ON l.account_id = a.id
            LEFT JOIN accounting_vouchers v ON v.id = l.voucher_id {sql_where}
            GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
            ORDER BY a.code ASC
        """), params).fetchall()
    result = []
    total_debit = 0
    total_credit = 0
    for r in rows:
        item = _dict(r)
        debit = float(item.get("debit") or 0)
        credit = float(item.get("credit") or 0)
        balance = debit - credit
        item["debit"] = round(debit, 2)
        item["credit"] = round(credit, 2)
        item["balance"] = round(balance, 2)
        item["debit_balance"] = round(balance if balance > 0 else 0, 2)
        item["credit_balance"] = round(abs(balance) if balance < 0 else 0, 2)
        if include_zero or debit or credit or balance:
            result.append(item)
            total_debit += item["debit_balance"]
            total_credit += item["credit_balance"]
    return {"rows": result, "totals": {"debit_balance": round(total_debit, 2), "credit_balance": round(total_credit, 2), "difference": round(total_debit - total_credit, 2), "balanced": abs(total_debit - total_credit) < 0.01}}


@router.get("/{voucher_id}")
def get_voucher(voucher_id: int):
    _ensure_tables()
    with engine.connect() as conn:
        voucher = conn.execute(text("SELECT * FROM accounting_vouchers WHERE id=:id"), {"id": voucher_id}).fetchone()
        if not voucher:
            raise HTTPException(status_code=404, detail="Voucher not found")
        lines = conn.execute(text("SELECT * FROM accounting_voucher_lines WHERE voucher_id=:id ORDER BY id"), {"id": voucher_id}).fetchall()
        return {**_dict(voucher), "lines": [_dict(x) for x in lines]}


@router.post("")
def create_voucher(payload: VoucherCreate):
    _ensure_tables()
    if payload.status not in ["draft", "posted"]:
        raise HTTPException(status_code=400, detail="status must be draft or posted")
    now = datetime.utcnow().isoformat()
    voucher_date = payload.voucher_date or datetime.utcnow().date().isoformat()
    with engine.connect() as conn:
        total_debit, total_credit = _validate_lines(conn, payload.lines)
        voucher_no = _next_voucher_no(conn)
        posted_at = now if payload.status == "posted" else ""
        result = conn.execute(text("""
            INSERT INTO accounting_vouchers
            (voucher_no, voucher_date, description, status, source_type, source_id, total_debit, total_credit, created_at, updated_at, posted_at)
            VALUES (:voucher_no, :voucher_date, :description, :status, :source_type, :source_id, :total_debit, :total_credit, :now, :now, :posted_at)
        """), {"voucher_no": voucher_no, "voucher_date": voucher_date, "description": payload.description, "status": payload.status, "source_type": payload.source_type, "source_id": payload.source_id, "total_debit": total_debit, "total_credit": total_credit, "now": now, "posted_at": posted_at})
        voucher_id = result.lastrowid
        for line in payload.lines:
            account = _get_account(conn, line.account_id)
            conn.execute(text("""
                INSERT INTO accounting_voucher_lines
                (voucher_id, account_id, account_code, account_name, description, debit, credit, created_at)
                VALUES (:voucher_id, :account_id, :account_code, :account_name, :description, :debit, :credit, :now)
            """), {"voucher_id": voucher_id, "account_id": line.account_id, "account_code": account.get("code") or "", "account_name": account.get("name") or "", "description": line.description, "debit": float(line.debit or 0), "credit": float(line.credit or 0), "now": now})
        conn.commit()
    return get_voucher(voucher_id)


@router.post("/{voucher_id}/post")
def post_voucher(voucher_id: int):
    now = datetime.utcnow().isoformat()
    current = get_voucher(voucher_id)
    if current.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled voucher cannot be posted")
    if round(float(current.get("total_debit") or 0), 2) != round(float(current.get("total_credit") or 0), 2):
        raise HTTPException(status_code=400, detail="Unbalanced voucher cannot be posted")
    with engine.connect() as conn:
        conn.execute(text("UPDATE accounting_vouchers SET status='posted', posted_at=:now, updated_at=:now WHERE id=:id"), {"id": voucher_id, "now": now})
        conn.commit()
    return get_voucher(voucher_id)


@router.post("/{voucher_id}/cancel")
def cancel_voucher(voucher_id: int):
    now = datetime.utcnow().isoformat()
    get_voucher(voucher_id)
    with engine.connect() as conn:
        conn.execute(text("UPDATE accounting_vouchers SET status='cancelled', updated_at=:now WHERE id=:id"), {"id": voucher_id, "now": now})
        conn.commit()
    return get_voucher(voucher_id)


@router.delete("/{voucher_id}")
def delete_voucher(voucher_id: int):
    current = get_voucher(voucher_id)
    if current.get("status") == "posted":
        raise HTTPException(status_code=400, detail="Posted voucher cannot be deleted")
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM accounting_voucher_lines WHERE voucher_id=:id"), {"id": voucher_id})
        conn.execute(text("DELETE FROM accounting_vouchers WHERE id=:id"), {"id": voucher_id})
        conn.commit()
    return {"ok": True, "deleted_id": voucher_id}
