
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text
from datetime import datetime
from app.database import engine, SessionLocal
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.accounting_entry import AccountingEntry

router = APIRouter()

def _safe_float(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0

def _dt(v):
    if not v:
        return None
    try:
        return v.isoformat()
    except Exception:
        return str(v)

def _ensure_crm_tables():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                note_type VARCHAR DEFAULT 'note',
                title VARCHAR DEFAULT '',
                text TEXT DEFAULT '',
                tags VARCHAR DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                title VARCHAR NOT NULL,
                description TEXT DEFAULT '',
                due_date VARCHAR DEFAULT '',
                status VARCHAR DEFAULT 'open',
                priority VARCHAR DEFAULT 'normal',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at VARCHAR DEFAULT ''
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                interaction_type VARCHAR DEFAULT 'call',
                title VARCHAR DEFAULT '',
                description TEXT DEFAULT '',
                result VARCHAR DEFAULT '',
                next_followup VARCHAR DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS customer_loyalty (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL UNIQUE,
                points FLOAT DEFAULT 0,
                redeemed_points FLOAT DEFAULT 0,
                gift_credit FLOAT DEFAULT 0,
                total_spent FLOAT DEFAULT 0,
                level VARCHAR DEFAULT 'Bronze',
                discount_percent FLOAT DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()

_ensure_crm_tables()

class CrmNoteCreate(BaseModel):
    title: str = ""
    text: str = ""
    note_type: str = "note"
    tags: str = ""

class CrmTaskCreate(BaseModel):
    title: str
    description: str = ""
    due_date: str = ""
    status: str = "open"
    priority: str = "normal"

class CrmTaskUpdate(BaseModel):
    title: str = ""
    description: str = ""
    due_date: str = ""
    status: str = "open"
    priority: str = "normal"

class CrmInteractionCreate(BaseModel):
    interaction_type: str = "call"
    title: str = ""
    description: str = ""
    result: str = ""
    next_followup: str = ""

class LoyaltyRedeemRequest(BaseModel):
    points: float
    note: str = ""

def _loyalty_level(total_spent):
    if total_spent >= 500000000:
        return "VIP"
    if total_spent >= 200000000:
        return "Platinum"
    if total_spent >= 80000000:
        return "Gold"
    if total_spent >= 25000000:
        return "Silver"
    return "Bronze"

def _discount_for_level(level):
    return {"Bronze": 0, "Silver": 2, "Gold": 4, "Platinum": 6, "VIP": 8}.get(level or "Bronze", 0)

def _points_for_amount(amount):
    return round(_safe_float(amount) * 0.01, 2)

def _customer_balance(db, customer_id):
    entries = db.query(AccountingEntry).filter(AccountingEntry.customer_id == customer_id).all()
    return sum(_safe_float(e.debit) - _safe_float(e.credit) for e in entries)

def _invoice_stats(db, customer_id):
    invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id).all()
    sales = [i for i in invoices if getattr(i, "invoice_type", "") == "sale"]
    buys = [i for i in invoices if getattr(i, "invoice_type", "") == "buy"]
    open_items = [i for i in invoices if getattr(i, "payment_status", "") != "paid"]
    last = sorted(invoices, key=lambda x: getattr(x, "created_at", None) or datetime.min, reverse=True)[0] if invoices else None
    return {
        "invoices": invoices,
        "invoice_count": len(invoices),
        "sales_count": len(sales),
        "purchase_count": len(buys),
        "open_invoice_count": len(open_items),
        "total_sales": sum(_safe_float(i.total_amount) for i in sales),
        "total_purchases": sum(_safe_float(i.total_amount) for i in buys),
        "open_amount": sum(_safe_float(i.total_amount) for i in open_items),
        "last_invoice": last,
    }

def _sync_loyalty(customer_id, total_spent):
    level = _loyalty_level(total_spent)
    discount = _discount_for_level(level)
    calculated_points = _points_for_amount(total_spent)
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM customer_loyalty WHERE customer_id=:cid"), {"cid": customer_id}).mappings().first()
        if row:
            redeemed = _safe_float(row.get("redeemed_points"))
            gift = _safe_float(row.get("gift_credit"))
            available = max(calculated_points - redeemed, 0)
            conn.execute(text("""
                UPDATE customer_loyalty
                SET points=:points,total_spent=:total_spent,level=:level,discount_percent=:discount,gift_credit=:gift,last_updated=:updated
                WHERE customer_id=:cid
            """), {"cid": customer_id, "points": available, "total_spent": total_spent, "level": level, "discount": discount, "gift": gift, "updated": datetime.utcnow()})
        else:
            conn.execute(text("""
                INSERT INTO customer_loyalty (customer_id,points,redeemed_points,gift_credit,total_spent,level,discount_percent,last_updated)
                VALUES (:cid,:points,0,0,:total_spent,:level,:discount,:updated)
            """), {"cid": customer_id, "points": calculated_points, "total_spent": total_spent, "level": level, "discount": discount, "updated": datetime.utcnow()})
        conn.commit()
        final_row = conn.execute(text("SELECT * FROM customer_loyalty WHERE customer_id=:cid"), {"cid": customer_id}).mappings().first()
        return dict(final_row)

def _profile(db, customer):
    balance = _customer_balance(db, customer.id)
    stats = _invoice_stats(db, customer.id)
    loyalty = _sync_loyalty(customer.id, stats["total_sales"])
    credit_limit = _safe_float(getattr(customer, "credit_limit", 0))
    with engine.connect() as conn:
        notes_count = conn.execute(text("SELECT COUNT(*) FROM crm_notes WHERE customer_id=:cid"), {"cid": customer.id}).scalar() or 0
        open_tasks = conn.execute(text("SELECT COUNT(*) FROM crm_tasks WHERE customer_id=:cid AND status!='done'"), {"cid": customer.id}).scalar() or 0

    score = 45 + min(22, stats["total_sales"] / 10000000) + min(15, stats["invoice_count"] * 2)
    score += 8 if balance <= 0 else -min(22, balance / 10000000)
    if credit_limit > 0 and balance > credit_limit:
        score -= 16
    if getattr(customer, "phone", ""):
        score += 4
    if getattr(customer, "email", ""):
        score += 3
    if notes_count:
        score += min(5, notes_count)
    if open_tasks:
        score -= min(8, open_tasks * 2)
    if loyalty.get("level") in ["VIP", "Platinum"]:
        score += 8
    score = max(0, min(100, round(score)))

    risk = "critical" if credit_limit > 0 and balance > credit_limit else "high" if balance > 0 and score < 45 else "medium" if balance > 0 else "low"
    crm_level = "vip" if score >= 88 else "gold" if score >= 70 else "followup" if balance > 0 else "normal"
    credit_usage = 0 if credit_limit <= 0 or balance <= 0 else min(100, round((balance / credit_limit) * 100, 1))

    return {
        "id": customer.id,
        "name": customer.name,
        "phone": getattr(customer, "phone", "") or "",
        "mobile": getattr(customer, "mobile", "") or "",
        "email": getattr(customer, "email", "") or "",
        "address": getattr(customer, "address", "") or "",
        "city": getattr(customer, "city", "") or "",
        "customer_type": getattr(customer, "customer_type", "customer") or "customer",
        "credit_limit": credit_limit,
        "created_at": _dt(getattr(customer, "created_at", None)),
        "balance": balance,
        "debit": balance if balance > 0 else 0,
        "credit": abs(balance) if balance < 0 else 0,
        "debt": balance if balance > 0 else 0,
        "total_sales": stats["total_sales"],
        "total_purchase": stats["total_sales"],
        "open_amount": stats["open_amount"],
        "invoice_count": stats["invoice_count"],
        "open_invoice_count": stats["open_invoice_count"],
        "last_invoice_date": _dt(getattr(stats["last_invoice"], "created_at", None)) if stats["last_invoice"] else None,
        "crm_score": score,
        "score": score,
        "risk_level": risk,
        "crm_level": crm_level,
        "credit_usage": credit_usage,
        "notes_count": int(notes_count),
        "open_tasks_count": int(open_tasks),
        "lifetime_value": stats["total_sales"],
        "loyalty": loyalty,
        "tags": ",".join([x for x in [loyalty.get("level"), "Needs Followup" if balance > 0 else "", "Credit Risk" if risk in ["high", "critical"] else ""] if x]),
    }

def _invoice_dict(i):
    return {"id": i.id, "invoice_type": getattr(i, "invoice_type", ""), "total_amount": _safe_float(getattr(i, "total_amount", 0)), "payment_status": getattr(i, "payment_status", ""), "status": getattr(i, "status", ""), "created_at": _dt(getattr(i, "created_at", None)), "invoice_note": getattr(i, "invoice_note", "") or ""}

def _customer_ai(profile):
    score = _safe_float(profile.get("score"))
    debt = _safe_float(profile.get("debt"))
    risk = profile.get("risk_level")
    loyalty = profile.get("loyalty") or {}
    loyalty_level = loyalty.get("level", "Bronze")
    next_action = "urgent_call" if risk == "critical" else "payment_followup" if debt > 0 else "loyalty_offer" if loyalty_level in ["VIP", "Platinum", "Gold"] else "regular_followup"
    return {
        "score": score,
        "risk_level": risk,
        "loyalty_level": loyalty_level,
        "purchase_probability": min(95, max(10, score + (10 if loyalty_level in ["VIP", "Platinum"] else 0))),
        "churn_risk": 80 if risk == "critical" else 55 if risk == "high" else 35 if debt > 0 else 15,
        "next_action": next_action,
        "best_contact_time": "10:00 - 12:00",
        "suggested_discount": loyalty.get("discount_percent", 0),
    }

@router.get("/dashboard")
def crm_dashboard():
    db = SessionLocal()
    try:
        customers = db.query(Customer).all()
        profiles = [_profile(db, c) for c in customers]
        debtors = sorted([p for p in profiles if p.get("debit", 0) > 0], key=lambda x: x.get("debit", 0), reverse=True)
        risky = [p for p in profiles if p.get("risk_level") in ["high", "critical"]]
        loyalty_counts = {}
        for p in profiles:
            lvl = (p.get("loyalty") or {}).get("level", "Bronze")
            loyalty_counts[lvl] = loyalty_counts.get(lvl, 0) + 1
        return {
            "customers_count": len(customers),
            "vip_count": len([p for p in profiles if (p.get("loyalty") or {}).get("level") in ["VIP", "Platinum"]]),
            "followup_count": len(debtors),
            "risk_count": len(risky),
            "receivables_total": sum(_safe_float(p.get("debit")) for p in profiles),
            "customer_score_avg": round(sum(_safe_float(p.get("crm_score")) for p in profiles) / len(profiles), 1) if profiles else 0,
            "loyalty_counts": loyalty_counts,
            "loyalty_points_total": sum(_safe_float((p.get("loyalty") or {}).get("points")) for p in profiles),
            "top_customers": sorted(profiles, key=lambda x: x.get("crm_score", 0), reverse=True)[:10],
            "top_debtors": debtors[:10],
            "risky_customers": risky[:10],
        }
    finally:
        db.close()

@router.get("/customers/{customer_id}")
def get_customer_360(customer_id: int):
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            return {"status": "error", "message": "Customer not found"}
        profile = _profile(db, customer)
        invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id).order_by(Invoice.id.desc()).all()
        return {
            "customer": profile,
            "summary": {
                "balance": profile["balance"], "debt": profile["debt"], "credit": profile["credit"], "credit_limit": profile["credit_limit"],
                "credit_usage": profile["credit_usage"], "invoice_count": profile["invoice_count"], "open_invoice_count": profile["open_invoice_count"],
                "total_sales": profile["total_sales"], "lifetime_value": profile["lifetime_value"], "score": profile["score"], "risk_level": profile["risk_level"],
                "crm_level": profile["crm_level"], "loyalty": profile["loyalty"],
            },
            "invoices": [_invoice_dict(i) for i in invoices],
            "ai": _customer_ai(profile),
        }
    finally:
        db.close()

