"""Field visits for the Visitor (ویزیتور) mobile module.

A "visit" is distinct from an invoice: a rep can visit a customer and log
"no order" just as validly as a visit that results in a sale. Orders placed
during a visit go through the existing POST /invoices flow (tagged
source="visitor" - see main.py's InvoiceCreate/_create_invoice_impl) rather
than a parallel invoice table here; this module only owns the visit record
itself.

Phase 2 (this revision) adds the three things that turn a bare visit log
into something resembling real Sales Force Automation (SFA) practice:

1. Check-in/check-out timestamps + duration - captured client-side at the
   actual moments they happen (the phone is often offline mid-visit, so a
   second network round-trip at check-in isn't reliable); the server only
   computes duration_seconds from the two timestamps it's given.
2. Geofence validation - if the customer has a registered latitude/
   longitude (app/models/customer.py), the check-in coordinates are
   compared against it (haversine distance) and flagged within_geofence,
   the same "was the rep actually there" signal real SFA tools use to
   catch desk-logged fake visits. Customers without coordinates simply
   get distance_meters/within_geofence = None - never a false negative.
3. Coverage/KPI aggregates (see /summary and /coverage below) - a bare
   visit log is not "scientific" on its own; the value is in the
   aggregate: conversion rate, average duration, and which customers are
   overdue for a visit.

Company-scoped throughout (see app/company_scope.py), following the same
pattern as every other business-data table. Non-admin/non-accountant
callers only see their own visits (rep_user_id == caller), mirroring
main.py's customer_scope_for_role restriction for GET /customers.
"""
import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.company_scope import current_company_id, ensure_company_id_column
from app.database import engine

router = APIRouter(prefix="/api/field-visits", tags=["Field Visits"])

# A real field-sales outcome taxonomy - "why no order" carries far more
# actionable signal for a manager than a bare yes/no, and is standard
# practice in SFA tools (distinguishes a stockout from a lost sale from a
# closed shop, each of which needs a different follow-up).
OUTCOMES = {
    "order_placed", "no_order_no_need", "no_order_price_objection",
    "no_order_out_of_stock", "customer_unavailable", "store_closed",
    "complaint_lodged", "information_only", "other",
}

DEFAULT_GEOFENCE_METERS = 300
DEFAULT_VISIT_FREQUENCY_DAYS = 30


def _now():
    return datetime.now(timezone.utc).isoformat()


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _haversine_meters(lat1, lon1, lat2, lon2):
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.asin(min(1, math.sqrt(a)))


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
    # Check-in/check-out + geofence columns, added via idempotent ALTER
    # since the base table predates this feature - same convention
    # app/accounting/treasury.py uses for its own post-launch columns.
    existing = {row[1] for row in conn.execute(text("PRAGMA table_info(field_visits)")).fetchall()}
    for column_name, column_sql in {
        "check_in_time": "check_in_time VARCHAR",
        "check_in_latitude": "check_in_latitude FLOAT",
        "check_in_longitude": "check_in_longitude FLOAT",
        "duration_seconds": "duration_seconds INTEGER",
        "distance_meters": "distance_meters FLOAT",
        "within_geofence": "within_geofence BOOLEAN",
    }.items():
        if column_name not in existing:
            conn.execute(text(f"ALTER TABLE field_visits ADD COLUMN {column_sql}"))


class VisitCreate(BaseModel):
    customer_id: int
    visit_time: str = ""
    outcome: str = "no_order_no_need"
    note: str = ""
    resulting_invoice_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    client_ref: str | None = Field(default=None, max_length=100)
    # Captured client-side at the moment the rep actually arrived, not when
    # the record happens to reach the server (which may be much later if
    # the device was offline) - see module docstring point 1.
    check_in_time: str | None = None
    check_in_latitude: float | None = None
    check_in_longitude: float | None = None


def _row_to_dict(row):
    return dict(row)


