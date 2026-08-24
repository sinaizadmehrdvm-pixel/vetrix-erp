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
    payment_terms_days = Column(Integer, default=0)
    due_date = Column(String, nullable=True)
    invoice_note = Column(String, nullable=True)
    qr_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Multi-company data isolation (Milestone 2) - see app/company_scope.py.
    company_id = Column(Integer, nullable=True)
    # "desk" (default, the normal desktop flow) or "visitor" (created by the
    # Visitor/field-sales-rep mobile module, see app/field_visits.py) - lets
    # reporting distinguish field orders without a parallel invoice table.
    source = Column(String, default="desk")
    # Phase 1 payment workflow (see app/invoice_payments.py): a denormalized
    # cache of invoice_settled_amount(), refreshed by sync_invoice_payment_status()
    # every time it runs. Source of truth stays accounting_entries - this
    # only avoids an N+1 aggregate query on list views.
    amount_paid = Column(Float, default=0)
    # "active" or "voided" - a voided invoice's items/GL stay in place for
    # audit history (never deleted); void_status is what list views/reports
    # filter on to exclude it from normal totals.
    void_status = Column(String, default="active")
    voided_at = Column(String, nullable=True)
    voided_by = Column(Integer, nullable=True)
    void_reason = Column(String, default="")
    # Modular per-industry extra fields (veterinary/human_medical/pharmacy/
    # ...) - see app/industry_fields.py. JSON blob, not dedicated columns,
    # so adding a new industry/field never needs a migration.
    industry_fields_json = Column(String, default="{}")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    total_price = Column(Float, default=0)
    # Optional: which warehouse this line's stock moved through. Product.stock
    # (the aggregate total) is always updated regardless via the existing
    # apply_invoice_stock/reverse_invoice_stock path; this only additionally
    # updates that one warehouse's bucket in app/warehouses.py's per-location
    # ledger when set, so omitting it keeps every prior behavior unchanged.
    warehouse_id = Column(Integer, nullable=True)
    # Multi-company data isolation (Milestone 2) - see app/company_scope.py.
    company_id = Column(Integer, nullable=True)
