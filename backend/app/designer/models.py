from sqlalchemy import Column, Integer, String, JSON
from app.database import Base

class PdfTemplate(Base):
    __tablename__ = "pdf_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    page_size = Column(String, default="A4")
    config = Column(JSON)   # 🎯 کل طراحی اینجا ذخیره میشه