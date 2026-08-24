"""Complete Company Management (Task 04, Section 17).

The `Company` model (app/models/company.py) is the super-admin-only,
multi-tenant registry (id/name/is_active) used to create/switch between
companies - it must not become a duplicate profile store. The per-company
"complete operational profile" this task asks for (identity, activity,
mission/vision/goals, contact, banking, documents) belongs to a single
company's own admin, not a super-admin managing every tenant, so it lives
behind a NEW route prefix gated to {"admin"} only (matching how /settings
is already admin-only and self-scoped by current_company_id) rather than
reusing /api/companies' super-admin gate.

Fields that already exist on app/settings_routes.py's AppSettings (trading
name, phone/mobile/email/website/address, national_id, economic_code,
industry, logo/stamp/signature) are reused by reference from there, never
duplicated here - this module only stores what AppSettings genuinely does
not have yet, in a sidecar `company_profile` table (one row per company,
the same "layer on top via a new table" shape Section 15's budget_plans
used for accounting_budgets, rather than an in-place ALTER of the
heavily-used, ORM-mapped app_settings table).

Company documents follow the same disk-plus-JSON-index convention as
app/crm/files.py and app/accounting/attachments.py, but that established
pattern has no per-row company check at all (any authenticated caller who
can reach the route can read another company's row by id) - since every
document here belongs to exactly one company, this module closes that gap
by verifying entity_id == current_company_id(request) on every read/
download/delete, which registration/tax/license documents warrant.
"""
import json
import uuid
from datetime import date as date_cls, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import SessionLocal, engine

router = APIRouter(prefix="/api/company-profile", tags=["Company Profile"])

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_ROOT = BASE_DIR / "uploads" / "company_documents"
INDEX_FILE = UPLOAD_ROOT / "index.json"

