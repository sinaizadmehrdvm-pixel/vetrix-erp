from fastapi import APIRouter, Request

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

READ_RULES = (
    ("/users", {"admin"}),
    ("/settings", {"admin"}),
    ("/api/audit", {"admin"}),
    ("/api/backups", {"admin"}),
    ("/api/system", {"admin"}),
    ("/backup", {"admin"}),
    ("/api/accounting", {"admin", "accountant", "viewer", "user"}),
    ("/expenses", {"admin", "accountant", "viewer", "user"}),
    ("/api/finance", {"admin", "accountant", "viewer", "user"}),
    ("/api/ai-bi", {"admin", "accountant", "viewer", "user"}),
    # Everyday operational data stays readable by any authenticated role;
    # listed explicitly so the default below can safely stay deny-by-default.
    ("/customers", ALL_ROLES),
    ("/products", ALL_ROLES),
    ("/product-categories", ALL_ROLES),
    ("/invoices", ALL_ROLES),
    ("/transactions", ALL_ROLES),
    ("/stock-movements", ALL_ROLES),
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
    # Same reasoning: /api/catalog/view(/order) are public and self-verify
    # their own token, so this only governs the staff management endpoints.
    ("/api/catalog", {"admin", "accountant", "sales"}),
    # Any role that can build an invoice needs to be able to fetch a price
    # quote; tier management itself is still mutation-gated below.
    ("/api/pricing", ALL_ROLES),
)

MUTATION_RULES = (
    # Operational users may create/submit requests; endpoint-level checks keep approve/reject admin-only.
    ("/api/change-requests", {"admin", "accountant", "sales", "warehouse", "viewer", "user"}),
    ("/logout", ALL_ROLES),
    ("/api/auth/totp", ALL_ROLES),
    ("/users", {"admin"}),
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
    ("/api/catalog", {"admin", "accountant", "sales"}),
    ("/api/pricing", {"admin", "accountant", "warehouse"}),
    ("/api/crm", {"admin", "sales"}),
    ("/products", {"admin", "warehouse"}),
    ("/product-categories", {"admin", "warehouse"}),
    ("/stock-movements", {"admin", "warehouse"}),
    ("/api/smart-inventory", {"admin", "warehouse"}),
    ("/warehouse", {"admin", "warehouse"}),
    ("/api/finance", {"admin", "accountant"}),
    ("/api/ai-bi", {"admin", "accountant"}),
    ("/designer", {"admin", "accountant", "sales"}),
)


def normalize_role(role):
    value = str(role or "viewer").strip().lower()
    return value if value in ROLE_LABELS else "viewer"


def is_authorized(role, method, path):
    role = normalize_role(role)
    method = method.upper()

    if role == "admin":
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
    capabilities = sorted(ROLE_CAPABILITIES.get(normalized, {"read"}))
    return {
        "role": normalized,
        "label": ROLE_LABELS[normalized],
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
