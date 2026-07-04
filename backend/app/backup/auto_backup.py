from datetime import datetime
import os
import shutil


def create_database_backup():
    backend_root = os.getcwd()
    source_db = os.path.join(backend_root, "vetrix.db")

    backup_dir = os.path.join(backend_root, "app", "backup", "files")
    os.makedirs(backup_dir, exist_ok=True)

    if not os.path.exists(source_db):
        return {
            "status": "error",
            "message": "vetrix.db not found",
        }

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = f"vetrix_backup_{timestamp}.db"
    backup_path = os.path.join(backup_dir, backup_file)

    shutil.copy2(source_db, backup_path)

    return {
        "status": "success",
        "file": backup_file,
        "path": backup_path,
        "message": "Backup created successfully",
    }