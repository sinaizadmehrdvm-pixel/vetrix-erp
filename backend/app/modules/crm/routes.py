from fastapi import APIRouter

router = APIRouter()

@router.get("/customer-insight/{customer_id}")
def customer_insight(customer_id: int):
    return {
        "customer_id": customer_id,
        "score": 72,
        "status": "normal",
        "risk": "low",
        "message": "Customer is stable but needs follow-up"
    }


@router.get("/customer-timeline/{customer_id}")
def customer_timeline(customer_id: int):
    return {
        "customer_id": customer_id,
        "timeline": [
            {"type": "invoice", "amount": 1200, "date": "2026-01-01"},
            {"type": "payment", "amount": 500, "date": "2026-01-03"},
        ]
    }


@router.get("/customer-score/{customer_id}")
def customer_score(customer_id: int):
    return {
        "customer_id": customer_id,
        "score": 75,
        "level": "VIP"
    }