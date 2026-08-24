import unittest

from app.document_ocr import _parse_line_items


class ParseLineItemsTests(unittest.TestCase):
    def test_extracts_quantity_price_total_line(self):
        items = _parse_line_items("Widget A 2 x 15000 = 30000")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["description"], "Widget A")
        self.assertEqual(items[0]["quantity"], "2")
        self.assertEqual(items[0]["unit_price"], "15000")
        self.assertEqual(items[0]["total"], "30000")
        self.assertEqual(items[0]["confidence"], "line_pattern")

    def test_falls_back_to_trailing_amount_guess(self):
        items = _parse_line_items("Delivery fee 50000")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["description"], "Delivery fee")
        self.assertEqual(items[0]["total"], "50000")
        self.assertIsNone(items[0]["quantity"])
        self.assertEqual(items[0]["confidence"], "amount_guess")

    def test_ignores_short_or_blank_lines(self):
        items = _parse_line_items("\n\nHi\n \n")
        self.assertEqual(items, [])

    def test_ignores_lines_with_no_trailing_number(self):
        items = _parse_line_items("Thank you for your purchase")
        self.assertEqual(items, [])

    def test_handles_multiple_lines_independently(self):
        raw = "Widget A 2 x 15000 = 30000\nShipping 5000\nNote without numbers"
        items = _parse_line_items(raw)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["confidence"], "line_pattern")
        self.assertEqual(items[1]["confidence"], "amount_guess")


if __name__ == "__main__":
    unittest.main()
