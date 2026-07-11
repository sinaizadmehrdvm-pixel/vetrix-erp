from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/accounting/tax", tags=["VAT Accounting"])
MONEY_STEP = Decimal("0.01")


def _money(value):
    return float(
        Decimal(str(value or 0)).quantize(
            MONEY_STEP,
            rounding=ROUND_HALF_UP,
        )
    )


@router.get("")
def vat_report(fiscal_period_id: int | None = None):
    with engine.begin() as conn:
        period = None
        if fiscal_period_id is not None:
            period = conn.execute(text("""
                SELECT id, name, start_date, end_date, status
                FROM fiscal_periods WHERE id=:id
            """), {"id": fiscal_period_id}).mappings().first()
            if not period:
                raise HTTPException(
                    status_code=404,
                    detail="Fiscal period not found",
                )
            period = dict(period)

        rows = conn.execute(text("""
            SELECT v.id AS voucher_id, v.voucher_no, v.voucher_date,
                   v.source_id AS invoice_id,
                   i.invoice_type, i.subtotal, i.discount_amount,
                   i.tax_amount, i.shipping_cost, i.total_amount,
                   l.account_code, l.debit, l.credit
            FROM accounting_vouchers v
            JOIN accounting_voucher_lines l ON l.voucher_id=v.id
            LEFT JOIN invoices i
              ON v.source_type='invoice' AND i.id=v.source_id
            WHERE v.status='posted'
              AND v.source_type='invoice'
              AND l.account_code IN ('1301', '2201')
              AND (:period_id IS NULL OR v.fiscal_period_id=:period_id)
            ORDER BY v.voucher_date, v.voucher_no, l.id
        """), {
            "period_id": period["id"] if period else None,
        }).mappings().all()

        output_vat = Decimal("0")
        input_vat = Decimal("0")
        items = []
        for row in rows:
            debit = _money(row["debit"])
            credit = _money(row["credit"])
            if row["account_code"] == "2201":
                movement = _money(credit - debit)
                output_vat += Decimal(str(movement))
                vat_type = "output"
            else:
                movement = _money(debit - credit)
                input_vat += Decimal(str(movement))
                vat_type = "input"
            items.append({
                "voucher_id": row["voucher_id"],
                "voucher_no": row["voucher_no"],
                "voucher_date": row["voucher_date"],
                "invoice_id": row["invoice_id"],
                "invoice_type": row["invoice_type"],
                "vat_type": vat_type,
                "movement": movement,
                "tax_amount": _money(row["tax_amount"]),
                "taxable_base": _money(
                    (row["subtotal"] or 0)
                    - (row["discount_amount"] or 0)
                ),
                "shipping_cost": _money(row["shipping_cost"]),
                "total_amount": _money(row["total_amount"]),
            })

        output_value = _money(output_vat)
        input_value = _money(input_vat)
        net = _money(output_vat - input_vat)
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "period": period,
            "scope": "fiscal_period" if period else "all_time",
            "output_vat": output_value,
            "input_vat": input_value,
            "net_vat": net,
            "position": (
                "payable" if net > 0 else "credit" if net < 0 else "settled"
            ),
            "invoice_count": len({item["invoice_id"] for item in items}),
            "items": items,
        }
