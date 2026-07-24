from sqlalchemy import Boolean, Column, Integer, String, Text
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="user")
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