"""Iran e-invoice (سامانه مودیان / INTA) submission scaffold.

Selected by VETRIX_EINVOICE_PROVIDER (unset = feature disabled, fails
closed like every other externally-gated integration in this app - see
app/payment_gateway.py's _active_provider() for the same convention):

- "sandbox": a local, deterministic simulation. It never talks to a real
  tax-authority endpoint and every response it produces is clearly labeled
  as simulated. This is enough to exercise the whole submit/track flow
  (and the invoice-side UI) without a real taxpayer account.
- "modian": intentionally left unimplemented beyond a clear 501. INTA's
  real API requires a taxpayer-specific signing certificate (invoices must
  be RSA-signed with a certificate issued to that specific "شناسه
  اقتصادی"), a per-taxpayer "کد صورتحساب" sequence, and a goods/services
  tax-code catalog - none of which can be safely guessed or hardcoded here
  without a real registered account to validate against. Silently
  fabricating a request shape for a government tax system would risk
  submitting invoices that are wrong in ways a business only discovers
  during an audit. When a real integration is wired up, it belongs here,
  gated behind the same "sandbox" contract this module already exercises
  (_build_payload / EInvoiceSubmission / status tracking), so the rest of
  the app never needs to change.

Uses main.py's existing invoice/customer/settings data directly (deferred,
function-local `import main`, same reason app/payment_gateway.py does it)
rather than re-deriving totals - the accounting engine is the source of
truth for amounts.
"""
import os
import secrets
from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceItem

router = APIRouter(prefix="/api/einvoice", tags=["Iran E-Invoice"])


class EInvoiceSubmission(Base):
    __tablename__ = "einvoice_submissions"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, nullable=False, index=True)
    provider = Column(String, nullable=False)
    status = Column(String, default="pending", nullable=False)  # pending / accepted / rejected
    tax_reference = Column(String, nullable=True)  # کد مرجع صورتحساب returned by the authority
    payload_snapshot = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


EInvoiceSubmission.__table__.create(bind=engine, checkfirst=True)


def _active_provider() -> str:
    provider = os.getenv("VETRIX_EINVOICE_PROVIDER", "").strip().lower()
    if not provider:
        raise HTTPException(status_code=503, detail="Iran e-invoice submission is not configured")
    if provider not in {"sandbox", "modian"}:
        raise HTTPException(status_code=503, detail=f"Unknown e-invoice provider: {provider}")
    return provider


def _build_payload(db: Session, invoice: Invoice) -> dict:
    import main  # deferred - see module docstring

    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice.id).all()
    settings = main.get_or_create_settings(db)

    return {
        "seller": {
            "name": getattr(settings, "company_name", "") or "",
            "national_id": getattr(settings, "national_id", "") or "",
            "economic_code": getattr(settings, "economic_code", "") or "",
        },
        "buyer": {
            "name": customer.name if customer else "",
            "national_id": getattr(customer, "national_id", "") or "" if customer else "",
            "economic_code": getattr(customer, "economic_code", "") or "" if customer else "",
        },
        "invoice_id": invoice.id,
        "issued_at": invoice.created_at.isoformat() if invoice.created_at else None,
        "items": [
            {
                "product_id": item.product_id,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total_price": item.total_price,
            }
            for item in items
        ],
        "subtotal": invoice.subtotal,
        "discount_amount": invoice.discount_amount,
        "tax_percent": invoice.tax_percent,
        "tax_amount": invoice.tax_amount,
        "total_amount": invoice.total_amount,
    }


def submit_invoice_for_einvoicing(invoice_id: int) -> dict:
    provider = _active_provider()
    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if invoice.invoice_type != "sale":
            raise HTTPException(status_code=400, detail="Only sale invoices can be submitted for e-invoicing")

        existing = (
            db.query(EInvoiceSubmission)
            .filter(EInvoiceSubmission.invoice_id == invoice_id, EInvoiceSubmission.status == "accepted")
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="This invoice was already submitted and accepted")

        payload = _build_payload(db, invoice)
        submission = EInvoiceSubmission(
            invoice_id=invoice_id,
            provider=provider,
            status="pending",
            payload_snapshot=str(payload),
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)

        if provider == "sandbox":
            submission.status = "accepted"
            submission.tax_reference = f"SANDBOX-INV-{secrets.token_hex(6).upper()}"
            submission.completed_at = datetime.utcnow()
            db.commit()
            return {
                "status": "accepted",
                "provider": "sandbox",
                "tax_reference": submission.tax_reference,
                "note": "Simulated submission - no real tax authority was contacted.",
            }

        submission.status = "rejected"
        submission.error_message = "modian provider requires a taxpayer signing certificate; not implemented"
        db.commit()
        raise HTTPException(
            status_code=501,
            detail=(
                "Real INTA/Modian submission is not implemented - it requires your taxpayer signing "
                "certificate and a verified current API contract. Use VETRIX_EINVOICE_PROVIDER=sandbox "
                "to exercise this feature end-to-end without a real account."
            ),
        )
    finally:
        db.close()


@router.post("/invoices/{invoice_id}/submit")
def submit_invoice(invoice_id: int):
    return submit_invoice_for_einvoicing(invoice_id)


@router.get("/invoices/{invoice_id}/status")
def submission_status(invoice_id: int):
    db: Session = SessionLocal()
    try:
        submissions = (
            db.query(EInvoiceSubmission)
            .filter(EInvoiceSubmission.invoice_id == invoice_id)
            .order_by(EInvoiceSubmission.created_at.desc())
            .all()
        )
        return {
            "invoice_id": invoice_id,
            "submissions": [
                {
                    "id": s.id,
                    "provider": s.provider,
                    "status": s.status,
                    "tax_reference": s.tax_reference,
                    "error_message": s.error_message,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                }
                for s in submissions
            ],
        }
    finally:
        db.close()
