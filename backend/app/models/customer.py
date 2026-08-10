from sqlalchemy import Boolean, Column, Integer, String, DateTime, Float
from datetime import datetime
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    mobile = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    national_id = Column(String, nullable=True)
    economic_code = Column(String, nullable=True)
    contact_person = Column(String, nullable=True)
    customer_type = Column(String, default="customer")  # customer / supplier / both
    opening_balance = Column(Float, default=0)  # positive = debit, negative = credit
    credit_limit = Column(Float, default=0)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Self-service portal: a shareable link stays valid only while enabled,
    # and bumping the generation instantly invalidates every link issued
    # before the bump (no way to enumerate/guess a live link back to valid).
    portal_access_enabled = Column(Boolean, default=False, nullable=False)
    portal_token_generation = Column(Integer, default=0, nullable=False)
    # Supplier self-service portal - independent flag/generation from the
    # customer portal above so a "both" party's two links revoke separately.
    supplier_portal_access_enabled = Column(Boolean, default=False, nullable=False)
    supplier_portal_token_generation = Column(Integer, default=0, nullable=False)
    # "retail" or "wholesale" - selects which quantity price tiers apply
    # when quoting a unit price (see app/pricing.py).
    pricing_group = Column(String, default="retail", nullable=False)
    # Optional sales-rep ownership (users.id) - powers the "my customers"
    # filter; unassigned customers are visible to everyone as before.
    assigned_rep_id = Column(Integer, nullable=True)
    # Set once the customer has messaged the company's Telegram bot (a bot
    # can't message a user who hasn't started that chat first) - see
    # app/telegram_utils.py.
    telegram_chat_id = Column(String, default="")
    # Registered location, used by the Visitor module for geofenced
    # check-ins and distance-based sorting - see app/field_visits.py.
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    # Multi-company data isolation (Milestone 2) - see app/company_scope.py.
    company_id = Column(Integer, nullable=True)
