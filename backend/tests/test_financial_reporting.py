import unittest
from types import SimpleNamespace

from app.accounting.reporting import (
    build_profit_loss,
    customer_net_sales,
    net_period_total,
)


class FinancialReportingTests(unittest.TestCase):
    def test_profit_uses_cogs_instead_of_total_purchases(self):
        invoices = [
            SimpleNamespace(id=1, customer_id=10, invoice_type="sale", total_amount=1000),
            SimpleNamespace(id=2, customer_id=10, invoice_type="return_sale", total_amount=200),
            SimpleNamespace(id=3, customer_id=20, invoice_type="buy", total_amount=500),
            SimpleNamespace(id=4, customer_id=20, invoice_type="return_buy", total_amount=100),
        ]
        items = [
            SimpleNamespace(invoice_id=1, product_id=7, quantity=2),
            SimpleNamespace(invoice_id=2, product_id=7, quantity=0.5),
        ]
        report = build_profit_loss(invoices, items, {7: 100}, [50])

        self.assertEqual(report["net_sales"], 800.0)
        self.assertEqual(report["net_purchases"], 400.0)
        self.assertEqual(report["cost_of_goods_sold"], 150.0)
        self.assertEqual(report["gross_profit"], 650.0)
        self.assertEqual(report["net_profit"], 600.0)

    def test_customer_and_period_sales_are_net_of_returns(self):
        invoices = [
            SimpleNamespace(customer_id=1, invoice_type="sale", total_amount=1000),
            SimpleNamespace(customer_id=1, invoice_type="return_sale", total_amount=250),
            SimpleNamespace(customer_id=2, invoice_type="sale", total_amount=300),
        ]
        customers = customer_net_sales(invoices)
        self.assertEqual(customers[1]["sales_amount"], 750.0)
        self.assertEqual(customers[1]["invoice_count"], 1)

        total = net_period_total(
            invoices,
            "sale",
            "return_sale",
            lambda invoice: invoice.customer_id == 1,
        )
        self.assertEqual(total, 750.0)


if __name__ == "__main__":
    unittest.main()
