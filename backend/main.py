from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import text, Column, Integer, String, Float, Boolean, Text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from typing import Optional, List
from datetime import datetime, timedelta
import os

from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.customer import Customer
from app.models.product import Product
from app.models.invoice import Invoice, InvoiceItem
from app.models.accounting_entry import AccountingEntry
from app.auth import (
    create_access_token,
    decode_access_token,
    extract_bearer_token,
    hash_password,
    is_public_request,
    password_needs_upgrade,
    verify_password,
)
from jwt import PyJWTError

from app.notifications.alerts import get_low_stock_alerts
from app.notifications.live import build_live_notifications
from app.ai.finance_ai import generate_financial_insight
from app.analytics.profit_engine import build_profit_analysis
from app.widgets.dashboard_widgets import get_recent_invoices, get_top_products
from app.export.pdf_export import build_invoice_pdf
from app.export.excel_export import build_invoice_excel
from app.export.localization import format_report_date, format_report_money, localized_digits
from app.timeline.activity import get_recent_activity
from app.backup.auto_backup import (
    create_database_backup,
    maybe_create_automatic_backup,
)
from app.backup.router import router as backup_router
from app.designer.routes import router as designer_router
from app.finance.routes import router as finance_router
from app.ai_bi.router import router as ai_bi_router
from app.crm.router import router as crm_router
from app.crm.sales_pipeline_routes import router as pipeline_router
from app.smart_inventory.routes import router as smart_inventory_router
from app.crm.files import router as crm_files_router
from app.accounting.router import router as accounting_router
from app.accounting.entries_router import router as accounting_entries_router
from app.accounting.periods import router as fiscal_periods_router
from app.accounting.statements import router as financial_statements_router
from app.accounting.closing import router as fiscal_closing_router
from app.accounting.tax import router as vat_accounting_router
from app.accounting.aging import router as aging_report_router
from app.accounting.bank_reconciliation import router as bank_reconciliation_router
from app.accounting.fixed_assets import router as fixed_assets_router
from app.accounting.budgets import router as budgets_router
from app.accounting.currencies import router as currencies_router
from app.accounting.approvals import router as approvals_router
from app.accounting.treasury import router as treasury_router
from app.release_preflight import router as release_preflight_router
from app.audit import record_audit_event, router as audit_router
from app.system_health import router as system_health_router
from app.online_commerce import router as online_commerce_router
from app.change_requests import router as change_requests_router
from app.financial_policy import financial_policy_values, router as financial_policy_router
from app.rbac import (
    ROLE_LABELS,
    is_authorized,
    normalize_role,
    router as rbac_router,
)
from app.accounting.reporting import build_profit_loss, customer_net_sales, net_period_total
from app.accounting.posting import (
    cash_account_for_method,
    delete_source_voucher,
    post_balanced_voucher,
    settlement_counterpart_account,
)
from app.accounting.integrity import (
    ALLOWED_INVOICE_TYPES,
    ALLOWED_PAYMENT_STATUSES,
    aggregate_item_quantities,
    calculate_invoice_totals,
    calculate_payment_status,
    expected_settlement_type,
    money as accounting_money,
)


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, default="Vetrix ERP")
    manager_name = Column(String, default="")
    phone = Column(String, default="")
    mobile = Column(String, default="")
    email = Column(String, default="")
    website = Column(String, default="")
    address = Column(Text, default="")
    national_id = Column(String, default="")
    economic_code = Column(String, default="")
    currency = Column(String, default="تومان")
    country_code = Column(String, default="IR")
    locale_code = Column(String, default="fa-IR")
    currency_code = Column(String, default="IRR")
    calendar_system = Column(String, default="persian")
    time_zone = Column(String, default="Asia/Tehran")
    first_day_of_week = Column(Integer, default=6)
    fiscal_year_start = Column(String, default="01-01-persian")
    tax_profile_version = Column(String, default="")
    tax_profile_verified_at = Column(String, default="")
    rounding_mode = Column(String, default="half_up")
    decimal_places = Column(Integer, default=0)
    measurement_system = Column(String, default="metric")
    tax_percent = Column(Float, default=10)
    discount_percent = Column(Float, default=0)
    fiscal_year = Column(String, default="")
    invoice_footer = Column(Text, default="")
    show_qr = Column(Boolean, default=True)
    show_barcode = Column(Boolean, default=True)
    show_logo = Column(Boolean, default=True)
    logo_data = Column(Text, default="")
    stamp_data = Column(Text, default="")
    signature_data = Column(Text, default="")
    theme = Column(String, default="dark")
    low_stock_default = Column(Float, default=5)
    auto_backup = Column(Boolean, default=False)
    sms_panel = Column(String, default="")
    sms_api_key = Column(String, default="")
    updated_at = Column(String, default="")


Base.metadata.create_all(bind=engine)


def ensure_sqlite_column(table_name: str, column_name: str, column_sql: str):
    """Small safe migration helper for the current SQLite development database."""
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        existing = {row[1] for row in rows}
        if column_name not in existing:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}"))
            conn.commit()


def ensure_database_schema():
    customer_columns = {
        "email": "email VARCHAR",
        "city": "city VARCHAR",
        "national_id": "national_id VARCHAR",
        "economic_code": "economic_code VARCHAR",
        "contact_person": "contact_person VARCHAR",
        "opening_balance": "opening_balance FLOAT DEFAULT 0",
        "credit_limit": "credit_limit FLOAT DEFAULT 0",
        "notes": "notes VARCHAR",
    }

    invoice_columns = {
        "subtotal": "subtotal FLOAT DEFAULT 0",
        "discount_percent": "discount_percent FLOAT DEFAULT 0",
        "discount_amount": "discount_amount FLOAT DEFAULT 0",
        "tax_percent": "tax_percent FLOAT DEFAULT 0",
        "tax_amount": "tax_amount FLOAT DEFAULT 0",
        "shipping_cost": "shipping_cost FLOAT DEFAULT 0",
        "payment_status": "payment_status VARCHAR DEFAULT 'unpaid'",
        "invoice_note": "invoice_note VARCHAR",
        "qr_enabled": "qr_enabled BOOLEAN DEFAULT 1",
    }

    for name, sql in customer_columns.items():
        ensure_sqlite_column("customers", name, sql)

    for name, sql in invoice_columns.items():
        ensure_sqlite_column("invoices", name, sql)

    settings_columns = {
        "country_code": "country_code VARCHAR DEFAULT 'IR'",
        "locale_code": "locale_code VARCHAR DEFAULT 'fa-IR'",
        "currency_code": "currency_code VARCHAR DEFAULT 'IRR'",
        "calendar_system": "calendar_system VARCHAR DEFAULT 'persian'",
        "time_zone": "time_zone VARCHAR DEFAULT 'Asia/Tehran'",
        "first_day_of_week": "first_day_of_week INTEGER DEFAULT 6",
        "fiscal_year_start": "fiscal_year_start VARCHAR DEFAULT '01-01-persian'",
        "tax_profile_version": "tax_profile_version VARCHAR DEFAULT ''",
        "tax_profile_verified_at": "tax_profile_verified_at VARCHAR DEFAULT ''",
        "rounding_mode": "rounding_mode VARCHAR DEFAULT 'half_up'",
        "decimal_places": "decimal_places INTEGER DEFAULT 0",
        "measurement_system": "measurement_system VARCHAR DEFAULT 'metric'",
    }
    for name, sql in settings_columns.items():
        ensure_sqlite_column("app_settings", name, sql)


