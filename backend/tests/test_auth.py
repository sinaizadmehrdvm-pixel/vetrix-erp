import os
import unittest

import jwt

from app.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    password_needs_upgrade,
    verify_password,
)


class PasswordSecurityTests(unittest.TestCase):
    def test_password_is_salted_and_verified(self):
        first = hash_password("StrongPassword!42")
        second = hash_password("StrongPassword!42")

        self.assertNotEqual(first, second)
        self.assertTrue(verify_password("StrongPassword!42", first))
        self.assertFalse(verify_password("wrong-password", first))
        self.assertFalse(password_needs_upgrade(first))

    def test_legacy_plaintext_password_can_be_upgraded(self):
        self.assertTrue(verify_password("legacy-pass", "legacy-pass"))
        self.assertFalse(verify_password("wrong", "legacy-pass"))
        self.assertTrue(password_needs_upgrade("legacy-pass"))


class TokenSecurityTests(unittest.TestCase):
    def setUp(self):
        self.previous_secret = os.environ.get("VETRIX_JWT_SECRET")
        os.environ["VETRIX_JWT_SECRET"] = "test-secret-that-is-not-used-in-production"

    def tearDown(self):
        if self.previous_secret is None:
            os.environ.pop("VETRIX_JWT_SECRET", None)
        else:
            os.environ["VETRIX_JWT_SECRET"] = self.previous_secret

    def test_signed_token_round_trip(self):
        token = create_access_token(7, "admin", "admin")
        payload = decode_access_token(token)

        self.assertEqual(payload["sub"], "7")
        self.assertEqual(payload["username"], "admin")
        self.assertEqual(payload["role"], "admin")

    def test_tampered_token_is_rejected(self):
        token = create_access_token(7, "admin", "admin")
        tampered = token[:-1] + ("a" if token[-1] != "a" else "b")

        with self.assertRaises(jwt.PyJWTError):
            decode_access_token(tampered)


if __name__ == "__main__":
    unittest.main()
