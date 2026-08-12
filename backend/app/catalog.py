import json
import tempfile
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from jwt import PyJWTError
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, bindparam, text
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
from app.company_scope import current_company_id, ensure_company_id_column
from app.pricing import resolve_price

router = APIRouter(prefix="/api/catalog", tags=["Digital & Print Catalog"])

CATALOG_TYPES = {"product_catalog", "price_list", "promotional", "wholesale", "customer_specific", "branch_specific"}
PRICE_SOURCES = {"base", "pricing_rule", "customer_specific"}


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
    company_id = Column(Integer, nullable=True)
    catalog_type = Column(String, default="product_catalog", nullable=False)
    branch_id = Column(Integer, nullable=True)
    language = Column(String, default="fa", nullable=False)
    currency = Column(String, default="", nullable=False)
    valid_from = Column(String, nullable=True)
    valid_until = Column(String, nullable=True)
    customer_id = Column(Integer, nullable=True)
    price_source = Column(String, default="base", nullable=False)
    show_stock_status = Column(Boolean, default=True, nullable=False)
    archived = Column(Boolean, default=False, nullable=False)
    view_count = Column(Integer, default=0, nullable=False)
    order_count = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow)


def _ensure_new_catalog_columns(conn):
    """CatalogLink was created via SQLAlchemy's Table.create(), which only
    handles brand-new tables - an already-existing catalog_links table
    needs these Task-03 columns added the same idempotent way
    app/warehouses.py's _ensure_new_columns() does."""
    rows = conn.execute(text("PRAGMA table_info(catalog_links)")).fetchall()
    existing = {row[1] for row in rows}
    additions = {
        "catalog_type": "catalog_type VARCHAR DEFAULT 'product_catalog'",
        "branch_id": "branch_id INTEGER",
        "language": "language VARCHAR DEFAULT 'fa'",
        "currency": "currency VARCHAR DEFAULT ''",
        "valid_from": "valid_from VARCHAR",
        "valid_until": "valid_until VARCHAR",
        "customer_id": "customer_id INTEGER",
        "price_source": "price_source VARCHAR DEFAULT 'base'",
        "show_stock_status": "show_stock_status BOOLEAN DEFAULT 1",
        "archived": "archived BOOLEAN DEFAULT 0",
        "view_count": "view_count INTEGER DEFAULT 0",
        "order_count": "order_count INTEGER DEFAULT 0",
        "updated_at": "updated_at DATETIME",
    }
    for column_name, column_sql in additions.items():
        if column_name not in existing:
            conn.execute(text(f"ALTER TABLE catalog_links ADD COLUMN {column_sql}"))
    ensure_company_id_column(conn, "catalog_links")


class CatalogOrder(Base):
    __tablename__ = "catalog_orders"

    id = Column(Integer, primary_key=True, index=True)
    catalog_link_id = Column(Integer, nullable=False)
    customer_name = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    items_json = Column(Text, nullable=False)  # [{"product_id","name","quantity"}]
    note = Column(Text, nullable=True)
    status = Column(String, default="pending", nullable=False)  # pending / converted / rejected
    converted_invoice_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, nullable=True)


CatalogLink.__table__.create(bind=engine, checkfirst=True)
CatalogOrder.__table__.create(bind=engine, checkfirst=True)

with engine.begin() as _conn:
    _ensure_new_catalog_columns(_conn)


class CatalogCreate(BaseModel):
    title: str
    main_category: Optional[str] = None
    in_stock_only: bool = True
    product_ids: Optional[List[int]] = None
    catalog_type: str = "product_catalog"
    branch_id: Optional[int] = None
    language: str = "fa"
    currency: str = ""
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    customer_id: Optional[int] = None
    price_source: str = "base"
    show_stock_status: bool = True


class CatalogUpdate(CatalogCreate):
    enabled: bool = True


class CatalogOrderItem(BaseModel):
    product_id: int
    quantity: float = 1


class CatalogOrderCreate(BaseModel):
    customer_name: str
    customer_phone: str = ""
    note: str = ""
    items: List[CatalogOrderItem]


