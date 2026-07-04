from fastapi import APIRouter
from app.database import SessionLocal
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
        "config": normalized_config,
    }


@router.post("/template")
def create_template(data: dict):
    db = SessionLocal()
    try:
        incoming_config = data.get("config", {}) or {}
        if not isinstance(incoming_config, dict):
            incoming_config = {}

        page_size = data.get("page_size") or incoming_config.get("page_size") or "A4"

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
            config=incoming_config,
        )

        db.add(template)
        db.commit()
        db.refresh(template)

        return normalize_template(template)
    finally:
        db.close()


@router.get("/templates")
def get_templates():
    db = SessionLocal()
    try:
        templates = db.query(PdfTemplate).order_by(PdfTemplate.id.desc()).all()
        return [normalize_template(t) for t in templates]
    finally:
        db.close()


@router.get("/template/{id}")
def get_template(id: int):
    db = SessionLocal()
    try:
        template = db.query(PdfTemplate).filter(PdfTemplate.id == id).first()
        if not template:
            return {"status": "error", "message": "Template not found"}
        return normalize_template(template)
    finally:
        db.close()


@router.delete("/template/{id}")
def delete_template(id: int):
    db = SessionLocal()
    try:
        template = db.query(PdfTemplate).filter(PdfTemplate.id == id).first()

        if not template:
            return {"status": "error", "message": "Template not found"}

        db.delete(template)
        db.commit()

        return {"status": "success", "message": "Template deleted"}
    finally:
        db.close()
