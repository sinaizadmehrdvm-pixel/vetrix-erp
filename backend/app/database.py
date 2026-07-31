from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DEFAULT_DATABASE_URL = "sqlite:///./vetrix.db"


def normalize_database_url(raw_url: str) -> str:
    """Normalize supported database URLs without changing credentials.

    Hosted platforms sometimes still provide the legacy ``postgres://``
    scheme. SQLAlchemy 2 expects an explicit PostgreSQL driver, so normalize it
    to psycopg 3 while leaving SQLite and already-explicit URLs unchanged.
    """
    value = (raw_url or DEFAULT_DATABASE_URL).strip()
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value[len("postgres://") :]
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://") :]
    return value


def build_engine(database_url: str | None = None) -> Engine:
    url = normalize_database_url(database_url or os.getenv("VETRIX_DATABASE_URL", DEFAULT_DATABASE_URL))
    parsed = make_url(url)

    options: dict[str, object] = {
        "pool_pre_ping": True,
        "future": True,
    }
    if parsed.get_backend_name() == "sqlite":
        options["connect_args"] = {"check_same_thread": False}
    else:
        options.update(
            {
                "pool_size": int(os.getenv("VETRIX_DB_POOL_SIZE", "5")),
                "max_overflow": int(os.getenv("VETRIX_DB_MAX_OVERFLOW", "10")),
                "pool_recycle": int(os.getenv("VETRIX_DB_POOL_RECYCLE_SECONDS", "1800")),
            }
        )

    return create_engine(url, **options)


DATABASE_URL = normalize_database_url(os.getenv("VETRIX_DATABASE_URL", DEFAULT_DATABASE_URL))
engine = build_engine(DATABASE_URL)


class VetrixSession(Session):
    """Application session with mandatory organization isolation guards."""


SessionLocal = sessionmaker(
    class_=VetrixSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)

Base = declarative_base()

# Import after Base/SessionLocal exist to avoid model/database import cycles.
from app.organization.runtime import install_organization_session_guards  # noqa: E402

install_organization_session_guards(VetrixSession)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
