from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organization import (
    Branch,
    LegalEntity,
    Tenant,
    UserOrganizationMembership,
)


@dataclass(frozen=True)
class OrganizationScope:
    tenant_id: int
    legal_entity_id: int
    branch_id: int
    membership_id: int


class OrganizationScopeError(RuntimeError):
    pass


def resolve_default_scope(db: Session, user_id: int) -> OrganizationScope:
    membership = db.execute(
        select(UserOrganizationMembership)
        .where(
            UserOrganizationMembership.user_id == user_id,
            UserOrganizationMembership.is_active.is_(True),
        )
        .order_by(
            UserOrganizationMembership.is_default.desc(),
            UserOrganizationMembership.id.asc(),
        )
    ).scalars().first()
    if membership is None:
        raise OrganizationScopeError("User has no active organization membership")

    return OrganizationScope(
        tenant_id=membership.tenant_id,
        legal_entity_id=membership.legal_entity_id,
        branch_id=membership.branch_id,
        membership_id=membership.id,
    )


def validate_scope(db: Session, user_id: int, scope: OrganizationScope) -> None:
    membership = db.execute(
        select(UserOrganizationMembership.id).where(
            UserOrganizationMembership.id == scope.membership_id,
            UserOrganizationMembership.user_id == user_id,
            UserOrganizationMembership.tenant_id == scope.tenant_id,
            UserOrganizationMembership.legal_entity_id == scope.legal_entity_id,
            UserOrganizationMembership.branch_id == scope.branch_id,
            UserOrganizationMembership.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if membership is None:
        raise OrganizationScopeError("Requested organization scope is not authorized")


def ensure_scope_hierarchy(db: Session, scope: OrganizationScope) -> None:
    tenant = db.get(Tenant, scope.tenant_id)
    entity = db.get(LegalEntity, scope.legal_entity_id)
    branch = db.get(Branch, scope.branch_id)
    if tenant is None or entity is None or branch is None:
        raise OrganizationScopeError("Organization scope references a missing record")
    if entity.tenant_id != tenant.id:
        raise OrganizationScopeError("Legal entity does not belong to tenant")
    if branch.tenant_id != tenant.id or branch.legal_entity_id != entity.id:
        raise OrganizationScopeError("Branch does not belong to legal entity and tenant")
