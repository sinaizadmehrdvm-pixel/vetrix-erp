import statistics
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.accounting_entry import AccountingEntry
from app.models.invoice import Invoice

MIN_SAMPLES_FOR_STATS = 5
OUTLIER_STDDEV_MULTIPLIER = 3
DUPLICATE_PAYMENT_WINDOW_MINUTES = 10
OFF_HOURS_START = 0
OFF_HOURS_END = 5


def _detect_unusual_invoice_amounts(invoices):
    anomalies = []
    by_type = defaultdict(list)
    for invoice in invoices:
        by_type[invoice.invoice_type].append(invoice)

    for invoice_type, group in by_type.items():
        amounts = [float(inv.total_amount or 0) for inv in group]
        if len(amounts) < MIN_SAMPLES_FOR_STATS:
            continue
        mean = statistics.mean(amounts)
        try:
            stdev = statistics.stdev(amounts)
        except statistics.StatisticsError:
            continue
        if stdev <= 0:
            continue
        threshold = mean + OUTLIER_STDDEV_MULTIPLIER * stdev
        for invoice in group:
            amount = float(invoice.total_amount or 0)
            if amount > threshold and amount > 0:
                anomalies.append({
                    "type": "unusual_invoice_amount",
                    "severity": "high",
                    "invoice_id": invoice.id,
                    "invoice_type": invoice.invoice_type,
                    "customer_id": invoice.customer_id,
                    "amount": amount,
                    "typical_amount": round(mean, 2),
                    "message": (
                        f"فاکتور شماره {invoice.id} به مبلغ {amount:,.0f} نسبت به میانگین "
                        f"فاکتورهای مشابه ({mean:,.0f}) به‌طور غیرعادی بالاست."
                    ),
                })
    return anomalies


def _detect_duplicate_payments(entries):
    anomalies = []
    groups = defaultdict(list)
    for entry in entries:
        if entry.source_type not in {"receipt", "payment"}:
            continue
        if not entry.customer_id or not entry.created_at:
            continue
        amount = round(float(entry.credit or entry.debit or 0), 2)
        if amount <= 0:
            continue
        groups[(entry.customer_id, entry.source_type, amount)].append(entry)

    window = timedelta(minutes=DUPLICATE_PAYMENT_WINDOW_MINUTES)
    for (customer_id, source_type, amount), group in groups.items():
        ordered = sorted(group, key=lambda entry: entry.created_at)
        for previous, current in zip(ordered, ordered[1:]):
            if current.created_at - previous.created_at <= window:
                anomalies.append({
                    "type": "duplicate_payment",
                    "severity": "medium",
                    "customer_id": customer_id,
                    "amount": amount,
                    "entry_ids": [previous.id, current.id],
                    "message": (
                        f"دو {'دریافت' if source_type == 'receipt' else 'پرداخت'} به مبلغ "
                        f"{amount:,.0f} برای طرف‌حساب یکسان در فاصله کمتر از "
                        f"{DUPLICATE_PAYMENT_WINDOW_MINUTES} دقیقه ثبت شده است."
                    ),
                })
    return anomalies


def _detect_off_hours_activity(invoices, time_zone_name):
    anomalies = []
    try:
        tz = ZoneInfo(time_zone_name or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")

    for invoice in invoices:
        if not invoice.created_at:
            continue
        local_time = invoice.created_at.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
        if OFF_HOURS_START <= local_time.hour < OFF_HOURS_END:
            anomalies.append({
                "type": "off_hours_activity",
                "severity": "low",
                "invoice_id": invoice.id,
                "invoice_type": invoice.invoice_type,
                "customer_id": invoice.customer_id,
                "local_hour": local_time.hour,
                "message": (
                    f"فاکتور شماره {invoice.id} در ساعت غیرمعمول کاری "
                    f"({local_time.strftime('%H:%M')}) ثبت شده است."
                ),
            })
    return anomalies


def detect_anomalies(db: Session, time_zone_name: str = "UTC") -> list[dict]:
    invoices = db.query(Invoice).all()
    entries = db.query(AccountingEntry).all()

    anomalies = []
    anomalies.extend(_detect_unusual_invoice_amounts(invoices))
    anomalies.extend(_detect_duplicate_payments(entries))
    anomalies.extend(_detect_off_hours_activity(invoices, time_zone_name))

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    anomalies.sort(key=lambda item: severity_rank.get(item["severity"], 3))
    return anomalies
