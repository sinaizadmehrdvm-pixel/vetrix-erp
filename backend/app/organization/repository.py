from __future__ import annotations

from typing import Generic, TypeVar

from sqlalchemy.orm import Query, Session

from app.organization.scope import OrganizationScope, OrganizationScopeError

ModelT = TypeVar("ModelT")


class OrganizationScopedRepository(Generic[ModelT]):
    """Server-side repository guard for organization-owned ORM models."""

    def __init__(self, db: Session, model: type[ModelT], scope: OrganizationScope):
        self.db = db
        self.model = model
        self.scope = scope
        self._assert_scoped_model()

    def _assert_scoped_model(self) -> None:
        missing = [
            field
            for field in ("tenant_id", "legal_entity_id", "branch_id")
            if not hasattr(self.model, field)
        ]
        if missing:
            raise TypeError(f"{self.model.__name__} is not organization scoped: {', '.join(missing)}")

    def query(self) -> Query:
        return self.db.query(self.model).filter(
            self.model.tenant_id == self.scope.tenant_id,
            self.model.legal_entity_id == self.scope.legal_entity_id,
            self.model.branch_id == self.scope.branch_id,
        )

    def get(self, record_id: int) -> ModelT | None:
        return self.query().filter(self.model.id == record_id).first()

    def assign_scope(self, record: ModelT) -> ModelT:
        record.tenant_id = self.scope.tenant_id
        record.legal_entity_id = self.scope.legal_entity_id
        record.branch_id = self.scope.branch_id
        return record

    def assert_in_scope(self, record: ModelT) -> None:
        actual = (
            getattr(record, "tenant_id", None),
            getattr(record, "legal_entity_id", None),
            getattr(record, "branch_id", None),
        )
        expected = (
            self.scope.tenant_id,
            self.scope.legal_entity_id,
            self.scope.branch_id,
        )
        if actual != expected:
            raise OrganizationScopeError("record does not belong to the active organization scope")

    def add(self, record: ModelT) -> ModelT:
        self.assign_scope(record)
        self.db.add(record)
        return record
