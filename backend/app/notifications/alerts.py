from sqlalchemy.orm import Session
from app.models.product import Product


def get_low_stock_alerts(db: Session):
    products = db.query(Product).filter(Product.stock <= 5).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "stock": p.stock,
            "message": f"{p.name} stock is low",
        }
        for p in products
    ]