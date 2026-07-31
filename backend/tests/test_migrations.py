from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


class MigrationLifecycleTests(unittest.TestCase):
    def run_migration(self, database: Path, *args: str) -> None:
        env = os.environ.copy()
        env["VETRIX_DATABASE_URL"] = f"sqlite:///{database.as_posix()}"
        result = subprocess.run(
            [sys.executable, "scripts/migrate.py", *args],
            cwd=BACKEND,
            env=env,
            text=True,
            capture_output=True,
            timeout=120,
        )
        self.assertEqual(result.returncode, 0, msg=f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}")

    def test_empty_database_upgrade_downgrade_upgrade_preserves_business_data(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "migration-cycle.db"

            self.run_migration(database, "upgrade", "head")
            with sqlite3.connect(database) as connection:
                tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                self.assertIn("alembic_version", tables)
                self.assertIn("customers", tables)
                connection.execute(
                    "INSERT INTO customers (name, phone, address, customer_type) VALUES (?, ?, ?, ?)",
                    ("Migration Sentinel", "", "", "customer"),
                )
                connection.commit()

            self.run_migration(database, "downgrade", "base")
            with sqlite3.connect(database) as connection:
                count = connection.execute(
                    "SELECT COUNT(*) FROM customers WHERE name = ?", ("Migration Sentinel",)
                ).fetchone()[0]
                self.assertEqual(count, 1)

            self.run_migration(database, "upgrade", "head")
            with sqlite3.connect(database) as connection:
                revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
                count = connection.execute(
                    "SELECT COUNT(*) FROM customers WHERE name = ?", ("Migration Sentinel",)
                ).fetchone()[0]
                self.assertEqual(revision, "0001_schema_baseline")
                self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
