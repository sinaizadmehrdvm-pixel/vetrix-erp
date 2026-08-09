from sqlalchemy import Boolean, Column, Integer, String, Text
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="user")
    # Multi-company milestone 1: every user belongs to exactly one company
    # (nullable only so an existing pre-migration database can add this
    # column safely; ensure_database_schema() backfills every row to the
    # auto-created default company right after, so in practice this is
    # never actually null once startup has run once).
    company_id = Column(Integer, nullable=True)
    # Milestone 4: cross-company super-admin. Deliberately independent of
    # `role` (role stays feature/RBAC-only, see app/rbac.py) - a super-admin
    # can create companies, create/move users across companies, and switch
    # their own JWT's active company_id claim (see app/super_admin.py and
    # app/companies.py's /switch endpoint). Refreshed from the DB on every
    # request in main.py's auth middleware, exactly like `role` already is.
    is_super_admin = Column(Boolean, default=False, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)
    # Tokens carry the generation active when they were issued (see the "gen"
    # JWT claim); bumping this rejects every previously issued token even if
    # it hasn't expired yet, without depending on wall-clock precision.
    token_generation = Column(Integer, default=0, nullable=False)
    # Two-factor authentication (TOTP). The secret is written at /setup time
    # but totp_enabled only flips on after the user proves possession of it
    # via /verify. Recovery codes are stored hashed, as a JSON array.
    totp_secret = Column(String, nullable=True)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    totp_recovery_codes = Column(Text, nullable=True)