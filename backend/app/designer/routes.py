import tempfile

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from app.database import SessionLocal
from app.company_scope import current_company_id
from .canvas_render import KIND_PAGE_SIZES, render_config_to_pdf
from .models import PdfTemplate

router = APIRouter(prefix="/designer", tags=["designer"])


def _get_config_value(config, key, default=None):
    if not isinstance(config, dict):
        return default
    return config.get(key, default)


def _normalize_elements_from_old_config(config):
    """
    تبدیل قالب‌های قدیمی header/footer به قالب جدید elements
    تا Print Studio و Designer هر دو همیشه config.elements داشته باشند.
    """
    if not isinstance(config, dict):
        return []

    if isinstance(config.get("elements"), list):
        return config.get("elements") or []

    elements = []

    header = config.get("header")
    if isinstance(header, dict):
        header_title = header.get("title") or header.get("text") or "Vetrix ERP"
        elements.append({
            "id": "header_title",
            "type": "text",
            "label": "عنوان سربرگ",
            "text": header_title,
            "x": 60,
            "y": 40,
            "w": 220,
            "h": 40,
            "fontSize": 18,
            "color": header.get("color") or "#0891b2",
            "bg": "#ffffff",
            "border": "#e2e8f0",
            "radius": 10,
            "align": "center",
            "bold": True,
        })

    footer = config.get("footer")
    if isinstance(footer, dict):
        footer_text = footer.get("text") or "طراحی شده با Vetrix Invoice Designer"
        elements.append({
            "id": "footer_text",
            "type": "text",
            "label": "متن پایین",
            "text": footer_text,
            "x": 160,
            "y": 700,
            "w": 300,
            "h": 35,
            "fontSize": 12,
            "color": "#334155",
            "bg": "#ffffff",
            "border": "#e2e8f0",
            "radius": 10,
            "align": "center",
            "bold": False,
        })

    return elements


def normalize_template(template):
    """
    خروجی واحد برای همه قالب‌ها:
    {
      id, name, page_size,
      config: { page_size, theme, elements: [...] }
    }
    """
    if template is None:
        return None

    raw_config = getattr(template, "config", None) or {}
    if not isinstance(raw_config, dict):
        raw_config = {}

    page_size = getattr(template, "page_size", None) or raw_config.get("page_size") or "A4"
    elements = _normalize_elements_from_old_config(raw_config)

    normalized_config = {
        **raw_config,
        "page_size": raw_config.get("page_size") or page_size,
        "theme": raw_config.get("theme") or {"primary": "#0f172a", "accent": "#06b6d4"},
        "elements": elements,
    }

    return {
        "id": getattr(template, "id", None),
        "name": getattr(template, "name", "") or "قالب بدون نام",
        "page_size": page_size,
        "kind": getattr(template, "kind", None) or "invoice",
        "config": normalized_config,
    }


ALLOWED_KINDS = {"invoice", "business_card", "letterhead", "banner"}


@router.post("/template")
def create_template(data: dict, request: Request):
    db = SessionLocal()
    try:
        incoming_config = data.get("config", {}) or {}
        if not isinstance(incoming_config, dict):
            incoming_config = {}

        page_size = data.get("page_size") or incoming_config.get("page_size") or "A4"
        kind = data.get("kind") or "invoice"
        if kind not in ALLOWED_KINDS:
            kind = "invoice"

        # همیشه elements را حفظ/نرمال می‌کنیم تا قالب برای Print Studio قابل خواندن باشد.
        incoming_config = {
            **incoming_config,
            "page_size": incoming_config.get("page_size") or page_size,
            "theme": incoming_config.get("theme") or {"primary": "#0f172a", "accent": "#06b6d4"},
            "elements": _normalize_elements_from_old_config(incoming_config),
        }

        template = PdfTemplate(
            name=data.get("name") or "قالب طراحی فاکتور",
            page_size=page_size,
            kind=kind,
            config=incoming_config,
            company_id=current_company_id(request),
        )

        db.add(template)
        db.commit()
        db.refresh(template)

        return normalize_template(template)
    finally:
        db.close()


@router.get("/templates")
def get_templates(request: Request, kind: str = "invoice"):
    """kind='all' lists every kind at once (used by the Design Studio hub
    gallery) - any other unrecognized value still falls back to 'invoice',
    preserving the exact old default for every existing caller."""
    db = SessionLocal()
    try:
        query = db.query(PdfTemplate).filter(PdfTemplate.company_id == current_company_id(request))
        if kind != "all":
            if kind not in ALLOWED_KINDS:
                kind = "invoice"
            query = query.filter(PdfTemplate.kind == kind)
        templates = query.order_by(PdfTemplate.id.desc()).all()
        return [normalize_template(t) for t in templates]
    finally:
        db.close()


@router.get("/template/{id}")
def get_template(id: int, request: Request):
    db = SessionLocal()
    try:
        template = db.query(PdfTemplate).filter(PdfTemplate.id == id, PdfTemplate.company_id == current_company_id(request)).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return normalize_template(template)
    finally:
        db.close()


@router.put("/template/{id}/rename")
def rename_template(id: int, data: dict, request: Request):
    new_name = str(data.get("name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="name is required")
    db = SessionLocal()
    try:
        template = db.query(PdfTemplate).filter(PdfTemplate.id == id, PdfTemplate.company_id == current_company_id(request)).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        template.name = new_name
        db.commit()
        db.refresh(template)
        return normalize_template(template)
    finally:
        db.close()


@router.delete("/template/{id}")
def delete_template(id: int, request: Request):
    db = SessionLocal()
    try:
        template = db.query(PdfTemplate).filter(PdfTemplate.id == id, PdfTemplate.company_id == current_company_id(request)).first()

        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        db.delete(template)
        db.commit()

        return {"status": "success", "message": "Template deleted"}
    finally:
        db.close()


@router.get("/template/{id}/pdf")
def render_template_pdf(id: int, request: Request):
    """Real, print-ready PDF export for the non-invoice document kinds
    (business card / letterhead / banner) - renders every canvas element
    at its exact position via canvas_render, using the company's own logo
    and contact details from Settings for the logo/QR elements."""
    from app.settings_routes import AppSettings

    db = SessionLocal()
    try:
        company_id = current_company_id(request)
        template = db.query(PdfTemplate).filter(PdfTemplate.id == id, PdfTemplate.company_id == company_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        kind = getattr(template, "kind", None) or "invoice"
        if kind not in KIND_PAGE_SIZES:
            raise HTTPException(status_code=400, detail="This document kind is not exportable from this endpoint")

        settings = db.query(AppSettings).filter(AppSettings.company_id == company_id).first()
        logo_data = (settings.logo_data if settings else "") or ""
        qr_payload = "\n".join(filter(None, [
            getattr(settings, "company_name", "") if settings else "",
            getattr(settings, "website", "") if settings else "",
            getattr(settings, "phone", "") if settings else "",
        ])) or (getattr(template, "name", "") or "Vetrix ERP")

        width_pt, height_pt = KIND_PAGE_SIZES[kind]
        output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
        render_config_to_pdf(template.config or {}, width_pt, height_pt, output_path, qr_payload=qr_payload, logo_data=logo_data)
    finally:
        db.close()

    return FileResponse(output_path, media_type="application/pdf", filename=f"{kind}-{id}.pdf")
