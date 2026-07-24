from fastapi import APIRouter, HTTPException, Request
from jwt import PyJWTError
from sqlalchemy.orm import Session

from app.auth import (
    SUPPLIER_PORTAL_LINK_DAYS,
    create_supplier_portal_token,
    decode_supplier_portal_token,
    extract_bearer_token,
)
from app.database import SessionLocal
from app.models.accounting_entry import AccountingEntry
from app.models.customer import Customer
from app.models.invoice import Invoice

router = APIRouter(prefix="/api/supplier-portal", tags=["Supplier Self-Service Portal"])


def _supplier_balance(db: Session, customer_id: int) -> float:
    entries = (
        db.query(AccountingEntry)
        .filter(AccountingEntry.customer_id == customer_id)
        .order_by(AccountingEntry.created_at.asc(), AccountingEntry.id.asc())
        .all()
    )
    return sum((entry.debit or 0) - (entry.credit or 0) for entry in entries)


def _authenticated_portal_supplier(request: Request, db: Session) -> Customer:
    token = extract_bearer_token(request.headers.get("Authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Portal access token required")
    try:
        claims = decode_supplier_portal_token(token)
        customer_id = int(claims["customer_id"])
    except (PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired portal link")

    supplier = db.query(Customer).filter(Customer.id == customer_id).first()
    if not supplier or not supplier.supplier_portal_access_enabled:
        raise HTTPException(status_code=401, detail="Portal access is not available for this link")

    token_generation = int(claims.get("gen", 0) or 0)
    if token_generation != int(supplier.supplier_portal_token_generation or 0):
        raise HTTPException(status_code=401, detail="This link has been revoked")

    return supplier


# --- Supplier-facing (public paths; this router verifies its own token) ---


@router.get("/me")
def portal_me(request: Request):
    db: Session = SessionLocal()
    try:
        supplier = _authenticated_portal_supplier(request, db)
        return {
            "supplier": {
                "id": supplier.id,
                "name": supplier.name,
                "phone": supplier.phone or "",
                "email": supplier.email or "",
                "address": supplier.address or "",
                "city": supplier.city or "",
                "balance": _supplier_balance(db, supplier.id),
            }
        }
    finally:
        db.close()


@router.get("/invoices")
def portal_invoices(request: Request):
    db: Session = SessionLocal()
    try:
        supplier = _authenticated_portal_supplier(request, db)
        invoices = (
            db.query(Invoice)
            .filter(Invoice.customer_id == supplier.id, Invoice.invoice_type == "buy")
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
            ]
        }
    finally:
        db.close()


@router.get("/ledger")
def portal_ledger(request: Request):
    db: Session = SessionLocal()
    try:
        supplier = _authenticated_portal_supplier(request, db)
        entries = (
            db.query(AccountingEntry)
            .filter(AccountingEntry.customer_id == supplier.id)
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
        supplier = db.query(Customer).filter(Customer.id == customer_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Party not found")
        if supplier.customer_type not in {"supplier", "both"}:
            raise HTTPException(status_code=400, detail="Party is not marked as a supplier")
        supplier.supplier_portal_access_enabled = True
        db.commit()
        db.refresh(supplier)
        token = create_supplier_portal_token(supplier.id, supplier.supplier_portal_token_generation)
        return {
            "status": "created",
            "token": token,
            "expires_in_days": SUPPLIER_PORTAL_LINK_DAYS,
        }
    finally:
        db.close()


@router.post("/{customer_id}/revoke")
def revoke_access(customer_id: int):
    db: Session = SessionLocal()
    try:
        supplier = db.query(Customer).filter(Customer.id == customer_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Party not found")
        supplier.supplier_portal_access_enabled = False
        supplier.supplier_portal_token_generation = (supplier.supplier_portal_token_generation or 0) + 1
        db.commit()
        return {"status": "revoked"}
    finally:
        db.close()


@router.get("/{customer_id}/status")
def access_status(customer_id: int):
    db: Session = SessionLocal()
    try:
        supplier = db.query(Customer).filter(Customer.id == customer_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Party not found")
        return {"enabled": bool(supplier.supplier_portal_access_enabled)}
    finally:
        db.close()
