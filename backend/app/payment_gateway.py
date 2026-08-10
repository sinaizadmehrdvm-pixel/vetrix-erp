"""Online payment gateway integration.

Two providers, selected by VETRIX_PAYMENT_PROVIDER (unset = feature
disabled, fails closed like every other externally-gated integration in
this app - see app/inbound_voice.py's _required_secret()):

- "sandbox": a local, always-deterministic simulation for development and
  demos. It never talks to a real processor and is clearly labeled as such
  everywhere it's surfaced. Useful for testing the invoice/receipt side of
  this feature without live merchant credentials.
- "zarinpal": the real ZarinPal REST flow (PaymentRequest -> StartPay
  redirect -> callback -> PaymentVerification), gated behind
  VETRIX_ZARINPAL_MERCHANT_ID. This has not been exercised against
  ZarinPal's live API in this environment (no real merchant account or
  outbound network access here) - the request/verify shapes follow
  ZarinPal's published REST contract, but production use should be
  smoke-tested against a real merchant sandbox before going live.

Finalizing a successful payment reuses main.py's create_payment_or_receipt()
directly (deferred, function-local `import main`), the same reason
app/recurring_invoices.py calls create_invoice() that way: the settlement/
ledger logic is the delicate core of the accounting engine and is
deliberately left untouched here.
"""
import os
import re
import secrets
import urllib.parse
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.financial_policy import financial_policy_values
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.company_scope import current_company_id
from app.message_templates import get_effective_template
from app.sms_utils import send_sms, sms_configured
from app.telegram_utils import send_telegram_message, telegram_configured
from app.whatsapp_utils import send_whatsapp_message, whatsapp_configured

router = APIRouter(prefix="/api/payments", tags=["Online Payment Gateway"])

ZARINPAL_REQUEST_URL = "https://api.zarinpal.com/pg/v4/payment/request.json"
ZARINPAL_VERIFY_URL = "https://api.zarinpal.com/pg/v4/payment/verify.json"
ZARINPAL_STARTPAY_URL = "https://www.zarinpal.com/pg/StartPay/{authority}"


class PaymentSession(Base):
    __tablename__ = "payment_sessions"

    id = Column(Integer, primary_key=True, index=True)
    authority = Column(String, unique=True, nullable=False, index=True)
    invoice_id = Column(Integer, nullable=False)
    customer_id = Column(Integer, nullable=False)
    amount = Column(Float, nullable=False)
    provider = Column(String, nullable=False)
    status = Column(String, default="pending", nullable=False)  # pending / success / failed
    gateway_ref = Column(String, nullable=True)
    failure_reason = Column(String, nullable=True)
    payment_entry_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    company_id = Column(Integer, nullable=True)


PaymentSession.__table__.create(bind=engine, checkfirst=True)


class SimulatePayload(BaseModel):
    authority: str
    outcome: str  # "success" or "failure"


def _active_provider(company_id=None) -> str:
    """DB-configured provider (Settings > Payment Integrations, see
    app/payment_providers.py) takes priority over the env var - fully
    backward compatible for any deployment that only ever set
    VETRIX_PAYMENT_PROVIDER and never touched the new settings UI."""
    if company_id is not None:
        from app.payment_providers import get_enabled_provider

        configured = get_enabled_provider(company_id)
        if configured:
            return configured["provider_key"]

    provider = os.getenv("VETRIX_PAYMENT_PROVIDER", "").strip().lower()
    if not provider:
        raise HTTPException(status_code=503, detail="Online payment gateway is not configured")
    if provider not in {"sandbox", "zarinpal"}:
        raise HTTPException(status_code=503, detail=f"Unknown payment provider: {provider}")
    return provider


