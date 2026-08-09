from sqlalchemy import Column, Integer, String, JSON
from app.database import Base

class PdfTemplate(Base):
    __tablename__ = "pdf_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    page_size = Column(String, default="A4")
    config = Column(JSON)   # 🎯 کل طراحی اینجا ذخیره میشه
    company_id = Column(Integer, nullable=True)
    # "invoice" (default, existing behavior) / "business_card" / "letterhead"
    # / "banner" - lets the same template table + designer engine serve
    # every printable/shareable document kind without separate tables.
    kind = Column(String, default="invoice", nullable=False)