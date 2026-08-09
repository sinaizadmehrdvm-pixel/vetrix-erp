"""Import-batch report exports (full / errors / warnings / applied /
rejected / summary). Mirrors the request/response shape already proven in
customers_export.py, reusing the same generic grid builders
(build_customers_list_excel/build_customers_list_pdf have no
customer-specific logic) - but sources its rows from the batch's own
payload_json/result_json server-side, since that data already exists once
a batch has been previewed/applied, rather than trusting client-supplied
rows the way the customers exporter does.
"""
import json
import os
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.data_import import ENTITY_FIELDS, _require_preview_role
from app.database import engine
from app.export.customers_excel import build_customers_list_excel
from app.export.customers_pdf import build_customers_list_pdf

router = APIRouter(prefix="/export/import-report", tags=["Import Report Export"])
MAX_EXPORT_ROWS = 20000
REPORT_SCOPES = {"full", "errors", "warnings", "applied", "rejected"}


def _load_batch(batch_id):
    with engine.begin() as conn:
        batch = conn.execute(text("SELECT * FROM data_import_batches WHERE id=:id"), {"id": batch_id}).mappings().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")
    return batch


def _batch_rows(batch, scope):
    rows = json.loads(batch["payload_json"])
    if scope == "errors":
        return [row for row in rows if row["errors"]]
    if scope == "warnings":
        return [row for row in rows if row.get("warnings")]
    if scope == "applied":
        return [row for row in rows if not row["errors"] and not row["duplicate"]]
    if scope == "rejected":
        return [row for row in rows if row["errors"] or row["duplicate"]]
    return rows


def _row_status(row):
    if row["errors"]:
        return "error"
    if row.get("updatable"):
        return "updatable"
    if row["duplicate"]:
        return "duplicate"
    if row.get("warnings"):
        return "warning"
    return "valid"


def _grid_for_entity(entity, rows):
    fields = list(ENTITY_FIELDS.get(entity, {}).keys())
    headers = ["row", "status"] + fields
    numeric_columns = set()
    grid = []
    for row in rows:
        values = [row["row"], _row_status(row)]
        for index, field in enumerate(fields, start=2):
            value = row["data"].get(field, "")
            values.append(value)
            if isinstance(value, (int, float)):
                numeric_columns.add(index)
        grid.append(values)
    return headers, grid, numeric_columns


@router.post("/{batch_id}/{scope}-excel")
def export_import_report_excel(batch_id: str, scope: str, request: Request, background_tasks: BackgroundTasks):
    if scope not in REPORT_SCOPES:
        raise HTTPException(status_code=404, detail="Unknown report scope")
    batch = _load_batch(batch_id)
    _require_preview_role(request, entity=batch["entity_type"])
    rows = _batch_rows(batch, scope)
    if len(rows) > MAX_EXPORT_ROWS:
        raise HTTPException(status_code=413, detail=f"Too many rows to export (max {MAX_EXPORT_ROWS})")
    headers, grid, numeric_columns = _grid_for_entity(batch["entity_type"], rows)
    meta = {"sheet_title": f"{batch['entity_type']}-{scope}"[:31]}
    path = build_customers_list_excel(grid, headers, numeric_columns, meta, language="en")
    background_tasks.add_task(os.remove, path)
    filename = f"vetrix_import_{batch['entity_type']}_{scope}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        background=background_tasks,
    )


@router.post("/{batch_id}/summary-pdf")
def export_import_report_summary_pdf(batch_id: str, request: Request, background_tasks: BackgroundTasks):
    batch = _load_batch(batch_id)
    _require_preview_role(request, entity=batch["entity_type"])
    result = json.loads(batch["result_json"] or "{}")
    headers = ["Metric", "Value"]
    rows = [
        ["Batch ID", batch_id],
        ["Entity", batch["entity_type"]],
        ["File", batch["file_name"]],
        ["Status", batch["status"]],
        ["Total rows", batch["total_rows"]],
        ["Valid rows", batch["valid_rows"]],
        ["Error rows", batch["error_rows"]],
        ["Duplicate rows", batch["duplicate_rows"]],
        ["Created", result.get("inserted", "-")],
        ["Updated", result.get("updated", "-")],
        ["Skipped", result.get("skipped", "-")],
        ["Applied at", batch["applied_at"] or "-"],
    ]
    meta = {
        "title": f"Import summary - {batch['entity_type']}",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    path = build_customers_list_pdf(rows, headers, meta, language="en")
    background_tasks.add_task(os.remove, path)
    filename = f"vetrix_import_summary_{batch_id[:8]}.pdf"
    return FileResponse(path, media_type="application/pdf", filename=filename, background=background_tasks)
