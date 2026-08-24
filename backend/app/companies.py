"""Multi-company milestone 1 (foundation) + milestone 4 (super-admin):
company management. Only a super-admin (see app/super_admin.py) can see,
create companies, or switch their own active company context - a regular
per-company admin cannot see other companies at all.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.auth import create_access_token
from app.company_scope import get_company_brief
from app.database import engine
from app.super_admin import require_super_admin

router = APIRouter(prefix="/api/companies", tags=["Companies"])


class CompanyCreate(BaseModel):
    name: str


class CompanyUpdate(BaseModel):
    name: str
    is_active: bool = True


class CompanySwitch(BaseModel):
    company_id: int


@router.get("")
def list_companies(request: Request):
    require_super_admin(request)
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT c.id, c.name, c.is_active, c.created_at,
                   (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count
            FROM companies c ORDER BY c.id ASC
        """)).mappings().all()
        return [dict(row) for row in rows]


@router.post("")
def create_company(data: CompanyCreate, request: Request):
    require_super_admin(request)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    with engine.begin() as conn:
        existing = conn.execute(text(
            "SELECT id FROM companies WHERE name = :name"
        ), {"name": name}).first()
        if existing:
            raise HTTPException(status_code=409, detail="A company with this name already exists")
        result = conn.execute(text("""
            INSERT INTO companies (name, is_active, created_at)
            VALUES (:name, 1, :now)
        """), {"name": name, "now": datetime.utcnow().isoformat()})
        return {"status": "created", "id": result.lastrowid, "name": name}


@router.put("/{company_id}")
def update_company(company_id: int, data: CompanyUpdate, request: Request):
    require_super_admin(request)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    with engine.begin() as conn:
        existing = conn.execute(text(
            "SELECT id FROM companies WHERE id = :id"
        ), {"id": company_id}).first()
        if not existing:
            raise HTTPException(status_code=404, detail="Company not found")
        duplicate = conn.execute(text(
            "SELECT id FROM companies WHERE name = :name AND id != :id"
        ), {"name": name, "id": company_id}).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="A company with this name already exists")
        conn.execute(text("""
            UPDATE companies SET name = :name, is_active = :is_active WHERE id = :id
        """), {"name": name, "is_active": data.is_active, "id": company_id})
        return {"status": "updated", "id": company_id, "name": name, "is_active": data.is_active}


@router.post("/switch")
def switch_company(data: CompanySwitch, request: Request):
    """Milestone 4: a super-admin re-mints their own JWT with a different
    company_id claim (same identity/role/token_generation) so they can act
    within any company's context. Routes through the exact same
    current_company_id(request) mechanism every other scoped query already
    uses - no parallel scoping logic. Deliberately does NOT bump
    token_generation: the previous context's token keeps working until it
    naturally expires, so switching back and forth (or two tabs, two
    contexts) stays cheap."""
    require_super_admin(request)
    company = get_company_brief(data.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not company["is_active"]:
        raise HTTPException(status_code=400, detail="Company is inactive")

    auth = getattr(request.state, "auth", {})
    token = create_access_token(
        int(auth["sub"]), auth["username"], auth["role"], int(auth.get("gen", 0)),
        company_id=company["id"], is_super_admin=True,
    )
    return {
        "status": "switched",
        "access_token": token,
        "token_type": "Bearer",
        "active_company": company,
    }
