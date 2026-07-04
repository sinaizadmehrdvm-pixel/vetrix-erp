def generate_financial_insight(data):
    revenue = data.get("revenue", 0)
    expenses = data.get("expenses", 0)
    profit = revenue - expenses

    if profit > 5000:
        status = "Excellent financial performance"
    elif profit > 1000:
        status = "Good financial condition"
    elif profit > 0:
        status = "Stable but needs optimization"
    else:
        status = "Warning: losses detected"

    return {
        "profit": profit,
        "status": status,
        "recommendation": "Reduce unnecessary expenses and improve sales strategy."
    }