from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.database import Base, SessionLocal, engine

router = APIRouter(prefix="/api/auth", tags=["Authorization"])

ROLE_LABELS = {
    "admin": "Administrator",
    "accountant": "Accountant",
    "sales": "Sales",
    "warehouse": "Warehouse",
    "viewer": "Read only",
    "user": "Legacy read only",
}

ROLE_CAPABILITIES = {
    "admin": {"*"},
    "accountant": {
        "customers.write",
        "invoices.write",
        "transactions.write",
        "expenses.write",
        "accounting.write",
        "reports.read",
    },
    "sales": {
        "customers.write",
        "invoices.write",
        "transactions.write",
        "reports.read",
    },
    "warehouse": {
        "products.write",
        "inventory.write",
        "reports.read",
    },
    "viewer": {"read"},
    "user": {"read"},
}

ALL_ROLES = {"admin", "accountant", "sales", "warehouse", "viewer", "user"}


class CustomRole(Base):
    """A named role beyond the 5 built-in ones. Deliberately NOT a wholly
    independent permission set: a custom role always inherits the exact
    path-prefix rules of one existing base_role (see resolve_base_role),
    so it can never grant more than an already-audited built-in role does.
    The one thing it can add on top is record-level scoping - restricting
    a role to only the customers assigned to that user (assigned_rep_id,
    see main.py's list_customers) - which is the specific "record-level
    permission" gap the product gap-analysis flagged, without touching the
    static READ_RULES/MUTATION_RULES tables that guard every other endpoint."""
    __tablename__ = "custom_roles"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    label = Column(String, nullable=False)
    base_role = Column(String, nullable=False)
    restrict_customers_to_own = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


CustomRole.__table__.create(bind=engine, checkfirst=True)


def _get_custom_role(code: str):
    db = SessionLocal()
    try:
        row = db.query(CustomRole).filter(CustomRole.code == code).first()
        if not row:
            return None
        return {
            "code": row.code,
            "label": row.label,
            "base_role": row.base_role,
            "restrict_customers_to_own": row.restrict_customers_to_own,
        }
    finally:
        db.close()