def ensure_extra_tables():
    """Create simple ERP extension tables used by the frontend pages."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR NOT NULL,
                category VARCHAR,
                amount FLOAT DEFAULT 0,
                expense_date VARCHAR,
                note VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS stock_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                warehouse VARCHAR,
                product_id INTEGER,
                product_name VARCHAR,
                quantity FLOAT DEFAULT 0,
                movement_type VARCHAR,
                movement_date VARCHAR,
                note VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()


ensure_database_schema()
ensure_extra_tables()

app = FastAPI(
    title="Vetrix ERP",
    version="1.2.0"
)


app.include_router(crm_router, prefix="/api/crm", tags=["CRM"])

app.include_router(designer_router)
app.include_router(finance_router)
app.include_router(ai_bi_router)
app.include_router(pipeline_router)
app.include_router(smart_inventory_router)
app.include_router(crm_files_router)
app.include_router(accounting_entries_router)
app.include_router(fiscal_periods_router)
app.include_router(financial_statements_router)
app.include_router(fiscal_closing_router)
app.include_router(vat_accounting_router)
app.include_router(aging_report_router)
app.include_router(bank_reconciliation_router)
app.include_router(fixed_assets_router)
app.include_router(budgets_router)
app.include_router(currencies_router)
app.include_router(approvals_router)
app.include_router(treasury_router)
app.include_router(release_preflight_router)
app.include_router(audit_router)
app.include_router(rbac_router)
app.include_router(backup_router)
app.include_router(system_health_router)
app.include_router(online_commerce_router)
app.include_router(change_requests_router)
app.include_router(financial_policy_router)

default_origins = ",".join([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
])
allowed_origins = [
    origin.strip()
    for origin in os.getenv("VETRIX_ALLOWED_ORIGINS", default_origins).split(",")
    if origin.strip()
]

@app.middleware("http")
async def require_authenticated_api(request: Request, call_next):
    async def call_and_audit():
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            try:
                await run_in_threadpool(record_audit_event, request, status_code)
                if status_code < 400:
                    await run_in_threadpool(maybe_create_automatic_backup)
            except Exception:
                # Audit storage must never turn a completed business operation
                # into a client-visible failure.
                pass

    if is_public_request(request.url.path, request.method):
        return await call_next(request)

    if request.url.path == "/users" and request.method.upper() == "POST":
        db: Session = SessionLocal()
        try:
            if db.query(User).count() == 0:
                request.state.auth = {"role": "bootstrap"}
                return await call_and_audit()
        finally:
            db.close()

    token = extract_bearer_token(request.headers.get("Authorization"))
    if not token:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )

    try:
        request.state.auth = decode_access_token(token)
    except PyJWTError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or expired token"},
        )

    if not is_authorized(
        request.state.auth.get("role"),
        request.method,
        request.url.path,
    ):
        try:
            await run_in_threadpool(record_audit_event, request, 403)
        except Exception:
            pass
        return JSONResponse(
            status_code=403,
            content={"detail": "Your role does not permit this operation"},
        )

    return await call_and_audit()


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UserCreate(BaseModel):
    full_name: str
    username: str
    password: str
    role: str = "admin"


class UserRoleUpdate(BaseModel):
    role: str


class LoginRequest(BaseModel):
    username: str
    password: str


class CustomerCreate(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    city: str = ""
    national_id: str = ""
    economic_code: str = ""
    contact_person: str = ""
    customer_type: str = "customer"
    opening_balance: float = 0
    credit_limit: float = 0
    notes: str = ""


class ProductCreate(BaseModel):
    name: str
    barcode: Optional[str] = None
    code: Optional[str] = None
    price: Optional[float] = None
    sell_price: Optional[float] = None
    buy_price: Optional[float] = None
    unit: Optional[str] = "عدد"
    stock: float = 0


class InvoiceItemCreate(BaseModel):
    product_id: int
    quantity: float
    unit_price: float


class InvoiceCreate(BaseModel):
    invoice_type: str
    customer_id: int
    items: List[InvoiceItemCreate]
    discount_percent: float = 0
    tax_percent: float = 0
    shipping_cost: float = 0
    payment_status: str = "unpaid"
    invoice_note: str = ""
    qr_enabled: bool = True


class PaymentCreate(BaseModel):
    customer_id: int
    amount: float
    transaction_type: str = "receipt"
    method: str = "cash"
    note: str = ""
    invoice_id: Optional[int] = None


class ExpenseCreate(BaseModel):
    title: str
    category: str = ""
    amount: float
    expense_date: str = ""
    note: str = ""


class StockMovementCreate(BaseModel):
    warehouse: str = "Main"
    product_id: int
    quantity: float
    movement_type: str = "in"  # in / out / adjustment
    movement_date: str = ""
    note: str = ""


class AppSettingsUpdate(BaseModel):
    company_name: str = "Vetrix ERP"
    manager_name: str = ""
    phone: str = ""
    mobile: str = ""
    email: str = ""
    website: str = ""
    address: str = ""
    national_id: str = ""
    economic_code: str = ""
    currency: str = "تومان"
    country_code: str = "IR"
    locale_code: str = "fa-IR"
    currency_code: str = "IRR"
    calendar_system: str = "persian"
    time_zone: str = "Asia/Tehran"
    first_day_of_week: int = 6
    fiscal_year_start: str = "01-01-persian"
    tax_profile_version: str = ""
    tax_profile_verified_at: str = ""
    rounding_mode: str = "half_up"
    decimal_places: int = 0
    measurement_system: str = "metric"
    tax_percent: float = 10
    discount_percent: float = 0
    fiscal_year: str = ""
    invoice_footer: str = ""
    show_qr: bool = True
    show_barcode: bool = True
    show_logo: bool = True
    logo_data: str = ""
    stamp_data: str = ""
    signature_data: str = ""
    theme: str = "dark"
    low_stock_default: float = 5
    auto_backup: bool = False
    sms_panel: str = ""
    sms_api_key: str = ""


def customer_balance(db: Session, customer_id: int) -> float:
    entries = (
        db.query(AccountingEntry)
        .filter(AccountingEntry.customer_id == customer_id)
        .order_by(AccountingEntry.created_at.asc(), AccountingEntry.id.asc())
        .all()
    )
    return sum((e.debit or 0) - (e.credit or 0) for e in entries)

def rebuild_customer_balances(db: Session, customer_id: int):
    entries = (
        db.query(AccountingEntry)
        .filter(AccountingEntry.customer_id == customer_id)
        .order_by(AccountingEntry.created_at.asc(), AccountingEntry.id.asc())
        .all()
    )

    balance = 0

    for entry in entries:
        balance += float(entry.debit or 0)
        balance -= float(entry.credit or 0)

        entry.balance_after = balance

    db.flush()


def add_customer_entry(
    db: Session,
    customer_id: int,
    source_type: str,
    source_id: Optional[int],
    description: str,
    debit: float = 0,
    credit: float = 0,
):
    balance_before = customer_balance(db, customer_id)
    balance_after = balance_before + float(debit or 0) - float(credit or 0)

    entry = AccountingEntry(
        customer_id=customer_id,
        source_type=source_type,
        source_id=source_id,
        entry_type="debit" if float(debit or 0) >= float(credit or 0) else "credit",
        description=description,
        debit=float(debit or 0),
        credit=float(credit or 0),
        balance_after=balance_after,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    return entry


def _entity_date(value):
    if value:
        return str(value)[:10]
    return datetime.utcnow().date().isoformat()


def sync_customer_opening_general_ledger(db, customer, opening_balance):
    amount = float(accounting_money(abs(opening_balance or 0)))
    connection = db.connection()
    if amount == 0:
        delete_source_voucher(
            "customer_opening",
            customer.id,
            connection=connection,
        )
        return

    description = f"مانده افتتاحیه طرف‌حساب: {customer.name}"
    if opening_balance > 0:
        lines = [
            {"account_code": "1103", "debit": amount, "description": description},
            {"account_code": "3101", "credit": amount, "description": description},
        ]
    else:
        lines = [
            {"account_code": "3101", "debit": amount, "description": description},
            {"account_code": "2101", "credit": amount, "description": description},
        ]
    post_balanced_voucher(
        "customer_opening",
        customer.id,
        description,
        lines,
        voucher_date=_entity_date(customer.created_at),
        connection=connection,
    )


def sync_product_opening_general_ledger(db, product):
    stock = float(product.stock or 0)
    unit_cost = float(accounting_money(product.buy_price or 0))
    amount = float(accounting_money(stock * unit_cost))
    connection = db.connection()
    if amount == 0:
        delete_source_voucher(
            "product_opening",
            product.id,
            connection=connection,
        )
        return

    description = f"موجودی افتتاحیه کالا: {product.name}"
    post_balanced_voucher(
        "product_opening",
        product.id,
        description,
        [
            {"account_code": "1201", "debit": amount, "description": description},
            {"account_code": "3101", "credit": amount, "description": description},
        ],
        voucher_date=datetime.utcnow().date().isoformat(),
        connection=connection,
    )


def post_inventory_adjustment_general_ledger(
    db,
    movement_id,
    product,
    stock_delta,
    movement_date,
):
    amount = float(accounting_money(
        abs(stock_delta) * float(product.buy_price or 0)
    ))
    if amount == 0:
        return None
    description = f"تعدیل موجودی کالا: {product.name}"
    if stock_delta > 0:
        lines = [
            {"account_code": "1201", "debit": amount, "description": description},
            {"account_code": "3101", "credit": amount, "description": description},
        ]
    else:
        lines = [
            {"account_code": "3101", "debit": amount, "description": description},
            {"account_code": "1201", "credit": amount, "description": description},
        ]
    return post_balanced_voucher(
        "inventory_adjustment",
        movement_id,
        description,
        lines,
        voucher_date=movement_date,
        connection=db.connection(),
    )


def customer_to_dict(db: Session, c: Customer):
    balance = customer_balance(db, c.id)
    return {
        "id": c.id,
        "name": c.name,
        "phone": c.phone or "",
        "email": getattr(c, "email", "") or "",
        "address": c.address or "",
        "city": getattr(c, "city", "") or "",
        "national_id": getattr(c, "national_id", "") or "",
        "economic_code": getattr(c, "economic_code", "") or "",
        "contact_person": getattr(c, "contact_person", "") or "",
        "customer_type": c.customer_type or "customer",
        "opening_balance": getattr(c, "opening_balance", 0) or 0,
        "credit_limit": getattr(c, "credit_limit", 0) or 0,
        "notes": getattr(c, "notes", "") or "",
        "balance": balance,
        "debit": balance if balance > 0 else 0,
        "credit": abs(balance) if balance < 0 else 0,
        "created_at": c.created_at,
    }

def product_to_dict(product):
    buy_price = float(getattr(product, "buy_price", 0) or 0)
    sell_price = float(
        getattr(product, "sell_price", None)
        or getattr(product, "price", 0)
        or 0
    )
    price = float(getattr(product, "price", 0) or sell_price or 0)
    stock = float(getattr(product, "stock", 0) or 0)
    min_stock = float(getattr(product, "min_stock", 0) or 0)

    return {
        "id": product.id,
        "name": getattr(product, "name", "") or "",
        "code": getattr(product, "code", "") or "",
        "barcode": getattr(product, "barcode", "") or "",
        "sku": getattr(product, "sku", "") or "",
        "brand": getattr(product, "brand", "") or "",
        "unit": getattr(product, "unit", "") or "عدد",
        "buy_price": buy_price,
        "sell_price": sell_price,
        "price": price,
        "stock": stock,
        "min_stock": min_stock,
        "main_category": getattr(product, "main_category", "") or "",
        "sub_category": getattr(product, "sub_category", "") or "",
        "image": getattr(product, "image", "") or "",
        "low_stock": min_stock > 0 and stock <= min_stock,
        "profit_per_unit": sell_price - buy_price,
        "stock_value_buy": stock * buy_price,
        "stock_value_sell": stock * sell_price,
        "value": stock * sell_price,
    }

@app.get("/")
def root():
    return {"message": "Vetrix ERP Backend Running", "version": "1.2.0", "status": "online"}


@app.get("/setup/status")
def setup_status():
    db: Session = SessionLocal()
    try:
        user_count = db.query(User).count()
        return {
            "initialized": user_count > 0,
            "requires_admin": user_count == 0,
            "user_count": user_count,
            "version": "1.2.0",
        }
    finally:
        db.close()


def settings_to_dict(settings: AppSettings):
    return {
        "id": settings.id,
        "company_name": settings.company_name or "Vetrix ERP",
        "manager_name": settings.manager_name or "",
        "phone": settings.phone or "",
        "mobile": settings.mobile or "",
        "email": settings.email or "",
        "website": settings.website or "",
        "address": settings.address or "",
        "national_id": settings.national_id or "",
        "economic_code": settings.economic_code or "",
        "currency": settings.currency or "تومان",
        "country_code": settings.country_code or "IR",
        "locale_code": settings.locale_code or "fa-IR",
        "currency_code": settings.currency_code or "IRR",
        "calendar_system": settings.calendar_system or "persian",
        "time_zone": settings.time_zone or "Asia/Tehran",
        "first_day_of_week": int(settings.first_day_of_week if settings.first_day_of_week is not None else 6),
        "fiscal_year_start": settings.fiscal_year_start or "01-01-persian",
        "tax_profile_version": settings.tax_profile_version or "",
        "tax_profile_verified_at": settings.tax_profile_verified_at or "",
        "rounding_mode": settings.rounding_mode or "half_up",
        "decimal_places": int(settings.decimal_places if settings.decimal_places is not None else 0),
        "measurement_system": settings.measurement_system or "metric",
        "tax_percent": float(settings.tax_percent or 0),
        "discount_percent": float(settings.discount_percent or 0),
        "fiscal_year": settings.fiscal_year or "",
        "invoice_footer": settings.invoice_footer or "",
        "show_qr": bool(settings.show_qr),
        "show_barcode": bool(settings.show_barcode),
        "show_logo": bool(settings.show_logo),
        "logo_data": settings.logo_data or "",
        "stamp_data": settings.stamp_data or "",
        "signature_data": settings.signature_data or "",
        "theme": settings.theme or "dark",
        "low_stock_default": float(settings.low_stock_default or 0),
        "auto_backup": bool(settings.auto_backup),
        "sms_panel": settings.sms_panel or "",
        "sms_api_key": settings.sms_api_key or "",
        "updated_at": settings.updated_at or "",
    }


def get_or_create_settings(db: Session):
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings(updated_at=datetime.utcnow().isoformat())
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@app.get("/settings")
def get_settings():
    db: Session = SessionLocal()
    try:
        settings = get_or_create_settings(db)
        result = settings_to_dict(settings)
        db.close()
        return result
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@app.post("/settings")
def save_settings(data: AppSettingsUpdate):
    db: Session = SessionLocal()
    try:
        settings = get_or_create_settings(db)
        payload = data.dict()

        for key, value in payload.items():
            if hasattr(settings, key):
                setattr(settings, key, value)

        settings.updated_at = datetime.utcnow().isoformat()
        db.commit()
        db.refresh(settings)

        result = {"status": "saved", "settings": settings_to_dict(settings)}
        db.close()
        return result
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@app.put("/settings")
def update_settings(data: AppSettingsUpdate):
    return save_settings(data)


def require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") not in {"admin", "bootstrap"}:
        raise HTTPException(status_code=403, detail="Administrator access required")


@app.post("/users")
def create_user(data: UserCreate, request: Request):
    require_admin(request)
    if len(data.password) < 10:
        raise HTTPException(status_code=400, detail="Password must contain at least 10 characters")
    raw_role = str(data.role).strip().lower()
    requested_role = "viewer" if raw_role == "user" else normalize_role(raw_role)
    if raw_role not in ROLE_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of: {', '.join(role for role in ROLE_LABELS if role != 'user')}",
        )
    db: Session = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == data.username).first()
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        user = User(
            full_name=data.full_name,
            username=data.username,
            password=hash_password(data.password),
            role=requested_role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {
            "status": "created",
            "id": user.id,
            "username": user.username,
            "role": user.role,
        }
    finally:
        db.close()


def user_to_auth_dict(user: User):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "role": user.role,
    }


@app.get("/users")
def list_users(request: Request):
    require_admin(request)
    db: Session = SessionLocal()
    try:
        return [user_to_auth_dict(user) for user in db.query(User).all()]
    finally:
        db.close()




@app.put("/users/{user_id}/role")
def update_user_role(user_id: int, data: UserRoleUpdate, request: Request):
    require_admin(request)
    raw_role = str(data.role).strip().lower()
    requested_role = "viewer" if raw_role == "user" else normalize_role(raw_role)
    if raw_role not in ROLE_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of: {', '.join(role for role in ROLE_LABELS if role != 'user')}",
        )

    auth_user_id = getattr(request.state, "auth", {}).get("sub")
    if str(user_id) == str(auth_user_id):
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.role == "admin" and requested_role != "admin":
            admin_count = db.query(User).filter(User.role == "admin").count()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="The system must keep at least one administrator",
                )
        user.role = requested_role
        db.commit()
        db.refresh(user)
        return {"status": "updated", "user": user_to_auth_dict(user)}
    finally:
        db.close()


@app.post("/login")
def login(data: LoginRequest):
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.username == data.username).first()
        if not user or not verify_password(data.password, user.password):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        if password_needs_upgrade(user.password):
            user.password = hash_password(data.password)
            db.commit()

        token = create_access_token(user.id, user.username, user.role)
        return {
            "status": "success",
            "message": "Login successful",
            "access_token": token,
            "token_type": "Bearer",
            "user": user_to_auth_dict(user),
        }
    finally:
        db.close()


@app.get("/me")
def me(request: Request):
    try:
        user_id = int(request.state.auth["sub"])
    except (AttributeError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User no longer exists")
        return {"status": "success", "user": user_to_auth_dict(user)}
    finally:
        db.close()


@app.get("/customers")
def list_customers():
    db: Session = SessionLocal()
    customers = db.query(Customer).order_by(Customer.id.desc()).all()
    result = [customer_to_dict(db, c) for c in customers]
    db.close()
    return result


@app.post("/customers")
def create_customer(data: CustomerCreate):
    db: Session = SessionLocal()
    try:
        customer = Customer(
            name=data.name,
            phone=data.phone,
            email=data.email,
            address=data.address,
            city=data.city,
            national_id=data.national_id,
            economic_code=data.economic_code,
            contact_person=data.contact_person,
            customer_type=data.customer_type,
            opening_balance=data.opening_balance,
            credit_limit=data.credit_limit,
            notes=data.notes,
        )
        db.add(customer)
        db.flush()

        if data.opening_balance > 0:
            add_customer_entry(
                db,
                customer.id,
                "opening_balance",
                customer.id,
                "مانده اول دوره - بدهکار",
                debit=data.opening_balance,
            )
        elif data.opening_balance < 0:
            add_customer_entry(
                db,
                customer.id,
                "opening_balance",
                customer.id,
                "مانده اول دوره - بستانکار",
                credit=abs(data.opening_balance),
            )
        sync_customer_opening_general_ledger(
            db,
            customer,
            data.opening_balance,
        )
        db.commit()
        db.refresh(customer)
        result = {"status": "created", "id": customer.id, "name": customer.name, "balance": customer_balance(db, customer.id)}
        db.close()
        return result
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/customers/{customer_id}")
def customer_details(customer_id: int):
    db: Session = SessionLocal()
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        db.close()
        return {"status": "error", "message": "Customer not found"}
    result = {"status": "success", "customer": customer_to_dict(db, customer)}
    db.close()
    return result


@app.get("/customers/{customer_id}/ledger")
def customer_ledger(customer_id: int):
    db: Session = SessionLocal()
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        db.close()
        return {"status": "error", "message": "Customer not found"}

    entries = (
        db.query(AccountingEntry)
        .filter(AccountingEntry.customer_id == customer_id)
        .order_by(AccountingEntry.created_at.asc(), AccountingEntry.id.asc())
        .all()
    )

    rows = []
    balance = 0
    for e in entries:
        balance += (e.debit or 0) - (e.credit or 0)
        rows.append({
            "id": e.id,
            "date": e.created_at,
            "description": e.description,
            "source_type": e.source_type,
            "source_id": e.source_id,
            "debit": e.debit or 0,
            "credit": e.credit or 0,
            "balance": balance,
        })

    result = {"status": "success", "customer": customer_to_dict(db, customer), "ledger": rows, "balance": balance}
    db.close()
    return result


@app.put("/customers/{customer_id}")
def update_customer(customer_id: int, data: CustomerCreate):
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            db.close()
            return {"status": "error", "message": "Customer not found"}

        old_opening = float(getattr(customer, "opening_balance", 0) or 0)

        customer.name = data.name
        customer.phone = data.phone
        customer.email = data.email
        customer.address = data.address
        customer.city = data.city
        customer.national_id = data.national_id
        customer.economic_code = data.economic_code
        customer.contact_person = data.contact_person
        customer.customer_type = data.customer_type
        customer.opening_balance = data.opening_balance
        customer.credit_limit = data.credit_limit
        customer.notes = data.notes

        # Keep exactly one opening-balance entry synced with customer.opening_balance.
        opening_entries = (
            db.query(AccountingEntry)
            .filter(
                AccountingEntry.customer_id == customer_id,
                AccountingEntry.source_type == "opening_balance",
            )
            .all()
        )

        for entry in opening_entries:
            db.delete(entry)

        db.flush()

        if data.opening_balance > 0:
            add_customer_entry(
                db,
                customer.id,
                "opening_balance",
                customer.id,
                "مانده اول دوره - بدهکار",
                debit=data.opening_balance,
            )
        elif data.opening_balance < 0:
            add_customer_entry(
                db,
                customer.id,
                "opening_balance",
                customer.id,
                "مانده اول دوره - بستانکار",
                credit=abs(data.opening_balance),
            )
        sync_customer_opening_general_ledger(
            db,
            customer,
            data.opening_balance,
        )

        db.commit()
        db.refresh(customer)
        result = {"status": "updated", "customer": customer_to_dict(db, customer), "old_opening_balance": old_opening}
        db.close()
        return result
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@app.delete("/customers/{customer_id}")
def delete_customer(customer_id: int):
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            db.close()
            return {"status": "error", "message": "Customer not found"}

        # Prevent deleting parties with accounting history.
        has_entries = db.query(AccountingEntry).filter(AccountingEntry.customer_id == customer_id).first()
        has_invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id).first()
        if has_entries or has_invoices:
            db.close()
            return {"status": "error", "message": "This customer has accounting history and cannot be deleted."}

        db.delete(customer)
        db.commit()
        db.close()
        return {"status": "deleted", "id": customer_id}
    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/products")
def list_products():
    db: Session = SessionLocal()
    try:
        return [product_to_dict(product) for product in db.query(Product).all()]
    finally:
        db.close()


@app.post("/products")
def create_product(data: ProductCreate):
    db: Session = SessionLocal()
    try:
        opening_stock = float(data.stock or 0)
        if opening_stock < 0:
            raise ValueError("Opening stock cannot be negative")
        sell_price = (
            data.sell_price
            if data.sell_price is not None
            else data.price if data.price is not None else 0
        )
        product = Product(
            name=data.name,
            code=data.code or "",
            barcode=data.barcode or data.code or "",
            unit=data.unit or "عدد",
            buy_price=float(accounting_money(data.buy_price or 0)),
            sell_price=float(accounting_money(sell_price)),
            price=float(accounting_money(sell_price)),
            stock=opening_stock,
        )
        db.add(product)
        db.flush()
        sync_product_opening_general_ledger(db, product)
        db.commit()
        db.refresh(product)
        return {"status": "created", **product_to_dict(product)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@app.put("/products/{product_id}")
def update_product(product_id: int, data: ProductCreate):
    db: Session = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return {"status": "error", "message": "Product not found"}

        requested_stock = float(data.stock or 0)
        if requested_stock < 0:
            raise ValueError("Stock cannot be negative")
        invoice_history = db.query(InvoiceItem).filter(
            InvoiceItem.product_id == product_id
        ).first()
        movement_history = db.execute(text("""
            SELECT id FROM stock_movements
            WHERE product_id=:product_id
            LIMIT 1
        """), {"product_id": product_id}).first()
        has_inventory_history = bool(invoice_history or movement_history)
        if (
            has_inventory_history
            and abs(requested_stock - float(product.stock or 0)) >= 0.000001
        ):
            raise ValueError(
                "Stock with inventory history must be changed through a stock movement"
            )

        sell_price = (
            data.sell_price
            if data.sell_price is not None
            else data.price
            if data.price is not None
            else product.sell_price or product.price or 0
        )
        product.name = data.name
        product.code = data.code or product.code or ""
        product.barcode = data.barcode or data.code or product.barcode or ""
        product.unit = data.unit or product.unit or "عدد"
        product.buy_price = float(accounting_money(data.buy_price or 0))
        product.sell_price = float(accounting_money(sell_price))
        product.price = float(accounting_money(sell_price))
        product.stock = requested_stock

        if not has_inventory_history:
            sync_product_opening_general_ledger(db, product)
        db.commit()
        db.refresh(product)
        return {"status": "updated", **product_to_dict(product)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@app.delete("/products/{product_id}")
def delete_product(product_id: int):
    db: Session = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()

        if not product:
            db.close()
            return {"status": "error", "message": "Product not found"}

        used = db.query(InvoiceItem).filter(
            InvoiceItem.product_id == product_id
        ).first()
        movement = db.execute(text("""
            SELECT id FROM stock_movements
            WHERE product_id=:product_id
            LIMIT 1
        """), {"product_id": product_id}).first()

        if used or movement:
            db.close()
            return {
                "status": "error",
                "message": "این کالا دارای سابقه انبار یا فاکتور است و قابل حذف نیست.",
            }

        delete_source_voucher(
            "product_opening",
            product_id,
            connection=db.connection(),
        )
        db.delete(product)
        db.commit()
        db.close()

        return {"status": "deleted", "id": product_id}

    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}

def invoice_settled_amount(db: Session, invoice: Invoice, policy=None) -> float:
    policy = policy or {"decimal_places": 2, "rounding_mode": "half_up"}
    settlement_type = expected_settlement_type(invoice.invoice_type)
    if not settlement_type:
        return 0.0
    entries = db.query(AccountingEntry).filter(
        AccountingEntry.source_id == invoice.id,
        AccountingEntry.source_type == settlement_type,
    ).all()
    raw_total = (
        sum(float(entry.credit or 0) for entry in entries)
        if settlement_type == "receipt"
        else sum(float(entry.debit or 0) for entry in entries)
    )
    return float(accounting_money(
        raw_total,
        policy["decimal_places"],
        policy["rounding_mode"],
    ))


def sync_invoice_payment_status(db: Session, invoice: Invoice, policy=None):
    policy = policy or {"decimal_places": 2, "rounding_mode": "half_up"}
    settled = invoice_settled_amount(db, invoice, policy)
    invoice.payment_status = calculate_payment_status(
        invoice.total_amount,
        settled,
        policy["decimal_places"],
        policy["rounding_mode"],
    )
    return settled


def linked_invoice_settlements(db: Session, invoice_id: int):
    return db.query(AccountingEntry).filter(
        AccountingEntry.source_id == invoice_id,
        AccountingEntry.source_type.in_(["receipt", "payment"]),
    ).all()


def validate_invoice_products(db: Session, data: InvoiceCreate):
    quantities = aggregate_item_quantities(data.items)
    products = {}
    for product_id, required_quantity in quantities.items():
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise ValueError(f"Product with id {product_id} not found")
        if data.invoice_type in {"sale", "return_buy"} and float(product.stock or 0) < required_quantity:
            raise ValueError(
                f"Not enough stock for product: {product.name}. "
                f"Required: {required_quantity}, current: {float(product.stock or 0)}"
            )
        products[product_id] = product
    return products


def apply_invoice_stock(invoice_type: str, product: Product, quantity: float):
    if invoice_type == "sale":
        product.stock -= quantity
    elif invoice_type == "buy":
        product.stock += quantity
    elif invoice_type == "return_sale":
        product.stock += quantity
    elif invoice_type == "return_buy":
        product.stock -= quantity


def reverse_invoice_stock(invoice_type: str, product: Product, quantity: float):
    if invoice_type == "sale":
        product.stock += quantity
    elif invoice_type == "buy":
        product.stock -= quantity
    elif invoice_type == "return_sale":
        product.stock -= quantity
    elif invoice_type == "return_buy":
        product.stock += quantity


def add_invoice_customer_entry(db: Session, invoice: Invoice):
    if invoice.invoice_type == "sale":
        add_customer_entry(db, invoice.customer_id, "invoice", invoice.id, f"فاکتور فروش شماره {invoice.id}", debit=invoice.total_amount)
    elif invoice.invoice_type == "buy":
        add_customer_entry(db, invoice.customer_id, "invoice", invoice.id, f"فاکتور خرید شماره {invoice.id}", credit=invoice.total_amount)
    elif invoice.invoice_type == "return_sale":
        add_customer_entry(db, invoice.customer_id, "invoice", invoice.id, f"مرجوعی فروش شماره {invoice.id}", credit=invoice.total_amount)
    elif invoice.invoice_type == "return_buy":
        add_customer_entry(db, invoice.customer_id, "invoice", invoice.id, f"مرجوعی خرید شماره {invoice.id}", debit=invoice.total_amount)


def post_invoice_to_general_ledger(db: Session, invoice: Invoice, items, products, policy=None):
    policy = policy or {"decimal_places": 2, "rounding_mode": "half_up"}
    policy_money = lambda value: accounting_money(
        value,
        policy["decimal_places"],
        policy["rounding_mode"],
    )
    description = f"ثبت خودکار فاکتور شماره {invoice.id}"
    total = float(policy_money(invoice.total_amount))
    subtotal = float(policy_money(getattr(invoice, "subtotal", 0) or 0))
    discount = float(policy_money(
        getattr(invoice, "discount_amount", 0) or 0
    ))
    taxable_base = float(policy_money(subtotal - discount))
    tax = float(policy_money(getattr(invoice, "tax_amount", 0) or 0))
    shipping = float(policy_money(
        getattr(invoice, "shipping_cost", 0) or 0
    ))
    acquisition_value = float(policy_money(taxable_base + shipping))
    cost = float(policy_money(sum(
        float(item.quantity)
        * float(getattr(products[item.product_id], "buy_price", 0) or 0)
        for item in items
    )))
    lines = []

    if invoice.invoice_type == "sale":
        lines = [
            {"account_code": "1103", "debit": total, "description": description},
            {"account_code": "4101", "credit": taxable_base, "description": description},
            {"account_code": "2201", "credit": tax, "description": description},
            {"account_code": "4103", "credit": shipping, "description": description},
            {"account_code": "5101", "debit": cost, "description": description},
            {"account_code": "1201", "credit": cost, "description": description},
        ]
    elif invoice.invoice_type == "buy":
        lines = [
            {"account_code": "1201", "debit": acquisition_value, "description": description},
            {"account_code": "1301", "debit": tax, "description": description},
            {"account_code": "2101", "credit": total, "description": description},
        ]
    elif invoice.invoice_type == "return_sale":
        lines = [
            {"account_code": "4102", "debit": acquisition_value, "description": description},
            {"account_code": "2201", "debit": tax, "description": description},
            {"account_code": "1103", "credit": total, "description": description},
            {"account_code": "1201", "debit": cost, "description": description},
            {"account_code": "5101", "credit": cost, "description": description},
        ]
    elif invoice.invoice_type == "return_buy":
        lines = [
            {"account_code": "2101", "debit": total, "description": description},
            {"account_code": "1201", "credit": acquisition_value, "description": description},
            {"account_code": "1301", "credit": tax, "description": description},
        ]
    else:
        delete_source_voucher(
            "invoice",
            invoice.id,
            connection=db.connection(),
        )
        return

    post_balanced_voucher(
        "invoice",
        invoice.id,
        description,
        lines,
        voucher_date=_entity_date(invoice.created_at),
        connection=db.connection(),
    )


def post_transaction_to_general_ledger(
    db: Session,
    entry: AccountingEntry,
    method: str,
    invoice: Optional[Invoice] = None,
    policy=None,
):
    policy = policy or {"decimal_places": 2, "rounding_mode": "half_up"}
    amount = float(accounting_money(
        entry.credit or entry.debit,
        policy["decimal_places"],
        policy["rounding_mode"],
    ))
    cash_account = cash_account_for_method(method)
    counterpart = settlement_counterpart_account(
        invoice.invoice_type if invoice else None,
        entry.source_type,
    )
    description = entry.description
    if entry.source_type == "receipt":
        lines = [
            {"account_code": cash_account, "debit": amount, "description": description},
            {"account_code": counterpart, "credit": amount, "description": description},
        ]
    else:
        lines = [
            {"account_code": counterpart, "debit": amount, "description": description},
            {"account_code": cash_account, "credit": amount, "description": description},
        ]
    post_balanced_voucher(
        entry.source_type,
        entry.id,
        description,
        lines,
        connection=db.connection(),
    )


@app.post("/invoices")
def create_invoice(data: InvoiceCreate):
    db: Session = SessionLocal()
    try:
        if data.invoice_type not in ALLOWED_INVOICE_TYPES:
            raise ValueError("Invalid invoice_type")
        if data.payment_status not in ALLOWED_PAYMENT_STATUSES:
            raise ValueError("Invalid payment_status")
        if data.payment_status != "unpaid":
            raise ValueError("New invoices must start with unpaid payment_status")
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if not customer:
            raise ValueError("Customer not found")
        policy = financial_policy_values(db.connection())
        totals = calculate_invoice_totals(
            data.items, data.discount_percent, data.tax_percent, data.shipping_cost,
            decimal_places=policy["decimal_places"],
            rounding_mode=policy["rounding_mode"],
        )
        products = validate_invoice_products(db, data)
        invoice = Invoice(
            invoice_type=data.invoice_type,
            customer_id=data.customer_id,
            **totals,
            payment_status="unpaid",
            status="draft" if data.invoice_type == "proforma" else "final",
            invoice_note=data.invoice_note,
            qr_enabled=data.qr_enabled,
        )
        db.add(invoice)
        db.flush()
        for item in data.items:
            product = products[item.product_id]
            db.add(InvoiceItem(
                invoice_id=invoice.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=float(accounting_money(item.unit_price, policy["decimal_places"], policy["rounding_mode"])),
                total_price=float(accounting_money(float(item.quantity) * float(item.unit_price), policy["decimal_places"], policy["rounding_mode"])),
            ))
            apply_invoice_stock(data.invoice_type, product, item.quantity)
        add_invoice_customer_entry(db, invoice)
        post_invoice_to_general_ledger(db, invoice, data.items, products, policy)
        db.commit()
        db.refresh(invoice)
        return {
            "status": "created", "invoice_id": invoice.id,
            "invoice_type": invoice.invoice_type, "customer_id": invoice.customer_id,
            "total_amount": invoice.total_amount, "payment_status": invoice.payment_status,
            "items_count": len(data.items),
        }
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@app.put("/invoices/{invoice_id}")
def update_invoice(invoice_id: int, data: InvoiceCreate):
    db: Session = SessionLocal()
    try:
        if data.invoice_type not in ALLOWED_INVOICE_TYPES:
            raise ValueError("Invalid invoice_type")
        if data.payment_status not in ALLOWED_PAYMENT_STATUSES:
            raise ValueError("Invalid payment_status")
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            raise ValueError("Invoice not found")
        if linked_invoice_settlements(db, invoice_id):
            raise ValueError("Cannot edit an invoice with linked payment or receipt transactions")
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if not customer:
            raise ValueError("Customer not found")
        old_customer_id = invoice.customer_id
        old_items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id).all()
        for old_item in old_items:
            product = db.query(Product).filter(Product.id == old_item.product_id).first()
            if product:
                reverse_invoice_stock(invoice.invoice_type, product, old_item.quantity)
            db.delete(old_item)
        db.query(AccountingEntry).filter(
            AccountingEntry.source_type == "invoice",
            AccountingEntry.source_id == invoice_id,
        ).delete(synchronize_session=False)
        db.flush()
        policy = financial_policy_values(db.connection())
        totals = calculate_invoice_totals(
            data.items, data.discount_percent, data.tax_percent, data.shipping_cost,
            decimal_places=policy["decimal_places"],
            rounding_mode=policy["rounding_mode"],
        )
        products = validate_invoice_products(db, data)
        invoice.invoice_type = data.invoice_type
        invoice.customer_id = data.customer_id
        for key, value in totals.items():
            setattr(invoice, key, value)
        invoice.payment_status = "unpaid"
        invoice.status = "draft" if data.invoice_type == "proforma" else "final"
        invoice.invoice_note = data.invoice_note
        invoice.qr_enabled = data.qr_enabled
        for item in data.items:
            product = products[item.product_id]
            db.add(InvoiceItem(
                invoice_id=invoice.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=float(accounting_money(item.unit_price, policy["decimal_places"], policy["rounding_mode"])),
                total_price=float(accounting_money(float(item.quantity) * float(item.unit_price), policy["decimal_places"], policy["rounding_mode"])),
            ))
            apply_invoice_stock(data.invoice_type, product, item.quantity)
        add_invoice_customer_entry(db, invoice)
        post_invoice_to_general_ledger(db, invoice, data.items, products, policy)
        db.flush()
        rebuild_customer_balances(db, old_customer_id)
        if data.customer_id != old_customer_id:
            rebuild_customer_balances(db, data.customer_id)
        db.commit()
        db.refresh(invoice)
        return {
            "status": "updated", "invoice_id": invoice.id,
            "invoice_type": invoice.invoice_type, "customer_id": invoice.customer_id,
            "total_amount": invoice.total_amount, "payment_status": invoice.payment_status,
            "items_count": len(data.items),
        }
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@app.get("/invoices")
def list_invoices():
    db: Session = SessionLocal()
    try:
        invoices = db.query(Invoice).order_by(Invoice.id.desc()).all()
        result = []

        for inv in invoices:
            total_amount = float(inv.total_amount or 0)

            receipt_sum = (
                db.query(AccountingEntry)
                .filter(
                    AccountingEntry.source_type == "receipt",
                    AccountingEntry.source_id == inv.id,
                )
                .all()
            )

            payment_sum = (
                db.query(AccountingEntry)
                .filter(
                    AccountingEntry.source_type == "payment",
                    AccountingEntry.source_id == inv.id,
                )
                .all()
            )

            received_amount = sum(float(e.credit or 0) for e in receipt_sum)
            paid_amount = sum(float(e.debit or 0) for e in payment_sum)

            if inv.invoice_type in ["sale", "return_buy"]:
                settled_amount = received_amount
            elif inv.invoice_type in ["buy", "return_sale"]:
                settled_amount = paid_amount
            else:
                settled_amount = 0

            remaining_amount = max(total_amount - settled_amount, 0)

            if total_amount <= 0:
                settlement_status = "paid"
            elif settled_amount <= 0:
                settlement_status = "unpaid"
            elif settled_amount < total_amount:
                settlement_status = "partial"
            else:
                settlement_status = "paid"

            result.append({
                "id": inv.id,
                "invoice_type": inv.invoice_type,
                "customer_id": inv.customer_id,
                "customer_name": (db.query(Customer).filter(Customer.id == inv.customer_id).first().name if inv.customer_id and db.query(Customer).filter(Customer.id == inv.customer_id).first() else ""),
                "subtotal": float(getattr(inv, "subtotal", 0) or 0),
                "discount_percent": float(getattr(inv, "discount_percent", 0) or 0),
                "discount_amount": float(getattr(inv, "discount_amount", 0) or 0),
                "tax_percent": float(getattr(inv, "tax_percent", 0) or 0),
                "tax_amount": float(getattr(inv, "tax_amount", 0) or 0),
                "shipping_cost": float(getattr(inv, "shipping_cost", 0) or 0),
                "total_amount": total_amount,
                "received_amount": received_amount,
                "paid_amount": paid_amount,
                "settled_amount": settled_amount,
                "remaining_amount": remaining_amount,
                "payment_status": settlement_status,
                "settlement_status": settlement_status,
                "status": getattr(inv, "status", "final"),
                "invoice_note": getattr(inv, "invoice_note", "") or "",
                "qr_enabled": bool(getattr(inv, "qr_enabled", True)),
                "created_at": inv.created_at,
            })

        db.close()
        return result

    except Exception as e:
        db.rollback()
        db.close()
        return {"status": "error", "message": str(e)}


@app.post("/transactions")
def create_payment_or_receipt(data: PaymentCreate):
    db: Session = SessionLocal()
    try:
        policy = financial_policy_values(db.connection())
        if data.transaction_type not in {"receipt", "payment"}:
            raise ValueError("transaction_type must be receipt or payment")
        amount = float(accounting_money(
            data.amount,
            policy["decimal_places"],
            policy["rounding_mode"],
        ))
        if amount <= 0:
            raise ValueError("Amount must be greater than zero")
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if not customer:
            raise ValueError("Customer not found")

        invoice = None
        invoice_id = data.invoice_id if data.invoice_id else None
        if invoice_id:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                raise ValueError("Invoice not found")
            if invoice.customer_id != data.customer_id:
                raise ValueError("این فاکتور متعلق به این طرف‌حساب نیست")
            expected_type = expected_settlement_type(invoice.invoice_type)
            if not expected_type:
                raise ValueError("Proforma invoices cannot receive settlement transactions")
            if data.transaction_type != expected_type:
                raise ValueError(
                    f"{invoice.invoice_type} invoices require a {expected_type} transaction"
                )
            settled_before = invoice_settled_amount(db, invoice, policy)
            remaining_before = float(accounting_money(
                invoice.total_amount - settled_before,
                policy["decimal_places"],
                policy["rounding_mode"],
            ))
            if amount > remaining_before:
                raise ValueError(
                    f"Transaction exceeds invoice remaining amount: {remaining_before}"
                )

        if data.transaction_type == "receipt":
            description = "دریافت از طرف حساب"
            if invoice_id:
                description = f"دریافت از طرف حساب - فاکتور شماره {invoice_id}"
            if data.note:
                description += f" - {data.note}"
            entry = add_customer_entry(
                db, data.customer_id, "receipt", invoice_id,
                description, credit=amount,
            )
        else:
            description = "پرداخت به طرف حساب"
            if invoice_id:
                description = f"پرداخت به طرف حساب - فاکتور شماره {invoice_id}"
            if data.note:
                description += f" - {data.note}"
            entry = add_customer_entry(
                db, data.customer_id, "payment", invoice_id,
                description, debit=amount,
            )

        db.flush()
        settled = sync_invoice_payment_status(db, invoice, policy) if invoice else 0.0
        remaining = (
            float(accounting_money(
                invoice.total_amount - settled,
                policy["decimal_places"],
                policy["rounding_mode"],
            ))
            if invoice else None
        )
        post_transaction_to_general_ledger(db, entry, data.method, invoice, policy)
        db.commit()
        return {
            "status": "created",
            "entry_id": entry.id,
            "customer_id": data.customer_id,
            "invoice_id": invoice_id,
            "balance": customer_balance(db, data.customer_id),
            "invoice_payment_status": invoice.payment_status if invoice else None,
            "invoice_remaining": remaining,
        }
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@app.get("/transactions")
def list_transactions():
    db: Session = SessionLocal()
    entries = db.query(AccountingEntry).order_by(AccountingEntry.id.desc()).all()

    result = [
        {
            "id": e.id,
            "customer_id": e.customer_id,
            "source_type": e.source_type,
            "source_id": e.source_id,
            "invoice_id": e.source_id if e.source_type in ["receipt", "payment"] else None,
            "description": e.description,
            "debit": e.debit or 0,
            "credit": e.credit or 0,
            "balance_after": e.balance_after or 0,
            "created_at": e.created_at,
        }
        for e in entries
    ]

    db.close()
    return result


@app.get("/expenses")
def list_expenses():
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM expenses ORDER BY id DESC")).mappings().all()
        return [dict(row) for row in rows]


@app.post("/expenses")
def create_expense(data: ExpenseCreate):
    if data.amount <= 0:
        return {"status": "error", "message": "Amount must be greater than zero"}
    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO expenses (title, category, amount, expense_date, note, created_at)
                    VALUES (:title, :category, :amount, :expense_date, :note, :created_at)
                """),
                {
                    "title": data.title,
                    "category": data.category,
                    "amount": data.amount,
                    "expense_date": data.expense_date or datetime.utcnow().date().isoformat(),
                    "note": data.note,
                    "created_at": datetime.utcnow(),
                },
            )
            expense_id = result.lastrowid
            amount = float(accounting_money(data.amount))
            post_balanced_voucher(
                "expense",
                expense_id,
                f"ثبت خودکار هزینه: {data.title}",
                [
                    {"account_code": "5102", "debit": amount, "description": data.title},
                    {"account_code": "1101", "credit": amount, "description": data.title},
                ],
                voucher_date=data.expense_date or datetime.utcnow().date().isoformat(),
                connection=conn,
            )
        return {"status": "created", "id": expense_id, "amount": amount}
    except ValueError as error:
        return {"status": "error", "message": str(error)}


