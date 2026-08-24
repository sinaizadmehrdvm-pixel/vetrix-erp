"""Customers/Parties list and single-customer profile export endpoints.

Deliberately "export what you see": the CRM scoring, balance
classification and filter labels already live once, client-side, in
Customers.jsx - this router only lays out whatever already-formatted cells
the caller sends onto a real PDF/XLSX file. It does not re-derive customer
data from the database, so a mismatch between what's on screen and what's
exported is structurally impossible.
"""
import os
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.company_scope import current_company_id
from app.database import SessionLocal
from app.export.customers_excel import build_customers_list_excel
from app.export.customers_pdf import build_customer_profile_pdf, build_customers_list_pdf
from app.settings_routes import get_or_create_settings

router = APIRouter(prefix="/export/customers", tags=["Customers Export"])

MAX_EXPORT_ROWS = 20000
MAX_CELL_LENGTH = 500
EXPORT_ROLES = {"admin", "accountant", "sales"}


def _require_export_role(request: Request) -> str:
    auth = getattr(request.state, "auth", {})
    if auth.get("role") not in EXPORT_ROLES:
        raise HTTPException(status_code=403, detail="Export access requires admin, accountant, or sales role")
    return auth.get("username") or "-"


def _clip(value, limit=MAX_CELL_LENGTH):
    if isinstance(value, (int, float)):
        return value
    text = "" if value is None else str(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _company_name(company_id):
    db = SessionLocal()
    try:
        settings = get_or_create_settings(db, company_id)
        return getattr(settings, "company_name", "") or "Vetrix ERP"
    finally:
        db.close()


def _validate_grid(headers: List[str], rows: List[List[Any]]):
    if not headers:
        raise HTTPException(status_code=400, detail="At least one column header is required")
    if len(rows) > MAX_EXPORT_ROWS:
        raise HTTPException(status_code=413, detail=f"Too many rows to export (max {MAX_EXPORT_ROWS})")
    if any(len(row) != len(headers) for row in rows):
        raise HTTPException(status_code=400, detail="Row/column length mismatch")


class CustomersListExportRequest(BaseModel):
    headers: List[str]
    rows: List[List[Any]]
    numeric_columns: List[int] = []
    title: Optional[str] = None
    subtitle: Optional[str] = None
    filters_label: Optional[str] = None
    language: str = "fa"
    column_widths: Optional[List[int]] = None


class CustomerProfileExportRequest(BaseModel):
    title: Optional[str] = None
    identity_pairs: List[List[str]] = []
    summary_pairs: List[List[str]] = []
    ledger_headers: List[str]
    ledger_rows: List[List[Any]] = []
    language: str = "fa"


@router.post("/list-pdf")
def export_customers_list_pdf(payload: CustomersListExportRequest, request: Request, background_tasks: BackgroundTasks):
    generated_by = _require_export_role(request)
    _validate_grid(payload.headers, payload.rows)

    safe_rows = [[_clip(cell) for cell in row] for row in payload.rows]
    meta = {
        "title": payload.title,
        "subtitle": payload.subtitle,
        "filters_label": payload.filters_label,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "generated_by": generated_by,
        "company_name": _company_name(current_company_id(request)),
    }
    path = build_customers_list_pdf(safe_rows, [str(h) for h in payload.headers], meta, language=payload.language)
    background_tasks.add_task(os.remove, path)
    filename = f"vetrix_customers_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    return FileResponse(path, media_type="application/pdf", filename=filename, background=background_tasks)


@router.post("/list-excel")
def export_customers_list_excel(payload: CustomersListExportRequest, request: Request, background_tasks: BackgroundTasks):
    _require_export_role(request)
    _validate_grid(payload.headers, payload.rows)

    numeric_set = set(payload.numeric_columns or [])
    safe_rows = [
        [cell if index in numeric_set and isinstance(cell, (int, float)) else _clip(cell) for index, cell in enumerate(row)]
        for row in payload.rows
    ]
    meta = {
        "sheet_title": (payload.title or "Customers")[:31],
        "column_widths": payload.column_widths,
    }
    path = build_customers_list_excel(
        safe_rows, [str(h) for h in payload.headers], numeric_set, meta, language=payload.language,
    )
    background_tasks.add_task(os.remove, path)
    filename = f"vetrix_customers_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        background=background_tasks,
    )


@router.post("/profile-pdf")
def export_customer_profile_pdf(payload: CustomerProfileExportRequest, request: Request, background_tasks: BackgroundTasks):
    generated_by = _require_export_role(request)
    if len(payload.ledger_rows) > MAX_EXPORT_ROWS:
        raise HTTPException(status_code=413, detail=f"Too many ledger rows to export (max {MAX_EXPORT_ROWS})")
    if payload.ledger_rows and any(len(row) != len(payload.ledger_headers) for row in payload.ledger_rows):
        raise HTTPException(status_code=400, detail="Ledger row/column length mismatch")

    safe_ledger_rows = [[_clip(cell) for cell in row] for row in payload.ledger_rows]
    customer_name = "-"
    for label, value in payload.identity_pairs:
        if label and value and customer_name == "-":
            customer_name = value
            break

    meta = {
        "title": payload.title,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "generated_by": generated_by,
        "company_name": _company_name(current_company_id(request)),
        "identity_pairs": [(_clip(label), _clip(value)) for label, value in payload.identity_pairs],
    }
    path = build_customer_profile_pdf(
        {"name": customer_name},
        safe_ledger_rows,
        [str(h) for h in payload.ledger_headers],
        [(_clip(label), _clip(value)) for label, value in payload.summary_pairs],
        meta,
        language=payload.language,
    )
    background_tasks.add_task(os.remove, path)
    filename = f"vetrix_customer_profile_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    return FileResponse(path, media_type="application/pdf", filename=filename, background=background_tasks)
