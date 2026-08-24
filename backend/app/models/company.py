from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.database import Base


class Company(Base):
    """A tenant. Milestone 1 of the multi-company rollout: this table and
    User.company_id exist and are populated, but no business-data query
    (customers/products/invoices/etc.) is scoped by company yet - that is
    a deliberately separate, larger milestone. Until then every user
    belongs to exactly one company and the whole app behaves exactly as it
    did before this migration, since there is only ever one company row
    (the auto-created default) in an existing installation.
    """
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
