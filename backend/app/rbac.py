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
)

MUTATION_RULES = (
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
        return True

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
