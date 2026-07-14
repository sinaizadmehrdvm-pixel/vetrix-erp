import unittest

from fastapi import HTTPException

from app.financial_policy import PolicyDraft, _validate


class CountryFinancialPolicyContractTests(unittest.TestCase):
    def policy(self, **overrides):
        values = {
            "version": "FI-2026-01",
            "country_code": "FI",
            "currency_code": "EUR",
            "decimal_places": 2,
            "rounding_mode": "half_up",
            "effective_from": "2026-07-14",
            "calendar_system": "gregory",
            "time_zone": "Europe/Helsinki",
            "first_day_of_week": 1,
            "fiscal_year_start": "01-01",
            "measurement_system": "metric",
            "tax_percent": 25.5,
            **overrides,
        }
        return PolicyDraft(**values)

    def test_complete_country_policy_is_valid(self):
        policy = self.policy()
        self.assertIsNone(_validate(policy))
        self.assertEqual(policy.currency_code, "EUR")
        self.assertEqual(policy.tax_percent, 25.5)

    def test_unknown_time_zone_is_rejected(self):
        with self.assertRaisesRegex(HTTPException, "Unknown IANA time zone"):
            _validate(self.policy(time_zone="Europe/Unknown"))

    def test_unsupported_calendar_is_rejected(self):
        with self.assertRaisesRegex(HTTPException, "Unsupported calendar"):
            _validate(self.policy(calendar_system="fictional"))

    def test_invalid_country_and_currency_codes_are_rejected(self):
        with self.assertRaisesRegex(HTTPException, "country_code"):
            _validate(self.policy(country_code="FIN"))
        with self.assertRaisesRegex(HTTPException, "currency_code"):
            _validate(self.policy(currency_code="EU"))

    def test_invalid_fiscal_start_is_rejected(self):
        with self.assertRaisesRegex(HTTPException, "fiscal year"):
            _validate(self.policy(fiscal_year_start="January"))

    def test_tax_and_weekday_ranges_are_enforced_by_schema(self):
        with self.assertRaises(ValueError):
            self.policy(tax_percent=101)
        with self.assertRaises(ValueError):
            self.policy(first_day_of_week=7)


if __name__ == "__main__":
    unittest.main()
