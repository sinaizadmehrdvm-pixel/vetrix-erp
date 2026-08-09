import weakref
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

# post_balanced_voucher() is called once per row by bulk-import flows (e.g.
# a 1475-product import posts 1475 opening-inventory vouchers in one
# transaction). _ensure_schema() below is idempotent (CREATE TABLE IF NOT
# EXISTS, INSERT OR IGNORE) but re-running its ~25 chart-of-accounts inserts
# and multiple PRAGMA table_info checks on every single call was most of
# the measured overhead. Keyed by the live Connection object (not a global
# flag), so it's scoped to exactly one transaction/request and can never
# make a stale assumption about a different database - a fresh
# engine.begin() always gets a brand-new Connection, so the cache is
# naturally empty again for the next request.
_posting_schema_ready = weakref.WeakSet()

# Structural schema (tables/indexes/migrations) is company-independent and
# cached above; the default chart-of-accounts seed (POSTING_ACCOUNTS) is
# per-company (Milestone 3) and cached separately, per (connection, company)
# pair, since one connection always belongs to exactly one company's
# transaction but could in principle seed more than one company_id.
_posting_accounts_seeded = weakref.WeakKeyDictionary()

MONEY_STEP = Decimal("0.01")

POSTING_ACCOUNTS = [
    ("1", "دارایی‌ها", "asset", "group", None, "debit"),
    ("11", "دارایی‌های جاری", "asset", "ledger", "1", "debit"),
    ("1101", "صندوق", "asset", "subsidiary", "11", "debit"),
    ("1102", "بانک", "asset", "subsidiary", "11", "debit"),
    ("1103", "حساب‌های دریافتنی", "asset", "subsidiary", "11", "debit"),
    ("1104", "اسناد دریافتنی", "asset", "subsidiary", "11", "debit"),
    ("12", "موجودی و دارایی عملیاتی", "asset", "ledger", "1", "debit"),
    ("1201", "موجودی کالا", "asset", "subsidiary", "12", "debit"),
    ("1202", "دارایی‌های ثابت", "asset", "subsidiary", "12", "debit"),
    ("1203", "استهلاک انباشته دارایی‌های ثابت", "asset", "subsidiary", "12", "credit"),
    ("1301", "مالیات بر ارزش افزوده خرید", "asset", "subsidiary", "11", "debit"),
    ("2", "بدهی‌ها", "liability", "group", None, "credit"),
    ("21", "بدهی‌های جاری", "liability", "ledger", "2", "credit"),
    ("2101", "حساب‌های پرداختنی", "liability", "subsidiary", "21", "credit"),
    ("2102", "اسناد پرداختنی", "liability", "subsidiary", "21", "credit"),
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
    ("5104", "اجاره و تأسیسات", "expense", "subsidiary", "5", "debit"),
    ("5105", "بازاریابی و تبلیغات", "expense", "subsidiary", "5", "debit"),
    ("5106", "حقوق و دستمزد", "expense", "subsidiary", "5", "debit"),
    ("5107", "حمل و نقل", "expense", "subsidiary", "5", "debit"),
    ("5108", "لوازم و تجهیزات اداری", "expense", "subsidiary", "5", "debit"),
    ("5109", "تعمیر و نگهداری", "expense", "subsidiary", "5", "debit"),
]


