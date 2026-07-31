from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def alembic_config() -> Config:
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "alembic"))
    return config


def database_url() -> str:
    return os.getenv("VETRIX_DATABASE_URL", f"sqlite:///{ROOT / 'vetrix.db'}")


def is_empty_database(url: str) -> bool:
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
    )
    try:
        return not inspect(engine).get_table_names()
    finally:
        engine.dispose()


def bootstrap_current_schema() -> None:
    # Importing the current application executes its compatibility bootstrap.
    # This is temporary until all legacy create/alter helpers are removed in a
    # later checkpoint. It is isolated here so Alembic becomes the only public
    # migration entry point immediately.
    import main as application_main  # noqa: F401


def run_upgrade(revision: str) -> None:
    url = database_url()
    os.environ["VETRIX_DATABASE_URL"] = url
    if is_empty_database(url):
        bootstrap_current_schema()
    command.upgrade(alembic_config(), revision)


def main() -> None:
    parser = argparse.ArgumentParser(description="VETRIX database migration runner")
    parser.add_argument("action", choices=("upgrade", "downgrade", "current", "history"))
    parser.add_argument("revision", nargs="?", default=None)
    args = parser.parse_args()

    if args.action == "upgrade":
        run_upgrade(args.revision or "head")
    elif args.action == "downgrade":
        command.downgrade(alembic_config(), args.revision or "-1")
    elif args.action == "current":
        command.current(alembic_config(), verbose=True)
    else:
        command.history(alembic_config(), verbose=True)


if __name__ == "__main__":
    main()
