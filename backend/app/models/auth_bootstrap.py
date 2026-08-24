from datetime import datetime

from sqlalchemy import Column, DateTime, Integer

from app.database import Base


class AuthBootstrapClaim(Base):
    __tablename__ = "auth_bootstrap_claims"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