def _resolve_products(db: Session, catalog: CatalogLink):
    query = db.query(Product).filter(Product.company_id == catalog.company_id)
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


def _active_discounts(db: Session, product_ids):
    """Batch-fetch the sales team's currently-active online discounts (set
    via online_product_update, including the voice-driven change-request
    path) for the given products, keyed by product_id -> discount_percent.
    A discount only counts as "active" within its sale_start/sale_end
    window when either bound is set - this is deliberately the same table
    the online store reads, so a discount configured once shows up
    everywhere a product is offered to a customer, catalogs included."""
    if not product_ids:
        return {}
    # online_product_settings is owned by app.online_commerce, whose
    # _ensure_schema() this module never calls - on a company that has
    # never touched Online Commerce, that table would not exist yet, and
    # this function is reachable from the PUBLIC, unauthenticated
    # /api/catalog/view endpoint real customers open, so this must fail
    # into "no discounts" rather than a raw 500. Checking existence first
    # (rather than a nested write via _ensure_schema, or a try/except that
    # would poison this read-only session's transaction) matches the same
    # defensive pattern already used in invoice_payments.py/main.py for
    # the identical reason.
    table_exists = db.execute(text(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='online_product_settings'"
    )).scalar()
    if not table_exists:
        return {}
    today = datetime.utcnow().date().isoformat()
    rows = db.execute(text("""
        SELECT product_id, online_price, discount_percent, sale_start, sale_end
        FROM online_product_settings
        WHERE product_id IN :ids AND discount_percent > 0
    """).bindparams(bindparam("ids", expanding=True)), {"ids": list(product_ids)}).mappings().all()
    result = {}
    for row in rows:
        if row["sale_start"] and row["sale_start"] > today:
            continue
        if row["sale_end"] and row["sale_end"] < today:
            continue
        result[row["product_id"]] = {
            "discount_percent": float(row["discount_percent"] or 0),
            "online_price": row["online_price"],
        }
    return result


def _catalog_base_price(db: Session, product: Product, catalog: CatalogLink) -> float:
    """The starting price before any online promotional discount is
    layered on top (see _active_discounts). "base" keeps today's exact
    behavior (product.sell_price/price). "pricing_rule"/"customer_specific"
    explicitly opt into Task 02's resolve_price() - an intentional,
    catalog-author-selected choice, not a silent default, per the task
    spec's own instruction not to treat non-binding pricing rules as
    authoritative unless explicitly selected for catalog rendering."""
    sell_price = float(getattr(product, "sell_price", None) or getattr(product, "price", 0) or 0)
    if catalog.price_source not in ("pricing_rule", "customer_specific"):
        return sell_price
    customer_id = catalog.customer_id if catalog.price_source == "customer_specific" else None
    quote = resolve_price(db, product.id, 1, customer_id, catalog.company_id, catalog.branch_id)
    if quote is None:
        return sell_price
    return float(quote["unit_price"])


def _product_public_dict(product: Product, base_price: float, discount=None, show_stock_status: bool = True):
    base_price = float(discount["online_price"]) if discount and discount.get("online_price") is not None else base_price
    discount_percent = float(discount["discount_percent"]) if discount else 0
    final_price = round(base_price * (1 - discount_percent / 100), 0) if discount_percent else base_price
    result = {
        "id": product.id,
        "name": product.name or "",
        "code": getattr(product, "code", "") or getattr(product, "barcode", "") or "",
        "unit": getattr(product, "unit", "") or "عدد",
        "price": base_price,
        "discount_percent": discount_percent,
        "final_price": final_price,
        "image": getattr(product, "image", "") or "",
    }
    if show_stock_status:
        result["in_stock"] = float(product.stock or 0) > 0
    return result


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
    if not catalog or not catalog.enabled or catalog.archived:
        raise HTTPException(status_code=401, detail="This catalog link is not available")

    token_generation = int(claims.get("gen", 0) or 0)
    if token_generation != int(catalog.token_generation or 0):
        raise HTTPException(status_code=401, detail="This link has been revoked")

    today = date.today().isoformat()
    if catalog.valid_from and today < catalog.valid_from:
        raise HTTPException(status_code=401, detail="This catalog is not yet available")
    if catalog.valid_until and today > catalog.valid_until:
        raise HTTPException(status_code=401, detail="This catalog has expired")

    return catalog


