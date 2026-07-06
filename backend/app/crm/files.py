from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from datetime import datetime
import json
import shutil
import uuid

router = APIRouter(prefix="/api/crm", tags=["CRM Files"])

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = BASE_DIR / "uploads" / "crm_files"
INDEX_FILE = UPLOAD_ROOT / "index.json"


def _ensure_storage():
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text("[]", encoding="utf-8")


def _load_index():
    _ensure_storage()
    try:
        return json.loads(INDEX_FILE.read_text(encoding="utf-8") or "[]")
    except Exception:
        return []


def _save_index(rows):
    _ensure_storage()
    INDEX_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_name(name: str) -> str:
    allowed = "._- ()[]{}آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیيكى "
    cleaned = "".join(ch for ch in str(name or "file") if ch.isalnum() or ch in allowed)
    cleaned = cleaned.strip().replace(" ", "_")
    return cleaned or "file"


@router.get("/customers/{customer_id}/files")
def get_customer_files(customer_id: int):
    rows = _load_index()
    return [row for row in rows if int(row.get("customer_id", 0)) == int(customer_id)]


@router.post("/customers/{customer_id}/files")
async def upload_customer_file(
    customer_id: int,
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
    category: str = Form("document"),
):
    _ensure_storage()

    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    file_id = str(uuid.uuid4())
    customer_dir = UPLOAD_ROOT / f"customer_{customer_id}"
    customer_dir.mkdir(parents=True, exist_ok=True)

    original_name = _safe_name(file.filename)
    stored_name = f"{file_id}_{original_name}"
    stored_path = customer_dir / stored_name

    with stored_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    row = {
        "id": file_id,
        "customer_id": customer_id,
        "title": title or file.filename,
        "description": description or "",
        "category": category or "document",
        "name": file.filename,
        "file_name": file.filename,
        "stored_name": stored_name,
        "path": str(stored_path),
        "url": f"/api/crm/files/{file_id}/download",
        "type": file.content_type or "",
        "file_type": file.content_type or "",
        "size": f"{round(stored_path.stat().st_size / 1024, 1)} KB",
        "file_size": stored_path.stat().st_size,
        "created_at": datetime.utcnow().isoformat(),
    }

    rows = _load_index()
    rows.insert(0, row)
    _save_index(rows)
    return row


@router.get("/files/{file_id}/download")
def download_customer_file(file_id: str):
    rows = _load_index()
    row = next((item for item in rows if str(item.get("id")) == str(file_id)), None)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    path = Path(row.get("path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found")

    return FileResponse(path, filename=row.get("file_name") or path.name, media_type=row.get("type") or "application/octet-stream")


@router.delete("/files/{file_id}")
def delete_customer_file(file_id: str):
    rows = _load_index()
    row = next((item for item in rows if str(item.get("id")) == str(file_id)), None)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    path = Path(row.get("path", ""))
    if path.exists():
        try:
            path.unlink()
        except Exception:
            pass

    rows = [item for item in rows if str(item.get("id")) != str(file_id)]
    _save_index(rows)
    return {"ok": True, "deleted_id": file_id}
