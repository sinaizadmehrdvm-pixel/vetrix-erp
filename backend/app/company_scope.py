"""Shared helpers for the multi-company data-isolation migration (Milestone 2).

Milestone 1 established `Company`, `User.company_id`, and the JWT `company_id`
claim as pure foundation. This module adds the schema-migration primitive used
to retrofit `company_id` onto every business-data table, plus the small
runtime helper every scoped query uses to read the caller's company from
`request.state.auth`.
"""

from sqlalchemy import text

from app.database import engine

DEFAULT_COMPANY_ID = 1


def ensure_company_id_column(conn, table_name: str):
    """Idempotently add a nullable `company_id INTEGER` column to a table
    that is known to already exist on the given connection, then backfill
    any NULL rows to the default company. Safe to call every time the
    table's own schema-ensure routine runs, mirroring the existing
    `ensure_sqlite_column` convention used elsewhere in this codebase.
    """
    rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    existing = {row[1] for row in rows}
    if "company_id" not in existing:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN company_id INTEGER"))
    conn.execute(
        text(f"UPDATE {table_name} SET company_id = :cid WHERE company_id IS NULL"),
        {"cid": DEFAULT_COMPANY_ID},
    )


def rebuild_table_with_composite_unique(conn, table_name: str, create_sql: str, columns: str, unique_index_name: str):
    """One-time SQLite table rebuild that replaces a table's globally-unique
    natural key (e.g. `code VARCHAR UNIQUE`) with a composite
    `UNIQUE(company_id, code)`. SQLite has no ALTER TABLE for constraint
    changes, so this does the standard rename -> recreate -> copy -> drop
    dance inside the caller's transaction, preserving every row's `id`
    exactly (foreign keys elsewhere reference the id, never the code).

    Idempotent: skips entirely if `unique_index_name` already exists,
    which SQLite always creates (named `sqlite_autoindex_*` for inline
    UNIQUE, or the explicit name for a UNIQUE(...) table constraint) once
    the rebuild has already run.
    """
    existing_index = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='index' AND name=:name"),
        {"name": unique_index_name},
    ).fetchone()
    if existing_index:
        return
    table_exists = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table_name},
    ).fetchone()
    if not table_exists:
        return
    old_count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
    # `columns` describes the *fully migrated* schema, but a table whose
    # optional columns are normally added later by another module's own
    # ensure_*_schema() (e.g. accounting_vouchers.fiscal_period_id, only
    # added once ensure_fiscal_schema() runs) may not have all of them yet
    # on a fresh database - copy only the intersection that actually exists
    # right now; whichever column-ensure step normally adds the rest still
    # runs afterward and finds them genuinely missing, exactly as before.
    old_columns = {
        row[1] for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    }
    requested_columns = [c.strip() for c in columns.split(",")]
    copyable_columns = [c for c in requested_columns if c in old_columns]
    copy_list = ", ".join(copyable_columns)
    conn.execute(text(f"ALTER TABLE {table_name} RENAME TO {table_name}__pre_composite_unique"))
    conn.execute(text(create_sql))
    conn.execute(text(f"INSERT INTO {table_name} ({copy_list}) SELECT {copy_list} FROM {table_name}__pre_composite_unique"))
    new_count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
    if new_count != old_count:
        raise RuntimeError(
            f"Composite-unique migration for {table_name} lost rows: {old_count} -> {new_count}; aborting"
        )
    conn.execute(text(f"DROP TABLE {table_name}__pre_composite_unique"))


# --- Milestone 3: per-table composite-unique migrations -------------------
# Each of these tables had a globally-unique natural key (account code,
# voucher number, cost-center/project code, currency code, asset code,
# cheque number) that made it structurally impossible for two companies to
# both use, say, account code "1101" - see the Milestone 2 completion report
# for the full analysis. These convert that single-column UNIQUE into a
# composite UNIQUE(company_id, ...), preserving every row's id (nothing else
# in the schema ever references these tables by their natural key, always
# by id) so no foreign reference anywhere breaks.

