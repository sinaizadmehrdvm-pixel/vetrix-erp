from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/accounting/periods", tags=["Fiscal Periods"])


class FiscalPeriodCreate(BaseModel):
    name: str
    start_date: str
    end_date: str


def _require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")


def _parse_date(value) -> date:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        raise ValueError("Date must use YYYY-MM-DD format")


def _ensure_column(conn, table_name, column_name, column_sql):
    columns = {
        row[1]
        for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    }
    if column_name not in columns:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}"))


def ensure_fiscal_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fiscal_periods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            start_date VARCHAR NOT NULL,
            end_date VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'open',
            created_at VARCHAR NOT NULL,
            closed_at VARCHAR,
            reopened_at VARCHAR
        )
    """))
    voucher_table = conn.execute(text("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='accounting_vouchers'
    """)).fetchone()
    if voucher_table:
        _ensure_column(
            conn,
            "accounting_vouchers",
            "fiscal_period_id",
            "fiscal_period_id INTEGER",
        )
        _ensure_column(
            conn,
            "accounting_vouchers",
            "period_voucher_no",
            "period_voucher_no INTEGER",
        )
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_voucher_period_number
            ON accounting_vouchers(fiscal_period_id, period_voucher_no)
        """))


def _period_dict(row):
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)


def assign_unassigned_vouchers(conn):
    """Attach legacy vouchers to periods without changing their global numbers."""
    ensure_fiscal_schema(conn)
    voucher_table = conn.execute(text("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='accounting_vouchers'
    """)).fetchone()
    if not voucher_table:
        return

    vouchers = conn.execute(text("""
        SELECT id, voucher_date
        FROM accounting_vouchers
        WHERE fiscal_period_id IS NULL
        ORDER BY voucher_date ASC, id ASC
    """)).mappings().all()
    for voucher in vouchers:
        target = _parse_date(voucher["voucher_date"] or date.today())
        period = conn.execute(text("""
            SELECT id FROM fiscal_periods
            WHERE start_date <= :target AND end_date >= :target
            ORDER BY start_date DESC
            LIMIT 1
        """), {"target": target.isoformat()}).mappings().first()
        if not period:
            year_start = date(target.year, 1, 1).isoformat()
            year_end = date(target.year, 12, 31).isoformat()
            overlap = conn.execute(text("""
                SELECT id FROM fiscal_periods
                WHERE NOT (end_date < :start_date OR start_date > :end_date)
                LIMIT 1
            """), {"start_date": year_start, "end_date": year_end}).mappings().first()
            start_date = target.isoformat() if overlap else year_start
            end_date = target.isoformat() if overlap else year_end
            result = conn.execute(text("""
                INSERT INTO fiscal_periods
                (name, start_date, end_date, status, created_at)
                VALUES (:name, :start_date, :end_date, 'open', :created_at)
            """), {
                "name": f"Fiscal {target.year}" if not overlap else f"Imported {target.isoformat()}",
                "start_date": start_date,
                "end_date": end_date,
                "created_at": datetime.utcnow().isoformat(),
            })
            period_id = result.lastrowid
        else:
            period_id = period["id"]

        period_no = conn.execute(text("""
            SELECT COALESCE(MAX(period_voucher_no), 0) + 1
            FROM accounting_vouchers
            WHERE fiscal_period_id=:period_id
        """), {"period_id": period_id}).scalar() or 1
        conn.execute(text("""
            UPDATE accounting_vouchers
            SET fiscal_period_id=:period_id, period_voucher_no=:period_no
            WHERE id=:voucher_id
        """), {
            "period_id": period_id,
            "period_no": int(period_no),
            "voucher_id": voucher["id"],
        })


def create_fiscal_period(conn, name, start_date, end_date):
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if end < start:
        raise ValueError("end_date must be on or after start_date")

    ensure_fiscal_schema(conn)
    overlap = conn.execute(text("""
        SELECT id, name FROM fiscal_periods
        WHERE NOT (end_date < :start_date OR start_date > :end_date)
        LIMIT 1
    """), {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }).mappings().first()
    if overlap:
        raise ValueError(f"Fiscal period overlaps with: {overlap['name']}")

    now = datetime.utcnow().isoformat()
    result = conn.execute(text("""
        INSERT INTO fiscal_periods
        (name, start_date, end_date, status, created_at)
        VALUES (:name, :start_date, :end_date, 'open', :created_at)
    """), {
        "name": name.strip() or f"Fiscal {start.year}",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "created_at": now,
    })
    return result.lastrowid


def resolve_open_period(conn, voucher_date=None):
    ensure_fiscal_schema(conn)
    target = _parse_date(voucher_date or date.today())
    row = conn.execute(text("""
        SELECT * FROM fiscal_periods
        WHERE start_date <= :target AND end_date >= :target
        ORDER BY start_date DESC
        LIMIT 1
    """), {"target": target.isoformat()}).mappings().first()

    if not row:
        period_id = create_fiscal_period(
            conn,
            f"Fiscal {target.year}",
            date(target.year, 1, 1),
            date(target.year, 12, 31),
        )
        row = conn.execute(
            text("SELECT * FROM fiscal_periods WHERE id=:id"),
            {"id": period_id},
        ).mappings().first()

    if row["status"] != "open":
        raise ValueError(
            f"Fiscal period '{row['name']}' is closed for {target.isoformat()}"
        )
    return dict(row)


