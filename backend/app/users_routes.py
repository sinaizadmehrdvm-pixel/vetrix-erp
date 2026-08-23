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
from app.company_scope import current_company_id, get_company_brief
from app.database import SessionLocal
from app.mfa import consume_recovery_code, verify_totp_code
from app.models.company import Company
from app.models.user import User
from app.rbac import ROLE_LABELS, normalize_role, is_valid_role_code
from app.security import account_attempt_key, login_attempt_key, login_retry_after, record_login_result
from app.super_admin import is_super_admin, require_super_admin
from jwt import PyJWTError

router = APIRouter()

# Computed once at import so /login always pays the same PBKDF2 cost for a
# nonexistent username as for a real one with a wrong password - without
# this, "user is None" short-circuits before verify_password ever runs,
# giving an attacker a reliable timing oracle to enumerate valid usernames.
_DUMMY_PASSWORD_HASH = hash_password("not-a-real-password-used-only-for-constant-time-login-checks")


class UserCreate(BaseModel):
    full_name: str
    username: str
    password: str
    role: str = "admin"
    # Milestone 4: only honored when the creator is a super-admin - see
    # create_user(). A regular admin's client-supplied values here are
    # silently ignored so they can never create a user outside their own
    # company or grant super-admin themselves.
    company_id: int | None = None
    is_super_admin: bool = False


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    avatar_data: str | None = None


class UserRoleUpdate(BaseModel):
    role: str


class UserCompanyMove(BaseModel):
    company_id: int


class UserSuperAdminUpdate(BaseModel):
    is_super_admin: bool


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
            "version": "1.4.0",
        }
    finally:
        db.close()


def require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") not in {"admin", "bootstrap"} and not is_super_admin(auth):
        raise HTTPException(status_code=403, detail="Administrator access required")


@router.post("/users")
def create_user(data: UserCreate, request: Request):
    require_admin(request)
    if len(data.password) < 12:
        raise HTTPException(status_code=400, detail="Password must contain at least 12 characters")
    raw_role = str(data.role).strip().lower()
    requested_role = "viewer" if raw_role == "user" else normalize_role(raw_role)
    if not is_valid_role_code(raw_role):
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of: {', '.join(role for role in ROLE_LABELS if role != 'user')}, "
                    "or an existing custom role code",
        )
    db: Session = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == data.username).first()
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        auth = getattr(request.state, "auth", {})
        caller_is_bootstrap = auth.get("role") == "bootstrap"
        caller_is_super_admin = is_super_admin(auth)

        if caller_is_bootstrap:
            # Unchanged bootstrap fallback logic (first-ever user, no
            # company_id claim to inherit yet) - and the very first user
            # auto-becomes the first super-admin, mirroring how they already
            # auto-become admin, so there's always someone who can create a
            # second company later.
            company_id = auth.get("company_id")
            if not company_id:
                fallback = db.query(Company).order_by(Company.id.asc()).first()
                company_id = fallback.id if fallback else None
            grant_super_admin = True
        elif caller_is_super_admin:
            # Super-admins may create a user directly in any active company.
            target_company_id = data.company_id or auth.get("company_id")
            company = get_company_brief(target_company_id)
            if not company:
                raise HTTPException(status_code=400, detail="Company not found")
            if not company["is_active"]:
                raise HTTPException(status_code=400, detail="Company is inactive")
            company_id = company["id"]
            grant_super_admin = bool(data.is_super_admin)
        else:
            # Regular (non-super-admin) admins stay locked to their own
            # company, exactly as before - any client-supplied company_id/
            # is_super_admin is ignored, closing the cross-company gap.
            company_id = auth.get("company_id")
            grant_super_admin = False

        user = User(
            full_name=data.full_name,
            username=data.username,
            password=hash_password(data.password),
            role=requested_role,
            company_id=company_id,
            is_super_admin=grant_super_admin,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {
            "status": "created",
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "company_id": user.company_id,
            "is_super_admin": user.is_super_admin,
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
        "company_id": getattr(user, "company_id", None),
        "is_super_admin": bool(getattr(user, "is_super_admin", False)),
        "avatar_data": getattr(user, "avatar_data", "") or "",
    }


@router.get("/users")
def list_users(request: Request, company_id: int | None = None):
    require_admin(request)
    auth = getattr(request.state, "auth", {})
    db: Session = SessionLocal()
    try:
        query = db.query(User)
        if not is_super_admin(auth):
            # Closes a confirmed gap: a regular admin used to see and manage
            # every company's users from here - now scoped to their own.
            query = query.filter(User.company_id == current_company_id(request))
        elif company_id is not None:
            query = query.filter(User.company_id == company_id)
        companies_by_id = {company.id: company.name for company in db.query(Company).all()}
        return [
            {**user_to_auth_dict(user), "company_name": companies_by_id.get(user.company_id)}
            for user in query.all()
        ]
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
                user.id, user.username, normalize_role(user.role), user.token_generation,
                company_id=user.company_id, is_super_admin=bool(user.is_super_admin),
            ),
            "token_type": "Bearer",
        }
    finally:
        db.close()