def migrate_chart_accounts_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "chart_accounts",
        """
        CREATE TABLE chart_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR NOT NULL,
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
            updated_at VARCHAR,
            company_id INTEGER,
            UNIQUE(company_id, code)
        )
        """,
        "id, code, name, account_type, level, parent_id, normal_balance, description, "
        "color, is_active, cost_center_id, project_id, currency_id, created_at, updated_at, company_id",
        "ux_chart_accounts_company_code",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_chart_accounts_company_code ON chart_accounts(company_id, code)"
    ))


def migrate_accounting_vouchers_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "accounting_vouchers",
        """
        CREATE TABLE accounting_vouchers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_no INTEGER NOT NULL,
            voucher_date VARCHAR,
            description TEXT DEFAULT '',
            status VARCHAR DEFAULT 'draft',
            source_type VARCHAR DEFAULT 'manual',
            source_id INTEGER,
            total_debit FLOAT DEFAULT 0,
            total_credit FLOAT DEFAULT 0,
            created_at VARCHAR,
            updated_at VARCHAR,
            posted_at VARCHAR,
            fiscal_period_id INTEGER,
            period_voucher_no INTEGER,
            company_id INTEGER,
            UNIQUE(company_id, voucher_no)
        )
        """,
        "id, voucher_no, voucher_date, description, status, source_type, source_id, "
        "total_debit, total_credit, created_at, updated_at, posted_at, fiscal_period_id, "
        "period_voucher_no, company_id",
        "ux_accounting_vouchers_company_voucher_no",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_vouchers_company_voucher_no ON accounting_vouchers(company_id, voucher_no)"
    ))


def migrate_cost_centers_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "cost_centers",
        """
        CREATE TABLE cost_centers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR,
            name VARCHAR NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            description TEXT DEFAULT '',
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR,
            company_id INTEGER,
            UNIQUE(company_id, code)
        )
        """,
        "id, code, name, is_active, description, active, created_at, company_id",
        "ux_cost_centers_company_code",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_cost_centers_company_code ON cost_centers(company_id, code)"
    ))


def migrate_accounting_projects_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "accounting_projects",
        """
        CREATE TABLE accounting_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR,
            name VARCHAR NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            description TEXT DEFAULT '',
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR,
            company_id INTEGER,
            UNIQUE(company_id, code)
        )
        """,
        "id, code, name, is_active, description, active, created_at, company_id",
        "ux_accounting_projects_company_code",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_projects_company_code ON accounting_projects(company_id, code)"
    ))


def migrate_accounting_currencies_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "accounting_currencies",
        """
        CREATE TABLE accounting_currencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR,
            name VARCHAR NOT NULL,
            symbol VARCHAR DEFAULT '',
            rate FLOAT DEFAULT 1,
            is_base BOOLEAN DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR,
            company_id INTEGER,
            UNIQUE(company_id, code)
        )
        """,
        "id, code, name, symbol, rate, is_base, is_active, active, created_at, company_id",
        "ux_accounting_currencies_company_code",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_currencies_company_code ON accounting_currencies(company_id, code)"
    ))


def migrate_accounting_exchange_rates_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "accounting_exchange_rates",
        """
        CREATE TABLE accounting_exchange_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            currency_code VARCHAR NOT NULL,
            rate_date DATE NOT NULL,
            rate_to_base FLOAT NOT NULL,
            created_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(company_id, currency_code, rate_date)
        )
        """,
        "id, currency_code, rate_date, rate_to_base, created_at, company_id",
        "ux_exchange_rates_company_currency_date",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_exchange_rates_company_currency_date "
        "ON accounting_exchange_rates(company_id, currency_code, rate_date)"
    ))


def migrate_fixed_assets_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "fixed_assets",
        """
        CREATE TABLE fixed_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            asset_code VARCHAR NOT NULL,
            category VARCHAR DEFAULT '',
            purchase_date DATE NOT NULL,
            acquisition_cost FLOAT NOT NULL,
            salvage_value FLOAT NOT NULL DEFAULT 0,
            useful_life_months INTEGER NOT NULL,
            payment_method VARCHAR DEFAULT 'bank',
            serial_number VARCHAR DEFAULT '',
            location VARCHAR DEFAULT '',
            note TEXT DEFAULT '',
            status VARCHAR NOT NULL DEFAULT 'active',
            created_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(company_id, asset_code)
        )
        """,
        "id, name, asset_code, category, purchase_date, acquisition_cost, salvage_value, "
        "useful_life_months, payment_method, serial_number, location, note, status, created_at, company_id",
        "ux_fixed_assets_company_asset_code",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_fixed_assets_company_asset_code ON fixed_assets(company_id, asset_code)"
    ))


