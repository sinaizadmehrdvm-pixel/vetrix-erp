from fastapi import APIRouter

router = APIRouter(prefix="/finance", tags=["Finance"])

# -----------------------
# Summary
# -----------------------
@router.get("/summary")
def get_summary():
    return {
        "total_income": 2500000,
        "total_expense": 1250000,
        "balance": 1250000,
    }

# -----------------------
# Accounts
# -----------------------
@router.get("/accounts")
def get_accounts():
    return [
        {"id": 1, "name": "صندوق اصلی", "balance": 2500000},
        {"id": 2, "name": "بانک ملت", "balance": 6800000},
        {"id": 3, "name": "کیف پول مدیر", "balance": 850000},
    ]

# -----------------------
# Transactions
# -----------------------
@router.get("/transactions")
def get_transactions():
    return [
        {"id": 1, "type": "income", "amount": 200000, "title": "فروش کالا"},
        {"id": 2, "type": "expense", "amount": 120000, "title": "خرید مواد"},
        {"id": 3, "type": "income", "amount": 500000, "title": "قرارداد خدمات"},
    ]