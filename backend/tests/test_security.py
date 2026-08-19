import tempfile
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine

from app import security
from app.security import (
    BLOCK_SECONDS,
    MAX_LOGIN_FAILURES,
    account_attempt_key,
    login_attempt_key,
    login_retry_after,
    record_login_result,
    reset_login_throttle,
)


class LoginThrottleTests(unittest.TestCase):
    def setUp(self):
        # Isolated engine so this suite never shares (or races on) the
        # database other test modules point the shared engine at.
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{self.temp.name}/login_throttle.db",
            connect_args={"check_same_thread": False},
        )
        security.LoginThrottle.__table__.create(bind=self.engine, checkfirst=True)
        self.engine_patch = patch.object(security, "engine", self.engine)
        self.engine_patch.start()
        reset_login_throttle()

    def tearDown(self):
        reset_login_throttle()
        self.engine_patch.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def test_key_normalizes_username_and_separates_clients(self):
        self.assertEqual(
            login_attempt_key("10.0.0.1", " Admin "),
            login_attempt_key("10.0.0.1", "admin"),
        )
        self.assertNotEqual(
            login_attempt_key("10.0.0.1", "admin"),
            login_attempt_key("10.0.0.2", "admin"),
        )

    def test_repeated_failures_are_temporarily_blocked(self):
        key = login_attempt_key("10.0.0.1", "admin")
        for index in range(MAX_LOGIN_FAILURES):
            record_login_result(key, False, now=100 + index)
        retry_after = login_retry_after(key, now=105)
        self.assertGreater(retry_after, 0)
        self.assertLessEqual(retry_after, BLOCK_SECONDS)

    def test_success_clears_failures_and_block(self):
        key = login_attempt_key("10.0.0.1", "admin")
        for index in range(MAX_LOGIN_FAILURES):
            record_login_result(key, False, now=100 + index)
        record_login_result(key, True, now=106)
        self.assertEqual(login_retry_after(key, now=107), 0)

    def test_old_failures_expire(self):
        key = login_attempt_key("10.0.0.1", "admin")
        record_login_result(key, False, now=1)
        self.assertEqual(login_retry_after(key, now=1000), 0)

    def test_account_key_is_independent_of_ip(self):
        self.assertEqual(account_attempt_key(" Admin "), account_attempt_key("admin"))
        self.assertNotEqual(account_attempt_key("admin"), login_attempt_key("10.0.0.1", "admin"))

    def test_account_level_backstop_blocks_across_rotating_ips(self):
        # SECURITY PHASE C: an attacker rotating source IPs must not get an
        # unlimited combined guess budget just because each new ip:username
        # key starts fresh - the account-only key accumulates regardless of
        # which IP each attempt came from.
        acct_key = account_attempt_key("admin")
        for index in range(MAX_LOGIN_FAILURES):
            ip_key = login_attempt_key(f"10.0.0.{index}", "admin")
            # Each individual per-IP key is still fresh/unblocked...
            self.assertEqual(login_retry_after(ip_key, now=100 + index), 0)
            record_login_result(ip_key, False, now=100 + index)
            record_login_result(acct_key, False, now=100 + index)

        # ...but the shared account-level key is now blocked.
        retry_after = login_retry_after(acct_key, now=105)
        self.assertGreater(retry_after, 0)
        self.assertLessEqual(retry_after, BLOCK_SECONDS)

        # A brand-new IP's own per-IP key is still individually fresh (this
        # is expected - the account-level check is what actually stops the
        # login in users_routes.login regardless), but the account key it's
        # ANDed with in production code is what enforces the real backstop.
        self.assertEqual(login_retry_after(login_attempt_key("10.0.0.999", "admin"), now=105), 0)

    def test_account_level_success_clears_the_account_block(self):
        acct_key = account_attempt_key("admin")
        for index in range(MAX_LOGIN_FAILURES):
            record_login_result(acct_key, False, now=100 + index)
        self.assertGreater(login_retry_after(acct_key, now=105), 0)
        record_login_result(acct_key, True, now=106)
        self.assertEqual(login_retry_after(acct_key, now=107), 0)


if __name__ == "__main__":
    unittest.main()
