def build_live_notifications(low_stock: int, net_profit: float):
    notifications = []

    if low_stock > 0:
        notifications.append({
            "type": "warning",
            "title": "Low stock alert",
            "message": f"{low_stock} products need stock review."
        })

    if net_profit < 0:
        notifications.append({
            "type": "danger",
            "title": "Profit warning",
            "message": "Net profit is negative."
        })

    if not notifications:
        notifications.append({
            "type": "success",
            "title": "System healthy",
            "message": "No critical alerts detected."
        })

    return notifications