@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int):
    try:
        with engine.begin() as conn:
            delete_source_voucher("expense", expense_id, connection=conn)
            result = conn.execute(
                text("DELETE FROM expenses WHERE id=:id"),
                {"id": expense_id},
            )
            if result.rowcount == 0:
                return {"status": "error", "message": "Expense not found"}
        return {"status": "deleted", "id": expense_id}
    except ValueError as error:
        return {"status": "error", "message": str(error)}


@app.get("/stock-movements")
def list_stock_movements():
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM stock_movements ORDER BY id DESC")).mappings().all()
        return [dict(row) for row in rows]


@app.post("/stock-movements")
def create_stock_movement(data: StockMovementCreate):
    db: Session = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == data.product_id).first()
        if not product:
            raise ValueError("Product not found")

        previous_stock = float(product.stock or 0)
        quantity = float(data.quantity)
        if data.movement_type in {"in", "out"} and quantity <= 0:
            raise ValueError("Quantity must be greater than zero")
        if data.movement_type == "adjustment" and quantity < 0:
            raise ValueError("Adjusted stock cannot be negative")

        if data.movement_type == "in":
            stock_delta = quantity
            product.stock = previous_stock + quantity
        elif data.movement_type == "out":
            if previous_stock < quantity:
                raise ValueError(
                    f"Not enough stock; current stock is {previous_stock}"
                )
            stock_delta = -quantity
            product.stock = previous_stock - quantity
        elif data.movement_type == "adjustment":
            stock_delta = quantity - previous_stock
            product.stock = quantity
        else:
            raise ValueError(
                "movement_type must be in, out or adjustment"
            )

        movement_date = (
            data.movement_date or datetime.utcnow().date().isoformat()
        )
        result = db.execute(
            text("""
                INSERT INTO stock_movements
                (warehouse, product_id, product_name, quantity,
                 movement_type, movement_date, note, created_at)
                VALUES
                (:warehouse, :product_id, :product_name, :quantity,
                 :movement_type, :movement_date, :note, :created_at)
            """),
            {
                "warehouse": data.warehouse,
                "product_id": data.product_id,
                "product_name": product.name,
                "quantity": quantity,
                "movement_type": data.movement_type,
                "movement_date": movement_date,
                "note": data.note,
                "created_at": datetime.utcnow(),
            },
        )
        movement_id = result.lastrowid
        db.flush()
        post_inventory_adjustment_general_ledger(
            db,
            movement_id,
            product,
            stock_delta,
            movement_date,
        )
        updated_stock = float(product.stock or 0)
        db.commit()
        return {
            "status": "created",
            "id": movement_id,
            "product_id": data.product_id,
            "previous_stock": previous_stock,
            "stock_delta": stock_delta,
            "stock": updated_stock,
        }
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()
    

