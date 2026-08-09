from sqlalchemy import Column, Integer, String, Float
from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)

    code = Column(String, default="")
    barcode = Column(String, default="")
    barcode2 = Column(String, nullable=True)
    barcode3 = Column(String, nullable=True)
    sku = Column(String, default="")

    brand = Column(String, default="")
    unit = Column(String, default="عدد")

    buy_price = Column(Float, default=0)
    sell_price = Column(Float, default=0)

    # Optional: a preferred vendor (a Customer row with customer_type
    # supplier/both) and typical lead time, used to route SmartInventory's
    # reorder suggestions straight into a purchase order.
    preferred_supplier_id = Column(Integer, nullable=True)
    lead_time_days = Column(Integer, default=0)

    # برای سازگاری با بخش‌های قدیمی برنامه
    price = Column(Float, default=0)

    stock = Column(Float, default=0)
    min_stock = Column(Float, default=0)

    main_category = Column(String, default="")
    sub_category = Column(String, default="")

    image = Column(String, default="")

    description = Column(String, nullable=True)
    count_in_pack = Column(Float, nullable=True)

    # Multi-company data isolation (Milestone 2) - see app/company_scope.py.
    company_id = Column(Integer, nullable=True)