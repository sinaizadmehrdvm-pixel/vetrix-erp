from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.database import SessionLocal, engine
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.accounting_entry import AccountingEntry

router = APIRouter(tags=["Enterprise CRM"])


class LeadCreate(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    source: str = "manual"
    status: str = "new"
    value: float = 0
    owner: str = ""
    note: str = ""


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    value: Optional[float] = None
    owner: Optional[str] = None
    note: Optional[str] = None


class OpportunityCreate(BaseModel):
    title: str
    customer_id: Optional[int] = None
    lead_id: Optional[int] = None
    stage: str = "new"
    value: float = 0
    probability: float = 20
    owner: str = ""
    expected_close: str = ""
    note: str = ""


class FollowupCreate(BaseModel):
    customer_id: Optional[int] = None
    lead_id: Optional[int] = None
    title: str
    due_date: str = ""
    priority: str = "normal"
    channel: str = "call"
    note: str = ""


PIPELINE_STAGES = [
    ("new", "سرنخ جدید"),
    ("contacted", "تماس اولیه"),
    ("meeting", "جلسه"),
    ("proposal", "پیش‌فاکتور"),
    ("negotiation", "مذاکره"),
    ("won", "برنده"),
    ("lost", "از دست رفته"),
]


def _now() -> str:
    return datetime.utcnow().isoformat()


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def ensure_enterprise_crm_tables() -> None:
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL,
                phone VARCHAR,
                email VARCHAR,
                source VARCHAR DEFAULT 'manual',
                status VARCHAR DEFAULT 'new',
                value FLOAT DEFAULT 0,
                owner VARCHAR,
                note TEXT,
                converted_customer_id INTEGER,
                created_at VARCHAR,
                updated_at VARCHAR
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_opportunities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR NOT NULL,
                customer_id INTEGER,
                lead_id INTEGER,
                stage VARCHAR DEFAULT 'new',
                value FLOAT DEFAULT 0,
                probability FLOAT DEFAULT 20,
                owner VARCHAR,
                expected_close VARCHAR,
                note TEXT,
                created_at VARCHAR,
                updated_at VARCHAR
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_followups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER,
                lead_id INTEGER,
                title VARCHAR NOT NULL,
                due_date VARCHAR,
                priority VARCHAR DEFAULT 'normal',
                channel VARCHAR DEFAULT 'call',
                done INTEGER DEFAULT 0,
                note TEXT,
                created_at VARCHAR,
                updated_at VARCHAR
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER,
                lead_id INTEGER,
                interaction_type VARCHAR DEFAULT 'note',
                title VARCHAR,
                description TEXT,
                created_at VARCHAR
            )
        """))
        conn.commit()


ensure_enterprise_crm_tables()


def _rows(sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result.fetchall()]


def _one(sql: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    rows = _rows(sql, params)
    return rows[0] if rows else None


def _execute(sql: str, params: Optional[Dict[str, Any]] = None) -> int:
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        conn.commit()
        try:
            return int(result.lastrowid or 0)
        except Exception:
            return 0


def _customer_metrics(customer_id: int) -> Dict[str, Any]:
    db = SessionLocal()
    try:
        invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id).all()
        entries = db.query(AccountingEntry).filter(AccountingEntry.customer_id == customer_id).all()
        sales = [i for i in invoices if str(i.invoice_type or "") == "sale"]
        purchases = [i for i in invoices if str(i.invoice_type or "") == "buy"]
        total_sales = sum(_safe_float(i.total_amount) for i in sales)
        total_purchases = sum(_safe_float(i.total_amount) for i in purchases)
        debit = sum(_safe_float(e.debit) for e in entries)
        credit = sum(_safe_float(e.credit) for e in entries)
        balance = debit - credit
        last_invoice_date = None
        if invoices:
            dates = [i.created_at for i in invoices if i.created_at]
            last_invoice_date = max(dates) if dates else None
        days_since_purchase = 999
        if last_invoice_date:
            if isinstance(last_invoice_date, str):
                try:
                    last_invoice_date = datetime.fromisoformat(last_invoice_date.replace("Z", ""))
                except Exception:
                    last_invoice_date = datetime.utcnow()
            days_since_purchase = max((datetime.utcnow() - last_invoice_date).days, 0)
        return {
            "invoice_count": len(invoices),
            "sales_count": len(sales),
            "purchase_count": len(purchases),
            "total_sales": total_sales,
            "total_purchases": total_purchases,
            "balance": balance,
            "last_invoice_date": last_invoice_date.isoformat() if hasattr(last_invoice_date, "isoformat") else last_invoice_date,
            "days_since_purchase": days_since_purchase,
        }
    finally:
        db.close()


def _score_customer(customer: Customer) -> Dict[str, Any]:
    m = _customer_metrics(customer.id)
    score = 25
    score += min(m["total_sales"] / 100000, 35)
    score += min(m["sales_count"] * 5, 20)
    if m["days_since_purchase"] <= 30:
        score += 15
    elif m["days_since_purchase"] <= 90:
        score += 7
    if m["balance"] > 0:
        score -= min(m["balance"] / 100000, 20)
    score = max(0, min(100, round(score)))
    if score >= 85:
        segment = "VIP"
    elif score >= 70:
        segment = "طلایی"
    elif score >= 50:
        segment = "نقره‌ای"
    elif m["days_since_purchase"] > 90:
        segment = "در خطر"
    else:
        segment = "معمولی"
    churn_risk = 15
    if m["days_since_purchase"] > 120:
        churn_risk = 90
    elif m["days_since_purchase"] > 60:
        churn_risk = 65
    elif m["days_since_purchase"] > 30:
        churn_risk = 35
    if m["balance"] > 0:
        churn_risk = min(100, churn_risk + 10)
    return {
        "customer_id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "score": score,
        "segment": segment,
        "churn_risk": churn_risk,
        "ltv": m["total_sales"],
        "balance": m["balance"],
        "days_since_purchase": m["days_since_purchase"],
        "sales_count": m["sales_count"],
        "recommendation": _customer_recommendation(segment, churn_risk, m),
    }


def _customer_recommendation(segment: str, churn_risk: float, m: Dict[str, Any]) -> str:
    if churn_risk >= 70:
        return "تماس فوری و پیشنهاد خرید مجدد ثبت شود."
    if m["balance"] > 0:
        return "برای وصول مطالبات پیگیری نرم و مرحله‌ای انجام شود."
    if segment in ["VIP", "طلایی"]:
        return "پیشنهاد ویژه یا باشگاه مشتریان برای حفظ وفاداری ارسال شود."
    if m["sales_count"] == 0:
        return "اولین پیشنهاد فروش و معرفی محصولات پرفروش ارسال شود."
    return "پیگیری دوره‌ای و پیشنهاد محصول مکمل انجام شود."


@router.get("/overview")
def enterprise_crm_overview():
    db = SessionLocal()
    try:
        customers = db.query(Customer).all()
        scores = [_score_customer(c) for c in customers]
        vip = [s for s in scores if s["segment"] in ["VIP", "طلایی"]]
        risk = [s for s in scores if s["churn_risk"] >= 60]
        debtors = [s for s in scores if s["balance"] > 0]
        leads = _rows("SELECT * FROM crm_leads ORDER BY id DESC LIMIT 50")
        opportunities = _rows("SELECT * FROM crm_opportunities ORDER BY id DESC LIMIT 100")
        followups = _rows("SELECT * FROM crm_followups WHERE done = 0 ORDER BY due_date ASC, id DESC LIMIT 30")
        stages = []
        for key, label in PIPELINE_STAGES:
            stage_items = [o for o in opportunities if str(o.get("stage") or "new") == key]
            stages.append({
                "key": key,
                "label": label,
                "count": len(stage_items),
                "value": sum(_safe_float(o.get("value")) for o in stage_items),
                "items": stage_items,
            })
        suggestions = []
        for item in sorted(risk, key=lambda x: x["churn_risk"], reverse=True)[:5]:
            suggestions.append({
                "type": "churn_risk",
                "title": f"ریسک ریزش {item['name']}",
                "message": item["recommendation"],
                "priority": "high",
            })
        for item in sorted(debtors, key=lambda x: x["balance"], reverse=True)[:5]:
            suggestions.append({
                "type": "collection",
                "title": f"مطالبه از {item['name']}",
                "message": f"مانده حساب حدود {item['balance']:,.0f} است؛ پیگیری وصول ثبت شود.",
                "priority": "medium",
            })
        return {
            "summary": {
                "customers_count": len(customers),
                "vip_count": len(vip),
                "risk_count": len(risk),
                "debtors_count": len(debtors),
                "leads_count": len(leads),
                "open_followups": len(followups),
                "pipeline_value": sum(_safe_float(o.get("value")) for o in opportunities if str(o.get("stage")) not in ["lost"]),
            },
            "customer_scores": sorted(scores, key=lambda x: x["score"], reverse=True),
            "risk_customers": sorted(risk, key=lambda x: x["churn_risk"], reverse=True),
            "pipeline_stages": stages,
            "leads": leads,
            "followups": followups,
            "ai_suggestions": suggestions,
        }
    finally:
        db.close()


@router.get("/customers/{customer_id}/score")
def customer_score(customer_id: int):
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        return _score_customer(customer)
    finally:
        db.close()


@router.get("/customers/{customer_id}/timeline")
def customer_timeline(customer_id: int):
    invoices = _rows("SELECT id, invoice_type, total_amount, payment_status, created_at FROM invoices WHERE customer_id=:cid ORDER BY id DESC LIMIT 50", {"cid": customer_id})
    entries = _rows("SELECT id, source_type, description, debit, credit, created_at FROM accounting_entries WHERE customer_id=:cid ORDER BY id DESC LIMIT 50", {"cid": customer_id})
    interactions = _rows("SELECT id, interaction_type, title, description, created_at FROM crm_interactions WHERE customer_id=:cid ORDER BY id DESC LIMIT 50", {"cid": customer_id})
    events = []
    for inv in invoices:
        events.append({"type": "invoice", "title": f"فاکتور #{inv['id']}", "amount": inv.get("total_amount"), "date": inv.get("created_at"), "data": inv})
    for ent in entries:
        events.append({"type": "accounting", "title": ent.get("description"), "amount": _safe_float(ent.get("debit")) or _safe_float(ent.get("credit")), "date": ent.get("created_at"), "data": ent})
    for it in interactions:
        events.append({"type": it.get("interaction_type"), "title": it.get("title"), "date": it.get("created_at"), "data": it})
    events.sort(key=lambda x: str(x.get("date") or ""), reverse=True)
    return {"items": events[:100]}


@router.get("/leads")
def list_leads():
    return _rows("SELECT * FROM crm_leads ORDER BY id DESC")


@router.post("/leads")
def create_lead(data: LeadCreate):
    now = _now()
    lead_id = _execute(
        """INSERT INTO crm_leads (name, phone, email, source, status, value, owner, note, created_at, updated_at)
           VALUES (:name, :phone, :email, :source, :status, :value, :owner, :note, :created_at, :updated_at)""",
        {**data.dict(), "created_at": now, "updated_at": now},
    )
    return {"success": True, "id": lead_id}


@router.put("/leads/{lead_id}")
def update_lead(lead_id: int, data: LeadUpdate):
    current = _one("SELECT * FROM crm_leads WHERE id=:id", {"id": lead_id})
    if not current:
        raise HTTPException(status_code=404, detail="Lead not found")
    patch = {k: v for k, v in data.dict().items() if v is not None}
    if not patch:
        return {"success": True}
    patch["updated_at"] = _now()
    set_sql = ", ".join([f"{k}=:{k}" for k in patch.keys()])
    patch["id"] = lead_id
    _execute(f"UPDATE crm_leads SET {set_sql} WHERE id=:id", patch)
    return {"success": True}


@router.delete("/leads/{lead_id}")
def delete_lead(lead_id: int):
    _execute("DELETE FROM crm_leads WHERE id=:id", {"id": lead_id})
    return {"success": True}


@router.get("/opportunities")
def list_opportunities():
    return _rows("SELECT * FROM crm_opportunities ORDER BY id DESC")


@router.post("/opportunities")
def create_opportunity(data: OpportunityCreate):
    now = _now()
    oid = _execute(
        """INSERT INTO crm_opportunities (title, customer_id, lead_id, stage, value, probability, owner, expected_close, note, created_at, updated_at)
           VALUES (:title, :customer_id, :lead_id, :stage, :value, :probability, :owner, :expected_close, :note, :created_at, :updated_at)""",
        {**data.dict(), "created_at": now, "updated_at": now},
    )
    return {"success": True, "id": oid}


@router.put("/opportunities/{opportunity_id}/stage")
def update_opportunity_stage(opportunity_id: int, payload: Dict[str, str]):
    stage = payload.get("stage") or "new"
    if stage not in [x[0] for x in PIPELINE_STAGES]:
        raise HTTPException(status_code=400, detail="Invalid stage")
    _execute("UPDATE crm_opportunities SET stage=:stage, updated_at=:updated_at WHERE id=:id", {"stage": stage, "updated_at": _now(), "id": opportunity_id})
    return {"success": True}


@router.delete("/opportunities/{opportunity_id}")
def delete_opportunity(opportunity_id: int):
    _execute("DELETE FROM crm_opportunities WHERE id=:id", {"id": opportunity_id})
    return {"success": True}


@router.get("/followups")
def list_followups():
    return _rows("SELECT * FROM crm_followups ORDER BY done ASC, due_date ASC, id DESC")


@router.post("/followups")
def create_followup(data: FollowupCreate):
    now = _now()
    fid = _execute(
        """INSERT INTO crm_followups (customer_id, lead_id, title, due_date, priority, channel, note, created_at, updated_at)
           VALUES (:customer_id, :lead_id, :title, :due_date, :priority, :channel, :note, :created_at, :updated_at)""",
        {**data.dict(), "created_at": now, "updated_at": now},
    )
    return {"success": True, "id": fid}


@router.put("/followups/{followup_id}/done")
def mark_followup_done(followup_id: int):
    _execute("UPDATE crm_followups SET done=1, updated_at=:updated_at WHERE id=:id", {"updated_at": _now(), "id": followup_id})
    return {"success": True}


@router.delete("/followups/{followup_id}")
def delete_followup(followup_id: int):
    _execute("DELETE FROM crm_followups WHERE id=:id", {"id": followup_id})
    return {"success": True}
