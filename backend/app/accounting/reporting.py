from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

MONEY_STEP = Decimal("0.01")


def _decimal(value):
    return Decimal(str(value or 0))


def _money(value):
    return _decimal(value).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def _sum_invoice_type(invoices, invoice_type):
    return sum(
        (_decimal(invoice.total_amount) for invoice in invoices if invoice.invoice_type == invoice_type),
        Decimal("0"),
    )


def build_profit_loss(invoices, invoice_items, product_costs, expenses):
    sales = _sum_invoice_type(invoices, "sale")
    sales_returns = _sum_invoice_type(invoices, "return_sale")
    purchases = _sum_invoice_type(invoices, "buy")
    purchase_returns = _sum_invoice_type(invoices, "return_buy")
    net_sales = sales - sales_returns
    net_purchases = purchases - purchase_returns

    invoice_types = {invoice.id: invoice.invoice_type for invoice in invoices}
    cost_of_goods_sold = Decimal("0")
    for item in invoice_items:
        invoice_type = invoice_types.get(item.invoice_id)
        line_cost = _decimal(item.quantity) * _decimal(product_costs.get(item.product_id, 0))
        if invoice_type == "sale":
            cost_of_goods_sold += line_cost
        elif invoice_type == "return_sale":
            cost_of_goods_sold -= line_cost

    operating_expenses = sum((_decimal(value) for value in expenses), Decimal("0"))
    gross_profit = net_sales - cost_of_goods_sold
    net_profit = gross_profit - operating_expenses
    margin = (net_profit / net_sales * Decimal("100")) if net_sales > 0 else Decimal("0")

    return {
        "sales": float(_money(sales)),
        "sales_returns": float(_money(sales_returns)),
        "net_sales": float(_money(net_sales)),
        "purchases": float(_money(purchases)),
        "purchase_returns": float(_money(purchase_returns)),
        "net_purchases": float(_money(net_purchases)),
        "cost_of_goods_sold": float(_money(cost_of_goods_sold)),
        "expenses": float(_money(operating_expenses)),
        "gross_profit": float(_money(gross_profit)),
        "net_profit": float(_money(net_profit)),
        "margin_percent": float(_money(margin)),
    }


def customer_net_sales(invoices):
    totals = defaultdict(Decimal)
    counts = defaultdict(int)
    for invoice in invoices:
        if invoice.invoice_type == "sale":
            totals[invoice.customer_id] += _decimal(invoice.total_amount)
            counts[invoice.customer_id] += 1
        elif invoice.invoice_type == "return_sale":
            totals[invoice.customer_id] -= _decimal(invoice.total_amount)
    return {
        customer_id: {
            "sales_amount": float(_money(amount)),
            "invoice_count": counts[customer_id],
        }
        for customer_id, amount in totals.items()
    }


def net_period_total(invoices, positive_type, return_type, predicate):
    positive = sum(
        (_decimal(invoice.total_amount) for invoice in invoices if invoice.invoice_type == positive_type and predicate(invoice)),
        Decimal("0"),
    )
    returned = sum(
        (_decimal(invoice.total_amount) for invoice in invoices if invoice.invoice_type == return_type and predicate(invoice)),
        Decimal("0"),
    )
    return float(_money(positive - returned))
