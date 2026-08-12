"""Task 06 fresh-database boot audit (Section 37/45): the app uses
per-module lazy `_ensure_schema(conn)` calls rather than a central
migration framework, and main.py's own startup only creates ORM-mapped
tables (Base.metadata.create_all) plus a couple of extras - it does NOT
create the ~30 raw-SQL tables each module manages itself. That makes
cross-module lazy-schema-ensure chains load-bearing, not defensive: if
module A queries module B's table without first calling B's own
_ensure_schema, a genuinely fresh company/database whose first request
happens to land on module A raises "no such table" instead of a clean
answer.

This suite uses its own isolated SQLAlchemy engine/database (never
shared with any other test file's), matching the established pattern in
test_cashflow_forecast.py/test_pricing.py - NOT the shared TestClient(app)
/ global `app.database.engine` singleton, because that singleton is bound
once, by whichever test file's module-level code happens to import
`main`/`app.database` first during pytest's collection phase (always
test_access_control.py, alphabetically first, whose own huge test
already touches every one of these tables long before any other file's
tests run) - a genuinely untouched database can only be reproduced with
a private engine. Each business-logic function under test reads its own
module's `engine`/`SessionLocal` at call time (not injected), so this
patches those specific names for the exact modules Task 06 touched
rather than trying to isolate the whole app.

Deliberately calls the underlying business-logic functions directly
(with a minimal shimmed Request, the same `_shim_request` pattern used
throughout this codebase - e.g. app.executive_alerts._shim_request) in
an order that would have surfaced every schema-bootstrap gap found and
fixed in Task 06, rather than going through the full HTTP/auth stack
(already covered by test_access_control.py).
"""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine

from app.database import Base


def _shim_request(company_id, user_id="1", role="admin"):
    return SimpleNamespace(state=SimpleNamespace(auth={
        "company_id": company_id, "sub": user_id, "role": role, "is_super_admin": True,
    }))


class FreshDatabaseBootTests(unittest.TestCase):
    """One shared isolated engine, ORM tables created via Base.metadata
    (mirroring main.py's own real startup step) - none of the raw-SQL
    tables owned by budgets.py/posting.py/periods.py/budget_plans.py/
    treasury.py/bi_improvement.py/online_commerce.py exist until each
    module's own _ensure_schema() creates them, exactly like a real
    brand-new company's database."""

    @classmethod
    def setUpClass(cls):
        # Importing `main` first (rather than just the handful of modules
        # this test calls directly) is deliberate: it's what actually
        # populates Base.metadata with every ORM model class the real app
        # startup would (Customer/Invoice/AccountingEntry/Product/...) -
        # SQLAlchemy only registers a model into Base.metadata when its
        # class body executes (i.e. its module gets imported), so creating
        # tables from Base.metadata before that import would silently
        # create only whatever happened to be imported so far.
        import main  # noqa: F401

        cls.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=cls.engine)

        import app.accounting.budgets as budgets
        import app.accounting.posting as posting
        import app.accounting.periods as periods
        import app.accounting.budget_plans as budget_plans
        import app.accounting.treasury as treasury
        import app.bi_improvement as bi_improvement
        import app.online_commerce as online_commerce
        import app.catalog as catalog

        cls._modules = [budgets, posting, periods, budget_plans, treasury, bi_improvement, online_commerce, catalog]
        cls._patches = [patch.object(m, "engine", cls.engine) for m in cls._modules]
        for p in cls._patches:
            p.start()

        from sqlalchemy.orm import sessionmaker
        cls._SessionLocal = sessionmaker(bind=cls.engine)
        cls._session_patches = [
            patch.object(bi_improvement, "SessionLocal", cls._SessionLocal),
            patch.object(budget_plans, "SessionLocal", cls._SessionLocal),
            patch.object(catalog, "SessionLocal", cls._SessionLocal),
        ]
        for p in cls._session_patches:
            p.start()

    @classmethod
    def tearDownClass(cls):
        for p in cls._session_patches:
            p.stop()
        for p in cls._patches:
            p.stop()
        cls.engine.dispose()

    def test_a_budgets_dimensions_is_the_first_accounting_action_ever(self):
        from app.accounting.budgets import list_dimensions
        result = list_dimensions(_shim_request(1))
        self.assertIn("cost_centers", result)

    def test_b_budgets_variance_before_chart_accounts_or_fiscal_periods_ever_touched(self):
        from fastapi import HTTPException
        from app.accounting.budgets import budget_variance
        # A 404 "period not found" is the correct, honest answer for a
        # fiscal_period_id that doesn't exist yet - the regression this
        # guards against is an unhandled 500 "no such table:
        # chart_accounts"/"no such table: fiscal_periods" instead.
        with self.assertRaises(HTTPException) as ctx:
            budget_variance(_shim_request(1), fiscal_period_id=1)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertNotIn("no such table", str(ctx.exception.detail))

    def test_c_bi_improvement_budget_variance_detector_before_budget_plans_ever_touched(self):
        # Calls the specific detector fixed in Task 06 directly, rather
        # than the full recalculate_findings() loop - the other six
        # detectors in _SIMPLE_DETECTORS each reuse a DIFFERENT module's
        # own global-engine-bound function (aging, ai_bi dashboard, smart
        # inventory, product_batches) unrelated to this fix, and isolating
        # all of those too would test far more than this specific gap.
        from app.bi_improvement import _detect_budget_variance
        result = _detect_budget_variance(1)
        self.assertEqual(result, [])

    def test_c2_bi_improvement_cashflow_pressure_detector_before_treasury_ever_touched(self):
        from app.bi_improvement import _detect_cashflow_pressure
        result = _detect_cashflow_pressure(1)
        self.assertIn("category", result)

    def test_d_public_catalog_view_before_online_commerce_ever_touched(self):
        # The public/unauthenticated catalog view path's _active_discounts
        # helper must degrade to "no discounts" rather than raising when
        # online_product_settings has never been created.
        from app.catalog import _active_discounts
        session = self._SessionLocal()
        try:
            result = _active_discounts(session, [1, 2, 3])
        finally:
            session.close()
        self.assertEqual(result, {})


if __name__ == "__main__":
    unittest.main()
