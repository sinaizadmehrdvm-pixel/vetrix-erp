def generate_insight(score_data):
    if score_data["level"] == "VIP":
        return "Customer is high value. Offer discount or loyalty reward."

    if score_data["level"] == "Normal":
        return "Customer is stable. Keep engagement active."

    return "Customer is at risk. Immediate follow-up required."