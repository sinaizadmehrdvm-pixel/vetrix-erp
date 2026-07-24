"""Voice-driven report generation and delivery.

A staff member reviews a voice transcript in the Change Request Center
(app/change_requests.py) and picks a report type, format, and destination
email; once a second admin approves it, this module builds the report and
emails it. Report data is never recomputed here - every report reuses one
of main.py's already-tested /reports/* route handler functions directly
(they're plain callables under the FastAPI decorator) via a deferred,
function-local `import main`, the same reason app/recurring_invoices.py,
app/payment_gateway.py and app/payment_reminders.py do this.

Sending requires SMTP configuration (the same VETRIX_SMTP_* variables
app/payment_reminders.py uses); without it, or on a genuine send failure,
the outcome is still returned honestly rather than pretending success.
"""
import csv
import io
import os
import smtplib
import tempfile
from email.message import EmailMessage

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle

from app.export.pdf_export import _p, _register_font

FORMATS = {"pdf", "csv"}


def _load_sales(main):
    return main.reports_sales()


def _load_purchases(main):
    return main.reports_purchases()


def _load_inventory(main):
    return main.reports_inventory().get("products", [])


def _load_customer_balances(main):
    return main.reports_customer_balances().get("all", [])


def _load_product_profit(main):
    return main.reports_product_profit().get("items", [])


def _load_open_invoices(main):
    return main.reports_open_invoices().get("items", [])


def _load_inventory_movements(main):
    return main.reports_inventory_movements().get("items", [])


REPORT_REGISTRY = {
    "sales": {
        "title": "Sales Invoices",
        "loader": _load_sales,
        "columns": [
            ("id", "Invoice #"), ("customer_name", "Customer"), ("total_amount", "Total"),
            ("payment_status", "Status"), ("created_at", "Date"),
        ],
    },
    "purchases": {
        "title": "Purchase Invoices",
        "loader": _load_purchases,
        "columns": [
            ("id", "Invoice #"), ("customer_name", "Supplier"), ("total_amount", "Total"),
            ("payment_status", "Status"), ("created_at", "Date"),
        ],
    },
    "inventory": {
        "title": "Inventory",
        "loader": _load_inventory,
        "columns": [
            ("name", "Product"), ("stock", "Stock"), ("sell_price", "Sell price"),
            ("stock_value_sell", "Stock value"), ("low_stock", "Low stock"),
        ],
    },
    "customer_balances": {
        "title": "Customer Balances",
        "loader": _load_customer_balances,
        "columns": [
            ("name", "Customer"), ("balance", "Balance"), ("debit", "Debtor"),
            ("credit", "Creditor"), ("invoice_count", "Invoices"),
        ],
    },
    "product_profit": {
        "title": "Product Profitability",
        "loader": _load_product_profit,
        "columns": [
            ("name", "Product"), ("sold_qty", "Sold qty"), ("revenue", "Revenue"),
            ("profit", "Profit"), ("margin_percent", "Margin %"),
        ],
    },
    "open_invoices": {
        "title": "Open (Unsettled) Invoices",
        "loader": _load_open_invoices,
        "columns": [
            ("id", "Invoice #"), ("customer_name", "Customer"), ("total_amount", "Total"),
            ("remaining_amount", "Remaining"), ("created_at", "Date"),
        ],
    },
    "inventory_movements": {
        "title": "Stock Movements",
        "loader": _load_inventory_movements,
        "columns": [
            ("product_name", "Product"), ("warehouse", "Warehouse"), ("movement_type", "Type"),
            ("quantity", "Quantity"), ("movement_date", "Date"),
        ],
    },
}


def _rows_for(report_type):
    import main  # deferred - see module docstring

    spec = REPORT_REGISTRY.get(report_type)
    if not spec:
        raise ValueError(f"Unknown report_type: {report_type}. Choose one of: {', '.join(sorted(REPORT_REGISTRY))}")
    rows = spec["loader"](main)
    if not isinstance(rows, list):
        raise ValueError(f"Report '{report_type}' did not return a row list")
    return spec, rows


def _format_cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    return str(value)


def generate_csv(report_type: str) -> bytes:
    spec, rows = _rows_for(report_type)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([label for _, label in spec["columns"]])
    for row in rows:
        writer.writerow([_format_cell(row.get(key)) for key, _ in spec["columns"]])
    # UTF-8 BOM so spreadsheet apps open Persian/Arabic text correctly.
    return buffer.getvalue().encode("utf-8-sig")


def generate_pdf(report_type: str) -> bytes:
    spec, rows = _rows_for(report_type)
    font_name = _register_font()

    output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
    try:
        doc = SimpleDocTemplate(
            output_path, pagesize=A4,
            leftMargin=14 * mm, rightMargin=14 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        )
        base = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "ReportTitle", parent=base["Title"], fontName=font_name, fontSize=18,
            alignment=1, textColor=colors.HexColor("#0891b2"),
        )
        cell_style = ParagraphStyle("ReportCell", parent=base["BodyText"], fontName=font_name, fontSize=9)
        header_style = ParagraphStyle("ReportHeader", parent=cell_style, textColor=colors.white)

        story = [_p(spec["title"], title_style, "en"), Spacer(1, 8 * mm)]

        table_rows = [[_p(label, header_style, "en") for _, label in spec["columns"]]]
        for row in rows:
            table_rows.append([_p(_format_cell(row.get(key)), cell_style, "en") for key, _ in spec["columns"]])

        table = Table(table_rows, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0891b2")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(table)
        doc.build(story)

        with open(output_path, "rb") as handle:
            return handle.read()
    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass


def generate_report(report_type: str, report_format: str) -> bytes:
    if report_format not in FORMATS:
        raise ValueError(f"format must be one of: {', '.join(sorted(FORMATS))}")
    if report_format == "csv":
        return generate_csv(report_type)
    return generate_pdf(report_type)


def _smtp_configured() -> bool:
    return bool(os.getenv("VETRIX_SMTP_HOST", "").strip())


def _send_email_with_attachment(to_email: str, subject: str, body: str, filename: str, content: bytes, mime_type: str):
    host = os.getenv("VETRIX_SMTP_HOST", "")
    port = int(os.getenv("VETRIX_SMTP_PORT", "587"))
    user = os.getenv("VETRIX_SMTP_USER", "")
    password = os.getenv("VETRIX_SMTP_PASSWORD", "")
    sender = os.getenv("VETRIX_SMTP_FROM", "").strip() or user or "no-reply@vetrix-erp.local"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    message.set_content(body)
    maintype, _, subtype = mime_type.partition("/")
    message.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls()
        if user:
            server.login(user, password)
        server.send_message(message)


def generate_and_send_report(report_type: str, report_format: str, destination_email: str) -> dict:
    """Returns {"status": "sent"|"failed"|"skipped_not_configured", "detail": str}."""
    spec, _ = _rows_for(report_type)  # validates report_type/raises before anything else
    content = generate_report(report_type, report_format)

    if not _smtp_configured():
        return {"status": "skipped_not_configured", "detail": "SMTP is not configured"}

    extension = "csv" if report_format == "csv" else "pdf"
    mime_type = "text/csv" if report_format == "csv" else "application/pdf"
    filename = f"{report_type}.{extension}"

    try:
        _send_email_with_attachment(
            destination_email,
            f"Vetrix ERP report: {spec['title']}",
            f"Attached: {spec['title']} ({report_format.upper()}).",
            filename, content, mime_type,
        )
        return {"status": "sent", "detail": f"Sent to {destination_email}"}
    except Exception as error:
        return {"status": "failed", "detail": str(error)}
