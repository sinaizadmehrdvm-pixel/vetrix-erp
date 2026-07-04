def calculate_score(total_buy=0, debt=0, last_days=0):
    score = 50

    if total_buy > 10000:
        score += 20

    if debt > 0:
        score -= 20

    if last_days > 30:
        score -= 15

    if score >= 80:
        level = "VIP"
    elif score >= 60:
        level = "Normal"
    else:
        level = "Risk"

    return {
        "score": max(0, min(100, score)),
        "level": level
    }