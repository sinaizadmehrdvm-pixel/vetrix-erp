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


def create_access_token(user_id: int, username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    lifetime_hours = max(1, int(os.getenv("VETRIX_TOKEN_HOURS", "12")))
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
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


PUBLIC_PATHS = {
    "/",
    "/health",
    "/login",
    "/setup/status",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/favicon.ico",
    "/api/inbound-voice/telegram",
    "/api/inbound-voice/whatsapp",
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
