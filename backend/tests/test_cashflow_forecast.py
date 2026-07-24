import tempfile
import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.ai_bi.cashflow_forecast import build_cashflow_forecast
from app.database import Base
from app.models.accounting_entry import AccountingEntry
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.product import Product  # noqa: F401 - registers the FK target table on Base.metadata


class CashflowForecastTests(unittest.TestCase):
    """Isolated engine/tables, matching the pattern in test_pricing.py, so
    this suite never depends on cross-test-module collection order."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{self.temp.name}/cashflow.db",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE treasury_cheques (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    direction VARCHAR NOT NULL,
                    amount FLOAT NOT NULL,
                    cheque_number VARCHAR NOT NULL,
                    due_date DATE NOT NULL,
                    status VARCHAR NOT NULL DEFAULT 'pending'
                )
            """))
        self.db = Session(bind=self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.temp.cleanup()

    def _add_entry(self, source_type, amount, days_ago=0):
        entry = AccountingEntry(
            customer_id=None,
            source_type=source_type,
            source_id=None,
            entry_type="credit" if source_type == "receipt" else "debit",
            description="test",
            debit=amount if source_type == "payment" else 0,
            credit=amount if source_type == "receipt" else 0,
            created_at=datetime.utcnow() - timedelta(days=days_ago),
        )
        self.db.add(entry)
        self.db.commit()

    def _add_cheque(self, direction, amount, due_in_days, status="pending"):
        due = (datetime.utcnow().date() + timedelta(days=due_in_days)).isoformat()
        self.db.execute(
            text(
                "INSERT INTO treasury_cheques (direction, amount, cheque_number, due_date, status) "
                "VALUES (:direction, :amount, :cheque_number, :due_date, :status)"
            ),
            {"direction": direction, "amount": amount, "cheque_number": f"CHK-{direction}-{amount}", "due_date": due, "status": status},
        )
        self.db.commit()

    def test_empty_ledger_produces_zeroed_forecast(self):
        result = build_cashflow_forecast(self.db, horizon_days=30)
        self.assertEqual(result["current_net_cash"], 0)
        self.assertEqual(result["daily_average_net"], 0)
        self.assertEqual(result["trend_projected_net_cash"], 0)
        self.assertEqual(result["scheduled_events"], [])

    def test_trend_projection_extrapolates_historical_average(self):
        self._add_entry("receipt", 1000, days_ago=10)
        self._add_entry("payment", 100, days_ago=5)

        result = build_cashflow_forecast(self.db, horizon_days=30)
        self.assertEqual(result["current_net_cash"], 900)
        expected_daily_average = (1000 - 100) / 90
        self.assertAlmostEqual(result["daily_average_net"], expected_daily_average)
        self.assertAlmostEqual(
            result["trend_projected_net_cash"], 900 + expected_daily_average * 30
        )

    def test_ignores_entries_outside_historical_window_for_average_but_not_for_current(self):
        self._add_entry("receipt", 5000, days_ago=200)  # outside 90-day window
        self._add_entry("receipt", 100, days_ago=1)

        result = build_cashflow_forecast(self.db, horizon_days=30)
        self.assertEqual(result["current_net_cash"], 5100)
        self.assertAlmostEqual(result["daily_average_net"], 100 / 90)

    def test_pending_cheques_within_horizon_are_scheduled(self):
        self._add_cheque("received", 2000, due_in_days=10)
        self._add_cheque("issued", 800, due_in_days=20)
        self._add_cheque("received", 500, due_in_days=45)  # outside 30-day horizon

        result = build_cashflow_forecast(self.db, horizon_days=30)
        self.assertEqual(result["scheduled_inflow"], 2000)
        self.assertEqual(result["scheduled_outflow"], 800)
        self.assertEqual(result["scheduled_net"], 1200)
        self.assertEqual(len(result["scheduled_events"]), 2)

    def test_cleared_cheques_are_not_scheduled(self):
        self._add_cheque("received", 2000, due_in_days=5, status="cleared")
        result = build_cashflow_forecast(self.db, horizon_days=30)
        self.assertEqual(result["scheduled_inflow"], 0)
        self.assertEqual(result["scheduled_events"], [])

    def test_open_invoices_split_into_receivables_and_payables(self):
        customer = Customer(name="Forecast Test Customer")
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)

        sale = Invoice(invoice_type="sale", customer_id=customer.id, total_amount=1000, payment_status="unpaid")
        buy = Invoice(invoice_type="buy", customer_id=customer.id, total_amount=400, payment_status="unpaid")
        paid_sale = Invoice(invoice_type="sale", customer_id=customer.id, total_amount=300, payment_status="unpaid")
        self.db.add_all([sale, buy, paid_sale])
        self.db.commit()
        self.db.refresh(paid_sale)

        # Fully settle paid_sale via a receipt entry so its remaining balance is zero.
        self.db.add(AccountingEntry(
            customer_id=customer.id, source_type="receipt", source_id=paid_sale.id,
            entry_type="credit", description="settle", debit=0, credit=300,
            created_at=datetime.utcnow(),
        ))
        self.db.commit()

        result = build_cashflow_forecast(self.db, horizon_days=30)
        self.assertEqual(result["open_receivables"], 1000)
        self.assertEqual(result["open_payables"], 400)


if __name__ == "__main__":
    unittest.main()
