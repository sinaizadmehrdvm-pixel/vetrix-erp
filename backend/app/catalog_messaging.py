"""Turn a WhatsApp/Telegram text message into a pending catalog order.

Reuses the same verified-webhook plumbing as app/inbound_voice.py (one
webhook URL per platform is all Telegram/WhatsApp allow, so the routing
in inbound_voice.py dispatches here for text messages that look like an
order instead of owning a second webhook). Unlike voice change requests,
there is no sender allow-list here - a catalog link is itself the
authorization, the same trust boundary the public web catalog view uses.
"""
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from app.catalog import CatalogLink, CatalogOrder, _resolve_products
from app.database import Base, SessionLocal, engine

router = APIRouter(prefix="/api/catalog/messages", tags=["Catalog Ordering via Chat"])

ORDER_HEADER = re.compile(r"^\s*order\s+#?(\d+)\s*$", re.IGNORECASE)
ITEM_LINE = re.compile(r"^\s*([\d.]+)\s*x?\s+(.+?)\s*$", re.IGNORECASE)
NOTE_LINE = re.compile(r"^\s*note\s*:?\s*(.*)$", re.IGNORECASE)


class InboundCatalogMessage(Base):
    __tablename__ = "inbound_catalog_messages"
    __table_args__ = (UniqueConstraint("source", "external_event_id"),)

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, nullable=False)
    external_event_id = Column(String, nullable=False)
    sender_reference = Column(String, nullable=False)
    catalog_order_id = Column(Integer, nullable=True)
    status = Column(String, nullable=False)  # created / duplicate / rejected / ignored
    detail = Column(Text, nullable=True)
    received_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


InboundCatalogMessage.__table__.create(bind=engine, checkfirst=True)


def _now():
    return datetime.now(timezone.utc)


def is_catalog_order_message(text_body):
    lines = [ln for ln in (text_body or "").splitlines() if ln.strip()]
    return bool(lines) and bool(ORDER_HEADER.match(lines[0]))


def parse_order_message(text_body):
    """Returns {"catalog_id", "item_lines": [(qty, code), ...], "note"} or None."""
    lines = [ln.strip() for ln in (text_body or "").splitlines() if ln.strip()]
    if not lines:
        return None
    header = ORDER_HEADER.match(lines[0])
    if not header:
        return None
    item_lines = []
    note_parts = []
    for line in lines[1:]:
        note_match = NOTE_LINE.match(line)
        if note_match:
            note_parts.append(note_match.group(1).strip())
            continue
        item_match = ITEM_LINE.match(line)
        if item_match:
            item_lines.append((float(item_match.group(1)), item_match.group(2).strip()))
    return {
        "catalog_id": int(header.group(1)),
        "item_lines": item_lines,
        "note": " ".join(p for p in note_parts if p),
    }


def _match_product(product, code):
    code = code.strip().lower()
    candidates = {
        str(getattr(product, "code", "") or "").lower(),
        str(getattr(product, "barcode", "") or "").lower(),
        str(getattr(product, "sku", "") or "").lower(),
        str(product.name or "").lower(),
    }
    return code in candidates and code != ""


def _record_event(db, source, event_id, sender, status, detail, order_id=None):
    entry = InboundCatalogMessage(
        source=source,
        external_event_id=str(event_id or "")[:300],
        sender_reference=str(sender or "")[:300],
        catalog_order_id=order_id,
        status=status,
        detail=str(detail or "")[:2000],
    )
    db.add(entry)
    db.commit()
    return entry


def ingest_catalog_order_message(source, event_id, sender, sender_name, message_text, message_reference):
    clean_event = str(event_id or "").strip()
    if not clean_event:
        return {"status": "rejected", "detail": "Missing external event identifier"}

    db = SessionLocal()
    try:
        existing = (
            db.query(InboundCatalogMessage)
            .filter(
                InboundCatalogMessage.source == source,
                InboundCatalogMessage.external_event_id == clean_event,
            )
            .first()
        )
        if existing:
            return {"status": "duplicate", "order_id": existing.catalog_order_id}

        parsed = parse_order_message(message_text)
        if not parsed:
            _record_event(db, source, clean_event, sender, "ignored", "Not an order message")
            return {"status": "ignored"}

        catalog = db.query(CatalogLink).filter(CatalogLink.id == parsed["catalog_id"]).first()
        if not catalog or not catalog.enabled:
            _record_event(
                db, source, clean_event, sender, "rejected",
                f"Catalog {parsed['catalog_id']} not found or disabled",
            )
            return {"status": "rejected", "detail": "Catalog not found or disabled"}

        available = _resolve_products(db, catalog)
        resolved_items = []
        unmatched = []
        for quantity, code in parsed["item_lines"]:
            match = next((p for p in available if _match_product(p, code)), None)
            if match:
                resolved_items.append({"product_id": match.id, "name": match.name, "quantity": quantity})
            else:
                unmatched.append(code)

        if not resolved_items:
            _record_event(
                db, source, clean_event, sender, "rejected",
                f"No catalog items matched: {', '.join(unmatched) or 'no items provided'}",
            )
            return {"status": "rejected", "detail": "No matching catalog items"}

        order = CatalogOrder(
            catalog_link_id=catalog.id,
            customer_name=sender_name or sender or "WhatsApp/Telegram customer",
            customer_phone=sender or "",
            items_json=json.dumps(resolved_items),
            note=parsed["note"],
            status="pending",
        )
        db.add(order)
        db.commit()
        db.refresh(order)

        detail = f"source_reference={message_reference}"
        if unmatched:
            detail += f"; unmatched={', '.join(unmatched)}"
        _record_event(db, source, clean_event, sender, "created", detail, order_id=order.id)
        return {"status": "created", "order_id": order.id, "unmatched": unmatched}
    finally:
        db.close()


@router.get("")
def list_inbound_catalog_messages():
    db = SessionLocal()
    try:
        rows = (
            db.query(InboundCatalogMessage)
            .order_by(InboundCatalogMessage.id.desc())
            .limit(200)
            .all()
        )
        return {
            "items": [
                {
                    "id": r.id,
                    "source": r.source,
                    "sender_reference": r.sender_reference,
                    "catalog_order_id": r.catalog_order_id,
                    "status": r.status,
                    "detail": r.detail,
                    "received_at": r.received_at,
                }
                for r in rows
            ]
        }
    finally:
        db.close()
