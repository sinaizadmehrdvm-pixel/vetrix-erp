"""Phase 1 payment-workflow core: atomic invoice+payment allocation,
derived settlement breakdown (confirmed vs. pending-cheque), and void/
refund of a posted allocation through the generic approval engine (see
app/approvals/engine.py). A 'cheque' leg does not settle the invoice
immediately - see app/accounting/treasury.py's create_invoice_cheque_leg,
called directly from main.py's _create_invoice_impl instead of
apply_settlement below.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.accounting.integrity import expected_settlement_type
from app.company_scope import current_company_id, ensure_company_id_column
from app.database import SessionLocal, engine

router = APIRouter(prefix="/api/invoice-payments", tags=["Invoice Payments"])


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS invoice_payment_allocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            entry_id INTEGER NOT NULL,
            transaction_type VARCHAR NOT NULL,
            method VARCHAR NOT NULL,
            amount REAL NOT NULL,
            reference_number VARCHAR DEFAULT '',
            account_or_cashbox VARCHAR DEFAULT '',
            cheque_id INTEGER,
            installment_plan_id INTEGER,
            installment_index INTEGER,
            collector_user_id INTEGER,
            branch_warehouse_id INTEGER,
            note VARCHAR DEFAULT '',
            attachment_path VARCHAR DEFAULT '',
            status VARCHAR NOT NULL DEFAULT 'active',
            void_reason VARCHAR DEFAULT '',
            voided_by INTEGER,
            voided_at VARCHAR,
            reversal_entry_id INTEGER,
            currency_code VARCHAR DEFAULT '',
            exchange_rate REAL,
            created_by INTEGER,
            created_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS invoice_installment_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            total_installments INTEGER NOT NULL,
            frequency VARCHAR NOT NULL DEFAULT 'monthly',
            created_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS invoice_installment_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            installment_index INTEGER NOT NULL,
            due_date VARCHAR NOT NULL,
            amount REAL NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            paid_allocation_id INTEGER,
            company_id INTEGER
        )
    """))
    ensure_company_id_column(conn, "invoice_payment_allocations")
    ensure_company_id_column(conn, "invoice_installment_plans")
    ensure_company_id_column(conn, "invoice_installment_schedule")


# --- Invoice-creation-time settlement (ORM path, shares the caller's Session) ---

def apply_settlement(db: Session, policy, customer, invoice, transaction_type, amount, method, note, allow_overpayment=False):
    """The one place 'money settled against an invoice' becomes ledger rows.
    Used by main.py's /transactions endpoint (via _create_payment_or_receipt_impl,
    now a thin wrapper) and by the atomic invoice+payment flow in
    _create_invoice_impl. Raises ValueError on any rule violation; the
    caller owns the db session/commit/rollback."""
    import main
    amount = float(main.accounting_money(amount, policy["decimal_places"], policy["rounding_mode"]))
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    if invoice is not None:
        if invoice.customer_id != customer.id:
            raise ValueError("این فاکتور متعلق به این طرف‌حساب نیست")
        expected_type = expected_settlement_type(invoice.invoice_type)
        if not expected_type:
            raise ValueError("Proforma invoices cannot receive settlement transactions")
        if transaction_type != expected_type:
            raise ValueError(f"{invoice.invoice_type} invoices require a {expected_type} transaction")
        remaining_before = float(main.accounting_money(
            invoice.total_amount - main.invoice_settled_amount(db, invoice, policy),
            policy["decimal_places"], policy["rounding_mode"],
        ))
        if amount > remaining_before and not allow_overpayment:
            raise ValueError(f"Transaction exceeds invoice remaining amount: {remaining_before}")
    description = "دریافت از طرف حساب" if transaction_type == "receipt" else "پرداخت به طرف حساب"
    if invoice is not None:
        description += f" - فاکتور شماره {invoice.id}"
    if note:
        description += f" - {note}"
    kwargs = {"credit": amount} if transaction_type == "receipt" else {"debit": amount}
    entry = main.add_customer_entry(db, customer.id, transaction_type, invoice.id if invoice else None, description, **kwargs)
    db.flush()
    main.post_transaction_to_general_ledger(db, entry, method, invoice, policy)
    return entry