READ_RULES = (
    ("/users", {"admin"}),
    ("/api/companies", {"admin"}),
    ("/settings", {"admin"}),
    ("/api/audit", {"admin"}),
    ("/api/backups", {"admin"}),
    ("/api/system", {"admin"}),
    ("/backup", {"admin"}),
    ("/api/accounting", {"admin", "accountant", "viewer", "user"}),
    ("/expenses", {"admin", "accountant", "viewer", "user"}),
    ("/api/finance", {"admin", "accountant", "viewer", "user"}),
    ("/api/ai-bi", {"admin", "accountant", "viewer", "user"}),
    ("/api/message-templates", {"admin", "accountant", "sales"}),
    # Everyday operational data stays readable by any authenticated role;
    # listed explicitly so the default below can safely stay deny-by-default.
    ("/customers", ALL_ROLES),
    ("/products", ALL_ROLES),
    ("/product-categories", ALL_ROLES),
    ("/invoices", ALL_ROLES),
    ("/transactions", ALL_ROLES),
    ("/stock-movements", ALL_ROLES),
    # Read access is broad - any role building an invoice needs to list
    # warehouses to pick one for a line item; management (create/transfer/
    # deactivate) is still gated to admin/warehouse below.
    ("/api/warehouses", ALL_ROLES),
    ("/reports", ALL_ROLES),
    ("/export", ALL_ROLES),
    ("/print", ALL_ROLES),
    ("/activity", ALL_ROLES),
    ("/dashboard-stats", ALL_ROLES),
    ("/me", ALL_ROLES),
    ("/roles", ALL_ROLES),
    ("/designer", ALL_ROLES),
    ("/finance", ALL_ROLES),
    ("/api/auth", ALL_ROLES),
    ("/api/crm", ALL_ROLES),
    ("/crm/pipeline", ALL_ROLES),
    ("/api/smart-inventory", ALL_ROLES),
    ("/api/online-commerce", ALL_ROLES),
    ("/api/campaign-delivery", ALL_ROLES),
    ("/api/change-requests", ALL_ROLES),
    ("/api/storefront-sync", ALL_ROLES),
    ("/api/data-import", ALL_ROLES),
    ("/api/inbound-voice", ALL_ROLES),
    ("/api/financial-policy", ALL_ROLES),
    # The customer-facing GET paths (/me, /invoices, /ledger) never reach
    # this check - they're public and verify their own portal token - so
    # this only ever governs the staff-only status/manage endpoints below.
    ("/api/customer-portal", {"admin", "accountant", "sales"}),
    # Same reasoning as the customer portal above: /me, /invoices, /ledger
    # are public and self-verify their own supplier portal token.
    ("/api/supplier-portal", {"admin", "accountant", "warehouse"}),
    ("/api/recurring-invoices", {"admin", "accountant", "sales"}),
    ("/api/payment-reminders", {"admin", "accountant", "sales"}),
    # /api/payments/session(/simulate) and /callback are public and
    # self-verify by session authority; this governs the staff-triggered
    # "generate/share a payment link" endpoints.
    ("/api/payments", {"admin", "accountant", "sales"}),
    # Admin-only in practice via _require_admin inside the route itself
    # (holds provider credentials) - outer rule just needs to admit admin.
    ("/api/payment-providers", {"admin"}),
    # Static per-industry field definitions (Phase 2 dynamic invoice
    # fields) - read-only, needed by anyone who can create an invoice.
    ("/api/industry-fields", {"admin", "accountant", "sales"}),
    # Same reasoning: /api/catalog/view(/order) are public and self-verify
    # their own token, so this only governs the staff management endpoints.
    ("/api/catalog", {"admin", "accountant", "sales"}),
    # Any role that can build an invoice needs to be able to fetch a price
    # quote; tier management itself is still mutation-gated below.
    ("/api/pricing", ALL_ROLES),
    ("/api/einvoice", {"admin", "accountant"}),
    ("/api/document-ocr", ALL_ROLES),
    # Any role that can build an invoice or check stock needs to browse
    # purchase orders and batch/serial/expiry records; management is still
    # mutation-gated to admin/warehouse below.
    ("/api/purchase-orders", ALL_ROLES),
    ("/api/product-batches", ALL_ROLES),
    ("/api/report-delivery", {"admin", "accountant"}),
    # Non-admin-gated on purpose - see main.py's list_sales_reps docstring:
    # any signed-in user needs this to populate a customer-assignment dropdown.
    ("/api/sales-reps", ALL_ROLES),
    ("/api/field-visits", {"admin", "accountant", "sales"}),
    ("/api/invoice-payments", {"admin", "accountant"}),
    ("/api/approvals", {"admin", "accountant"}),
)

