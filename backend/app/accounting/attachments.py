"""Generic file attachments for accounting records.

Previously nothing in accounting (manual vouchers, expenses, cheques,
fixed assets) could keep a supporting document - the receipt OCR scanner
reads an image only to prefill form text, then discards the image itself.
This adds one small, reusable attachment store shared by all four record
types, following the same disk-plus-JSON-index pattern already used for
CRM customer files (see app/crm/files.py) rather than introducing a new
storage convention.
"""
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/accounting/attachments", tags=["Accounting Attachments"])

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = BASE_DIR / "uploads" / "accounting_attachments"
INDEX_FILE = UPLOAD_ROOT / "index.json"

ALLOWED_ENTITY_TYPES = {"voucher", "expense", "cheque", "fixed_asset"}


def _ensure_storage():
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text("[]", encoding="utf-8")


def _load_index():
    _ensure_storage()
    try:
        return json.loads(INDEX_FILE.read_text(encoding="utf-8") or "[]")
    except (OSError, json.JSONDecodeError):
        return []


def _save_index(rows):
    _ensure_storage()
    INDEX_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_name(name: str) -> str:
    allowed = "._- ()[]{}آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیيكى "
    cleaned = "".join(ch for ch in str(name or "file") if ch.isalnum() or ch in allowed)
    cleaned = cleaned.strip().replace(" ", "_")
    return cleaned or "file"


def _check_entity_type(entity_type: str):
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail=f"entity_type must be one of: {', '.join(sorted(ALLOWED_ENTITY_TYPES))}")


@router.get("/{entity_type}/{entity_id}")
def list_attachments(entity_type: str, entity_id: int):
    _check_entity_type(entity_type)
    rows = _load_index()
    return [
        row for row in rows
        if row.get("entity_type") == entity_type and int(row.get("entity_id", 0)) == int(entity_id)
    ]


@router.post("/{entity_type}/{entity_id}")
async def upload_attachment(entity_type: str, entity_id: int, file: UploadFile = File(...), title: str = Form("")):
    _check_entity_type(entity_type)
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    _ensure_storage()
    file_id = str(uuid.uuid4())
    entity_dir = UPLOAD_ROOT / entity_type / str(entity_id)
    entity_dir.mkdir(parents=True, exist_ok=True)

    original_name = _safe_name(file.filename)
    stored_name = f"{file_id}_{original_name}"
    stored_path = entity_dir / stored_name

    with stored_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    row = {
        "id": file_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "title": title or file.filename,
        "file_name": file.filename,
        "path": str(stored_path),
        "content_type": file.content_type or "application/octet-stream",
        "size": stored_path.stat().st_size,
        "created_at": datetime.utcnow().isoformat(),
    }

    rows = _load_index()
    rows.insert(0, row)
    _save_index(rows)
    return row


@router.get("/file/{attachment_id}/download")
def download_attachment(attachment_id: str):
    rows = _load_index()
    row = next((item for item in rows if str(item.get("id")) == str(attachment_id)), None)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(row.get("path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found")
    return FileResponse(path, filename=row.get("file_name") or path.name, media_type=row.get("content_type") or "application/octet-stream")


@router.delete("/file/{attachment_id}")
def delete_attachment(attachment_id: str):
    rows = _load_index()
    row = next((item for item in rows if str(item.get("id")) == str(attachment_id)), None)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(row.get("path", ""))
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
    rows = [item for item in rows if str(item.get("id")) != str(attachment_id)]
    _save_index(rows)
    return {"status": "deleted", "id": attachment_id}