def insert_payment_allocation(db: Session, invoice, entry_id, payment, transaction_type, created_by, company_id, cheque_id=None):
    conn = db.connection()
    _ensure_schema(conn)
    now = datetime.now(timezone.utc).isoformat()
    result = conn.execute(text("""
        INSERT INTO invoice_payment_allocations
          (invoice_id, entry_id, transaction_type, method, amount, reference_number,
           account_or_cashbox, cheque_id, installment_index, collector_user_id,
           branch_warehouse_id, note, status, created_by, created_at, company_id)
        VALUES
          (:invoice_id, :entry_id, :transaction_type, :method, :amount, :reference_number,
           :account_or_cashbox, :cheque_id, :installment_index, :collector_user_id,
           :branch_warehouse_id, :note, 'active', :created_by, :now, :company_id)
    """), {
        "invoice_id": invoice.id, "entry_id": entry_id,
        "transaction_type": transaction_type, "method": payment.method, "amount": payment.amount,
        "reference_number": payment.reference_number, "account_or_cashbox": payment.account_or_cashbox,
        "cheque_id": cheque_id, "installment_index": payment.installment_index,
        "collector_user_id": payment.collector_user_id, "branch_warehouse_id": payment.branch_warehouse_id,
        "note": payment.note, "created_by": created_by, "now": now, "company_id": company_id,
    })
    return result.lastrowid


def create_installment_schedule(db: Session, invoice, plan: dict, company_id: int):
    from datetime import timedelta
    conn = db.connection()
    _ensure_schema(conn)
    total_installments = int(plan.get("total_installments") or 0)
    if total_installments <= 0:
        raise ValueError("installment_plan.total_installments must be greater than zero")
    frequency = plan.get("frequency") or "monthly"
    step_days = {"weekly": 7, "monthly": 30, "custom": int(plan.get("interval_days") or 30)}.get(frequency, 30)
    first_due = plan.get("first_due_date") or datetime.utcnow().date().isoformat()
    first_due_date = datetime.fromisoformat(first_due[:10])
    per_installment = round(float(invoice.total_amount) / total_installments, 2)
    now = datetime.now(timezone.utc).isoformat()
    result = conn.execute(text("""
        INSERT INTO invoice_installment_plans (invoice_id, total_installments, frequency, created_at, company_id)
        VALUES (:invoice_id, :total, :frequency, :now, :company_id)
    """), {"invoice_id": invoice.id, "total": total_installments, "frequency": frequency, "now": now, "company_id": company_id})
    plan_id = result.lastrowid
    remaining = float(invoice.total_amount)
    for index in range(1, total_installments + 1):
        amount = per_installment if index < total_installments else round(remaining, 2)
        remaining -= amount
        due_date = (first_due_date + timedelta(days=step_days * (index - 1))).date().isoformat()
        conn.execute(text("""
            INSERT INTO invoice_installment_schedule (plan_id, installment_index, due_date, amount, status, company_id)
            VALUES (:plan_id, :index, :due_date, :amount, 'pending', :company_id)
        """), {"plan_id": plan_id, "index": index, "due_date": due_date, "amount": amount, "company_id": company_id})
    return plan_id


def invoice_settlement_breakdown(db: Session, invoice, policy) -> dict:
    """Distinguishes accounting status (payment_status: derived from
    confirmed settlement only) from collection status (whether the
    uncovered balance is fully covered by a still-pending cheque) - the
    two must never be collapsed into one figure, per the Phase 1
    requirement that a pending cheque not be reported as confirmed cash."""
    import main
    from sqlalchemy import text as _text
    from app.accounting.treasury import pending_cheque_amount_for_invoice
    total = float(invoice.total_amount or 0)
    confirmed_paid = main.invoice_settled_amount(db, invoice, policy)
    conn = db.connection()
    # Deliberately does NOT call treasury's _ensure_schema() here (that
    # performs an unconditional write even when there's nothing to update) -
    # see invoice_settled_amount()'s docstring in main.py for why that
    # deadlocks SQLite when this runs inside another open transaction.
    # treasury_cheques is guaranteed to exist by app startup; the existence
    # check only guards a brand-new/never-migrated database.
    table_exists = conn.execute(_text(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='treasury_cheques'"
    )).scalar()
    pending_cheque_amount = pending_cheque_amount_for_invoice(conn, invoice.id) if table_exists else 0
    uncovered_balance = max(round(total - confirmed_paid - pending_cheque_amount, 2), 0)
    if confirmed_paid >= total and total > 0:
        collection_status = "fully_settled"
    elif uncovered_balance <= 0 and pending_cheque_amount > 0:
        collection_status = "covered_by_pending_cheque"
    elif confirmed_paid > 0:
        collection_status = "partially_paid"
    else:
        collection_status = "unpaid"
    return {
        "total": total,
        "confirmed_paid": confirmed_paid,
        "pending_cheque_amount": pending_cheque_amount,
        "uncovered_balance": uncovered_balance,
        "collection_status": collection_status,
    }


