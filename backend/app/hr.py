"""Personnel / HR Record System (Task 04, Section 18).

Employee = HR record. User = application login/account. An employee may
optionally link to a user account (linked_user_id) - this is the
architecture the task spec itself prescribes, and matches what this
codebase actually has: confirmed via research that no Employee-like entity
exists anywhere yet (this module is genuinely new), while `User` already
owns login/role/company_id and must stay untouched.

There is no payroll engine anywhere in this codebase (only a generic
"payroll" expense-category GL code). Section D below is therefore a
personnel COMPENSATION LEDGER - a record of amounts recorded against an
employee (salary/allowance/bonus/commission/deduction/advance/reimbursement/
payment) - not statutory payroll (no tax withholding, no payslip
computation, no automatic GL posting). This distinction is deliberate and
must stay explicit in every place this data is shown.

Attendance (Section F) is manual-entry only, `source='manual'` by design -
no biometric/time-clock integration exists anywhere in this codebase, and
none is faked here. The `source` column exists purely so a future real
integration has somewhere to write to without a schema change.

Leave requests route through the existing generic approval engine
(app/approvals/engine.py), the same reuse the codebase's own budget_plans.py
and change_requests.py already established, rather than a fourth
approval workflow.

Employee documents follow the same disk-plus-JSON-index convention as
app/crm/files.py and app/accounting/attachments.py, with the same added
per-row company_id check app/company_profile.py introduced (see that
module's docstring) - HR documents are sensitive, so this module goes
further: every read/download is also gated by the same row-level
self/manager/admin permission check used for the rest of this module, and
the download route is never a public/predictable URL (auth required, id is
a uuid4, not a sequential integer).

RBAC note: there is no "manager" role in this codebase's role set
(admin/accountant/sales/warehouse/viewer/user) - "manager" here means "the
employee this employee's manager_employee_id points at is the caller's own
linked employee," a relationship, not a role. The core RBAC module
(app/rbac.py) only supports route-prefix + role checks, not row ownership
(confirmed via research - the one precedent is customer_scope_for_role, and
app/field_visits.py's own hand-rolled per-endpoint filter) - so, like
field_visits.py, this module does its own per-endpoint scoping in SQL/
Python rather than inventing a second generic mechanism.
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

router = APIRouter(prefix="/api/hr", tags=["Human Resources"])

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_ROOT = BASE_DIR / "uploads" / "employee_documents"
INDEX_FILE = UPLOAD_ROOT / "index.json"

EMPLOYEE_STATUSES = {"active", "on_leave", "suspended", "terminated"}
EMPLOYMENT_TYPES = {"full_time", "part_time", "contract", "intern", "other"}
HISTORY_EVENT_TYPES = {
    "hired", "position_change", "branch_transfer", "department_transfer",
    "status_change", "contract_change", "compensation_change", "profile_change",
}
COMPENSATION_TYPES = {"base_salary", "allowance", "bonus", "commission", "deduction", "advance", "reimbursement", "payment"}
LEAVE_TYPES = {"annual", "sick", "unpaid", "other"}
LEAVE_STATUSES = {"pending", "approved", "rejected", "cancelled"}
ATTENDANCE_STATUSES = {"present", "absent", "late", "overtime", "half_day"}
DOCUMENT_TYPES = {"id_document", "contract", "certificate", "diploma", "training_certificate", "cv", "license", "other"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return date_cls.today().isoformat()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_number VARCHAR DEFAULT '',
            first_name VARCHAR NOT NULL,
            last_name VARCHAR NOT NULL,
            display_name VARCHAR DEFAULT '',
            photo_data TEXT DEFAULT '',
            status VARCHAR NOT NULL DEFAULT 'active',
            employment_type VARCHAR NOT NULL DEFAULT 'full_time',
            job_title VARCHAR DEFAULT '',
            department VARCHAR DEFAULT '',
            branch_id INTEGER,
            manager_employee_id INTEGER,
            start_date VARCHAR,
            end_date VARCHAR,
            contract_type VARCHAR DEFAULT '',
            work_schedule VARCHAR DEFAULT '',
            phone VARCHAR DEFAULT '',
            mobile VARCHAR DEFAULT '',
            email VARCHAR DEFAULT '',
            address TEXT DEFAULT '',
            emergency_contact_name VARCHAR DEFAULT '',
            emergency_contact_phone VARCHAR DEFAULT '',
            linked_user_id INTEGER,
            notes TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS employee_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            field_name VARCHAR DEFAULT '',
            old_value VARCHAR,
            new_value VARCHAR,
            effective_date VARCHAR,
            note TEXT DEFAULT '',
            actor_user_id INTEGER,
            created_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS employee_compensation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            entry_type VARCHAR NOT NULL,
            amount FLOAT NOT NULL,
            currency VARCHAR DEFAULT '',
            effective_date VARCHAR NOT NULL,
            note TEXT DEFAULT '',
            created_by INTEGER,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS employee_leave_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            leave_type VARCHAR NOT NULL,
            entitlement FLOAT NOT NULL DEFAULT 0,
            used FLOAT NOT NULL DEFAULT 0,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(employee_id, leave_type)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS employee_leave_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            leave_type VARCHAR NOT NULL,
            start_date VARCHAR NOT NULL,
            end_date VARCHAR NOT NULL,
            days FLOAT NOT NULL,
            reason TEXT DEFAULT '',
            status VARCHAR NOT NULL DEFAULT 'pending',
            approval_request_id INTEGER,
            decided_by INTEGER,
            notes TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS employee_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            work_date VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'present',
            check_in_time VARCHAR,
            check_out_time VARCHAR,
            hours FLOAT,
            source VARCHAR NOT NULL DEFAULT 'manual',
            note TEXT DEFAULT '',
            recorded_by INTEGER,
            created_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(employee_id, work_date)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS employee_performance_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            review_period VARCHAR DEFAULT '',
            reviewer_user_id INTEGER,
            objectives TEXT DEFAULT '',
            kpi VARCHAR DEFAULT '',
            target VARCHAR DEFAULT '',
            actual VARCHAR DEFAULT '',
            rating INTEGER,
            comments TEXT DEFAULT '',
            strengths TEXT DEFAULT '',
            improvement_areas TEXT DEFAULT '',
            development_plan TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    for table in (
        "employees", "employee_history", "employee_compensation", "employee_leave_balances",
        "employee_leave_requests", "employee_attendance", "employee_performance_reviews",
    ):
        ensure_company_id_column(conn, table)


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _own_employee_id(conn, company_id, user_id):
    return conn.execute(text(
        "SELECT id FROM employees WHERE linked_user_id=:user_id AND company_id=:company_id"
    ), {"user_id": user_id, "company_id": company_id}).scalar()


def _employee_row(conn, employee_id, company_id):
    row = conn.execute(text("SELECT * FROM employees WHERE id=:id AND company_id=:company_id"), {"id": employee_id, "company_id": company_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    return dict(row)


def _can_view(role, own_employee_id, employee):
    if role == "admin":
        return True
    if own_employee_id is not None and (own_employee_id == employee["id"] or own_employee_id == employee.get("manager_employee_id")):
        return True
    return False


def _can_view_compensation(role, own_employee_id, employee):
    """Compensation is more sensitive than the general profile - only
    admin, accountant (per the task spec's own "compensation-related
    fields where allowed"), or the employee themselves may see it. Direct
    managers do NOT automatically see a report's pay, only admin/accountant do."""
    if role in ("admin", "accountant"):
        return True
    return own_employee_id is not None and own_employee_id == employee["id"]


def _require_hr_access(conn, request, employee_id, need="view", company_id=None):
    company_id = company_id or current_company_id(request)
    actor, role = _auth(request)
    employee = _employee_row(conn, employee_id, company_id)
    own_employee_id = _own_employee_id(conn, company_id, actor)
    allowed = _can_view_compensation(role, own_employee_id, employee) if need == "compensation" else _can_view(role, own_employee_id, employee)
    if not allowed:
        raise HTTPException(status_code=403, detail="You do not have access to this employee's records")
    return actor, role, own_employee_id, employee


def _log_history(conn, employee_id, event_type, field_name, old_value, new_value, effective_date, note, actor, company_id):
    conn.execute(text("""
        INSERT INTO employee_history (employee_id, event_type, field_name, old_value, new_value, effective_date, note, actor_user_id, created_at, company_id)
        VALUES (:employee_id, :event_type, :field_name, :old_value, :new_value, :effective_date, :note, :actor, :now, :company_id)
    """), {
        "employee_id": employee_id, "event_type": event_type, "field_name": field_name,
        "old_value": None if old_value is None else str(old_value), "new_value": None if new_value is None else str(new_value),
        "effective_date": effective_date, "note": note or "", "actor": actor, "now": _now(), "company_id": company_id,
    })


# --------------------------------------------------------------------------
# Employee profile + employment history
# --------------------------------------------------------------------------

class EmployeeCreate(BaseModel):
    employee_number: str = ""
    first_name: str
    last_name: str
    display_name: str = ""
    employment_type: str = "full_time"
    job_title: str = ""
    department: str = ""
    branch_id: int | None = None
    manager_employee_id: int | None = None
    start_date: str | None = None
    contract_type: str = ""
    work_schedule: str = ""
    phone: str = ""
    mobile: str = ""
    email: str = ""
    address: str = ""
    emergency_contact_name: str = ""
    emergency_contact_phone: str = ""
    linked_user_id: int | None = None
    notes: str = ""


def _validate_employee(data: EmployeeCreate):
    if data.employment_type not in EMPLOYMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"employment_type must be one of: {', '.join(sorted(EMPLOYMENT_TYPES))}")
    if not data.first_name.strip() or not data.last_name.strip():
        raise HTTPException(status_code=400, detail="First and last name are required")


