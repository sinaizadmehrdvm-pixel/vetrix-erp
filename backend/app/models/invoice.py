from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from datetime import datetime
from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_type = Column(String, nullable=False)  # sale / buy / proforma / return_sale / return_buy
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    subtotal = Column(Float, default=0)
    discount_percent = Column(Float, default=0)
    discount_amount = Column(Float, default=0)
    tax_percent = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    shipping_cost = Column(Float, default=0)
    total_amount = Column(Float, default=0)
    payment_status = Column(String, default="unpaid")  # unpaid / partial / paid
    status = Column(String, default="draft")
    invoice_note = Column(String, nullable=True)
    qr_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    total_price = Column(Float, default=0)
