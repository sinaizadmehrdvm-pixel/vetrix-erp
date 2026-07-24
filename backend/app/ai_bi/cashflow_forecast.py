from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.accounting_entry import AccountingEntry
from app.models.invoice import Invoice

HISTORICAL_WINDOW_DAYS = 90
FORECAST_HORIZON_DAYS = 30


def _num(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _settlement(db: Session, invoice):
    total = _num(invoice.total_amount)
    receipt_entries = db.query(AccountingEntry).filter(
        AccountingEntry.source_type == "receipt",
        AccountingEntry.source_id == invoice.id,
    ).all()
    payment_entries = db.query(AccountingEntry).filter(
        AccountingEntry.source_type == "payment",
        AccountingEntry.source_id == invoice.id,
    ).all()
    received = sum(_num(e.credit) for e in receipt_entries)
    paid = sum(_num(e.debit) for e in payment_entries)
    settled = (
        received if invoice.invoice_type in ("sale", "return_buy")
        else paid if invoice.invoice_type in ("buy", "return_sale")
        else 0
    )
    return max(total - settled, 0)


def build_cashflow_forecast(db: Session, horizon_days: int = FORECAST_HORIZON_DAYS) -> dict:
    today = datetime.utcnow().date()
    horizon_date = today + timedelta(days=horizon_days)

    entries = db.query(AccountingEntry).filter(
        AccountingEntry.source_type.in_(["receipt", "payment"])
    ).all()
    current_net_cash = sum(_num(e.credit) for e in entries if e.source_type == "receipt") - sum(
        _num(e.debit) for e in entries if e.source_type == "payment"
    )

    since = datetime.utcnow() - timedelta(days=HISTORICAL_WINDOW_DAYS)
    recent = [e for e in entries if e.created_at and e.created_at >= since]
    recent_receipts = sum(_num(e.credit) for e in recent if e.source_type == "receipt")
    recent_payments = sum(_num(e.debit) for e in recent if e.source_type == "payment")
    daily_average_net = (recent_receipts - recent_payments) / HISTORICAL_WINDOW_DAYS

    trend_projected_net_cash = current_net_cash + daily_average_net * horizon_days

    cheque_rows = db.execute(
        text(
            """
            SELECT direction, amount, due_date, cheque_number
            FROM treasury_cheques
            WHERE status = 'pending' AND due_date <= :horizon
            ORDER BY due_date ASC
            """
        ),
        {"horizon": horizon_date.isoformat()},
    ).mappings().all()

    scheduled_events = []
    scheduled_inflow = 0.0
    scheduled_outflow = 0.0
    for row in cheque_rows:
        amount = _num(row["amount"])
        due = row["due_date"]
        if isinstance(due, str):
            due = date.fromisoformat(due[:10])
        if row["direction"] == "received":
            scheduled_inflow += amount
        else:
            scheduled_outflow += amount
        scheduled_events.append({
            "type": f"cheque_{row['direction']}",
            "amount": amount,
            "due_date": due.isoformat(),
            "cheque_number": row["cheque_number"],
        })

    invoices = db.query(Invoice).filter(
        Invoice.invoice_type.in_(["sale", "buy", "return_sale", "return_buy"])
    ).all()
    open_receivables = 0.0
    open_payables = 0.0
    for invoice in invoices:
        remaining = _settlement(db, invoice)
        if remaining <= 0:
            continue
        if invoice.invoice_type in ("sale", "return_buy"):
            open_receivables += remaining
        else:
            open_payables += remaining

    return {
        "horizon_days": horizon_days,
        "current_net_cash": current_net_cash,
        "daily_average_net": daily_average_net,
        "trend_projected_net_cash": trend_projected_net_cash,
        "scheduled_inflow": scheduled_inflow,
        "scheduled_outflow": scheduled_outflow,
        "scheduled_net": scheduled_inflow - scheduled_outflow,
        "scheduled_events": scheduled_events,
        "open_receivables": open_receivables,
        "open_payables": open_payables,
    }