@router.get("/customers/{customer_id}/loyalty")
def get_customer_loyalty(customer_id: int):
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            return {"status": "error", "message": "Customer not found"}
        return _profile(db, customer).get("loyalty") or {}
    finally:
        db.close()

@router.post("/customers/{customer_id}/loyalty/redeem")
def redeem_customer_points(customer_id: int, data: LoyaltyRedeemRequest):
    points = max(0, _safe_float(data.points))
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM customer_loyalty WHERE customer_id=:cid"), {"cid": customer_id}).mappings().first()
        if not row:
            return {"status": "error", "message": "Loyalty record not found"}
        available = _safe_float(row.get("points"))
        if points > available:
            return {"status": "error", "message": "Not enough points"}
        redeemed = _safe_float(row.get("redeemed_points")) + points
        gift_credit = _safe_float(row.get("gift_credit")) + points
        conn.execute(text("UPDATE customer_loyalty SET points=:points, redeemed_points=:redeemed, gift_credit=:gift_credit, last_updated=:updated WHERE customer_id=:cid"), {"cid": customer_id, "points": available - points, "redeemed": redeemed, "gift_credit": gift_credit, "updated": datetime.utcnow()})
        conn.execute(text("INSERT INTO crm_notes (customer_id,note_type,title,text,tags,created_at) VALUES (:cid,'loyalty',:title,:text,'loyalty,redeem',:created_at)"), {"cid": customer_id, "title": "Loyalty points redeemed", "text": data.note or f"{points} points redeemed", "created_at": datetime.utcnow()})
        conn.commit()
        return {"status": "ok", "redeemed_points": points, "remaining_points": available - points, "gift_credit": gift_credit}

