from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal

router = APIRouter(prefix="/finance", tags=["Finance"])

ALLOWED_ACCOUNT_TYPES = {"cash", "bank", "wallet", "card", "other"}
ALLOWED_TRANSACTION_TYPES = {"income", "expense", "transfer"}


class FinanceAccount(Base):
    __tablename__ = "finance_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, default="cash")
    opening_balance = Column(Float, default=0)
    balance = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceTransaction(Base):
    __tablename__ = "finance_transactions"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("finance_accounts.id"), nullable=False)
    to_account_id = Column(Integer, ForeignKey("finance_accounts.id"), nullable=True)
    amount = Column(Float, default=0)
    description = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceAccountCreate(BaseModel):
    name: str
    type: str = "cash"
    opening_balance: float = 0


class FinanceTransactionCreate(BaseModel):
    type: str
    account_id: int
    to_account_id: Optional[int] = None
    amount: float
    description: str = ""


def _account_dict(account):
    return {
        "id": account.id,
        "name": account.name,
        "type": account.type,
        "balance": float(account.balance or 0),
        "opening_balance": float(account.opening_balance or 0),
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }


def _transaction_dict(db, tx):
    account = db.query(FinanceAccount).filter(FinanceAccount.id == tx.account_id).first()
    to_account = (
        db.query(FinanceAccount).filter(FinanceAccount.id == tx.to_account_id).first()
        if tx.to_account_id else None
    )
    account_name = account.name if account else "-"
    if tx.type == "transfer" and to_account:
        account_name = f"{account_name} ← {to_account.name}"
    return {
        "id": tx.id,
        "type": tx.type,
        "account_id": tx.account_id,
        "to_account_id": tx.to_account_id,
        "amount": float(tx.amount or 0),
        "description": tx.description or "",
        "account_name": account_name,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
    }


# -----------------------
# Summary
# -----------------------
@router.get("/summary")
def get_summary():
    db: Session = SessionLocal()
    try:
        accounts = db.query(FinanceAccount).all()
        total_balance = sum(float(a.balance or 0) for a in accounts)

        today = datetime.utcnow().date()
        start_of_day = datetime(today.year, today.month, today.day)
        todays_transactions = (
            db.query(FinanceTransaction)
            .filter(FinanceTransaction.created_at >= start_of_day)
            .all()
        )
        income_today = sum(float(t.amount or 0) for t in todays_transactions if t.type == "income")
        expense_today = sum(float(t.amount or 0) for t in todays_transactions if t.type == "expense")

        return {
            "total_balance": total_balance,
            "income_today": income_today,
            "expense_today": expense_today,
            "net_today": income_today - expense_today,
        }
    finally:
        db.close()


# -----------------------
# Accounts
# -----------------------
@router.get("/accounts")
def list_accounts():
    db: Session = SessionLocal()
    try:
        accounts = db.query(FinanceAccount).order_by(FinanceAccount.id.desc()).all()
        return [_account_dict(a) for a in accounts]
    finally:
        db.close()


@router.post("/accounts")
def create_account(data: FinanceAccountCreate):
    db: Session = SessionLocal()
    try:
        if not data.name.strip():
            raise ValueError("Account name is required")
        account_type = data.type if data.type in ALLOWED_ACCOUNT_TYPES else "cash"
        opening_balance = float(data.opening_balance or 0)
        account = FinanceAccount(
            name=data.name.strip(),
            type=account_type,
            opening_balance=opening_balance,
            balance=opening_balance,
        )
        db.add(account)
        db.commit()
        db.refresh(account)
        return {"status": "created", **_account_dict(account)}
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


# -----------------------
# Transactions
# -----------------------
@router.get("/transactions")
def list_transactions():
    db: Session = SessionLocal()
    try:
        transactions = db.query(FinanceTransaction).order_by(FinanceTransaction.id.desc()).all()
        return [_transaction_dict(db, t) for t in transactions]
    finally:
        db.close()


@router.post("/transactions")
def create_transaction(data: FinanceTransactionCreate):
    db: Session = SessionLocal()
    try:
        if data.type not in ALLOWED_TRANSACTION_TYPES:
            raise ValueError("Invalid transaction type")
        amount = float(data.amount or 0)
        if amount <= 0:
            raise ValueError("Amount must be greater than zero")

        account = db.query(FinanceAccount).filter(FinanceAccount.id == data.account_id).first()
        if not account:
            raise ValueError("Account not found")

        to_account = None
        if data.type == "transfer":
            if not data.to_account_id:
                raise ValueError("Destination account is required for a transfer")
            if data.to_account_id == data.account_id:
                raise ValueError("Source and destination accounts must differ")
            to_account = db.query(FinanceAccount).filter(FinanceAccount.id == data.to_account_id).first()
            if not to_account:
                raise ValueError("Destination account not found")

        if data.type == "income":
            account.balance = float(account.balance or 0) + amount
        elif data.type == "expense":
            account.balance = float(account.balance or 0) - amount
        else:  # transfer
            account.balance = float(account.balance or 0) - amount
            to_account.balance = float(to_account.balance or 0) + amount

        tx = FinanceTransaction(
            type=data.type,
            account_id=data.account_id,
            to_account_id=data.to_account_id if data.type == "transfer" else None,
            amount=amount,
            description=data.description or "",
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return {"status": "created", **_transaction_dict(db, tx)}
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()
