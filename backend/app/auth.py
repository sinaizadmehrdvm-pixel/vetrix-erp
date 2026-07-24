import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 600_000
TOKEN_ALGORITHM = "HS256"
TOKEN_ISSUER = "vetrix-erp"
TOKEN_AUDIENCE = "vetrix-erp-client"


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Password cannot be empty")

    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
        dklen=32,
    )
    return "$".join([
        PASSWORD_SCHEME,
        str(PASSWORD_ITERATIONS),
        _b64encode(salt),
        _b64encode(digest),
    ])


def verify_password(password: str, stored_password: str) -> bool:
    if not stored_password:
        return False

    if not stored_password.startswith(f"{PASSWORD_SCHEME}$"):
        # Compatibility for existing local databases. A successful login upgrades it.
        return hmac.compare_digest(password, stored_password)

    try:
        _, iterations_text, salt_text, digest_text = stored_password.split("$", 3)
        iterations = int(iterations_text)
        expected = _b64decode(digest_text)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            _b64decode(salt_text),
            iterations,
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def password_needs_upgrade(stored_password: str) -> bool:
    if not stored_password.startswith(f"{PASSWORD_SCHEME}$"):
        return True

    try:
        return int(stored_password.split("$", 3)[1]) < PASSWORD_ITERATIONS
    except (IndexError, ValueError):
        return True


def _jwt_secret() -> str:
    secret = os.getenv("VETRIX_JWT_SECRET", "").strip()
    environment = os.getenv("VETRIX_ENV", "development").strip().lower()

    if secret:
        return secret
    if environment == "production":
        raise RuntimeError("VETRIX_JWT_SECRET is required in production")
    return "vetrix-development-secret-change-before-production"


def create_access_token(user_id: int, username: str, role: str, token_generation: int = 0) -> str:
    now = datetime.now(timezone.utc)
    lifetime_hours = max(1, int(os.getenv("VETRIX_TOKEN_HOURS", "12")))
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "gen": int(token_generation or 0),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(hours=lifetime_hours),
        "iss": TOKEN_ISSUER,
        "aud": TOKEN_AUDIENCE,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=TOKEN_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=[TOKEN_ALGORITHM],
        issuer=TOKEN_ISSUER,
        audience=TOKEN_AUDIENCE,
        options={"require": ["exp", "iat", "sub", "iss", "aud"]},
    )


MFA_TOKEN_AUDIENCE = "vetrix-erp-mfa-challenge"
MFA_CHALLENGE_MINUTES = 5


def create_mfa_challenge_token(user_id: int) -> str:
    """Short-lived token proving a username/password check already passed,
    scoped to a distinct audience so it can never be used as a real access
    token even if it leaked."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "purpose": "mfa",
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=MFA_CHALLENGE_MINUTES),
        "iss": TOKEN_ISSUER,
        "aud": MFA_TOKEN_AUDIENCE,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=TOKEN_ALGORITHM)


def decode_mfa_challenge_token(token: str) -> dict:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=[TOKEN_ALGORITHM],
        issuer=TOKEN_ISSUER,
        audience=MFA_TOKEN_AUDIENCE,
        options={"require": ["exp", "iat", "sub", "iss", "aud"]},
    )


CUSTOMER_PORTAL_AUDIENCE = "vetrix-erp-customer-portal"
CUSTOMER_PORTAL_LINK_DAYS = 90


def create_customer_portal_token(customer_id: int, token_generation: int = 0) -> str:
    """Long-lived, narrowly-scoped link a staff member hands to a customer.

    A distinct audience keeps this from ever being accepted as a staff
    access token; the "gen" claim lets staff instantly invalidate every
    previously issued link by bumping the customer's stored generation,
    without needing a server-side revocation list.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "customer_id": customer_id,
        "gen": int(token_generation or 0),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(days=CUSTOMER_PORTAL_LINK_DAYS),
        "iss": TOKEN_ISSUER,
        "aud": CUSTOMER_PORTAL_AUDIENCE,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=TOKEN_ALGORITHM)


def decode_customer_portal_token(token: str) -> dict:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=[TOKEN_ALGORITHM],
        issuer=TOKEN_ISSUER,
        audience=CUSTOMER_PORTAL_AUDIENCE,
        options={"require": ["exp", "iat", "customer_id", "iss", "aud"]},
    )


SUPPLIER_PORTAL_AUDIENCE = "vetrix-erp-supplier-portal"
SUPPLIER_PORTAL_LINK_DAYS = 90


def create_supplier_portal_token(customer_id: int, token_generation: int = 0) -> str:
    """Same shape as the customer portal token but its own audience, so a
    party marked both customer and supplier can have either link revoked
    independently of the other."""
    now = datetime.now(timezone.utc)
    payload = {
        "customer_id": customer_id,
        "gen": int(token_generation or 0),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(days=SUPPLIER_PORTAL_LINK_DAYS),
        "iss": TOKEN_ISSUER,
        "aud": SUPPLIER_PORTAL_AUDIENCE,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=TOKEN_ALGORITHM)


def decode_supplier_portal_token(token: str) -> dict:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=[TOKEN_ALGORITHM],
        issuer=TOKEN_ISSUER,
        audience=SUPPLIER_PORTAL_AUDIENCE,
        options={"require": ["exp", "iat", "customer_id", "iss", "aud"]},
    )


CATALOG_AUDIENCE = "vetrix-erp-catalog"
CATALOG_LINK_DAYS = 60


def create_catalog_token(catalog_id: int, token_generation: int = 0) -> str:
    """Shareable link for a curated product catalog; same revoke-by-generation
    pattern as the customer portal token, scoped to its own audience."""
    now = datetime.now(timezone.utc)
    payload = {
        "catalog_id": catalog_id,
        "gen": int(token_generation or 0),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(days=CATALOG_LINK_DAYS),
        "iss": TOKEN_ISSUER,
        "aud": CATALOG_AUDIENCE,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=TOKEN_ALGORITHM)


def decode_catalog_token(token: str) -> dict:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=[TOKEN_ALGORITHM],
        issuer=TOKEN_ISSUER,
        audience=CATALOG_AUDIENCE,
        options={"require": ["exp", "iat", "catalog_id", "iss", "aud"]},
    )


PUBLIC_PATHS = {
    "/",
    "/health",
    "/login",
    "/login/totp",
    "/setup/status",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/favicon.ico",
    "/api/inbound-voice/telegram",
    "/api/inbound-voice/whatsapp",
    "/api/storefront-sync/products",
    "/api/campaign-delivery/claim",
    "/api/campaign-delivery/complete",
    "/api/campaign-delivery/fail",
    "/api/customer-portal/me",
    "/api/customer-portal/invoices",
    "/api/customer-portal/ledger",
    "/api/customer-portal/pay",
    "/api/supplier-portal/me",
    "/api/supplier-portal/invoices",
    "/api/supplier-portal/ledger",
    "/api/catalog/view",
    "/api/catalog/view/order",
    "/api/payments/session",
    "/api/payments/session/simulate",
    "/api/payments/callback",
}


def is_public_request(path: str, method: str) -> bool:
    return method.upper() == "OPTIONS" or path in PUBLIC_PATHS


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()
