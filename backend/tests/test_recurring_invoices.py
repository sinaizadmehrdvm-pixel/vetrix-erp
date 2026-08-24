import unittest
from datetime import date

from app.recurring_invoices import _advance_date


class AdvanceDateTests(unittest.TestCase):
    def test_weekly_adds_seven_days(self):
        self.assertEqual(_advance_date(date(2026, 3, 10), "weekly", None), date(2026, 3, 17))

    def test_custom_uses_interval_days(self):
        self.assertEqual(_advance_date(date(2026, 1, 1), "custom", 10), date(2026, 1, 11))

    def test_custom_falls_back_to_thirty_days_without_interval(self):
        self.assertEqual(_advance_date(date(2026, 1, 1), "custom", None), date(2026, 1, 31))

    def test_monthly_preserves_day_of_month(self):
        self.assertEqual(_advance_date(date(2026, 3, 15), "monthly", None), date(2026, 4, 15))

    def test_monthly_clamps_at_shorter_month_end(self):
        self.assertEqual(_advance_date(date(2026, 1, 31), "monthly", None), date(2026, 2, 28))

    def test_monthly_handles_leap_year_february(self):
        self.assertEqual(_advance_date(date(2028, 1, 31), "monthly", None), date(2028, 2, 29))

    def test_monthly_rolls_over_december_into_next_year(self):
        self.assertEqual(_advance_date(date(2026, 12, 15), "monthly", None), date(2027, 1, 15))


if __name__ == "__main__":
    unittest.main()
