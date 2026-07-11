import os
import platform
import sys
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from app.database import engine
from app.system_health import build_system_health

router = APIRouter(prefix="/api/system", tags=["Release Readiness"])
APP_VERSION = "1.1.0"

RELEASE_TABLES = {
    "accounting_approval_requests",
    "accounting_budgets",
    "accounting_currencies",
    "accounting_exchange_rates",
    "bank_accounts",
    "fixed_assets",
    "treasury_cheques",
}

CRITICAL_ROUTES = [
    "/login",
    "/customers",
    "/products",
    "/invoices",
    "/transactions",
    "/api/accounting/entries",
    "/api/accounting/statements",
    "/api/accounting/tax",
    "/api/accounting/aging",
    "/api/accounting/bank-reconciliation/accounts",
    "/api/accounting/fixed-assets",
    "/api/accounting/budgets/dimensions",
    "/api/accounting/currencies",
    "/api/accounting/approvals",
    "/api/accounting/treasury/cheques",
]


def _require_admin(request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")


def build_release_preflight(app=None):
    health = build_system_health()
    environment = os.getenv("VETRIX_ENV", "development").strip().lower()
    blockers = []
    warnings = []

    if health["status"] == "critical":
        blockers.append("System health contains critical failures")
    if health["summary"]["warnings"]:
        warnings.append(
            f"{health['summary']['warnings']} system health warning(s) remain"
        )
    if environment != "production":
        warnings.append("VETRIX_ENV is not set to production")
    secret = os.getenv("VETRIX_JWT_SECRET", "").strip()
    if environment == "production" and len(secret) < 32:
        blockers.append("Production JWT secret must contain at least 32 characters")
    origins = [
        item.strip()
        for item in os.getenv("VETRIX_ALLOWED_ORIGINS", "").split(",")
        if item.strip()
    ]
    if environment == "production" and not origins:
        blockers.append("Production allowed origins are not configured")
    if "*" in origins:
        blockers.append("Wildcard CORS is not allowed for release")

    with engine.begin() as conn:
        from app.accounting.approvals import _ensure_schema as ensure_approvals
        from app.accounting.bank_reconciliation import _ensure_schema as ensure_banks
        from app.accounting.budgets import _ensure_schema as ensure_budgets
        from app.accounting.currencies import ensure_currency_schema
        from app.accounting.fixed_assets import _ensure_schema as ensure_assets
        from app.accounting.treasury import _ensure_schema as ensure_treasury
        for ensure in (ensure_approvals, ensure_banks, ensure_budgets, ensure_currency_schema, ensure_assets, ensure_treasury):
            ensure(conn)
        tables = {
            row[0]
            for row in conn.execute(text("""
                SELECT name FROM sqlite_master WHERE type='table'
            """)).fetchall()
        }
        missing_tables = sorted(RELEASE_TABLES - tables)
        if missing_tables:
            blockers.append(
                "Release modules are not initialized: "
                + ", ".join(missing_tables)
            )
        admin_count = conn.execute(text("""
            SELECT COUNT(*) FROM users WHERE role='admin'
        """)).scalar() or 0
        if admin_count < 1:
            blockers.append("At least one administrator is required")
        user_count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0

    registered_paths = []
    missing_routes = []
    if app is not None:
        registered_paths = sorted(app.openapi().get("paths", {}).keys())
        missing_routes = [
            route for route in CRITICAL_ROUTES if route not in registered_paths
        ]
        if missing_routes:
            blockers.append(
                "Critical API routes are missing: " + ", ".join(missing_routes)
            )

    return {
        "version": APP_VERSION,
        "release_ready": not blockers,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "environment": environment,
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "implementation": platform.python_implementation(),
            "executable": sys.executable,
        },
        "security": {
            "jwt_secret_configured": bool(secret),
            "jwt_secret_length_ok": len(secret) >= 32,
            "allowed_origins": origins,
        },
        "database": {
            "users": int(user_count),
            "administrators": int(admin_count),
            "missing_release_tables": missing_tables,
        },
        "api_contract": {
            "critical_route_count": len(CRITICAL_ROUTES),
            "missing_routes": missing_routes,
        },
        "health": {
            "status": health["status"],
            "summary": health["summary"],
        },
        "blockers": blockers,
        "warnings": warnings,
    }


@router.get("/release-preflight")
def release_preflight(request: Request):
    _require_admin(request)
    return build_release_preflight(request.app)


@router.get("/version")
def version():
    return {
        "name": "Vetrix ERP",
        "version": APP_VERSION,
        "environment": os.getenv("VETRIX_ENV", "development"),
    }
