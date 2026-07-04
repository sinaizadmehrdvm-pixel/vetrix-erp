from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image,
    PageBreak,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4, A5, landscape, portrait
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.units import mm
from reportlab.graphics.barcode import code128
import os
import base64
import tempfile
import html

try:
    from app.designer.engine import apply_template
except Exception:
    apply_template = None

PDF_PATH = "vetrix_invoices.pdf"


# -----------------------------
# Font / Persian helpers
# -----------------------------

def _register_font():
    possible_fonts = [
        "Vazirmatn-Regular.ttf",
        "Vazir.ttf",
        "arial.ttf",
        "C:/Windows/Fonts/Vazirmatn-Regular.ttf",
        "C:/Windows/Fonts/Vazir.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
    ]

    for font_path in possible_fonts:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont("VetrixFont", font_path))
                return "VetrixFont"
            except Exception:
                pass

    return "Helvetica"


def _rtl(text):
    text = "" if text is None else str(text)
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        return get_display(arabic_reshaper.reshape(text))
    except Exception:
        return text


def _esc(value):
    return html.escape("" if value is None else str(value))


def _fa_digits(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _safe_float(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _get_attr(obj, key, default=""):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _format_date(value, language="fa"):
    if not value:
        return "-"
    try:
        if hasattr(value, "strftime"):
            text = value.strftime("%Y/%m/%d - %H:%M")
        else:
            text = str(value).replace("T", " ")[:16]
    except Exception:
        text = str(value)

    return _fa_digits(text) if language == "fa" else text


def _money(value, currency="تومان", language="fa"):
    text = f"{_safe_float(value):,.0f} {currency}"
    return _fa_digits(text) if language == "fa" else text


def _status_label(value, language="fa"):
    raw = str(value or "").lower()

    if language != "fa":
        return raw or "-"

    return {
        "paid": "تسویه شده",
        "unpaid": "تسویه نشده",
        "partial": "تسویه ناقص",
        "draft": "پیش نویس",
        "final": "نهایی",
    }.get(raw, raw or "-")


def _invoice_type_label(value, language="fa", full=False):
    raw = str(value or "")

    if language != "fa":
        return raw or "-"

    labels = {
        "sale": "فاکتور فروش" if full else "فروش",
        "buy": "فاکتور خرید" if full else "خرید",
        "proforma": "پیش فاکتور",
        "return_sale": "مرجوعی فروش",
        "return_buy": "مرجوعی خرید",
    }

    return labels.get(raw, raw or "-")


def _p(text, style, language="fa"):
    text = _esc(text)

    if language == "fa":
        text = _rtl(text)

    return Paragraph(text, style)


def _p_lines(lines, style, language="fa"):
    clean = []

    for line in lines:
        if line is None or str(line).strip() == "":
            continue

        text = _esc(line)

        if language == "fa":
            text = _rtl(_fa_digits(text))

        clean.append(text)

    return Paragraph("<br/>".join(clean) or "-", style)


def _image_from_base64(data, width=32 * mm, height=18 * mm):
    if not data:
        return None

    try:
        if "," in data:
            data = data.split(",", 1)[1]

        raw = base64.b64decode(data)
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        temp.write(raw)
        temp.close()

        return Image(temp.name, width=width, height=height)
    except Exception:
        return None


def _qr_image(payload, width=25 * mm, height=25 * mm):
    try:
        import qrcode

        img = qrcode.make(payload)
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        img.save(temp.name)

        return Image(temp.name, width=width, height=height)
    except Exception:
        return None


def _barcode_flowable(value, width=55 * mm, height=13 * mm):
    try:
        return code128.Code128(
            str(value),
            barHeight=height,
            barWidth=0.45 * mm,
            humanReadable=True,
        )
    except Exception:
        return None


# -----------------------------
# Layout helpers
# -----------------------------

def _page_size(page_size="A4", orientation="portrait"):
    size_key = str(page_size or "A4").upper()

    if size_key == "A5":
        size = A5
    elif size_key == "THERMAL80":
        size = (80 * mm, 290 * mm)
    elif size_key == "THERMAL58":
        size = (58 * mm, 290 * mm)
    else:
        size = A4

    if orientation == "landscape" and size_key not in ["THERMAL80", "THERMAL58"]:
        return landscape(size)

    return portrait(size)


def _margins(page_size="A4"):
    size_key = str(page_size or "A4").upper()

    if size_key == "THERMAL58":
        return 3 * mm, 3 * mm, 4 * mm, 4 * mm

    if size_key == "THERMAL80":
        return 4 * mm, 4 * mm, 5 * mm, 5 * mm

    if size_key == "A5":
        return 9 * mm, 9 * mm, 10 * mm, 10 * mm

    return 18 * mm, 18 * mm, 16 * mm, 16 * mm


def _col_widths(page_width, page_size="A4", language="fa"):
    size_key = str(page_size or "A4").upper()
    usable = page_width

    if size_key in ["THERMAL58", "THERMAL80"]:
        if language == "fa":
            return [
                usable * 0.20,
                usable * 0.24,
                usable * 0.25,
                usable * 0.18,
                usable * 0.13,
            ]

        return [
            usable * 0.13,
            usable * 0.18,
            usable * 0.25,
            usable * 0.24,
            usable * 0.20,
        ]

    if language == "fa":
        return [
            usable * 0.16,
            usable * 0.17,
            usable * 0.20,
            usable * 0.15,
            usable * 0.12,
            usable * 0.10,
            usable * 0.10,
        ]

    return [
        usable * 0.10,
        usable * 0.12,
        usable * 0.15,
        usable * 0.20,
        usable * 0.17,
        usable * 0.16,
        usable * 0.10,
    ]


def _customer_name(customers, customer_id):
    if not customers:
        return str(customer_id or "-")

    cust = customers.get(customer_id)

    if cust is None:
        cust = customers.get(str(customer_id))

    if cust is None:
        return str(customer_id or "-")

    if isinstance(cust, dict):
        return (
            cust.get("name")
            or cust.get("customer_name")
            or cust.get("title")
            or str(customer_id or "-")
        )

    return str(cust)


def _header(elements, styles, settings, language, page_size, template, available_width=None):
    fa = language == "fa"
    company_name = _get_attr(settings, "company_name", "Vetrix ERP") or "Vetrix ERP"
    show_logo = bool(_get_attr(settings, "show_logo", True))
    logo_data = _get_attr(settings, "logo_data", "")
    size_key = str(page_size or "A4").upper()

    logo_width = 36 * mm
    logo_height = 22 * mm

    if size_key == "A5":
        logo_width = 28 * mm
        logo_height = 17 * mm

    if size_key in ["THERMAL58", "THERMAL80"]:
        logo_width = 22 * mm
        logo_height = 13 * mm

    logo = (
        _image_from_base64(logo_data, width=logo_width, height=logo_height)
        if show_logo
        else None
    )

    lines = [
        company_name,
        f"{'مدیر' if fa else 'Manager'}: {_get_attr(settings, 'manager_name', '')}"
        if _get_attr(settings, "manager_name", "")
        else "",
        f"{'تلفن' if fa else 'Phone'}: {_get_attr(settings, 'phone', '')}"
        if _get_attr(settings, "phone", "")
        else "",
        f"{'موبایل' if fa else 'Mobile'}: {_get_attr(settings, 'mobile', '')}"
        if _get_attr(settings, "mobile", "")
        else "",
        f"{'ایمیل' if fa else 'Email'}: {_get_attr(settings, 'email', '')}"
        if _get_attr(settings, "email", "")
        else "",
        f"{'وب سایت' if fa else 'Website'}: {_get_attr(settings, 'website', '')}"
        if _get_attr(settings, "website", "")
        else "",
        f"{'شناسه ملی' if fa else 'National ID'}: {_get_attr(settings, 'national_id', '')}"
        if _get_attr(settings, "national_id", "")
        else "",
        f"{'کد اقتصادی' if fa else 'Economic Code'}: {_get_attr(settings, 'economic_code', '')}"
        if _get_attr(settings, "economic_code", "")
        else "",
        f"{'آدرس' if fa else 'Address'}: {_get_attr(settings, 'address', '')}"
        if _get_attr(settings, "address", "")
        else "",
    ]

    compact = size_key in ["THERMAL58", "THERMAL80"] or template == "compact"

    if compact:
        if logo:
            elements.append(logo)
            elements.append(Spacer(1, 3))

        elements.append(_p(company_name, styles["title"], language))

        if not size_key.startswith("THERMAL"):
            elements.append(_p_lines(lines[1:], styles["small_center"], language))

        elements.append(Spacer(1, 5))
        return

    info = _p_lines(lines, styles["body"], language)
    brand = logo if logo else _p(company_name, styles["title"], language)

    if available_width:
        brand_width = min(45 * mm, available_width * 0.28)
        info_width = max(available_width - brand_width, available_width * 0.65)
    else:
        if size_key == "A5":
            info_width = 92 * mm
            brand_width = 34 * mm
        else:
            info_width = 130 * mm
            brand_width = 45 * mm

    data = [[info, brand]] if fa else [[brand, info]]
    widths = [info_width, brand_width] if fa else [brand_width, info_width]

    table = Table(data, colWidths=widths, hAlign="CENTER")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#67e8f9")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    elements.append(table)
    elements.append(Spacer(1, 10))


def _footer(canvas, doc, font_name, language="fa"):
    page_num = canvas.getPageNumber()
    text = f"صفحه {page_num}" if language == "fa" else f"Page {page_num}"

    if language == "fa":
        text = _rtl(_fa_digits(text))

    canvas.saveState()
    canvas.setFont(font_name, 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawCentredString(doc.pagesize[0] / 2, 8 * mm, text)
    canvas.restoreState()


# -----------------------------
# Designer helpers
# -----------------------------

def _extract_template_config(settings=None, template_config=None):
    if template_config:
        return template_config

    if not settings:
        return None

    direct = _get_attr(settings, "pdf_template", None)

    if direct:
        if isinstance(direct, dict):
            return direct.get("config", direct)

        config = _get_attr(direct, "config", None)
        if config:
            return config

    config = _get_attr(settings, "config", None)
    if config:
        return config

    return None


def _safe_apply_template(elements, config, styles, language="fa"):
    if not config:
        return elements

    if apply_template is None:
        return elements

    try:
        fa = language == "fa"
        return apply_template(elements, config, styles, _rtl, fa)
    except Exception:
        return elements


def _designer_note(elements, config, styles, language="fa"):
    """
    فعلاً برای حفظ پایداری PDF، قالب Designer به صورت Safe Hook اعمال می‌شود.
    خروجی دقیق absolute canvas در مرحله بعد با Canvas Renderer اضافه می‌شود.
    """
    if not config:
        return

    elements.append(Spacer(1, 4))

    title = (
        "قالب طراحی‌شده در Invoice Designer اعمال شده است."
        if language == "fa"
        else "Invoice Designer template is attached."
    )

    elements.append(_p(title, styles["small_center"], language))


# -----------------------------
# Public builder
# -----------------------------

def build_invoice_pdf(
    invoices,
    language="fa",
    settings=None,
    customers=None,
    page_size="A4",
    orientation="portrait",
    template="official",
    filename=None,
    template_config=None,
):
    """Build professional invoice report PDF.

    Supports page_size: A4, A5, THERMAL80, THERMAL58
    Supports template: official, premium, compact
    Supports template_config from Invoice Designer
    """
    font_name = _register_font()
    fa = language == "fa"
    customers = customers or {}
    size_key = str(page_size or "A4").upper()
    currency = _get_attr(settings, "currency", "تومان") or "تومان"

    output_name = filename or f"vetrix_invoices_{size_key}_{template}.pdf"
    page = _page_size(page_size, orientation)
    left, right, top, bottom = _margins(page_size)

    doc = SimpleDocTemplate(
        output_name,
        pagesize=page,
        rightMargin=right,
        leftMargin=left,
        topMargin=top,
        bottomMargin=bottom,
    )

    available_width = doc.pagesize[0] - left - right

    base = getSampleStyleSheet()
    align_body = 2 if fa else 0

    styles = {
        "title": ParagraphStyle(
            "VetrixTitle",
            parent=base["Title"],
            fontName=font_name,
            fontSize=17 if size_key not in ["THERMAL58", "THERMAL80"] else 12,
            leading=22,
            alignment=1,
            textColor=colors.HexColor("#0891b2"),
        ),
        "subtitle": ParagraphStyle(
            "VetrixSubtitle",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=10 if size_key not in ["THERMAL58", "THERMAL80"] else 8,
            leading=14,
            alignment=1,
            textColor=colors.HexColor("#334155"),
        ),
        "body": ParagraphStyle(
            "VetrixBody",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=8.5 if size_key not in ["THERMAL58", "THERMAL80"] else 6.5,
            leading=12 if size_key not in ["THERMAL58", "THERMAL80"] else 8,
            alignment=align_body,
            textColor=colors.HexColor("#0f172a"),
        ),
        "table": ParagraphStyle(
            "VetrixTable",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=7.5 if size_key not in ["THERMAL58", "THERMAL80"] else 5.8,
            leading=10 if size_key not in ["THERMAL58", "THERMAL80"] else 7,
            alignment=1,
            textColor=colors.HexColor("#0f172a"),
        ),
        "table_header": ParagraphStyle(
            "VetrixTableHeader",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=7.5 if size_key not in ["THERMAL58", "THERMAL80"] else 5.8,
            leading=10 if size_key not in ["THERMAL58", "THERMAL80"] else 7,
            alignment=1,
            textColor=colors.white,
        ),
        "small_center": ParagraphStyle(
            "VetrixSmallCenter",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=7.5 if size_key not in ["THERMAL58", "THERMAL80"] else 5.5,
            leading=10,
            alignment=1,
            textColor=colors.HexColor("#334155"),
        ),
    }

    elements = []

    designer_config = _extract_template_config(settings=settings, template_config=template_config)

    _header(
        elements,
        styles,
        settings,
        language,
        page_size,
        template,
        available_width=available_width,
    )

    title = "گزارش فاکتورها" if fa else "Invoice Report"
    elements.append(_p(title, styles["title"], language))
    elements.append(Spacer(1, 7))

    invoices = list(invoices or [])
    count = len(invoices)
    total_sum = sum(_safe_float(_get_attr(i, "total_amount", 0)) for i in invoices)

    summary_text = (
        f"تعداد فاکتور: {count} | جمع کل: {_money(total_sum, currency, language)}"
        if fa
        else f"Invoice count: {count} | Total: {_money(total_sum, currency, language)}"
    )

    elements.append(_p(summary_text, styles["subtitle"], language))
    elements.append(Spacer(1, 8))

    thermal = size_key in ["THERMAL58", "THERMAL80"]

    if thermal:
        header = (
            ["وضعیت", "مبلغ", "طرف حساب", "نوع", "#"]
            if fa
            else ["#", "Type", "Customer", "Total", "Status"]
        )
    else:
        header = (
            ["وضعیت", "باقی مانده", "مبلغ کل", "طرف حساب", "نوع", "تاریخ", "شماره"]
            if fa
            else ["ID", "Date", "Type", "Customer", "Total", "Remaining", "Status"]
        )

    data = [[_p(h, styles["table_header"], language) for h in header]]

    for inv in invoices:
        inv_id = _get_attr(inv, "id", "")
        inv_type = _get_attr(inv, "invoice_type", "")
        customer_id = _get_attr(inv, "customer_id", "")
        customer_name = _customer_name(customers, customer_id)
        total = _safe_float(_get_attr(inv, "total_amount", 0))
        remaining = _safe_float(_get_attr(inv, "remaining_amount", total))
        status = _get_attr(inv, "payment_status", _get_attr(inv, "status", ""))
        date = _format_date(_get_attr(inv, "created_at", ""), language)

        if thermal:
            if fa:
                row = [
                    _status_label(status, language),
                    _money(total, currency, language),
                    customer_name,
                    _invoice_type_label(inv_type, language),
                    f"#{_fa_digits(inv_id)}",
                ]
            else:
                row = [
                    f"#{inv_id}",
                    _invoice_type_label(inv_type, language),
                    customer_name,
                    _money(total, currency, language),
                    _status_label(status, language),
                ]
        else:
            if fa:
                row = [
                    _status_label(status, language),
                    _money(remaining, currency, language),
                    _money(total, currency, language),
                    customer_name,
                    _invoice_type_label(inv_type, language),
                    date,
                    f"#{_fa_digits(inv_id)}",
                ]
            else:
                row = [
                    f"#{inv_id}",
                    date,
                    _invoice_type_label(inv_type, language),
                    customer_name,
                    _money(total, currency, language),
                    _money(remaining, currency, language),
                    _status_label(status, language),
                ]

        data.append([_p(cell, styles["table"], language) for cell in row])

    table = Table(
        data,
        repeatRows=1,
        hAlign="CENTER",
        colWidths=_col_widths(available_width, page_size, language),
    )

    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 5 if not thermal else 2),
            ]
        )
    )

    elements.append(table)
    elements.append(Spacer(1, 10))

    footer_text = _get_attr(settings, "invoice_footer", "") or (
        "این گزارش توسط سیستم حسابداری Vetrix ERP تولید شده است."
        if fa
        else "Generated by Vetrix ERP accounting system."
    )

    elements.append(_p(footer_text, styles["small_center"], language))

    show_qr = bool(_get_attr(settings, "show_qr", True))
    show_barcode = bool(_get_attr(settings, "show_barcode", True))

    qr = (
        _qr_image(
            f"Vetrix ERP | Invoice report | Count: {count} | Total: {total_sum}",
            width=20 * mm,
            height=20 * mm,
        )
        if show_qr and not thermal
        else None
    )

    barcode = (
        _barcode_flowable(f"VETRIX-REPORT-{count}")
        if show_barcode and not thermal
        else None
    )

    if qr or barcode:
        elements.append(Spacer(1, 8))
        code_row = []

        if qr:
            code_row.append(qr)

        if barcode:
            code_row.append(barcode)

        elements.append(Table([code_row], hAlign="CENTER"))

    if designer_config:
        _designer_note(elements, designer_config, styles, language)
        elements = _safe_apply_template(elements, designer_config, styles, language)

    doc.build(
        elements,
        onFirstPage=lambda c, d: _footer(c, d, font_name, language),
        onLaterPages=lambda c, d: _footer(c, d, font_name, language),
    )

    return output_name