@app.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: int):
    db: Session = SessionLocal()

    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()

        if not invoice:
            db.close()
            return {"status": "error", "message": "Invoice not found"}

        if linked_invoice_settlements(db, invoice_id):
            db.close()
            return {
                "status": "error",
                "message": "Cannot delete an invoice with linked payment or receipt transactions",
            }

        customer_id = invoice.customer_id
        invoice_type = invoice.invoice_type

        items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id).all()

        # Reverse stock changes caused by this invoice before deleting it.
        for item in items:
            product = db.query(Product).filter(Product.id == item.product_id).first()

            if product:
                if invoice_type == "sale":
                    product.stock += item.quantity
                elif invoice_type == "buy":
                    product.stock -= item.quantity
                elif invoice_type == "return_sale":
                    product.stock -= item.quantity
                elif invoice_type == "return_buy":
                    product.stock += item.quantity

        # Delete accounting entries related to the invoice and rebuild customer running balances.
        db.query(AccountingEntry).filter(
            AccountingEntry.source_type == "invoice",
            AccountingEntry.source_id == invoice_id,
        ).delete(synchronize_session=False)

        for item in items:
            db.delete(item)

        delete_source_voucher("invoice", invoice_id, connection=db.connection())
        db.delete(invoice)
        db.flush()

        if customer_id:
            rebuild_customer_balances(db, customer_id)

        db.commit()
        db.close()

        return {
            "status": "deleted",
            "invoice_id": invoice_id,
            "customer_id": customer_id,
        }

    except Exception as e:
        db.rollback()
        db.close()
        return {
            "status": "error",
            "message": str(e),
        }
    
