import io
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from sqlalchemy import text

from app.accounting.integrity import money
from app.accounting.posting import post_balanced_voucher
from app.database import engine
from app.financial_policy import financial_policy_values

router = APIRouter(prefix="/api/data-import", tags=["Safe Data Import"])
MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 5000
ENTITY_FIELDS = {
    "customers": {
        "name": ("name", "نام", "نام طرف حساب", "نام طرف‌حساب"),
        "phone": ("phone", "تلفن", "موبایل"),
        "email": ("email", "ایمیل"),
        "address": ("address", "آدرس"),
        "city": ("city", "شهر"),
        "national_id": ("national_id", "شناسه ملی", "کد ملی"),
        "economic_code": ("economic_code", "کد اقتصادی"),
        "contact_person": ("contact_person", "شخص رابط"),
        "customer_type": ("customer_type", "نوع طرف حساب", "نوع طرف‌حساب"),
        "opening_balance": ("opening_balance", "مانده افتتاحیه", "مانده اول دوره"),
        "credit_limit": ("credit_limit", "سقف اعتبار"),
        "notes": ("notes", "یادداشت", "توضیحات"),
    },
    "products": {
        "name": ("name", "نام", "نام کالا"),
        "code": ("code", "کد", "کد کالا"),
        "barcode": ("barcode", "بارکد"),
        "sku": ("sku",),
        "brand": ("brand", "برند"),
        "unit": ("unit", "واحد"),
        "buy_price": ("buy_price", "قیمت خرید"),
        "sell_price": ("sell_price", "قیمت فروش"),
        "stock": ("stock", "موجودی", "موجودی اولیه"),
        "min_stock": ("min_stock", "حداقل موجودی"),
        "main_category": ("main_category", "گروه اصلی"),
        "sub_category": ("sub_category", "گروه فرعی"),
    },
}
NUMERIC_FIELDS = {"opening_balance", "credit_limit", "buy_price", "sell_price", "stock", "min_stock"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _admin(request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    try:
        return int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS data_import_batches (
            id VARCHAR PRIMARY KEY,
            entity_type VARCHAR NOT NULL,
            file_name VARCHAR NOT NULL,
            status VARCHAR NOT NULL,
            total_rows INTEGER NOT NULL,
            valid_rows INTEGER NOT NULL,
            error_rows INTEGER NOT NULL,
            duplicate_rows INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            result_json TEXT DEFAULT '',
            created_by INTEGER NOT NULL,
            created_at VARCHAR NOT NULL,
            applied_at VARCHAR,
            FOREIGN KEY(created_by) REFERENCES users(id)
        )
    """))


def _clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _number(value, field, row_number, errors):
    if value in (None, ""):
        return 0.0
    try:
        result = float(str(value).replace(",", "").replace("٬", ""))
        if field in {"credit_limit", "buy_price", "sell_price", "stock", "min_stock"} and result < 0:
            errors.append({"row": row_number, "field": field, "message": "Value cannot be negative"})
        return result
    except (TypeError, ValueError):
        errors.append({"row": row_number, "field": field, "message": "Invalid number"})
        return 0.0


def _mapping(headers, entity):
    aliases = ENTITY_FIELDS[entity]
    normalized = {_clean(value).lower(): index for index, value in enumerate(headers)}
    result = {}
    for field, names in aliases.items():
        for name in names:
            if name.lower() in normalized:
                result[field] = normalized[name.lower()]
                break
    if "name" not in result:
        raise HTTPException(status_code=400, detail="Required name column is missing")
    return result


def _existing_keys(conn, entity):
    if entity == "customers":
        rows = conn.execute(text("SELECT name, phone, national_id FROM customers")).mappings()
        return {
            ("national", _clean(row["national_id"]).lower()) if _clean(row["national_id"])
            else ("name_phone", _clean(row["name"]).lower(), _clean(row["phone"]).lower())
            for row in rows
        }
    rows = conn.execute(text("SELECT name, code, barcode FROM products")).mappings()
    return {
        ("code", _clean(row["code"]).lower()) if _clean(row["code"])
        else ("barcode", _clean(row["barcode"]).lower()) if _clean(row["barcode"])
        else ("name", _clean(row["name"]).lower())
        for row in rows
    }


def _row_key(entity, row):
    if entity == "customers":
        return (
            ("national", row["national_id"].lower())
            if row.get("national_id")
            else ("name_phone", row["name"].lower(), row.get("phone", "").lower())
        )
    return (
        ("code", row["code"].lower()) if row.get("code")
        else ("barcode", row["barcode"].lower()) if row.get("barcode")
        else ("name", row["name"].lower())
    )


@router.get("/template/{entity}")
def download_template(entity: str, request: Request, language: str = "en"):
    _admin(request)
    if entity not in ENTITY_FIELDS:
        raise HTTPException(status_code=404, detail="Unsupported import entity")
    fa = language == "fa"
    headers = {
        "customers": (
            ["نام طرف‌حساب", "تلفن", "ایمیل", "آدرس", "شهر", "شناسه ملی",
             "کد اقتصادی", "شخص رابط", "نوع طرف‌حساب", "مانده افتتاحیه",
             "سقف اعتبار", "یادداشت"]
            if fa else
            ["name", "phone", "email", "address", "city", "national_id",
             "economic_code", "contact_person", "customer_type", "opening_balance",
             "credit_limit", "notes"]
        ),
        "products": (
            ["نام کالا", "کد کالا", "بارکد", "SKU", "برند", "واحد",
             "قیمت خرید", "قیمت فروش", "موجودی اولیه", "حداقل موجودی",
             "گروه اصلی", "گروه فرعی"]
            if fa else
            ["name", "code", "barcode", "sku", "brand", "unit", "buy_price",
             "sell_price", "stock", "min_stock", "main_category", "sub_category"]
        ),
    }[entity]
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = ("طرف‌حساب‌ها" if entity == "customers" else "کالاها") if fa else entity.title()
    sheet.sheet_view.rightToLeft = fa
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0F172A")
    sample = (
        ["نمونه", "09120000000", "sample@example.com", "", "", "", "", "",
         "customer", 0, 0, ""]
        if entity == "customers" else
        ["نمونه کالا", "P-001", "", "", "", "عدد", 0, 0, 0, 0, "", ""]
    )
    if not fa:
        sample[0] = "Sample" if entity == "customers" else "Sample product"
        if entity == "products":
            sample[5] = "unit"
    sheet.append(sample)
    sheet.freeze_panes = "A2"
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = 19
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"vetrix_{entity}_import_{'fa' if fa else 'en'}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/preview/{entity}")
async def preview_import(entity: str, request: Request, file: UploadFile = File(...)):
    actor = _admin(request)
    if entity not in ENTITY_FIELDS:
        raise HTTPException(status_code=404, detail="Unsupported import entity")
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are accepted")
    try:
        workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        headers = next(rows)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Invalid Excel workbook: {error}")
    column_map = _mapping(headers, entity)
    parsed, errors, warnings = [], [], []
    seen = set()
    with engine.begin() as conn:
        _ensure_schema(conn)
        existing = _existing_keys(conn, entity)
        for row_number, values in enumerate(rows, start=2):
            if row_number - 1 > MAX_ROWS:
                raise HTTPException(status_code=400, detail=f"Maximum {MAX_ROWS} data rows allowed")
            if not any(value not in (None, "") for value in values):
                continue
            item = {}
            row_errors = []
            for field in ENTITY_FIELDS[entity]:
                value = values[column_map[field]] if field in column_map and column_map[field] < len(values) else ""
                item[field] = _number(value, field, row_number, row_errors) if field in NUMERIC_FIELDS else _clean(value)
            if not item["name"]:
                row_errors.append({"row": row_number, "field": "name", "message": "Name is required"})
            if entity == "customers" and item["customer_type"] not in {"", "customer", "supplier", "both"}:
                row_errors.append({"row": row_number, "field": "customer_type", "message": "Use customer, supplier, or both"})
            item["customer_type"] = item.get("customer_type") or "customer"
            item["unit"] = item.get("unit") or "عدد"
            key = _row_key(entity, item)
            duplicate = key in seen or key in existing
            if duplicate:
                warnings.append({"row": row_number, "field": "duplicate", "message": "Duplicate row will be skipped"})
            seen.add(key)
            parsed.append({"row": row_number, "data": item, "errors": row_errors, "duplicate": duplicate})
            errors.extend(row_errors)
        batch_id = str(uuid.uuid4())
        valid = sum(not row["errors"] and not row["duplicate"] for row in parsed)
        conn.execute(text("""
            INSERT INTO data_import_batches
              (id, entity_type, file_name, status, total_rows, valid_rows,
               error_rows, duplicate_rows, payload_json, created_by, created_at)
            VALUES
              (:id, :entity, :file_name, 'previewed', :total, :valid,
               :errors, :duplicates, :payload, :actor, :created_at)
        """), {
            "id": batch_id, "entity": entity, "file_name": file.filename or "import.xlsx",
            "total": len(parsed), "valid": valid,
            "errors": sum(bool(row["errors"]) for row in parsed),
            "duplicates": sum(row["duplicate"] for row in parsed),
            "payload": json.dumps(parsed, ensure_ascii=False),
            "actor": actor, "created_at": _now(),
        })
    return {
        "batch_id": batch_id, "entity": entity, "total_rows": len(parsed),
        "valid_rows": valid, "error_rows": sum(bool(row["errors"]) for row in parsed),
        "duplicate_rows": sum(row["duplicate"] for row in parsed),
        "errors": errors[:100], "warnings": warnings[:100], "preview": parsed[:50],
        "can_apply": valid > 0 and not errors,
    }


def _post_customer_opening(conn, customer_id, name, balance, policy):
    amount = float(money(abs(balance), policy["decimal_places"], policy["rounding_mode"]))
    if not amount:
        return
    description = f"Imported opening balance: {name}"
    lines = (
        [{"account_code": "1103", "debit": amount}, {"account_code": "3101", "credit": amount}]
        if balance > 0 else
        [{"account_code": "3101", "debit": amount}, {"account_code": "2101", "credit": amount}]
    )
    post_balanced_voucher("customer_opening", customer_id, description, lines, connection=conn)


def _post_product_opening(conn, product_id, name, stock, buy_price, policy):
    amount = float(money(stock * buy_price, policy["decimal_places"], policy["rounding_mode"]))
    if not amount:
        return
    description = f"Imported opening inventory: {name}"
    post_balanced_voucher("product_opening", product_id, description, [
        {"account_code": "1201", "debit": amount},
        {"account_code": "3101", "credit": amount},
    ], connection=conn)


@router.post("/apply/{batch_id}")
def apply_import(batch_id: str, request: Request):
    actor = _admin(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        batch = conn.execute(text(
            "SELECT * FROM data_import_batches WHERE id=:id"
        ), {"id": batch_id}).mappings().first()
        if not batch:
            raise HTTPException(status_code=404, detail="Import batch not found")
        if batch["created_by"] != actor:
            raise HTTPException(status_code=403, detail="Only the preview creator can apply this batch")
        if batch["status"] != "previewed":
            raise HTTPException(status_code=409, detail="Import batch has already been applied")
        rows = json.loads(batch["payload_json"])
        if any(row["errors"] for row in rows):
            raise HTTPException(status_code=409, detail="Resolve validation errors before applying")
        policy = financial_policy_values(conn)
        inserted = skipped = 0
        existing = _existing_keys(conn, batch["entity_type"])
        for row in rows:
            item = row["data"]
            if row["duplicate"] or _row_key(batch["entity_type"], item) in existing:
                skipped += 1
                continue
            if batch["entity_type"] == "customers":
                result = conn.execute(text("""
                    INSERT INTO customers
                      (name, phone, email, address, city, national_id, economic_code,
                       contact_person, customer_type, opening_balance, credit_limit, notes, created_at)
                    VALUES
                      (:name, :phone, :email, :address, :city, :national_id, :economic_code,
                       :contact_person, :customer_type, :opening_balance, :credit_limit, :notes, :created_at)
                """), {**item, "created_at": datetime.utcnow()})
                _post_customer_opening(conn, result.lastrowid, item["name"], item["opening_balance"], policy)
            else:
                result = conn.execute(text("""
                    INSERT INTO products
                      (name, code, barcode, sku, brand, unit, buy_price, sell_price,
                       price, stock, min_stock, main_category, sub_category, image)
                    VALUES
                      (:name, :code, :barcode, :sku, :brand, :unit, :buy_price, :sell_price,
                       :sell_price, :stock, :min_stock, :main_category, :sub_category, '')
                """), item)
                _post_product_opening(conn, result.lastrowid, item["name"], item["stock"], item["buy_price"], policy)
            existing.add(_row_key(batch["entity_type"], item))
            inserted += 1
        result = {"inserted": inserted, "skipped": skipped, "applied_by": actor}
        conn.execute(text("""
            UPDATE data_import_batches
            SET status='applied', result_json=:result, applied_at=:applied_at
            WHERE id=:id
        """), {"result": json.dumps(result), "applied_at": _now(), "id": batch_id})
        return {"status": "applied", "batch_id": batch_id, **result}


@router.get("/batches")
def list_import_batches(request: Request):
    _admin(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT id, entity_type, file_name, status, total_rows, valid_rows,
                   error_rows, duplicate_rows, result_json, created_by, created_at, applied_at
            FROM data_import_batches ORDER BY created_at DESC LIMIT 100
        """)).mappings().all()
        return [dict(row) for row in rows]
