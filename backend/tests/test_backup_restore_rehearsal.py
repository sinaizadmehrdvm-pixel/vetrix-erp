import sqlite3

from app.backup import auto_backup


def _seed_database(path):
    with sqlite3.connect(path) as connection:
        for table in ("users", "customers", "products", "invoices", "accounting_entries"):
            connection.execute(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY)')
        connection.execute("INSERT INTO users (id) VALUES (1)")
        connection.execute("INSERT INTO customers (id) VALUES (1)")
        connection.commit()


def test_restore_rehearsal_validates_copy_without_mutating_live_database(tmp_path, monkeypatch):
    live = tmp_path / "live.db"
    backups = tmp_path / "backups"
    backups.mkdir()
    _seed_database(live)
    monkeypatch.setattr(auto_backup, "_database_path", lambda: live)
    monkeypatch.setattr(auto_backup, "backup_directory", lambda: backups)

    created = auto_backup.create_database_backup("manual")
    before = live.read_bytes()
    result = auto_backup.test_restore_database_backup(created["filename"])

    assert result["valid"] is True
    assert result["live_database_changed"] is False
    assert result["missing_core_tables"] == []
    assert result["core_row_counts"]["users"] == 1
    assert result["core_row_counts"]["customers"] == 1
    assert live.read_bytes() == before
    assert not list(backups.glob(".restore-test-*"))


def test_restore_rehearsal_rejects_backup_missing_core_schema(tmp_path, monkeypatch):
    live = tmp_path / "live.db"
    backups = tmp_path / "backups"
    backups.mkdir()
    with sqlite3.connect(live) as connection:
        connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    monkeypatch.setattr(auto_backup, "_database_path", lambda: live)
    monkeypatch.setattr(auto_backup, "backup_directory", lambda: backups)

    created = auto_backup.create_database_backup("manual")
    result = auto_backup.test_restore_database_backup(created["filename"])

    assert result["valid"] is False
    assert "customers" in result["missing_core_tables"]
    assert result["live_database_changed"] is False
