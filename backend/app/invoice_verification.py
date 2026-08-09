"""Public, unauthenticated invoice verification - the target of the QR code
printed on every invoice (see PrintElement's "qr" type in the frontend).
Deliberately exposes only non-sensitive, already-public-on-paper facts
(invoice number, date, issuing company, total, status) - never the
customer's name/phone/address or line items, since this endpoint has no
login and is reachable by anyone who scans the code.

No new table/column: the verification code is an HMAC over
(invoice_id, company_id) using the same secret the app already signs JWTs
with (app.auth._jwt_secret), so it's stable, unguessable without the
server secret, and requires zero migration.
"""
import hashlib
import hmac

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.auth import _jwt_secret
from app.company_scope import get_company_brief
from app.database import engine

router = APIRouter(prefix="/api/invoices", tags=["Invoice Verification"])


def verification_code(invoice_id: int, company_id: int | None) -> str:
    secret = _jwt_secret().encode("utf-8")
    payload = f"invoice-verify:{invoice_id}:{company_id or 0}".encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()[:12]


@router.get("/verify")
def verify_invoice(id: int, code: str):
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT id, invoice_type, total_amount, payment_status, void_status, created_at, company_id
            FROM invoices WHERE id = :id
        """), {"id": id}).mappings().first()

    if not row or verification_code(row["id"], row["company_id"]) != code:
        raise HTTPException(status_code=404, detail="Invoice not found or verification code invalid")

    company = get_company_brief(row["company_id"]) or {}

    return {
        "valid": True,
        "invoice_id": row["id"],
        "invoice_type": row["invoice_type"],
        "total_amount": row["total_amount"],
        "payment_status": row["payment_status"],
        "void_status": row["void_status"],
        "created_at": row["created_at"],
        "company_name": company.get("name") or "",
    }
