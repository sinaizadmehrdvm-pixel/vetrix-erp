from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/accounting/bank-reconciliation", tags=["Bank Reconciliation"])
MONEY_STEP = Decimal("0.01")


def _money(value):
    return float(Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP))


class BankAccountCreate(BaseModel):
    name: str
    bank_name: str = ""
    account_number: str = ""
    iban: str = ""
    ledger_account_code: str = "1102"
    opening_balance: float = 0


class StatementLineCreate(BaseModel):
    transaction_date: date
    description: str = ""
    reference: str = ""
    amount: float


class MatchCreate(BaseModel):
    voucher_line_id: int


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            bank_name VARCHAR DEFAULT '',
            account_number VARCHAR DEFAULT '',
            iban VARCHAR DEFAULT '',
            ledger_account_code VARCHAR NOT NULL DEFAULT '1102',
            opening_balance FLOAT NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bank_statement_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_account_id INTEGER NOT NULL,
            transaction_date DATE NOT NULL,
            description VARCHAR DEFAULT '',
            reference VARCHAR DEFAULT '',
            amount FLOAT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            statement_line_id INTEGER NOT NULL UNIQUE,
            voucher_line_id INTEGER NOT NULL UNIQUE,
            matched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(statement_line_id) REFERENCES bank_statement_lines(id),
            FOREIGN KEY(voucher_line_id) REFERENCES accounting_voucher_lines(id)
        )
    """))


def _account(conn, account_id):
    _ensure_schema(conn)
    row = conn.execute(text(
        "SELECT * FROM bank_accounts WHERE id=:id"
    ), {"id": account_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return dict(row)


@router.get("/accounts")
def list_bank_accounts():
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT a.*,
                   COUNT(DISTINCT s.id) AS statement_count,
                   COUNT(DISTINCT m.id) AS matched_count
            FROM bank_accounts a
            LEFT JOIN bank_statement_lines s ON s.bank_account_id=a.id
            LEFT JOIN bank_reconciliation_matches m
              ON m.statement_line_id=s.id
            GROUP BY a.id
            ORDER BY a.active DESC, a.id DESC
        """)).mappings().all()
        return [dict(row) for row in rows]


