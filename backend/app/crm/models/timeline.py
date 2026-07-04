from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from datetime import datetime
from app.database import Base


class CustomerTimeline(Base):
    __tablename__ = "crm_customer_timeline"

    id = Column(Integer, primary_key=True)

    customer_id = Column(Integer, ForeignKey("crm_customers.id"))

    type = Column(String)  # invoice / payment / call / note / task
    title = Column(String)
    description = Column(Text, nullable=True)

    amount = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)