@router.get("/customers/{customer_id}/profile")
def get_customer_profile(customer_id: int):
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            return {"status": "error", "message": "Customer not found"}
        return _profile(db, customer)
    finally:
        db.close()

@router.get("/customers/{customer_id}/timeline")
def get_customer_timeline(customer_id: int):
    db = SessionLocal()
    try:
        invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id).all()
        entries = db.query(AccountingEntry).filter(AccountingEntry.customer_id == customer_id).all()
        events = []
        for i in invoices:
            events.append({"id": f"invoice-{i.id}", "type": "invoice", "title": f"Invoice #{i.id}", "description": getattr(i, "invoice_type", ""), "amount": _safe_float(getattr(i, "total_amount", 0)), "created_at": _dt(getattr(i, "created_at", None)), "source": "invoice"})
        for e in entries:
            events.append({"id": f"entry-{e.id}", "type": e.source_type or "accounting", "title": e.description or "Accounting entry", "description": e.entry_type or "", "amount": _safe_float(e.debit or e.credit), "created_at": _dt(getattr(e, "created_at", None)), "source": "accounting"})
        with engine.connect() as conn:
            for source, table_name in [("note", "crm_notes"), ("task", "crm_tasks"), ("interaction", "crm_interactions")]:
                rows = conn.execute(text(f"SELECT * FROM {table_name} WHERE customer_id=:cid"), {"cid": customer_id}).mappings().all()
                for r in rows:
                    d = dict(r)
                    events.append({"id": f"{source}-{d.get('id')}", "type": d.get("note_type") or d.get("interaction_type") or "task", "title": d.get("title") or "", "description": d.get("text") or d.get("description") or "", "amount": 0, "created_at": _dt(d.get("created_at")), "source": source, **d})
        return sorted(events, key=lambda x: str(x.get("created_at") or ""), reverse=True)
    finally:
        db.close()

