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
import logging
import os
import tempfile
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import Boolean, Column, DateTime, Integer, String, text

from app.database import Base, SessionLocal, engine
from app.email_utils import send_email_with_attachment, smtp_configured
from app.export.pdf_export import _p, _register_font
from app.export.security import sanitize_cell_value
from app.company_scope import current_company_id

FORMATS = {"pdf", "csv"}
FREQUENCIES = {"daily", "weekly", "monthly"}
router = APIRouter(prefix="/api/report-delivery", tags=["Scheduled Report Delivery"])
_logger = logging.getLogger(__name__)


def _load_sales(main, company_id):
    return main._reports_sales_impl(company_id)


def _load_purchases(main, company_id):
    return main._reports_purchases_impl(company_id)


def _load_inventory(main, company_id):
    return main._reports_inventory_impl(company_id).get("products", [])


def _load_customer_balances(main, company_id):
    return main._reports_customer_balances_impl(company_id).get("all", [])


def _load_product_profit(main, company_id):
    return main._reports_product_profit_impl(company_id).get("items", [])


def _load_open_invoices(main, company_id):
    return main._reports_open_invoices_impl(company_id).get("items", [])


def _load_inventory_movements(main, company_id):
    with main.engine.connect() as conn:
        rows = conn.execute(
            main.text("SELECT * FROM stock_movements WHERE company_id=:company_id ORDER BY id DESC"),
            {"company_id": company_id},
        ).mappings().all()
        return [dict(row) for row in rows]


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


def _rows_for(report_type, company_id):
    import main  # deferred - see module docstring

    spec = REPORT_REGISTRY.get(report_type)
    if not spec:
        raise ValueError(f"Unknown report_type: {report_type}. Choose one of: {', '.join(sorted(REPORT_REGISTRY))}")
    rows = spec["loader"](main, company_id)
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


def generate_csv(report_type: str, company_id: int) -> bytes:
    spec, rows = _rows_for(report_type, company_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([label for _, label in spec["columns"]])
    for row in rows:
        # sanitize_cell_value guards against formula/DDE injection (a cell
        # starting with =, +, -, @) - only relevant for CSV, which a
        # recipient typically opens directly in Excel/Sheets; generate_pdf
        # below reuses _format_cell too but PDF text isn't executable, so
        # sanitizing there would just visibly corrupt legitimate values.
        writer.writerow([sanitize_cell_value(_format_cell(row.get(key))) for key, _ in spec["columns"]])
    # UTF-8 BOM so spreadsheet apps open Persian/Arabic text correctly.
    return buffer.getvalue().encode("utf-8-sig")


def generate_pdf(report_type: str, company_id: int) -> bytes:
    spec, rows = _rows_for(report_type, company_id)
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


def generate_report(report_type: str, report_format: str, company_id: int) -> bytes:
    if report_format not in FORMATS:
        raise ValueError(f"format must be one of: {', '.join(sorted(FORMATS))}")
    if report_format == "csv":
        return generate_csv(report_type, company_id)
    return generate_pdf(report_type, company_id)


def generate_and_send_report(report_type: str, report_format: str, destination_email: str, company_id: int) -> dict:
    """Returns {"status": "sent"|"failed"|"skipped_not_configured", "detail": str}."""
    spec, _ = _rows_for(report_type, company_id)  # validates report_type/raises before anything else
    content = generate_report(report_type, report_format, company_id)

    if not smtp_configured(company_id):
        return {"status": "skipped_not_configured", "detail": "SMTP is not configured"}

    extension = "csv" if report_format == "csv" else "pdf"
    mime_type = "text/csv" if report_format == "csv" else "application/pdf"
    filename = f"{report_type}.{extension}"

    try:
        send_email_with_attachment(
            company_id,
            destination_email,
            f"Vetrix ERP report: {spec['title']}",
            f"Attached: {spec['title']} ({report_format.upper()}).",
            filename, content, mime_type,
        )
        return {"status": "sent", "detail": f"Sent to {destination_email}"}
    except Exception as error:
        return {"status": "failed", "detail": str(error)}


# ---------------------------------------------------------------------------
# Scheduling: this app has no real background task runner (see
# app/payment_reminders.py's docstring for the same constraint), so "due"
# schedules are checked on the same per-request hook main.py already uses
# for auto-backup/recurring invoices/payment reminders, not a real cron.
# ---------------------------------------------------------------------------

class ScheduledReport(Base):
    __tablename__ = "report_delivery_schedules"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String, nullable=False)
    report_format = Column(String, nullable=False, default="pdf")
    destination_email = Column(String, nullable=False)
    frequency = Column(String, nullable=False, default="weekly")  # daily / weekly / monthly
    hour = Column(Integer, nullable=False, default=8)  # UTC hour to send at, 0-23
    day_of_week = Column(Integer, nullable=True)  # 0=Monday .. 6=Sunday, weekly only
    day_of_month = Column(Integer, nullable=True)  # 1-28, monthly only
    active = Column(Boolean, nullable=False, default=True)
    last_sent_at = Column(DateTime, nullable=True)
    last_status = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, nullable=True)


