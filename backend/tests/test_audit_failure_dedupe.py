"""SECURITY PHASE D regression: once record_audit_event started auditing
401/403 responses regardless of HTTP method, an unauthenticated flood of
GETs with no/garbage tokens could otherwise write one DB row per request -
unbounded audit_events growth and SQLite write-lock contention (its default
journal mode serializes writers). _should_write_failure_event collapses
repeat failures from the same client into one write per short window."""
import unittest
from unittest.mock import patch

from app import audit


class FailureAuditDedupeTests(unittest.TestCase):
    def setUp(self):
        audit._recent_failure_writes.clear()

    def tearDown(self):
        audit._recent_failure_writes.clear()

    def test_first_failure_from_a_client_is_always_written(self):
        self.assertTrue(audit._should_write_failure_event("10.0.0.1", 401))

    def test_repeat_failure_within_the_window_is_suppressed(self):
        self.assertTrue(audit._should_write_failure_event("10.0.0.1", 401))
        self.assertFalse(audit._should_write_failure_event("10.0.0.1", 401))
        self.assertFalse(audit._should_write_failure_event("10.0.0.1", 401))

    def test_different_status_codes_are_tracked_independently(self):
        # A client hitting both an unauthenticated (401) and an
        # authenticated-but-unauthorized (403) endpoint in the same burst
        # must still get a row for each distinct failure type.
        self.assertTrue(audit._should_write_failure_event("10.0.0.1", 401))
        self.assertTrue(audit._should_write_failure_event("10.0.0.1", 403))

    def test_different_clients_are_tracked_independently(self):
        self.assertTrue(audit._should_write_failure_event("10.0.0.1", 401))
        self.assertTrue(audit._should_write_failure_event("10.0.0.2", 401))

    def test_a_missing_client_ip_does_not_collapse_all_unknown_clients_unsafely(self):
        # request.client can be None (e.g. certain test/proxy setups) -
        # confirm this degrades to a shared "unknown" bucket rather than
        # crashing, and that bucket still dedupes internally as expected.
        self.assertTrue(audit._should_write_failure_event("", 401))
        self.assertFalse(audit._should_write_failure_event("", 401))

    def test_write_is_allowed_again_after_the_window_elapses(self):
        with patch.object(audit.time, "monotonic", return_value=1000.0):
            self.assertTrue(audit._should_write_failure_event("10.0.0.1", 401))
            self.assertFalse(audit._should_write_failure_event("10.0.0.1", 401))
        with patch.object(audit.time, "monotonic", return_value=1000.0 + audit.FAILURE_AUDIT_DEDUPE_SECONDS + 1):
            self.assertTrue(audit._should_write_failure_event("10.0.0.1", 401))


if __name__ == "__main__":
    unittest.main()
