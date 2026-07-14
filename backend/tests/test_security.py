import unittest

from app.security import (
    BLOCK_SECONDS,
    MAX_LOGIN_FAILURES,
    login_attempt_key,
    login_retry_after,
    record_login_result,
    reset_login_throttle,
)


class LoginThrottleTests(unittest.TestCase):
    def setUp(self):
        reset_login_throttle()

    def tearDown(self):
        reset_login_throttle()

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


if __name__ == "__main__":
    unittest.main()
