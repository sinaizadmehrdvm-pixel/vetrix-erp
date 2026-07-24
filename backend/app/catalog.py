import json
import tempfile
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from jwt import PyJWTError
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import Session

from app.auth import (
    CATALOG_LINK_DAYS,
    create_catalog_token,
    decode_catalog_token,
    extract_bearer_token,
)
from app.database import Base, SessionLocal, engine
from app.export.pdf_export import _p, _register_font, _rtl
from app.models.product import Product

router = APIRouter(prefix="/api/catalog", tags=["Digital & Print Catalog"])


class CatalogLink(Base):
    __tablename__ = "catalog_links"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    main_category = Column(String, nullable=True)
    in_stock_only = Column(Boolean, default=True, nullable=False)
    product_ids = Column(Text, nullable=True)  # JSON list; overrides main_category if set
    enabled = Column(Boolean, default=True, nullable=False)
    token_generation = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CatalogOrder(Base):
    __tablename__ = "catalog_orders"

    id = Column(Integer, primary_key=True, index=True)
    catalog_link_id = Column(Integer, nullable=False)
    customer_name = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    items_json = Column(Text, nullable=False)  # [{"product_id","name","quantity"}]
    note = Column(Text, nullable=True)
    status = Column(String, default="pending", nullable=False)  # pending / converted / rejected
    created_at = Column(DateTime, default=datetime.utcnow)


CatalogLink.__table__.create(bind=engine, checkfirst=True)
CatalogOrder.__table__.create(bind=engine, checkfirst=True)


class CatalogCreate(BaseModel):
    title: str
    main_category: Optional[str] = None
    in_stock_only: bool = True
    product_ids: Optional[List[int]] = None


class CatalogOrderItem(BaseModel):
    product_id: int
    quantity: float = 1


class CatalogOrderCreate(BaseModel):
    customer_name: str
    customer_phone: str = ""
    note: str = ""
    items: List[CatalogOrderItem]


def _resolve_products(db: Session, catalog: CatalogLink):
    query = db.query(Product)
    if catalog.product_ids:
        try:
            ids = json.loads(catalog.product_ids)
        except (TypeError, ValueError):
            ids = []
        query = query.filter(Product.id.in_(ids or [-1]))
    elif catalog.main_category:
        query = query.filter(Product.main_category == catalog.main_category)
    products = query.order_by(Product.name.asc()).all()
    if catalog.in_stock_only:
        products = [p for p in products if float(p.stock or 0) > 0]
    return products


def _product_public_dict(product: Product):
    sell_price = float(getattr(product, "sell_price", None) or getattr(product, "price", 0) or 0)
    return {
        "id": product.id,
        "name": product.name or "",
        "code": getattr(product, "code", "") or getattr(product, "barcode", "") or "",
        "unit": getattr(product, "unit", "") or "عدد",
        "price": sell_price,
        "in_stock": float(product.stock or 0) > 0,
        "image": getattr(product, "image", "") or "",
    }


