
from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from app.database import Base

class SalesOpportunity(Base):
    __tablename__ = "sales_opportunities"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer)
    title = Column(String, default="")
    stage = Column(String, default="lead")
    value = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class SalesActivity(Base):
    __tablename__ = "sales_activities"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer)
    type = Column(String, default="call")
    note = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
