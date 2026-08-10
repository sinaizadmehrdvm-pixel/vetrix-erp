"""Branch management - the centralized entity Task 02 Section 6 asks for.

No Branch entity existed anywhere before this module: "branch" was only ever
UI copy for warehouse (Warehouses.jsx literally labeled itself "multi-branch
warehouses"). This module adds a real, standalone Branch table and links
Warehouse to it via a nullable warehouse.branch_id column (see
ensure_sqlite_column call in main.py) - a branch can own zero or more
warehouses, and a warehouse's own stock/model (app/warehouses.py) is
untouched by this change.

Branches are never hard-deleted (accounting/stock history may reference
them via their warehouses) - only deactivated, matching Warehouse's own
active flag convention.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import engine

router = APIRouter(prefix="/api/branches", tags=["Branches"])

BRANCH_TYPES = {"headquarters", "retail_store", "warehouse_only", "office", "other"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            code VARCHAR DEFAULT '',
            branch_type VARCHAR NOT NULL DEFAULT 'retail_store',
            active BOOLEAN NOT NULL DEFAULT 1,
            address VARCHAR DEFAULT '',
            province VARCHAR DEFAULT '',
            city VARCHAR DEFAULT '',
            district VARCHAR DEFAULT '',
            postal_code VARCHAR DEFAULT '',
            country VARCHAR DEFAULT '',
            phone VARCHAR DEFAULT '',
            mobile VARCHAR DEFAULT '',
            email VARCHAR DEFAULT '',
            website VARCHAR DEFAULT '',
            manager_name VARCHAR DEFAULT '',
            tax_id VARCHAR DEFAULT '',
            business_registration_number VARCHAR DEFAULT '',
            working_hours VARCHAR DEFAULT '',
            notes VARCHAR DEFAULT '',
            latitude FLOAT,
            longitude FLOAT,
            default_warehouse_id INTEGER,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(company_id, code)
        )
    """))
    ensure_company_id_column(conn, "branches")


class BranchUpsert(BaseModel):
    name: str
    code: str = ""
    branch_type: str = "retail_store"
    address: str = ""
    province: str = ""
    city: str = ""
    district: str = ""
    postal_code: str = ""
    country: str = ""
    phone: str = ""
    mobile: str = ""
    email: str = ""
    website: str = ""
    manager_name: str = ""
    tax_id: str = ""
    business_registration_number: str = ""
    working_hours: str = ""
    notes: str = ""
    latitude: float | None = None
    longitude: float | None = None
    default_warehouse_id: int | None = None


def _row_to_dict(row):
    return dict(row)


@router.get("")
def list_branches(
    request: Request,
    search: str = "",
    branch_type: str = "",
    active: str = "",
    sort: str = "name",
):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        clauses = ["company_id = :company_id"]
        params = {"company_id": company_id}
        if search.strip():
            clauses.append("(name LIKE :q OR code LIKE :q OR city LIKE :q)")
            params["q"] = f"%{search.strip()}%"
        if branch_type.strip():
            clauses.append("branch_type = :branch_type")
            params["branch_type"] = branch_type.strip()
        if active in ("true", "false"):
            clauses.append("active = :active")
            params["active"] = 1 if active == "true" else 0
        order_col = {"name": "name", "code": "code", "city": "city", "created_at": "created_at"}.get(sort, "name")
        rows = conn.execute(text(f"""
            SELECT * FROM branches WHERE {' AND '.join(clauses)} ORDER BY {order_col} ASC
        """), params).mappings().all()
    return {"items": [_row_to_dict(row) for row in rows]}


@router.get("/{branch_id}")
def get_branch(branch_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("""
            SELECT * FROM branches WHERE id=:id AND company_id=:company_id
        """), {"id": branch_id, "company_id": company_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found")
    return _row_to_dict(row)


@router.post("")
def create_branch(data: BranchUpsert, request: Request):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Branch name is required")
    if data.branch_type not in BRANCH_TYPES:
        raise HTTPException(status_code=400, detail=f"branch_type must be one of: {', '.join(sorted(BRANCH_TYPES))}")
    company_id = current_company_id(request)
    now = _now()
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text("""
            INSERT INTO branches
              (name, code, branch_type, active, address, province, city, district, postal_code, country,
               phone, mobile, email, website, manager_name, tax_id, business_registration_number,
               working_hours, notes, latitude, longitude, default_warehouse_id, created_at, updated_at, company_id)
            VALUES
              (:name, :code, :branch_type, 1, :address, :province, :city, :district, :postal_code, :country,
               :phone, :mobile, :email, :website, :manager_name, :tax_id, :business_registration_number,
               :working_hours, :notes, :latitude, :longitude, :default_warehouse_id, :now, :now, :company_id)
        """), {**data.model_dump(), "now": now, "company_id": company_id})
        branch_id = result.lastrowid
    return {"status": "created", "id": branch_id}


@router.put("/{branch_id}")
def update_branch(branch_id: int, data: BranchUpsert, request: Request):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Branch name is required")
    if data.branch_type not in BRANCH_TYPES:
        raise HTTPException(status_code=400, detail=f"branch_type must be one of: {', '.join(sorted(BRANCH_TYPES))}")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        existing = conn.execute(text("""
            SELECT id FROM branches WHERE id=:id AND company_id=:company_id
        """), {"id": branch_id, "company_id": company_id}).first()
        if not existing:
            raise HTTPException(status_code=404, detail="Branch not found")
        conn.execute(text("""
            UPDATE branches SET
              name=:name, code=:code, branch_type=:branch_type, address=:address, province=:province,
              city=:city, district=:district, postal_code=:postal_code, country=:country, phone=:phone,
              mobile=:mobile, email=:email, website=:website, manager_name=:manager_name, tax_id=:tax_id,
              business_registration_number=:business_registration_number, working_hours=:working_hours,
              notes=:notes, latitude=:latitude, longitude=:longitude, default_warehouse_id=:default_warehouse_id,
              updated_at=:now
            WHERE id=:id AND company_id=:company_id
        """), {**data.model_dump(), "id": branch_id, "company_id": company_id, "now": _now()})
    return {"status": "updated"}


@router.post("/{branch_id}/deactivate")
def deactivate_branch(branch_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        existing = conn.execute(text("""
            SELECT id FROM branches WHERE id=:id AND company_id=:company_id
        """), {"id": branch_id, "company_id": company_id}).first()
        if not existing:
            raise HTTPException(status_code=404, detail="Branch not found")
        conn.execute(text("""
            UPDATE branches SET active=0, updated_at=:now WHERE id=:id AND company_id=:company_id
        """), {"id": branch_id, "company_id": company_id, "now": _now()})
    return {"status": "deactivated"}


@router.post("/{branch_id}/activate")
def activate_branch(branch_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        existing = conn.execute(text("""
            SELECT id FROM branches WHERE id=:id AND company_id=:company_id
        """), {"id": branch_id, "company_id": company_id}).first()
        if not existing:
            raise HTTPException(status_code=404, detail="Branch not found")
        conn.execute(text("""
            UPDATE branches SET active=1, updated_at=:now WHERE id=:id AND company_id=:company_id
        """), {"id": branch_id, "company_id": company_id, "now": _now()})
    return {"status": "activated"}
