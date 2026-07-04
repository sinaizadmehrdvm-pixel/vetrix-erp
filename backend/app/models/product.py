from sqlalchemy import Column, Integer, String, Float
from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)

    code = Column(String, default="")
    barcode = Column(String, default="")
    sku = Column(String, default="")

    brand = Column(String, default="")
    unit = Column(String, default="عدد")

    buy_price = Column(Float, default=0)
    sell_price = Column(Float, default=0)

    # برای سازگاری با بخش‌های قدیمی برنامه
    price = Column(Float, default=0)

    stock = Column(Float, default=0)
    min_stock = Column(Float, default=0)

    main_category = Column(String, default="")
    sub_category = Column(String, default="")

    image = Column(String, default="")