def next_voucher_numbers(conn, fiscal_period_id):
    global_no = (
        conn.execute(
            text("SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM accounting_vouchers")
        ).scalar()
        or 1
    )
    period_no = (
        conn.execute(text("""
            SELECT COALESCE(MAX(period_voucher_no), 0) + 1
            FROM accounting_vouchers
            WHERE fiscal_period_id=:period_id
        """), {"period_id": fiscal_period_id}).scalar()
        or 1
    )
    return int(global_no), int(period_no)


def assert_voucher_period_open(conn, voucher_id):
    ensure_fiscal_schema(conn)
    row = conn.execute(text("""
        SELECT p.name, p.status
        FROM accounting_vouchers v
        JOIN fiscal_periods p ON p.id = v.fiscal_period_id
        WHERE v.id=:voucher_id
    """), {"voucher_id": voucher_id}).mappings().first()
    if row and row["status"] != "open":
        raise ValueError(f"Fiscal period '{row['name']}' is closed")


def assert_source_period_open(conn, source_type, source_id):
    ensure_fiscal_schema(conn)
    row = conn.execute(text("""
        SELECT p.name, p.status
        FROM accounting_vouchers v
        JOIN fiscal_periods p ON p.id = v.fiscal_period_id
        WHERE v.source_type=:source_type AND v.source_id=:source_id
        LIMIT 1
    """), {
        "source_type": source_type,
        "source_id": source_id,
    }).mappings().first()
    if row and row["status"] != "open":
        raise ValueError(f"Fiscal period '{row['name']}' is closed")


def close_fiscal_period(conn, period_id):
    ensure_fiscal_schema(conn)
    period = conn.execute(
        text("SELECT * FROM fiscal_periods WHERE id=:id"),
        {"id": period_id},
    ).mappings().first()
    if not period:
        raise ValueError("Fiscal period not found")
    if period["status"] == "closed":
        return dict(period)

    draft_count = conn.execute(text("""
        SELECT COUNT(*) FROM accounting_vouchers
        WHERE fiscal_period_id=:period_id AND status != 'posted'
    """), {"period_id": period_id}).scalar() or 0
    if draft_count:
        raise ValueError("Cannot close a fiscal period with draft vouchers")

    unbalanced_count = conn.execute(text("""
        SELECT COUNT(*) FROM accounting_vouchers
        WHERE fiscal_period_id=:period_id
          AND ABS(COALESCE(total_debit, 0) - COALESCE(total_credit, 0)) >= 0.01
    """), {"period_id": period_id}).scalar() or 0
    if unbalanced_count:
        raise ValueError("Cannot close a fiscal period with unbalanced vouchers")

    conn.execute(text("""
        UPDATE fiscal_periods
        SET status='closed', closed_at=:now
        WHERE id=:id
    """), {"id": period_id, "now": datetime.utcnow().isoformat()})
    return dict(conn.execute(
        text("SELECT * FROM fiscal_periods WHERE id=:id"),
        {"id": period_id},
    ).mappings().first())


def reopen_fiscal_period(conn, period_id):
    ensure_fiscal_schema(conn)
    period = conn.execute(
        text("SELECT * FROM fiscal_periods WHERE id=:id"),
        {"id": period_id},
    ).mappings().first()
    if not period:
        raise ValueError("Fiscal period not found")
    conn.execute(text("""
        UPDATE fiscal_periods
        SET status='open', closed_at=NULL, reopened_at=:now
        WHERE id=:id
    """), {"id": period_id, "now": datetime.utcnow().isoformat()})
    return dict(conn.execute(
        text("SELECT * FROM fiscal_periods WHERE id=:id"),
        {"id": period_id},
    ).mappings().first())


@router.get("")
def list_fiscal_periods():
    with engine.begin() as conn:
        ensure_fiscal_schema(conn)
        assign_unassigned_vouchers(conn)
        voucher_table = conn.execute(text("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='accounting_vouchers'
        """)).fetchone()
        if voucher_table:
            rows = conn.execute(text("""
                SELECT p.*,
                       COUNT(v.id) AS vouchers_count,
                       COALESCE(SUM(v.total_debit), 0) AS total_debit,
                       COALESCE(SUM(v.total_credit), 0) AS total_credit
                FROM fiscal_periods p
                LEFT JOIN accounting_vouchers v ON v.fiscal_period_id = p.id
                GROUP BY p.id
                ORDER BY p.start_date DESC
            """)).mappings().all()
        else:
            rows = conn.execute(text("""
                SELECT p.*, 0 AS vouchers_count,
                       0 AS total_debit, 0 AS total_credit
                FROM fiscal_periods p
                ORDER BY p.start_date DESC
            """)).mappings().all()
        return [dict(row) for row in rows]


@router.post("")
def create_period(payload: FiscalPeriodCreate, request: Request):
    _require_admin(request)
    try:
        with engine.begin() as conn:
            period_id = create_fiscal_period(
                conn,
                payload.name,
                payload.start_date,
                payload.end_date,
            )
            row = conn.execute(
                text("SELECT * FROM fiscal_periods WHERE id=:id"),
                {"id": period_id},
            ).mappings().first()
            return dict(row)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/{period_id}/close")
def close_period(period_id: int, request: Request):
    _require_admin(request)
    from app.accounting.closing import close_books
    try:
        with engine.begin() as conn:
            return close_books(conn, period_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/{period_id}/reopen")
def reopen_period(period_id: int, request: Request):
    _require_admin(request)
    from app.accounting.closing import reopen_books
    try:
        with engine.begin() as conn:
            return reopen_books(conn, period_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
