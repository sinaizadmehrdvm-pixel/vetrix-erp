"""Add the non-breaking organization scope foundation.

Revision ID: 0002_organization_foundation
Revises: 0001_schema_baseline
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_organization_foundation"
down_revision: Union[str, None] = "0001_schema_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_TENANT_ID = 1
DEFAULT_ENTITY_ID = 1
DEFAULT_BRANCH_ID = 1


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    return {item["name"] for item in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _create_index_if_missing(name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if name not in _indexes(table_name):
        op.create_index(name, table_name, columns, unique=unique)


def upgrade() -> None:
    tables = _tables()
    if "tenants" not in tables:
        op.create_table(
            "tenants",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("code", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("default_locale", sa.String(length=16), nullable=False, server_default="fa-IR"),
            sa.Column("default_currency", sa.String(length=3), nullable=False, server_default="IRR"),
            sa.Column("is_system_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code", name="uq_tenants_code"),
        )
    _create_index_if_missing("ix_tenants_code", "tenants", ["code"], unique=True)

    tables = _tables()
    if "legal_entities" not in tables:
        op.create_table(
            "legal_entities",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=False),
            sa.Column("code", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("country_code", sa.String(length=2), nullable=False, server_default="IR"),
            sa.Column("base_currency", sa.String(length=3), nullable=False, server_default="IRR"),
            sa.Column("tax_identifier", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("tenant_id", "code", name="uq_legal_entities_tenant_code"),
        )
    _create_index_if_missing("ix_legal_entities_tenant_id", "legal_entities", ["tenant_id"])

    tables = _tables()
    if "branches" not in tables:
        op.create_table(
            "branches",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=False),
            sa.Column("legal_entity_id", sa.Integer(), nullable=False),
            sa.Column("code", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["legal_entity_id"], ["legal_entities.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("legal_entity_id", "code", name="uq_branches_entity_code"),
        )
    _create_index_if_missing("ix_branches_tenant_id", "branches", ["tenant_id"])
    _create_index_if_missing("ix_branches_legal_entity_id", "branches", ["legal_entity_id"])

    tables = _tables()
    if "user_organization_memberships" not in tables:
        op.create_table(
            "user_organization_memberships",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=False),
            sa.Column("legal_entity_id", sa.Integer(), nullable=False),
            sa.Column("branch_id", sa.Integer(), nullable=False),
            sa.Column("organization_role", sa.String(length=64), nullable=False, server_default="member"),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["legal_entity_id"], ["legal_entities.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id", "tenant_id", "legal_entity_id", "branch_id",
                name="uq_user_organization_membership_scope",
            ),
        )
    _create_index_if_missing("ix_memberships_user_id", "user_organization_memberships", ["user_id"])
    _create_index_if_missing("ix_memberships_tenant_id", "user_organization_memberships", ["tenant_id"])
    _create_index_if_missing("ix_memberships_legal_entity_id", "user_organization_memberships", ["legal_entity_id"])
    _create_index_if_missing("ix_memberships_branch_id", "user_organization_memberships", ["branch_id"])

    connection = op.get_bind()
    if connection.execute(sa.text("SELECT 1 FROM tenants WHERE id = :id"), {"id": DEFAULT_TENANT_ID}).first() is None:
        connection.execute(
            sa.text(
                "INSERT INTO tenants (id, code, name, status, default_locale, default_currency, is_system_default) "
                "VALUES (:id, 'VETRIX', 'Vetrix', 'active', 'fa-IR', 'IRR', :is_default)"
            ),
            {"id": DEFAULT_TENANT_ID, "is_default": True},
        )
    if connection.execute(sa.text("SELECT 1 FROM legal_entities WHERE id = :id"), {"id": DEFAULT_ENTITY_ID}).first() is None:
        connection.execute(
            sa.text(
                "INSERT INTO legal_entities (id, tenant_id, code, name, country_code, base_currency, status, is_default) "
                "VALUES (:id, :tenant_id, 'DEFAULT', 'Vetrix ERP', 'IR', 'IRR', 'active', :is_default)"
            ),
            {"id": DEFAULT_ENTITY_ID, "tenant_id": DEFAULT_TENANT_ID, "is_default": True},
        )
    if connection.execute(sa.text("SELECT 1 FROM branches WHERE id = :id"), {"id": DEFAULT_BRANCH_ID}).first() is None:
        connection.execute(
            sa.text(
                "INSERT INTO branches (id, tenant_id, legal_entity_id, code, name, status, is_default) "
                "VALUES (:id, :tenant_id, :entity_id, 'HQ', 'Head Office', 'active', :is_default)"
            ),
            {
                "id": DEFAULT_BRANCH_ID,
                "tenant_id": DEFAULT_TENANT_ID,
                "entity_id": DEFAULT_ENTITY_ID,
                "is_default": True,
            },
        )
    connection.execute(
        sa.text(
            "INSERT INTO user_organization_memberships "
            "(user_id, tenant_id, legal_entity_id, branch_id, organization_role, is_default, is_active) "
            "SELECT users.id, :tenant_id, :entity_id, :branch_id, users.role, :is_default, :is_active "
            "FROM users WHERE NOT EXISTS ("
            "SELECT 1 FROM user_organization_memberships memberships "
            "WHERE memberships.user_id = users.id AND memberships.tenant_id = :tenant_id "
            "AND memberships.legal_entity_id = :entity_id AND memberships.branch_id = :branch_id)"
        ),
        {
            "tenant_id": DEFAULT_TENANT_ID,
            "entity_id": DEFAULT_ENTITY_ID,
            "branch_id": DEFAULT_BRANCH_ID,
            "is_default": True,
            "is_active": True,
        },
    )


def downgrade() -> None:
    tables = _tables()
    if "user_organization_memberships" in tables:
        op.drop_table("user_organization_memberships")
    tables = _tables()
    if "branches" in tables:
        op.drop_table("branches")
    tables = _tables()
    if "legal_entities" in tables:
        op.drop_table("legal_entities")
    tables = _tables()
    if "tenants" in tables:
        op.drop_table("tenants")
