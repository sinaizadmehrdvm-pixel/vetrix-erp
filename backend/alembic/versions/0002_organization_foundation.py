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


def upgrade() -> None:
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
    op.create_index("ix_tenants_code", "tenants", ["code"], unique=True)

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
    op.create_index("ix_legal_entities_tenant_id", "legal_entities", ["tenant_id"], unique=False)

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
    op.create_index("ix_branches_tenant_id", "branches", ["tenant_id"], unique=False)
    op.create_index("ix_branches_legal_entity_id", "branches", ["legal_entity_id"], unique=False)

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
            "user_id",
            "tenant_id",
            "legal_entity_id",
            "branch_id",
            name="uq_user_organization_membership_scope",
        ),
    )
    op.create_index("ix_memberships_user_id", "user_organization_memberships", ["user_id"], unique=False)
    op.create_index("ix_memberships_tenant_id", "user_organization_memberships", ["tenant_id"], unique=False)
    op.create_index("ix_memberships_legal_entity_id", "user_organization_memberships", ["legal_entity_id"], unique=False)
    op.create_index("ix_memberships_branch_id", "user_organization_memberships", ["branch_id"], unique=False)

    connection = op.get_bind()
    connection.execute(
        sa.text(
            "INSERT INTO tenants (id, code, name, status, default_locale, default_currency, is_system_default) "
            "VALUES (:id, :code, :name, 'active', 'fa-IR', 'IRR', :is_default)"
        ),
        {"id": DEFAULT_TENANT_ID, "code": "VETRIX", "name": "Vetrix", "is_default": True},
    )
    connection.execute(
        sa.text(
            "INSERT INTO legal_entities "
            "(id, tenant_id, code, name, country_code, base_currency, status, is_default) "
            "VALUES (:id, :tenant_id, :code, :name, 'IR', 'IRR', 'active', :is_default)"
        ),
        {
            "id": DEFAULT_ENTITY_ID,
            "tenant_id": DEFAULT_TENANT_ID,
            "code": "DEFAULT",
            "name": "Vetrix ERP",
            "is_default": True,
        },
    )
    connection.execute(
        sa.text(
            "INSERT INTO branches "
            "(id, tenant_id, legal_entity_id, code, name, status, is_default) "
            "VALUES (:id, :tenant_id, :entity_id, :code, :name, 'active', :is_default)"
        ),
        {
            "id": DEFAULT_BRANCH_ID,
            "tenant_id": DEFAULT_TENANT_ID,
            "entity_id": DEFAULT_ENTITY_ID,
            "code": "HQ",
            "name": "Head Office",
            "is_default": True,
        },
    )
    connection.execute(
        sa.text(
            "INSERT INTO user_organization_memberships "
            "(user_id, tenant_id, legal_entity_id, branch_id, organization_role, is_default, is_active) "
            "SELECT id, :tenant_id, :entity_id, :branch_id, role, :is_default, :is_active FROM users"
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
    op.drop_index("ix_memberships_branch_id", table_name="user_organization_memberships")
    op.drop_index("ix_memberships_legal_entity_id", table_name="user_organization_memberships")
    op.drop_index("ix_memberships_tenant_id", table_name="user_organization_memberships")
    op.drop_index("ix_memberships_user_id", table_name="user_organization_memberships")
    op.drop_table("user_organization_memberships")
    op.drop_index("ix_branches_legal_entity_id", table_name="branches")
    op.drop_index("ix_branches_tenant_id", table_name="branches")
    op.drop_table("branches")
    op.drop_index("ix_legal_entities_tenant_id", table_name="legal_entities")
    op.drop_table("legal_entities")
    op.drop_index("ix_tenants_code", table_name="tenants")
    op.drop_table("tenants")
