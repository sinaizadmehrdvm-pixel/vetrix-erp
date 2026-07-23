import os
import unittest

import jwt

from app.auth import (
    create_access_token,
    decode_access_token,
    extract_bearer_token,
    hash_password,
    is_public_request,
    password_needs_upgrade,
    verify_password,
)


class AuthenticationPolicyTests(unittest.TestCase):
    def test_only_documented_public_routes_bypass_authentication(self):
        self.assertTrue(is_public_request("/login", "POST"))
        self.assertTrue(is_public_request("/docs", "GET"))
        self.assertTrue(is_public_request("/customers", "OPTIONS"))
        self.assertTrue(
            is_public_request("/api/inbound-voice/telegram", "POST")
        )
        self.assertTrue(
            is_public_request("/api/inbound-voice/whatsapp", "GET")
        )
        self.assertFalse(
            is_public_request("/api/inbound-voice/telegram/debug", "GET")
        )
        self.assertTrue(
            is_public_request("/api/storefront-sync/products", "GET")
        )
        self.assertFalse(
            is_public_request("/api/storefront-sync/readiness", "GET")
        )
        self.assertTrue(
            is_public_request("/api/campaign-delivery/claim", "POST")
        )
        self.assertTrue(
            is_public_request("/api/campaign-delivery/complete", "POST")
        )
        self.assertFalse(
            is_public_request("/api/campaign-delivery/readiness", "GET")
        )
        self.assertFalse(
            is_public_request("/api/campaign-delivery/queue/1", "POST")
        )
        self.assertFalse(is_public_request("/customers", "GET"))
        self.assertFalse(is_public_request("/export/invoices-pdf", "GET"))

    def test_bearer_token_parser_is_strict(self):
        self.assertEqual(extract_bearer_token("Bearer signed-token"), "signed-token")
        self.assertEqual(extract_bearer_token("bearer signed-token"), "signed-token")
        self.assertIsNone(extract_bearer_token(None))
        self.assertIsNone(extract_bearer_token("Basic abc"))
        self.assertIsNone(extract_bearer_token("Bearer "))


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
        self.assertEqual(payload["gen"], 0)

    def test_token_generation_claim_defaults_and_round_trips(self):
        token = create_access_token(7, "admin", "admin", token_generation=3)
        payload = decode_access_token(token)
        self.assertEqual(payload["gen"], 3)

    def test_tampered_token_is_rejected(self):
        token = create_access_token(7, "admin", "admin")
        header, payload, signature = token.split(".")
        changed_signature = (
            ("a" if signature[0] != "a" else "b") + signature[1:]
        )
        tampered = ".".join([header, payload, changed_signature])

        with self.assertRaises(jwt.PyJWTError):
            decode_access_token(tampered)


if __name__ == "__main__":
    unittest.main()
