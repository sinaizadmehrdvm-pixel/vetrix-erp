
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy import text
from app.database import engine

router = APIRouter(prefix="/api/accounting/entries", tags=["Accounting Entries"])

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

def _dict(row):
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)

def _ensure_tables():
    with engine.connect() as conn:
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
        conn.commit()

def _next_voucher_no(conn):
    return int(conn.execute(text("SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM accounting_vouchers")).scalar() or 1)

def _get_account(conn, account_id: int):
    row = conn.execute(text("SELECT id, code, name, is_active FROM chart_accounts WHERE id=:id"), {"id": account_id}).fetchone()
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

@router.get("/health")
def entries_health():
    _ensure_tables()
    return {"ok": True, "module": "accounting_entries", "version": "6.2"}

@router.get("")
def list_vouchers(status: str = "", q: str = "", limit: int = 100):
    _ensure_tables()
    where = []
    params = {"limit": limit}
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
        """), {
            "voucher_no": voucher_no, "voucher_date": voucher_date, "description": payload.description,
            "status": payload.status, "source_type": payload.source_type, "source_id": payload.source_id,
            "total_debit": total_debit, "total_credit": total_credit, "now": now, "posted_at": posted_at,
        })
        voucher_id = result.lastrowid
        for line in payload.lines:
            account = _get_account(conn, line.account_id)
            conn.execute(text("""
                INSERT INTO accounting_voucher_lines
                (voucher_id, account_id, account_code, account_name, description, debit, credit, created_at)
                VALUES (:voucher_id, :account_id, :account_code, :account_name, :description, :debit, :credit, :now)
            """), {
                "voucher_id": voucher_id, "account_id": line.account_id,
                "account_code": account.get("code") or "", "account_name": account.get("name") or "",
                "description": line.description, "debit": float(line.debit or 0), "credit": float(line.credit or 0),
                "now": now,
            })
        conn.commit()
    return get_voucher(voucher_id)

@router.post("/{voucher_id}/post")
def post_voucher(voucher_id: int):
    now = datetime.utcnow().isoformat()
    current = get_voucher(voucher_id)
    if current.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled voucher cannot be posted")
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

@router.get("/reports/journal")
def journal_report(status: str = "", q: str = ""):
    _ensure_tables()
    where = []
    params = {}
    if status:
        where.append("v.status=:status")
        params["status"] = status
    if q:
        where.append("(v.description LIKE :q OR l.description LIKE :q OR l.account_name LIKE :q OR l.account_code LIKE :q)")
        params["q"] = f"%{q}%"
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
    sql += " ORDER BY v.voucher_no DESC, l.id ASC"
    with engine.connect() as conn:
        return [_dict(r) for r in conn.execute(text(sql), params).fetchall()]
