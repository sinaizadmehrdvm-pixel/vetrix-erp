from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True)
    code = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    default_locale = Column(String(16), nullable=False, default="fa-IR")
    default_currency = Column(String(3), nullable=False, default="IRR")
    is_system_default = Column(Boolean, nullable=False, default=False)

    legal_entities = relationship("LegalEntity", back_populates="tenant")
    memberships = relationship("UserOrganizationMembership", back_populates="tenant")


class LegalEntity(Base):
    __tablename__ = "legal_entities"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_legal_entities_tenant_code"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    country_code = Column(String(2), nullable=False, default="IR")
    base_currency = Column(String(3), nullable=False, default="IRR")
    tax_identifier = Column(String(128), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    is_default = Column(Boolean, nullable=False, default=False)

    tenant = relationship("Tenant", back_populates="legal_entities")
    branches = relationship("Branch", back_populates="legal_entity")
    memberships = relationship("UserOrganizationMembership", back_populates="legal_entity")


class Branch(Base):
    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("legal_entity_id", "code", name="uq_branches_entity_code"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False, index=True)
    legal_entity_id = Column(
        Integer,
        ForeignKey("legal_entities.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    is_default = Column(Boolean, nullable=False, default=False)

    legal_entity = relationship("LegalEntity", back_populates="branches")
    memberships = relationship("UserOrganizationMembership", back_populates="branch")


class UserOrganizationMembership(Base):
    __tablename__ = "user_organization_memberships"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "tenant_id",
            "legal_entity_id",
            "branch_id",
            name="uq_user_organization_membership_scope",
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    legal_entity_id = Column(
        Integer,
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_role = Column(String(64), nullable=False, default="member")
    is_default = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)

    tenant = relationship("Tenant", back_populates="memberships")
    legal_entity = relationship("LegalEntity", back_populates="memberships")
    branch = relationship("Branch", back_populates="memberships")
