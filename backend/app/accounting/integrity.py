from collections import defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

MONEY_STEP = Decimal("0.01")
ALLOWED_INVOICE_TYPES = {"sale", "buy", "proforma", "return_sale", "return_buy"}
ALLOWED_PAYMENT_STATUSES = {"unpaid", "partial", "paid"}
SETTLEMENT_TYPES = {
    "sale": "receipt",
    "buy": "payment",
    "return_sale": "payment",
    "return_buy": "receipt",
}


def decimal_value(value, field_name: str) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{field_name} must be a valid number")


def money(value) -> Decimal:
    return decimal_value(value, "amount").quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def calculate_invoice_totals(items, discount_percent=0, tax_percent=0, shipping_cost=0):
    discount = decimal_value(discount_percent, "discount_percent")
    tax = decimal_value(tax_percent, "tax_percent")
    shipping = money(shipping_cost)

    if discount < 0 or discount > 100:
        raise ValueError("discount_percent must be between 0 and 100")
    if tax < 0 or tax > 100:
        raise ValueError("tax_percent must be between 0 and 100")
    if shipping < 0:
        raise ValueError("shipping_cost cannot be negative")
    if not items:
        raise ValueError("Invoice must have at least one item")

    subtotal = Decimal("0")
    for item in items:
        quantity = decimal_value(item.quantity, "quantity")
        unit_price = money(item.unit_price)
        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")
        if unit_price < 0:
            raise ValueError("Unit price cannot be negative")
        subtotal += quantity * unit_price

    subtotal = money(subtotal)
    discount_amount = money(subtotal * discount / Decimal("100"))
    after_discount = subtotal - discount_amount
    tax_amount = money(after_discount * tax / Decimal("100"))
    total_amount = money(after_discount + tax_amount + shipping)

    return {
        "subtotal": float(subtotal),
        "discount_percent": float(discount),
        "discount_amount": float(discount_amount),
        "tax_percent": float(tax),
        "tax_amount": float(tax_amount),
        "shipping_cost": float(shipping),
        "total_amount": float(total_amount),
    }


def aggregate_item_quantities(items):
    totals = defaultdict(Decimal)
    for item in items:
        totals[int(item.product_id)] += decimal_value(item.quantity, "quantity")
    return {product_id: float(quantity) for product_id, quantity in totals.items()}


def expected_settlement_type(invoice_type: str):
    return SETTLEMENT_TYPES.get(invoice_type)


def calculate_payment_status(total_amount, settled_amount):
    total = money(total_amount)
    settled = money(settled_amount)

    if settled <= 0:
        return "unpaid"
    if settled < total:
        return "partial"
    return "paid"
