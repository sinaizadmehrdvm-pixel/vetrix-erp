"""Establish Alembic ownership of the current VETRIX schema.

Revision ID: 0001_schema_baseline
Revises: None

This revision is deliberately non-destructive. The legacy application schema
must already be present; empty databases are prepared by scripts/migrate.py.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "0001_schema_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

REQUIRED_TABLES = {
    "users",
    "customers",
    "products",
    "invoices",
    "invoice_items",
    "accounting_entries",
    "app_settings",
    "expenses",
    "stock_movements",
}


def upgrade() -> None:
    connection = op.get_bind()
    existing = set(inspect(connection).get_table_names())
    missing = sorted(REQUIRED_TABLES - existing)
    if missing:
        raise RuntimeError(
            "VETRIX baseline cannot be applied to an incomplete schema. "
            "Run `python scripts/migrate.py upgrade` so an empty database is "
            f"safely bootstrapped first. Missing tables: {', '.join(missing)}"
        )


def downgrade() -> None:
    # A baseline downgrade only releases Alembic ownership. Business tables and
    # user data are intentionally preserved.
    pass
