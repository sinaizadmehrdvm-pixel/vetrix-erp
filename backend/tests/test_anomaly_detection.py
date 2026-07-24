import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.ai_bi.anomaly_detection import detect_anomalies


def make_invoice(id, invoice_type, total_amount, customer_id=1, created_at=None):
    return SimpleNamespace(
        id=id,
        invoice_type=invoice_type,
        total_amount=total_amount,
        customer_id=customer_id,
        created_at=created_at or datetime(2026, 1, 1, 12, 0, 0),
    )


def make_entry(id, source_type, customer_id, amount, created_at, is_credit=True):
    return SimpleNamespace(
        id=id,
        source_type=source_type,
        customer_id=customer_id,
        credit=amount if is_credit else 0,
        debit=0 if is_credit else amount,
        created_at=created_at,
    )


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeSession:
    def __init__(self, invoices=None, entries=None):
        self._invoices = invoices or []
        self._entries = entries or []

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "Invoice":
            return FakeQuery(self._invoices)
        if name == "AccountingEntry":
            return FakeQuery(self._entries)
        return FakeQuery([])


class UnusualInvoiceAmountTests(unittest.TestCase):
    def test_flags_statistical_outlier_within_same_invoice_type(self):
        # A large, diluted sample of tightly clustered invoices keeps the
        # mean/stdev stable enough that a single extreme outlier still
        # clears the mean + 3*stdev threshold.
        invoices = [make_invoice(i, "sale", 950 + (i % 10) * 10) for i in range(20)]
        invoices.append(make_invoice(999, "sale", 20000))
        db = FakeSession(invoices=invoices)

        anomalies = detect_anomalies(db)
        flagged_ids = {a["invoice_id"] for a in anomalies if a["type"] == "unusual_invoice_amount"}
        self.assertIn(999, flagged_ids)
        self.assertNotIn(0, flagged_ids)

    def test_does_not_flag_when_sample_size_too_small(self):
        invoices = [make_invoice(i, "sale", 1000) for i in range(3)]
        invoices.append(make_invoice(99, "sale", 50000))
        db = FakeSession(invoices=invoices)

        anomalies = detect_anomalies(db)
        self.assertEqual([a for a in anomalies if a["type"] == "unusual_invoice_amount"], [])

    def test_uniform_amounts_produce_no_outliers(self):
        invoices = [make_invoice(i, "sale", 1000) for i in range(10)]
        db = FakeSession(invoices=invoices)

        anomalies = detect_anomalies(db)
        self.assertEqual([a for a in anomalies if a["type"] == "unusual_invoice_amount"], [])


class DuplicatePaymentTests(unittest.TestCase):
    def test_flags_same_amount_same_customer_within_window(self):
        base = datetime(2026, 1, 1, 10, 0, 0)
        entries = [
            make_entry(1, "receipt", 5, 2000, base),
            make_entry(2, "receipt", 5, 2000, base + timedelta(minutes=3)),
        ]
        db = FakeSession(entries=entries)

        anomalies = detect_anomalies(db)
        duplicate = [a for a in anomalies if a["type"] == "duplicate_payment"]
        self.assertEqual(len(duplicate), 1)
        self.assertEqual(set(duplicate[0]["entry_ids"]), {1, 2})

    def test_does_not_flag_when_outside_window(self):
        base = datetime(2026, 1, 1, 10, 0, 0)
        entries = [
            make_entry(1, "receipt", 5, 2000, base),
            make_entry(2, "receipt", 5, 2000, base + timedelta(hours=5)),
        ]
        db = FakeSession(entries=entries)

        anomalies = detect_anomalies(db)
        self.assertEqual([a for a in anomalies if a["type"] == "duplicate_payment"], [])

    def test_does_not_flag_different_customers(self):
        base = datetime(2026, 1, 1, 10, 0, 0)
        entries = [
            make_entry(1, "receipt", 5, 2000, base),
            make_entry(2, "receipt", 6, 2000, base + timedelta(minutes=1)),
        ]
        db = FakeSession(entries=entries)

        anomalies = detect_anomalies(db)
        self.assertEqual([a for a in anomalies if a["type"] == "duplicate_payment"], [])


class OffHoursActivityTests(unittest.TestCase):
    def test_flags_invoice_created_at_night_in_configured_timezone(self):
        # 02:00 UTC == 05:30 in Asia/Tehran (UTC+3:30) - well inside business hours there,
        # so use a timezone where 02:00 UTC really is off-hours to keep this deterministic.
        invoices = [make_invoice(1, "sale", 1000, created_at=datetime(2026, 1, 1, 2, 0, 0))]
        db = FakeSession(invoices=invoices)

        anomalies = detect_anomalies(db, time_zone_name="UTC")
        off_hours = [a for a in anomalies if a["type"] == "off_hours_activity"]
        self.assertEqual(len(off_hours), 1)
        self.assertEqual(off_hours[0]["invoice_id"], 1)

    def test_does_not_flag_daytime_invoice(self):
        invoices = [make_invoice(1, "sale", 1000, created_at=datetime(2026, 1, 1, 14, 0, 0))]
        db = FakeSession(invoices=invoices)

        anomalies = detect_anomalies(db, time_zone_name="UTC")
        self.assertEqual([a for a in anomalies if a["type"] == "off_hours_activity"], [])

    def test_falls_back_to_utc_for_unknown_timezone(self):
        invoices = [make_invoice(1, "sale", 1000, created_at=datetime(2026, 1, 1, 2, 0, 0))]
        db = FakeSession(invoices=invoices)

        anomalies = detect_anomalies(db, time_zone_name="Not/A_Real_Zone")
        off_hours = [a for a in anomalies if a["type"] == "off_hours_activity"]
        self.assertEqual(len(off_hours), 1)


if __name__ == "__main__":
    unittest.main()
