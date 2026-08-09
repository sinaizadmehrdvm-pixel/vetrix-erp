"""Field visits for the Visitor (ویزیتور) mobile module.

A "visit" is distinct from an invoice: a rep can visit a customer and log
"no order" just as validly as a visit that results in a sale. Orders placed
during a visit go through the existing POST /invoices flow (tagged
source="visitor" - see main.py's InvoiceCreate/_create_invoice_impl) rather
than a parallel invoice table here; this module only owns the visit record
itself.

Company-scoped throughout (see app/company_scope.py), following the same
pattern as every other business-data table. Non-admin/non-accountant
callers only see their own visits (rep_user_id == caller), mirroring
main.py's customer_scope_for_role restriction for GET /customers.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import engine

router = APIRouter(prefix="/api/field-visits", tags=["Field Visits"])

OUTCOMES = {"order_placed", "no_order", "closed", "other"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS field_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rep_user_id INTEGER NOT NULL,
            customer_id INTEGER NOT NULL,
            visit_time VARCHAR NOT NULL,
            outcome VARCHAR NOT NULL,
            note TEXT DEFAULT '',
            resulting_invoice_id INTEGER,
            latitude FLOAT,
            longitude FLOAT,
            client_ref VARCHAR,
            created_at VARCHAR NOT NULL
        )
    """))
    ensure_company_id_column(conn, "field_visits")
    # client_ref lets an offline-queued visit be retried safely: if the
    # device sends the same client-generated reference twice (e.g. the
    # server's response was lost after it actually committed), the second
    # POST returns the already-created row instead of duplicating it. Partial
    # index (WHERE client_ref IS NOT NULL) since older/manual rows may have
    # none.
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_field_visits_company_client_ref
        ON field_visits(company_id, client_ref)
        WHERE client_ref IS NOT NULL
    """))


class VisitCreate(BaseModel):
    customer_id: int
    visit_time: str = ""
    outcome: str = "no_order"
    note: str = ""
    resulting_invoice_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    client_ref: str | None = Field(default=None, max_length=100)


def _row_to_dict(row):
    return dict(row)


@router.post("")
def create_visit(data: VisitCreate, request: Request):
    user_id, _role = _auth(request)
    company_id = current_company_id(request)
    if data.outcome not in OUTCOMES:
        raise HTTPException(status_code=400, detail=f"outcome must be one of: {', '.join(sorted(OUTCOMES))}")

    with engine.begin() as conn:
        _ensure_schema(conn)

        customer = conn.execute(
            text("SELECT id FROM customers WHERE id=:id AND company_id=:company_id"),
            {"id": data.customer_id, "company_id": company_id},
        ).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

        if data.resulting_invoice_id is not None:
            invoice = conn.execute(
                text("SELECT id FROM invoices WHERE id=:id AND company_id=:company_id"),
                {"id": data.resulting_invoice_id, "company_id": company_id},
            ).first()
            if not invoice:
                raise HTTPException(status_code=404, detail="Invoice not found")

        if data.client_ref:
            existing = conn.execute(text("""
                SELECT * FROM field_visits WHERE company_id=:company_id AND client_ref=:client_ref
            """), {"company_id": company_id, "client_ref": data.client_ref}).mappings().first()
            if existing:
                return {"status": "already_recorded", "visit": _row_to_dict(existing)}

        now = _now()
        result = conn.execute(text("""
            INSERT INTO field_visits
              (rep_user_id, customer_id, visit_time, outcome, note,
               resulting_invoice_id, latitude, longitude, client_ref, created_at, company_id)
            VALUES
              (:rep_user_id, :customer_id, :visit_time, :outcome, :note,
               :resulting_invoice_id, :latitude, :longitude, :client_ref, :created_at, :company_id)
        """), {
            "rep_user_id": user_id,
            "customer_id": data.customer_id,
            "visit_time": data.visit_time or now,
            "outcome": data.outcome,
            "note": data.note.strip(),
            "resulting_invoice_id": data.resulting_invoice_id,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "client_ref": data.client_ref,
            "created_at": now,
            "company_id": company_id,
        })
        visit = conn.execute(
            text("SELECT * FROM field_visits WHERE id=:id"), {"id": result.lastrowid}
        ).mappings().first()
        return {"status": "created", "visit": _row_to_dict(visit)}


@router.get("")
def list_visits(
    request: Request,
    customer_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
):
    user_id, role = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        where = ["v.company_id=:company_id"]
        params = {"company_id": company_id}

        if role not in {"admin", "accountant"}:
            where.append("v.rep_user_id=:rep_user_id")
            params["rep_user_id"] = user_id
        if customer_id is not None:
            where.append("v.customer_id=:customer_id")
            params["customer_id"] = customer_id
        if from_date:
            where.append("v.visit_time>=:from_date")
            params["from_date"] = from_date
        if to_date:
            where.append("v.visit_time<=:to_date")
            params["to_date"] = to_date

        rows = conn.execute(text(f"""
            SELECT v.*, c.name AS customer_name, u.full_name AS rep_name
            FROM field_visits v
            LEFT JOIN customers c ON c.id=v.customer_id
            LEFT JOIN users u ON u.id=v.rep_user_id
            WHERE {' AND '.join(where)}
            ORDER BY v.visit_time DESC, v.id DESC
        """), params).mappings().all()
        return [_row_to_dict(row) for row in rows]