def _money(value):
    return Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def _ensure_schema(conn):
    if conn in _posting_schema_ready:
        return
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
    from app.company_scope import (
        ensure_company_id_column,
        migrate_chart_accounts_composite_unique,
        migrate_accounting_vouchers_composite_unique,
    )
    ensure_company_id_column(conn, "chart_accounts")
    ensure_company_id_column(conn, "accounting_vouchers")
    migrate_chart_accounts_composite_unique(conn)
    migrate_accounting_vouchers_composite_unique(conn)
    # _delete_source()/assert_source_period_open() both filter by this pair
    # on every voucher post (bulk imports call post_balanced_voucher once
    # per row) - (fiscal_period_id, period_voucher_no) already has
    # ux_voucher_period_number from ensure_fiscal_schema() below, but
    # (source_type, source_id) had no index at all.
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_source
        ON accounting_vouchers(source_type, source_id)
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
            cost_center_id INTEGER,
            project_id INTEGER,
            currency_code VARCHAR,
            foreign_amount FLOAT,
            exchange_rate FLOAT,
            created_at VARCHAR
        )
    """))
    line_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(accounting_voucher_lines)")).fetchall()}
    if "cost_center_id" not in line_columns:
        conn.execute(text("ALTER TABLE accounting_voucher_lines ADD COLUMN cost_center_id INTEGER"))
    if "project_id" not in line_columns:
        conn.execute(text("ALTER TABLE accounting_voucher_lines ADD COLUMN project_id INTEGER"))
    from app.accounting.currencies import ensure_currency_schema
    ensure_currency_schema(conn)

    ensure_company_id_column(conn, "accounting_voucher_lines")
    _posting_schema_ready.add(conn)


def _ensure_company_accounts_seeded(conn, company_id):
    """Guarantees this specific company has its own copy of the default
    chart of accounts (POSTING_ACCOUNTS). Composite UNIQUE(company_id, code)
    means INSERT OR IGNORE now correctly treats "does *this company* already
    have code 1101" rather than "does anyone" - each company gets its own
    independent set of account ids even though the codes/names are shared
    defaults."""
    seeded_companies = _posting_accounts_seeded.setdefault(conn, set())
    if company_id in seeded_companies:
        return
    now = datetime.utcnow().isoformat()
    for code, name, account_type, level, parent_code, normal_balance in POSTING_ACCOUNTS:
        parent_id = None
        if parent_code:
            parent_id = conn.execute(
                text("SELECT id FROM chart_accounts WHERE code=:code AND company_id=:company_id"),
                {"code": parent_code, "company_id": company_id},
            ).scalar()
        conn.execute(text("""
            INSERT OR IGNORE INTO chart_accounts
            (code, name, account_type, level, parent_id, normal_balance, is_active, created_at, updated_at, company_id)
            VALUES (:code, :name, :account_type, :level, :parent_id, :normal_balance, 1, :now, :now, :company_id)
        """), {
            "code": code,
            "name": name,
            "account_type": account_type,
            "level": level,
            "parent_id": parent_id,
            "normal_balance": normal_balance,
            "now": now,
            "company_id": company_id,
        })
    seeded_companies.add(company_id)


def _delete_source(conn, source_type, source_id, company_id):
    voucher_ids = [
        row[0]
        for row in conn.execute(
            text("SELECT id FROM accounting_vouchers WHERE source_type=:source_type AND source_id=:source_id AND company_id=:company_id"),
            {"source_type": source_type, "source_id": source_id, "company_id": company_id},
        ).fetchall()
    ]
    for voucher_id in voucher_ids:
        conn.execute(
            text("DELETE FROM accounting_voucher_lines WHERE voucher_id=:voucher_id"),
            {"voucher_id": voucher_id},
        )
    conn.execute(
        text("DELETE FROM accounting_vouchers WHERE source_type=:source_type AND source_id=:source_id AND company_id=:company_id"),
        {"source_type": source_type, "source_id": source_id, "company_id": company_id},
    )


def post_balanced_voucher(
    source_type,
    source_id,
    description,
    lines,
    company_id,
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
        _ensure_company_accounts_seeded(conn, company_id)
        effective_date = voucher_date or datetime.utcnow().date().isoformat()
        assert_source_period_open(conn, source_type, source_id, company_id)
        period = resolve_open_period(conn, effective_date, company_id)
        _delete_source(conn, source_type, source_id, company_id)
        voucher_no, period_voucher_no = next_voucher_numbers(conn, period["id"], company_id)
        result = conn.execute(text("""
            INSERT INTO accounting_vouchers
            (voucher_no, fiscal_period_id, period_voucher_no, voucher_date,
             description, status, source_type, source_id,
             total_debit, total_credit, created_at, updated_at, posted_at, company_id)
            VALUES
            (:voucher_no, :fiscal_period_id, :period_voucher_no, :voucher_date,
             :description, 'posted', :source_type, :source_id,
             :total_debit, :total_credit, :now, :now, :now, :company_id)
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
            "company_id": company_id,
        })
        voucher_id = result.lastrowid
        for line in normalized:
            account = conn.execute(
                text("SELECT id, code, name FROM chart_accounts WHERE code=:code AND company_id=:company_id"),
                {"code": line["account_code"], "company_id": company_id},
            ).mappings().first()
            if not account:
                raise ValueError(f"Posting account not found: {line['account_code']}")
            conn.execute(text("""
                INSERT INTO accounting_voucher_lines
                (voucher_id, account_id, account_code, account_name, description, debit, credit, cost_center_id, project_id, currency_code, foreign_amount, exchange_rate, created_at, company_id)
                VALUES
                (:voucher_id, :account_id, :account_code, :account_name, :description, :debit, :credit, :cost_center_id, :project_id, :currency_code, :foreign_amount, :exchange_rate, :now, :company_id)
            """), {
                "voucher_id": voucher_id,
                "account_id": account["id"],
                "account_code": account["code"],
                "account_name": account["name"],
                "description": line.get("description") or description,
                "debit": float(line["debit"]),
                "credit": float(line["credit"]),
                "cost_center_id": line.get("cost_center_id"),
                "project_id": line.get("project_id"),
                "currency_code": line.get("currency_code"),
                "foreign_amount": line.get("foreign_amount"),
                "exchange_rate": line.get("exchange_rate"),
                "now": now,
                "company_id": company_id,
            })
        return voucher_id

    if connection is not None:
        return write(connection)
    with engine.begin() as conn:
        return write(conn)


def delete_source_voucher(source_type, source_id, company_id, connection=None):
    def delete(conn):
        _ensure_schema(conn)
        assert_source_period_open(conn, source_type, source_id, company_id)
        _delete_source(conn, source_type, source_id, company_id)

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