COMPANY_TYPES = {"sole_proprietorship", "partnership", "llc", "corporation", "cooperative", "other"}
DOCUMENT_TYPES = {"registration", "tax", "license", "contract", "certification", "other"}
GOAL_STATUSES = {"not_started", "in_progress", "completed", "at_risk", "cancelled"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS company_profile (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            legal_name VARCHAR DEFAULT '',
            company_code VARCHAR DEFAULT '',
            company_type VARCHAR DEFAULT '',
            legal_form VARCHAR DEFAULT '',
            registration_number VARCHAR DEFAULT '',
            vat_number VARCHAR DEFAULT '',
            registration_date VARCHAR,
            main_activity VARCHAR DEFAULT '',
            activity_description TEXT DEFAULT '',
            business_categories TEXT DEFAULT '',
            products_services TEXT DEFAULT '',
            target_markets TEXT DEFAULT '',
            geographic_scope TEXT DEFAULT '',
            business_model TEXT DEFAULT '',
            mission TEXT DEFAULT '',
            vision TEXT DEFAULT '',
            strategic_objectives TEXT DEFAULT '',
            annual_objectives TEXT DEFAULT '',
            province VARCHAR DEFAULT '',
            city VARCHAR DEFAULT '',
            district VARCHAR DEFAULT '',
            postal_code VARCHAR DEFAULT '',
            billing_address TEXT DEFAULT '',
            legal_address TEXT DEFAULT '',
            operational_address TEXT DEFAULT '',
            bank_name VARCHAR DEFAULT '',
            bank_account_holder VARCHAR DEFAULT '',
            bank_iban VARCHAR DEFAULT '',
            payment_instructions TEXT DEFAULT '',
            secondary_logo_data TEXT DEFAULT '',
            brand_primary_color VARCHAR DEFAULT '',
            brand_secondary_color VARCHAR DEFAULT '',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS company_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title VARCHAR NOT NULL,
            description TEXT DEFAULT '',
            owner_user_id INTEGER,
            start_date VARCHAR,
            target_date VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'not_started',
            measurable_target VARCHAR DEFAULT '',
            progress_percent INTEGER NOT NULL DEFAULT 0,
            linked_bi_plan_id INTEGER,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    ensure_company_id_column(conn, "company_profile")
    ensure_company_id_column(conn, "company_goals")


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


PROFILE_FIELDS = [
    "legal_name", "company_code", "company_type", "legal_form", "registration_number", "vat_number", "registration_date",
    "main_activity", "activity_description", "business_categories", "products_services", "target_markets",
    "geographic_scope", "business_model", "mission", "vision", "strategic_objectives", "annual_objectives",
    "province", "city", "district", "postal_code", "billing_address", "legal_address", "operational_address",
    "bank_name", "bank_account_holder", "bank_iban", "payment_instructions",
    "secondary_logo_data", "brand_primary_color", "brand_secondary_color",
]


class ProfileUpdate(BaseModel):
    legal_name: str = ""
    company_code: str = ""
    company_type: str = ""
    legal_form: str = ""
    registration_number: str = ""
    vat_number: str = ""
    registration_date: str | None = None
    main_activity: str = ""
    activity_description: str = ""
    business_categories: str = ""
    products_services: str = ""
    target_markets: str = ""
    geographic_scope: str = ""
    business_model: str = ""
    mission: str = ""
    vision: str = ""
    strategic_objectives: str = ""
    annual_objectives: str = ""
    province: str = ""
    city: str = ""
    district: str = ""
    postal_code: str = ""
    billing_address: str = ""
    legal_address: str = ""
    operational_address: str = ""
    bank_name: str = ""
    bank_account_holder: str = ""
    bank_iban: str = ""
    payment_instructions: str = ""
    secondary_logo_data: str = ""
    brand_primary_color: str = ""
    brand_secondary_color: str = ""


def _get_profile_row(conn, company_id):
    row = conn.execute(text("SELECT * FROM company_profile WHERE company_id=:company_id"), {"company_id": company_id}).mappings().first()
    return dict(row) if row else None


@router.get("")
def get_company_profile(request: Request):
    from app.models.company import Company
    from app.settings_routes import get_or_create_settings, settings_to_dict

    from app.branches import _ensure_schema as _ensure_branches_schema

    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _ensure_branches_schema(conn)
        profile = _get_profile_row(conn, company_id)
        branches_count = conn.execute(text("SELECT COUNT(*) FROM branches WHERE company_id=:company_id"), {"company_id": company_id}).scalar() or 0
        warehouses_count = 0
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
        if "warehouses" in tables:
            warehouses_count = conn.execute(text("SELECT COUNT(*) FROM warehouses WHERE company_id=:company_id"), {"company_id": company_id}).scalar() or 0
        users_count = conn.execute(text("SELECT COUNT(*) FROM users WHERE company_id=:company_id"), {"company_id": company_id}).scalar() or 0

    db = SessionLocal()
    try:
        settings = get_or_create_settings(db, company_id)
        settings_dict = settings_to_dict(settings)
        company = db.query(Company).filter(Company.id == company_id).first()
    finally:
        db.close()

    if not profile:
        profile = {field: "" for field in PROFILE_FIELDS}
        profile["registration_date"] = None

    return {
        **{k: profile.get(k, "") for k in PROFILE_FIELDS},
        "registration_date": profile.get("registration_date"),
        # Reused-by-reference from AppSettings, never duplicated:
        "trading_name": settings_dict["company_name"],
        "phone": settings_dict["phone"],
        "mobile": settings_dict["mobile"],
        "email": settings_dict["email"],
        "website": settings_dict["website"],
        "address": settings_dict["address"],
        "national_id": settings_dict["national_id"],
        "economic_code": settings_dict["economic_code"],
        "industry": settings_dict["industry"],
        "fiscal_year_start": settings_dict["fiscal_year_start"],
        "has_logo": bool(settings_dict["logo_data"]),
        "show_logo": settings_dict["show_logo"],
        "is_active": bool(company.is_active) if company else True,
        "relationships": {
            "branches_count": branches_count,
            "warehouses_count": warehouses_count,
            "users_count": users_count,
        },
    }


@router.put("")
def update_company_profile(data: ProfileUpdate, request: Request):
    if data.company_type and data.company_type not in COMPANY_TYPES:
        raise HTTPException(status_code=400, detail=f"company_type must be one of: {', '.join(sorted(COMPANY_TYPES))}")
    company_id = current_company_id(request)
    now = _now()
    with engine.begin() as conn:
        _ensure_schema(conn)
        existing = _get_profile_row(conn, company_id)
        payload = data.model_dump()
        if existing:
            set_clause = ", ".join(f"{k}=:{k}" for k in payload)
            conn.execute(text(f"""
                UPDATE company_profile SET {set_clause}, updated_at=:now WHERE company_id=:company_id
            """), {**payload, "now": now, "company_id": company_id})
        else:
            columns = ", ".join(payload.keys())
            placeholders = ", ".join(f":{k}" for k in payload)
            conn.execute(text(f"""
                INSERT INTO company_profile ({columns}, created_at, updated_at, company_id)
                VALUES ({placeholders}, :now, :now, :company_id)
            """), {**payload, "now": now, "company_id": company_id})
        return {"status": "updated"}


# --------------------------------------------------------------------------
# Strategic goals - deliberately simple (status/progress only), NOT a
# second copy of the BI Improvement Action Plan engine. A goal MAY point at
# a real bi_action_plans row via linked_bi_plan_id when a goal genuinely
# originates from a BI finding, but most company goals (e.g. "open two new
# branches this year") never do, so this stays its own lightweight record.
# --------------------------------------------------------------------------

class GoalCreate(BaseModel):
    title: str
    description: str = ""
    owner_user_id: int | None = None
    start_date: str | None = None
    target_date: str | None = None
    measurable_target: str = ""
    linked_bi_plan_id: int | None = None


@router.get("/goals")
def list_goals(request: Request, status: str = ""):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        clauses = ["g.company_id=:company_id"]
        params = {"company_id": company_id}
        if status:
            clauses.append("g.status=:status")
            params["status"] = status
        rows = conn.execute(text(f"""
            SELECT g.*, u.full_name AS owner_user_name
            FROM company_goals g LEFT JOIN users u ON u.id=g.owner_user_id
            WHERE {' AND '.join(clauses)} ORDER BY g.id DESC
        """), params).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.post("/goals")
def create_goal(data: GoalCreate, request: Request):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Goal title is required")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        now = _now()
        result = conn.execute(text("""
            INSERT INTO company_goals
              (title, description, owner_user_id, start_date, target_date, status, measurable_target,
               progress_percent, linked_bi_plan_id, created_at, updated_at, company_id)
            VALUES
              (:title, :description, :owner_user_id, :start_date, :target_date, 'not_started', :measurable_target,
               0, :linked_bi_plan_id, :now, :now, :company_id)
        """), {**data.model_dump(), "now": now, "company_id": company_id})
        return {"status": "created", "id": result.lastrowid}


class GoalUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    owner_user_id: int | None = None
    start_date: str | None = None
    target_date: str | None = None
    status: str | None = None
    measurable_target: str | None = None
    progress_percent: int | None = None
    linked_bi_plan_id: int | None = None


@router.put("/goals/{goal_id}")
def update_goal(goal_id: int, data: GoalUpdate, request: Request):
    company_id = current_company_id(request)
    if data.status is not None and data.status not in GOAL_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(sorted(GOAL_STATUSES))}")
    if data.progress_percent is not None and not (0 <= data.progress_percent <= 100):
        raise HTTPException(status_code=400, detail="progress_percent must be between 0 and 100")
    with engine.begin() as conn:
        _ensure_schema(conn)
        goal = conn.execute(text("SELECT id FROM company_goals WHERE id=:id AND company_id=:company_id"), {"id": goal_id, "company_id": company_id}).first()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            return {"status": "unchanged"}
        set_clause = ", ".join(f"{k}=:{k}" for k in fields)
        conn.execute(text(f"UPDATE company_goals SET {set_clause}, updated_at=:now WHERE id=:id AND company_id=:company_id"),
                     {**fields, "now": _now(), "id": goal_id, "company_id": company_id})
        return {"status": "updated"}


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text("DELETE FROM company_goals WHERE id=:id AND company_id=:company_id"), {"id": goal_id, "company_id": company_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Goal not found")
        return {"status": "deleted"}


# --------------------------------------------------------------------------
# Company documents - same disk+JSON-index convention as crm/files.py and
# accounting/attachments.py, with an added per-row company_id check those
# two don't have (see module docstring).
# --------------------------------------------------------------------------

def _ensure_storage():
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text("[]", encoding="utf-8")


def _load_index():
    _ensure_storage()
    try:
        return json.loads(INDEX_FILE.read_text(encoding="utf-8") or "[]")
    except (OSError, json.JSONDecodeError):
        return []


def _save_index(rows):
    _ensure_storage()
    INDEX_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_name(name: str) -> str:
    allowed = "._- ()[]{}آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیيكى "
    cleaned = "".join(ch for ch in str(name or "file") if ch.isalnum() or ch in allowed)
    cleaned = cleaned.strip().replace(" ", "_")
    return cleaned or "file"


# Same bound/reasoning as app/accounting/attachments.py's MAX_UPLOAD_SIZE_BYTES.
MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024


def _copy_with_size_limit(source, destination, max_bytes=MAX_UPLOAD_SIZE_BYTES):
    total = 0
    while True:
        chunk = source.read(1024 * 1024)
        if not chunk:
            return
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail=f"File too large (max {max_bytes // (1024 * 1024)} MB)")
        destination.write(chunk)


@router.get("/documents")
def list_documents(request: Request):
    company_id = current_company_id(request)
    rows = _load_index()
    return {"items": [row for row in rows if int(row.get("company_id", 0)) == int(company_id)]}


@router.post("/documents")
async def upload_document(
    request: Request, file: UploadFile = File(...), document_type: str = Form("other"),
    title: str = Form(""), issue_date: str = Form(""), expiry_date: str = Form(""), notes: str = Form(""),
):
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"document_type must be one of: {', '.join(sorted(DOCUMENT_TYPES))}")
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    actor, _ = _auth(request)
    company_id = current_company_id(request)

    _ensure_storage()
    file_id = str(uuid.uuid4())
    company_dir = UPLOAD_ROOT / str(company_id)
    company_dir.mkdir(parents=True, exist_ok=True)
    original_name = _safe_name(file.filename)
    stored_path = company_dir / f"{file_id}_{original_name}"
    try:
        with stored_path.open("wb") as buffer:
            _copy_with_size_limit(file.file, buffer)
    except HTTPException:
        stored_path.unlink(missing_ok=True)
        raise

    row = {
        "id": file_id,
        "company_id": company_id,
        "document_type": document_type,
        "title": title or file.filename,
        "file_name": file.filename,
        "path": str(stored_path),
        "content_type": file.content_type or "application/octet-stream",
        "size": stored_path.stat().st_size,
        "issue_date": issue_date or None,
        "expiry_date": expiry_date or None,
        "notes": notes,
        "uploaded_by": actor,
        "created_at": _now(),
    }
    rows = _load_index()
    rows.insert(0, row)
    _save_index(rows)
    return row