def _validate_cross_company_refs(conn, company_id, branch_id=None, manager_employee_id=None):
    """branch_id/manager_employee_id are client-supplied ids into tables
    whose only isolation is a company_id column (ids are globally
    autoincrement, not per-company) - without this check, an admin
    setting either to another company's real id would let get_employee's
    manager-name lookup / list_employees' branch join leak that other
    company's employee name / branch name into this company's HR
    responses."""
    if branch_id is not None:
        from app.branches import _ensure_schema as _ensure_branches_schema
        _ensure_branches_schema(conn)
        row = conn.execute(
            text("SELECT id FROM branches WHERE id=:id AND company_id=:company_id"),
            {"id": branch_id, "company_id": company_id},
        ).first()
        if not row:
            raise HTTPException(status_code=400, detail="branch_id does not belong to this company")
    if manager_employee_id is not None:
        row = conn.execute(
            text("SELECT id FROM employees WHERE id=:id AND company_id=:company_id"),
            {"id": manager_employee_id, "company_id": company_id},
        ).first()
        if not row:
            raise HTTPException(status_code=400, detail="manager_employee_id does not belong to this company")


@router.get("")
def list_employees(request: Request, status: str = "", department: str = "", branch_id: int | None = None, search: str = ""):
    from app.branches import _ensure_schema as _ensure_branches_schema

    company_id = current_company_id(request)
    actor, role = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _ensure_branches_schema(conn)
        own_employee_id = _own_employee_id(conn, company_id, actor)
        clauses = ["e.company_id=:company_id"]
        params = {"company_id": company_id}
        if status:
            clauses.append("e.status=:status")
            params["status"] = status
        if department:
            clauses.append("e.department=:department")
            params["department"] = department
        if branch_id is not None:
            clauses.append("e.branch_id=:branch_id")
            params["branch_id"] = branch_id
        if search:
            clauses.append("(e.first_name LIKE :search OR e.last_name LIKE :search OR e.employee_number LIKE :search)")
            params["search"] = f"%{search}%"
        rows = conn.execute(text(f"""
            SELECT e.*, b.name AS branch_name
            FROM employees e LEFT JOIN branches b ON b.id=e.branch_id AND b.company_id=e.company_id
            WHERE {' AND '.join(clauses)} ORDER BY e.id DESC
        """), params).mappings().all()
        items = [dict(r) for r in rows if _can_view(role, own_employee_id, dict(r))]
        return {"items": items}


