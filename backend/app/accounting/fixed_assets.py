from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.accounting.posting import (
    cash_account_for_method,
    delete_source_voucher,
    post_balanced_voucher,
)
from app.database import engine

router = APIRouter(prefix="/api/accounting/fixed-assets", tags=["Fixed Assets"])
MONEY_STEP = Decimal("0.01")


def _money(value):
    return Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


class AssetCreate(BaseModel):
    name: str
    asset_code: str
    category: str = ""
    purchase_date: date
    acquisition_cost: float
    salvage_value: float = 0
    useful_life_months: int
    payment_method: str = "bank"
    serial_number: str = ""
    location: str = ""
    note: str = ""


class DepreciationRun(BaseModel):
    through_date: date
    asset_id: int | None = None


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fixed_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            asset_code VARCHAR NOT NULL UNIQUE,
            category VARCHAR DEFAULT '',
            purchase_date DATE NOT NULL,
            acquisition_cost FLOAT NOT NULL,
            salvage_value FLOAT NOT NULL DEFAULT 0,
            useful_life_months INTEGER NOT NULL,
            payment_method VARCHAR DEFAULT 'bank',
            serial_number VARCHAR DEFAULT '',
            location VARCHAR DEFAULT '',
            note TEXT DEFAULT '',
            status VARCHAR NOT NULL DEFAULT 'active',
            created_at VARCHAR NOT NULL
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fixed_asset_depreciation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            through_date DATE NOT NULL,
            months_recognized INTEGER NOT NULL,
            amount FLOAT NOT NULL,
            accumulated_after FLOAT NOT NULL,
            book_value_after FLOAT NOT NULL,
            voucher_id INTEGER,
            created_at VARCHAR NOT NULL,
            UNIQUE(asset_id, through_date),
            FOREIGN KEY(asset_id) REFERENCES fixed_assets(id)
        )
    """))


def _asset(conn, asset_id):
    _ensure_schema(conn)
    row = conn.execute(text("""
        SELECT a.*,
               COALESCE(SUM(d.amount),0) AS accumulated_depreciation,
               COALESCE(MAX(d.months_recognized),0) AS recognized_months
        FROM fixed_assets a
        LEFT JOIN fixed_asset_depreciation d ON d.asset_id=a.id
        WHERE a.id=:id
        GROUP BY a.id
    """), {"id": asset_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Fixed asset not found")
    return dict(row)


def _serialize(row):
    item = dict(row)
    cost = _money(item["acquisition_cost"])
    salvage = _money(item["salvage_value"])
    accumulated = _money(item.get("accumulated_depreciation"))
    depreciable = _money(max(cost - salvage, Decimal("0")))
    item.update({
        "acquisition_cost": float(cost),
        "salvage_value": float(salvage),
        "depreciable_base": float(depreciable),
        "monthly_depreciation": float(
            _money(depreciable / int(item["useful_life_months"]))
        ),
        "accumulated_depreciation": float(accumulated),
        "book_value": float(_money(cost - accumulated)),
        "fully_depreciated": accumulated >= depreciable,
        "recognized_months": int(item.get("recognized_months") or 0),
    })
    return item


@router.get("")
def list_assets():
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT a.*,
                   COALESCE(SUM(d.amount),0) AS accumulated_depreciation,
                   COALESCE(MAX(d.months_recognized),0) AS recognized_months
            FROM fixed_assets a
            LEFT JOIN fixed_asset_depreciation d ON d.asset_id=a.id
            GROUP BY a.id
            ORDER BY a.purchase_date DESC, a.id DESC
        """)).mappings().all()
        assets = [_serialize(row) for row in rows]
        return {
            "summary": {
                "asset_count": len(assets),
                "active_count": len([a for a in assets if a["status"] == "active"]),
                "acquisition_cost": float(_money(sum(Decimal(str(a["acquisition_cost"])) for a in assets))),
                "accumulated_depreciation": float(_money(sum(Decimal(str(a["accumulated_depreciation"])) for a in assets))),
                "book_value": float(_money(sum(Decimal(str(a["book_value"])) for a in assets))),
            },
            "items": assets,
        }


@router.get("/{asset_id}")
def asset_detail(asset_id: int):
    with engine.begin() as conn:
        asset = _serialize(_asset(conn, asset_id))
        history = conn.execute(text("""
            SELECT * FROM fixed_asset_depreciation
            WHERE asset_id=:id ORDER BY through_date DESC, id DESC
        """), {"id": asset_id}).mappings().all()
        asset["depreciation_history"] = [dict(row) for row in history]
        return asset


