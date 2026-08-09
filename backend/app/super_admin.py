"""Milestone 4: the super-admin concept. A super-admin is a boolean flag
on User (see app/models/user.py), deliberately independent of `role`
(role stays feature/RBAC-only - see app/rbac.py). This is the single
place that checks it, so app/companies.py and app/users_routes.py don't
each grow their own copy the way they already independently duplicate
_require_admin/require_admin today.
"""
from fastapi import HTTPException


def is_super_admin(auth: dict | None) -> bool:
    return bool((auth or {}).get("is_super_admin"))


def require_super_admin(request):
    if not is_super_admin(getattr(request.state, "auth", None)):
        raise HTTPException(status_code=403, detail="Super-administrator access required")
