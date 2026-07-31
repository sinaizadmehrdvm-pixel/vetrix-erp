from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.customer import Customer
from app.models.organization import Branch, LegalEntity, Tenant
from app.organization.repository import OrganizationScopedRepository
from app.organization.scope import OrganizationScope, OrganizationScopeError


class OrganizationScopedRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add_all(
            [
                Tenant(id=1, code="TENANT-A", name="Tenant A"),
                Tenant(id=2, code="TENANT-B", name="Tenant B"),
                LegalEntity(id=1, tenant_id=1, code="A", name="Entity A"),
                LegalEntity(id=2, tenant_id=2, code="B", name="Entity B"),
                Branch(id=1, tenant_id=1, legal_entity_id=1, code="HQ-A", name="HQ A"),
                Branch(id=2, tenant_id=2, legal_entity_id=2, code="HQ-B", name="HQ B"),
            ]
        )
        self.db.commit()
        self.scope_a = OrganizationScope(1, 1, 1, 101)
        self.scope_b = OrganizationScope(2, 2, 2, 202)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_query_never_returns_another_tenants_record(self) -> None:
        repo_a = OrganizationScopedRepository(self.db, Customer, self.scope_a)
        repo_b = OrganizationScopedRepository(self.db, Customer, self.scope_b)
        repo_a.add(Customer(name="Customer A"))
        repo_b.add(Customer(name="Customer B"))
        self.db.commit()

        self.assertEqual([item.name for item in repo_a.query().all()], ["Customer A"])
        self.assertEqual([item.name for item in repo_b.query().all()], ["Customer B"])
        self.assertIsNone(repo_a.get(repo_b.query().one().id))

    def test_add_overrides_untrusted_payload_scope(self) -> None:
        repository = OrganizationScopedRepository(self.db, Customer, self.scope_a)
        record = Customer(name="Payload Customer", tenant_id=2, legal_entity_id=2, branch_id=2)
        repository.add(record)
        self.db.flush()
        self.assertEqual((record.tenant_id, record.legal_entity_id, record.branch_id), (1, 1, 1))

    def test_assert_in_scope_rejects_cross_tenant_record(self) -> None:
        repository = OrganizationScopedRepository(self.db, Customer, self.scope_a)
        foreign_record = Customer(name="Foreign", tenant_id=2, legal_entity_id=2, branch_id=2)
        with self.assertRaises(OrganizationScopeError):
            repository.assert_in_scope(foreign_record)


if __name__ == "__main__":
    unittest.main()
