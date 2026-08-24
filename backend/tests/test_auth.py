import os
import unittest

import jwt

import app.auth as auth_module
from app.auth import (
    create_access_token,
    create_backup_download_token,
    decode_access_token,
    decode_backup_download_token,
    extract_bearer_token,
    hash_password,
    is_public_request,
    password_needs_upgrade,
    verify_password,
)


class AuthenticationPolicyTests(unittest.TestCase):
    def test_only_documented_public_routes_bypass_authentication(self):
        self.assertTrue(is_public_request("/login", "POST"))
        self.assertTrue(is_public_request("/register", "POST"))
        self.assertTrue(is_public_request("/forgot-password", "POST"))
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


class JwtSecretFailClosedTests(unittest.TestCase):
    """Task 07 Section 4/D: VETRIX_JWT_SECRET must never silently fall back
    to a known/default value in a production-capable deployment."""

    def setUp(self):
        self.previous_secret = os.environ.get("VETRIX_JWT_SECRET")
        self.previous_env = os.environ.get("VETRIX_ENV")
        self.previous_cache = auth_module._dev_jwt_secret_cache
        auth_module._dev_jwt_secret_cache = None

    def tearDown(self):
        if self.previous_secret is None:
            os.environ.pop("VETRIX_JWT_SECRET", None)
        else:
            os.environ["VETRIX_JWT_SECRET"] = self.previous_secret
        if self.previous_env is None:
            os.environ.pop("VETRIX_ENV", None)
        else:
            os.environ["VETRIX_ENV"] = self.previous_env
        auth_module._dev_jwt_secret_cache = self.previous_cache

    def test_production_without_secret_fails_closed(self):
        os.environ["VETRIX_ENV"] = "production"
        os.environ.pop("VETRIX_JWT_SECRET", None)
        with self.assertRaises(RuntimeError):
            auth_module._jwt_secret()

    def test_production_with_env_example_placeholder_fails_closed(self):
        # The literal string .env.example ships with, committed to every
        # checkout - must never be trusted just because it's non-empty.
        os.environ["VETRIX_ENV"] = "production"
        os.environ["VETRIX_JWT_SECRET"] = "replace-with-at-least-32-random-characters"
        with self.assertRaises(RuntimeError):
            auth_module._jwt_secret()

    def test_production_with_short_secret_fails_closed(self):
        os.environ["VETRIX_ENV"] = "production"
        os.environ["VETRIX_JWT_SECRET"] = "too-short"
        with self.assertRaises(RuntimeError):
            auth_module._jwt_secret()

    def test_production_with_real_secret_succeeds(self):
        os.environ["VETRIX_ENV"] = "production"
        os.environ["VETRIX_JWT_SECRET"] = "a-real-random-secret-that-is-definitely-long-enough-1234"
        self.assertEqual(auth_module._jwt_secret(), os.environ["VETRIX_JWT_SECRET"])

    def test_development_without_secret_uses_a_generated_secret_not_a_known_string(self):
        os.environ["VETRIX_ENV"] = "development"
        os.environ.pop("VETRIX_JWT_SECRET", None)
        secret = auth_module._jwt_secret()
        self.assertNotIn(secret, auth_module._KNOWN_INSECURE_JWT_SECRETS)
        self.assertGreaterEqual(len(secret), 32)

    def test_development_fallback_is_stable_within_the_process(self):
        os.environ["VETRIX_ENV"] = "development"
        os.environ.pop("VETRIX_JWT_SECRET", None)
        first = auth_module._jwt_secret()
        second = auth_module._jwt_secret()
        self.assertEqual(first, second)


class BackupDownloadTokenTests(unittest.TestCase):
    def setUp(self):
        self.previous_secret = os.environ.get("VETRIX_JWT_SECRET")
        os.environ["VETRIX_JWT_SECRET"] = "test-secret-that-is-not-used-in-production"

    def tearDown(self):
        if self.previous_secret is None:
            os.environ.pop("VETRIX_JWT_SECRET", None)
        else:
            os.environ["VETRIX_JWT_SECRET"] = self.previous_secret

    def test_lifetime_is_within_the_safe_15_to_60_minute_band(self):
        # Task 07 Section 4/G: 48h was excessive for a link that can fetch
        # the whole shared database file.
        self.assertGreaterEqual(auth_module.BACKUP_DOWNLOAD_MINUTES, 15)
        self.assertLessEqual(auth_module.BACKUP_DOWNLOAD_MINUTES, 60)
        token = create_backup_download_token("vetrix_manual_20260101T000000_000000Z.db")
        claims = decode_backup_download_token(token)
        self.assertEqual(claims["exp"] - claims["iat"], auth_module.BACKUP_DOWNLOAD_MINUTES * 60)

    def test_each_token_gets_a_distinct_jti(self):
        # The jti is what lets app/backup/delivery.py enforce one-time use.
        token_a = create_backup_download_token("vetrix_manual_20260101T000000_000000Z.db")
        token_b = create_backup_download_token("vetrix_manual_20260101T000000_000000Z.db")
        self.assertIn("jti", decode_backup_download_token(token_a))
        self.assertNotEqual(
            decode_backup_download_token(token_a)["jti"],
            decode_backup_download_token(token_b)["jti"],
        )


if __name__ == "__main__":
    unittest.main()
