from sqlalchemy import Boolean, Column, Integer, String, DateTime, Float
from datetime import datetime
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    national_id = Column(String, nullable=True)
    economic_code = Column(String, nullable=True)
    contact_person = Column(String, nullable=True)
    customer_type = Column(String, default="customer")  # customer / supplier / both
    opening_balance = Column(Float, default=0)  # positive = debit, negative = credit
    credit_limit = Column(Float, default=0)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Self-service portal: a shareable link stays valid only while enabled,
    # and bumping the generation instantly invalidates every link issued
    # before the bump (no way to enumerate/guess a live link back to valid).
    portal_access_enabled = Column(Boolean, default=False, nullable=False)
    portal_token_generation = Column(Integer, default=0, nullable=False)
