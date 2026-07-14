import hashlib
import os
import re
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import text

from app.database import engine

BACKUP_NAME = re.compile(
    r"^vetrix_(manual|auto|pre_restore)_\d{8}T\d{6}_\d{6}Z\.db$"
)
BACKUP_LOCK = threading.RLock()


def _utc_now():
    return datetime.now(timezone.utc)


def _database_path():
    if engine.url.get_backend_name() != "sqlite":
        raise ValueError("File backups currently require a SQLite database")
    database = engine.url.database
    if not database or database == ":memory:":
        raise ValueError("A file-backed SQLite database is required")
    return Path(database).expanduser().resolve()


def backup_directory():
    configured = os.getenv("VETRIX_BACKUP_DIR", "").strip()
    if configured:
        path = Path(configured).expanduser().resolve()
    else:
        path = Path(__file__).resolve().parent / "files"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_backup_path(filename):
    if not BACKUP_NAME.fullmatch(str(filename or "")):
        raise ValueError("Invalid backup filename")
    path = (backup_directory() / filename).resolve()
    if path.parent != backup_directory():
        raise ValueError("Invalid backup path")
    return path


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _quick_check(path):
    try:
        with sqlite3.connect(str(path)) as connection:
            result = connection.execute("PRAGMA quick_check").fetchone()
            tables = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
            ).fetchone()[0]
        valid = bool(result and result[0] == "ok" and tables > 0)
        return valid, result[0] if result else "No result", int(tables)
    except sqlite3.DatabaseError as error:
        return False, str(error), 0


def backup_info(path, verify=False):
    stat = path.stat()
    valid = None
    check_message = None
    table_count = None
    if verify:
        valid, check_message, table_count = _quick_check(path)
    kind = (
        "pre_restore"
        if path.name.startswith("vetrix_pre_restore_")
        else path.name.split("_", 2)[1]
    )
    return {
        "filename": path.name,
        "kind": kind,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(
            stat.st_mtime, timezone.utc
        ).isoformat(),
        "sha256": _sha256(path),
        "valid": valid,
        "check_message": check_message,
        "table_count": table_count,
    }


def list_database_backups(verify=False):
    items = [
        backup_info(path, verify=verify)
        for path in backup_directory().iterdir()
        if path.is_file() and BACKUP_NAME.fullmatch(path.name)
    ]
    return sorted(items, key=lambda item: item["created_at"], reverse=True)


def create_database_backup(kind="manual"):
    if kind not in {"manual", "auto", "pre_restore"}:
        raise ValueError("Invalid backup kind")

    with BACKUP_LOCK:
        source_path = _database_path()
        if not source_path.exists():
            raise ValueError(f"Database not found: {source_path}")

        timestamp = _utc_now().strftime("%Y%m%dT%H%M%S_%fZ")
        filename = f"vetrix_{kind}_{timestamp}.db"
        destination = backup_directory() / filename
        temporary = destination.with_suffix(".tmp")

        try:
            with sqlite3.connect(str(source_path)) as source:
                with sqlite3.connect(str(temporary)) as target:
                    source.backup(target)
            valid, message, _ = _quick_check(temporary)
            if not valid:
                raise ValueError(f"Backup integrity check failed: {message}")
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)

        info = backup_info(destination, verify=True)
        _apply_retention()
        return {"status": "success", **info}


def verify_database_backup(filename):
    with BACKUP_LOCK:
        path = _safe_backup_path(filename)
        if not path.exists():
            raise FileNotFoundError("Backup not found")
        return backup_info(path, verify=True)