def _find_document(document_id, company_id):
    rows = _load_index()
    row = next((item for item in rows if str(item.get("id")) == str(document_id)), None)
    if not row or int(row.get("company_id", 0)) != int(company_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.get("/documents/{document_id}/download")
def download_document(document_id: str, request: Request):
    row = _find_document(document_id, current_company_id(request))
    path = Path(row.get("path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found")
    return FileResponse(path, filename=row.get("file_name") or path.name, media_type=row.get("content_type") or "application/octet-stream")


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, request: Request):
    company_id = current_company_id(request)
    row = _find_document(document_id, company_id)
    path = Path(row.get("path", ""))
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
    rows = [item for item in _load_index() if str(item.get("id")) != str(document_id)]
    _save_index(rows)
    return {"status": "deleted", "id": document_id}


def company_document_alerts(company_id: int, alert_days_before_due: int = 3) -> list:
    """6th Executive Alerts source (Task 04) - a document with a real
    expiry_date crossing the same configurable "days before due" threshold
    already used for cheques, in the same alert shape as the other five
    sources (see executive_alerts.py's docstring)."""
    alerts = []
    today = date_cls.today()
    for row in _load_index():
        if int(row.get("company_id", 0)) != int(company_id):
            continue
        expiry_date = row.get("expiry_date")
        if not expiry_date:
            continue
        try:
            expiry = date_cls.fromisoformat(str(expiry_date)[:10])
        except ValueError:
            continue
        days_to_due = (expiry - today).days
        if days_to_due < 0:
            severity = "critical"
        elif days_to_due <= alert_days_before_due:
            severity = "warning"
        else:
            continue
        alerts.append({
            "category": "company_document", "severity": severity, "title": row.get("title") or row.get("file_name"),
            "amount": None, "due_date": expiry_date, "days_overdue": max(0, -days_to_due),
            "related_id": row.get("id"), "related_type": "company_document", "quick_action": "view_company_document",
        })
    return alerts