class _NumberedCanvas(pdf_canvas.Canvas):
    """Standard ReportLab two-pass recipe for an honest "Page X of Y" -
    buffers every page, then re-draws each one once the true total page
    count is known, rather than a single-pass "Page N" that can't know Y."""
    def __init__(self, *args, **kwargs):
        pdf_canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_number(total_pages)
            pdf_canvas.Canvas.showPage(self)
        pdf_canvas.Canvas.save(self)

    def _draw_page_number(self, total_pages):
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        page_width = self._pagesize[0]
        self.drawCentredString(page_width / 2, 10 * mm, f"Page {self._pageNumber} / {total_pages}")


def _build_catalog_pdf(db: Session, catalog: CatalogLink, products, language: str = "fa", discounts=None, orientation: str = "portrait") -> str:
    discounts = discounts or {}
    font_name = _register_font()
    fa = language == "fa"
    page_size = landscape(A4) if orientation == "landscape" else A4

    output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
    doc = SimpleDocTemplate(output_path, pagesize=page_size, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=22 * mm)

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

    show_stock = catalog.show_stock_status
    header_labels_fa = ["#", "کد", "نام کالا", "قیمت"] + (["وضعیت موجودی"] if show_stock else [])
    header_labels_en = ["#", "Code", "Product", "Price"] + (["Availability"] if show_stock else [])
    header_labels = header_labels_fa if fa else header_labels_en
    rows = [[_p(label, header_style, language) for label in header_labels]]
    for index, product in enumerate(products):
        base_price = _catalog_base_price(db, product, catalog)
        item = _product_public_dict(product, base_price, discounts.get(product.id), show_stock)
        if item["discount_percent"]:
            was_label = "بود" if fa else "was"
            price_text = f"{item['final_price']:,.0f} ({was_label} {item['price']:,.0f}, -{item['discount_percent']:.0f}%)"
        else:
            price_text = f"{item['price']:,.0f}"
        row = [
            _p(str(index + 1), cell_style, language),
            _p(item["code"] or "-", cell_style, language),
            _p(item["name"], cell_style, language),
            _p(price_text, cell_style, language),
        ]
        if show_stock:
            availability = ("موجود" if item["in_stock"] else "ناموجود") if fa else ("In stock" if item["in_stock"] else "Out of stock")
            row.append(_p(availability, cell_style, language))
        rows.append(row)

    col_widths = [10 * mm, 26 * mm, 76 * mm, 36 * mm] + ([28 * mm] if show_stock else [])
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0891b2")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    doc.build(story, canvasmaker=_NumberedCanvas)
    return output_path


# --- Staff-facing (normal staff auth + RBAC apply) ---


def _validate_catalog_fields(data: CatalogCreate):
    if data.catalog_type not in CATALOG_TYPES:
        raise HTTPException(status_code=400, detail=f"catalog_type must be one of: {', '.join(sorted(CATALOG_TYPES))}")
    if data.price_source not in PRICE_SOURCES:
        raise HTTPException(status_code=400, detail=f"price_source must be one of: {', '.join(sorted(PRICE_SOURCES))}")
    if data.price_source == "customer_specific" and not data.customer_id:
        raise HTTPException(status_code=400, detail="customer_id is required when price_source is 'customer_specific'")


def _catalog_to_dict(db: Session, c: CatalogLink) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "main_category": c.main_category,
        "in_stock_only": c.in_stock_only,
        "product_ids": json.loads(c.product_ids) if c.product_ids else None,
        "enabled": c.enabled,
        "archived": c.archived,
        "catalog_type": c.catalog_type,
        "branch_id": c.branch_id,
        "language": c.language,
        "currency": c.currency,
        "valid_from": c.valid_from,
        "valid_until": c.valid_until,
        "customer_id": c.customer_id,
        "price_source": c.price_source,
        "show_stock_status": c.show_stock_status,
        "view_count": c.view_count,
        "order_count": c.order_count,
        "product_count": len(_resolve_products(db, c)),
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "token": create_catalog_token(c.id, c.token_generation) if c.enabled and not c.archived else None,
    }