@router.get("/customers/{customer_id}/ai")
def get_customer_ai(customer_id: int):
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            return {"status": "error", "message": "Customer not found"}
        return _customer_ai(_profile(db, customer))
    finally:
        db.close()

@router.get("/customers/{customer_id}/notes")
def get_notes(customer_id: int):
    with engine.connect() as conn:
        return [dict(r) for r in conn.execute(text("SELECT * FROM crm_notes WHERE customer_id=:cid ORDER BY id DESC"), {"cid": customer_id}).mappings().all()]

@router.post("/customers/{customer_id}/notes")
def create_note(customer_id: int, data: CrmNoteCreate):
    with engine.connect() as conn:
        res = conn.execute(text("INSERT INTO crm_notes (customer_id,note_type,title,text,tags,created_at) VALUES (:customer_id,:note_type,:title,:text,:tags,:created_at)"), {"customer_id": customer_id, "note_type": data.note_type, "title": data.title, "text": data.text, "tags": data.tags, "created_at": datetime.utcnow()})
        conn.commit()
        return {"status": "created", "id": res.lastrowid}

@router.delete("/notes/{note_id}")
def delete_note(note_id: int):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM crm_notes WHERE id=:id"), {"id": note_id})
        conn.commit()
        return {"status": "deleted", "id": note_id}

