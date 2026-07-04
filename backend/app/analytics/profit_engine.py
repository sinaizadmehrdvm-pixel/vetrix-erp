def build_profit_analysis(total_revenue: float, total_purchases: float, invoices_count: int):
    profit = total_revenue - total_purchases

    if total_revenue <= 0:
        margin = 0
    else:
        margin = round((profit / total_revenue) * 100, 2)

    if profit > 0 and margin >= 40:
        health = "Excellent"
        message = "Profit margin is strong."
    elif profit > 0 and margin >= 15:
        health = "Good"
        message = "Business is profitable, but expenses should be monitored."
    elif profit > 0:
        health = "Stable"
        message = "Profit is positive but margin is low."
    else:
        health = "Warning"
        message = "Profit is negative or zero. Review pricing and purchasing."

    return {
        "profit": profit,
        "margin": margin,
        "health": health,
        "message": message,
        "invoices_count": invoices_count,
    }