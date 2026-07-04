from sqlalchemy.orm import Session
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product
from app.models.customer import Customer


def get_recent_invoices(db: Session, limit: int = 5):
    invoices = db.query(Invoice).order_by(Invoice.id.desc()).limit(limit).all()

    result = []
    for inv in invoices:
        customer = db.query(Customer).filter(Customer.id == inv.customer_id).first()
        result.append({
            "id": inv.id,
            "type": inv.invoice_type,
            "customer": customer.name if customer else "Unknown",
            "total": inv.total_amount or 0,
            "status": inv.status,
        })

    return result


def get_top_products(db: Session, limit: int = 5):
    products = db.query(Product).order_by(Product.stock.desc()).limit(limit).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "barcode": p.barcode,
            "stock": p.stock,
            "price": p.price,
        }
        for p in products
    ]