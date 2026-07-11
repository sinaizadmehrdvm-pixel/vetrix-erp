from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import text

from app.database import engine
from app.accounting.periods import (
    assert_source_period_open,
    ensure_fiscal_schema,
    next_voucher_numbers,
    resolve_open_period,
)

MONEY_STEP = Decimal("0.01")

POSTING_ACCOUNTS = [
    ("1", "دارایی‌ها", "asset", "group", None, "debit"),
    ("11", "دارایی‌های جاری", "asset", "ledger", "1", "debit"),
    ("1101", "صندوق", "asset", "subsidiary", "11", "debit"),
    ("1102", "بانک", "asset", "subsidiary", "11", "debit"),
    ("1103", "حساب‌های دریافتنی", "asset", "subsidiary", "11", "debit"),
    ("12", "موجودی و دارایی عملیاتی", "asset", "ledger", "1", "debit"),
    ("1201", "موجودی کالا", "asset", "subsidiary", "12", "debit"),
    ("1202", "دارایی‌های ثابت", "asset", "subsidiary", "12", "debit"),
    ("1203", "استهلاک انباشته دارایی‌های ثابت", "asset", "subsidiary", "12", "credit"),
    ("1301", "مالیات بر ارزش افزوده خرید", "asset", "subsidiary", "11", "debit"),
    ("2", "بدهی‌ها", "liability", "group", None, "credit"),
    ("21", "بدهی‌های جاری", "liability", "ledger", "2", "credit"),
    ("2101", "حساب‌های پرداختنی", "liability", "subsidiary", "21", "credit"),
    ("2201", "مالیات بر ارزش افزوده فروش", "liability", "subsidiary", "21", "credit"),
    ("3", "حقوق صاحبان سرمایه", "equity", "group", None, "credit"),
    ("31", "سرمایه و افتتاحیه", "equity", "ledger", "3", "credit"),
    ("3101", "سرمایه و تعدیلات افتتاحیه", "equity", "subsidiary", "31", "credit"),
    ("32", "سود و زیان انباشته", "equity", "ledger", "3", "credit"),
    ("3201", "سود و زیان انباشته", "equity", "subsidiary", "32", "credit"),
    ("4", "درآمدها", "revenue", "group", None, "credit"),
    ("4101", "فروش کالا و خدمات", "revenue", "subsidiary", "4", "credit"),
    ("4102", "برگشت از فروش", "contra", "subsidiary", "4", "debit"),
    ("4103", "درآمد حمل و خدمات", "revenue", "subsidiary", "4", "credit"),
    ("5", "هزینه‌ها", "expense", "group", None, "debit"),
    ("5101", "بهای تمام‌شده کالای فروش‌رفته", "expense", "subsidiary", "5", "debit"),
    ("5102", "هزینه‌های اداری و عمومی", "expense", "subsidiary", "5", "debit"),
    ("5103", "هزینه استهلاک", "expense", "subsidiary", "5", "debit"),
]


def _money(value):
    return Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def _ensure_schema(conn):
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
    ensure_fiscal_schema(conn)
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

    now = datetime.utcnow().isoformat()
    for code, name, account_type, level, parent_code, normal_balance in POSTING_ACCOUNTS:
        parent_id = None
        if parent_code:
            parent_id = conn.execute(
                text("SELECT id FROM chart_accounts WHERE code=:code"),
                {"code": parent_code},
            ).scalar()
        conn.execute(text("""
            INSERT OR IGNORE INTO chart_accounts
            (code, name, account_type, level, parent_id, normal_balance, is_active, created_at, updated_at)
            VALUES (:code, :name, :account_type, :level, :parent_id, :normal_balance, 1, :now, :now)
        """), {
            "code": code,
            "name": name,
            "account_type": account_type,
            "level": level,
            "parent_id": parent_id,
            "normal_balance": normal_balance,
            "now": now,
        })


