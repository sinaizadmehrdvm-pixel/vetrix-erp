from __future__ import annotations

import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, VetrixSession
from app.models.customer import Customer
from app.models.organization import Branch, LegalEntity, Tenant, UserOrganizationMembership
from app.models.user import User
from app.organization.runtime import (
    OrganizationRuntimeError,
    clear_authenticated_user,
    set_authenticated_user,
)


class OrganizationRuntimeIsolationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(
            class_=VetrixSession,
            bind=self.engine,
            expire_on_commit=False,
        )

        bootstrap = self.Session()
        bootstrap.add_all(
            [
                Tenant(id=1, code="TENANT-A", name="Tenant A"),
                Tenant(id=2, code="TENANT-B", name="Tenant B"),
                LegalEntity(id=1, tenant_id=1, code="A", name="Entity A"),
                LegalEntity(id=2, tenant_id=2, code="B", name="Entity B"),
                Branch(id=1, tenant_id=1, legal_entity_id=1, code="HQ-A", name="HQ A"),
                Branch(id=2, tenant_id=2, legal_entity_id=2, code="HQ-B", name="HQ B"),
                User(id=1, full_name="User A", username="a", password="hash", role="admin"),
                User(id=2, full_name="User B", username="b", password="hash", role="admin"),
                UserOrganizationMembership(
                    id=1,
                    user_id=1,
                    tenant_id=1,
                    legal_entity_id=1,
                    branch_id=1,
                    organization_role="admin",
                    is_default=True,
                    is_active=True,
                ),
                UserOrganizationMembership(
                    id=2,
                    user_id=2,
                    tenant_id=2,
                    legal_entity_id=2,
                    branch_id=2,
                    organization_role="admin",
                    is_default=True,
                    is_active=True,
                ),
            ]
        )
        bootstrap.commit()
        bootstrap.close()

    def tearDown(self) -> None:
        clear_authenticated_user()
        self.engine.dispose()

    def test_reads_are_automatically_isolated_for_every_application_session(self) -> None:
        set_authenticated_user(1)
        db_a = self.Session()
        customer_a = Customer(name="Customer A", tenant_id=2, legal_entity_id=2, branch_id=2)
        db_a.add(customer_a)
        db_a.commit()
        self.assertEqual(
            (customer_a.tenant_id, customer_a.legal_entity_id, customer_a.branch_id),
            (1, 1, 1),
        )
        db_a.close()

        set_authenticated_user(2)
        db_b = self.Session()
        customer_b = Customer(name="Customer B")
        db_b.add(customer_b)
        db_b.commit()
        self.assertEqual([item.name for item in db_b.query(Customer).all()], ["Customer B"])
        db_b.close()

        set_authenticated_user(1)
        db_a = self.Session()
        self.assertEqual([item.name for item in db_a.query(Customer).all()], ["Customer A"])
        self.assertIsNone(db_a.get(Customer, customer_b.id))
        db_a.close()

    def test_cross_tenant_update_and_delete_are_blocked(self) -> None:
        set_authenticated_user(2)
        foreign_db = self.Session()
        foreign = Customer(name="Foreign")
        foreign_db.add(foreign)
        foreign_db.commit()
        foreign_id = foreign.id
        foreign_db.close()

        set_authenticated_user(1)
        db = self.Session()
        leaked = db.execute(
            select(Customer)
            .where(Customer.id == foreign_id)
            .execution_options(skip_organization_scope=True)
        ).scalar_one()
        leaked.name = "Tampered"
        with self.assertRaises(OrganizationRuntimeError):
            db.flush()
        db.rollback()
        db.close()

    def test_scoped_operation_without_authenticated_context_fails_closed(self) -> None:
        clear_authenticated_user()
        db = self.Session()
        with self.assertRaises(OrganizationRuntimeError):
            db.query(Customer).all()
        db.close()


if __name__ == "__main__":
    unittest.main()