MUTATION_RULES = (
    # Operational users may create/submit requests; endpoint-level checks keep approve/reject admin-only.
    ("/api/change-requests", {"admin", "accountant", "sales", "warehouse", "viewer", "user"}),
    ("/api/field-visits", {"admin", "accountant", "sales"}),
    ("/logout", ALL_ROLES),
    ("/api/auth/totp", ALL_ROLES),
    ("/users", {"admin"}),
    ("/api/companies", {"admin"}),
    ("/settings", {"admin"}),
    ("/admin", {"admin"}),
    ("/api/audit", {"admin"}),
    ("/api/backups", {"admin"}),
    ("/api/system", {"admin"}),
    ("/backup", {"admin"}),
    ("/api/accounting/periods", {"admin"}),
    ("/api/accounting", {"admin", "accountant"}),
    ("/expenses", {"admin", "accountant"}),
    ("/transactions", {"admin", "accountant", "sales"}),
    ("/invoices", {"admin", "accountant", "sales"}),
    ("/customers", {"admin", "accountant", "sales"}),
    ("/api/customer-portal", {"admin", "accountant", "sales"}),
    ("/api/supplier-portal", {"admin", "accountant", "warehouse"}),
    ("/api/recurring-invoices", {"admin", "accountant", "sales"}),
    # /api/payments/session(/simulate) and /callback are public and
    # self-verify by session authority, so this only governs the
    # staff-triggered "generate a payment link" endpoint below.
    ("/api/payments", {"admin", "accountant", "sales"}),
    ("/api/payment-providers", {"admin"}),
    ("/api/payment-reminders", {"admin", "accountant", "sales"}),
    # Endpoint-level checks (_require_admin for the editor allowlist itself,
    # _require_template_editor for the templates) do the real gating here -
    # the outer rule only needs to admit roles that could plausibly be
    # granted edit access, matching /api/change-requests' own pattern above.
    ("/api/message-templates", {"admin", "accountant", "sales"}),
    ("/api/catalog", {"admin", "accountant", "sales"}),
    ("/api/pricing", {"admin", "accountant", "warehouse"}),
    ("/api/crm", {"admin", "sales"}),
    ("/crm/pipeline", {"admin", "sales"}),
    ("/products", {"admin", "warehouse"}),
    ("/product-categories", {"admin", "warehouse"}),
    ("/stock-movements", {"admin", "warehouse"}),
    ("/api/smart-inventory", {"admin", "warehouse"}),
    ("/warehouse", {"admin", "warehouse"}),
    ("/api/warehouses", {"admin", "warehouse"}),
    ("/api/purchase-orders", {"admin", "warehouse"}),
    ("/api/product-batches", {"admin", "warehouse"}),
    # Coarse gate only - preview (products) vs. apply/rollback (always
    # admin) is differentiated inside data_import.py's own per-endpoint
    # check (_require_preview_role/_require_admin), since this prefix-based
    # table can't distinguish sub-paths under the same POST prefix.
    ("/api/data-import", {"admin", "accountant", "warehouse"}),
    ("/export/customers", {"admin", "accountant", "sales"}),
    ("/export/import-report", {"admin", "accountant", "warehouse"}),
    ("/api/report-delivery", {"admin", "accountant"}),
    ("/api/einvoice", {"admin", "accountant"}),
    ("/api/document-ocr", {"admin", "accountant", "sales", "warehouse"}),
    ("/api/finance", {"admin", "accountant"}),
    ("/finance", {"admin", "accountant"}),
    ("/api/ai-bi", {"admin", "accountant"}),
    ("/designer", {"admin", "accountant", "sales"}),
    ("/api/invoice-payments", {"admin", "accountant"}),
    ("/api/approvals", {"admin", "accountant"}),
)


def normalize_role(role):
    value = str(role or "viewer").strip().lower()
    if value in ROLE_LABELS:
        return value
    if _get_custom_role(value):
        return value
    return "viewer"


def resolve_base_role(role: str) -> str:
    """Resolves an already-normalized role (built-in or custom) to the
    built-in role whose path-prefix rules should apply."""
    if role in ALL_ROLES:
        return role
    custom = _get_custom_role(role)
    return custom["base_role"] if custom else "viewer"


def is_valid_role_code(code: str) -> bool:
    """True for a built-in role or an existing custom role code - used to
    validate the `role` field when creating/updating a user account."""
    value = str(code or "").strip().lower()
    return value in ROLE_LABELS or bool(_get_custom_role(value))


def role_label(role) -> str:
    value = normalize_role(role)
    if value in ROLE_LABELS:
        return ROLE_LABELS[value]
    custom = _get_custom_role(value)
    return custom["label"] if custom else value


def customer_scope_for_role(role) -> Optional[dict]:
    """Returns {"restrict_to_own": True} when this role should only see
    customers assigned to the current user; None for unrestricted roles."""
    value = normalize_role(role)
    if value in ALL_ROLES:
        return None
    custom = _get_custom_role(value)
    if custom and custom["restrict_customers_to_own"]:
        return {"restrict_to_own": True}
    return None


