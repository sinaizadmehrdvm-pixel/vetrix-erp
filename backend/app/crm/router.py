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

def _ensure_crm_tables():
    with engine.connect() as conn:
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS crm_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                note_type VARCHAR DEFAULT 'note',
                title VARCHAR DEFAULT '',
                text TEXT DEFAULT '',
                tags VARCHAR DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.execute(text('''
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
        '''))
        conn.commit()

_ensure_crm_tables()

class CrmNoteCreate(BaseModel):
    title: str = ''
    text: str = ''
    note_type: str = 'note'
    tags: str = ''

class CrmTaskCreate(BaseModel):
    title: str
    description: str = ''
    due_date: str = ''
    status: str = 'open'
    priority: str = 'normal'

class CrmTaskUpdate(BaseModel):
    title: str = ''
    description: str = ''
    due_date: str = ''
    status: str = 'open'
    priority: str = 'normal'

def _customer_balance(db, customer_id: int):
    entries = db.query(AccountingEntry).filter(AccountingEntry.customer_id == customer_id).all()
    return sum(_safe_float(e.debit) - _safe_float(e.credit) for e in entries)

def _customer_profile(db, customer):
    balance = _customer_balance(db, customer.id)
    invoices = db.query(Invoice).filter(Invoice.customer_id == customer.id).all()
    invoice_count = len(invoices)
    sales_amount = sum(_safe_float(i.total_amount) for i in invoices if getattr(i, 'invoice_type', '') == 'sale')
    last_invoice = sorted(invoices, key=lambda x: getattr(x, 'created_at', None) or datetime.min, reverse=True)[0] if invoices else None
    score = 45
    if sales_amount > 0: score += min(25, sales_amount / 10000000)
    if invoice_count > 0: score += min(15, invoice_count * 2)
    if balance <= 0: score += 10
    if balance > 0: score -= min(25, balance / 10000000)
    if getattr(customer, 'phone', ''): score += 4
    if getattr(customer, 'email', ''): score += 3
    score = max(0, min(100, round(score)))
    level = 'vip' if score >= 85 else 'gold' if score >= 65 else 'followup' if balance > 0 else 'normal'
    return {
        'id': customer.id,
        'name': customer.name,
        'phone': getattr(customer, 'phone', '') or '',
        'email': getattr(customer, 'email', '') or '',
        'address': getattr(customer, 'address', '') or '',
        'customer_type': getattr(customer, 'customer_type', 'customer') or 'customer',
        'balance': balance,
        'debit': balance if balance > 0 else 0,
        'credit': abs(balance) if balance < 0 else 0,
        'invoice_count': invoice_count,
        'sales_amount': sales_amount,
        'last_invoice_date': getattr(last_invoice, 'created_at', None) if last_invoice else None,
        'crm_score': score,
        'crm_level': level,
        'suggestion': 'followup_receivable' if balance > 0 else 'maintain_relationship',
    }

@router.get('/dashboard')
def crm_dashboard():
    db = SessionLocal()
    try:
        customers = db.query(Customer).all()
        profiles = [_customer_profile(db, c) for c in customers]
        profiles_sorted = sorted(profiles, key=lambda x: x.get('crm_score', 0), reverse=True)
        debtors = sorted([p for p in profiles if p.get('debit', 0) > 0], key=lambda x: x.get('debit', 0), reverse=True)
        result = {
            'customers_count': len(customers),
            'vip_count': len([p for p in profiles if p.get('crm_level') in ['vip', 'gold']]),
            'followup_count': len(debtors),
            'receivables_total': sum(_safe_float(p.get('debit')) for p in profiles),
            'top_customers': profiles_sorted[:10],
            'top_debtors': debtors[:10],
        }
        db.close(); return result
    except Exception as e:
        db.close(); return {'status': 'error', 'message': str(e)}

@router.get('/customers/{customer_id}/profile')
def get_customer_profile(customer_id: int):
    db = SessionLocal()
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        db.close(); return {'status': 'error', 'message': 'Customer not found'}
    result = _customer_profile(db, customer)
    db.close(); return result

@router.get('/customers/{customer_id}/notes')
def get_notes(customer_id: int):
    with engine.connect() as conn:
        rows = conn.execute(text('SELECT * FROM crm_notes WHERE customer_id=:cid ORDER BY id DESC'), {'cid': customer_id}).mappings().all()
        return [dict(r) for r in rows]

@router.post('/customers/{customer_id}/notes')
def create_note(customer_id: int, data: CrmNoteCreate):
    with engine.connect() as conn:
        res = conn.execute(text('''
            INSERT INTO crm_notes (customer_id, note_type, title, text, tags, created_at)
            VALUES (:customer_id, :note_type, :title, :text, :tags, :created_at)
        '''), {'customer_id': customer_id, 'note_type': data.note_type, 'title': data.title, 'text': data.text, 'tags': data.tags, 'created_at': datetime.utcnow()})
        conn.commit(); return {'status': 'created', 'id': res.lastrowid}

@router.delete('/notes/{note_id}')
def delete_note(note_id: int):
    with engine.connect() as conn:
        conn.execute(text('DELETE FROM crm_notes WHERE id=:id'), {'id': note_id})
        conn.commit(); return {'status': 'deleted', 'id': note_id}

@router.get('/customers/{customer_id}/tasks')
def get_tasks(customer_id: int):
    with engine.connect() as conn:
        rows = conn.execute(text('SELECT * FROM crm_tasks WHERE customer_id=:cid ORDER BY id DESC'), {'cid': customer_id}).mappings().all()
        return [dict(r) for r in rows]

@router.post('/customers/{customer_id}/tasks')
def create_task(customer_id: int, data: CrmTaskCreate):
    with engine.connect() as conn:
        res = conn.execute(text('''
            INSERT INTO crm_tasks (customer_id, title, description, due_date, status, priority, created_at, completed_at)
            VALUES (:customer_id, :title, :description, :due_date, :status, :priority, :created_at, '')
        '''), {'customer_id': customer_id, 'title': data.title, 'description': data.description, 'due_date': data.due_date, 'status': data.status, 'priority': data.priority, 'created_at': datetime.utcnow()})
        conn.commit(); return {'status': 'created', 'id': res.lastrowid}

@router.put('/tasks/{task_id}')
def update_task(task_id: int, data: CrmTaskUpdate):
    completed_at = datetime.utcnow().isoformat() if data.status == 'done' else ''
    with engine.connect() as conn:
        conn.execute(text('''
            UPDATE crm_tasks SET title=:title, description=:description, due_date=:due_date,
            status=:status, priority=:priority, completed_at=:completed_at WHERE id=:id
        '''), {'id': task_id, 'title': data.title, 'description': data.description, 'due_date': data.due_date, 'status': data.status, 'priority': data.priority, 'completed_at': completed_at})
        conn.commit(); return {'status': 'updated', 'id': task_id}

@router.delete('/tasks/{task_id}')
def delete_task(task_id: int):
    with engine.connect() as conn:
        conn.execute(text('DELETE FROM crm_tasks WHERE id=:id'), {'id': task_id})
        conn.commit(); return {'status': 'deleted', 'id': task_id}