@app.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int):
    db: Session = SessionLocal()

    try:
        entry = db.query(AccountingEntry).filter(AccountingEntry.id == transaction_id).first()

        if not entry:
            db.close()
            return {
                "status": "error",
                "message": "Transaction not found",
            }

        customer_id = entry.customer_id
        source_type = entry.source_type
        source_id = entry.source_id
        linked_invoice = None
        if source_type in {"receipt", "payment"} and source_id:
            linked_invoice = db.query(Invoice).filter(Invoice.id == source_id).first()

        delete_source_voucher(source_type, entry.id, connection=db.connection())
        db.delete(entry)
        db.flush()

        if customer_id:
            rebuild_customer_balances(db, customer_id)
        if linked_invoice:
            sync_invoice_payment_status(db, linked_invoice)

        db.commit()
        db.close()

        return {
            "status": "deleted",
            "id": transaction_id,
            "customer_id": customer_id,
            "source_type": source_type,
            "source_id": source_id,
        }

    except Exception as e:
        db.rollback()
        db.close()
        return {
            "status": "error",
            "message": str(e),
        }
    
@app.delete("/admin/reset-accounting-data")
def reset_accounting_data():
    db: Session = SessionLocal()

    try:
        db.query(AccountingEntry).delete()
        db.query(InvoiceItem).delete()
        db.query(Invoice).delete()
        db.query(Product).delete()
        db.query(Customer).delete()

        db.commit()

        db.close()

        return {
            "status": "success",
            "message": "All accounting data removed"
        }

    except Exception as e:
        db.rollback()
        db.close()

        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/dashboard-stats")
def dashboard_stats():
    db: Session = SessionLocal()
    try:
        payload = build_reports_payload(db)

        customers_count = db.query(Customer).count()
        products_count = db.query(Product).count()
        invoices_count = db.query(Invoice).count()

        profit_loss = payload.get("profit_loss", {})
        cashflow = payload.get("cashflow", {})
        today_month = payload.get("today_month", {})
        invoice_summary = payload.get("invoice_summary", {})
        inventory = payload.get("inventory", {})

        total_revenue = _safe_float(profit_loss.get("net_sales"))
        total_purchases = _safe_float(profit_loss.get("net_purchases"))
        total_expenses = _safe_float(profit_loss.get("expenses"))
        net_profit = _safe_float(profit_loss.get("net_profit"))

        low_stock = int(inventory.get("low_stock_count", 0) or 0)

        alerts = get_low_stock_alerts(db)
        ai_insight = generate_financial_insight({
            "revenue": total_revenue,
            "expenses": total_purchases + total_expenses,
            "profit": net_profit,
        })
        profit_analysis = build_profit_analysis(
            total_revenue=total_revenue,
            total_purchases=total_purchases,
            invoices_count=invoices_count,
        )
        live_notifications = build_live_notifications(low_stock=low_stock, net_profit=net_profit)

        result = {
            "total_revenue": total_revenue,
            "total_purchases": total_purchases,
            "total_expenses": total_expenses,
            "net_profit": net_profit,

            "customers_count": customers_count,
            "products_count": products_count,
            "invoices_count": invoices_count,
            "low_stock": low_stock,

            "sales_today": today_month.get("sales_today", 0),
            "sales_week": today_month.get("sales_week", 0),
            "sales_month": today_month.get("sales_month", 0),

            "purchases_today": today_month.get("purchases_today", 0),
            "purchases_week": today_month.get("purchases_week", 0),
            "purchases_month": today_month.get("purchases_month", 0),

            "receipt_today": cashflow.get("receipt_today", 0),
            "receipt_week": cashflow.get("receipt_week", 0),
            "receipt_month": cashflow.get("receipt_month", 0),

            "payment_today": cashflow.get("payment_today", 0),
            "payment_week": cashflow.get("payment_week", 0),
            "payment_month": cashflow.get("payment_month", 0),

            "debtors_total": payload.get("debtors_total", 0),
            "creditors_total": payload.get("creditors_total", 0),

            "open_invoices_count": invoice_summary.get("open_count", 0),
            "open_invoices_amount": invoice_summary.get("open_amount", 0),

            "inventory_value": inventory.get("inventory_value", 0),
            "inventory_buy_value": inventory.get("inventory_buy_value", 0),
            "inventory_sell_value": inventory.get("inventory_sell_value", 0),
            "inventory_profit": inventory.get("inventory_profit", 0),

            "alerts": alerts,
            "ai_insight": ai_insight,
            "profit_analysis": profit_analysis,
            "live_notifications": live_notifications,

            "recent_invoices": payload.get("recent_invoices", []),
            "recent_transactions": payload.get("recent_transactions", []),

            "top_products": payload.get("top_products", []),
            "top_customers": payload.get("top_customers", []),
            "top_debtors": payload.get("top_debtors", []),
            "top_creditors": payload.get("top_creditors", []),

            "sales_chart": payload.get("monthly_sales_chart", []),
            "monthly_sales_chart": payload.get("monthly_sales_chart", []),
            "monthly_profit_chart": payload.get("monthly_profit_chart", []),
            "cashflow_chart": payload.get("cashflow_chart", []),
            "product_profit_chart": payload.get("product_profit_chart", []),
            "inventory_chart": payload.get("inventory_chart", []),

            "expense_chart": [
                {"name": "خرید", "value": total_purchases},
                {"name": "هزینه", "value": total_expenses},
                {"name": "سود", "value": net_profit if net_profit > 0 else 0},
                {"name": "کمبود موجودی", "value": low_stock},
            ],
        }

        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


def _entry_amount(entry):
    return float(entry.debit or 0), float(entry.credit or 0)


def _safe_float(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _today_bounds():
    today = datetime.utcnow().date()
    start = datetime(today.year, today.month, today.day)
    return today, start


def _week_start():
    now = datetime.utcnow()
    start = now - timedelta(days=now.weekday())
    return datetime(start.year, start.month, start.day)


def _month_start():
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1)


def _month_key(dt):
    if not dt:
        return ""
    return f"{dt.year:04d}-{dt.month:02d}"


def _month_title(key):
    names = {
        "01": "فروردین/Jan",
        "02": "اردیبهشت/Feb",
        "03": "خرداد/Mar",
        "04": "تیر/Apr",
        "05": "مرداد/May",
        "06": "شهریور/Jun",
        "07": "مهر/Jul",
        "08": "آبان/Aug",
        "09": "آذر/Sep",
        "10": "دی/Oct",
        "11": "بهمن/Nov",
        "12": "اسفند/Dec",
    }
    if not key or len(key) < 7:
        return key or "-"
    return f"{names.get(key[5:7], key[5:7])} {key[:4]}"


def _last_month_keys(count=12):
    now = datetime.utcnow()
    year = now.year
    month = now.month
    keys = []
    for _ in range(count):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(keys))


def _expense_rows():
    try:
        with engine.connect() as conn:
            return [dict(row) for row in conn.execute(text("SELECT * FROM expenses")).mappings().all()]
    except Exception:
        return []


def _expense_total():
    return sum(_safe_float(row.get("amount")) for row in _expense_rows())


def _parse_expense_date(row):
    raw = row.get("expense_date") or row.get("created_at")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "").split(".")[0])
    except Exception:
        try:
            return datetime.strptime(str(raw)[:10], "%Y-%m-%d")
        except Exception:
            return None


def _invoice_settlement(db: Session, invoice):
    total_amount = _safe_float(getattr(invoice, "total_amount", 0))

    receipt_entries = (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.source_type == "receipt",
            AccountingEntry.source_id == invoice.id,
        )
        .all()
    )

    payment_entries = (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.source_type == "payment",
            AccountingEntry.source_id == invoice.id,
        )
        .all()
    )

    received_amount = sum(_safe_float(e.credit) for e in receipt_entries)
    paid_amount = sum(_safe_float(e.debit) for e in payment_entries)

    if invoice.invoice_type in ["sale", "return_buy"]:
        settled_amount = received_amount
    elif invoice.invoice_type in ["buy", "return_sale"]:
        settled_amount = paid_amount
    else:
        settled_amount = 0

    remaining_amount = max(total_amount - settled_amount, 0)

    if total_amount <= 0:
        settlement_status = "paid"
    elif settled_amount <= 0:
        settlement_status = "unpaid"
    elif settled_amount < total_amount:
        settlement_status = "partial"
    else:
        settlement_status = "paid"

    return {
        "received_amount": received_amount,
        "paid_amount": paid_amount,
        "settled_amount": settled_amount,
        "remaining_amount": remaining_amount,
        "settlement_status": settlement_status,
    }


def invoice_to_dict(db: Session, invoice):
    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first() if invoice.customer_id else None
    settlement = _invoice_settlement(db, invoice)

    return {
        "id": invoice.id,
        "invoice_type": invoice.invoice_type,
        "customer_id": invoice.customer_id,
        "customer_name": customer.name if customer else "",
        "subtotal": _safe_float(getattr(invoice, "subtotal", 0)),
        "discount_percent": _safe_float(getattr(invoice, "discount_percent", 0)),
        "discount_amount": _safe_float(getattr(invoice, "discount_amount", 0)),
        "tax_percent": _safe_float(getattr(invoice, "tax_percent", 0)),
        "tax_amount": _safe_float(getattr(invoice, "tax_amount", 0)),
        "shipping_cost": _safe_float(getattr(invoice, "shipping_cost", 0)),
        "total_amount": _safe_float(invoice.total_amount),
        "payment_status": settlement["settlement_status"],
        "status": getattr(invoice, "status", "final"),
        "created_at": invoice.created_at,
        **settlement,
    }


def _build_product_profit_rows(db: Session, products):
    rows = []

    for product in products:
        items = (
            db.query(InvoiceItem, Invoice)
            .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
            .filter(InvoiceItem.product_id == product.id)
            .all()
        )

        sold_qty = 0
        returned_qty = 0
        revenue = 0
        cost = 0

        info = product_to_dict(product)
        buy_price = _safe_float(info.get("buy_price"))
        sell_price = _safe_float(info.get("sell_price"))

        for item, invoice in items:
            qty = _safe_float(item.quantity)
            total = _safe_float(item.total_price)

            if invoice.invoice_type == "sale":
                sold_qty += qty
                revenue += total
                cost += qty * buy_price
            elif invoice.invoice_type == "return_sale":
                returned_qty += qty
                revenue -= total
                cost -= qty * buy_price

        profit = revenue - cost
        margin = (profit / revenue * 100) if revenue > 0 else 0

        rows.append({
            "product_id": product.id,
            "name": product.name,
            "barcode": info.get("barcode", ""),
            "brand": info.get("brand", ""),
            "unit": info.get("unit", "عدد"),
            "stock": info.get("stock", 0),
            "buy_price": buy_price,
            "sell_price": sell_price,
            "sold_qty": sold_qty,
            "returned_qty": returned_qty,
            "net_qty": sold_qty - returned_qty,
            "revenue": revenue,
            "cost": cost,
            "profit": profit,
            "margin_percent": margin,
        })

    rows.sort(key=lambda x: _safe_float(x.get("profit")), reverse=True)
    return rows


def _build_monthly_charts(invoices, entries, expense_rows):
    keys = _last_month_keys(12)

    monthly = {
        key: {
            "month": _month_title(key),
            "key": key,
            "sales": 0,
            "purchases": 0,
            "sales_returns": 0,
            "purchase_returns": 0,
            "expenses": 0,
            "profit": 0,
        }
        for key in keys
    }

    cash = {
        key: {
            "month": _month_title(key),
            "key": key,
            "receipts": 0,
            "payments": 0,
            "net": 0,
        }
        for key in keys
    }

    for invoice in invoices:
        key = _month_key(invoice.created_at)
        if key not in monthly:
            continue

        amount = _safe_float(invoice.total_amount)
        if invoice.invoice_type == "sale":
            monthly[key]["sales"] += amount
        elif invoice.invoice_type == "buy":
            monthly[key]["purchases"] += amount
        elif invoice.invoice_type == "return_sale":
            monthly[key]["sales_returns"] += amount
        elif invoice.invoice_type == "return_buy":
            monthly[key]["purchase_returns"] += amount

    for row in expense_rows:
        dt = _parse_expense_date(row)
        key = _month_key(dt)
        if key in monthly:
            monthly[key]["expenses"] += _safe_float(row.get("amount"))

    for entry in entries:
        key = _month_key(entry.created_at)
        if key not in cash:
            continue

        if entry.source_type == "receipt":
            cash[key]["receipts"] += _safe_float(entry.credit)
        elif entry.source_type == "payment":
            cash[key]["payments"] += _safe_float(entry.debit)

    monthly_rows = []
    for key in keys:
        row = monthly[key]
        row["net_sales"] = row["sales"] - row["sales_returns"]
        row["net_purchases"] = row["purchases"] - row["purchase_returns"]
        row["profit"] = row["net_sales"] - row["net_purchases"] - row["expenses"]
        monthly_rows.append(row)

        cash[key]["net"] = cash[key]["receipts"] - cash[key]["payments"]

    return monthly_rows, [cash[key] for key in keys]


