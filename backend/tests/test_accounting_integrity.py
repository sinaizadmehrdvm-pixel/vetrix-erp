import unittest
from types import SimpleNamespace

from app.accounting.integrity import (
    aggregate_item_quantities,
    calculate_invoice_totals,
    calculate_payment_status,
    expected_settlement_type,
    money,
)


class InvoiceIntegrityTests(unittest.TestCase):
    def test_totals_are_rounded_in_business_order(self):
        items = [
            SimpleNamespace(quantity=2, unit_price=1000),
        ]
        totals = calculate_invoice_totals(
            items,
            discount_percent=10,
            tax_percent=10,
            shipping_cost=50,
        )
        self.assertEqual(totals["subtotal"], 2000.0)
        self.assertEqual(totals["discount_amount"], 200.0)
        self.assertEqual(totals["tax_amount"], 180.0)
        self.assertEqual(totals["total_amount"], 2030.0)

    def test_country_precision_and_rounding_modes_are_explicit(self):
        self.assertEqual(money("2.5", decimal_places=0, rounding_mode="half_up"), 3)
        self.assertEqual(money("2.5", decimal_places=0, rounding_mode="half_even"), 2)
        self.assertEqual(money("2.01", decimal_places=0, rounding_mode="down"), 2)
        self.assertEqual(money("2.01", decimal_places=0, rounding_mode="up"), 3)
        self.assertEqual(money("1.23456", decimal_places=4), money("1.2346", decimal_places=4))

    def test_invoice_totals_support_verified_zero_decimal_policy(self):
        totals = calculate_invoice_totals(
            [SimpleNamespace(quantity=1, unit_price="10.5")],
            discount_percent=0,
            tax_percent=10,
            shipping_cost=0,
            decimal_places=0,
            rounding_mode="half_up",
        )
        self.assertEqual(totals["subtotal"], 11.0)
        self.assertEqual(totals["tax_amount"], 1.0)
        self.assertEqual(totals["total_amount"], 12.0)

    def test_invalid_financial_policy_is_rejected(self):
        with self.assertRaises(ValueError):
            money(1, decimal_places=5)
        with self.assertRaises(ValueError):
            money(1, decimal_places=-1)
        with self.assertRaises(ValueError):
            money(1, rounding_mode="unknown")

    def test_invalid_percentages_and_shipping_are_rejected(self):
        items = [SimpleNamespace(quantity=1, unit_price=100)]
        for kwargs in (
            {"discount_percent": -1},
            {"discount_percent": 101},
            {"tax_percent": -1},
            {"tax_percent": 101},
            {"shipping_cost": -1},
        ):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    calculate_invoice_totals(items, **kwargs)

    def test_duplicate_product_quantities_are_aggregated(self):
        items = [
            SimpleNamespace(product_id=7, quantity=6),
            SimpleNamespace(product_id=7, quantity=5),
            SimpleNamespace(product_id=8, quantity=2),
        ]
        self.assertEqual(aggregate_item_quantities(items), {7: 11.0, 8: 2.0})

    def test_payment_status_and_settlement_direction(self):
        self.assertEqual(calculate_payment_status(100, 0), "unpaid")
        self.assertEqual(calculate_payment_status(100, 20), "partial")
        self.assertEqual(calculate_payment_status(100, 100), "paid")
        self.assertEqual(expected_settlement_type("sale"), "receipt")
        self.assertEqual(expected_settlement_type("buy"), "payment")
        self.assertIsNone(expected_settlement_type("proforma"))


if __name__ == "__main__":
    unittest.main()
