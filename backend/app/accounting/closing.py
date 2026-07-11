from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from app.accounting.periods import (
    close_fiscal_period,
    ensure_fiscal_schema,
    reopen_fiscal_period,
)
from app.accounting.posting import (
    _ensure_schema,
    delete_source_voucher,
    post_balanced_voucher,
)
from app.database import engine

router = APIRouter(
    prefix="/api/accounting/periods",
    tags=["Fiscal Closing"],
)
MONEY_STEP = Decimal("0.01")


def _money(value):
    return Decimal(str(value or 0)).quantize(
        MONEY_STEP,
        rounding=ROUND_HALF_UP,
    )


def _require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")


def _get_period(conn, period_id):
    ensure_fiscal_schema(conn)
    period = conn.execute(text("""
        SELECT * FROM fiscal_periods WHERE id=:id
    """), {"id": period_id}).mappings().first()
    if not period:
        raise ValueError("Fiscal period not found")
    return dict(period)


def fiscal_closing_preview(conn, period_id):
    _ensure_schema(conn)
    period = _get_period(conn, period_id)
    rows = conn.execute(text("""
        SELECT a.id AS account_id, a.code AS account_code,
               a.name AS account_name, a.account_type,
               COALESCE(SUM(l.debit), 0) AS debit,
               COALESCE(SUM(l.credit), 0) AS credit
        FROM chart_accounts a
        JOIN accounting_voucher_lines l ON l.account_id=a.id
        JOIN accounting_vouchers v ON v.id=l.voucher_id
        WHERE v.status='posted'
          AND v.fiscal_period_id=:period_id
          AND v.source_type!='fiscal_close'
          AND a.account_type IN ('revenue', 'contra', 'expense')
        GROUP BY a.id, a.code, a.name, a.account_type
        ORDER BY a.code
    """), {"period_id": period_id}).mappings().all()

    lines = []
    account_summary = []
    closing_debit = Decimal("0")
    closing_credit = Decimal("0")
    for row in rows:
        balance = _money(row["debit"]) - _money(row["credit"])
        if balance == 0:
            continue
        if balance > 0:
            debit = Decimal("0")
            credit = balance
        else:
            debit = -balance
            credit = Decimal("0")
        closing_debit += debit
        closing_credit += credit
        lines.append({
            "account_code": row["account_code"],
            "description": f"بستن حساب {row['account_name']}",
            "debit": float(debit),
            "credit": float(credit),
        })
        account_summary.append({
            "account_id": row["account_id"],
            "account_code": row["account_code"],
            "account_name": row["account_name"],
            "account_type": row["account_type"],
            "balance": float(balance),
            "closing_debit": float(debit),
            "closing_credit": float(credit),
        })

    difference = closing_debit - closing_credit
    net_income = difference
    if difference > 0:
        lines.append({
            "account_code": "3201",
            "description": "انتقال سود دوره به سود و زیان انباشته",
            "debit": 0.0,
            "credit": float(difference),
        })
        closing_credit += difference
    elif difference < 0:
        loss = -difference
        lines.append({
            "account_code": "3201",
            "description": "انتقال زیان دوره به سود و زیان انباشته",
            "debit": float(loss),
            "credit": 0.0,
        })
        closing_debit += loss

    existing = conn.execute(text("""
        SELECT id, voucher_no, period_voucher_no
        FROM accounting_vouchers
        WHERE source_type='fiscal_close' AND source_id=:period_id
        LIMIT 1
    """), {"period_id": period_id}).mappings().first()

    return {
        "period": period,
        "accounts": account_summary,
        "lines": lines,
        "net_income": float(net_income),
        "closing_debit": float(closing_debit),
        "closing_credit": float(closing_credit),
        "balanced": closing_debit == closing_credit,
        "existing_closing_voucher": dict(existing) if existing else None,
    }


def close_books(conn, period_id):
    preview = fiscal_closing_preview(conn, period_id)
    period = preview["period"]
    if period["status"] == "closed":
        return {
            **period,
            "closing_voucher_id": (
                preview["existing_closing_voucher"]["id"]
                if preview["existing_closing_voucher"]
                else None
            ),
            "net_income": preview["net_income"],
        }

    voucher_id = None
    if preview["lines"]:
        if not preview["balanced"]:
            raise ValueError("Fiscal closing preview is not balanced")
        voucher_id = post_balanced_voucher(
            "fiscal_close",
            period_id,
            f"سند اختتامیه دوره مالی: {period['name']}",
            preview["lines"],
            voucher_date=period["end_date"],
            connection=conn,
        )
    closed = close_fiscal_period(conn, period_id)
    return {
        **closed,
        "closing_voucher_id": voucher_id,
        "net_income": preview["net_income"],
        "closed_accounts": len(preview["accounts"]),
    }


def reopen_books(conn, period_id):
    reopened = reopen_fiscal_period(conn, period_id)
    delete_source_voucher(
        "fiscal_close",
        period_id,
        connection=conn,
    )
    return {
        **reopened,
        "closing_voucher_removed": True,
    }


@router.get("/{period_id}/close-preview")
def closing_preview(period_id: int, request: Request):
    _require_admin(request)
    try:
        with engine.begin() as conn:
            return fiscal_closing_preview(conn, period_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
