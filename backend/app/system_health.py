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


def _t(language, en, fa, ar, tr):
    return {"en": en, "fa": fa, "ar": ar, "tr": tr}.get(language, en)


def _check(checks, check_id, category, status, label, message, value=None):
    checks.append({
        "id": check_id,
        "category": category,
        "status": status,
        "label": label,
        "message": message,
        "value": value,
    })


def build_system_health(language="en"):
    checks = []
    metrics = {}
    t = lambda en, fa, ar, tr: _t(language, en, fa, ar, tr)  # noqa: E731

    try:
        with engine.begin() as conn:
            quick = conn.execute(text("PRAGMA quick_check")).scalar()
            _check(
                checks,
                "database_integrity",
                "database",
                "pass" if quick == "ok" else "fail",
                t("Database integrity", "سلامت دیتابیس", "سلامة قاعدة البيانات", "Veritabanı bütünlüğü"),
                t("SQLite quick_check passed", "بررسی quick_check دیتابیس موفق بود", "نجح فحص quick_check لقاعدة البيانات", "Veritabanı quick_check kontrolü başarılı")
                if quick == "ok" else str(quick),
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
                t("Required schema", "ساختار جداول موردنیاز", "المخطط المطلوب", "Gerekli şema"),
                t("All required tables exist", "همه جداول موردنیاز موجود است", "جميع الجداول المطلوبة موجودة", "Gerekli tüm tablolar mevcut")
                if not missing
                else t(f"Missing: {', '.join(missing)}", f"جداول مفقود: {', '.join(missing)}", f"جداول ناقصة: {', '.join(missing)}", f"Eksik tablolar: {', '.join(missing)}"),
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
                    t("General ledger balance", "تراز دفتر کل", "توازن دفتر الأستاذ", "Büyük defter bakiyesi"),
                    t("All posted voucher headers are balanced", "همه سرفصل‌های اسناد قطعی متوازن هستند", "جميع رؤوس السندات المرحّلة متوازنة", "Tüm kesinleşmiş fiş başlıkları dengeli")
                    if not unbalanced
                    else t(f"{unbalanced} posted voucher(s) are unbalanced", f"{unbalanced} سند قطعی نامتوازن است", f"{unbalanced} سند مرحّل غير متوازن", f"{unbalanced} kesinleşmiş fiş dengesiz"),
                    int(unbalanced),
                )
                structural_issues = int(orphan_lines) + len(empty_posted)
                _check(
                    checks,
                    "voucher_structure",
                    "accounting",
                    "pass" if not structural_issues else "fail",
                    t("Voucher structure", "ساختار اسناد", "بنية السندات", "Fiş yapısı"),
                    t("No orphan lines or empty posted vouchers", "هیچ ردیف یتیم یا سند قطعی خالی وجود ندارد", "لا توجد بنود يتيمة أو سندات مرحّلة فارغة", "Sahipsiz satır veya boş kesinleşmiş fiş yok")
                    if not structural_issues
                    else t(f"{structural_issues} structural issue(s) found", f"{structural_issues} مشکل ساختاری یافت شد", f"تم العثور على {structural_issues} مشكلة بنيوية", f"{structural_issues} yapısal sorun bulundu"),
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
                    t("Fiscal period assignment", "تخصیص دوره مالی", "تخصيص الفترة المالية", "Mali dönem ataması"),
                    t("Every voucher belongs to a numbered fiscal period", "همه اسناد به یک دوره مالی شماره‌دار تعلق دارند", "ينتمي كل سند إلى فترة مالية مرقّمة", "Her fiş numaralı bir mali döneme ait")
                    if not unassigned
                    else t(f"{unassigned} voucher(s) are missing period data", f"{unassigned} سند فاقد اطلاعات دوره مالی است", f"{unassigned} سند بلا بيانات فترة مالية", f"{unassigned} fişte dönem verisi eksik"),
                    int(unassigned),
                )
                _check(
                    checks,
                    "closed_period_consistency",
                    "accounting",
                    "pass" if not closed_violations else "fail",
                    t("Closed-period consistency", "یکپارچگی دوره‌های بسته‌شده", "اتساق الفترات المغلقة", "Kapalı dönem tutarlılığı"),
                    t("Closed periods contain only posted vouchers", "دوره‌های بسته‌شده فقط شامل اسناد قطعی هستند", "الفترات المغلقة تحتوي فقط على سندات مرحّلة", "Kapalı dönemler yalnızca kesinleşmiş fişler içeriyor")
                    if not closed_violations
                    else t(f"{closed_violations} closed-period violation(s)", f"{closed_violations} مورد نقض دوره بسته‌شده", f"{closed_violations} مخالفة في فترة مغلقة", f"{closed_violations} kapalı dönem ihlali"),
                    int(closed_violations),
                )

            if "products" in tables:
                negative_stock = conn.execute(text("""
                    SELECT COUNT(*) FROM products WHERE COALESCE(stock, 0) < 0
                """)).scalar() or 0
                unvalued_stock = conn.execute(text("""
                    SELECT COUNT(*) FROM products
                    WHERE COALESCE(stock, 0) > 0
                      AND COALESCE(buy_price, 0) <= 0
                """)).scalar() or 0
                metrics["negative_stock_products"] = int(negative_stock)
                metrics["unvalued_stock_products"] = int(unvalued_stock)
                _check(
                    checks,
                    "negative_inventory",
                    "inventory",
                    "pass" if not negative_stock else "fail",
                    t("Inventory quantities", "موجودی کالا", "كميات المخزون", "Envanter miktarları"),
                    t("No product has negative stock", "هیچ کالایی موجودی منفی ندارد", "لا يوجد منتج بمخزون سالب", "Hiçbir üründe negatif stok yok")
                    if not negative_stock
                    else t(f"{negative_stock} product(s) have negative stock", f"{negative_stock} کالا موجودی منفی دارد", f"{negative_stock} منتج لديه مخزون سالب", f"{negative_stock} üründe negatif stok var"),
                    int(negative_stock),
                )
                _check(
                    checks,
                    "inventory_valuation",
                    "inventory",
                    "pass" if not unvalued_stock else "warn",
                    t("Inventory valuation", "ارزش‌گذاری موجودی", "تقييم المخزون", "Envanter değerlemesi"),
                    t("All stocked products have a purchase cost", "همه کالاهای موجود قیمت خرید دارند", "جميع المنتجات المخزنة لها تكلفة شراء", "Stoktaki tüm ürünlerin alış maliyeti var")
                    if not unvalued_stock
                    else t(f"{unvalued_stock} stocked product(s) have zero cost", f"{unvalued_stock} کالای موجود قیمت خرید صفر دارد", f"{unvalued_stock} منتج مخزّن بتكلفة صفر", f"{unvalued_stock} üründe maliyet sıfır"),
                    int(unvalued_stock),
                )

            audit = verify_audit_chain(conn)
            metrics["audit_events"] = int(audit["events_checked"])
            _check(
                checks,
                "audit_chain",
                "security",
                "pass" if audit["valid"] else "fail",
                t("Audit hash chain", "زنجیره هش ممیزی", "سلسلة تجزئة التدقيق", "Denetim hash zinciri"),
                t("Audit history is cryptographically consistent", "تاریخچه ممیزی از نظر رمزنگاری یکپارچه است", "سجل التدقيق متسق تشفيريًا", "Denetim geçmişi kriptografik olarak tutarlı")
                if audit["valid"]
                else t(f"Chain breaks at event {audit['broken_event_id']}", f"زنجیره در رویداد {audit['broken_event_id']} شکسته است", f"تنقطع السلسلة عند الحدث {audit['broken_event_id']}", f"Zincir {audit['broken_event_id']} olayında kırılıyor"),
                audit["events_checked"],
            )
    except Exception as error:
        _check(
            checks,
            "database_access",
            "database",
            "fail",
            t("Database access", "دسترسی به دیتابیس", "الوصول لقاعدة البيانات", "Veritabanı erişimi"),
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
                t("Backup availability", "در دسترس بودن بکاپ", "توفر النسخة الاحتياطية", "Yedek kullanılabilirliği"),
                t("No backup exists yet", "هنوز بکاپی وجود ندارد", "لا توجد نسخة احتياطية بعد", "Henüz yedek yok"),
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
            if status == "pass":
                latest_message = t("Latest backup is valid and recent", "آخرین بکاپ معتبر و به‌روز است", "أحدث نسخة احتياطية صالحة وحديثة", "Son yedek geçerli ve güncel")
            elif latest["valid"]:
                latest_message = t(f"Latest backup is {age_hours:.1f} hours old", f"آخرین بکاپ {age_hours:.1f} ساعت قدمت دارد", f"عمر أحدث نسخة احتياطية {age_hours:.1f} ساعة", f"Son yedek {age_hours:.1f} saat önce alındı")
            else:
                latest_message = t("Latest backup failed integrity verification", "بررسی یکپارچگی آخرین بکاپ ناموفق بود", "فشل التحقق من سلامة أحدث نسخة احتياطية", "Son yedeğin bütünlük doğrulaması başarısız")
            _check(
                checks,
                "backup_availability",
                "recovery",
                status,
                t("Latest backup", "آخرین بکاپ", "أحدث نسخة احتياطية", "Son yedek"),
                latest_message,
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
            t("Backup disk capacity", "فضای دیسک بکاپ", "سعة قرص النسخ الاحتياطي", "Yedek disk kapasitesi"),
            t(f"{free_percent:.1f}% free", f"{free_percent:.1f}٪ آزاد", f"{free_percent:.1f}٪ متاح", f"%{free_percent:.1f} boş"),
            disk.free,
        )
    except Exception as error:
        _check(
            checks,
            "backup_access",
            "recovery",
            "fail",
            t("Backup storage", "فضای ذخیره‌سازی بکاپ", "تخزين النسخ الاحتياطي", "Yedekleme depolama"),
            str(error),
        )

    environment = os.getenv("VETRIX_ENV", "development").strip().lower()
    jwt_configured = bool(os.getenv("VETRIX_JWT_SECRET", "").strip())
    if environment == "production" and not jwt_configured:
        security_status = "fail"
        security_message = t("Production JWT secret is not configured", "کلید محرمانه JWT محیط تولید تنظیم نشده است", "لم يتم تكوين سر JWT للإنتاج", "Üretim JWT gizli anahtarı yapılandırılmamış")
    elif jwt_configured:
        security_status = "pass"
        security_message = t("JWT secret is explicitly configured", "کلید محرمانه JWT به‌صراحت تنظیم شده است", "تم تكوين سر JWT بشكل صريح", "JWT gizli anahtarı açıkça yapılandırılmış")
    else:
        security_status = "warn"
        security_message = t("Development fallback JWT secret is active", "کلید محرمانه JWT پیش‌فرض توسعه فعال است", "سر JWT الاحتياطي للتطوير نشط", "Geliştirme yedek JWT gizli anahtarı etkin")
    _check(
        checks,
        "jwt_configuration",
        "security",
        security_status,
        t("JWT configuration", "پیکربندی JWT", "إعداد JWT", "JWT yapılandırması"),
        security_message,
    )

    origins = os.getenv("VETRIX_ALLOWED_ORIGINS", "")
    wildcard = "*" in {item.strip() for item in origins.split(",")}
    _check(
        checks,
        "cors_configuration",
        "security",
        "warn" if wildcard else "pass",
        t("CORS configuration", "پیکربندی CORS", "إعداد CORS", "CORS yapılandırması"),
        t("Wildcard CORS origin is configured", "خاستگاه CORS به‌صورت عام (*) تنظیم شده است", "تم تكوين مصدر CORS عام (*)", "Joker CORS kaynağı yapılandırılmış")
        if wildcard
        else t("No wildcard CORS origin is configured", "خاستگاه CORS عام (*) تنظیم نشده است", "لم يتم تكوين مصدر CORS عام", "Joker CORS kaynağı yapılandırılmamış"),
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
def system_health(request: Request, language: str = "en"):
    _require_admin(request)
    return build_system_health(language)


@router.get("/readiness")
def system_readiness(request: Request, language: str = "en"):
    _require_admin(request)
    payload = build_system_health(language)
    return JSONResponse(
        status_code=503 if payload["status"] == "critical" else 200,
        content=payload,
    )
