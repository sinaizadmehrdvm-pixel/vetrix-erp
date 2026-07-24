import json
import secrets

import pyotp

from app.auth import hash_password, verify_password

TOTP_ISSUER = "Vetrix ERP"
RECOVERY_CODE_COUNT = 8


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=TOTP_ISSUER)


def verify_totp_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    code = str(code).strip()
    if not code.isdigit():
        return False
    # valid_window=1 tolerates one 30s step of clock drift on either side.
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def _format_recovery_code() -> str:
    raw = secrets.token_hex(5).upper()
    return f"{raw[:5]}-{raw[5:]}"


def generate_recovery_codes(count: int = RECOVERY_CODE_COUNT) -> list[str]:
    return [_format_recovery_code() for _ in range(count)]


def hash_recovery_codes(codes: list[str]) -> str:
    return json.dumps([hash_password(code) for code in codes])


def consume_recovery_code(stored_json: str | None, code: str) -> str | None:
    """Return the updated (still-JSON-encoded) recovery code list with the
    matching code removed, or None if the supplied code didn't match any."""
    if not stored_json or not code:
        return None
    try:
        hashed_codes = json.loads(stored_json)
    except (TypeError, ValueError):
        return None

    normalized = str(code).strip().upper()
    for index, hashed in enumerate(hashed_codes):
        if verify_password(normalized, hashed):
            remaining = hashed_codes[:index] + hashed_codes[index + 1:]
            return json.dumps(remaining)
    return None
