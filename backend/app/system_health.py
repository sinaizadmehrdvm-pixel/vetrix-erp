import os
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.audit import verify_audit_chain
from app.backup.auto_backup import (
    backup_directory,
    list_database_backups,
    verify_database_backup,
)
from app.database import engine

router = APIRouter(prefix="/api/system", tags=["System Health"])

REQUIRED_TABLES = {
    "users",
    "customers",
    "products",
    "invoices",
    "invoice_items",
    "accounting_vouchers",
    "accounting_voucher_lines",
    "fiscal_periods",
    "audit_events",
}


def _require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")


def _check(checks, check_id, category, status, label, message, value=None):
    checks.append({
        "id": check_id,
        "category": category,
        "status": status,
        "label": label,
        "message": message,
        "value": value,
    })


def build_system_health():
    checks = []
    metrics = {}

    try:
        with engine.begin() as conn:
            quick = conn.execute(text("PRAGMA quick_check")).scalar()
            _check(
                checks,
                "database_integrity",
                "database",
                "pass" if quick == "ok" else "fail",
                "Database integrity",
                "SQLite quick_check passed" if quick == "ok" else str(quick),
                quick,
            )

            tables = {
                row[0]
                for row in conn.execute(text("""
                    SELECT name FROM sqlite_master WHERE type='table'
                """)).fetchall()
            }
            missing = sorted(REQUIRED_TABLES - tables)
            _check(
                checks,
                "required_tables",
                "database",
                "pass" if not missing else "fail",
                "Required schema",
                "All required tables exist" if not missing else f"Missing: {', '.join(missing)}",
                len(missing),
            )

            if {"accounting_vouchers", "accounting_voucher_lines"} <= tables:
                voucher_count = conn.execute(
                    text("SELECT COUNT(*) FROM accounting_vouchers")
                ).scalar() or 0
                posted_count = conn.execute(text("""
                    SELECT COUNT(*) FROM accounting_vouchers
                    WHERE status='posted'
                """)).scalar() or 0
                unbalanced = conn.execute(text("""
                    SELECT COUNT(*) FROM accounting_vouchers
                    WHERE status='posted'
                      AND ABS(COALESCE(total_debit, 0) - COALESCE(total_credit, 0)) >= 0.01
                """)).scalar() or 0
                orphan_lines = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM accounting_voucher_lines l
                    LEFT JOIN accounting_vouchers v ON v.id=l.voucher_id
                    WHERE v.id IS NULL
                """)).scalar() or 0
                empty_posted = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM accounting_vouchers v
                    LEFT JOIN accounting_voucher_lines l ON l.voucher_id=v.id
                    WHERE v.status='posted'
                    GROUP BY v.id
                    HAVING COUNT(l.id)=0
                """)).fetchall()
                metrics.update({
                    "vouchers": int(voucher_count),
                    "posted_vouchers": int(posted_count),
                    "unbalanced_vouchers": int(unbalanced),
                    "orphan_voucher_lines": int(orphan_lines),
                })
                _check(
                    checks,
                    "general_ledger_balance",
                    "accounting",
                    "pass" if not unbalanced else "fail",
                    "General ledger balance",
                    "All posted voucher headers are balanced"
                    if not unbalanced
                    else f"{unbalanced} posted voucher(s) are unbalanced",
                    int(unbalanced),
                )
                structural_issues = int(orphan_lines) + len(empty_posted)
                _check(
                    checks,
                    "voucher_structure",
                    "accounting",
                    "pass" if not structural_issues else "fail",
                    "Voucher structure",
                    "No orphan lines or empty posted vouchers"
                    if not structural_issues
                    else f"{structural_issues} structural issue(s) found",
                    structural_issues,
                )

            if {"accounting_vouchers", "fiscal_periods"} <= tables:
                unassigned = conn.execute(text("""
                    SELECT COUNT(*) FROM accounting_vouchers
                    WHERE fiscal_period_id IS NULL OR period_voucher_no IS NULL
                """)).scalar() or 0
                closed_violations = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM accounting_vouchers v
                    JOIN fiscal_periods p ON p.id=v.fiscal_period_id
                    WHERE p.status='closed' AND v.status!='posted'
                """)).scalar() or 0
                _check(
                    checks,
                    "fiscal_assignment",
                    "accounting",
                    "pass" if not unassigned else "fail",
                    "Fiscal period assignment",
                    "Every voucher belongs to a numbered fiscal period"
                    if not unassigned
                    else f"{unassigned} voucher(s) are missing period data",
                    int(unassigned),
                )
                _check(
                    checks,
                    "closed_period_consistency",
                    "accounting",
                    "pass" if not closed_violations else "fail",
                    "Closed-period consistency",
                    "Closed periods contain only posted vouchers"
                    if not closed_violations
                    else f"{closed_violations} closed-period violation(s)",
                    int(closed_violations),
                )

            if "products" in tables:
                negative_stock = conn.execute(text("""
                    SELECT COUNT(*) FROM products WHERE COALESCE(stock, 0) < 0
                """)).scalar() or 0
                metrics["negative_stock_products"] = int(negative_stock)
                _check(
                    checks,
                    "negative_inventory",
                    "inventory",
                    "pass" if not negative_stock else "fail",
                    "Inventory quantities",
                    "No product has negative stock"
                    if not negative_stock
                    else f"{negative_stock} product(s) have negative stock",
                    int(negative_stock),
                )

            audit = verify_audit_chain(conn)
            metrics["audit_events"] = int(audit["events_checked"])
            _check(
                checks,
                "audit_chain",
                "security",
                "pass" if audit["valid"] else "fail",
                "Audit hash chain",
                "Audit history is cryptographically consistent"
                if audit["valid"]
                else f"Chain breaks at event {audit['broken_event_id']}",
                audit["events_checked"],
            )
    except Exception as error:
        _check(
            checks,
            "database_access",
            "database",
            "fail",
            "Database access",
            str(error),
        )

    try:
        backups = list_database_backups(verify=False)
        metrics["backups"] = len(backups)
        if not backups:
            _check(
                checks,
                "backup_availability",
                "recovery",
                "warn",
                "Backup availability",
                "No backup exists yet",
                0,
            )
        else:
            latest = verify_database_backup(backups[0]["filename"])
            latest_time = datetime.fromisoformat(latest["created_at"])
            age_hours = (
                datetime.now(timezone.utc) - latest_time
            ).total_seconds() / 3600
            metrics["latest_backup_age_hours"] = round(age_hours, 2)
            status = "pass" if latest["valid"] else "fail"
            if latest["valid"] and age_hours > 48:
                status = "warn"
            _check(
                checks,
                "backup_availability",
                "recovery",
                status,
                "Latest backup",
                "Latest backup is valid and recent"
                if status == "pass"
                else (
                    f"Latest backup is {age_hours:.1f} hours old"
                    if latest["valid"]
                    else "Latest backup failed integrity verification"
                ),
                latest["filename"],
            )

        disk = shutil.disk_usage(backup_directory())
        free_percent = (disk.free / disk.total * 100) if disk.total else 0
        metrics["backup_disk_free_bytes"] = disk.free
        _check(
            checks,
            "backup_disk_space",
            "recovery",
            "pass" if disk.free >= 1024**3 and free_percent >= 10 else "warn",
            "Backup disk capacity",
            f"{free_percent:.1f}% free",
            disk.free,
        )
    except Exception as error:
        _check(
            checks,
            "backup_access",
            "recovery",
            "fail",
            "Backup storage",
            str(error),
        )

    environment = os.getenv("VETRIX_ENV", "development").strip().lower()
    jwt_configured = bool(os.getenv("VETRIX_JWT_SECRET", "").strip())
    if environment == "production" and not jwt_configured:
        security_status = "fail"
        security_message = "Production JWT secret is not configured"
    elif jwt_configured:
        security_status = "pass"
        security_message = "JWT secret is explicitly configured"
    else:
        security_status = "warn"
        security_message = "Development fallback JWT secret is active"
    _check(
        checks,
        "jwt_configuration",
        "security",
        security_status,
        "JWT configuration",
        security_message,
    )

    origins = os.getenv("VETRIX_ALLOWED_ORIGINS", "")
    wildcard = "*" in {item.strip() for item in origins.split(",")}
    _check(
        checks,
        "cors_configuration",
        "security",
        "warn" if wildcard else "pass",
        "CORS configuration",
        "Wildcard CORS origin is configured"
        if wildcard
        else "No wildcard CORS origin is configured",
    )

    failures = sum(1 for item in checks if item["status"] == "fail")
    warnings = sum(1 for item in checks if item["status"] == "warn")
    overall = "critical" if failures else "degraded" if warnings else "healthy"
    return {
        "status": overall,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total": len(checks),
            "passed": sum(1 for item in checks if item["status"] == "pass"),
            "warnings": warnings,
            "failures": failures,
        },
        "metrics": metrics,
        "checks": checks,
    }


@router.get("/health")
def system_health(request: Request):
    _require_admin(request)
    return build_system_health()


@router.get("/readiness")
def system_readiness(request: Request):
    _require_admin(request)
    payload = build_system_health()
    return JSONResponse(
        status_code=503 if payload["status"] == "critical" else 200,
        content=payload,
    )
