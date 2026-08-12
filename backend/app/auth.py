import base64
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 600_000
TOKEN_ALGORITHM = "HS256"
TOKEN_ISSUER = "vetrix-erp"
TOKEN_AUDIENCE = "vetrix-erp-client"

_logger = logging.getLogger(__name__)

# Values that must never be trusted as a real secret even though they are
# non-empty: the old hardcoded fallback (kept here only so it's recognized
# and rejected, not reused) and the .env.example placeholder that ships in
# every checkout - both are effectively public knowledge, so a deployment
# that copies .env.example without editing this line is not "configured".
_KNOWN_INSECURE_JWT_SECRETS = {
    "vetrix-development-secret-change-before-production",
    "replace-with-at-least-32-random-characters",
}
_MIN_JWT_SECRET_LENGTH = 32
# Local-only, gitignored file used solely to persist the auto-generated dev
# secret across restarts (see _dev_jwt_secret below) - never committed, never
# logged, never sent to a client.
_DEV_JWT_SECRET_FILE = Path(__file__).resolve().parent.parent / ".vetrix_dev_secret"
_dev_jwt_secret_cache: str | None = None


def _is_properly_configured_secret(secret: str) -> bool:
    return (
        bool(secret)
        and secret.strip().lower() not in _KNOWN_INSECURE_JWT_SECRETS
        and len(secret) >= _MIN_JWT_SECRET_LENGTH
    )


def _dev_jwt_secret() -> str:
    """The explicit, clearly-isolated dev/test fallback (Task 07 Section 4/D):
    a real random secret, generated once and persisted locally, never a known
    string. Only ever called from _jwt_secret() below when VETRIX_ENV is not
    "production" - production always fails closed instead."""
    global _dev_jwt_secret_cache
    if _dev_jwt_secret_cache:
        return _dev_jwt_secret_cache

    try:
        if _DEV_JWT_SECRET_FILE.exists():
            existing = _DEV_JWT_SECRET_FILE.read_text(encoding="utf-8").strip()
            if _is_properly_configured_secret(existing):
                _dev_jwt_secret_cache = existing
                return existing
    except OSError:
        pass

    generated = secrets.token_urlsafe(48)
    try:
        _DEV_JWT_SECRET_FILE.write_text(generated, encoding="utf-8")
    except OSError:
        pass  # Read-only filesystem: still random, just won't survive a restart.

    _logger.warning(
        "VETRIX_JWT_SECRET is not set to a real secret (missing, the .env.example "
        "placeholder, or under %d characters). Generated a local development-only "
        "secret at %s. Set a real VETRIX_JWT_SECRET before any shared or "
        "production deployment.",
        _MIN_JWT_SECRET_LENGTH, _DEV_JWT_SECRET_FILE,
    )
    _dev_jwt_secret_cache = generated
    return generated


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

    if _is_properly_configured_secret(secret):
        return secret
    if environment == "production":
        # Fail closed and loud - never silently sign tokens with a known,
        # empty, or too-short secret in a production-capable deployment.
        raise RuntimeError(
            "VETRIX_JWT_SECRET is required in production and must be a real "
            f"secret of at least {_MIN_JWT_SECRET_LENGTH} characters "
            "(not empty and not the .env.example placeholder)"
        )
    return _dev_jwt_secret()


def create_access_token(
    user_id: int, username: str, role: str, token_generation: int = 0, company_id: int | None = None,
    is_super_admin: bool = False,
) -> str:
    now = datetime.now(timezone.utc)
    lifetime_hours = max(1, int(os.getenv("VETRIX_TOKEN_HOURS", "12")))
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "gen": int(token_generation or 0),
        # Multi-company milestone 1: the active company is baked into the
        # token so every request can know it without a DB lookup, exactly
        # like role/username already work. No query is scoped by this yet
        # (see app/models/company.py) - it only rides along for now.
        "company_id": company_id,
        # Milestone 4: super-admin status, refreshed from the DB on every
        # request (main.py's auth middleware) exactly like role/username -
        # this claim is only the value baked in at mint time.
        "is_super_admin": bool(is_super_admin),
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


BACKUP_DOWNLOAD_AUDIENCE = "vetrix-erp-backup-download"
# 48h was excessive for a link that can fetch the whole shared database file
# (Task 07 Section 4/G) - default to 30 minutes, configurable within a safe
# 15-60 minute band so a slow-to-open email/Telegram client still has a
# realistic window without leaving a long-lived bearer credential around.
BACKUP_DOWNLOAD_MINUTES = min(60, max(15, int(os.getenv("VETRIX_BACKUP_DOWNLOAD_MINUTES", "30"))))


def create_backup_download_token(filename: str) -> str:
    """Short-lived, audience-scoped, single-use link (Task 04 Section 19;
    tightened in Task 07 Section 4/G) so a backup recipient without an
    interactive login can retrieve the file during an emergency - same shape
    as create_catalog_token above, deliberately not revoke-by-generation
    (deleting the backup file itself already invalidates any token
    referencing it). The `jti` lets app/backup/delivery.py's secure_download
    endpoint enforce one-time use even though the token itself stays valid
    (stateless JWTs can't be revoked) until it expires."""
    now = datetime.now(timezone.utc)
    payload = {
        "filename": filename,
        "jti": secrets.token_urlsafe(16),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=BACKUP_DOWNLOAD_MINUTES),
        "iss": TOKEN_ISSUER,
        "aud": BACKUP_DOWNLOAD_AUDIENCE,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=TOKEN_ALGORITHM)


def decode_backup_download_token(token: str) -> dict:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=[TOKEN_ALGORITHM],
        issuer=TOKEN_ISSUER,
        audience=BACKUP_DOWNLOAD_AUDIENCE,
        options={"require": ["exp", "iat", "filename", "jti", "iss", "aud"]},
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
    "/api/backup-delivery/trigger-due",
    "/api/backup-delivery/secure-download",
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
    "/api/invoices/verify",
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