@router.post("/links")
def create_catalog(data: CatalogCreate, request: Request):
    _validate_catalog_fields(data)
    db: Session = SessionLocal()
    try:
        catalog = CatalogLink(
            title=data.title,
            main_category=data.main_category,
            in_stock_only=data.in_stock_only,
            product_ids=json.dumps(data.product_ids) if data.product_ids else None,
            catalog_type=data.catalog_type,
            branch_id=data.branch_id,
            language=data.language,
            currency=data.currency,
            valid_from=data.valid_from,
            valid_until=data.valid_until,
            customer_id=data.customer_id,
            price_source=data.price_source,
            show_stock_status=data.show_stock_status,
            company_id=current_company_id(request),
        )
        db.add(catalog)
        db.commit()
        db.refresh(catalog)
        token = create_catalog_token(catalog.id, catalog.token_generation)
        return {"status": "created", "id": catalog.id, "token": token, "expires_in_days": CATALOG_LINK_DAYS}
    finally:
        db.close()


@router.put("/links/{catalog_id}")
def update_catalog(catalog_id: int, data: CatalogUpdate, request: Request):
    _validate_catalog_fields(data)
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id, CatalogLink.company_id == current_company_id(request)).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        catalog.title = data.title
        catalog.main_category = data.main_category
        catalog.in_stock_only = data.in_stock_only
        catalog.product_ids = json.dumps(data.product_ids) if data.product_ids else None
        catalog.catalog_type = data.catalog_type
        catalog.branch_id = data.branch_id
        catalog.language = data.language
        catalog.currency = data.currency
        catalog.valid_from = data.valid_from
        catalog.valid_until = data.valid_until
        catalog.customer_id = data.customer_id
        catalog.price_source = data.price_source
        catalog.show_stock_status = data.show_stock_status
        catalog.updated_at = datetime.utcnow()
        db.commit()
        return {"status": "updated"}
    finally:
        db.close()


