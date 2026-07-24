from fastapi import APIRouter, HTTPException, Request
from jwt import PyJWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    CUSTOMER_PORTAL_LINK_DAYS,
    create_customer_portal_token,
    decode_customer_portal_token,
    extract_bearer_token,
)
from app.database import SessionLocal
from app.models.accounting_entry import AccountingEntry
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.payment_gateway import request_payment_for_invoice

router = APIRouter(prefix="/api/customer-portal", tags=["Customer Self-Service Portal"])


def _customer_balance(db: Session, customer_id: int) -> float:
    entries = (
        db.query(AccountingEntry)
        .filter(AccountingEntry.customer_id == customer_id)
        .order_by(AccountingEntry.created_at.asc(), AccountingEntry.id.asc())
        .all()
    )
    return sum((entry.debit or 0) - (entry.credit or 0) for entry in entries)


def _authenticated_portal_customer(request: Request, db: Session) -> Customer:
    token = extract_bearer_token(request.headers.get("Authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Portal access token required")
    try:
        claims = decode_customer_portal_token(token)
        customer_id = int(claims["customer_id"])
    except (PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired portal link")

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer or not customer.portal_access_enabled:
        raise HTTPException(status_code=401, detail="Portal access is not available for this link")

    token_generation = int(claims.get("gen", 0) or 0)
    if token_generation != int(customer.portal_token_generation or 0):
        raise HTTPException(status_code=401, detail="This link has been revoked")

    return customer


# --- Customer-facing (public paths; this router verifies its own token) ---


@router.get("/me")
def portal_me(request: Request):
    db: Session = SessionLocal()
    try:
        customer = _authenticated_portal_customer(request, db)
        return {
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "phone": customer.phone or "",
                "email": customer.email or "",
                "address": customer.address or "",
                "city": customer.city or "",
                "balance": _customer_balance(db, customer.id),
            }
        }
    finally:
        db.close()


@router.get("/invoices")
def portal_invoices(request: Request):
    db: Session = SessionLocal()
    try:
        customer = _authenticated_portal_customer(request, db)
        invoices = (
            db.query(Invoice)
            .filter(Invoice.customer_id == customer.id)
            .order_by(Invoice.id.desc())
            .all()
        )
        return {
            "items": [
                {
                    "id": invoice.id,
                    "invoice_type": invoice.invoice_type,
                    "total_amount": invoice.total_amount,
                    "payment_status": invoice.payment_status,
                    "created_at": invoice.created_at,
                }
                for invoice in invoices
                if invoice.invoice_type != "proforma"
            ]
        }
    finally:
        db.close()


class PortalPayRequest(BaseModel):
    invoice_id: int


@router.post("/pay")
def portal_pay_invoice(data: PortalPayRequest, request: Request):
    db: Session = SessionLocal()
    try:
        customer = _authenticated_portal_customer(request, db)
        invoice = db.query(Invoice).filter(Invoice.id == data.invoice_id).first()
        if not invoice or invoice.customer_id != customer.id:
            raise HTTPException(status_code=404, detail="Invoice not found")
    finally:
        db.close()
    return request_payment_for_invoice(data.invoice_id)


@router.get("/ledger")
def portal_ledger(request: Request):
    db: Session = SessionLocal()
    try:
        customer = _authenticated_portal_customer(request, db)
        entries = (
            db.query(AccountingEntry)
            .filter(AccountingEntry.customer_id == customer.id)
            .order_by(AccountingEntry.created_at.asc(), AccountingEntry.id.asc())
            .all()
        )
        rows = []
        balance = 0.0
        for entry in entries:
            balance += (entry.debit or 0) - (entry.credit or 0)
            rows.append({
                "date": entry.created_at,
                "description": entry.description,
                "debit": entry.debit or 0,
                "credit": entry.credit or 0,
                "balance": balance,
            })
        return {"balance": balance, "entries": rows}
    finally:
        db.close()


# --- Staff-facing (normal staff auth + RBAC apply to these) ---


@router.post("/{customer_id}/access-link")
def create_access_link(customer_id: int):
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer.portal_access_enabled = True
        db.commit()
        db.refresh(customer)
        token = create_customer_portal_token(customer.id, customer.portal_token_generation)
        return {
            "status": "created",
            "token": token,
            "expires_in_days": CUSTOMER_PORTAL_LINK_DAYS,
        }
    finally:
        db.close()


@router.post("/{customer_id}/revoke")
def revoke_access(customer_id: int):
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer.portal_access_enabled = False
        customer.portal_token_generation = (customer.portal_token_generation or 0) + 1
        db.commit()
        return {"status": "revoked"}
    finally:
        db.close()


@router.get("/{customer_id}/status")
def access_status(customer_id: int):
    db: Session = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"enabled": bool(customer.portal_access_enabled)}
    finally:
        db.close()
