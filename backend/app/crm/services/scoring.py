def calculate_customer_score(total_purchase, total_paid, debt, invoices_count):
    score = 50

    if total_purchase > 100_000_000:
        score += 20

    if debt > 0:
        score -= 15

    if invoices_count > 20:
        score += 10

    if total_paid > total_purchase:
        score += 5

    return max(0, min(100, score))