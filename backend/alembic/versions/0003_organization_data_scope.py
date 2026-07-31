"""Backfill organization ownership onto existing operational records.

Revision ID: 0003_organization_data_scope
Revises: 0002_organization_foundation
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_organization_data_scope"
down_revision: Union[str, None] = "0002_organization_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_TENANT_ID = 1
DEFAULT_ENTITY_ID = 1
DEFAULT_BRANCH_ID = 1
SCOPED_TABLES = (
    "customers",
    "products",
    "invoices",
    "invoice_items",
    "accounting_entries",
    "expenses",
    "stock_movements",
)
SCOPE_COLUMNS = (
    ("tenant_id", "tenants", DEFAULT_TENANT_ID),
    ("legal_entity_id", "legal_entities", DEFAULT_ENTITY_ID),
    ("branch_id", "branches", DEFAULT_BRANCH_ID),
)


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _foreign_key_columns(table_name: str) -> set[tuple[str, ...]]:
    return {
        tuple(foreign_key.get("constrained_columns") or ())
        for foreign_key in sa.inspect(op.get_bind()).get_foreign_keys(table_name)
    }


def _add_missing_scope_columns(table_name: str) -> None:
    existing = _column_names(table_name)
    missing = [item for item in SCOPE_COLUMNS if item[0] not in existing]
    if not missing:
        return

    with op.batch_alter_table(table_name, recreate="auto") as batch_op:
        for column_name, _, default_id in missing:
            batch_op.add_column(
                sa.Column(
                    column_name,
                    sa.Integer(),
                    nullable=False,
                    server_default=str(default_id),
                )
            )


def _backfill_scope(table_name: str) -> None:
    connection = op.get_bind()
    if table_name == "invoice_items":
        connection.execute(
            sa.text(
                "UPDATE invoice_items SET "
                "tenant_id = COALESCE((SELECT tenant_id FROM invoices WHERE invoices.id = invoice_items.invoice_id), :tenant_id), "
                "legal_entity_id = COALESCE((SELECT legal_entity_id FROM invoices WHERE invoices.id = invoice_items.invoice_id), :entity_id), "
                "branch_id = COALESCE((SELECT branch_id FROM invoices WHERE invoices.id = invoice_items.invoice_id), :branch_id) "
                "WHERE tenant_id IS NULL OR legal_entity_id IS NULL OR branch_id IS NULL"
            ),
            {
                "tenant_id": DEFAULT_TENANT_ID,
                "entity_id": DEFAULT_ENTITY_ID,
                "branch_id": DEFAULT_BRANCH_ID,
            },
        )
    else:
        connection.execute(
            sa.text(
                f"UPDATE {table_name} SET "
                "tenant_id = COALESCE(tenant_id, :tenant_id), "
                "legal_entity_id = COALESCE(legal_entity_id, :entity_id), "
                "branch_id = COALESCE(branch_id, :branch_id) "
                "WHERE tenant_id IS NULL OR legal_entity_id IS NULL OR branch_id IS NULL"
            ),
            {
                "tenant_id": DEFAULT_TENANT_ID,
                "entity_id": DEFAULT_ENTITY_ID,
                "branch_id": DEFAULT_BRANCH_ID,
            },
        )


def _add_scope_constraints_and_indexes(table_name: str) -> None:
    foreign_key_columns = _foreign_key_columns(table_name)
    with op.batch_alter_table(table_name, recreate="auto") as batch_op:
        if ("tenant_id",) not in foreign_key_columns:
            batch_op.create_foreign_key(
                f"fk_{table_name}_tenant_id_tenants",
                "tenants",
                ["tenant_id"],
                ["id"],
                ondelete="RESTRICT",
            )
        if ("legal_entity_id",) not in foreign_key_columns:
            batch_op.create_foreign_key(
                f"fk_{table_name}_legal_entity_id_legal_entities",
                "legal_entities",
                ["legal_entity_id"],
                ["id"],
                ondelete="RESTRICT",
            )
        if ("branch_id",) not in foreign_key_columns:
            batch_op.create_foreign_key(
                f"fk_{table_name}_branch_id_branches",
                "branches",
                ["branch_id"],
                ["id"],
                ondelete="RESTRICT",
            )

    indexes = _index_names(table_name)
    index_definitions = {
        f"ix_{table_name}_tenant_id": ["tenant_id"],
        f"ix_{table_name}_legal_entity_id": ["legal_entity_id"],
        f"ix_{table_name}_branch_id": ["branch_id"],
        f"ix_{table_name}_org_scope": ["tenant_id", "legal_entity_id", "branch_id"],
    }
    for index_name, columns in index_definitions.items():
        if index_name not in indexes:
            op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    tables = _table_names()
    for table_name in SCOPED_TABLES:
        if table_name not in tables:
            continue
        _add_missing_scope_columns(table_name)
        _backfill_scope(table_name)
        _add_scope_constraints_and_indexes(table_name)


def downgrade() -> None:
    tables = _table_names()
    for table_name in reversed(SCOPED_TABLES):
        if table_name not in tables:
            continue
        indexes = _index_names(table_name)
        for index_name in (
            f"ix_{table_name}_org_scope",
            f"ix_{table_name}_branch_id",
            f"ix_{table_name}_legal_entity_id",
            f"ix_{table_name}_tenant_id",
        ):
            if index_name in indexes:
                op.drop_index(index_name, table_name=table_name)
        columns = _column_names(table_name)
        with op.batch_alter_table(table_name, recreate="auto") as batch_op:
            for column_name, _, _ in reversed(SCOPE_COLUMNS):
                if column_name in columns:
                    batch_op.drop_column(column_name)
