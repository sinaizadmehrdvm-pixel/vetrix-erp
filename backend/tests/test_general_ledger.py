import unittest

from app.accounting.posting import (
    cash_account_for_method,
    post_balanced_voucher,
    settlement_counterpart_account,
)


class GeneralLedgerPostingTests(unittest.TestCase):
    def test_unbalanced_voucher_is_rejected_before_database_write(self):
        with self.assertRaises(ValueError):
            post_balanced_voucher(
                "test",
                1,
                "Unbalanced test",
                [
                    {"account_code": "1101", "debit": 100},
                    {"account_code": "4101", "credit": 99},
                ],
            )

    def test_return_settlements_use_correct_counterpart_accounts(self):
        self.assertEqual(settlement_counterpart_account("sale", "receipt"), "1103")
        self.assertEqual(settlement_counterpart_account("buy", "payment"), "2101")
        self.assertEqual(settlement_counterpart_account("return_sale", "payment"), "1103")
        self.assertEqual(settlement_counterpart_account("return_buy", "receipt"), "2101")

    def test_cash_and_bank_methods_map_to_expected_accounts(self):
        self.assertEqual(cash_account_for_method("cash"), "1101")
        self.assertEqual(cash_account_for_method("bank"), "1102")
        self.assertEqual(cash_account_for_method("card"), "1102")
        self.assertEqual(cash_account_for_method("transfer"), "1102")


if __name__ == "__main__":
    unittest.main()