@router.post("")
def create_asset(data: AssetCreate):
    name = data.name.strip()
    code = data.asset_code.strip()
    cost = _money(data.acquisition_cost)
    salvage = _money(data.salvage_value)
    if not name or not code:
        raise HTTPException(status_code=400, detail="Asset name and code are required")
    if cost <= 0:
        raise HTTPException(status_code=400, detail="Acquisition cost must be greater than zero")
    if salvage < 0 or salvage >= cost:
        raise HTTPException(status_code=400, detail="Salvage value must be non-negative and below acquisition cost")
    if data.useful_life_months <= 0 or data.useful_life_months > 1200:
        raise HTTPException(status_code=400, detail="Useful life must be between 1 and 1200 months")
    try:
        with engine.begin() as conn:
            _ensure_schema(conn)
            result = conn.execute(text("""
                INSERT INTO fixed_assets
                  (name, asset_code, category, purchase_date, acquisition_cost,
                   salvage_value, useful_life_months, payment_method,
                   serial_number, location, note, status, created_at)
                VALUES
                  (:name, :asset_code, :category, :purchase_date, :cost,
                   :salvage, :life, :payment_method, :serial_number,
                   :location, :note, 'active', :created_at)
            """), {
                "name": name, "asset_code": code, "category": data.category.strip(),
                "purchase_date": data.purchase_date.isoformat(), "cost": float(cost),
                "salvage": float(salvage), "life": data.useful_life_months,
                "payment_method": data.payment_method, "serial_number": data.serial_number.strip(),
                "location": data.location.strip(), "note": data.note.strip(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            asset_id = result.lastrowid
            description = f"خرید دارایی ثابت: {name} ({code})"
            voucher_id = post_balanced_voucher(
                "fixed_asset_acquisition", asset_id, description,
                [
                    {"account_code": "1202", "debit": float(cost), "description": description},
                    {"account_code": cash_account_for_method(data.payment_method), "credit": float(cost), "description": description},
                ],
                voucher_date=data.purchase_date.isoformat(),
                connection=conn,
            )
            return {"status": "created", "id": asset_id, "voucher_id": voucher_id}
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=409, detail="Asset code already exists")
        raise


@router.delete("/{asset_id}")
def delete_asset(asset_id: int):
    try:
        with engine.begin() as conn:
            _asset(conn, asset_id)
            count = conn.execute(text("""
                SELECT COUNT(*) FROM fixed_asset_depreciation WHERE asset_id=:id
            """), {"id": asset_id}).scalar() or 0
            if count:
                raise HTTPException(status_code=409, detail="Asset has depreciation history and cannot be deleted")
            delete_source_voucher("fixed_asset_acquisition", asset_id, connection=conn)
            conn.execute(text("DELETE FROM fixed_assets WHERE id=:id"), {"id": asset_id})
            return {"status": "deleted", "id": asset_id}
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))


def _months_between(start, end):
    return max((end.year - start.year) * 12 + end.month - start.month, 0)


@router.post("/depreciation/run")
def run_depreciation(data: DepreciationRun):
    with engine.begin() as conn:
        _ensure_schema(conn)
        if data.asset_id:
            assets = [_asset(conn, data.asset_id)]
        else:
            assets = [dict(row) for row in conn.execute(text("""
                SELECT a.*,
                       COALESCE(SUM(d.amount),0) AS accumulated_depreciation,
                       COALESCE(MAX(d.months_recognized),0) AS recognized_months
                FROM fixed_assets a
                LEFT JOIN fixed_asset_depreciation d ON d.asset_id=a.id
                WHERE a.status='active'
                GROUP BY a.id ORDER BY a.id
            """)).mappings().all()]

        posted = []
        skipped = []
        for asset in assets:
            purchase = date.fromisoformat(str(asset["purchase_date"])[:10])
            if data.through_date < purchase:
                skipped.append({"asset_id": asset["id"], "reason": "before_purchase"})
                continue
            life = int(asset["useful_life_months"])
            elapsed = min(_months_between(purchase, data.through_date), life)
            recognized = int(asset.get("recognized_months") or 0)
            cost = _money(asset["acquisition_cost"])
            salvage = _money(asset["salvage_value"])
            base = _money(cost - salvage)
            accumulated = _money(asset.get("accumulated_depreciation"))
            target = _money(base * Decimal(elapsed) / Decimal(life))
            amount = _money(min(max(target - accumulated, Decimal("0")), base - accumulated))
            if amount <= 0 or elapsed <= recognized:
                skipped.append({"asset_id": asset["id"], "reason": "nothing_due"})
                continue

            projected_accumulated = _money(accumulated + amount)
            book_value = _money(cost - projected_accumulated)
            result = conn.execute(text("""
                INSERT INTO fixed_asset_depreciation
                  (asset_id, through_date, months_recognized, amount,
                   accumulated_after, book_value_after, created_at)
                VALUES
                  (:asset_id, :through_date, :months, :amount,
                   :accumulated, :book_value, :created_at)
            """), {
                "asset_id": asset["id"], "through_date": data.through_date.isoformat(),
                "months": elapsed, "amount": float(amount),
                "accumulated": float(projected_accumulated), "book_value": float(book_value),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            entry_id = result.lastrowid
            description = f"استهلاک دارایی: {asset['name']} تا {data.through_date.isoformat()}"
            voucher_id = post_balanced_voucher(
                "fixed_asset_depreciation", entry_id, description,
                [
                    {"account_code": "5103", "debit": float(amount), "description": description},
                    {"account_code": "1203", "credit": float(amount), "description": description},
                ],
                voucher_date=data.through_date.isoformat(),
                connection=conn,
            )
            conn.execute(text("""
                UPDATE fixed_asset_depreciation SET voucher_id=:voucher_id WHERE id=:id
            """), {"voucher_id": voucher_id, "id": entry_id})
            posted.append({
                "asset_id": asset["id"], "entry_id": entry_id,
                "voucher_id": voucher_id, "months_recognized": elapsed,
                "amount": float(amount), "accumulated_after": float(projected_accumulated),
                "book_value_after": float(book_value),
            })
        return {
            "status": "completed",
            "through_date": data.through_date.isoformat(),
            "posted_count": len(posted),
            "total_depreciation": float(_money(sum(Decimal(str(item["amount"])) for item in posted))),
            "posted": posted,
            "skipped": skipped,
        }
