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


if __name__ == "__main__":
    unittest.main()
