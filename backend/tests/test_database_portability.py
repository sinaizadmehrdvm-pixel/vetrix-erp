from __future__ import annotations

import os
import unittest
import uuid

from sqlalchemy import text

from app.database import build_engine, normalize_database_url


class DatabaseUrlTests(unittest.TestCase):
    def test_legacy_postgres_scheme_uses_psycopg(self) -> None:
        self.assertEqual(
            normalize_database_url("postgres://user:pass@localhost/vetrix"),
            "postgresql+psycopg://user:pass@localhost/vetrix",
        )

    def test_postgresql_scheme_uses_psycopg(self) -> None:
        self.assertEqual(
            normalize_database_url("postgresql://user:pass@localhost/vetrix"),
            "postgresql+psycopg://user:pass@localhost/vetrix",
        )

    def test_sqlite_url_is_unchanged(self) -> None:
        self.assertEqual(normalize_database_url("sqlite:///./test.db"), "sqlite:///./test.db")


@unittest.skipUnless(os.getenv("VETRIX_POSTGRES_TEST_URL"), "PostgreSQL test URL not configured")
class PostgreSqlSmokeTests(unittest.TestCase):
    def test_connection_transaction_and_rollback(self) -> None:
        engine = build_engine(os.environ["VETRIX_POSTGRES_TEST_URL"])
        table_name = f"vetrix_ci_{uuid.uuid4().hex}"
        try:
            with engine.begin() as connection:
                self.assertEqual(connection.execute(text("SELECT 1")).scalar_one(), 1)
                connection.execute(text(f'CREATE TABLE "{table_name}" (id INTEGER PRIMARY KEY, value NUMERIC(24, 6))'))
                connection.execute(text(f'INSERT INTO "{table_name}" (id, value) VALUES (1, 123.456789)'))

            with engine.connect() as connection:
                value = connection.execute(text(f'SELECT value FROM "{table_name}" WHERE id = 1')).scalar_one()
                self.assertEqual(str(value), "123.456789")
                # SQLAlchemy 2.x starts a transaction automatically for SELECT.
                # End that read transaction before explicitly testing rollback.
                connection.commit()

                transaction = connection.begin()
                connection.execute(text(f'INSERT INTO "{table_name}" (id, value) VALUES (2, 9.990000)'))
                transaction.rollback()

                count = connection.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar_one()
                self.assertEqual(count, 1)
        finally:
            with engine.begin() as connection:
                connection.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