def _frontend_base() -> str:
    return os.getenv("VETRIX_FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _remaining_amount(db: Session, invoice: Invoice) -> float:
    import main  # deferred - see module docstring

    policy = financial_policy_values(db.connection(), invoice.company_id)
    settled = main.invoice_settled_amount(db, invoice, policy)
    return float(main.accounting_money(invoice.total_amount - settled, policy["decimal_places"], policy["rounding_mode"]))


def _create_session(db: Session, invoice: Invoice, provider: str) -> PaymentSession:
    remaining = _remaining_amount(db, invoice)
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Invoice is already fully paid")

    authority = secrets.token_urlsafe(24)
    session = PaymentSession(
        authority=authority,
        invoice_id=invoice.id,
        customer_id=invoice.customer_id,
        amount=remaining,
        provider=provider,
        status="pending",
        company_id=invoice.company_id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _zarinpal_merchant_id(company_id=None) -> str:
    if company_id is not None:
        from app.payment_providers import get_enabled_provider

        configured = get_enabled_provider(company_id, preferred_keys=("zarinpal",))
        if configured and configured.get("merchant_id"):
            return configured["merchant_id"]

    merchant_id = os.getenv("VETRIX_ZARINPAL_MERCHANT_ID", "").strip()
    if not merchant_id:
        raise HTTPException(status_code=503, detail="VETRIX_ZARINPAL_MERCHANT_ID is not configured")
    return merchant_id


def _zarinpal_request_payment(session: PaymentSession, description: str) -> str:
    merchant_id = _zarinpal_merchant_id(session.company_id)
    callback_url = f"{os.getenv('VETRIX_BACKEND_URL', 'http://localhost:8000').rstrip('/')}/api/payments/callback?authority={session.authority}"
    response = httpx.post(
        ZARINPAL_REQUEST_URL,
        json={
            "merchant_id": merchant_id,
            "amount": int(session.amount),
            "description": description,
            "callback_url": callback_url,
        },
        timeout=15,
    )
    response.raise_for_status()
    data = response.json().get("data") or {}
    if data.get("code") != 100:
        raise HTTPException(status_code=502, detail="Payment gateway rejected the request")
    zarinpal_authority = data["authority"]
    session.gateway_ref = zarinpal_authority
    return ZARINPAL_STARTPAY_URL.format(authority=zarinpal_authority)


def _zarinpal_verify(session: PaymentSession) -> bool:
    merchant_id = _zarinpal_merchant_id(session.company_id)
    response = httpx.post(
        ZARINPAL_VERIFY_URL,
        json={
            "merchant_id": merchant_id,
            "amount": int(session.amount),
            "authority": session.gateway_ref,
        },
        timeout=15,
    )
    response.raise_for_status()
    data = response.json().get("data") or {}
    if data.get("code") in (100, 101):
        session.gateway_ref = str(data.get("ref_id") or session.gateway_ref)
        return True
    return False


def _finalize_success(db: Session, session: PaymentSession):
    import main  # deferred - see module docstring

    result = main._create_payment_or_receipt_impl(main.PaymentCreate(
        customer_id=session.customer_id,
        amount=session.amount,
        transaction_type="receipt",
        method="online",
        invoice_id=session.invoice_id,
        note=f"Paid online via {session.provider} gateway",
    ), session.company_id)
    if result.get("status") != "created":
        raise HTTPException(status_code=502, detail=result.get("message", "Could not record the payment"))

    session.status = "success"
    session.payment_entry_id = result["entry_id"]
    session.completed_at = datetime.utcnow()
    db.commit()


def _finalize_failure(db: Session, session: PaymentSession, reason: str):
    session.status = "failed"
    session.failure_reason = reason[:500]
    session.completed_at = datetime.utcnow()
    db.commit()


def request_payment_for_invoice(invoice_id: int) -> dict:
    """Shared entry point for both the staff-facing and customer-portal
    routes; the caller is responsible for verifying the requester may act
    on this invoice before calling this."""
    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if invoice.invoice_type != "sale":
            raise HTTPException(status_code=400, detail="Only sale invoices can be paid online")

        provider = _active_provider(invoice.company_id)
        session = _create_session(db, invoice, provider)

        if provider == "sandbox":
            redirect_url = f"{_frontend_base()}/pay/{session.authority}"
        else:
            redirect_url = _zarinpal_request_payment(session, f"Invoice #{invoice.id}")
            db.commit()

        return {
            "status": "created",
            "authority": session.authority,
            "redirect_url": redirect_url,
            "amount": session.amount,
            "provider": provider,
        }
    finally:
        db.close()


def _customer_phone_digits(customer: Customer) -> str:
    raw = getattr(customer, "mobile", "") or getattr(customer, "phone", "") or ""
    return re.sub(r"\D", "", raw)


def _language_for_policy(policy: dict) -> str:
    country = str(policy.get("country_code") or "IR").upper()
    if country == "IR":
        return "fa"
    if country == "TR":
        return "tr"
    if country in {"SA", "AE", "EG", "IQ", "JO", "KW", "QA", "BH", "OM"}:
        return "ar"
    return "en"


def _build_payment_link_message(db: Session, invoice: Invoice, customer: Customer, amount: float, link: str) -> str:
    from app.settings_routes import AppSettings

    settings = db.query(AppSettings).filter(AppSettings.company_id == invoice.company_id).first()
    brand = (settings.company_name if settings else "") or "Vetrix ERP"
    policy = financial_policy_values(db.connection(), invoice.company_id)
    language = _language_for_policy(policy)
    template = get_effective_template(db.connection(), "invoice_payment_link", "message", language, invoice.company_id)
    return template["body"].format(name=customer.name, id=invoice.id, amount=f"{amount:,.0f}", link=link, brand=brand)


@router.get("/invoices/{invoice_id}/share")
def get_payment_share_link(invoice_id: int, request: Request):
    """Generates (or reuses the still-pending) online payment session for
    this invoice and returns a ready-to-send message: a secure, unguessable
    link (see PaymentSession.authority) plus WhatsApp/SMS-sendable text -
    the admin-facing side of 'let the customer pay directly, sent through
    any messenger or SMS' this endpoint exists for."""
    company_id = current_company_id(request)
    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
    finally:
        db.close()

    result = request_payment_for_invoice(invoice_id)

    db = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        message = _build_payment_link_message(db, invoice, customer, result["amount"], result["redirect_url"])
        phone = _customer_phone_digits(customer)
        return {
            "payment_url": result["redirect_url"],
            "amount": result["amount"],
            "provider": result["provider"],
            "message": message,
            "customer_phone": phone,
            "whatsapp_url": f"https://wa.me/{phone}?text={urllib.parse.quote(message)}" if phone else None,
            "sms_available": sms_configured(company_id),
            "telegram_available": telegram_configured(company_id) and bool(getattr(customer, "telegram_chat_id", "")),
            "whatsapp_auto_available": whatsapp_configured(company_id) and bool(phone),
        }
    finally:
        db.close()


@router.post("/invoices/{invoice_id}/send-sms")
def send_payment_link_sms(invoice_id: int, request: Request):
    company_id = current_company_id(request)
    share = get_payment_share_link(invoice_id, request)
    if not share["customer_phone"]:
        raise HTTPException(status_code=400, detail="This customer has no phone number on file")
    try:
        send_sms(company_id, share["customer_phone"], share["message"])
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error))
    return {"status": "sent"}


