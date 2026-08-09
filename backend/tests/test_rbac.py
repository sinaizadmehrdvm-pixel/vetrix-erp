import os
import unittest

os.environ.setdefault("VETRIX_JWT_SECRET", "unit-test-secret-not-for-production")

from app.rbac import is_authorized


class RbacDefaultDenyTests(unittest.TestCase):
    def test_admin_can_read_and_write_anything(self):
        self.assertTrue(is_authorized("admin", "GET", "/anything/not-yet-classified"))
        self.assertTrue(is_authorized("admin", "POST", "/anything/not-yet-classified"))

    def test_unclassified_read_path_is_denied_by_default(self):
        self.assertFalse(is_authorized("viewer", "GET", "/api/some-brand-new-endpoint"))
        self.assertFalse(is_authorized("accountant", "GET", "/api/some-brand-new-endpoint"))
        self.assertFalse(is_authorized("sales", "GET", "/api/some-brand-new-endpoint"))

    def test_unclassified_mutation_path_is_denied_by_default(self):
        self.assertFalse(is_authorized("accountant", "POST", "/api/some-brand-new-endpoint"))

    def test_known_operational_reads_stay_open_to_every_role(self):
        for role in ("admin", "accountant", "sales", "warehouse", "viewer", "user"):
            for path in ("/customers", "/products", "/invoices", "/me", "/roles", "/reports/sales"):
                self.assertTrue(
                    is_authorized(role, "GET", path),
                    f"expected {role} to read {path}",
                )

    def test_sensitive_admin_reads_stay_restricted(self):
        for role in ("accountant", "sales", "warehouse", "viewer", "user"):
            self.assertFalse(is_authorized(role, "GET", "/users"))
            self.assertFalse(is_authorized(role, "GET", "/api/audit"))
            self.assertFalse(is_authorized(role, "GET", "/api/system/anything"))

    def test_super_admin_bypasses_role_gate_regardless_of_role(self):
        self.assertTrue(is_authorized("accountant", "GET", "/api/companies", is_super_admin=True))
        self.assertTrue(is_authorized("viewer", "POST", "/users", is_super_admin=True))
        self.assertTrue(is_authorized("viewer", "GET", "/api/some-brand-new-endpoint", is_super_admin=True))

    def test_non_super_admin_still_gated_by_role(self):
        self.assertFalse(is_authorized("accountant", "GET", "/api/companies", is_super_admin=False))
        self.assertFalse(is_authorized("viewer", "GET", "/api/companies"))

    def test_field_visits_open_to_sales_and_admin_roles_only(self):
        for role in ("admin", "accountant", "sales"):
            self.assertTrue(is_authorized(role, "GET", "/api/field-visits"))
            self.assertTrue(is_authorized(role, "POST", "/api/field-visits"))
        for role in ("warehouse", "viewer", "user"):
            self.assertFalse(is_authorized(role, "GET", "/api/field-visits"))
            self.assertFalse(is_authorized(role, "POST", "/api/field-visits"))


if __name__ == "__main__":
    unittest.main()
