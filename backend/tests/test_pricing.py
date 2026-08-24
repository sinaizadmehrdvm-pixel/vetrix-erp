import tempfile
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models.customer import Customer
from app.models.product import Product
from app.pricing import PriceTier, resolve_price


class PriceResolutionTests(unittest.TestCase):
    """Uses its own isolated engine/tables (rather than the shared
    app.database engine other test modules share) so this suite never
    depends on test collection/teardown order across files."""

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.engine = create_engine(
            f"sqlite:///{cls.temp.name}/pricing.db",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.db = Session(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        cls.engine.dispose()
        cls.temp.cleanup()

    def _make_product(self, sell_price=1000):
        product = Product(name="Pricing Test Product", sell_price=sell_price, price=sell_price, stock=1000)
        self.db.add(product)
        self.db.commit()
        self.db.refresh(product)
        return product

    def _make_customer(self, pricing_group="retail"):
        customer = Customer(name="Pricing Test Customer", pricing_group=pricing_group)
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)
        return customer

    def test_falls_back_to_base_price_with_no_tiers(self):
        product = self._make_product(sell_price=500)
        result = resolve_price(self.db, product.id, quantity=1)
        self.assertEqual(result["unit_price"], 500)
        self.assertFalse(result["tier_applied"])

    def test_applies_universal_quantity_tier(self):
        product = self._make_product(sell_price=1000)
        self.db.add(PriceTier(product_id=product.id, min_quantity=10, unit_price=800, customer_group=None))
        self.db.commit()

        below_threshold = resolve_price(self.db, product.id, quantity=5)
        self.assertEqual(below_threshold["unit_price"], 1000)
        self.assertFalse(below_threshold["tier_applied"])

        at_threshold = resolve_price(self.db, product.id, quantity=10)
        self.assertEqual(at_threshold["unit_price"], 800)
        self.assertTrue(at_threshold["tier_applied"])

    def test_picks_the_deepest_applicable_tier(self):
        product = self._make_product(sell_price=1000)
        self.db.add(PriceTier(product_id=product.id, min_quantity=10, unit_price=900, customer_group=None))
        self.db.add(PriceTier(product_id=product.id, min_quantity=50, unit_price=700, customer_group=None))
        self.db.commit()

        result = resolve_price(self.db, product.id, quantity=60)
        self.assertEqual(result["unit_price"], 700)

    def test_wholesale_tier_only_applies_to_wholesale_customers(self):
        product = self._make_product(sell_price=1000)
        wholesale_customer = self._make_customer(pricing_group="wholesale")
        retail_customer = self._make_customer(pricing_group="retail")
        self.db.add(PriceTier(product_id=product.id, min_quantity=1, unit_price=600, customer_group="wholesale"))
        self.db.commit()

        wholesale_result = resolve_price(self.db, product.id, quantity=1, customer_id=wholesale_customer.id)
        self.assertEqual(wholesale_result["unit_price"], 600)
        self.assertTrue(wholesale_result["tier_applied"])

        retail_result = resolve_price(self.db, product.id, quantity=1, customer_id=retail_customer.id)
        self.assertEqual(retail_result["unit_price"], 1000)
        self.assertFalse(retail_result["tier_applied"])

    def test_unknown_product_returns_none(self):
        self.assertIsNone(resolve_price(self.db, 999999, quantity=1))


if __name__ == "__main__":
    unittest.main()