def test_restore_database_backup(filename):
    """Validate a restore candidate in isolation without mutating live data."""
    with BACKUP_LOCK:
        backup_path = _safe_backup_path(filename)
        if not backup_path.exists():
            raise FileNotFoundError("Backup not found")
        temporary = backup_directory() / f".restore-test-{uuid.uuid4().hex}.db"
        try:
            shutil.copy2(backup_path, temporary)
            with sqlite3.connect(str(temporary)) as connection:
                integrity_rows = connection.execute("PRAGMA integrity_check").fetchall()
                integrity_messages = [str(row[0]) for row in integrity_rows]
                tables = {
                    row[0] for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    ).fetchall()
                }
                required = {"users", "customers", "products", "invoices", "accounting_entries"}
                missing = sorted(required - tables)
                counts = {}
                for table in sorted(required & tables):
                    counts[table] = int(connection.execute(
                        f'SELECT COUNT(*) FROM "{table}"'
                    ).fetchone()[0])
            valid = integrity_messages == ["ok"] and not missing
            return {
                "filename": filename,
                "valid": valid,
                "integrity_messages": integrity_messages,
                "missing_core_tables": missing,
                "core_row_counts": counts,
                "table_count": len(tables),
                "sha256": _sha256(temporary),
                "tested_at": _utc_now().isoformat(),
                "live_database_changed": False,
            }
        except sqlite3.DatabaseError as error:
            return {
                "filename": filename,
                "valid": False,
                "integrity_messages": [str(error)],
                "missing_core_tables": [],
                "core_row_counts": {},
                "table_count": 0,
                "sha256": _sha256(temporary) if temporary.exists() else "",
                "tested_at": _utc_now().isoformat(),
                "live_database_changed": False,
            }
        finally:
            temporary.unlink(missing_ok=True)

def delete_database_backup(filename):
    with BACKUP_LOCK:
        path = _safe_backup_path(filename)
        if not path.exists():
            raise FileNotFoundError("Backup not found")
        path.unlink()
        return {"status": "deleted", "filename": filename}


def restore_database_backup(filename):
    with BACKUP_LOCK:
        backup_path = _safe_backup_path(filename)
        if not backup_path.exists():
            raise FileNotFoundError("Backup not found")
        verification = backup_info(backup_path, verify=True)
        if not verification["valid"]:
            raise ValueError(
                f"Backup integrity check failed: {verification['check_message']}"
            )

        safety_backup = create_database_backup(kind="pre_restore")
        database_path = _database_path()
        temporary = database_path.with_suffix(database_path.suffix + ".restore.tmp")
        try:
            shutil.copy2(backup_path, temporary)
            valid, message, _ = _quick_check(temporary)
            if not valid:
                raise ValueError(f"Restore copy validation failed: {message}")
            engine.dispose()
            for suffix in ("-wal", "-shm"):
                Path(f"{database_path}{suffix}").unlink(missing_ok=True)
            os.replace(temporary, database_path)
            engine.dispose()
        finally:
            temporary.unlink(missing_ok=True)

        return {
            "status": "restored",
            "filename": filename,
            "safety_backup": safety_backup["filename"],
            "sha256": verification["sha256"],
        }


def _apply_retention():
    keep = max(3, int(os.getenv("VETRIX_BACKUP_RETENTION", "30")))
    backups = list_database_backups(verify=False)
    for item in backups[keep:]:
        _safe_backup_path(item["filename"]).unlink(missing_ok=True)


def maybe_create_automatic_backup():
    try:
        with engine.connect() as conn:
            table = conn.execute(text("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='app_settings'
            """)).fetchone()
            if not table:
                return None
            enabled = conn.execute(
                text("SELECT auto_backup FROM app_settings LIMIT 1")
            ).scalar()
        if not enabled:
            return None

        interval_hours = max(
            1, int(os.getenv("VETRIX_AUTO_BACKUP_HOURS", "24"))
        )
        automatic = [
            item for item in list_database_backups()
            if item["kind"] == "auto"
        ]
        if automatic:
            latest = datetime.fromisoformat(automatic[0]["created_at"])
            if _utc_now() - latest < timedelta(hours=interval_hours):
                return None
        return create_database_backup(kind="auto")
    except (OSError, ValueError, sqlite3.DatabaseError):
        return None