@router.post("/links/{catalog_id}/duplicate")
def duplicate_catalog(catalog_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        source = db.query(CatalogLink).filter(CatalogLink.id == catalog_id, CatalogLink.company_id == company_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Catalog not found")
        copy = CatalogLink(
            title=f"{source.title} (copy)", main_category=source.main_category, in_stock_only=source.in_stock_only,
            product_ids=source.product_ids, catalog_type=source.catalog_type, branch_id=source.branch_id,
            language=source.language, currency=source.currency, valid_from=source.valid_from, valid_until=source.valid_until,
            customer_id=source.customer_id, price_source=source.price_source, show_stock_status=source.show_stock_status,
            company_id=company_id,
        )
        db.add(copy)
        db.commit()
        db.refresh(copy)
        return {"status": "created", "id": copy.id}
    finally:
        db.close()


@router.get("/links")
def list_catalogs(request: Request, search: str = "", catalog_type: str = "", status: str = "all"):
    db: Session = SessionLocal()
    try:
        query = db.query(CatalogLink).filter(CatalogLink.company_id == current_company_id(request))
        if search.strip():
            query = query.filter(CatalogLink.title.ilike(f"%{search.strip()}%"))
        if catalog_type:
            query = query.filter(CatalogLink.catalog_type == catalog_type)
        if status == "active":
            query = query.filter(CatalogLink.enabled.is_(True), CatalogLink.archived.is_(False))
        elif status == "archived":
            query = query.filter(CatalogLink.archived.is_(True))
        catalogs = query.order_by(CatalogLink.id.desc()).all()
        return {"items": [_catalog_to_dict(db, c) for c in catalogs]}
    finally:
        db.close()


@router.post("/links/{catalog_id}/revoke")
def revoke_catalog(catalog_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id, CatalogLink.company_id == current_company_id(request)).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        catalog.enabled = False
        catalog.token_generation = (catalog.token_generation or 0) + 1
        db.commit()
        return {"status": "revoked"}
    finally:
        db.close()


@router.post("/links/{catalog_id}/reactivate")
def reactivate_catalog(catalog_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id, CatalogLink.company_id == current_company_id(request)).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        catalog.enabled = True
        db.commit()
        token = create_catalog_token(catalog.id, catalog.token_generation)
        return {"status": "reactivated", "token": token}
    finally:
        db.close()


@router.post("/links/{catalog_id}/archive")
def archive_catalog(catalog_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id, CatalogLink.company_id == current_company_id(request)).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        catalog.archived = True
        catalog.token_generation = (catalog.token_generation or 0) + 1
        db.commit()
        return {"status": "archived"}
    finally:
        db.close()


@router.post("/links/{catalog_id}/unarchive")
def unarchive_catalog(catalog_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id, CatalogLink.company_id == current_company_id(request)).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        catalog.archived = False
        db.commit()
        return {"status": "unarchived"}
    finally:
        db.close()


@router.get("/links/{catalog_id}/pdf")
def download_catalog_pdf(catalog_id: int, request: Request, language: str = "fa", orientation: str = "portrait"):
    if orientation not in ("portrait", "landscape"):
        raise HTTPException(status_code=400, detail="orientation must be 'portrait' or 'landscape'")
    db: Session = SessionLocal()
    try:
        catalog = db.query(CatalogLink).filter(CatalogLink.id == catalog_id, CatalogLink.company_id == current_company_id(request)).first()
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog not found")
        products = _resolve_products(db, catalog)
        discounts = _active_discounts(db, [p.id for p in products])
        path = _build_catalog_pdf(db, catalog, products, language=language, discounts=discounts, orientation=orientation)
    finally:
        db.close()

    from fastapi.responses import FileResponse
    return FileResponse(path, media_type="application/pdf", filename=f"catalog_{catalog_id}.pdf")


@router.get("/orders")
def list_catalog_orders(request: Request):
    db: Session = SessionLocal()
    try:
        orders = db.query(CatalogOrder).filter(CatalogOrder.company_id == current_company_id(request)).order_by(CatalogOrder.id.desc()).all()
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
                    "converted_invoice_id": o.converted_invoice_id,
                    "created_at": o.created_at,
                }
                for o in orders
            ]
        }
    finally:
        db.close()


@router.post("/orders/{order_id}/reject")
def reject_catalog_order(order_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        order = db.query(CatalogOrder).filter(CatalogOrder.id == order_id, CatalogOrder.company_id == current_company_id(request)).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        order.status = "rejected"
        db.commit()
        return {"status": "rejected"}
    finally:
        db.close()


# Note: POST /orders/{order_id}/mark-converted is implemented in main.py,
# not here - converting an order into a real invoice needs the invoice
# creation helpers (create_invoice, Customer lookup, GL posting) that live
# in main.py, and this module is imported by main.py so it can't import back.


# --- Customer-facing (public paths; this router verifies its own token) ---


@router.get("/view")
def view_catalog(request: Request):
    db: Session = SessionLocal()
    try:
        catalog = _authenticated_catalog(request, db)
        products = _resolve_products(db, catalog)
        discounts = _active_discounts(db, [p.id for p in products])
        # Real view counter (Section 12's "Views" analytics) - a plain
        # increment on every successful public load, not a fabricated
        # metric; click/product-open tracking isn't implemented (see
        # completion report) and is honestly absent from this response.
        catalog.view_count = (catalog.view_count or 0) + 1
        db.commit()
        return {
            "title": catalog.title,
            "currency": catalog.currency,
            "items": [_product_public_dict(p, _catalog_base_price(db, p, catalog), discounts.get(p.id), catalog.show_stock_status) for p in products],
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
            company_id=catalog.company_id,
        )
        db.add(order)
        catalog.order_count = (catalog.order_count or 0) + 1
        db.commit()
        db.refresh(order)
        return {"status": "created", "order_id": order.id}
    finally:
        db.close()