@router.get("/customers/{customer_id}/tasks")
def get_tasks(customer_id: int):
    with engine.connect() as conn:
        return [dict(r) for r in conn.execute(text("SELECT * FROM crm_tasks WHERE customer_id=:cid ORDER BY id DESC"), {"cid": customer_id}).mappings().all()]

@router.post("/customers/{customer_id}/tasks")
def create_task(customer_id: int, data: CrmTaskCreate):
    with engine.connect() as conn:
        res = conn.execute(text("INSERT INTO crm_tasks (customer_id,title,description,due_date,status,priority,created_at,completed_at) VALUES (:customer_id,:title,:description,:due_date,:status,:priority,:created_at,'')"), {"customer_id": customer_id, "title": data.title, "description": data.description, "due_date": data.due_date, "status": data.status, "priority": data.priority, "created_at": datetime.utcnow()})
        conn.commit()
        return {"status": "created", "id": res.lastrowid}

@router.put("/tasks/{task_id}")
def update_task(task_id: int, data: CrmTaskUpdate):
    completed_at = datetime.utcnow().isoformat() if data.status == "done" else ""
    with engine.connect() as conn:
        conn.execute(text("UPDATE crm_tasks SET title=:title,description=:description,due_date=:due_date,status=:status,priority=:priority,completed_at=:completed_at WHERE id=:id"), {"id": task_id, "title": data.title, "description": data.description, "due_date": data.due_date, "status": data.status, "priority": data.priority, "completed_at": completed_at})
        conn.commit()
        return {"status": "updated", "id": task_id}

@router.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM crm_tasks WHERE id=:id"), {"id": task_id})
        conn.commit()
        return {"status": "deleted", "id": task_id}

@router.get("/customers/{customer_id}/interactions")
def get_interactions(customer_id: int):
    with engine.connect() as conn:
        return [dict(r) for r in conn.execute(text("SELECT * FROM crm_interactions WHERE customer_id=:cid ORDER BY id DESC"), {"cid": customer_id}).mappings().all()]

@router.post("/customers/{customer_id}/interactions")
def create_interaction(customer_id: int, data: CrmInteractionCreate):
    with engine.connect() as conn:
        res = conn.execute(text("INSERT INTO crm_interactions (customer_id,interaction_type,title,description,result,next_followup,created_at) VALUES (:customer_id,:interaction_type,:title,:description,:result,:next_followup,:created_at)"), {"customer_id": customer_id, "interaction_type": data.interaction_type, "title": data.title, "description": data.description, "result": data.result, "next_followup": data.next_followup, "created_at": datetime.utcnow()})
        conn.commit()
        return {"status": "created", "id": res.lastrowid}
