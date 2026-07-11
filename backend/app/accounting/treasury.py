from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.accounting.posting import delete_source_voucher, post_balanced_voucher
from app.database import engine

router = APIRouter(prefix="/api/accounting/treasury", tags=["Treasury & Cheques"])
MONEY_STEP = Decimal("0.01")


def _money(value):
    return float(Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP))


class ChequeCreate(BaseModel):
    direction: str
    customer_id: int
    amount: float
    cheque_number: str
    bank_name: str = ""
    branch_name: str = ""
    issue_date: date
    due_date: date
    note: str = ""


class ChequeTransition(BaseModel):
    status: str
    event_date: date
    note: str = ""


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS treasury_cheques (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            direction VARCHAR NOT NULL,
            customer_id INTEGER NOT NULL,
            amount FLOAT NOT NULL,
            cheque_number VARCHAR NOT NULL,
            bank_name VARCHAR DEFAULT '',
            branch_name VARCHAR DEFAULT '',
            issue_date DATE NOT NULL,
            due_date DATE NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            note TEXT DEFAULT '',
            customer_entry_id INTEGER,
            reversal_entry_id INTEGER,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            UNIQUE(direction, cheque_number),
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS treasury_cheque_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cheque_id INTEGER NOT NULL,
            from_status VARCHAR NOT NULL,
            to_status VARCHAR NOT NULL,
            event_date DATE NOT NULL,
            note TEXT DEFAULT '',
            voucher_id INTEGER,
            created_at VARCHAR NOT NULL,
            FOREIGN KEY(cheque_id) REFERENCES treasury_cheques(id)
        )
    """))


def _cheque(conn, cheque_id):
    _ensure_schema(conn)
    row = conn.execute(text("""
        SELECT ch.*, c.name AS customer_name, c.customer_type
        FROM treasury_cheques ch
        JOIN customers c ON c.id=ch.customer_id
        WHERE ch.id=:id
    """), {"id": cheque_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Cheque not found")
    return dict(row)


def _customer_balance(conn, customer_id):
    value = conn.execute(text("""
        SELECT COALESCE(SUM(debit-credit),0)
        FROM accounting_entries WHERE customer_id=:id
    """), {"id": customer_id}).scalar() or 0
    return _money(value)


def _add_customer_entry(conn, cheque, source_type, description, debit=0, credit=0):
    before = _customer_balance(conn, cheque["customer_id"])
    after = _money(before + debit - credit)
    result = conn.execute(text("""
        INSERT INTO accounting_entries
          (customer_id, source_type, source_id, entry_type, description,
           debit, credit, balance_after, created_at)
        VALUES
          (:customer_id, :source_type, :source_id, :entry_type, :description,
           :debit, :credit, :balance_after, :created_at)
    """), {
        "customer_id": cheque["customer_id"],
        "source_type": source_type,
        "source_id": cheque["id"],
        "entry_type": "debit" if debit >= credit else "credit",
        "description": description,
        "debit": _money(debit),
        "credit": _money(credit),
        "balance_after": after,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return result.lastrowid


@router.get("/cheques")
def list_cheques(
    direction: str = "all",
    status: str = "all",
    upcoming_days: int = Query(default=30, ge=0, le=365),
):
    today = date.today()
    upcoming = today + timedelta(days=upcoming_days)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT ch.*, c.name AS customer_name, c.customer_type
            FROM treasury_cheques ch
            JOIN customers c ON c.id=ch.customer_id
            WHERE (:direction='all' OR ch.direction=:direction)
              AND (:status='all' OR ch.status=:status)
            ORDER BY ch.due_date, ch.id DESC
        """), {"direction": direction, "status": status}).mappings().all()
        items = []
        for row in rows:
            item = dict(row)
            due = date.fromisoformat(str(row["due_date"])[:10])
            item["amount"] = _money(row["amount"])
            item["days_to_due"] = (due - today).days
            item["overdue"] = row["status"] == "pending" and due < today
            item["due_soon"] = row["status"] == "pending" and today <= due <= upcoming
            items.append(item)
        pending = [item for item in items if item["status"] == "pending"]
        return {
            "summary": {
                "total_count": len(items),
                "pending_count": len(pending),
                "received_pending": _money(sum(item["amount"] for item in pending if item["direction"] == "received")),
                "payable_pending": _money(sum(item["amount"] for item in pending if item["direction"] == "payable")),
                "overdue_count": len([item for item in pending if item["overdue"]]),
                "due_soon_count": len([item for item in pending if item["due_soon"]]),
            },
            "items": items,
        }


@router.get("/cheques/{cheque_id}")
def cheque_detail(cheque_id: int):
    with engine.begin() as conn:
        cheque = _cheque(conn, cheque_id)
        events = conn.execute(text("""
            SELECT * FROM treasury_cheque_events
            WHERE cheque_id=:id ORDER BY event_date, id
        """), {"id": cheque_id}).mappings().all()
        cheque["amount"] = _money(cheque["amount"])
        cheque["events"] = [dict(row) for row in events]
        return cheque


