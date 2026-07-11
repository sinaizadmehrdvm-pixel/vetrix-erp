from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/accounting/currencies", tags=["Multi Currency"])
MONEY_STEP = Decimal("0.01")
RATE_STEP = Decimal("0.00000001")


def _money(value):
    return float(Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP))


def _rate(value):
    return float(Decimal(str(value or 0)).quantize(RATE_STEP, rounding=ROUND_HALF_UP))


class CurrencyCreate(BaseModel):
    code: str
    name: str
    symbol: str = ""
    is_base: bool = False


class ExchangeRateCreate(BaseModel):
    currency_code: str
    rate_date: date
    rate_to_base: float


def _ensure_column(conn, table, column, definition):
    columns = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
    if column not in columns:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {definition}"))


def ensure_currency_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS accounting_currencies (
            code VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            symbol VARCHAR DEFAULT '',
            is_base BOOLEAN NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR NOT NULL
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS accounting_exchange_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            currency_code VARCHAR NOT NULL,
            rate_date DATE NOT NULL,
            rate_to_base FLOAT NOT NULL,
            created_at VARCHAR NOT NULL,
            UNIQUE(currency_code, rate_date),
            FOREIGN KEY(currency_code) REFERENCES accounting_currencies(code)
        )
    """))
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(text("""
        INSERT OR IGNORE INTO accounting_currencies
          (code, name, symbol, is_base, active, created_at)
        VALUES ('IRR', 'Iranian Rial / Toman', 'تومان', 1, 1, :now)
    """), {"now": now})
    conn.execute(text("""
        INSERT OR IGNORE INTO accounting_exchange_rates
          (currency_code, rate_date, rate_to_base, created_at)
        VALUES ('IRR', '1900-01-01', 1, :now)
    """), {"now": now})
    table = conn.execute(text("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='accounting_voucher_lines'
    """)).first()
    if table:
        _ensure_column(conn, "accounting_voucher_lines", "currency_code", "currency_code VARCHAR")
        _ensure_column(conn, "accounting_voucher_lines", "foreign_amount", "foreign_amount FLOAT")
        _ensure_column(conn, "accounting_voucher_lines", "exchange_rate", "exchange_rate FLOAT")


def latest_rate(conn, currency_code, target_date):
    ensure_currency_schema(conn)
    currency = conn.execute(text("""
        SELECT * FROM accounting_currencies
        WHERE code=:code AND active=1
    """), {"code": currency_code.upper()}).mappings().first()
    if not currency:
        raise HTTPException(status_code=404, detail="Active currency not found")
    row = conn.execute(text("""
        SELECT * FROM accounting_exchange_rates
        WHERE currency_code=:code AND rate_date<=:target
        ORDER BY rate_date DESC, id DESC LIMIT 1
    """), {
        "code": currency_code.upper(),
        "target": str(target_date)[:10],
    }).mappings().first()
    if not row:
        raise HTTPException(status_code=409, detail="No exchange rate exists on or before the transaction date")
    return dict(row)


@router.get("")
def list_currencies(as_of: date | None = None):
    target = as_of or date.today()
    with engine.begin() as conn:
        ensure_currency_schema(conn)
        rows = conn.execute(text("""
            SELECT c.*,
                   (SELECT r.rate_to_base FROM accounting_exchange_rates r
                    WHERE r.currency_code=c.code AND r.rate_date<=:target
                    ORDER BY r.rate_date DESC, r.id DESC LIMIT 1) AS latest_rate,
                   (SELECT r.rate_date FROM accounting_exchange_rates r
                    WHERE r.currency_code=c.code AND r.rate_date<=:target
                    ORDER BY r.rate_date DESC, r.id DESC LIMIT 1) AS latest_rate_date
            FROM accounting_currencies c
            ORDER BY c.is_base DESC, c.code
        """), {"target": target.isoformat()}).mappings().all()
        return [{**dict(row), "latest_rate": _rate(row["latest_rate"])} for row in rows]