# --- Void / refund, gated by the generic approval engine ---

def _allocation_row(conn, allocation_id, company_id):
    row = conn.execute(text("""
        SELECT * FROM invoice_payment_allocations WHERE id=:id AND company_id=:company_id
    """), {"id": allocation_id, "company_id": company_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Payment allocation not found")
    return dict(row)


def _auth(request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


class VoidRequestPayload(BaseModel):
    reason: str


@router.post("/{allocation_id}/void")
def request_void(allocation_id: int, payload: VoidRequestPayload, request: Request):
    from app.approvals.engine import create_request
    actor, role = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        allocation = _allocation_row(conn, allocation_id, company_id)
        if allocation["status"] != "active":
            raise HTTPException(status_code=409, detail="This payment allocation is not active")
        if allocation["cheque_id"]:
            cheque = conn.execute(text(
                "SELECT status FROM treasury_cheques WHERE id=:id"
            ), {"id": allocation["cheque_id"]}).mappings().first()
            if cheque and cheque["status"] == "cleared":
                raise HTTPException(status_code=409, detail="Cannot void a leg backed by a cleared cheque - issue a refund instead")
        result = create_request(
            conn, "invoice_payment_void", allocation_id, allocation["amount"],
            actor, role, payload.reason, company_id, request_obj=request,
        )
        return result


class RefundRequestPayload(BaseModel):
    reason: str
    amount: float
    method: str = "cash"


@router.post("/{allocation_id}/refund")
def request_refund(allocation_id: int, payload: RefundRequestPayload, request: Request):
    from app.approvals.engine import create_request
    import json
    actor, role = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        allocation = _allocation_row(conn, allocation_id, company_id)
        if allocation["status"] != "active":
            raise HTTPException(status_code=409, detail="This payment allocation is not active")
        if payload.amount <= 0 or payload.amount > allocation["amount"]:
            raise HTTPException(status_code=400, detail="Refund amount must be positive and not exceed the allocation amount")
        result = create_request(
            conn, "invoice_payment_refund", allocation_id, payload.amount,
            actor, role, payload.reason, company_id, request_obj=request,
            before_state=json.dumps({"refund_amount": payload.amount, "method": payload.method}),
        )
        return result


def _execute_void(allocation_id: int, decided_by: int, company_id: int) -> dict:
    """Approval-engine executor for resource_type='invoice_payment_void'.
    Opens its own session (see app/approvals/engine.py's EXECUTORS comment)
    and reuses the exact same ORM helpers the rest of the accounting system
    uses - never deletes the original allocation/entry, only reverses."""
    import main
    db: Session = SessionLocal()
    try:
        conn = db.connection()
        _ensure_schema(conn)
        allocation = conn.execute(text(
            "SELECT * FROM invoice_payment_allocations WHERE id=:id AND company_id=:company_id"
        ), {"id": allocation_id, "company_id": company_id}).mappings().first()
        if not allocation or allocation["status"] != "active":
            raise ValueError("Payment allocation is not active")
        invoice = db.query(main.Invoice).filter(main.Invoice.id == allocation["invoice_id"], main.Invoice.company_id == company_id).first()
        if not invoice:
            raise ValueError("Invoice not found")
        policy = main.financial_policy_values(conn, company_id)

        if allocation["cheque_id"]:
            from app.accounting.treasury import _transition_cheque
            _transition_cheque(conn, allocation["cheque_id"], "cancelled", datetime.utcnow().date(), "Voided from invoice payment panel", company_id)
        else:
            original_entry = db.query(main.AccountingEntry).filter(main.AccountingEntry.id == allocation["entry_id"]).first()
            if not original_entry:
                raise ValueError("Original ledger entry not found")
            amount = float(original_entry.credit or original_entry.debit or 0)
            reversal_kwargs = {"debit": amount} if allocation["transaction_type"] == "receipt" else {"credit": amount}
            reversal_entry = main.add_customer_entry(
                db, invoice.customer_id, allocation["transaction_type"], invoice.id,
                f"ابطال دریافت/پرداخت - فاکتور شماره {invoice.id}", **reversal_kwargs,
            )
            db.flush()
            main.post_transaction_to_general_ledger(db, reversal_entry, allocation["method"], invoice, policy)
            conn.execute(text("""
                UPDATE invoice_payment_allocations
                SET status='void', voided_by=:voided_by, voided_at=:now, reversal_entry_id=:reversal_id
                WHERE id=:id
            """), {"voided_by": decided_by, "now": datetime.now(timezone.utc).isoformat(), "reversal_id": reversal_entry.id, "id": allocation_id})

        main.sync_invoice_payment_status(db, invoice, policy)
        invoice.amount_paid = main.invoice_settled_amount(db, invoice, policy)
        db.commit()
        return {"allocation_id": allocation_id, "invoice_id": invoice.id, "payment_status": invoice.payment_status}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _execute_refund(allocation_id: int, decided_by: int, company_id: int) -> dict:
    """Approval-engine executor for resource_type='invoice_payment_refund'.
    Distinct from void: money is actually returned, so this posts a new
    opposite-direction settlement leg rather than a pure bookkeeping
    reversal; the original allocation stays 'active' (it did happen)."""
    import json
    import main
    db: Session = SessionLocal()
    try:
        conn = db.connection()
        _ensure_schema(conn)
        request_row = conn.execute(text("""
            SELECT before_state FROM approval_requests
            WHERE resource_type='invoice_payment_refund' AND resource_id=:id AND company_id=:company_id
            ORDER BY id DESC LIMIT 1
        """), {"id": allocation_id, "company_id": company_id}).mappings().first()
        refund_detail = json.loads(request_row["before_state"]) if request_row and request_row["before_state"] else {}
        refund_amount = float(refund_detail.get("refund_amount") or 0)
        refund_method = refund_detail.get("method") or "cash"

        allocation = conn.execute(text(
            "SELECT * FROM invoice_payment_allocations WHERE id=:id AND company_id=:company_id"
        ), {"id": allocation_id, "company_id": company_id}).mappings().first()
        if not allocation or allocation["status"] != "active":
            raise ValueError("Payment allocation is not active")
        invoice = db.query(main.Invoice).filter(main.Invoice.id == allocation["invoice_id"], main.Invoice.company_id == company_id).first()
        if not invoice:
            raise ValueError("Invoice not found")
        customer = db.query(main.Customer).filter(main.Customer.id == invoice.customer_id).first()
        policy = main.financial_policy_values(conn, company_id)

        opposite_type = "payment" if allocation["transaction_type"] == "receipt" else "receipt"
        entry = apply_settlement(
            db, policy, customer, invoice, opposite_type, refund_amount, refund_method,
            f"استرداد فاکتور شماره {invoice.id}", allow_overpayment=True,
        )
        db.flush()

        if refund_amount >= float(allocation["amount"]) - 0.005:
            invoice.payment_status = "refunded"
        main.sync_invoice_payment_status(db, invoice, policy) if invoice.payment_status != "refunded" else None
        invoice.amount_paid = main.invoice_settled_amount(db, invoice, policy)
        db.commit()
        return {"allocation_id": allocation_id, "invoice_id": invoice.id, "refund_entry_id": entry.id, "payment_status": invoice.payment_status}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _register_executors():
    from app.approvals.engine import register_executor
    register_executor("invoice_payment_void", _execute_void)
    register_executor("invoice_payment_refund", _execute_refund)


_register_executors()