@router.post("/cheques")
def create_cheque(data: ChequeCreate):
    direction = data.direction.strip().lower()
    if direction not in {"received", "payable"}:
        raise HTTPException(status_code=400, detail="direction must be received or payable")
    amount = _money(data.amount)
    number = data.cheque_number.strip()
    if amount <= 0 or not number:
        raise HTTPException(status_code=400, detail="Positive amount and cheque number are required")
    if data.due_date < data.issue_date:
        raise HTTPException(status_code=400, detail="Due date cannot precede issue date")
    try:
        with engine.begin() as conn:
            _ensure_schema(conn)
            customer = conn.execute(text("""
                SELECT id, name FROM customers WHERE id=:id
            """), {"id": data.customer_id}).mappings().first()
            if not customer:
                raise HTTPException(status_code=404, detail="Party not found")
            now = datetime.now(timezone.utc).isoformat()
            result = conn.execute(text("""
                INSERT INTO treasury_cheques
                  (direction, customer_id, amount, cheque_number, bank_name,
                   branch_name, issue_date, due_date, status, note,
                   created_at, updated_at)
                VALUES
                  (:direction, :customer_id, :amount, :cheque_number, :bank_name,
                   :branch_name, :issue_date, :due_date, 'pending', :note,
                   :now, :now)
            """), {
                "direction": direction, "customer_id": data.customer_id,
                "amount": amount, "cheque_number": number,
                "bank_name": data.bank_name.strip(), "branch_name": data.branch_name.strip(),
                "issue_date": data.issue_date.isoformat(), "due_date": data.due_date.isoformat(),
                "note": data.note.strip(), "now": now,
            })
            cheque_id = result.lastrowid
            cheque = {
                "id": cheque_id, "customer_id": data.customer_id,
                "amount": amount, "direction": direction,
            }
            description = (
                f"دریافت چک شماره {number} از {customer['name']}"
                if direction == "received"
                else f"صدور چک شماره {number} برای {customer['name']}"
            )
            if direction == "received":
                lines = [
                    {"account_code": "1104", "debit": amount, "description": description},
                    {"account_code": "1103", "credit": amount, "description": description},
                ]
                entry_id = _add_customer_entry(
                    conn, cheque, "cheque_received", description, credit=amount
                )
            else:
                lines = [
                    {"account_code": "2101", "debit": amount, "description": description},
                    {"account_code": "2102", "credit": amount, "description": description},
                ]
                entry_id = _add_customer_entry(
                    conn, cheque, "cheque_payable", description, debit=amount
                )
            voucher_id = post_balanced_voucher(
                "cheque_registration", cheque_id, description, lines,
                voucher_date=data.issue_date.isoformat(), connection=conn,
            )
            conn.execute(text("""
                UPDATE treasury_cheques SET customer_entry_id=:entry_id WHERE id=:id
            """), {"entry_id": entry_id, "id": cheque_id})
            return {"status": "created", "id": cheque_id, "voucher_id": voucher_id}
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=409, detail="Cheque number already exists for this direction")
        raise


TRANSITIONS = {
    "received": {
        "cleared": ("1102", "1104"),
        "bounced": ("1103", "1104"),
        "cancelled": ("1103", "1104"),
    },
    "payable": {
        "cleared": ("2102", "1102"),
        "cancelled": ("2102", "2101"),
    },
}


@router.post("/cheques/{cheque_id}/transition")
def transition_cheque(cheque_id: int, data: ChequeTransition):
    target = data.status.strip().lower()
    try:
        with engine.begin() as conn:
            cheque = _cheque(conn, cheque_id)
            if cheque["status"] != "pending":
                raise HTTPException(status_code=409, detail="Only pending cheques can transition")
            accounts = TRANSITIONS[cheque["direction"]]
            if target not in accounts:
                raise HTTPException(status_code=400, detail="Invalid status for cheque direction")
            debit_account, credit_account = accounts[target]
            amount = _money(cheque["amount"])
            description = f"{target}: cheque {cheque['cheque_number']} - {cheque['customer_name']}"
            result = conn.execute(text("""
                INSERT INTO treasury_cheque_events
                  (cheque_id, from_status, to_status, event_date, note, created_at)
                VALUES
                  (:cheque_id, 'pending', :target, :event_date, :note, :created_at)
            """), {
                "cheque_id": cheque_id, "target": target,
                "event_date": data.event_date.isoformat(), "note": data.note.strip(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            event_id = result.lastrowid
            voucher_id = post_balanced_voucher(
                "cheque_event", event_id, description,
                [
                    {"account_code": debit_account, "debit": amount, "description": description},
                    {"account_code": credit_account, "credit": amount, "description": description},
                ],
                voucher_date=data.event_date.isoformat(), connection=conn,
            )
            reversal_id = None
            if target in {"bounced", "cancelled"}:
                if cheque["direction"] == "received":
                    reversal_id = _add_customer_entry(
                        conn, cheque, "cheque_reversal", description, debit=amount
                    )
                else:
                    reversal_id = _add_customer_entry(
                        conn, cheque, "cheque_reversal", description, credit=amount
                    )
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(text("""
                UPDATE treasury_cheque_events SET voucher_id=:voucher_id WHERE id=:id
            """), {"voucher_id": voucher_id, "id": event_id})
            conn.execute(text("""
                UPDATE treasury_cheques
                SET status=:status, reversal_entry_id=:reversal_id, updated_at=:now
                WHERE id=:id
            """), {
                "status": target, "reversal_id": reversal_id,
                "now": now, "id": cheque_id,
            })
            return {
                "status": target, "id": cheque_id,
                "event_id": event_id, "voucher_id": voucher_id,
            }
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))


@router.delete("/cheques/{cheque_id}")
def delete_pending_cheque(cheque_id: int):
    try:
        with engine.begin() as conn:
            cheque = _cheque(conn, cheque_id)
            if cheque["status"] != "pending":
                raise HTTPException(status_code=409, detail="Only pending cheques can be deleted")
            delete_source_voucher("cheque_registration", cheque_id, connection=conn)
            if cheque["customer_entry_id"]:
                conn.execute(text("""
                    DELETE FROM accounting_entries WHERE id=:id
                """), {"id": cheque["customer_entry_id"]})
            conn.execute(text("DELETE FROM treasury_cheques WHERE id=:id"), {"id": cheque_id})
            return {"status": "deleted", "id": cheque_id}
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))
