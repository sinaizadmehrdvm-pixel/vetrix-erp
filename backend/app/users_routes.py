from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    create_mfa_challenge_token,
    decode_mfa_challenge_token,
    hash_password,
    password_needs_upgrade,
    verify_password,
)
from app.database import SessionLocal
from app.mfa import consume_recovery_code, verify_totp_code
from app.models.user import User
from app.rbac import ROLE_LABELS, normalize_role
from app.security import login_attempt_key, login_retry_after, record_login_result
from jwt import PyJWTError

router = APIRouter()


class UserCreate(BaseModel):
    full_name: str
    username: str
    password: str
    role: str = "admin"


class UserRoleUpdate(BaseModel):
    role: str


class UserPasswordReset(BaseModel):
    password: str
    force_change_on_next_login: bool = True


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class MfaLoginRequest(BaseModel):
    mfa_token: str
    code: str


@router.get("/setup/status")
def setup_status():
    db: Session = SessionLocal()
    try:
        user_count = db.query(User).count()
        return {
            "initialized": user_count > 0,
            "requires_admin": user_count == 0,
            "user_count": user_count,
            "version": "1.3.0",
        }
    finally:
        db.close()


def require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") not in {"admin", "bootstrap"}:
        raise HTTPException(status_code=403, detail="Administrator access required")


@router.post("/users")
def create_user(data: UserCreate, request: Request):
    require_admin(request)
    if len(data.password) < 12:
        raise HTTPException(status_code=400, detail="Password must contain at least 12 characters")
    raw_role = str(data.role).strip().lower()
    requested_role = "viewer" if raw_role == "user" else normalize_role(raw_role)
    if raw_role not in ROLE_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of: {', '.join(role for role in ROLE_LABELS if role != 'user')}",
        )
    db: Session = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == data.username).first()
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        user = User(
            full_name=data.full_name,
            username=data.username,
            password=hash_password(data.password),
            role=requested_role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {
            "status": "created",
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "must_change_password": bool(getattr(user, "must_change_password", False)),
        }
    finally:
        db.close()


def user_to_auth_dict(user: User):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "role": user.role,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
    }


@router.get("/users")
def list_users(request: Request):
    require_admin(request)
    db: Session = SessionLocal()
    try:
        return [user_to_auth_dict(user) for user in db.query(User).all()]
    finally:
        db.close()


@router.put("/users/me/password")
def change_own_password(data: PasswordChangeRequest, request: Request):
    if len(data.new_password) < 12:
        raise HTTPException(status_code=400, detail="Password must contain at least 12 characters")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current password")

    try:
        user_id = int(request.state.auth["sub"])
    except (AttributeError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User no longer exists")
        if not verify_password(data.current_password, user.password):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        user.password = hash_password(data.new_password)
        user.must_change_password = False
        user.token_generation = (user.token_generation or 0) + 1
        db.commit()
        db.refresh(user)
        return {
            "status": "updated",
            "user": user_to_auth_dict(user),
            "security_event": "user_password_changed",
            "access_token": create_access_token(
                user.id, user.username, normalize_role(user.role), user.token_generation
            ),
            "token_type": "Bearer",
        }
    finally:
        db.close()


@router.put("/users/{user_id}/password")
def admin_reset_user_password(user_id: int, data: UserPasswordReset, request: Request):
    require_admin(request)
    if len(data.password) < 12:
        raise HTTPException(status_code=400, detail="Password must contain at least 12 characters")

    auth_user_id = getattr(request.state, "auth", {}).get("sub")
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        self_reset = str(auth_user_id) == str(user_id)
        user.password = hash_password(data.password)
        user.must_change_password = bool(data.force_change_on_next_login)
        user.token_generation = (user.token_generation or 0) + 1
        db.commit()
        db.refresh(user)
        response = {
            "status": "updated",
            "user": user_to_auth_dict(user),
            "security_event": "admin_password_reset",
            "requires_next_login_change": user.must_change_password,
            "self_reset": self_reset,
        }
        if self_reset:
            # The admin just revoked their own current token; hand back a fresh
            # one so they aren't unexpectedly logged out by their own action.
            response["access_token"] = create_access_token(
                user.id, user.username, normalize_role(user.role), user.token_generation
            )
            response["token_type"] = "Bearer"
        return response
    finally:
        db.close()


@router.post("/logout")
def logout(request: Request):
    try:
        user_id = int(request.state.auth["sub"])
    except (AttributeError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.token_generation = (user.token_generation or 0) + 1
            db.commit()
        return {"status": "logged_out"}
    finally:
        db.close()


@router.put("/users/{user_id}/role")
def update_user_role(user_id: int, data: UserRoleUpdate, request: Request):
    require_admin(request)
    raw_role = str(data.role).strip().lower()
    requested_role = "viewer" if raw_role == "user" else normalize_role(raw_role)
    if raw_role not in ROLE_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of: {', '.join(role for role in ROLE_LABELS if role != 'user')}",
        )

    auth_user_id = getattr(request.state, "auth", {}).get("sub")
    if str(user_id) == str(auth_user_id):
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.role == "admin" and requested_role != "admin":
            admin_count = db.query(User).filter(User.role == "admin").count()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="The system must keep at least one administrator",
                )
        user.role = requested_role
        db.commit()
        db.refresh(user)
        return {"status": "updated", "user": user_to_auth_dict(user)}
    finally:
        db.close()


