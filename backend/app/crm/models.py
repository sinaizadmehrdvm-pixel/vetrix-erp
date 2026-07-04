from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from datetime import datetime
from app.database import Base

# نکته مهم:
# مدل Customer اصلی فقط در app.models.customer تعریف شده است.
# اینجا Customer را دوباره تعریف نمی‌کنیم تا خطای
# Table 'customers' is already defined
# ایجاد نشود.


class CustomerNote(Base):
    __tablename__ = "customer_notes"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), index=True, nullable=False)
    text = Column(Text, nullable=False)
    note_type = Column(String, default="note")  # note, call, whatsapp, follow_up, meeting
    created_at = Column(DateTime, default=datetime.utcnow)


class CustomerTransaction(Base):
    __tablename__ = "customer_transactions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), index=True, nullable=False)
    type = Column(String, default="crm")  # invoice, payment, refund, crm
    amount = Column(Float, default=0)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
