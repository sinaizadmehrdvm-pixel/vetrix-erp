from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from datetime import datetime
from app.database import Base

# Customer اصلی فقط در app.models.customer تعریف شده است.
# اینجا نباید دوباره Customer بسازیم؛ چون جدول customers دوبار تعریف می‌شود.

class CustomerNote(Base):
    __tablename__ = "customer_notes"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    text = Column(Text, nullable=False)
    note_type = Column(String, default="note")
    created_at = Column(DateTime, default=datetime.utcnow)


class CustomerFollowUp(Base):
    __tablename__ = "customer_followups"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    title = Column(String, default="")
    description = Column(Text, default="")
    followup_type = Column(String, default="call")
    status = Column(String, default="open")
    due_date = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class CustomerTransaction(Base):
    __tablename__ = "customer_transactions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    type = Column(String)
    amount = Column(Float, default=0)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