ScheduledReport.__table__.create(bind=engine, checkfirst=True)


class ScheduledReportCreate(BaseModel):
    report_type: str
    report_format: str = "pdf"
    destination_email: str
    frequency: str = "weekly"
    hour: int = 8
    day_of_week: int = 0
    day_of_month: int = 1


def _schedule_dict(row: ScheduledReport) -> dict:
    return {
        "id": row.id,
        "report_type": row.report_type,
        "report_format": row.report_format,
        "destination_email": row.destination_email,
        "frequency": row.frequency,
        "hour": row.hour,
        "day_of_week": row.day_of_week,
        "day_of_month": row.day_of_month,
        "active": row.active,
        "last_sent_at": row.last_sent_at,
        "last_status": row.last_status,
        "created_at": row.created_at,
    }


def _is_due(schedule: ScheduledReport, now: datetime) -> bool:
    if not schedule.active:
        return False
    if now.hour != int(schedule.hour or 0):
        return False
    if schedule.frequency == "weekly" and now.weekday() != int(schedule.day_of_week or 0):
        return False
    if schedule.frequency == "monthly" and now.day != min(int(schedule.day_of_month or 1), 28):
        return False
    # Once-per-window guard: never resend inside the same hour it already ran.
    if schedule.last_sent_at and (now - schedule.last_sent_at) < timedelta(minutes=55):
        return False
    return True


def maybe_send_scheduled_reports():
    try:
        with engine.connect() as conn:
            table = conn.execute(text("""
                SELECT name FROM sqlite_master WHERE type='table' AND name='report_delivery_schedules'
            """)).fetchone()
            if not table:
                return
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            schedules = db.query(ScheduledReport).filter(ScheduledReport.active.is_(True)).all()
            for schedule in schedules:
                if not _is_due(schedule, now):
                    continue
                result = generate_and_send_report(schedule.report_type, schedule.report_format, schedule.destination_email, schedule.company_id)
                schedule.last_sent_at = now
                schedule.last_status = result.get("status")
                db.commit()
        finally:
            db.close()
    except Exception:
        # Scheduled delivery must never turn a completed business operation
        # into a client-visible failure - same discipline as the reminder
        # sweep and auto-backup hooks it shares this middleware pass with.
        # Still logged (Task 08 Section 13): an exception mid-loop otherwise
        # silently stops every remaining due schedule for this pass with no trace.
        _logger.exception("Scheduled report delivery sweep failed")


@router.get("/schedules")
def list_schedules(request: Request):
    db = SessionLocal()
    try:
        rows = db.query(ScheduledReport).filter(ScheduledReport.company_id == current_company_id(request)).order_by(ScheduledReport.id.desc()).all()
        return [_schedule_dict(row) for row in rows]
    finally:
        db.close()


@router.post("/schedules")
def create_schedule(data: ScheduledReportCreate, request: Request):
    if data.report_type not in REPORT_REGISTRY:
        raise HTTPException(status_code=400, detail=f"report_type must be one of: {', '.join(sorted(REPORT_REGISTRY))}")
    if data.report_format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"report_format must be one of: {', '.join(sorted(FORMATS))}")
    if data.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"frequency must be one of: {', '.join(sorted(FREQUENCIES))}")
    if not (0 <= data.hour <= 23):
        raise HTTPException(status_code=400, detail="hour must be between 0 and 23")

    db = SessionLocal()
    try:
        schedule = ScheduledReport(
            report_type=data.report_type,
            report_format=data.report_format,
            destination_email=data.destination_email,
            frequency=data.frequency,
            hour=data.hour,
            day_of_week=data.day_of_week if data.frequency == "weekly" else None,
            day_of_month=data.day_of_month if data.frequency == "monthly" else None,
            active=True,
            company_id=current_company_id(request),
        )
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        return {"status": "created", "id": schedule.id}
    finally:
        db.close()


@router.post("/schedules/{schedule_id}/toggle")
def toggle_schedule(schedule_id: int, request: Request):
    db = SessionLocal()
    try:
        schedule = db.query(ScheduledReport).filter(ScheduledReport.id == schedule_id, ScheduledReport.company_id == current_company_id(request)).first()
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        schedule.active = not schedule.active
        db.commit()
        return {"status": "active" if schedule.active else "paused", "id": schedule_id}
    finally:
        db.close()


@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, request: Request):
    db = SessionLocal()
    try:
        schedule = db.query(ScheduledReport).filter(ScheduledReport.id == schedule_id, ScheduledReport.company_id == current_company_id(request)).first()
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        db.delete(schedule)
        db.commit()
        return {"status": "deleted", "id": schedule_id}
    finally:
        db.close()