@router.post("/invoices/{invoice_id}/send-telegram")
def send_payment_link_telegram(invoice_id: int, request: Request):
    company_id = current_company_id(request)
    db: Session = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        chat_id = getattr(customer, "telegram_chat_id", "") if customer else ""
    finally:
        db.close()
    share = get_payment_share_link(invoice_id, request)
    try:
        send_telegram_message(company_id, chat_id, share["message"])
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error))
    return {"status": "sent"}


@router.post("/invoices/{invoice_id}/send-whatsapp-auto")
def send_payment_link_whatsapp_auto(invoice_id: int, request: Request):
    company_id = current_company_id(request)
    share = get_payment_share_link(invoice_id, request)
    if not share["customer_phone"]:
        raise HTTPException(status_code=400, detail="This customer has no phone number on file")
    try:
        send_whatsapp_message(company_id, share["customer_phone"], share["message"])
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error))
    return {"status": "sent"}


@router.post("/invoices/{invoice_id}/request")
def request_payment(invoice_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        if not db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == current_company_id(request)).first():
            raise HTTPException(status_code=404, detail="Invoice not found")
    finally:
        db.close()
    return request_payment_for_invoice(invoice_id)


# --- Public paths (static, no path params - see app/auth.py PUBLIC_PATHS,
# which matches by exact string; the authority identifying a session is
# passed as a query param or body field instead of a URL segment, the same
# convention app/catalog.py and app/customer_portal.py use elsewhere) ---


@router.get("/session")
def get_session(authority: str):
    db: Session = SessionLocal()
    try:
        session = db.query(PaymentSession).filter(PaymentSession.authority == authority).first()
        if not session:
            raise HTTPException(status_code=404, detail="Payment session not found")
        customer = db.query(Customer).filter(Customer.id == session.customer_id).first()
        return {
            "authority": session.authority,
            "invoice_id": session.invoice_id,
            "customer_name": customer.name if customer else "",
            "amount": session.amount,
            "provider": session.provider,
            "status": session.status,
        }
    finally:
        db.close()


@router.post("/session/simulate")
def simulate_payment(data: SimulatePayload):
    if data.outcome not in {"success", "failure"}:
        raise HTTPException(status_code=400, detail="outcome must be 'success' or 'failure'")
    db: Session = SessionLocal()
    try:
        session = db.query(PaymentSession).filter(PaymentSession.authority == data.authority).first()
        if not session:
            raise HTTPException(status_code=404, detail="Payment session not found")
        if session.provider != "sandbox":
            raise HTTPException(status_code=400, detail="Simulation is only available for the sandbox provider")
        if session.status != "pending":
            raise HTTPException(status_code=400, detail="This payment session has already been completed")

        if data.outcome == "success":
            session.gateway_ref = f"SANDBOX-{secrets.token_hex(6).upper()}"
            _finalize_success(db, session)
        else:
            _finalize_failure(db, session, "Simulated failure")
        return {"status": session.status}
    finally:
        db.close()


@router.get("/callback")
def gateway_callback(request: Request):
    authority = request.query_params.get("authority") or request.query_params.get("Authority")
    if not authority:
        raise HTTPException(status_code=400, detail="Missing authority")

    db: Session = SessionLocal()
    try:
        session = db.query(PaymentSession).filter(PaymentSession.authority == authority).first()
        if not session:
            raise HTTPException(status_code=404, detail="Payment session not found")
        if session.status != "pending":
            return _redirect_to_result(session)

        gateway_status = request.query_params.get("Status", "")
        if session.provider == "zarinpal" and gateway_status.upper() != "OK":
            _finalize_failure(db, session, f"Gateway status: {gateway_status or 'unknown'}")
            return _redirect_to_result(session)

        try:
            verified = _zarinpal_verify(session) if session.provider == "zarinpal" else session.status == "success"
        except HTTPException:
            raise
        except Exception as error:
            _finalize_failure(db, session, str(error))
            return _redirect_to_result(session)

        if verified:
            _finalize_success(db, session)
        else:
            _finalize_failure(db, session, "Gateway verification failed")
        return _redirect_to_result(session)
    finally:
        db.close()


def _redirect_to_result(session: PaymentSession):
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url=f"{_frontend_base()}/pay/{session.authority}")