def _delete_source(conn, source_type, source_id):
    voucher_ids = [
        row[0]
        for row in conn.execute(
            text("SELECT id FROM accounting_vouchers WHERE source_type=:source_type AND source_id=:source_id"),
            {"source_type": source_type, "source_id": source_id},
        ).fetchall()
    ]
    for voucher_id in voucher_ids:
        conn.execute(
            text("DELETE FROM accounting_voucher_lines WHERE voucher_id=:voucher_id"),
            {"voucher_id": voucher_id},
        )
    conn.execute(
        text("DELETE FROM accounting_vouchers WHERE source_type=:source_type AND source_id=:source_id"),
        {"source_type": source_type, "source_id": source_id},
    )


def post_balanced_voucher(
    source_type,
    source_id,
    description,
    lines,
    voucher_date=None,
    connection=None,
):
    normalized = []
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    for line in lines:
        debit = _money(line.get("debit"))
        credit = _money(line.get("credit"))
        if debit < 0 or credit < 0 or (debit > 0 and credit > 0):
            raise ValueError("Each voucher line must contain one non-negative debit or credit")
        if debit == 0 and credit == 0:
            continue
        normalized.append({**line, "debit": debit, "credit": credit})
        total_debit += debit
        total_credit += credit

    total_debit = _money(total_debit)
    total_credit = _money(total_credit)
    if not normalized or total_debit != total_credit:
        raise ValueError(
            f"Unbalanced automatic voucher: debit={total_debit}, credit={total_credit}"
        )

    def write(conn):
        now = datetime.utcnow().isoformat()
        _ensure_schema(conn)
        effective_date = voucher_date or datetime.utcnow().date().isoformat()
        assert_source_period_open(conn, source_type, source_id)
        period = resolve_open_period(conn, effective_date)
        _delete_source(conn, source_type, source_id)
        voucher_no, period_voucher_no = next_voucher_numbers(conn, period["id"])
        result = conn.execute(text("""
            INSERT INTO accounting_vouchers
            (voucher_no, fiscal_period_id, period_voucher_no, voucher_date,
             description, status, source_type, source_id,
             total_debit, total_credit, created_at, updated_at, posted_at)
            VALUES
            (:voucher_no, :fiscal_period_id, :period_voucher_no, :voucher_date,
             :description, 'posted', :source_type, :source_id,
             :total_debit, :total_credit, :now, :now, :now)
        """), {
            "voucher_no": voucher_no,
            "fiscal_period_id": period["id"],
            "period_voucher_no": period_voucher_no,
            "voucher_date": effective_date,
            "description": description,
            "source_type": source_type,
            "source_id": source_id,
            "total_debit": float(total_debit),
            "total_credit": float(total_credit),
            "now": now,
        })
        voucher_id = result.lastrowid
        for line in normalized:
            account = conn.execute(
                text("SELECT id, code, name FROM chart_accounts WHERE code=:code"),
                {"code": line["account_code"]},
            ).mappings().first()
            if not account:
                raise ValueError(f"Posting account not found: {line['account_code']}")
            conn.execute(text("""
                INSERT INTO accounting_voucher_lines
                (voucher_id, account_id, account_code, account_name, description, debit, credit, created_at)
                VALUES
                (:voucher_id, :account_id, :account_code, :account_name, :description, :debit, :credit, :now)
            """), {
                "voucher_id": voucher_id,
                "account_id": account["id"],
                "account_code": account["code"],
                "account_name": account["name"],
                "description": line.get("description") or description,
                "debit": float(line["debit"]),
                "credit": float(line["credit"]),
                "now": now,
            })
        return voucher_id

    if connection is not None:
        return write(connection)
    with engine.begin() as conn:
        return write(conn)


def delete_source_voucher(source_type, source_id, connection=None):
    def delete(conn):
        _ensure_schema(conn)
        assert_source_period_open(conn, source_type, source_id)
        _delete_source(conn, source_type, source_id)

    if connection is not None:
        delete(connection)
        return
    with engine.begin() as conn:
        delete(conn)


def cash_account_for_method(method):
    normalized = str(method or "").strip().lower()
    if normalized in {"bank", "card", "pos", "transfer", "wire", "cheque", "check"}:
        return "1102"
    return "1101"


def settlement_counterpart_account(invoice_type, transaction_type):
    if transaction_type == "receipt":
        return "2101" if invoice_type == "return_buy" else "1103"
    if transaction_type == "payment":
        return "1103" if invoice_type == "return_sale" else "2101"
    raise ValueError("transaction_type must be receipt or payment")
