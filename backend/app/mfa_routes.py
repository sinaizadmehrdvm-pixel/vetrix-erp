import base64
import io

import qrcode
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import verify_password
from app.database import SessionLocal
from app.mfa import (
    consume_recovery_code,
    generate_recovery_codes,
    generate_totp_secret,
    hash_recovery_codes,
    provisioning_uri,
    verify_totp_code,
)
from app.models.user import User

router = APIRouter(prefix="/api/auth/totp", tags=["Two-Factor Authentication"])


class TotpVerifyRequest(BaseModel):
    code: str


class TotpDisableRequest(BaseModel):
    password: str
    code: str = ""


def _authenticated_user(request: Request, db: Session) -> User:
    try:
        user_id = int(request.state.auth["sub"])
    except (AttributeError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


@router.get("/status")
def totp_status(request: Request):
    db: Session = SessionLocal()
    try:
        user = _authenticated_user(request, db)
        return {"enabled": bool(user.totp_enabled)}
    finally:
        db.close()


@router.post("/setup")
def totp_setup(request: Request):
    db: Session = SessionLocal()
    try:
        user = _authenticated_user(request, db)
        if user.totp_enabled:
            raise HTTPException(status_code=400, detail="Two-factor authentication is already enabled")

        secret = generate_totp_secret()
        user.totp_secret = secret
        db.commit()

        uri = provisioning_uri(secret, user.username)
        qr_image = qrcode.make(uri)
        buffer = io.BytesIO()
        qr_image.save(buffer, format="PNG")
        qr_data_uri = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

        return {
            "status": "pending_verification",
            "secret": secret,
            "provisioning_uri": uri,
            "qr_code": qr_data_uri,
        }
    finally:
        db.close()


@router.post("/verify")
def totp_verify(data: TotpVerifyRequest, request: Request):
    db: Session = SessionLocal()
    try:
        user = _authenticated_user(request, db)
        if user.totp_enabled:
            raise HTTPException(status_code=400, detail="Two-factor authentication is already enabled")
        if not user.totp_secret:
            raise HTTPException(status_code=400, detail="Run setup before verifying a code")
        if not verify_totp_code(user.totp_secret, data.code):
            raise HTTPException(status_code=401, detail="Invalid authenticator code")

        recovery_codes = generate_recovery_codes()
        user.totp_recovery_codes = hash_recovery_codes(recovery_codes)
        user.totp_enabled = True
        db.commit()

        return {
            "status": "enabled",
            "recovery_codes": recovery_codes,
        }
    finally:
        db.close()


@router.post("/disable")
def totp_disable(data: TotpDisableRequest, request: Request):
    db: Session = SessionLocal()
    try:
        user = _authenticated_user(request, db)
        if not user.totp_enabled:
            raise HTTPException(status_code=400, detail="Two-factor authentication is not enabled")
        if not verify_password(data.password, user.password):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

        code_ok = verify_totp_code(user.totp_secret, data.code)
        if not code_ok and consume_recovery_code(user.totp_recovery_codes, data.code):
            code_ok = True
        if not code_ok:
            raise HTTPException(status_code=401, detail="Invalid authenticator or recovery code")

        user.totp_secret = None
        user.totp_enabled = False
        user.totp_recovery_codes = None
        db.commit()

        return {"status": "disabled"}
    finally:
        db.close()