def build_reports_payload(db: Session):
    invoices = db.query(Invoice).all()
    invoice_items = db.query(InvoiceItem).all()
    customers = db.query(Customer).all()
    products = db.query(Product).all()
    entries = db.query(AccountingEntry).all()
    expense_rows = _expense_rows()

    today, today_start = _today_bounds()
    week_start = _week_start()
    month_start = _month_start()

    product_costs = {
        product.id: _safe_float(getattr(product, "buy_price", 0))
        for product in products
    }
    profit_loss = build_profit_loss(
        invoices,
        invoice_items,
        product_costs,
        [_safe_float(row.get("amount")) for row in expense_rows],
    )
    sales = profit_loss["sales"]
    purchases = profit_loss["purchases"]
    sales_returns = profit_loss["sales_returns"]
    purchase_returns = profit_loss["purchase_returns"]
    expenses = profit_loss["expenses"]
    net_sales = profit_loss["net_sales"]
    net_purchases = profit_loss["net_purchases"]
    gross_profit = profit_loss["gross_profit"]
    net_profit = profit_loss["net_profit"]

    total_debit = sum(_safe_float(e.debit) for e in entries)
    total_credit = sum(_safe_float(e.credit) for e in entries)

    receipt_entries = [e for e in entries if e.source_type == "receipt"]
    payment_entries = [e for e in entries if e.source_type == "payment"]

    receipt_total = sum(_safe_float(e.credit) for e in receipt_entries)
    payment_total = sum(_safe_float(e.debit) for e in payment_entries)

    receipt_today = sum(_safe_float(e.credit) for e in receipt_entries if e.created_at and e.created_at.date() == today)
    payment_today = sum(_safe_float(e.debit) for e in payment_entries if e.created_at and e.created_at.date() == today)
    receipt_week = sum(_safe_float(e.credit) for e in receipt_entries if e.created_at and e.created_at >= week_start)
    payment_week = sum(_safe_float(e.debit) for e in payment_entries if e.created_at and e.created_at >= week_start)
    receipt_month = sum(_safe_float(e.credit) for e in receipt_entries if e.created_at and e.created_at >= month_start)
    payment_month = sum(_safe_float(e.debit) for e in payment_entries if e.created_at and e.created_at >= month_start)

    sales_today = net_period_total(invoices, "sale", "return_sale", lambda i: i.created_at and i.created_at.date() == today)
    sales_week = net_period_total(invoices, "sale", "return_sale", lambda i: i.created_at and i.created_at >= week_start)
    sales_month = net_period_total(invoices, "sale", "return_sale", lambda i: i.created_at and i.created_at >= month_start)

    purchases_today = net_period_total(invoices, "buy", "return_buy", lambda i: i.created_at and i.created_at.date() == today)
    purchases_week = net_period_total(invoices, "buy", "return_buy", lambda i: i.created_at and i.created_at >= week_start)
    purchases_month = net_period_total(invoices, "buy", "return_buy", lambda i: i.created_at and i.created_at >= month_start)

    expense_today = sum(_safe_float(row.get("amount")) for row in expense_rows if _parse_expense_date(row) and _parse_expense_date(row).date() == today)
    expense_week = sum(_safe_float(row.get("amount")) for row in expense_rows if _parse_expense_date(row) and _parse_expense_date(row) >= week_start)
    expense_month = sum(_safe_float(row.get("amount")) for row in expense_rows if _parse_expense_date(row) and _parse_expense_date(row) >= month_start)

    customer_rows = [customer_to_dict(db, c) for c in customers]
    debtors_total = sum(_safe_float(c.get("debit")) for c in customer_rows)
    creditors_total = sum(_safe_float(c.get("credit")) for c in customer_rows)

    top_debtors = sorted(
        [c for c in customer_rows if _safe_float(c.get("debit")) > 0],
        key=lambda x: _safe_float(x.get("debit")),
        reverse=True,
    )[:10]

    top_creditors = sorted(
        [c for c in customer_rows if _safe_float(c.get("credit")) > 0],
        key=lambda x: _safe_float(x.get("credit")),
        reverse=True,
    )[:10]

    invoice_rows = [invoice_to_dict(db, inv) for inv in invoices]
    open_invoices = [
        inv for inv in invoice_rows
        if inv.get("invoice_type") != "proforma" and _safe_float(inv.get("remaining_amount")) > 0
    ]

    final_invoice_rows = [inv for inv in invoice_rows if inv.get("invoice_type") != "proforma"]
    unpaid_invoices = [inv for inv in final_invoice_rows if inv.get("settlement_status") == "unpaid"]
    partial_invoices = [inv for inv in final_invoice_rows if inv.get("settlement_status") == "partial"]
    paid_invoices = [inv for inv in final_invoice_rows if inv.get("settlement_status") == "paid"]

    inventory_rows = []
    for p in products:
        item = product_to_dict(p)
        inventory_rows.append({
            **item,
            "value": item["stock_value_sell"],
            "potential_profit": item["stock_value_sell"] - item["stock_value_buy"],
        })

    low_stock_products = [p for p in inventory_rows if p["low_stock"]]
    inventory_buy_value = sum(_safe_float(p.get("stock_value_buy")) for p in inventory_rows)
    inventory_sell_value = sum(_safe_float(p.get("stock_value_sell")) for p in inventory_rows)
    inventory_profit = inventory_sell_value - inventory_buy_value

    product_profit_rows = _build_product_profit_rows(db, products)

    customer_names = {customer.id: customer.name for customer in customers}
    customer_sales_map = customer_net_sales(invoices)
    top_customers = sorted(
        [
            {
                "customer_id": customer_id,
                "name": customer_names.get(customer_id, str(customer_id)),
                **values,
            }
            for customer_id, values in customer_sales_map.items()
        ],
        key=lambda row: _safe_float(row.get("sales_amount")),
        reverse=True,
    )[:10]

    monthly_sales_chart, cashflow_chart = _build_monthly_charts(invoices, entries, expense_rows)

    monthly_profit_chart = [
        {
            "month": row["month"],
            "key": row["key"],
            "sales": row["net_sales"],
            "purchases": row["net_purchases"],
            "expenses": row["expenses"],
            "profit": row["profit"],
        }
        for row in monthly_sales_chart
    ]

    inventory_chart = [
        {
            "name": p.get("name"),
            "stock": p.get("stock", 0),
            "value": p.get("value", 0),
            "low_stock": p.get("low_stock", False),
        }
        for p in sorted(inventory_rows, key=lambda x: _safe_float(x.get("value")), reverse=True)[:10]
    ]

    recent_transactions = [
        {
            "id": e.id,
            "customer_id": e.customer_id,
            "source_type": e.source_type,
            "source_id": e.source_id,
            "description": e.description,
            "debit": _safe_float(e.debit),
            "credit": _safe_float(e.credit),
            "amount": _safe_float(e.debit) or _safe_float(e.credit),
            "created_at": e.created_at,
        }
        for e in sorted(entries, key=lambda x: x.created_at or datetime.min, reverse=True)[:15]
    ]

    recent_invoices = sorted(invoice_rows, key=lambda x: x.get("created_at") or datetime.min, reverse=True)[:10]

    return {
        "profit_loss": profit_loss,
        "trial_balance": {
            "total_debit": total_debit,
            "total_credit": total_credit,
            "difference": total_debit - total_credit,
            "is_balanced": abs(total_debit - total_credit) < 0.01,
        },
        "cashflow": {
            "receipt_total": receipt_total,
            "payment_total": payment_total,
            "net_cashflow": receipt_total - payment_total,
            "receipt_today": receipt_today,
            "payment_today": payment_today,
            "receipt_week": receipt_week,
            "payment_week": payment_week,
            "receipt_month": receipt_month,
            "payment_month": payment_month,
        },
        "invoice_summary": {
            "open_count": len(open_invoices),
            "unpaid_count": len(unpaid_invoices),
            "partial_count": len(partial_invoices),
            "paid_count": len(paid_invoices),
            "open_amount": sum(_safe_float(i.get("remaining_amount")) for i in open_invoices),
            "unpaid_amount": sum(_safe_float(i.get("remaining_amount")) for i in unpaid_invoices),
            "partial_amount": sum(_safe_float(i.get("remaining_amount")) for i in partial_invoices),
        },
        "today_month": {
            "sales_today": sales_today,
            "sales_week": sales_week,
            "sales_month": sales_month,
            "purchases_today": purchases_today,
            "purchases_week": purchases_week,
            "purchases_month": purchases_month,
            "expense_today": expense_today,
            "expense_week": expense_week,
            "expense_month": expense_month,
            "receipt_today": receipt_today,
            "payment_today": payment_today,
            "receipt_month": receipt_month,
            "payment_month": payment_month,
        },
        "debtors_total": debtors_total,
        "creditors_total": creditors_total,
        "top_debtors": top_debtors,
        "top_creditors": top_creditors,
        "top_customers": top_customers,
        "top_products": product_profit_rows[:10],
        "open_invoices": open_invoices,
        "recent_invoices": recent_invoices,
        "recent_transactions": recent_transactions,
        "inventory": {
            "products": inventory_rows,
            "low_stock_products": low_stock_products,
            "inventory_value": inventory_sell_value,
            "inventory_buy_value": inventory_buy_value,
            "inventory_sell_value": inventory_sell_value,
            "inventory_profit": inventory_profit,
            "low_stock_count": len(low_stock_products),
        },
        "monthly_sales_chart": monthly_sales_chart,
        "monthly_profit_chart": monthly_profit_chart,
        "cashflow_chart": cashflow_chart,
        "product_profit_chart": product_profit_rows[:10],
        "inventory_chart": inventory_chart,
        "sales": [invoice_to_dict(db, i) for i in invoices if i.invoice_type == "sale"],
        "purchases": [invoice_to_dict(db, i) for i in invoices if i.invoice_type == "buy"],
        "receipts": [
            {
                "id": e.id,
                "customer_id": e.customer_id,
                "source_id": e.source_id,
                "description": e.description,
                "amount": _safe_float(e.credit),
                "created_at": e.created_at,
            }
            for e in receipt_entries
        ],
        "payments": [
            {
                "id": e.id,
                "customer_id": e.customer_id,
                "source_id": e.source_id,
                "description": e.description,
                "amount": _safe_float(e.debit),
                "created_at": e.created_at,
            }
            for e in payment_entries
        ],
    }

@app.get("/reports/overview")
def reports_overview():
    db: Session = SessionLocal()
    try:
        result = build_reports_payload(db)
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/profit-loss")
def reports_profit_loss():
    db: Session = SessionLocal()
    try:
        result = build_reports_payload(db)["profit_loss"]
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}

@app.get("/reports/product-profit")
def reports_product_profit():
    db: Session = SessionLocal()
    try:
        products = db.query(Product).all()
        rows = []

        for product in products:
            items = (
                db.query(InvoiceItem, Invoice)
                .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
                .filter(InvoiceItem.product_id == product.id)
                .all()
            )

            sold_qty = 0
            returned_qty = 0
            revenue = 0
            cost = 0

            buy_price = float(getattr(product, "buy_price", 0) or 0)
            sell_price = float(
                getattr(product, "sell_price", None)
                or getattr(product, "price", 0)
                or 0
            )

            for item, invoice in items:
                qty = float(item.quantity or 0)
                total = float(
                    getattr(item, "total_price", None)
                    or getattr(item, "total", 0)
                    or qty * float(getattr(item, "unit_price", 0) or 0)
                )

                if invoice.invoice_type == "sale":
                    sold_qty += qty
                    revenue += total
                    cost += qty * buy_price

                elif invoice.invoice_type == "return_sale":
                    returned_qty += qty
                    revenue -= total
                    cost -= qty * buy_price

            profit = revenue - cost
            margin = (profit / revenue * 100) if revenue > 0 else 0

            rows.append({
                "product_id": product.id,
                "name": product.name,
                "barcode": getattr(product, "barcode", "") or getattr(product, "code", "") or "",
                "brand": getattr(product, "brand", "") or "",
                "unit": getattr(product, "unit", "") or "عدد",
                "stock": float(getattr(product, "stock", 0) or 0),
                "buy_price": buy_price,
                "sell_price": sell_price,
                "sold_qty": sold_qty,
                "returned_qty": returned_qty,
                "net_qty": sold_qty - returned_qty,
                "revenue": revenue,
                "cost": cost,
                "profit": profit,
                "margin_percent": margin,
            })

        rows.sort(key=lambda x: x["profit"], reverse=True)

        db.close()
        return {"items": rows}
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/customer-balances")
def reports_customer_balances():
    db: Session = SessionLocal()
    try:
        customers = db.query(Customer).all()
        rows = []

        for customer in customers:
            balance = float(getattr(customer, "balance", 0) or 0)
            opening_balance = float(getattr(customer, "opening_balance", 0) or 0)

            try:
                entries = (
                    db.query(AccountingEntry)
                    .filter(AccountingEntry.customer_id == customer.id)
                    .order_by(AccountingEntry.created_at.desc())
                    .all()
                )
            except Exception:
                entries = []

            debit = sum(float(getattr(e, "debit", 0) or 0) for e in entries)
            credit = sum(float(getattr(e, "credit", 0) or 0) for e in entries)

            if balance == 0:
                balance = opening_balance + debit - credit

            invoice_count = (
                db.query(Invoice)
                .filter(Invoice.customer_id == customer.id)
                .count()
            )

            last_entry = entries[0] if entries else None

            rows.append({
                "id": customer.id,
                "name": getattr(customer, "name", "") or "",
                "phone": getattr(customer, "phone", "") or "",
                "email": getattr(customer, "email", "") or "",
                "address": getattr(customer, "address", "") or "",
                "customer_type": getattr(customer, "customer_type", "customer") or "customer",
                "opening_balance": opening_balance,
                "debit": max(balance, 0),
                "credit": max(-balance, 0),
                "balance": balance,
                "invoice_count": invoice_count,
                "last_transaction_date": last_entry.created_at if last_entry else None,
                "last_transaction_description": getattr(last_entry, "description", "") if last_entry else "",
            })

        debtors = [x for x in rows if float(x.get("debit", 0) or 0) > 0]
        creditors = [x for x in rows if float(x.get("credit", 0) or 0) > 0]

        debtors.sort(key=lambda x: float(x.get("debit", 0) or 0), reverse=True)
        creditors.sort(key=lambda x: float(x.get("credit", 0) or 0), reverse=True)

        db.close()
        return {
            "all": rows,
            "debtors": debtors,
            "creditors": creditors,
        }
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/inventory-movements")
def reports_inventory_movements():
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT * FROM stock_movements ORDER BY id DESC")
            ).mappings().all()

            return {"items": [dict(row) for row in rows]}
    except Exception:
        return {"items": []}

