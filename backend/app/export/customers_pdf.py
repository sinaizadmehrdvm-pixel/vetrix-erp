"""PDF builders for the Customers/Parties list and single-customer profile
reports. Deliberately renders whatever rows/labels the caller supplies
rather than recomputing CRM scoring, balance classification or type labels
itself - that logic already lives once in the frontend (Customers.jsx) and
this module's job is only to lay the already-decided values out on paper,
reusing the same font-registration/RTL-shaping helpers as the existing
invoice PDF exporter so Persian text renders identically across reports.
"""
import os
import tempfile
import uuid

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.export.pdf_export import _esc, _fa_digits, _register_font, _rtl

ACCENT = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
BORDER = colors.HexColor("#e2e8f0")
HEADER_FILL = colors.HexColor("#0f172a")


def _p(text, style, language="fa"):
    text = _esc(text)
    if language == "fa":
        text = _rtl(text)
    return Paragraph(text or "-", style)


def _styles(font_name):
    return {
        "title": ParagraphStyle("title", fontName=font_name, fontSize=17, leading=22, alignment=1, textColor=ACCENT),
        "subtitle": ParagraphStyle("subtitle", fontName=font_name, fontSize=9.5, leading=14, alignment=1, textColor=MUTED),
        "meta": ParagraphStyle("meta", fontName=font_name, fontSize=8.5, leading=13, alignment=1, textColor=MUTED),
        "cell": ParagraphStyle("cell", fontName=font_name, fontSize=8, leading=11, textColor=ACCENT),
        "cell_center": ParagraphStyle("cell_center", fontName=font_name, fontSize=8, leading=11, alignment=1, textColor=ACCENT),
        "header_cell": ParagraphStyle("header_cell", fontName=font_name, fontSize=8.5, leading=11, alignment=1, textColor=colors.white),
        "section": ParagraphStyle("section", fontName=font_name, fontSize=12, leading=16, textColor=ACCENT),
        "label": ParagraphStyle("label", fontName=font_name, fontSize=8.5, leading=13, textColor=MUTED),
        "value": ParagraphStyle("value", fontName=font_name, fontSize=10, leading=14, textColor=ACCENT),
    }


def _report_footer_factory(font_name, language, total_rows, generated_by):
    fa = language == "fa"

    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(font_name, 7.5)
        canvas.setFillColor(MUTED)
        page_text = f"صفحه {canvas.getPageNumber()}" if fa else f"Page {canvas.getPageNumber()}"
        side_text = (
            f"مجموع ردیف‌ها: {_fa_digits(total_rows)} | تهیه‌کننده: {generated_by}"
            if fa else
            f"Total rows: {total_rows} | Prepared by: {generated_by}"
        )
        if fa:
            page_text = _rtl(page_text)
            side_text = _rtl(side_text)
        canvas.drawCentredString(doc.pagesize[0] / 2, 8 * mm, page_text)
        if fa:
            canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 8 * mm, side_text)
        else:
            canvas.drawString(doc.leftMargin, 8 * mm, side_text)
        canvas.restoreState()

    return _footer


def _header_block(styles, language, title, subtitle, filters_label, generated_at, company_name):
    fa = language == "fa"
    elements = [
        _p(company_name or "Vetrix ERP", styles["subtitle"], language),
        Spacer(1, 4),
        _p(title, styles["title"], language),
    ]
    if subtitle:
        elements.append(_p(subtitle, styles["subtitle"], language))
    meta_line = (f"تاریخ و ساعت تهیه: {generated_at}" if fa else f"Generated at: {generated_at}")
    elements.append(Spacer(1, 4))
    elements.append(_p(meta_line, styles["meta"], language))
    if filters_label:
        filters_line = (f"فیلترهای فعال: {filters_label}" if fa else f"Active filters: {filters_label}")
        elements.append(_p(filters_line, styles["meta"], language))
    elements.append(Spacer(1, 10))
    return elements