@router.post("")
def create_employee(data: EmployeeCreate, request: Request):
    _validate_employee(data)
    actor, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can create employee records")
    company_id = current_company_id(request)
    now = _now()
    with engine.begin() as conn:
        _ensure_schema(conn)
        _validate_cross_company_refs(conn, company_id, data.branch_id, data.manager_employee_id)
        result = conn.execute(text("""
            INSERT INTO employees
              (employee_number, first_name, last_name, display_name, status, employment_type, job_title, department,
               branch_id, manager_employee_id, start_date, contract_type, work_schedule, phone, mobile, email, address,
               emergency_contact_name, emergency_contact_phone, linked_user_id, notes, created_at, updated_at, company_id)
            VALUES
              (:employee_number, :first_name, :last_name, :display_name, 'active', :employment_type, :job_title, :department,
               :branch_id, :manager_employee_id, :start_date, :contract_type, :work_schedule, :phone, :mobile, :email, :address,
               :emergency_contact_name, :emergency_contact_phone, :linked_user_id, :notes, :now, :now, :company_id)
        """), {**data.model_dump(), "now": now, "company_id": company_id})
        employee_id = result.lastrowid
        _log_history(conn, employee_id, "hired", "", None, data.job_title, data.start_date, "Employee record created", actor, company_id)
        return {"status": "created", "id": employee_id}


