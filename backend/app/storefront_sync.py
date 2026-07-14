import hashlib
import hmac
import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from app.database import engine
from app.online_commerce import _ensure_schema as _ensure_commerce_schema

router = APIRouter(prefix="/api/storefront-sync", tags=["Signed Storefront Sync"])
MAX_CLOCK_SKEW_SECONDS = 300


def _now():
    return datetime.now(timezone.utc).isoformat()


def _sync_secret():
    secret = os.getenv("VETRIX_STOREFRONT_SYNC_SECRET", "").strip()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Storefront synchronization is not configured",
        )
    if len(secret) < 24:
        raise HTTPException(
            status_code=503,
            detail="Storefront synchronization secret is too short",
        )
    return secret


def _canonical(timestamp, method, path):
    return f"{timestamp}\n{method.upper()}\n{path}".encode("utf-8")


def sign_request(timestamp, method, path, secret):
    return hmac.new(
        secret.encode("utf-8"),
        _canonical(timestamp, method, path),
        hashlib.sha256,
    ).hexdigest()


def _verify_request(request, now=None):
    timestamp_text = request.headers.get("X-Vetrix-Timestamp", "").strip()
    supplied = request.headers.get("X-Vetrix-Signature", "").strip().lower()
    try:
        timestamp = int(timestamp_text)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid synchronization timestamp")
    current = int(time.time() if now is None else now)
    if abs(current - timestamp) > MAX_CLOCK_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="Synchronization request expired")
    expected = sign_request(
        timestamp_text,
        request.method,
        request.url.path,
        _sync_secret(),
    )
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid synchronization signature")


def _feed(updated_since=""):
    with engine.begin() as conn:
        _ensure_commerce_schema(conn)
        settings = conn.execute(text("""
            SELECT currency_code, decimal_places, country_code, locale_code
            FROM app_settings ORDER BY id LIMIT 1
        """)).mappings().first()
        rows = conn.execute(text("""
            SELECT p.id, p.name, p.stock, p.sell_price,
                   s.online_price, s.discount_percent, s.sync_stock,
                   s.website_slug, s.sale_start, s.sale_end, s.updated_at
            FROM online_product_settings s
            JOIN products p ON p.id=s.product_id
            WHERE s.is_published=1
              AND (:updated_since='' OR s.updated_at>:updated_since)
            ORDER BY s.updated_at, p.id
        """), {"updated_since": updated_since}).mappings().all()
    products = []
    for row in rows:
        price = row["online_price"]
        if price is None:
            price = row["sell_price"] or 0
        discount = max(0.0, min(100.0, float(row["discount_percent"] or 0)))
        price = float(price or 0)
        products.append({
            "id": row["id"],
            "name": row["name"],
            "slug": row["website_slug"] or "",
            "price": price,
            "discount_percent": discount,
            "discounted_price": round(price * (1 - discount / 100), 4),
            "stock": float(row["stock"] or 0) if row["sync_stock"] else None,
            "stock_sync_enabled": bool(row["sync_stock"]),
            "sale_start": row["sale_start"] or "",
            "sale_end": row["sale_end"] or "",
            "updated_at": row["updated_at"],
        })
    return {
        "generated_at": _now(),
        "updated_since": updated_since,
        "currency": (settings or {}).get("currency_code") or "IRR",
        "decimal_places": int((settings or {}).get("decimal_places") or 0),
        "country": (settings or {}).get("country_code") or "IR",
        "locale": (settings or {}).get("locale_code") or "fa-IR",
        "count": len(products),
        "products": products,
    }


@router.get("/products")
def storefront_products(request: Request, updated_since: str = ""):
    _verify_request(request)
    if len(updated_since) > 80:
        raise HTTPException(status_code=400, detail="Invalid synchronization cursor")
    return _feed(updated_since.strip())


@router.get("/readiness")
def storefront_readiness(request: Request):
    auth = getattr(request.state, "auth", {})
    if str(auth.get("role") or "").lower() not in {"admin", "accountant"}:
        raise HTTPException(status_code=403, detail="Manager access is required")
    secret = os.getenv("VETRIX_STOREFRONT_SYNC_SECRET", "").strip()
    with engine.begin() as conn:
        _ensure_commerce_schema(conn)
        published = conn.execute(text("""
            SELECT COUNT(*) FROM online_product_settings WHERE is_published=1
        """)).scalar() or 0
        stock_synced = conn.execute(text("""
            SELECT COUNT(*) FROM online_product_settings
            WHERE is_published=1 AND sync_stock=1
        """)).scalar() or 0
    return {
        "ready": len(secret) >= 24,
        "secret_configured": bool(secret),
        "secret_length_valid": len(secret) >= 24,
        "published_products": int(published),
        "stock_synced_products": int(stock_synced),
        "feed_path": "/api/storefront-sync/products",
        "signature_algorithm": "HMAC-SHA256",
        "max_clock_skew_seconds": MAX_CLOCK_SKEW_SECONDS,
        "secrets_exposed": False,
    }
