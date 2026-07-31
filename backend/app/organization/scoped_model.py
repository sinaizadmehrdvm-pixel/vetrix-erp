from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.orm import declared_attr


class OrganizationScopedMixin:
    """Organization ownership columns shared by operational records.

    Server-side request/repository code must assign these values from a
    validated UserOrganizationMembership. The temporary database defaults
    preserve compatibility for the single-organization installation while
    existing write paths are moved behind scoped repositories.
    """

    @declared_attr
    def tenant_id(cls):
        return Column(
            Integer,
            ForeignKey("tenants.id", ondelete="RESTRICT"),
            nullable=False,
            default=1,
            server_default="1",
            index=True,
        )

    @declared_attr
    def legal_entity_id(cls):
        return Column(
            Integer,
            ForeignKey("legal_entities.id", ondelete="RESTRICT"),
            nullable=False,
            default=1,
            server_default="1",
            index=True,
        )

    @declared_attr
    def branch_id(cls):
        return Column(
            Integer,
            ForeignKey("branches.id", ondelete="RESTRICT"),
            nullable=False,
            default=1,
            server_default="1",
            index=True,
        )