@app.get("/reports/trial-balance")
def reports_trial_balance():
    db: Session = SessionLocal()
    try:
        result = build_reports_payload(db)["trial_balance"]
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/open-invoices")
def reports_open_invoices():
    db: Session = SessionLocal()
    try:
        payload = build_reports_payload(db)
        result = {"summary": payload["invoice_summary"], "items": payload["open_invoices"]}
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/cashflow")
def reports_cashflow():
    db: Session = SessionLocal()
    try:
        payload = build_reports_payload(db)
        result = {
            **payload["cashflow"],
            "receipts": payload["receipts"],
            "payments": payload["payments"],
        }
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/top-customers")
def reports_top_customers():
    db: Session = SessionLocal()
    try:
        payload = build_reports_payload(db)
        result = {"debtors": payload["top_debtors"], "creditors": payload["top_creditors"]}
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/inventory")
def reports_inventory():
    db: Session = SessionLocal()
    try:
        result = build_reports_payload(db)["inventory"]
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/sales")
def reports_sales():
    db: Session = SessionLocal()
    try:
        result = build_reports_payload(db)["sales"]
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/reports/purchases")
def reports_purchases():
    db: Session = SessionLocal()
    try:
        result = build_reports_payload(db)["purchases"]
        db.close()
        return result
    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}


@app.get("/activity")
def activity_feed():
    return get_recent_activity()


@app.get("/roles")
def get_roles():
    return {
        "roles": [
            {"key": "admin", "title": "Admin", "permissions": ["all"]},
            {"key": "manager", "title": "Manager", "permissions": ["dashboard", "customers", "products", "invoices", "reports"]},
            {"key": "accountant", "title": "Accountant", "permissions": ["dashboard", "invoices", "expenses", "reports", "exports"]},
            {"key": "cashier", "title": "Cashier", "permissions": ["dashboard", "customers", "invoices"]},
        ]
    }


@app.get("/backup/create")
def backup_create(request: Request):
    """Administrator-only compatibility route; prefer POST /api/backups."""
    require_admin(request)
    return create_database_backup(kind="manual")


def _esc(value):
    if value is None:
        return ""
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#039;")
    )


def _fmt_money(value, settings=None, language="fa"):
    return format_report_money(value, settings, language)


def _fmt_date(value, settings=None, language="fa"):
    return format_report_date(value, settings, language, include_time=True)


def _print_label(language, fa, en):
    return fa if language == "fa" else en


def _print_page(title: str, body_html: str, language="fa"):
    language = "fa" if language == "fa" else "en"
    direction = "rtl" if language == "fa" else "ltr"
    return HTMLResponse(f"""
    <!doctype html>
    <html lang="{language}" dir="{direction}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{_esc(title)}</title>
      <style>
        * {{ box-sizing: border-box; }}
        body {{ margin: 0; background: #e5e7eb; font-family: Tahoma, Arial, sans-serif; color: #0f172a; }}
        .page {{ width: 210mm; min-height: 297mm; margin: 16px auto; background: white; padding: 18mm; box-shadow: 0 20px 60px rgba(15,23,42,.18); }}
        .top {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #06b6d4; padding-bottom: 14px; margin-bottom: 16px; gap: 16px; }}
        .brand {{ font-size: 28px; font-weight: 900; color: #0891b2; }}
        .muted {{ color: #64748b; font-size: 12px; line-height: 1.9; }}
        h1 {{ margin: 0 0 8px; font-size: 24px; }}
        .grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 14px 0; }}
        .box {{ border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px; min-height: 54px; }}
        .label {{ color: #64748b; font-size: 12px; margin-bottom: 5px; }}
        .value {{ font-weight: 900; font-size: 14px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 14px; }}
        th {{ background: #0f172a; color: white; }}
        th, td {{ border: 1px solid #cbd5e1; padding: 9px; text-align: right; font-size: 13px; }}
        .totals {{ margin-top: 14px; margin-right: auto; width: 45%; }}
        .totals .row {{ display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 8px 0; }}
        .totals .final {{ font-size: 18px; font-weight: 900; color: #0891b2; }}
        .footer {{ margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
        .sign {{ border-top: 1px dashed #64748b; padding-top: 10px; text-align: center; color: #64748b; min-height: 70px; }}
        .actions {{ position: sticky; top: 0; background: #0f172a; padding: 10px; text-align: center; z-index: 10; }}
        .actions button {{ background: #22d3ee; color: #071028; border: none; border-radius: 12px; padding: 10px 18px; font-weight: 900; cursor: pointer; margin: 0 5px; }}
        @media print {{ body {{ background: white; }} .page {{ margin: 0; box-shadow: none; width: auto; min-height: auto; }} .actions {{ display: none; }} }}
      </style>
    </head>
    <body>
      <div class="actions">
        <button onclick="window.print()">چاپ / ذخیره PDF</button>
        <button onclick="window.close()">بستن</button>
      </div>
      <div class="page">{body_html}</div>
    </body>
    </html>
    """)


@app.get("/print/invoice/{invoice_id}")
def print_invoice_preview(
    invoice_id: int,
    page_size: str = "A4",
    template: str = "official",
    edit: int = 1,
    language: str = "fa",
):
    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            db.close()
            return HTMLResponse("<h2>فاکتور پیدا نشد</h2>", status_code=404)

        settings = get_or_create_settings(db)
        customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice.id).all()

        receipt_entries = db.query(AccountingEntry).filter(
            AccountingEntry.source_type == "receipt",
            AccountingEntry.source_id == invoice.id,
        ).all()

        payment_entries = db.query(AccountingEntry).filter(
            AccountingEntry.source_type == "payment",
            AccountingEntry.source_id == invoice.id,
        ).all()

        language = "fa" if language == "fa" else "en"
        def fa_digits(value):
            return localized_digits(value, language)

        def money(value):
            return format_report_money(value, settings, language)

        def status_fa(value):
            raw = str(value or "").lower()
            labels = {
                "paid": "تسویه شده", "unpaid": "تسویه نشده",
                "partial": "تسویه ناقص", "draft": "پیش نویس", "final": "نهایی",
            } if language == "fa" else {
                "paid": "Paid", "unpaid": "Unpaid", "partial": "Partially paid",
                "draft": "Draft", "final": "Final",
            }
            return labels.get(raw, raw or "-")

        def invoice_type_fa(value):
            raw = str(value or "")
            labels = {
                "sale": "فاکتور فروش", "buy": "فاکتور خرید",
                "proforma": "پیش فاکتور", "return_sale": "مرجوعی فروش",
                "return_buy": "مرجوعی خرید",
            } if language == "fa" else {
                "sale": "Sales invoice", "buy": "Purchase invoice",
                "proforma": "Proforma invoice", "return_sale": "Sales return",
                "return_buy": "Purchase return",
            }
            return labels.get(raw, raw or "-")

        def make_qr_data_uri(payload):
            try:
                import io
                import base64
                import qrcode

                qr = qrcode.QRCode(version=1, box_size=4, border=2)
                qr.add_data(payload)
                qr.make(fit=True)
                img = qr.make_image(fill_color="black", back_color="white")
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            except Exception:
                return ""

        def make_barcode_data_uri(value):
            try:
                import base64
                from reportlab.graphics.barcode import createBarcodeDrawing
                from reportlab.graphics import renderPM

                drawing = createBarcodeDrawing(
                    "Code128",
                    value=str(value),
                    barHeight=38,
                    barWidth=1.1,
                    humanReadable=True,
                )
                raw = renderPM.drawToString(drawing, fmt="PNG")
                return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
            except Exception:
                return ""

        received_amount = sum(float(e.credit or 0) for e in receipt_entries)
        paid_amount = sum(float(e.debit or 0) for e in payment_entries)

        if invoice.invoice_type in ["sale", "return_buy"]:
            settled_amount = received_amount
        elif invoice.invoice_type in ["buy", "return_sale"]:
            settled_amount = paid_amount
        else:
            settled_amount = 0

        total_amount = float(invoice.total_amount or 0)
        remaining_amount = max(total_amount - settled_amount, 0)
        invoice_title = invoice_type_fa(invoice.invoice_type)

        company_name = getattr(settings, "company_name", "") or "Vetrix ERP"
        manager_name = getattr(settings, "manager_name", "") or ""
        phone = getattr(settings, "phone", "") or ""
        mobile = getattr(settings, "mobile", "") or ""
        email = getattr(settings, "email", "") or ""
        website = getattr(settings, "website", "") or ""
        address = getattr(settings, "address", "") or ""
        national_id = getattr(settings, "national_id", "") or ""
        economic_code = getattr(settings, "economic_code", "") or ""
        invoice_footer = getattr(settings, "invoice_footer", "") or ""
        logo_data = getattr(settings, "logo_data", "") or ""
        stamp_data = getattr(settings, "stamp_data", "") or ""
        signature_data = getattr(settings, "signature_data", "") or ""
        show_logo = bool(getattr(settings, "show_logo", True))
        show_qr = bool(getattr(settings, "show_qr", True))
        show_barcode = bool(getattr(settings, "show_barcode", True))

        logo_html = f'<img class="logo-img" src="{_esc(logo_data)}" alt="logo" />' if show_logo and logo_data else ""
        stamp_html = f'<img class="stamp-img" src="{_esc(stamp_data)}" alt="stamp" />' if stamp_data else ""
        signature_html = f'<img class="stamp-img" src="{_esc(signature_data)}" alt="signature" />' if signature_data else ""

        company_rows = ""
        if manager_name:
            company_rows += f"<div>مدیر: {_esc(manager_name)}</div>"
        if phone:
            company_rows += f"<div>تلفن: {fa_digits(_esc(phone))}</div>"
        if mobile:
            company_rows += f"<div>موبایل: {fa_digits(_esc(mobile))}</div>"
        if email:
            company_rows += f"<div>ایمیل: {_esc(email)}</div>"
        if website:
            company_rows += f"<div>وب سایت: {_esc(website)}</div>"
        if national_id:
            company_rows += f"<div>شناسه ملی: {fa_digits(_esc(national_id))}</div>"
        if economic_code:
            company_rows += f"<div>کد اقتصادی: {fa_digits(_esc(economic_code))}</div>"
        if address:
            company_rows += f"<div>آدرس: {_esc(address)}</div>"

        rows = ""
        for index, item in enumerate(items, start=1):
            product = db.query(Product).filter(Product.id == item.product_id).first()
            rows += f"""
            <tr>
              <td>{fa_digits(index)}</td>
              <td>{_esc(product.name if product else "نامشخص")}</td>
              <td>{fa_digits(item.quantity)}</td>
              <td>{money(item.unit_price)}</td>
              <td>{money(item.total_price)}</td>
            </tr>
            """

        customer_phone = getattr(customer, "phone", "") if customer else ""
        customer_address = getattr(customer, "address", "") if customer else ""
        qr_payload = f"Vetrix ERP | Invoice #{invoice.id} | Total: {total_amount} | Remaining: {remaining_amount}"
        qr_uri = make_qr_data_uri(qr_payload) if show_qr else ""
        barcode_uri = make_barcode_data_uri(f"VETRIX-{invoice.id}") if show_barcode else ""

        qr_html = f'<img class="qr-img" src="{qr_uri}" alt="QR" />' if qr_uri else ""
        barcode_html = f'<img class="barcode-img" src="{barcode_uri}" alt="barcode" />' if barcode_uri else ""

        page_class = "a4"
        if page_size.upper() == "A5":
            page_class = "a5"
        elif page_size.upper() == "THERMAL80":
            page_class = "thermal80"
        elif page_size.upper() == "THERMAL58":
            page_class = "thermal58"

        editable = "true" if int(edit or 0) == 1 else "false"

        body = f"""
        <style>
          @page {{ size: A4; margin: 8mm; }}
          body {{ background:#e5e7eb; }}
          .toolbar {{
            position: sticky;
            top: 0;
            z-index: 999;
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: center;
            padding: 10px;
            background: #071028;
            border-bottom: 1px solid #164e63;
            direction: rtl;
          }}
          .toolbar button, .toolbar select {{
            border: 0;
            border-radius: 14px;
            padding: 10px 14px;
            font-weight: 900;
            background: #22d3ee;
            color: #06202a;
            cursor: pointer;
          }}
          .toolbar select {{ background:#1e3a8a; color:white; }}
          .page {{
            direction: rtl;
            text-align: right;
            background: white;
            color: #0f172a;
            width: 210mm;
            min-height: 297mm;
            margin: 16px auto;
            padding: 16mm;
            box-sizing: border-box;
            font-family: Tahoma, Arial, sans-serif;
          }}
          .page.a5 {{ width: 148mm; min-height: 210mm; padding: 10mm; }}
          .page.thermal80 {{ width: 80mm; min-height: auto; padding: 4mm; font-size: 10px; }}
          .page.thermal58 {{ width: 58mm; min-height: auto; padding: 3mm; font-size: 9px; }}
          .template-premium .brand {{ font-size: 34px; }}
          .template-compact .company-info {{ display:none; }}
          .top {{
            display: grid;
            grid-template-columns: 1fr 1.2fr;
            gap: 18px;
            align-items: start;
            border-bottom: 2px solid #67e8f9;
            padding-bottom: 18px;
            margin-bottom: 18px;
          }}
          .brand-box {{ display: flex; gap: 14px; align-items: center; justify-content: flex-end; }}
          .logo-img {{
            width: 132px;
            max-height: 78px;
            object-fit: contain;
            border-radius: 14px;
            border: 1px solid #dbeafe;
            padding: 6px;
            background: #fff;
          }}
          .brand {{ font-size: 28px; font-weight: 900; color: #0891b2; }}
          .company-info {{ font-size: 12px; color: #334155; line-height: 1.9; margin-top: 8px; }}
          .invoice-title {{ text-align: right; }}
          .invoice-title h1 {{ margin: 0 0 8px; font-size: 32px; color: #0f172a; }}
          .muted {{ color: #64748b; font-size: 12px; }}
          .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0; }}
          .box {{ border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #ffffff; }}
          .label {{ color: #64748b; font-size: 12px; margin-bottom: 6px; }}
          .value {{ color: #0f172a; font-weight: 800; line-height: 1.8; }}
          table {{ width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }}
          th {{ background: #0f172a; color: white; padding: 10px; border: 1px solid #334155; }}
          td {{ padding: 9px; border: 1px solid #e2e8f0; text-align: center; }}
          tbody tr:nth-child(even) {{ background: #f8fafc; }}
          .totals {{
            width: 46%;
            margin-top: 18px;
            margin-right: auto;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            overflow: hidden;
          }}
          .row {{ display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; }}
          .row.final {{ background: #ecfeff; color: #0891b2; font-size: 17px; font-weight: 900; }}
          .tracking {{ margin-top: 12px; direction: rtl; text-align: right; }}
          .codes {{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:12px; align-items:center; }}
          .qr-img {{ width:96px; height:96px; object-fit:contain; }}
          .barcode-img {{ max-width:260px; max-height:74px; object-fit:contain; }}
          .footer {{ display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 30px; }}
          .sign {{ border-top: 1px dashed #94a3b8; padding-top: 10px; text-align: center; color: #64748b; min-height: 86px; }}
          .stamp-img {{ max-width: 130px; max-height: 76px; object-fit: contain; display: block; margin: 8px auto 0; }}
          [contenteditable="true"]:focus {{ outline:2px dashed #22d3ee; background:#ecfeff; }}
          .thermal80 .top, .thermal58 .top, .thermal80 .grid, .thermal58 .grid {{
            display:block;
          }}
          .thermal80 .logo-img, .thermal58 .logo-img {{ width:60px; max-height:38px; }}
          .thermal80 .brand, .thermal58 .brand {{ font-size:16px; }}
          .thermal80 .invoice-title h1, .thermal58 .invoice-title h1 {{ font-size:18px; }}
          .thermal80 .totals, .thermal58 .totals {{ width:100%; }}
          .thermal80 .codes, .thermal58 .codes {{ display:block; text-align:center; }}
          .thermal80 .footer, .thermal58 .footer {{ display:block; }}
          @media print {{
            body {{ background:white !important; }}
            .toolbar {{ display:none !important; }}
            .page {{ margin:0 auto; box-shadow:none; }}
          }}
        </style>

        <div class="toolbar no-print">
          <button onclick="window.print()">{_print_label(language, 'چاپ / ذخیره', 'Print / Save')} PDF</button>
          <button onclick="toggleEdit()">{_print_label(language, 'ویرایش صفحه', 'Edit page')}</button>
          <select onchange="setSize(this.value)">
            <option value="a4">A4 {_print_label(language, 'رسمی', 'Official')}</option>
            <option value="a5">A5 {_print_label(language, 'جمع و جور', 'Compact')}</option>
            <option value="thermal80">{_print_label(language, 'فیش ۸۰ میلی متر', '80 mm receipt')}</option>
            <option value="thermal58">{_print_label(language, 'فیش ۵۸ میلی متر', '58 mm receipt')}</option>
          </select>
          <select onchange="setTemplate(this.value)">
            <option value="official">{_print_label(language, 'رسمی', 'Official')}</option>
            <option value="premium">{_print_label(language, 'پرمیوم', 'Premium')}</option>
            <option value="compact">{_print_label(language, 'فشرده', 'Compact')}</option>
          </select>
        </div>

        <div id="invoicePage" class="page {page_class} template-{template}" contenteditable="{editable}">
          <div class="top">
            <div class="invoice-title">
              <h1>{_esc(invoice_title)}</h1>
              <div class="muted">{_print_label(language, 'شماره:', 'Number:')} #{fa_digits(invoice.id)}</div>
              <div class="muted">{_print_label(language, 'تاریخ:', 'Date:')} {fa_digits(_fmt_date(invoice.created_at, settings, language))}</div>
            </div>

            <div class="brand-box">
              {logo_html}
              <div>
                <div class="brand">{_esc(company_name)}</div>
                <div class="muted">{_print_label(language, 'سیستم حسابداری و مدیریت فروش', 'Accounting and sales management')}</div>
                <div class="company-info">{company_rows}</div>
              </div>
            </div>
          </div>

          <div class="grid">
            <div class="box"><div class="label">{_print_label(language, 'طرف حساب', 'Party')}</div><div class="value">{_esc(customer.name if customer else "-")}</div></div>
            <div class="box"><div class="label">{_print_label(language, 'موبایل / تلفن', 'Mobile / Phone')}</div><div class="value">{fa_digits(_esc(customer_phone)) if customer_phone else "{_print_label(language, 'ثبت نشده', 'Not registered')}"}</div></div>
            <div class="box"><div class="label">{_print_label(language, 'آدرس', 'Address')}</div><div class="value">{_esc(customer_address) if customer_address else "{_print_label(language, 'ثبت نشده', 'Not registered')}"}</div></div>
            <div class="box"><div class="label">{_print_label(language, 'وضعیت تسویه', 'Settlement status')}</div><div class="value">{status_fa(getattr(invoice, "payment_status", "unpaid"))}</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>{_print_label(language, 'ردیف', 'Row')}</th>
                <th>{_print_label(language, '{_print_label(language, 'شرح', 'Description')} کالا / خدمات', 'Product / Service')}</th>
                <th>{_print_label(language, 'تعداد', 'Quantity')}</th>
                <th>{_print_label(language, 'قیمت واحد', 'Unit price')}</th>
                <th>جمع</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>

          <div class="totals">
            <div class="row"><span>{_print_label(language, 'جمع جزء', 'Subtotal')}</span><strong>{money(getattr(invoice, "subtotal", 0))}</strong></div>
            <div class="row"><span>{_print_label(language, 'تخفیف', 'Discount')}</span><strong>{money(getattr(invoice, "discount_amount", 0))}</strong></div>
            <div class="row"><span>{_print_label(language, 'مالیات', 'Tax')}</span><strong>{money(getattr(invoice, "tax_amount", 0))}</strong></div>
            <div class="row"><span>{_print_label(language, 'حمل', 'Shipping')}</span><strong>{money(getattr(invoice, "shipping_cost", 0))}</strong></div>
            <div class="row final"><span>{_print_label(language, '{_print_label(language, 'مبلغ', 'Amount')} نهایی', 'Grand total')}</span><strong>{money(total_amount)}</strong></div>
            <div class="row"><span>{_print_label(language, 'پرداخت / دریافت شده', 'Settled')}</span><strong>{money(settled_amount)}</strong></div>
            <div class="row"><span>{_print_label(language, 'باقی مانده', 'Remaining')}</span><strong>{money(remaining_amount)}</strong></div>
          </div>

          <div class="box" style="margin-top:16px">
            <div class="label">{_print_label(language, 'توضیحات', 'Notes')}</div>
            <div class="value">{_esc(getattr(invoice, "invoice_note", "") or "-")}</div>
          </div>

          <div class="box tracking">
            <div class="label">{_print_label(language, 'اطلاعات تراکنش', 'Transaction details')}</div>
            <div class="value">فاکتور شماره {fa_digits(invoice.id)} | {_print_label(language, '{_print_label(language, 'مبلغ', 'Amount')} کل:', 'Total:')} {money(total_amount)} | {_print_label(language, 'باقی مانده', 'Remaining')}: {money(remaining_amount)}</div>
          </div>

          <div class="codes">
            <div class="box" style="text-align:center">
              <div class="label">{_print_label(language, 'QR فاکتور', 'Invoice QR')}</div>
              {qr_html or "<div class='value'>{_print_label(language, 'QR فعال نیست', 'QR is disabled')}</div>"}
            </div>
            <div class="box" style="text-align:center">
              <div class="label">{_print_label(language, 'بارکد فاکتور', 'Invoice barcode')}</div>
              {barcode_html or "<div class='value'>{_print_label(language, 'بارکد فعال نیست', 'Barcode is disabled')}</div>"}
            </div>
          </div>

          <div class="box" style="margin-top:14px">
            <div class="value">{_esc(invoice_footer or "{_print_label(language, 'با تشکر از اعتماد شما', 'Thank you for your trust')}")}</div>
          </div>

          <div class="footer">
            <div class="sign">
              {_print_label(language, 'امضاء فروشنده / حسابدار', 'Seller / Accountant signature')}
              {signature_html}
            </div>
            <div class="sign">
              مهر شرکت / امضاء {_print_label(language, 'طرف حساب', 'Party')}
              {stamp_html}
            </div>
          </div>
        </div>

        <script>
          let editable = {str(bool(int(edit or 0))).lower()};
          function setSize(size) {{
            const page = document.getElementById("invoicePage");
            page.classList.remove("a4", "a5", "thermal80", "thermal58");
            page.classList.add(size);
          }}
          function setTemplate(template) {{
            const page = document.getElementById("invoicePage");
            page.classList.remove("template-official", "template-premium", "template-compact");
            page.classList.add("template-" + template);
          }}
          function toggleEdit() {{
            editable = !editable;
            document.getElementById("invoicePage").setAttribute("contenteditable", editable ? "true" : "false");
            alert(editable ? "{_print_label(language, 'ویرایش صفحه', 'Edit page')} فعال شد. روی متن‌ها کلیک کنید و تغییر دهید." : "{_print_label(language, 'ویرایش صفحه', 'Edit page')} غیرفعال شد.");
          }}
        </script>
        """

        db.close()
        return _print_page(invoice_title, body, language)

    except Exception as e:
        db.close()
        return HTMLResponse(f"<h2>خطا</h2><pre>{_esc(e)}</pre>", status_code=500)

