from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.backup.auto_backup import (
    backup_directory,
    create_database_backup,
    delete_database_backup,
    list_database_backups,
    restore_database_backup,
    test_restore_database_backup,
    verify_database_backup,
)

router = APIRouter(prefix="/api/backups", tags=["Backup & Recovery"])


class RestoreConfirmation(BaseModel):
    confirmation: str


def _require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")


@router.get("")
def list_backups(request: Request, verify: bool = False):
    _require_admin(request)
    return {"items": list_database_backups(verify=verify)}


@router.post("")
def create_backup(request: Request):
    _require_admin(request)
    try:
        return create_database_backup(kind="manual")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.get("/{filename}/verify")
def verify_backup(filename: str, request: Request):
    _require_admin(request)
    try:
        return verify_database_backup(filename)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.get("/{filename}/download")
def download_backup(filename: str, request: Request):
    _require_admin(request)
    try:
        info = verify_database_backup(filename)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not info["valid"]:
        raise HTTPException(status_code=409, detail="Backup integrity check failed")
    return FileResponse(
        backup_directory() / filename,
        media_type="application/vnd.sqlite3",
        filename=filename,
    )


@router.post("/{filename}/restore-test")
def test_restore_backup(filename: str, request: Request):
    _require_admin(request)
    try:
        result = test_restore_database_backup(filename)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not result["valid"]:
        raise HTTPException(status_code=409, detail={
            "message": "Restore rehearsal failed",
            "result": result,
        })
    return result


@router.post("/{filename}/restore")
def restore_backup(
    filename: str,
    payload: RestoreConfirmation,
    request: Request,
):
    _require_admin(request)
    expected = f"RESTORE {filename}"
    if payload.confirmation != expected:
        raise HTTPException(
            status_code=400,
            detail=f"Confirmation must exactly match: {expected}",
        )
    try:
        return restore_database_backup(filename)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.delete("/{filename}")
def delete_backup(filename: str, request: Request):
    _require_admin(request)
    try:
        return delete_database_backup(filename)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