def build_customers_list_pdf(rows, headers, meta, language="fa", filename=None):
    """rows: list[list[str]] already formatted/labeled by the caller, in
    display order (row 0 = header order defined by `headers`).
    headers: list[str] column headers, already translated by the caller.
    meta: dict with title/subtitle/filters_label/generated_at/generated_by/company_name.
    """
    font_name = _register_font()
    fa = language == "fa"
    styles = _styles(font_name)
    output_name = filename or os.path.join(tempfile.gettempdir(), f"vetrix_customers_{uuid.uuid4().hex}.pdf")

    page = landscape(A4)
    doc = SimpleDocTemplate(
        output_name, pagesize=page,
        leftMargin=12 * mm, rightMargin=12 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
    )

    elements = _header_block(
        styles, language,
        meta.get("title") or ("فهرست طرف‌حساب‌ها" if fa else "Customers list"),
        meta.get("subtitle"),
        meta.get("filters_label"),
        meta.get("generated_at"),
        meta.get("company_name"),
    )

    table_data = [[_p(h, styles["header_cell"], language) for h in headers]]
    for row in rows:
        table_data.append([_p(cell, styles["cell_center"] if i == 0 else styles["cell"], language) for i, cell in enumerate(row)])

    available_width = page[0] - 24 * mm
    first_col = 22
    rest = (available_width - first_col) / max(1, len(headers) - 1)
    col_widths = [first_col] + [rest] * (len(headers) - 1)

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(table)

    footer = _report_footer_factory(font_name, language, len(rows), meta.get("generated_by") or "-")
    doc.build(elements, onFirstPage=footer, onLaterPages=footer)
    return output_name


def build_customer_profile_pdf(customer, ledger_rows, ledger_headers, summary_rows, meta, language="fa", filename=None):
    """A formal single-customer profile document: identity block, financial
    summary key/value grid, then the full ledger table with repeating
    header rows across pages.
    """
    font_name = _register_font()
    fa = language == "fa"
    styles = _styles(font_name)
    output_name = filename or os.path.join(tempfile.gettempdir(), f"vetrix_customer_profile_{uuid.uuid4().hex}.pdf")

    page = portrait(A4)
    doc = SimpleDocTemplate(
        output_name, pagesize=page,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
    )

    elements = _header_block(
        styles, language,
        meta.get("title") or (f"پرونده طرف‌حساب: {customer.get('name', '')}" if fa else f"Customer profile: {customer.get('name', '')}"),
        None,
        None,
        meta.get("generated_at"),
        meta.get("company_name"),
    )

    identity_pairs = meta.get("identity_pairs") or []
    if identity_pairs:
        identity_table = Table(
            [[_p(f"{label}", styles["label"], language), _p(str(val or "-"), styles["value"], language)] for label, val in identity_pairs],
            colWidths=[(page[0] - 32 * mm) * 0.32, (page[0] - 32 * mm) * 0.68],
        )
        identity_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(identity_table)
        elements.append(Spacer(1, 10))

    if summary_rows:
        summary_table = Table(
            [[_p(label, styles["header_cell"], language) for label, _ in summary_rows],
             [_p(str(val), styles["cell_center"], language) for _, val in summary_rows]],
        )
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
            ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 12))

    elements.append(_p("گردش حساب" if fa else "Account ledger", styles["section"], language))
    elements.append(Spacer(1, 4))

    ledger_table_data = [[_p(h, styles["header_cell"], language) for h in ledger_headers]]
    for row in ledger_rows:
        ledger_table_data.append([_p(cell, styles["cell"], language) for cell in row])

    available_width = page[0] - 32 * mm
    col_widths = [available_width * w for w in (0.16, 0.40, 0.15, 0.15, 0.14)][: len(ledger_headers)]
    if len(col_widths) < len(ledger_headers):
        col_widths += [available_width / len(ledger_headers)] * (len(ledger_headers) - len(col_widths))

    ledger_table = Table(ledger_table_data, colWidths=col_widths, repeatRows=1)
    ledger_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(ledger_table)
    if not ledger_rows:
        elements.append(Spacer(1, 8))
        elements.append(_p("تراکنشی ثبت نشده است." if fa else "No transactions recorded.", styles["meta"], language))

    footer = _report_footer_factory(font_name, language, len(ledger_rows), meta.get("generated_by") or "-")
    doc.build(elements, onFirstPage=footer, onLaterPages=footer)
    return output_name