@router.post("")
def create_currency(data: CurrencyCreate):
    code, name = data.code.strip().upper(), data.name.strip()
    if len(code) != 3 or not code.isalpha():
        raise HTTPException(status_code=400, detail="Currency code must be a 3-letter ISO-style code")
    if not name:
        raise HTTPException(status_code=400, detail="Currency name is required")
    try:
        with engine.begin() as conn:
            ensure_currency_schema(conn)
            if data.is_base:
                existing = conn.execute(text("""
                    SELECT code FROM accounting_currencies WHERE is_base=1
                """)).scalar()
                if existing:
                    raise HTTPException(status_code=409, detail=f"Base currency already exists: {existing}")
            conn.execute(text("""
                INSERT INTO accounting_currencies
                  (code, name, symbol, is_base, active, created_at)
                VALUES (:code, :name, :symbol, :is_base, 1, :created_at)
            """), {
                "code": code, "name": name, "symbol": data.symbol.strip(),
                "is_base": 1 if data.is_base else 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            return {"status": "created", "code": code}
    except HTTPException:
        raise
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=409, detail="Currency already exists")
        raise


@router.post("/rates")
def set_exchange_rate(data: ExchangeRateCreate):
    code = data.currency_code.strip().upper()
    rate = _rate(data.rate_to_base)
    if rate <= 0:
        raise HTTPException(status_code=400, detail="Exchange rate must be greater than zero")
    with engine.begin() as conn:
        ensure_currency_schema(conn)
        currency = conn.execute(text("""
            SELECT * FROM accounting_currencies WHERE code=:code
        """), {"code": code}).mappings().first()
        if not currency:
            raise HTTPException(status_code=404, detail="Currency not found")
        if currency["is_base"] and rate != 1:
            raise HTTPException(status_code=400, detail="Base currency rate must equal 1")
        now = datetime.now(timezone.utc).isoformat()
        existing = conn.execute(text("""
            SELECT id FROM accounting_exchange_rates
            WHERE currency_code=:code AND rate_date=:rate_date
        """), {"code": code, "rate_date": data.rate_date.isoformat()}).scalar()
        if existing:
            conn.execute(text("""
                UPDATE accounting_exchange_rates
                SET rate_to_base=:rate, created_at=:now WHERE id=:id
            """), {"rate": rate, "now": now, "id": existing})
            return {"status": "updated", "id": existing, "rate_to_base": rate}
        result = conn.execute(text("""
            INSERT INTO accounting_exchange_rates
              (currency_code, rate_date, rate_to_base, created_at)
            VALUES (:code, :rate_date, :rate, :now)
        """), {
            "code": code, "rate_date": data.rate_date.isoformat(),
            "rate": rate, "now": now,
        })
        return {"status": "created", "id": result.lastrowid, "rate_to_base": rate}


@router.get("/{currency_code}/rates")
def rate_history(currency_code: str):
    code = currency_code.upper()
    with engine.begin() as conn:
        ensure_currency_schema(conn)
        rows = conn.execute(text("""
            SELECT * FROM accounting_exchange_rates
            WHERE currency_code=:code ORDER BY rate_date DESC, id DESC
        """), {"code": code}).mappings().all()
        return [{**dict(row), "rate_to_base": _rate(row["rate_to_base"])} for row in rows]


@router.get("/reports/balances")
def foreign_currency_balances(
    fiscal_period_id: int | None = None,
    as_of: date | None = None,
):
    target = as_of or date.today()
    with engine.begin() as conn:
        ensure_currency_schema(conn)
        rows = conn.execute(text("""
            SELECT l.currency_code, c.name AS currency_name, c.symbol,
                   l.account_id, l.account_code, l.account_name,
                   COALESCE(SUM(CASE WHEN l.debit>0 THEN l.foreign_amount ELSE -l.foreign_amount END),0) AS foreign_balance,
                   COALESCE(SUM(l.debit-l.credit),0) AS base_balance
            FROM accounting_voucher_lines l
            JOIN accounting_vouchers v ON v.id=l.voucher_id
            JOIN accounting_currencies c ON c.code=l.currency_code
            WHERE v.status='posted' AND l.currency_code IS NOT NULL
              AND (:period_id IS NULL OR v.fiscal_period_id=:period_id)
              AND v.voucher_date<=:as_of
            GROUP BY l.currency_code, l.account_id
            ORDER BY l.currency_code, l.account_code
        """), {
            "period_id": fiscal_period_id,
            "as_of": target.isoformat(),
        }).mappings().all()
        items = []
        for row in rows:
            rate_row = latest_rate(conn, row["currency_code"], target)
            foreign = _money(row["foreign_balance"])
            carrying = _money(row["base_balance"])
            current_value = _money(Decimal(str(foreign)) * Decimal(str(rate_row["rate_to_base"])))
            items.append({
                **dict(row), "foreign_balance": foreign,
                "base_balance": carrying, "current_rate": _rate(rate_row["rate_to_base"]),
                "current_base_value": current_value,
                "unrealized_difference": _money(current_value-carrying),
                "rate_date": rate_row["rate_date"],
            })
        return {
            "as_of": target.isoformat(),
            "fiscal_period_id": fiscal_period_id,
            "total_carrying_value": _money(sum(item["base_balance"] for item in items)),
            "total_current_value": _money(sum(item["current_base_value"] for item in items)),
            "total_unrealized_difference": _money(sum(item["unrealized_difference"] for item in items)),
            "items": items,
        }
