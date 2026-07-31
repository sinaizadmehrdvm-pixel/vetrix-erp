from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models.organization import Branch, LegalEntity, Tenant, UserOrganizationMembership
from app.models.user import User
from app.organization.scope import (
    OrganizationScope,
    OrganizationScopeError,
    ensure_scope_hierarchy,
    resolve_default_scope,
    validate_scope,
)


class OrganizationScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            user = User(full_name="Scope User", username="scope-user", password="hash", role="admin")
            tenant = Tenant(id=10, code="TENANT-A", name="Tenant A", is_system_default=True)
            entity = LegalEntity(id=20, tenant_id=10, code="ENTITY-A", name="Entity A", is_default=True)
            branch = Branch(
                id=30,
                tenant_id=10,
                legal_entity_id=20,
                code="HQ",
                name="Head Office",
                is_default=True,
            )
            db.add_all([user, tenant, entity, branch])
            db.flush()
            db.add(
                UserOrganizationMembership(
                    id=40,
                    user_id=user.id,
                    tenant_id=10,
                    legal_entity_id=20,
                    branch_id=30,
                    organization_role="admin",
                    is_default=True,
                    is_active=True,
                )
            )
            db.commit()
            self.user_id = user.id

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_resolve_and_validate_default_scope(self) -> None:
        with Session(self.engine) as db:
            scope = resolve_default_scope(db, self.user_id)
            self.assertEqual(scope, OrganizationScope(10, 20, 30, 40))
            validate_scope(db, self.user_id, scope)
            ensure_scope_hierarchy(db, scope)

    def test_user_cannot_validate_another_membership(self) -> None:
        with Session(self.engine) as db:
            with self.assertRaises(OrganizationScopeError):
                validate_scope(db, self.user_id, OrganizationScope(10, 20, 30, 999))

    def test_inactive_membership_is_not_resolved(self) -> None:
        with Session(self.engine) as db:
            membership = db.get(UserOrganizationMembership, 40)
            membership.is_active = False
            db.commit()
            with self.assertRaises(OrganizationScopeError):
                resolve_default_scope(db, self.user_id)

    def test_invalid_hierarchy_is_rejected(self) -> None:
        with Session(self.engine) as db:
            branch = db.get(Branch, 30)
            branch.tenant_id = 999
            db.commit()
            with self.assertRaises(OrganizationScopeError):
                ensure_scope_hierarchy(db, OrganizationScope(10, 20, 30, 40))


if __name__ == "__main__":
    unittest.main()