@router.get("/{employee_id}")
def get_employee(employee_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        actor, role, own_employee_id, employee = _require_hr_access(conn, request, employee_id, "view", company_id)
        manager = None
        if employee.get("manager_employee_id"):
            manager = conn.execute(
                text("SELECT id, first_name, last_name FROM employees WHERE id=:id AND company_id=:company_id"),
                {"id": employee["manager_employee_id"], "company_id": company_id},
            ).mappings().first()
        return {**employee, "manager_name": f"{manager['first_name']} {manager['last_name']}" if manager else None}


class EmployeeUpdate(BaseModel):
    employee_number: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    display_name: str | None = None
    status: str | None = None
    employment_type: str | None = None
    job_title: str | None = None
    department: str | None = None
    branch_id: int | None = None
    manager_employee_id: int | None = None
    start_date: str | None = None
    end_date: str | None = None
    contract_type: str | None = None
    work_schedule: str | None = None
    phone: str | None = None
    mobile: str | None = None
    email: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    notes: str | None = None

    # Self-service: an employee updating their own record may only touch
    # these fields - enforced by field allowlisting below, never trusted
    # from the client.
SELF_SERVICE_FIELDS = {"phone", "mobile", "email", "address", "emergency_contact_name", "emergency_contact_phone"}
HISTORY_TRACKED_FIELDS = {
    "job_title": "position_change", "department": "department_transfer", "branch_id": "branch_transfer",
    "status": "status_change", "contract_type": "contract_change",
}


@router.put("/{employee_id}")
def update_employee(employee_id: int, data: EmployeeUpdate, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        actor, role, own_employee_id, employee = _require_hr_access(conn, request, employee_id, "view", company_id)
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        is_self = own_employee_id == employee_id
        if role != "admin":
            if not is_self:
                raise HTTPException(status_code=403, detail="Only an admin (or the employee themselves, for limited fields) can edit this record")
            disallowed = set(fields) - SELF_SERVICE_FIELDS
            if disallowed:
                raise HTTPException(status_code=403, detail=f"Self-service edits are limited to: {', '.join(sorted(SELF_SERVICE_FIELDS))}")
        if fields.get("status") and fields["status"] not in EMPLOYEE_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(sorted(EMPLOYEE_STATUSES))}")
        if fields.get("employment_type") and fields["employment_type"] not in EMPLOYMENT_TYPES:
            raise HTTPException(status_code=400, detail=f"employment_type must be one of: {', '.join(sorted(EMPLOYMENT_TYPES))}")
        if not fields:
            return {"status": "unchanged"}
        _validate_cross_company_refs(conn, company_id, fields.get("branch_id"), fields.get("manager_employee_id"))

        now = _now()
        for field, event_type in HISTORY_TRACKED_FIELDS.items():
            if field in fields and str(fields[field]) != str(employee.get(field)):
                _log_history(conn, employee_id, event_type, field, employee.get(field), fields[field], _today(), "", actor, company_id)

        set_clause = ", ".join(f"{k}=:{k}" for k in fields)
        conn.execute(text(f"UPDATE employees SET {set_clause}, updated_at=:now WHERE id=:id AND company_id=:company_id"),
                     {**fields, "now": now, "id": employee_id, "company_id": company_id})
        return {"status": "updated"}


@router.get("/{employee_id}/history")
def get_employee_history(employee_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "view", company_id)
        rows = conn.execute(text("""
            SELECT h.*, u.full_name AS actor_name FROM employee_history h LEFT JOIN users u ON u.id=h.actor_user_id
            WHERE h.employee_id=:employee_id AND h.company_id=:company_id ORDER BY h.id DESC
        """), {"employee_id": employee_id, "company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}


# --------------------------------------------------------------------------
# Compensation ledger - explicitly not statutory payroll (see module docstring).
# --------------------------------------------------------------------------

class CompensationCreate(BaseModel):
    entry_type: str
    amount: float
    currency: str = ""
    effective_date: str
    note: str = ""


@router.get("/{employee_id}/compensation")
def list_compensation(employee_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "compensation", company_id)
        rows = conn.execute(text("""
            SELECT * FROM employee_compensation WHERE employee_id=:employee_id AND company_id=:company_id ORDER BY effective_date DESC, id DESC
        """), {"employee_id": employee_id, "company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.post("/{employee_id}/compensation")
def create_compensation(employee_id: int, data: CompensationCreate, request: Request):
    if data.entry_type not in COMPENSATION_TYPES:
        raise HTTPException(status_code=400, detail=f"entry_type must be one of: {', '.join(sorted(COMPENSATION_TYPES))}")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        actor, role, own_employee_id, employee = _require_hr_access(conn, request, employee_id, "compensation", company_id)
        if role not in ("admin", "accountant"):
            raise HTTPException(status_code=403, detail="Only admin/accountant can record compensation entries")
        now = _now()
        result = conn.execute(text("""
            INSERT INTO employee_compensation (employee_id, entry_type, amount, currency, effective_date, note, created_by, created_at, updated_at, company_id)
            VALUES (:employee_id, :entry_type, :amount, :currency, :effective_date, :note, :actor, :now, :now, :company_id)
        """), {**data.model_dump(), "employee_id": employee_id, "actor": actor, "now": now, "company_id": company_id})
        _log_history(conn, employee_id, "compensation_change", data.entry_type, None, data.amount, data.effective_date, data.note, actor, company_id)
        return {"status": "created", "id": result.lastrowid}


# --------------------------------------------------------------------------
# Leave - balances + requests, routed through the generic approval engine.
# --------------------------------------------------------------------------

@router.get("/{employee_id}/leave/balances")
def get_leave_balances(employee_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "view", company_id)
        rows = conn.execute(text("""
            SELECT * FROM employee_leave_balances WHERE employee_id=:employee_id AND company_id=:company_id
        """), {"employee_id": employee_id, "company_id": company_id}).mappings().all()
        by_type = {r["leave_type"]: dict(r) for r in rows}
        return {"items": [
            {**by_type.get(t, {"leave_type": t, "entitlement": 0, "used": 0}), "remaining": by_type.get(t, {}).get("entitlement", 0) - by_type.get(t, {}).get("used", 0)}
            for t in LEAVE_TYPES
        ]}


class LeaveBalanceSet(BaseModel):
    leave_type: str
    entitlement: float


@router.put("/{employee_id}/leave/balances")
def set_leave_balance(employee_id: int, data: LeaveBalanceSet, request: Request):
    if data.leave_type not in LEAVE_TYPES:
        raise HTTPException(status_code=400, detail=f"leave_type must be one of: {', '.join(sorted(LEAVE_TYPES))}")
    actor, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can set leave entitlements")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _employee_row(conn, employee_id, company_id)
        now = _now()
        conn.execute(text("""
            INSERT INTO employee_leave_balances (employee_id, leave_type, entitlement, used, updated_at, company_id)
            VALUES (:employee_id, :leave_type, :entitlement, 0, :now, :company_id)
            ON CONFLICT(employee_id, leave_type) DO UPDATE SET entitlement=excluded.entitlement, updated_at=excluded.updated_at
        """), {"employee_id": employee_id, "leave_type": data.leave_type, "entitlement": data.entitlement, "now": now, "company_id": company_id})
        return {"status": "updated"}


class LeaveRequestCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    reason: str = ""


def _leave_days(start_date, end_date):
    start = date_cls.fromisoformat(start_date)
    end = date_cls.fromisoformat(end_date)
    if end < start:
        raise HTTPException(status_code=400, detail="end_date cannot be before start_date")
    return (end - start).days + 1


@router.get("/{employee_id}/leave/requests")
def list_leave_requests(employee_id: int, request: Request, status: str = ""):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "view", company_id)
        clauses = ["employee_id=:employee_id", "company_id=:company_id"]
        params = {"employee_id": employee_id, "company_id": company_id}
        if status:
            clauses.append("status=:status")
            params["status"] = status
        rows = conn.execute(text(f"SELECT * FROM employee_leave_requests WHERE {' AND '.join(clauses)} ORDER BY id DESC"), params).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.post("/{employee_id}/leave/requests")
def create_leave_request(employee_id: int, data: LeaveRequestCreate, request: Request):
    from app.approvals.engine import create_request

    if data.leave_type not in LEAVE_TYPES:
        raise HTTPException(status_code=400, detail=f"leave_type must be one of: {', '.join(sorted(LEAVE_TYPES))}")
    days = _leave_days(data.start_date, data.end_date)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        actor, role, own_employee_id, employee = _require_hr_access(conn, request, employee_id, "view", company_id)
        if role != "admin" and own_employee_id != employee_id:
            raise HTTPException(status_code=403, detail="Only the employee themselves (or an admin) can submit a leave request for them")
        now = _now()
        result = conn.execute(text("""
            INSERT INTO employee_leave_requests (employee_id, leave_type, start_date, end_date, days, reason, status, created_at, updated_at, company_id)
            VALUES (:employee_id, :leave_type, :start_date, :end_date, :days, :reason, 'pending', :now, :now, :company_id)
        """), {**data.model_dump(), "employee_id": employee_id, "days": days, "now": now, "company_id": company_id})
        request_id = result.lastrowid
        approval = create_request(
            conn, "employee_leave_request", request_id, days, actor, role,
            f"Leave request: {data.leave_type} {data.start_date}..{data.end_date} ({days}d)", company_id, request_obj=request,
        )
        conn.execute(text("UPDATE employee_leave_requests SET approval_request_id=:req_id WHERE id=:id"), {"req_id": approval["id"], "id": request_id})
        return {"status": "pending_approval", "id": request_id, "approval_request_id": approval["id"]}


def _execute_leave_request_approval(request_id: int, decided_by: int, company_id: int) -> dict:
    db = SessionLocal()
    try:
        conn = db.connection()
        _ensure_schema(conn)
        leave = conn.execute(text("SELECT * FROM employee_leave_requests WHERE id=:id AND company_id=:company_id"), {"id": request_id, "company_id": company_id}).mappings().first()
        if not leave:
            raise ValueError("Leave request no longer exists")
        now = _now()
        conn.execute(text("UPDATE employee_leave_requests SET status='approved', decided_by=:decided_by, updated_at=:now WHERE id=:id"),
                     {"decided_by": decided_by, "now": now, "id": request_id})
        conn.execute(text("""
            INSERT INTO employee_leave_balances (employee_id, leave_type, entitlement, used, updated_at, company_id)
            VALUES (:employee_id, :leave_type, 0, :days, :now, :company_id)
            ON CONFLICT(employee_id, leave_type) DO UPDATE SET used=used + :days, updated_at=:now
        """), {"employee_id": leave["employee_id"], "leave_type": leave["leave_type"], "days": leave["days"], "now": now, "company_id": company_id})
        db.commit()
        return {"leave_request_id": request_id, "status": "approved"}
    finally:
        db.close()


def _register_executors():
    from app.approvals.engine import register_executor
    register_executor("employee_leave_request", _execute_leave_request_approval)


_register_executors()


@router.post("/leave/requests/{request_id}/cancel")
def cancel_leave_request(request_id: int, request: Request):
    company_id = current_company_id(request)
    actor, role = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        leave = conn.execute(text("SELECT * FROM employee_leave_requests WHERE id=:id AND company_id=:company_id"), {"id": request_id, "company_id": company_id}).mappings().first()
        if not leave:
            raise HTTPException(status_code=404, detail="Leave request not found")
        own_employee_id = _own_employee_id(conn, company_id, actor)
        if role != "admin" and own_employee_id != leave["employee_id"]:
            raise HTTPException(status_code=403, detail="Only the employee themselves (or an admin) can cancel this request")
        if leave["status"] != "pending":
            raise HTTPException(status_code=409, detail="Only a pending leave request can be cancelled")
        conn.execute(text("UPDATE employee_leave_requests SET status='cancelled', updated_at=:now WHERE id=:id"), {"now": _now(), "id": request_id})
        return {"status": "cancelled"}


# --------------------------------------------------------------------------
# Attendance - manual entry only (see module docstring).
# --------------------------------------------------------------------------

class AttendanceEntry(BaseModel):
    work_date: str
    status: str = "present"
    check_in_time: str | None = None
    check_out_time: str | None = None
    hours: float | None = None
    note: str = ""


@router.get("/{employee_id}/attendance")
def list_attendance(employee_id: int, request: Request, start: str = "", end: str = ""):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "view", company_id)
        clauses = ["employee_id=:employee_id", "company_id=:company_id"]
        params = {"employee_id": employee_id, "company_id": company_id}
        if start:
            clauses.append("work_date >= :start")
            params["start"] = start
        if end:
            clauses.append("work_date <= :end")
            params["end"] = end
        rows = conn.execute(text(f"SELECT * FROM employee_attendance WHERE {' AND '.join(clauses)} ORDER BY work_date DESC"), params).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.post("/{employee_id}/attendance")
def record_attendance(employee_id: int, data: AttendanceEntry, request: Request):
    if data.status not in ATTENDANCE_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(sorted(ATTENDANCE_STATUSES))}")
    actor, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can record attendance")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _employee_row(conn, employee_id, company_id)
        now = _now()
        conn.execute(text("""
            INSERT INTO employee_attendance (employee_id, work_date, status, check_in_time, check_out_time, hours, source, note, recorded_by, created_at, company_id)
            VALUES (:employee_id, :work_date, :status, :check_in_time, :check_out_time, :hours, 'manual', :note, :actor, :now, :company_id)
            ON CONFLICT(employee_id, work_date) DO UPDATE SET
              status=excluded.status, check_in_time=excluded.check_in_time, check_out_time=excluded.check_out_time,
              hours=excluded.hours, note=excluded.note, recorded_by=excluded.recorded_by
        """), {**data.model_dump(), "employee_id": employee_id, "actor": actor, "now": now, "company_id": company_id})
        return {"status": "recorded"}


# --------------------------------------------------------------------------
# Documents - disk+JSON-index, strict per-row access (see module docstring).
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


@router.get("/{employee_id}/documents")
def list_employee_documents(employee_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "view", company_id)
    rows = _load_index()
    return {"items": [r for r in rows if int(r.get("employee_id", 0)) == int(employee_id) and int(r.get("company_id", 0)) == int(company_id)]}


@router.post("/{employee_id}/documents")
async def upload_employee_document(
    employee_id: int, request: Request, file: UploadFile = File(...), document_type: str = Form("other"),
    title: str = Form(""), issue_date: str = Form(""), expiry_date: str = Form(""), notes: str = Form(""),
):
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"document_type must be one of: {', '.join(sorted(DOCUMENT_TYPES))}")
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        actor, role, own_employee_id, employee = _require_hr_access(conn, request, employee_id, "view", company_id)
        if role != "admin" and own_employee_id != employee_id:
            raise HTTPException(status_code=403, detail="Only an admin (or the employee themselves) can upload documents for this record")

    _ensure_storage()
    file_id = str(uuid.uuid4())
    employee_dir = UPLOAD_ROOT / str(company_id) / str(employee_id)
    employee_dir.mkdir(parents=True, exist_ok=True)
    original_name = _safe_name(file.filename)
    stored_path = employee_dir / f"{file_id}_{original_name}"
    try:
        with stored_path.open("wb") as buffer:
            _copy_with_size_limit(file.file, buffer)
    except HTTPException:
        stored_path.unlink(missing_ok=True)
        raise

    row = {
        "id": file_id, "employee_id": employee_id, "company_id": company_id, "document_type": document_type,
        "title": title or file.filename, "file_name": file.filename, "path": str(stored_path),
        "content_type": file.content_type or "application/octet-stream", "size": stored_path.stat().st_size,
        "issue_date": issue_date or None, "expiry_date": expiry_date or None, "notes": notes,
        "uploaded_by": actor, "created_at": _now(),
    }
    rows = _load_index()
    rows.insert(0, row)
    _save_index(rows)
    return row


def _find_employee_document(document_id, employee_id, company_id):
    rows = _load_index()
    row = next((item for item in rows if str(item.get("id")) == str(document_id)), None)
    if not row or int(row.get("employee_id", 0)) != int(employee_id) or int(row.get("company_id", 0)) != int(company_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.get("/{employee_id}/documents/{document_id}/download")
def download_employee_document(employee_id: int, document_id: str, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "view", company_id)
    row = _find_employee_document(document_id, employee_id, company_id)
    path = Path(row.get("path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found")
    return FileResponse(path, filename=row.get("file_name") or path.name, media_type=row.get("content_type") or "application/octet-stream")


@router.delete("/{employee_id}/documents/{document_id}")
def delete_employee_document(employee_id: int, document_id: str, request: Request):
    company_id = current_company_id(request)
    actor, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can delete an HR document")
    row = _find_employee_document(document_id, employee_id, company_id)
    path = Path(row.get("path", ""))
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
    rows = [item for item in _load_index() if str(item.get("id")) != str(document_id)]
    _save_index(rows)
    return {"status": "deleted", "id": document_id}


# --------------------------------------------------------------------------
# Performance reviews
# --------------------------------------------------------------------------

class PerformanceReviewCreate(BaseModel):
    review_period: str = ""
    objectives: str = ""
    kpi: str = ""
    target: str = ""
    actual: str = ""
    rating: int | None = None
    comments: str = ""
    strengths: str = ""
    improvement_areas: str = ""
    development_plan: str = ""


@router.get("/{employee_id}/performance")
def list_performance_reviews(employee_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        _require_hr_access(conn, request, employee_id, "view", company_id)
        rows = conn.execute(text("""
            SELECT r.*, u.full_name AS reviewer_name FROM employee_performance_reviews r LEFT JOIN users u ON u.id=r.reviewer_user_id
            WHERE r.employee_id=:employee_id AND r.company_id=:company_id ORDER BY r.id DESC
        """), {"employee_id": employee_id, "company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.post("/{employee_id}/performance")
def create_performance_review(employee_id: int, data: PerformanceReviewCreate, request: Request):
    if data.rating is not None and not (1 <= data.rating <= 5):
        raise HTTPException(status_code=400, detail="rating must be between 1 and 5")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        actor, role, own_employee_id, employee = _require_hr_access(conn, request, employee_id, "view", company_id)
        if role != "admin" and own_employee_id != employee.get("manager_employee_id"):
            # Manager doing the review must BE the reviewed employee's own manager - re-check the reverse direction explicitly (own_employee_id is the employee row for `employee`, not its manager).
            is_manager = own_employee_id is not None and employee.get("manager_employee_id") == own_employee_id
            if not is_manager:
                raise HTTPException(status_code=403, detail="Only an admin or this employee's manager can create a performance review")
        now = _now()
        result = conn.execute(text("""
            INSERT INTO employee_performance_reviews
              (employee_id, review_period, reviewer_user_id, objectives, kpi, target, actual, rating, comments,
               strengths, improvement_areas, development_plan, created_at, updated_at, company_id)
            VALUES
              (:employee_id, :review_period, :reviewer_user_id, :objectives, :kpi, :target, :actual, :rating, :comments,
               :strengths, :improvement_areas, :development_plan, :now, :now, :company_id)
        """), {**data.model_dump(), "employee_id": employee_id, "reviewer_user_id": actor, "now": now, "company_id": company_id})
        return {"status": "created", "id": result.lastrowid}


# --------------------------------------------------------------------------
# Employee 360 summary
# --------------------------------------------------------------------------

@router.get("/{employee_id}/summary")
def employee_360_summary(employee_id: int, request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        actor, role, own_employee_id, employee = _require_hr_access(conn, request, employee_id, "view", company_id)
        can_see_compensation = _can_view_compensation(role, own_employee_id, employee)

        balances = conn.execute(text("SELECT * FROM employee_leave_balances WHERE employee_id=:id AND company_id=:company_id"), {"id": employee_id, "company_id": company_id}).mappings().all()
        pending_leave = conn.execute(text("""
            SELECT COUNT(*) FROM employee_leave_requests WHERE employee_id=:id AND company_id=:company_id AND status='pending'
        """), {"id": employee_id, "company_id": company_id}).scalar() or 0
        recent_compensation = []
        if can_see_compensation:
            rows = conn.execute(text("""
                SELECT * FROM employee_compensation WHERE employee_id=:id AND company_id=:company_id ORDER BY effective_date DESC LIMIT 5
            """), {"id": employee_id, "company_id": company_id}).mappings().all()
            recent_compensation = [dict(r) for r in rows]
        latest_review = conn.execute(text("""
            SELECT * FROM employee_performance_reviews WHERE employee_id=:id AND company_id=:company_id ORDER BY id DESC LIMIT 1
        """), {"id": employee_id, "company_id": company_id}).mappings().first()

    documents = [d for d in _load_index() if int(d.get("employee_id", 0)) == int(employee_id) and int(d.get("company_id", 0)) == int(company_id)]
    today = _today()
    upcoming_expiring = sorted(
        [d for d in documents if d.get("expiry_date") and d["expiry_date"] >= today],
        key=lambda d: d["expiry_date"],
    )[:5]

    return {
        "employee": employee,
        "leave_balances": [{**dict(b), "remaining": b["entitlement"] - b["used"]} for b in balances],
        "pending_leave_requests": pending_leave,
        "recent_compensation": recent_compensation,
        "compensation_visible": can_see_compensation,
        "latest_performance_review": dict(latest_review) if latest_review else None,
        "upcoming_document_expiry": upcoming_expiring,
        "document_count": len(documents),
    }


# --------------------------------------------------------------------------
# Reports (Task 02 unified list/export convention: real JSON list endpoints
# the frontend renders through the same Table/CSV pattern every other
# report page in this codebase already uses).
# --------------------------------------------------------------------------

@router.get("/reports/headcount")
def headcount_report(request: Request):
    actor, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT department, status, COUNT(*) AS count FROM employees WHERE company_id=:company_id GROUP BY department, status
        """), {"company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.get("/reports/document-expiry")
def document_expiry_report(request: Request, days: int = 60):
    actor, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    company_id = current_company_id(request)
    horizon = (date_cls.today().toordinal() + days)
    items = []
    for d in _load_index():
        if int(d.get("company_id", 0)) != int(company_id) or not d.get("expiry_date"):
            continue
        try:
            expiry_ord = date_cls.fromisoformat(str(d["expiry_date"])[:10]).toordinal()
        except ValueError:
            continue
        if expiry_ord <= horizon:
            items.append(d)
    return {"items": sorted(items, key=lambda d: d["expiry_date"])}


def employee_document_alerts(company_id: int, alert_days_before_due: int = 3) -> list:
    """7th Executive Alerts source (Task 04, Section 18) - employee HR
    documents nearing/past a real expiry_date, same shape/pattern as
    company_profile.py's document alerts."""
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
            "category": "employee_document", "severity": severity, "title": row.get("title") or row.get("file_name"),
            "amount": None, "due_date": expiry_date, "days_overdue": max(0, -days_to_due),
            "related_id": row.get("employee_id"), "related_type": "employee", "quick_action": "view_employee",
        })
    return alerts