def is_authorized(role, method, path, is_super_admin: bool = False):
    role = resolve_base_role(normalize_role(role))
    method = method.upper()

    if role == "admin" or is_super_admin:
        return True

    if method in {"GET", "HEAD", "OPTIONS"}:
        for prefix, allowed_roles in READ_RULES:
            if path == prefix or path.startswith(f"{prefix}/"):
                return role in allowed_roles
        # New read endpoints stay closed until explicitly classified above,
        # matching the deny-by-default behavior already used for mutations.
        return False

    for prefix, allowed_roles in MUTATION_RULES:
        if path == prefix or path.startswith(f"{prefix}/"):
            return role in allowed_roles

    # New mutation endpoints stay administrator-only until explicitly classified.
    return False


def role_payload(role):
    normalized = normalize_role(role)
    base = resolve_base_role(normalized)
    capabilities = sorted(ROLE_CAPABILITIES.get(base, {"read"}))
    return {
        "role": normalized,
        "label": role_label(normalized),
        "capabilities": capabilities,
        "can_mutate": "*" in capabilities or any(
            capability.endswith(".write") for capability in capabilities
        ),
    }


@router.get("/permissions")
def current_permissions(request: Request):
    auth = getattr(request.state, "auth", {})
    return role_payload(auth.get("role"))


@router.get("/roles")
def list_roles(request: Request):
    auth = getattr(request.state, "auth", {})
    if normalize_role(auth.get("role")) != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Administrator access required")
    return [
        {
            "code": role,
            "label": label,
            "capabilities": sorted(ROLE_CAPABILITIES[role]),
        }
        for role, label in ROLE_LABELS.items()
        if role != "user"
    ]


class CustomRoleCreate(BaseModel):
    code: str
    label: str
    base_role: str
    restrict_customers_to_own: bool = False


def _require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if normalize_role(auth.get("role")) != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")


@router.get("/custom-roles")
def list_custom_roles(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        rows = db.query(CustomRole).order_by(CustomRole.id.desc()).all()
        return [
            {
                "id": row.id,
                "code": row.code,
                "label": row.label,
                "base_role": row.base_role,
                "restrict_customers_to_own": row.restrict_customers_to_own,
                "created_at": row.created_at,
            }
            for row in rows
        ]
    finally:
        db.close()


@router.post("/custom-roles")
def create_custom_role(data: CustomRoleCreate, request: Request):
    _require_admin(request)
    code = data.code.strip().lower().replace(" ", "_")
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    if code in ALL_ROLES:
        raise HTTPException(status_code=400, detail="code must not match a built-in role")
    if data.base_role not in ALL_ROLES or data.base_role in {"admin"}:
        raise HTTPException(
            status_code=400,
            detail="base_role must be one of: accountant, sales, warehouse, viewer, user "
                    "(a custom role cannot be based on admin, to avoid accidentally granting full access)",
        )
    if not data.label.strip():
        raise HTTPException(status_code=400, detail="label is required")

    db = SessionLocal()
    try:
        if db.query(CustomRole).filter(CustomRole.code == code).first():
            raise HTTPException(status_code=409, detail="A custom role with this code already exists")
        role = CustomRole(
            code=code,
            label=data.label.strip(),
            base_role=data.base_role,
            restrict_customers_to_own=data.restrict_customers_to_own,
        )
        db.add(role)
        db.commit()
        db.refresh(role)
        return {"status": "created", "id": role.id, "code": role.code}
    finally:
        db.close()


@router.delete("/custom-roles/{role_id}")
def delete_custom_role(role_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        role = db.query(CustomRole).filter(CustomRole.id == role_id).first()
        if not role:
            raise HTTPException(status_code=404, detail="Custom role not found")
        from app.models.user import User
        in_use = db.query(User).filter(User.role == role.code).first()
        if in_use:
            raise HTTPException(status_code=409, detail="Cannot delete a custom role while a user still has it assigned")
        db.delete(role)
        db.commit()
        return {"status": "deleted", "id": role_id}
    finally:
        db.close()