@router.post("/accounts")
def create_bank_account(data: BankAccountCreate):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Account name is required")
    with engine.begin() as conn:
        _ensure_schema(conn)
        chart = conn.execute(text("""
            SELECT code, name FROM chart_accounts
            WHERE code=:code AND account_type='asset'
        """), {"code": data.ledger_account_code}).mappings().first()
        if not chart:
            raise HTTPException(status_code=400, detail="Ledger asset account not found")
        result = conn.execute(text("""
            INSERT INTO bank_accounts
              (name, bank_name, account_number, iban, ledger_account_code,
               opening_balance, active, created_at)
            VALUES
              (:name, :bank_name, :account_number, :iban, :ledger_account_code,
               :opening_balance, 1, :created_at)
        """), {
            "name": name,
            "bank_name": data.bank_name.strip(),
            "account_number": data.account_number.strip(),
            "iban": data.iban.strip(),
            "ledger_account_code": data.ledger_account_code,
            "opening_balance": _money(data.opening_balance),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": result.lastrowid}


@router.delete("/accounts/{account_id}")
def delete_bank_account(account_id: int):
    with engine.begin() as conn:
        _account(conn, account_id)
        count = conn.execute(text("""
            SELECT COUNT(*) FROM bank_statement_lines
            WHERE bank_account_id=:id
        """), {"id": account_id}).scalar() or 0
        if count:
            raise HTTPException(
                status_code=409,
                detail="Account has statement history and cannot be deleted",
            )
        conn.execute(text("DELETE FROM bank_accounts WHERE id=:id"), {"id": account_id})
        return {"status": "deleted", "id": account_id}


@router.get("/accounts/{account_id}/statement")
def list_statement_lines(
    account_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
):
    with engine.begin() as conn:
        _account(conn, account_id)
        rows = conn.execute(text("""
            SELECT s.*, m.id AS match_id, m.voucher_line_id,
                   v.id AS voucher_id, v.voucher_no, v.source_type,
                   l.debit AS ledger_debit, l.credit AS ledger_credit,
                   l.description AS ledger_description
            FROM bank_statement_lines s
            LEFT JOIN bank_reconciliation_matches m
              ON m.statement_line_id=s.id
            LEFT JOIN accounting_voucher_lines l ON l.id=m.voucher_line_id
            LEFT JOIN accounting_vouchers v ON v.id=l.voucher_id
            WHERE s.bank_account_id=:account_id
              AND (:date_from IS NULL OR s.transaction_date>=:date_from)
              AND (:date_to IS NULL OR s.transaction_date<=:date_to)
            ORDER BY s.transaction_date DESC, s.id DESC
        """), {
            "account_id": account_id,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        }).mappings().all()
        return [{
            **dict(row),
            "amount": _money(row["amount"]),
            "ledger_amount": (
                _money((row["ledger_debit"] or 0) - (row["ledger_credit"] or 0))
                if row["voucher_line_id"] else None
            ),
            "matched": bool(row["match_id"]),
        } for row in rows]


@router.post("/accounts/{account_id}/statement")
def create_statement_line(account_id: int, data: StatementLineCreate):
    amount = _money(data.amount)
    if amount == 0:
        raise HTTPException(status_code=400, detail="Statement amount cannot be zero")
    with engine.begin() as conn:
        _account(conn, account_id)
        result = conn.execute(text("""
            INSERT INTO bank_statement_lines
              (bank_account_id, transaction_date, description, reference,
               amount, created_at)
            VALUES
              (:account_id, :transaction_date, :description, :reference,
               :amount, :created_at)
        """), {
            "account_id": account_id,
            "transaction_date": data.transaction_date.isoformat(),
            "description": data.description.strip(),
            "reference": data.reference.strip(),
            "amount": amount,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": result.lastrowid, "amount": amount}


@router.delete("/statement/{statement_line_id}")
def delete_statement_line(statement_line_id: int):
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("""
            SELECT id FROM bank_statement_lines WHERE id=:id
        """), {"id": statement_line_id}).first()
        if not row:
            raise HTTPException(status_code=404, detail="Statement line not found")
        conn.execute(text("""
            DELETE FROM bank_reconciliation_matches
            WHERE statement_line_id=:id
        """), {"id": statement_line_id})
        conn.execute(text("""
            DELETE FROM bank_statement_lines WHERE id=:id
        """), {"id": statement_line_id})
        return {"status": "deleted", "id": statement_line_id}


@router.get("/accounts/{account_id}/candidates")
def match_candidates(
    account_id: int,
    statement_line_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
):
    with engine.begin() as conn:
        account = _account(conn, account_id)
        statement = None
        if statement_line_id is not None:
            statement = conn.execute(text("""
                SELECT * FROM bank_statement_lines
                WHERE id=:id AND bank_account_id=:account_id
            """), {
                "id": statement_line_id,
                "account_id": account_id,
            }).mappings().first()
            if not statement:
                raise HTTPException(status_code=404, detail="Statement line not found")
        rows = conn.execute(text("""
            SELECT l.id AS voucher_line_id, v.id AS voucher_id, v.voucher_no,
                   v.voucher_date, v.source_type, v.source_id,
                   l.description, l.debit, l.credit,
                   (l.debit-l.credit) AS amount
            FROM accounting_voucher_lines l
            JOIN accounting_vouchers v ON v.id=l.voucher_id
            LEFT JOIN bank_reconciliation_matches m
              ON m.voucher_line_id=l.id
            WHERE v.status='posted'
              AND l.account_code=:account_code
              AND m.id IS NULL
            ORDER BY v.voucher_date DESC, l.id DESC
            LIMIT :limit
        """), {
            "account_code": account["ledger_account_code"],
            "limit": limit,
        }).mappings().all()
        result = []
        for row in rows:
            item = dict(row)
            item["debit"] = _money(row["debit"])
            item["credit"] = _money(row["credit"])
            item["amount"] = _money(row["amount"])
            item["exact_amount"] = bool(
                statement and _money(row["amount"]) == _money(statement["amount"])
            )
            result.append(item)
        result.sort(key=lambda item: (not item["exact_amount"], item["voucher_date"]), reverse=False)
        return result


@router.post("/statement/{statement_line_id}/match")
def match_statement_line(statement_line_id: int, data: MatchCreate):
    with engine.begin() as conn:
        _ensure_schema(conn)
        statement = conn.execute(text("""
            SELECT s.*, a.ledger_account_code
            FROM bank_statement_lines s
            JOIN bank_accounts a ON a.id=s.bank_account_id
            WHERE s.id=:id
        """), {"id": statement_line_id}).mappings().first()
        if not statement:
            raise HTTPException(status_code=404, detail="Statement line not found")
        line = conn.execute(text("""
            SELECT l.*, v.status
            FROM accounting_voucher_lines l
            JOIN accounting_vouchers v ON v.id=l.voucher_id
            WHERE l.id=:id
        """), {"id": data.voucher_line_id}).mappings().first()
        if not line or line["status"] != "posted":
            raise HTTPException(status_code=404, detail="Posted ledger line not found")
        if line["account_code"] != statement["ledger_account_code"]:
            raise HTTPException(status_code=400, detail="Ledger account does not match bank account")
        ledger_amount = _money((line["debit"] or 0) - (line["credit"] or 0))
        if ledger_amount != _money(statement["amount"]):
            raise HTTPException(status_code=409, detail="Statement and ledger amounts do not match")
        try:
            result = conn.execute(text("""
                INSERT INTO bank_reconciliation_matches
                  (statement_line_id, voucher_line_id, matched_at)
                VALUES (:statement_line_id, :voucher_line_id, :matched_at)
            """), {
                "statement_line_id": statement_line_id,
                "voucher_line_id": data.voucher_line_id,
                "matched_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as error:
            raise HTTPException(status_code=409, detail="Statement or ledger line is already matched") from error
        return {"status": "matched", "id": result.lastrowid}


@router.delete("/statement/{statement_line_id}/match")
def unmatch_statement_line(statement_line_id: int):
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text("""
            DELETE FROM bank_reconciliation_matches
            WHERE statement_line_id=:id
        """), {"id": statement_line_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Match not found")
        return {"status": "unmatched", "statement_line_id": statement_line_id}


@router.get("/accounts/{account_id}/summary")
def reconciliation_summary(
    account_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
):
    with engine.begin() as conn:
        account = _account(conn, account_id)
        params = {
            "account_id": account_id,
            "account_code": account["ledger_account_code"],
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        }
        statement = conn.execute(text("""
            SELECT COUNT(*) AS total_count,
                   COALESCE(SUM(s.amount),0) AS total_amount,
                   SUM(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END) AS matched_count,
                   COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN s.amount ELSE 0 END),0) AS matched_amount
            FROM bank_statement_lines s
            LEFT JOIN bank_reconciliation_matches m ON m.statement_line_id=s.id
            WHERE s.bank_account_id=:account_id
              AND (:date_from IS NULL OR s.transaction_date>=:date_from)
              AND (:date_to IS NULL OR s.transaction_date<=:date_to)
        """), params).mappings().first()
        ledger = conn.execute(text("""
            SELECT COUNT(*) AS total_count,
                   COALESCE(SUM(l.debit-l.credit),0) AS total_amount,
                   SUM(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END) AS matched_count,
                   COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN l.debit-l.credit ELSE 0 END),0) AS matched_amount
            FROM accounting_voucher_lines l
            JOIN accounting_vouchers v ON v.id=l.voucher_id
            LEFT JOIN bank_reconciliation_matches m ON m.voucher_line_id=l.id
            WHERE v.status='posted' AND l.account_code=:account_code
              AND (:date_from IS NULL OR v.voucher_date>=:date_from)
              AND (:date_to IS NULL OR v.voucher_date<=:date_to)
        """), params).mappings().first()
        statement_total = _money(statement["total_amount"])
        ledger_total = _money(ledger["total_amount"])
        difference = _money(
            account["opening_balance"] + statement_total - ledger_total
        )
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "account": account,
            "date_from": params["date_from"],
            "date_to": params["date_to"],
            "statement": {
                "count": int(statement["total_count"] or 0),
                "amount": statement_total,
                "matched_count": int(statement["matched_count"] or 0),
                "matched_amount": _money(statement["matched_amount"]),
                "unmatched_count": int((statement["total_count"] or 0) - (statement["matched_count"] or 0)),
                "unmatched_amount": _money(statement_total - _money(statement["matched_amount"])),
            },
            "ledger": {
                "count": int(ledger["total_count"] or 0),
                "amount": ledger_total,
                "matched_count": int(ledger["matched_count"] or 0),
                "matched_amount": _money(ledger["matched_amount"]),
                "unmatched_count": int((ledger["total_count"] or 0) - (ledger["matched_count"] or 0)),
                "unmatched_amount": _money(ledger_total - _money(ledger["matched_amount"])),
            },
            "difference": difference,
            "reconciled": abs(difference) < 0.01,
        }