@router.post("/login")
def login(data: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    attempt_key = login_attempt_key(client_ip, data.username)
    retry_after = login_retry_after(attempt_key)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.username == data.username).first()
        if not user or not verify_password(data.password, user.password):
            record_login_result(attempt_key, False)
            raise HTTPException(status_code=401, detail="Invalid username or password")

        if password_needs_upgrade(user.password):
            user.password = hash_password(data.password)
            db.commit()

        if user.totp_enabled:
            # Password proven, but the login throttle only clears once the
            # second factor also succeeds (see /login/totp) - a correct
            # password alone must not grant a fresh set of TOTP guesses.
            return {
                "status": "mfa_required",
                "mfa_token": create_mfa_challenge_token(user.id),
            }

        record_login_result(attempt_key, True)
        token = create_access_token(
            user.id, user.username, normalize_role(user.role), user.token_generation
        )
        return {
            "status": "success",
            "message": "Login successful",
            "access_token": token,
            "token_type": "Bearer",
            "requires_password_change": bool(getattr(user, "must_change_password", False)),
            "user": user_to_auth_dict(user),
        }
    finally:
        db.close()


@router.post("/login/totp")
def login_totp(data: MfaLoginRequest, request: Request):
    try:
        challenge = decode_mfa_challenge_token(data.mfa_token)
        user_id = int(challenge["sub"])
    except (PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired two-factor challenge")

    client_ip = request.client.host if request.client else "unknown"
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.totp_enabled:
            raise HTTPException(status_code=401, detail="Invalid or expired two-factor challenge")

        attempt_key = login_attempt_key(client_ip, user.username)
        retry_after = login_retry_after(attempt_key)
        if retry_after:
            raise HTTPException(
                status_code=429,
                detail="Too many failed login attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        code_ok = verify_totp_code(user.totp_secret, data.code)
        updated_recovery_codes = None
        if not code_ok:
            updated_recovery_codes = consume_recovery_code(user.totp_recovery_codes, data.code)
            code_ok = updated_recovery_codes is not None

        if not code_ok:
            record_login_result(attempt_key, False)
            raise HTTPException(status_code=401, detail="Invalid authenticator or recovery code")

        record_login_result(attempt_key, True)
        if updated_recovery_codes is not None:
            user.totp_recovery_codes = updated_recovery_codes
            db.commit()

        token = create_access_token(
            user.id, user.username, normalize_role(user.role), user.token_generation
        )
        return {
            "status": "success",
            "message": "Login successful",
            "access_token": token,
            "token_type": "Bearer",
            "requires_password_change": bool(getattr(user, "must_change_password", False)),
            "user": user_to_auth_dict(user),
        }
    finally:
        db.close()


@router.get("/me")
def me(request: Request):
    try:
        user_id = int(request.state.auth["sub"])
    except (AttributeError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User no longer exists")
        return {"status": "success", "user": user_to_auth_dict(user)}
    finally:
        db.close()


@router.get("/roles")
def get_roles():
    return {
        "roles": [
            {"key": "admin", "title": "Admin", "permissions": ["all"]},
            {"key": "manager", "title": "Manager", "permissions": ["dashboard", "customers", "products", "invoices", "reports"]},
            {"key": "accountant", "title": "Accountant", "permissions": ["dashboard", "invoices", "expenses", "reports", "exports"]},
            {"key": "cashier", "title": "Cashier", "permissions": ["dashboard", "customers", "invoices"]},
        ]
    }