def _authenticated_catalog(request: Request, db: Session) -> CatalogLink:
    token = extract_bearer_token(request.headers.get("Authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Catalog access token required")
    try:
        claims = decode_catalog_token(token)
        catalog_id = int(claims["catalog_id"])
    except (PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired catalog link")

    catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id).first()
    if not catalog or not catalog.enabled:
        raise HTTPException(status_code=401, detail="This catalog link is not available")

    token_generation = int(claims.get("gen", 0) or 0)
    if token_generation != int(catalog.token_generation or 0):
        raise HTTPException(status_code=401, detail="This link has been revoked")

    return catalog


def _build_catalog_pdf(catalog: CatalogLink, products, language: str = "fa") -> str:
    font_name = _register_font()
    fa = language == "fa"

    output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
    doc = SimpleDocTemplate(output_path, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm)

    base = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CatalogTitle", parent=base["Title"], fontName=font_name, fontSize=20,
        alignment=1, textColor=colors.HexColor("#0891b2"),
    )
    cell_style = ParagraphStyle(
        "CatalogCell", parent=base["BodyText"], fontName=font_name, fontSize=10,
        alignment=2 if fa else 0,
    )
    header_style = ParagraphStyle(
        "CatalogHeader", parent=cell_style, textColor=colors.white,
    )

    story = [_p(catalog.title, title_style, language), Spacer(1, 10 * mm)]

    header_labels = (
        ["کد", "نام کالا", "قیمت", "وضعیت موجودی"]
        if fa else ["Code", "Product", "Price", "Availability"]
    )
    rows = [[_p(label, header_style, language) for label in header_labels]]
    for product in products:
        item = _product_public_dict(product)
        availability = ("موجود" if item["in_stock"] else "ناموجود") if fa else ("In stock" if item["in_stock"] else "Out of stock")
        rows.append([
            _p(item["code"] or "-", cell_style, language),
            _p(item["name"], cell_style, language),
            _p(f"{item['price']:,.0f}", cell_style, language),
            _p(availability, cell_style, language),
        ])

    table = Table(rows, colWidths=[28 * mm, 78 * mm, 38 * mm, 30 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0891b2")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    doc.build(story)
    return output_path


# --- Staff-facing (normal staff auth + RBAC apply) ---


@router.post("/links")
def create_catalog(data: CatalogCreate):
    db: Session = SessionLocal()
    try:
        catalog = CatalogLink(
            title=data.title,
            main_category=data.main_category,
            in_stock_only=data.in_stock_only,
            product_ids=json.dumps(data.product_ids) if data.product_ids else None,
        )
        db.add(catalog)
        db.commit()
        db.refresh(catalog)
        token = create_catalog_token(catalog.id, catalog.token_generation)
        return {"status": "created", "id": catalog.id, "token": token, "expires_in_days": CATALOG_LINK_DAYS}
    finally:
        db.close()


@router.get("/links")
def list_catalogs():
    db: Session = SessionLocal()
    try:
        catalogs = db.query(CatalogLink).order_by(CatalogLink.id.desc()).all()
        return {
            "items": [
                {
                    "id": c.id,
                    "title": c.title,
                    "main_category": c.main_category,
                    "in_stock_only": c.in_stock_only,
                    "enabled": c.enabled,
                    "product_count": len(_resolve_products(db, c)),
                    "created_at": c.created_at,
                    "token": create_catalog_token(c.id, c.token_generation) if c.enabled else None,
                }
                for c in catalogs
            ]
        }
    finally:
        db.close()


@router.post("/links/{catalog_id}/revoke")
def revoke_catalog(catalog_id: int):
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        catalog.enabled = False
        catalog.token_generation = (catalog.token_generation or 0) + 1
        db.commit()
        return {"status": "revoked"}
    finally:
        db.close()


@router.post("/links/{catalog_id}/reactivate")
def reactivate_catalog(catalog_id: int):
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        catalog.enabled = True
        db.commit()
        token = create_catalog_token(catalog.id, catalog.token_generation)
        return {"status": "reactivated", "token": token}
    finally:
        db.close()


@router.get("/links/{catalog_id}/pdf")
def download_catalog_pdf(catalog_id: int, language: str = "fa"):
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        products = _resolve_products(db, catalog)
        path = _build_catalog_pdf(catalog, products, language=language)
    finally:
        db.close()

    from fastapi.responses import FileResponse
    return FileResponse(path, media_type="application/pdf", filename=f"catalog_{catalog_id}.pdf")


@router.get("/orders")
def list_catalog_orders():
    db: Session = SessionLocal()
    try:
        orders = db.query(CatalogOrder).order_by(CatalogOrder.id.desc()).all()
        return {
            "items": [
                {
                    "id": o.id,
                    "catalog_link_id": o.catalog_link_id,
                    "customer_name": o.customer_name,
                    "customer_phone": o.customer_phone,
                    "items": json.loads(o.items_json or "[]"),
                    "note": o.note,
                    "status": o.status,
                    "created_at": o.created_at,
                }
                for o in orders
            ]
        }
    finally:
        db.close()


@router.post("/orders/{order_id}/reject")
def reject_catalog_order(order_id: int):
    db: Session = SessionLocal()
    try:
        order = db.query(CatalogOrder).filter(CatalogOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        order.status = "rejected"
        db.commit()
        return {"status": "rejected"}
    finally:
        db.close()


@router.post("/orders/{order_id}/mark-converted")
def mark_catalog_order_converted(order_id: int):
    db: Session = SessionLocal()
    try:
        order = db.query(CatalogOrder).filter(CatalogOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        order.status = "converted"
        db.commit()
        return {"status": "converted"}
    finally:
        db.close()


# --- Customer-facing (public paths; this router verifies its own token) ---


@router.get("/view")
def view_catalog(request: Request):
    db: Session = SessionLocal()
    try:
        catalog = _authenticated_catalog(request, db)
        products = _resolve_products(db, catalog)
        return {
            "title": catalog.title,
            "items": [_product_public_dict(p) for p in products],
        }
    finally:
        db.close()


@router.post("/view/order")
def place_catalog_order(data: CatalogOrderCreate, request: Request):
    db: Session = SessionLocal()
    try:
        catalog = _authenticated_catalog(request, db)
        if not data.items:
            raise HTTPException(status_code=400, detail="Select at least one product")

        available_products = {p.id: p for p in _resolve_products(db, catalog)}
        resolved_items = []
        for item in data.items:
            product = available_products.get(item.product_id)
            if not product:
                raise HTTPException(status_code=400, detail=f"Product {item.product_id} is not part of this catalog")
            resolved_items.append({
                "product_id": product.id,
                "name": product.name,
                "quantity": item.quantity,
            })

        order = CatalogOrder(
            catalog_link_id=catalog.id,
            customer_name=data.customer_name,
            customer_phone=data.customer_phone,
            items_json=json.dumps(resolved_items),
            note=data.note,
            status="pending",
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        return {"status": "created", "order_id": order.id}
    finally:
        db.close()
