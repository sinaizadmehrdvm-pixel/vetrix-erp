from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/accounting/aging", tags=["Receivables & Payables"])
MONEY_STEP = Decimal("0.01")


def _money(value):
    return float(Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP))


def _parse_as_of(value):
    if not value:
        return date.today()
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="as_of must use YYYY-MM-DD") from error


def _bucket(days_overdue):
    if days_overdue <= 0:
        return "current"
    if days_overdue <= 30:
        return "1_30"
    if days_overdue <= 60:
        return "31_60"
    if days_overdue <= 90:
        return "61_90"
    return "over_90"


@router.get("")
def aging_report(
    as_of: str | None = None,
    terms_days: int = Query(default=30, ge=0, le=365),
    include_settled: bool = False,
):
    report_date = _parse_as_of(as_of)
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT i.id AS invoice_id, i.invoice_type, i.total_amount,
                   i.payment_status, i.created_at, c.id AS customer_id,
                   c.name AS customer_name, c.customer_type, c.credit_limit,
                   COALESCE(SUM(CASE
                     WHEN e.source_type='receipt' THEN e.credit
                     WHEN e.source_type='payment' THEN e.debit
                     ELSE 0 END), 0) AS settled_amount
            FROM invoices i
            JOIN customers c ON c.id=i.customer_id
            LEFT JOIN accounting_entries e
              ON e.source_id=i.id
             AND e.source_type IN ('receipt', 'payment')
            WHERE i.invoice_type IN ('sale', 'return_buy', 'buy', 'return_sale')
              AND DATE(i.created_at) <= :as_of
            GROUP BY i.id, i.invoice_type, i.total_amount, i.payment_status,
                     i.created_at, c.id, c.name, c.customer_type, c.credit_limit
            ORDER BY i.created_at, i.id
        """), {"as_of": report_date.isoformat()}).mappings().all()

        buckets = {
            key: {"receivable": 0.0, "payable": 0.0, "count": 0}
            for key in ("current", "1_30", "31_60", "61_90", "over_90")
        }
        items = []
        parties = {}
        for row in rows:
            total = _money(row["total_amount"])
            settled = min(_money(row["settled_amount"]), total)
            outstanding = _money(max(total - settled, 0))
            if not include_settled and outstanding <= 0:
                continue

            invoice_date = datetime.fromisoformat(str(row["created_at"])).date()
            due_date = invoice_date + timedelta(days=terms_days)
            days_overdue = max((report_date - due_date).days, 0)
            bucket = _bucket(days_overdue)
            side = (
                "receivable"
                if row["invoice_type"] in {"sale", "return_buy"}
                else "payable"
            )
            status = (
                "settled" if outstanding <= 0
                else "overdue" if days_overdue > 0
                else "current"
            )
            item = {
                "invoice_id": row["invoice_id"],
                "invoice_type": row["invoice_type"],
                "customer_id": row["customer_id"],
                "customer_name": row["customer_name"],
                "customer_type": row["customer_type"],
                "side": side,
                "invoice_date": invoice_date.isoformat(),
                "due_date": due_date.isoformat(),
                "days_overdue": days_overdue,
                "bucket": bucket,
                "status": status,
                "total_amount": total,
                "settled_amount": settled,
                "outstanding_amount": outstanding,
            }
            items.append(item)
            buckets[bucket][side] = _money(buckets[bucket][side] + outstanding)
            buckets[bucket]["count"] += 1

            party = parties.setdefault(row["customer_id"], {
                "customer_id": row["customer_id"],
                "customer_name": row["customer_name"],
                "customer_type": row["customer_type"],
                "credit_limit": _money(row["credit_limit"]),
                "receivable": 0.0,
                "payable": 0.0,
                "overdue_receivable": 0.0,
                "overdue_payable": 0.0,
                "invoice_count": 0,
            })
            party[side] = _money(party[side] + outstanding)
            if days_overdue > 0:
                party[f"overdue_{side}"] = _money(
                    party[f"overdue_{side}"] + outstanding
                )
            party["invoice_count"] += 1

        party_rows = []
        for party in parties.values():
            party["net_position"] = _money(
                party["receivable"] - party["payable"]
            )
            party["credit_exposure"] = party["receivable"]
            party["over_credit_limit"] = bool(
                party["credit_limit"] > 0
                and party["credit_exposure"] > party["credit_limit"]
            )
            party_rows.append(party)
        party_rows.sort(
            key=lambda party: (
                -party["overdue_receivable"],
                -party["receivable"],
                party["customer_name"],
            )
        )

        receivable = _money(sum(item["outstanding_amount"] for item in items if item["side"] == "receivable"))
        payable = _money(sum(item["outstanding_amount"] for item in items if item["side"] == "payable"))
        overdue_receivable = _money(sum(item["outstanding_amount"] for item in items if item["side"] == "receivable" and item["days_overdue"] > 0))
        overdue_payable = _money(sum(item["outstanding_amount"] for item in items if item["side"] == "payable" and item["days_overdue"] > 0))

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "as_of": report_date.isoformat(),
            "terms_days": terms_days,
            "include_settled": include_settled,
            "summary": {
                "receivable": receivable,
                "payable": payable,
                "net_position": _money(receivable - payable),
                "overdue_receivable": overdue_receivable,
                "overdue_payable": overdue_payable,
                "open_invoice_count": len([item for item in items if item["outstanding_amount"] > 0]),
                "over_credit_limit_count": len([party for party in party_rows if party["over_credit_limit"]]),
            },
            "buckets": buckets,
            "parties": party_rows,
            "items": list(reversed(items)),
        }
