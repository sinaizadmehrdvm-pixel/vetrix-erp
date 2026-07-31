from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass

from sqlalchemy import event, select
from sqlalchemy.orm import Session, with_loader_criteria

from app.models.organization import UserOrganizationMembership
from app.organization.scoped_model import OrganizationScopedMixin


@dataclass(frozen=True)
class RuntimeOrganizationScope:
    user_id: int
    membership_id: int
    tenant_id: int
    legal_entity_id: int
    branch_id: int


class OrganizationRuntimeError(RuntimeError):
    """Raised when a scoped database operation has no authorized scope."""


_authenticated_user_id: ContextVar[int | None] = ContextVar(
    "vetrix_authenticated_user_id", default=None
)
_explicit_scope: ContextVar[RuntimeOrganizationScope | None] = ContextVar(
    "vetrix_explicit_organization_scope", default=None
)


def set_authenticated_user(user_id: int | str | None) -> None:
    if user_id is None:
        _authenticated_user_id.set(None)
        _explicit_scope.set(None)
        return
    _authenticated_user_id.set(int(user_id))
    _explicit_scope.set(None)


def clear_authenticated_user() -> None:
    _authenticated_user_id.set(None)
    _explicit_scope.set(None)


def set_explicit_scope(scope: RuntimeOrganizationScope) -> None:
    current_user_id = _authenticated_user_id.get()
    if current_user_id is None or current_user_id != scope.user_id:
        raise OrganizationRuntimeError("Organization scope does not belong to the authenticated user")
    _explicit_scope.set(scope)


def current_authenticated_user_id() -> int | None:
    return _authenticated_user_id.get()


def _resolve_scope(session: Session) -> RuntimeOrganizationScope:
    cached = session.info.get("organization_scope")
    if isinstance(cached, RuntimeOrganizationScope):
        return cached

    explicit = _explicit_scope.get()
    user_id = current_authenticated_user_id()
    if user_id is None:
        raise OrganizationRuntimeError("Authenticated organization context is required")

    statement = (
        select(UserOrganizationMembership)
        .where(
            UserOrganizationMembership.user_id == user_id,
            UserOrganizationMembership.is_active.is_(True),
        )
        .order_by(
            UserOrganizationMembership.is_default.desc(),
            UserOrganizationMembership.id.asc(),
        )
        .execution_options(skip_organization_scope=True)
    )
    memberships = list(session.execute(statement).scalars())

    if explicit is not None:
        membership = next(
            (
                item
                for item in memberships
                if item.id == explicit.membership_id
                and item.tenant_id == explicit.tenant_id
                and item.legal_entity_id == explicit.legal_entity_id
                and item.branch_id == explicit.branch_id
            ),
            None,
        )
    else:
        membership = memberships[0] if memberships else None

    if membership is None:
        raise OrganizationRuntimeError("User has no active authorized organization membership")

    scope = RuntimeOrganizationScope(
        user_id=user_id,
        membership_id=membership.id,
        tenant_id=membership.tenant_id,
        legal_entity_id=membership.legal_entity_id,
        branch_id=membership.branch_id,
    )
    session.info["organization_scope"] = scope
    return scope


def get_runtime_scope(session: Session) -> RuntimeOrganizationScope:
    return _resolve_scope(session)


def install_organization_session_guards(session_class: type[Session]) -> None:
    if getattr(session_class, "_vetrix_organization_guards", False):
        return
    session_class._vetrix_organization_guards = True

    @event.listens_for(session_class, "do_orm_execute")
    def _scope_orm_reads(execute_state):
        if execute_state.execution_options.get("skip_organization_scope"):
            return
        if not execute_state.is_select:
            return

        scope = _resolve_scope(execute_state.session)
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                OrganizationScopedMixin,
                lambda model: (
                    (model.tenant_id == scope.tenant_id)
                    & (model.legal_entity_id == scope.legal_entity_id)
                    & (model.branch_id == scope.branch_id)
                ),
                include_aliases=True,
                track_closure_variables=False,
            )
        )

    @event.listens_for(session_class, "before_flush")
    def _scope_orm_writes(session: Session, flush_context, instances):
        scoped_new = [item for item in session.new if isinstance(item, OrganizationScopedMixin)]
        scoped_dirty = [item for item in session.dirty if isinstance(item, OrganizationScopedMixin)]
        scoped_deleted = [item for item in session.deleted if isinstance(item, OrganizationScopedMixin)]
        if not scoped_new and not scoped_dirty and not scoped_deleted:
            return

        scope = _resolve_scope(session)
        expected = (scope.tenant_id, scope.legal_entity_id, scope.branch_id)

        for item in scoped_new:
            item.tenant_id = scope.tenant_id
            item.legal_entity_id = scope.legal_entity_id
            item.branch_id = scope.branch_id

        for item in (*scoped_dirty, *scoped_deleted):
            actual = (item.tenant_id, item.legal_entity_id, item.branch_id)
            if actual != expected:
                raise OrganizationRuntimeError(
                    "Cross-organization update or delete was blocked"
                )
