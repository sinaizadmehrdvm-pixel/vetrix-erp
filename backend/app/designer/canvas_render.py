"""Generic absolute-position canvas renderer: turns a Document Designer
config (the same {elements:[{type,x,y,w,h,text,color,bg,border,...}]} shape
InvoiceDesigner.jsx/DocumentDesigner.jsx save) into a real PDF, at whatever
physical page size the document kind defines. Unlike app/designer/engine.py's
apply_template() (a header/footer "safe hook" appended to the invoice
Platypus flow), this renders every element at its exact x/y/w/h - built for
business cards, letterheads and banners, which have no other layout of
their own to fall back on.

Coordinate system: callers pass page dimensions and element x/y/w/h in
PDF points with a top-left origin (matching the on-screen canvas exactly,
so what you design is what prints); this module flips Y once for
reportlab's bottom-left origin.
"""
import base64
import os
import tempfile

from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.lib.colors import HexColor, transparent
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Frame, Paragraph
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from app.export.pdf_export import _register_font, _rtl, _esc

# Kind -> (width_pt, height_pt). Chosen directly in points so canvas pixel
# coordinates map 1:1 onto the PDF with no scale-factor guessing.
KIND_PAGE_SIZES = {
    "business_card": (252, 144),   # 3.5in x 2in, standard landscape card
    "letterhead": (595, 842),      # A4 portrait
    "banner": (600, 315),          # ~1.9:1, close to standard social banner/OG ratio
}


def _align(value):
    return {"right": TA_RIGHT, "left": TA_LEFT}.get(value, TA_CENTER)


def _safe_color(value, default="#000000"):
    try:
        return HexColor(value) if value and value != "transparent" else None
    except Exception:
        return HexColor(default)


def _draw_image(c, data_url, x, y, w, h):
    temp_path = None
    try:
        raw = data_url.split(",", 1)[1] if "," in data_url else data_url
        decoded = base64.b64decode(raw)
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        temp.write(decoded)
        temp.close()
        temp_path = temp.name
        c.drawImage(temp_path, x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")
    except Exception:
        pass
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def _draw_qr(c, payload, x, y, size):
    temp_path = None
    try:
        import qrcode

        img = qrcode.make(payload or " ")
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        img.save(temp.name)
        temp.close()
        temp_path = temp.name
        c.drawImage(temp_path, x, y, width=size, height=size)
    except Exception:
        pass
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def render_config_to_pdf(config, width_pt, height_pt, output_path, qr_payload="", logo_data=""):
    font_name = _register_font()
    c = pdfcanvas.Canvas(output_path, pagesize=(width_pt, height_pt))

    for el in (config.get("elements") or []):
        try:
            x = float(el.get("x", 0))
            y_top = float(el.get("y", 0))
            w = max(1.0, float(el.get("w", 10)))
            h = max(1.0, float(el.get("h", 10)))
        except (TypeError, ValueError):
            continue
        y = height_pt - y_top - h  # flip to reportlab's bottom-left origin
        el_type = el.get("type", "text")

        bg = _safe_color(el.get("bg"))
        border = _safe_color(el.get("border"))
        radius = max(0, float(el.get("radius") or 0))

        if bg or border:
            c.saveState()
            if bg:
                c.setFillColor(bg)
            if border:
                c.setStrokeColor(border)
                c.setLineWidth(1)
            c.roundRect(x, y, w, h, radius, fill=1 if bg else 0, stroke=1 if border else 0)
            c.restoreState()

        if el_type == "logo" and logo_data:
            _draw_image(c, logo_data, x, y, w, h)
            continue
        if el_type == "qr":
            size = min(w, h)
            _draw_qr(c, qr_payload, x + (w - size) / 2, y + (h - size) / 2, size)
            continue
        if el_type in {"table", "barcode", "totals"}:
            # Not meaningful outside an invoice context - skip rather than
            # render placeholder invoice data on a business card/banner.
            continue

        text = str(el.get("text") or el.get("label") or "")
        if not text:
            continue
        style = ParagraphStyle(
            f"el_{id(el)}",
            fontName=font_name,
            fontSize=float(el.get("fontSize") or 13),
            leading=float(el.get("fontSize") or 13) * 1.3,
            alignment=_align(el.get("align")),
            textColor=_safe_color(el.get("color"), "#0f172a"),
        )
        # _rtl() reshapes/reorders characters for RTL display - it must run
        # on each line's plain text separately, never on a string that
        # already contains the <br/> markup, or bidi reordering scrambles
        # the tag itself (reproduced and fixed while building this renderer).
        rendered = "<br/>".join(_rtl(_esc(line)) for line in text.split("\n"))
        frame = Frame(x, y, w, h, leftPadding=4, rightPadding=4, topPadding=4, bottomPadding=4, showBoundary=0)
        frame.addFromList([Paragraph(rendered, style)], c)

    c.showPage()
    c.save()
    return output_path
