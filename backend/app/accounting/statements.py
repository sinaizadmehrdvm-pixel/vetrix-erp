from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/api/accounting/statements",
    tags=["Financial Statements"],
)
MONEY_STEP = Decimal("0.01")


def _money(value):
    return float(
        Decimal(str(value or 0)).quantize(
            MONEY_STEP,
            rounding=ROUND_HALF_UP,
        )
    )


def _period(conn, fiscal_period_id):
    if fiscal_period_id is None:
        return None
    row = conn.execute(text("""
        SELECT id, name, start_date, end_date, status
        FROM fiscal_periods
        WHERE id=:id
    """), {"id": fiscal_period_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Fiscal period not found")
    return dict(row)


def _account_balances(conn, where_sql="", params=None):
    rows = conn.execute(text(f"""
        SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
               COALESCE(SUM(l.debit), 0) AS debit,
               COALESCE(SUM(l.credit), 0) AS credit
        FROM chart_accounts a
        JOIN accounting_voucher_lines l ON l.account_id=a.id
        JOIN accounting_vouchers v ON v.id=l.voucher_id
        WHERE v.status='posted' {where_sql}
        GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
        ORDER BY a.code
    """), params or {}).mappings().all()
    return [dict(row) for row in rows]


def _income_statement(rows):
    revenue_items = []
    expense_items = []
    for row in rows:
        if row["account_type"] in {"revenue", "contra"}:
            amount = _money(row["credit"] - row["debit"])
            if amount:
                revenue_items.append({
                    "account_id": row["id"],
                    "account_code": row["code"],
                    "account_name": row["name"],
                    "amount": amount,
                })
        elif row["account_type"] == "expense":
            amount = _money(row["debit"] - row["credit"])
            if amount:
                expense_items.append({
                    "account_id": row["id"],
                    "account_code": row["code"],
                    "account_name": row["name"],
                    "amount": amount,
                })

    total_revenue = _money(sum(item["amount"] for item in revenue_items))
    total_expenses = _money(sum(item["amount"] for item in expense_items))
    return {
        "revenue_items": revenue_items,
        "expense_items": expense_items,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_income": _money(total_revenue - total_expenses),
    }


def _balance_sheet(rows, current_earnings):
    assets = []
    liabilities = []
    equity = []
    for row in rows:
        if row["account_type"] == "asset":
            amount = _money(row["debit"] - row["credit"])
            target = assets
        elif row["account_type"] == "liability":
            amount = _money(row["credit"] - row["debit"])
            target = liabilities
        elif row["account_type"] == "equity":
            amount = _money(row["credit"] - row["debit"])
            target = equity
        else:
            continue
        if amount:
            target.append({
                "account_id": row["id"],
                "account_code": row["code"],
                "account_name": row["name"],
                "amount": amount,
            })

    total_assets = _money(sum(item["amount"] for item in assets))
    total_liabilities = _money(
        sum(item["amount"] for item in liabilities)
    )
    base_equity = _money(sum(item["amount"] for item in equity))
    total_equity = _money(base_equity + current_earnings)
    right_side = _money(total_liabilities + total_equity)
    difference = _money(total_assets - right_side)
    return {
        "asset_items": assets,
        "liability_items": liabilities,
        "equity_items": equity,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "base_equity": base_equity,
        "current_earnings": _money(current_earnings),
        "total_equity": total_equity,
        "liabilities_and_equity": right_side,
        "difference": difference,
        "balanced": abs(difference) < 0.01,
    }


def _cash_totals(conn, condition="", params=None):
    row = conn.execute(text(f"""
        SELECT COALESCE(SUM(l.debit), 0) AS inflows,
               COALESCE(SUM(l.credit), 0) AS outflows
        FROM accounting_voucher_lines l
        JOIN accounting_vouchers v ON v.id=l.voucher_id
        WHERE v.status='posted'
          AND l.account_code IN ('1101', '1102')
          {condition}
    """), params or {}).mappings().first()
    inflows = _money(row["inflows"] if row else 0)
    outflows = _money(row["outflows"] if row else 0)
    return inflows, outflows


def _cash_flow(conn, period):
    if period:
        opening_in, opening_out = _cash_totals(
            conn,
            "AND v.voucher_date < :start_date",
            {"start_date": period["start_date"]},
        )
        inflows, outflows = _cash_totals(
            conn,
            "AND v.fiscal_period_id=:period_id",
            {"period_id": period["id"]},
        )
    else:
        opening_in = opening_out = 0.0
        inflows, outflows = _cash_totals(conn)

    opening_balance = _money(opening_in - opening_out)
    net_change = _money(inflows - outflows)
    ending_balance = _money(opening_balance + net_change)

    accounts = conn.execute(text("""
        SELECT l.account_code, l.account_name,
               COALESCE(SUM(l.debit), 0) AS inflows,
               COALESCE(SUM(l.credit), 0) AS outflows
        FROM accounting_voucher_lines l
        JOIN accounting_vouchers v ON v.id=l.voucher_id
        WHERE v.status='posted'
          AND l.account_code IN ('1101', '1102')
          AND (:period_id IS NULL OR v.fiscal_period_id=:period_id)
        GROUP BY l.account_code, l.account_name
        ORDER BY l.account_code
    """), {
        "period_id": period["id"] if period else None,
    }).mappings().all()

    return {
        "opening_balance": opening_balance,
        "inflows": inflows,
        "outflows": outflows,
        "net_change": net_change,
        "ending_balance": ending_balance,
        "accounts": [
            {
                "account_code": row["account_code"],
                "account_name": row["account_name"],
                "inflows": _money(row["inflows"]),
                "outflows": _money(row["outflows"]),
                "net_change": _money(row["inflows"] - row["outflows"]),
            }
            for row in accounts
        ],
        "reconciled": abs(
            _money(opening_balance + net_change - ending_balance)
        ) < 0.01,
    }


@router.get("")
def financial_statements(fiscal_period_id: int | None = None):
    with engine.begin() as conn:
        tables = {
            row[0]
            for row in conn.execute(text("""
                SELECT name FROM sqlite_master WHERE type='table'
            """)).fetchall()
        }
        required = {
            "chart_accounts",
            "accounting_vouchers",
            "accounting_voucher_lines",
            "fiscal_periods",
        }
        if not required <= tables:
            raise HTTPException(
                status_code=409,
                detail="Accounting schema is not initialized",
            )

        period = _period(conn, fiscal_period_id)
        if period:
            income_rows = _account_balances(
                conn,
                "AND v.fiscal_period_id=:period_id",
                {"period_id": period["id"]},
            )
            balance_rows = _account_balances(
                conn,
                "AND v.voucher_date <= :end_date",
                {"end_date": period["end_date"]},
            )
        else:
            income_rows = _account_balances(conn)
            balance_rows = income_rows

        income = _income_statement(income_rows)
        accumulated_income = _income_statement(balance_rows)
        balance = _balance_sheet(
            balance_rows,
            accumulated_income["net_income"],
        )
        balance["period_net_income"] = income["net_income"]
        balance["accumulated_earnings"] = accumulated_income["net_income"]
        cash = _cash_flow(conn, period)
        voucher_count = conn.execute(text("""
            SELECT COUNT(*) FROM accounting_vouchers
            WHERE status='posted'
              AND (:period_id IS NULL OR fiscal_period_id=:period_id)
        """), {
            "period_id": period["id"] if period else None,
        }).scalar() or 0

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "period": period,
            "scope": "fiscal_period" if period else "all_time",
            "posted_vouchers": int(voucher_count),
            "income_statement": income,
            "balance_sheet": balance,
            "cash_flow": cash,
            "valid": balance["balanced"] and cash["reconciled"],
        }
