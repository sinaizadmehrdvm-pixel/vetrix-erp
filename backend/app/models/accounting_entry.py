from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from datetime import datetime
from app.database import Base


class AccountingEntry(Base):
    __tablename__ = "accounting_entries"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    source_type = Column(String, nullable=False)  # opening_balance / invoice / payment / receipt
    source_id = Column(Integer, nullable=True)
    entry_type = Column(String, nullable=False)  # debit / credit
    description = Column(String, nullable=False)
    debit = Column(Float, default=0)
    credit = Column(Float, default=0)
    balance_after = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