def _compute_derived(conn, company_id, customer_id, data: VisitCreate):
    """Duration from the two client-supplied timestamps, plus geofence
    distance against the customer's registered coordinates (if any).
    Never raises - a missing/malformed timestamp or missing customer
    coordinates just leaves the corresponding field as None."""
    duration_seconds = None
    if data.check_in_time and data.visit_time:
        try:
            start = datetime.fromisoformat(data.check_in_time.replace("Z", "+00:00"))
            end = datetime.fromisoformat(data.visit_time.replace("Z", "+00:00"))
            duration_seconds = max(0, int((end - start).total_seconds()))
        except ValueError:
            duration_seconds = None

    distance_meters = None
    within_geofence = None
    check_in_lat = data.check_in_latitude if data.check_in_latitude is not None else data.latitude
    check_in_lon = data.check_in_longitude if data.check_in_longitude is not None else data.longitude
    if check_in_lat is not None and check_in_lon is not None:
        customer_row = conn.execute(
            text("SELECT latitude, longitude FROM customers WHERE id=:id AND company_id=:company_id"),
            {"id": customer_id, "company_id": company_id},
        ).mappings().first()
        if customer_row and customer_row["latitude"] is not None and customer_row["longitude"] is not None:
            distance_meters = _haversine_meters(
                check_in_lat, check_in_lon, customer_row["latitude"], customer_row["longitude"]
            )
            within_geofence = distance_meters is not None and distance_meters <= DEFAULT_GEOFENCE_METERS

    return duration_seconds, distance_meters, within_geofence


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
        duration_seconds, distance_meters, within_geofence = _compute_derived(conn, company_id, data.customer_id, data)

        result = conn.execute(text("""
            INSERT INTO field_visits
              (rep_user_id, customer_id, visit_time, outcome, note,
               resulting_invoice_id, latitude, longitude, client_ref, created_at, company_id,
               check_in_time, check_in_latitude, check_in_longitude,
               duration_seconds, distance_meters, within_geofence)
            VALUES
              (:rep_user_id, :customer_id, :visit_time, :outcome, :note,
               :resulting_invoice_id, :latitude, :longitude, :client_ref, :created_at, :company_id,
               :check_in_time, :check_in_latitude, :check_in_longitude,
               :duration_seconds, :distance_meters, :within_geofence)
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
            "check_in_time": data.check_in_time,
            "check_in_latitude": data.check_in_latitude,
            "check_in_longitude": data.check_in_longitude,
            "duration_seconds": duration_seconds,
            "distance_meters": distance_meters,
            "within_geofence": within_geofence,
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


@router.get("/summary")
def visit_summary(request: Request, scope: str = "self"):
    """KPI strip for the Visitor home screen: visits/orders today and this
    week, conversion rate, average visit duration. scope='team' (managers
    only) aggregates every rep in the company instead of just the caller."""
    user_id, role = _auth(request)
    company_id = current_company_id(request)
    team_scope = scope == "team" and role in {"admin", "accountant"}

    today = datetime.now(timezone.utc).date()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    today_iso = today.isoformat()

    with engine.begin() as conn:
        _ensure_schema(conn)
        where = ["company_id=:company_id"]
        params = {"company_id": company_id, "today": today_iso, "week_start": week_start}
        if not team_scope:
            where.append("rep_user_id=:rep_user_id")
            params["rep_user_id"] = user_id
        base_where = " AND ".join(where)

        today_stats = conn.execute(text(f"""
            SELECT COUNT(*) visits, SUM(CASE WHEN outcome='order_placed' THEN 1 ELSE 0 END) orders,
                   AVG(duration_seconds) avg_duration
            FROM field_visits WHERE {base_where} AND visit_time>=:today
        """), params).mappings().one()

        week_stats = conn.execute(text(f"""
            SELECT COUNT(*) visits, SUM(CASE WHEN outcome='order_placed' THEN 1 ELSE 0 END) orders,
                   AVG(duration_seconds) avg_duration,
                   COUNT(DISTINCT customer_id) distinct_customers
            FROM field_visits WHERE {base_where} AND visit_time>=:week_start
        """), params).mappings().one()

        def _pack(stats):
            visits = int(stats["visits"] or 0)
            orders = int(stats["orders"] or 0)
            return {
                "visits": visits,
                "orders": orders,
                "conversion_rate": round((orders / visits) * 100, 1) if visits else 0,
                "avg_duration_minutes": round((stats["avg_duration"] or 0) / 60, 1),
            }

        return {
            "today": _pack(today_stats),
            "this_week": {**_pack(week_stats), "distinct_customers": int(week_stats["distinct_customers"] or 0)},
            "scope": "team" if team_scope else "self",
        }


@router.get("/coverage")
def visit_coverage(request: Request, visit_frequency_days: int = DEFAULT_VISIT_FREQUENCY_DAYS):
    """Per-assigned-customer 'days since last visit' + overdue flag, so the
    rep's customer list can surface who actually needs a visit instead of
    just listing everyone in a fixed order - the coverage/frequency
    discipline real field-sales route planning is built around."""
    user_id, role = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        if role in {"admin", "accountant"}:
            customers = conn.execute(text("""
                SELECT id FROM customers WHERE company_id=:company_id
            """), {"company_id": company_id}).mappings().all()
        else:
            customers = conn.execute(text("""
                SELECT id FROM customers WHERE company_id=:company_id AND assigned_rep_id=:rep_user_id
            """), {"company_id": company_id, "rep_user_id": user_id}).mappings().all()

        last_visits = {
            row["customer_id"]: row["last_visit_at"]
            for row in conn.execute(text("""
                SELECT customer_id, MAX(visit_time) last_visit_at
                FROM field_visits WHERE company_id=:company_id
                GROUP BY customer_id
            """), {"company_id": company_id}).mappings().all()
        }

    now = datetime.now(timezone.utc)
    result = []
    for row in customers:
        last_visit_at = last_visits.get(row["id"])
        days_since = None
        if last_visit_at:
            try:
                parsed = datetime.fromisoformat(str(last_visit_at).replace("Z", "+00:00"))
                days_since = (now - parsed).days
            except ValueError:
                days_since = None
        result.append({
            "customer_id": row["id"],
            "last_visit_at": last_visit_at,
            "days_since_last_visit": days_since,
            "overdue": days_since is None or days_since >= visit_frequency_days,
        })
    return {"items": result, "visit_frequency_days": visit_frequency_days}
