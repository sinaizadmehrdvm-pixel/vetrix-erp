import tempfile
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models.product import Product
from app.warehouses import (
    Warehouse,
    apply_warehouse_delta,
    invoice_warehouse_delta,
    stock_breakdown,
)


class InvoiceWarehouseDeltaTests(unittest.TestCase):
    def test_buy_and_return_sale_are_incoming(self):
        self.assertEqual(invoice_warehouse_delta("buy", 5), 5)
        self.assertEqual(invoice_warehouse_delta("return_sale", 5), 5)

    def test_sale_and_return_buy_are_outgoing(self):
        self.assertEqual(invoice_warehouse_delta("sale", 5), -5)
        self.assertEqual(invoice_warehouse_delta("return_buy", 5), -5)

    def test_proforma_has_no_stock_effect(self):
        self.assertEqual(invoice_warehouse_delta("proforma", 5), 0.0)


class StockBreakdownTests(unittest.TestCase):
    """Isolated engine/tables, matching test_pricing.py's convention, so
    this suite doesn't depend on test collection order across files."""

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.engine = create_engine(
            f"sqlite:///{cls.temp.name}/warehouses.db",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.db = Session(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        cls.engine.dispose()
        cls.temp.cleanup()

    def _make_product(self, stock=100):
        product = Product(name="Warehouse Test Product", sell_price=1000, stock=stock)
        self.db.add(product)
        self.db.commit()
        self.db.refresh(product)
        return product

    def test_all_stock_starts_in_default_warehouse(self):
        product = self._make_product(stock=50)
        breakdown = stock_breakdown(self.db, product.id)
        default = self.db.query(Warehouse).filter(Warehouse.is_default.is_(True)).one()
        self.assertEqual(breakdown, {default.id: 50.0})

    def test_default_warehouse_derives_from_aggregate_minus_others(self):
        product = self._make_product(stock=100)
        default = self.db.query(Warehouse).filter(Warehouse.is_default.is_(True)).one()
        branch = Warehouse(name="Branch A", is_default=False, active=True)
        self.db.add(branch)
        self.db.commit()
        self.db.refresh(branch)

        apply_warehouse_delta(self.db, branch.id, product.id, 30)
        self.db.commit()

        breakdown = stock_breakdown(self.db, product.id)
        self.assertEqual(breakdown[branch.id], 30.0)
        self.assertEqual(breakdown[default.id], 70.0)

    def test_moving_quantity_between_buckets_never_touches_aggregate(self):
        product = self._make_product(stock=40)
        default = self.db.query(Warehouse).filter(Warehouse.is_default.is_(True)).one()
        branch = Warehouse(name="Branch B", is_default=False, active=True)
        self.db.add(branch)
        self.db.commit()
        self.db.refresh(branch)

        apply_warehouse_delta(self.db, default.id, product.id, -15)  # no-op: default is derived
        apply_warehouse_delta(self.db, branch.id, product.id, 15)
        self.db.commit()

        breakdown = stock_breakdown(self.db, product.id)
        self.assertEqual(breakdown[branch.id], 15.0)
        self.assertEqual(breakdown[default.id], 25.0)

        self.db.refresh(product)
        self.assertEqual(product.stock, 40)  # aggregate never moves for a transfer


if __name__ == "__main__":
    unittest.main()