@app.get("/print/transaction/{entry_id}")
def print_transaction_receipt(entry_id: int, language: str = "fa"):
    db: Session = SessionLocal()
    try:
        entry = db.query(AccountingEntry).filter(AccountingEntry.id == entry_id).first()
        if not entry:
            db.close()
            return HTMLResponse("<h2>Transaction not found</h2>", status_code=404)

        language = "fa" if language == "fa" else "en"
        settings = get_or_create_settings(db)
        customer = db.query(Customer).filter(Customer.id == entry.customer_id).first()

        invoice = None
        if entry.source_id:
            invoice = db.query(Invoice).filter(Invoice.id == entry.source_id).first()

        is_receipt = entry.source_type == "receipt"
        title = (_print_label(language, "رسید دریافت", "Receipt") if is_receipt else _print_label(language, "رسید پرداخت", "Payment"))
        amount = float(entry.credit or entry.debit or 0)
        method = "-"

        body = f"""
        <div class="top">
          <div>
            <div class="brand">Vetrix ERP</div>
            <div class="muted">رسید {_print_label(language, 'رسمی', 'Official')} دریافت و پرداخت</div>
          </div>
          <div style="text-align:left">
            <h1>{_esc(title)}</h1>
            <div class="muted">{_print_label(language, 'شماره رسید:', 'Voucher number:')} #{entry.id}</div>
            <div class="muted">{_print_label(language, 'تاریخ:', 'Date:')} {_fmt_date(entry.created_at, settings, language)}</div>
          </div>
        </div>

        <div class="grid">
          <div class="box"><div class="label">{_print_label(language, 'طرف حساب', 'Party')}</div><div class="value">{_esc(customer.name if customer else "-")}</div></div>
          <div class="box"><div class="label">{_print_label(language, 'موبایل / تلفن', 'Mobile / Phone')}</div><div class="value">{_esc(getattr(customer, "phone", "") if customer else "-")}</div></div>
          <div class="box"><div class="label">{_print_label(language, 'نوع سند', 'Document type')}</div><div class="value">{_esc(title)}</div></div>
          <div class="box"><div class="label">{_print_label(language, 'مبلغ', 'Amount')}</div><div class="value">{_fmt_money(amount, settings, language)}</div></div>
          <div class="box"><div class="label">{_print_label(language, 'روش پرداخت', 'Payment method')}</div><div class="value">{_esc(method)}</div></div>
          <div class="box"><div class="label">{_print_label(language, 'فاکتور مرتبط', 'Linked invoice')}</div><div class="value">{("#" + str(invoice.id)) if invoice else "{_print_label(language, 'بدون فاکتور', 'No linked invoice')}"}</div></div>
        </div>

        <div class="box" style="margin-top:16px">
          <div class="label">{_print_label(language, 'شرح', 'Description')}</div>
          <div class="value">{_esc(entry.description)}</div>
        </div>

        <div class="box" style="margin-top:12px">
          <div class="label">{_print_label(language, 'مانده بعد از ثبت', 'Balance after posting')}</div>
          <div class="value">{_fmt_money(entry.balance_after, settings, language)}</div>
        </div>

        <div class="footer">
          <div class="sign">{_print_label(language, 'امضاء دریافت‌کننده', 'Recipient signature')}</div>
          <div class="sign">{_print_label(language, 'امضاء پرداخت‌کننده', 'Payer signature')}</div>
        </div>
        """

        db.close()
        return _print_page(title, body, language)

    except Exception as e:
        db.close()
        return HTMLResponse(f"<h2>Error</h2><pre>{_esc(e)}</pre>", status_code=500)


@app.get("/print/receipt/{entry_id}")
def print_receipt_alias(entry_id: int):
    return print_transaction_receipt(entry_id)


@app.get("/export/invoices-pdf")
def export_pdf(
    page_size: str = "A4",
    template: str = "official",
    orientation: str = "portrait",
    language: str = "fa",
):
    db: Session = SessionLocal()
    try:
        invoices = db.query(Invoice).all()
        settings = get_or_create_settings(db)

        customer_ids = [i.customer_id for i in invoices if getattr(i, "customer_id", None)]
        customers = {}
        if customer_ids:
            customer_rows = db.query(Customer).filter(Customer.id.in_(customer_ids)).all()
            customers = {c.id: c.name for c in customer_rows}

        path = build_invoice_pdf(
            invoices,
            language=language,
            settings=settings,
            customers=customers,
            page_size=page_size,
            orientation=orientation,
            template=template,
            filename="vetrix_invoices.pdf",
        )

        db.close()
        return FileResponse(
            path,
            media_type="application/pdf",
            filename=f"vetrix_invoices_{page_size}_{template}.pdf",
        )

    except Exception as e:
        db.close()
        return {"status": "error", "message": str(e)}





@app.get("/export/invoices-excel")
def export_excel(language: str = "en"):
    db: Session = SessionLocal()
    try:
        language = "fa" if language == "fa" else "en"
        invoices = db.query(Invoice).all()
        settings = get_or_create_settings(db)
        customer_ids = [item.customer_id for item in invoices if item.customer_id]
        customer_rows = (
            db.query(Customer).filter(Customer.id.in_(customer_ids)).all()
            if customer_ids else []
        )
        customers = {customer.id: customer.name for customer in customer_rows}
        path = build_invoice_excel(
            invoices,
            settings=settings,
            customers=customers,
            language=language,
        )
        return FileResponse(
            path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"vetrix_invoices_{language}.xlsx",
        )
    finally:
        db.close()
