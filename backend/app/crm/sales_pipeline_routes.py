from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text
from datetime import datetime
from app.database import engine

router = APIRouter(prefix='/crm/pipeline', tags=['Sales Pipeline'])

class DealCreate(BaseModel):
    customer_id: int = 0
    title: str
    stage: str = 'lead'
    amount: float = 0
    probability: float = 0
    expected_close_date: str = ''
    note: str = ''

def _ensure_pipeline_table():
    with engine.connect() as conn:
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS sales_pipeline_deals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER DEFAULT 0,
                title VARCHAR NOT NULL,
                stage VARCHAR DEFAULT 'lead',
                amount FLOAT DEFAULT 0,
                probability FLOAT DEFAULT 0,
                expected_close_date VARCHAR DEFAULT '',
                note TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.commit()
_ensure_pipeline_table()

@router.get('/deals')
def list_deals():
    with engine.connect() as conn:
        rows = conn.execute(text('SELECT * FROM sales_pipeline_deals ORDER BY id DESC')).mappings().all()
        return [dict(r) for r in rows]

@router.post('/deals')
def create_deal(data: DealCreate):
    with engine.connect() as conn:
        res = conn.execute(text('''
            INSERT INTO sales_pipeline_deals (customer_id, title, stage, amount, probability, expected_close_date, note, created_at)
            VALUES (:customer_id, :title, :stage, :amount, :probability, :expected_close_date, :note, :created_at)
        '''), {'customer_id': data.customer_id, 'title': data.title, 'stage': data.stage, 'amount': data.amount, 'probability': data.probability, 'expected_close_date': data.expected_close_date, 'note': data.note, 'created_at': datetime.utcnow()})
        conn.commit(); return {'status': 'created', 'id': res.lastrowid}

@router.put('/deals/{deal_id}')
def update_deal(deal_id: int, data: DealCreate):
    with engine.connect() as conn:
        conn.execute(text('''
            UPDATE sales_pipeline_deals SET customer_id=:customer_id, title=:title, stage=:stage,
            amount=:amount, probability=:probability, expected_close_date=:expected_close_date, note=:note WHERE id=:id
        '''), {'id': deal_id, 'customer_id': data.customer_id, 'title': data.title, 'stage': data.stage, 'amount': data.amount, 'probability': data.probability, 'expected_close_date': data.expected_close_date, 'note': data.note})
        conn.commit(); return {'status': 'updated', 'id': deal_id}

@router.delete('/deals/{deal_id}')
def delete_deal(deal_id: int):
    with engine.connect() as conn:
        conn.execute(text('DELETE FROM sales_pipeline_deals WHERE id=:id'), {'id': deal_id})
        conn.commit(); return {'status': 'deleted', 'id': deal_id}
