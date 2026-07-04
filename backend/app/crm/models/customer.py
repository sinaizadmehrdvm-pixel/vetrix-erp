from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from datetime import datetime
from app.database import Base
from app.models.customer import Customer

# این فایل برای سازگاری با import های قبلی نگه داشته شده است.
# Customer اصلی از app.models.customer می‌آید و اینجا دوباره تعریف نمی‌شود.


class CustomerNote(Base):
    __tablename__ = "customer_notes"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), index=True, nullable=False)
    text = Column(Text, nullable=False)
    note_type = Column(String, default="note")
    created_at = Column(DateTime, default=datetime.utcnow)


class CustomerTransaction(Base):
    __tablename__ = "customer_transactions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), index=True, nullable=False)
    type = Column(String, default="crm")
    amount = Column(Float, default=0)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