def migrate_treasury_cheques_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "treasury_cheques",
        """
        CREATE TABLE treasury_cheques (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            direction VARCHAR NOT NULL,
            customer_id INTEGER NOT NULL,
            amount FLOAT NOT NULL,
            cheque_number VARCHAR NOT NULL,
            bank_name VARCHAR DEFAULT '',
            branch_name VARCHAR DEFAULT '',
            issue_date DATE NOT NULL,
            due_date DATE NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            note TEXT DEFAULT '',
            customer_entry_id INTEGER,
            reversal_entry_id INTEGER,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(company_id, direction, cheque_number)
        )
        """,
        "id, direction, customer_id, amount, cheque_number, bank_name, branch_name, issue_date, "
        "due_date, status, note, customer_entry_id, reversal_entry_id, created_at, updated_at, company_id",
        "ux_treasury_cheques_company_direction_number",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_treasury_cheques_company_direction_number "
        "ON treasury_cheques(company_id, direction, cheque_number)"
    ))


def migrate_financial_policy_versions_composite_unique(conn):
    rebuild_table_with_composite_unique(
        conn, "financial_policy_versions",
        """
        CREATE TABLE financial_policy_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version VARCHAR NOT NULL,
            country_code VARCHAR NOT NULL,
            currency_code VARCHAR NOT NULL,
            decimal_places INTEGER NOT NULL,
            rounding_mode VARCHAR NOT NULL,
            effective_from VARCHAR NOT NULL,
            effective_to VARCHAR,
            calendar_system VARCHAR NOT NULL DEFAULT 'gregory',
            time_zone VARCHAR NOT NULL DEFAULT 'UTC',
            first_day_of_week INTEGER NOT NULL DEFAULT 1,
            fiscal_year_start VARCHAR NOT NULL DEFAULT '01-01',
            measurement_system VARCHAR NOT NULL DEFAULT 'metric',
            tax_percent REAL NOT NULL DEFAULT 0,
            status VARCHAR NOT NULL DEFAULT 'draft',
            verification_note TEXT DEFAULT '',
            verified_by INTEGER,
            verified_at VARCHAR,
            created_by INTEGER NOT NULL,
            created_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(company_id, version)
        )
        """,
        "id, version, country_code, currency_code, decimal_places, rounding_mode, effective_from, "
        "effective_to, calendar_system, time_zone, first_day_of_week, fiscal_year_start, "
        "measurement_system, tax_percent, status, verification_note, verified_by, verified_at, "
        "created_by, created_at, company_id",
        "ux_financial_policy_versions_company_version",
    )
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_policy_versions_company_version "
        "ON financial_policy_versions(company_id, version)"
    ))


def company_id_from_auth(auth: dict | None) -> int:
    """Every authenticated request has `company_id` in its JWT (Milestone 1).
    Falls back to the default company only for the rare pre-Milestone-1
    token still in the wild during a rolling deploy.
    """
    if not auth:
        return DEFAULT_COMPANY_ID
    return auth.get("company_id") or DEFAULT_COMPANY_ID


def current_company_id(request) -> int:
    """Read the caller's company_id straight off `request.state.auth`. The
    one-line call every scoped route handler uses instead of repeating the
    dict-lookup + fallback logic inline."""
    return company_id_from_auth(getattr(request.state, "auth", None))


def get_company_brief(company_id: int | None) -> dict | None:
    """id/name/is_active for the given company, or None if it doesn't
    exist. Used to report the caller's *active* company context (which,
    for a super-admin who has switched, can differ from their home
    User.company_id) alongside /me, /login, /login/totp and the new
    /api/companies/switch endpoint (Milestone 4)."""
    if not company_id:
        return None
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT id, name, is_active FROM companies WHERE id = :id"),
            {"id": company_id},
        ).mappings().first()
        return dict(row) if row else None