@router.put("/users/me")
def update_own_profile(data: ProfileUpdate, request: Request):
    # Self-service identity edit (display name + avatar picture) only -
    # deliberately separate from admin user-management CRUD and from
    # change_own_password above: this never touches role/username/password,
    # so it needs no re-authentication and never revokes the caller's token.
    try:
        user_id = int(request.state.auth["sub"])
    except (AttributeError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User no longer exists")
        if data.full_name is not None:
            if not data.full_name.strip():
                raise HTTPException(status_code=400, detail="Full name cannot be empty")
            user.full_name = data.full_name.strip()
        if data.avatar_data is not None:
            user.avatar_data = data.avatar_data
        db.commit()
        db.refresh(user)
        return {"status": "updated", "user": user_to_auth_dict(user)}
    finally:
        db.close()


@router.put("/users/{user_id}/password")
def admin_reset_user_password(user_id: int, data: UserPasswordReset, request: Request):
    require_admin(request)
    if len(data.password) < 12:
        raise HTTPException(status_code=400, detail="Password must contain at least 12 characters")

    auth = getattr(request.state, "auth", {})
    auth_user_id = auth.get("sub")
    db: Session = SessionLocal()
    try:
        query = db.query(User).filter(User.id == user_id)
        if not is_super_admin(auth):
            query = query.filter(User.company_id == current_company_id(request))
        user = query.first()
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
                user.id, user.username, normalize_role(user.role), user.token_generation,
                company_id=user.company_id, is_super_admin=bool(user.is_super_admin),
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
    if not is_valid_role_code(raw_role):
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of: {', '.join(role for role in ROLE_LABELS if role != 'user')}, "
                    "or an existing custom role code",
        )

    auth = getattr(request.state, "auth", {})
    auth_user_id = auth.get("sub")
    if str(user_id) == str(auth_user_id):
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    db: Session = SessionLocal()
    try:
        query = db.query(User).filter(User.id == user_id)
        if not is_super_admin(auth):
            query = query.filter(User.company_id == current_company_id(request))
        user = query.first()
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


@router.put("/users/{user_id}/company")
def move_user_company(user_id: int, data: UserCompanyMove, request: Request):
    require_super_admin(request)
    company = get_company_brief(data.company_id)
    if not company:
        raise HTTPException(status_code=400, detail="Company not found")
    if not company["is_active"]:
        raise HTTPException(status_code=400, detail="Company is inactive")

    auth_user_id = getattr(request.state, "auth", {}).get("sub")
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        self_move = str(auth_user_id) == str(user_id)
        user.company_id = data.company_id
        # The JWT's company_id claim is never refreshed from the DB per
        # request (unlike role/is_super_admin) - bump token_generation so
        # this user's existing token(s) stop working and their next login
        # mints one with the correct company_id.
        user.token_generation = (user.token_generation or 0) + 1
        db.commit()
        db.refresh(user)
        response = {
            "status": "moved",
            "user": {**user_to_auth_dict(user), "company_name": company["name"]},
        }
        if self_move:
            response["access_token"] = create_access_token(
                user.id, user.username, normalize_role(user.role), user.token_generation,
                company_id=user.company_id, is_super_admin=bool(user.is_super_admin),
            )
            response["token_type"] = "Bearer"
        return response
    finally:
        db.close()


@router.put("/users/{user_id}/super-admin")
def update_user_super_admin(user_id: int, data: UserSuperAdminUpdate, request: Request):
    require_super_admin(request)
    auth_user_id = getattr(request.state, "auth", {}).get("sub")
    if str(user_id) == str(auth_user_id):
        raise HTTPException(status_code=400, detail="You cannot change your own super-admin status")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_super_admin and not data.is_super_admin:
            remaining = db.query(User).filter(User.is_super_admin == True).count()  # noqa: E712
            if remaining <= 1:
                raise HTTPException(status_code=400, detail="The system must keep at least one super-administrator")
        user.is_super_admin = data.is_super_admin
        db.commit()
        db.refresh(user)
        return {"status": "updated", "user": user_to_auth_dict(user)}
    finally:
        db.close()


@router.post("/login")
def login(data: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    attempt_key = login_attempt_key(client_ip, data.username)
    acct_key = account_attempt_key(data.username)
    retry_after = login_retry_after(attempt_key) or login_retry_after(acct_key)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.username == data.username).first()
        password_ok = verify_password(data.password, user.password if user else _DUMMY_PASSWORD_HASH)
        if not user or not password_ok:
            record_login_result(attempt_key, False)
            record_login_result(acct_key, False)
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
        record_login_result(acct_key, True)
        token = create_access_token(
            user.id, user.username, normalize_role(user.role), user.token_generation,
            company_id=user.company_id, is_super_admin=bool(user.is_super_admin),
        )
        return {
            "status": "success",
            "message": "Login successful",
            "access_token": token,
            "token_type": "Bearer",
            "requires_password_change": bool(getattr(user, "must_change_password", False)),
            "user": user_to_auth_dict(user),
            "active_company": get_company_brief(user.company_id),
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
        acct_key = account_attempt_key(user.username)
        retry_after = login_retry_after(attempt_key) or login_retry_after(acct_key)
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
            record_login_result(acct_key, False)
            raise HTTPException(status_code=401, detail="Invalid authenticator or recovery code")

        record_login_result(attempt_key, True)
        record_login_result(acct_key, True)
        if updated_recovery_codes is not None:
            user.totp_recovery_codes = updated_recovery_codes
            db.commit()

        token = create_access_token(
            user.id, user.username, normalize_role(user.role), user.token_generation,
            company_id=user.company_id, is_super_admin=bool(user.is_super_admin),
        )
        return {
            "status": "success",
            "message": "Login successful",
            "access_token": token,
            "token_type": "Bearer",
            "requires_password_change": bool(getattr(user, "must_change_password", False)),
            "user": user_to_auth_dict(user),
            "active_company": get_company_brief(user.company_id),
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
        return {
            "status": "success",
            "user": user_to_auth_dict(user),
            "active_company": get_company_brief(current_company_id(request)),
        }
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
