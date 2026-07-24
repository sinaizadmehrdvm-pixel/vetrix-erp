import hashlib
import json
import os
import secrets
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/change-requests", tags=["Managed Change Requests"])

ALLOWED_SOURCES = {"in_app", "telegram", "whatsapp", "other"}
ALLOWED_ACTIONS = {"online_product_update", "campaign_draft", "note_only", "sale_invoice_draft", "report_delivery"}
ALLOWED_PRODUCT_FIELDS = {"is_published", "sync_stock", "online_price", "discount_percent", "sale_start", "sale_end", "website_slug"}
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".ogg", ".mp3", ".wav", ".m4a", ".aac", ".opus"}
MAX_AUDIO_BYTES = 20 * 1024 * 1024


def _audio_directory():
    root = Path(os.getenv("VETRIX_UPLOAD_DIR", "./uploads"))
    directory = root / "managed-change-audio"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _audio_path(reference):
    filename = Path(str(reference or "")).name
    if not filename or filename != str(reference) or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid audio reference")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported audio file type")
    return _audio_directory() / filename


def _require_managed_audio(reference):
    path = _audio_path(reference)
    if not path.is_file():
        raise HTTPException(status_code=400, detail="Uploaded audio file was not found")
    return path



def _now():
    return datetime.now(timezone.utc).isoformat()


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    return user_id, str(auth.get("role") or "viewer").lower()


def _require_admin(request: Request):
    user_id, role = _auth(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Administrator approval is required")
    return user_id


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS managed_change_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source VARCHAR NOT NULL,
            source_reference VARCHAR DEFAULT '',
            audio_reference TEXT DEFAULT '',
            transcript TEXT NOT NULL,
            action_type VARCHAR NOT NULL,
            target_id INTEGER,
            proposed_changes TEXT NOT NULL DEFAULT '{}',
            status VARCHAR NOT NULL DEFAULT 'draft',
            requested_by INTEGER NOT NULL,
            requested_at VARCHAR NOT NULL,
            submitted_at VARCHAR,
            decided_by INTEGER,
            decided_at VARCHAR,
            decision_note TEXT DEFAULT '',
            applied_at VARCHAR,
            apply_result TEXT DEFAULT '',
            FOREIGN KEY(requested_by) REFERENCES users(id),
            FOREIGN KEY(decided_by) REFERENCES users(id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS managed_change_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            actor_user_id INTEGER NOT NULL,
            detail TEXT DEFAULT '',
            created_at VARCHAR NOT NULL,
            FOREIGN KEY(request_id) REFERENCES managed_change_requests(id),
            FOREIGN KEY(actor_user_id) REFERENCES users(id)
        )
    """))


def _event(conn, request_id, event_type, actor, detail=""):
    conn.execute(text("""
        INSERT INTO managed_change_events
          (request_id, event_type, actor_user_id, detail, created_at)
        VALUES (:request_id, :event_type, :actor, :detail, :created_at)
    """), {"request_id": request_id, "event_type": event_type, "actor": actor, "detail": detail, "created_at": _now()})


def _row(conn, request_id):
    row = conn.execute(text("""
        SELECT r.*, requester.full_name requested_by_name,
               decider.full_name decided_by_name
        FROM managed_change_requests r
        LEFT JOIN users requester ON requester.id=r.requested_by
        LEFT JOIN users decider ON decider.id=r.decided_by
        WHERE r.id=:id
    """), {"id": request_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Change request not found")
    result = dict(row)
    try:
        result["proposed_changes"] = json.loads(result["proposed_changes"] or "{}")
    except json.JSONDecodeError:
        result["proposed_changes"] = {}
    return result


def _validate(action_type, target_id, changes):
    if action_type not in ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail="Unsupported action type")
    if not isinstance(changes, dict):
        raise HTTPException(status_code=400, detail="Proposed changes must be an object")
    if action_type == "online_product_update":
        if not target_id:
            raise HTTPException(status_code=400, detail="Product target is required")
        unknown = set(changes) - ALLOWED_PRODUCT_FIELDS
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unsupported product fields: {', '.join(sorted(unknown))}")
        if "discount_percent" in changes and not 0 <= float(changes["discount_percent"]) <= 100:
            raise HTTPException(status_code=400, detail="Discount must be between 0 and 100")
        if "online_price" in changes and changes["online_price"] is not None and float(changes["online_price"]) < 0:
            raise HTTPException(status_code=400, detail="Online price cannot be negative")
    if action_type == "campaign_draft":
        if not str(changes.get("title") or "").strip():
            raise HTTPException(status_code=400, detail="Campaign title is required")
        if changes.get("channel") not in {"website", "instagram", "telegram", "whatsapp", "linkedin"}:
            raise HTTPException(status_code=400, detail="Unsupported campaign channel")
    if action_type == "note_only" and changes:
        raise HTTPException(status_code=400, detail="Note-only requests cannot contain executable changes")
    if action_type == "sale_invoice_draft":
        customer_id = changes.get("customer_id")
        if not isinstance(customer_id, int) or customer_id <= 0:
            raise HTTPException(status_code=400, detail="A valid customer_id is required")
        items = changes.get("items")
        if not isinstance(items, list) or not items:
            raise HTTPException(status_code=400, detail="At least one item is required")
        for entry in items:
            if not isinstance(entry, dict):
                raise HTTPException(status_code=400, detail="Each item must be an object")
            product_id = entry.get("product_id")
            quantity = entry.get("quantity")
            if not isinstance(product_id, int) or product_id <= 0:
                raise HTTPException(status_code=400, detail="Each item needs a valid product_id")
            if not isinstance(quantity, (int, float)) or quantity <= 0:
                raise HTTPException(status_code=400, detail="Each item needs a quantity greater than zero")
    if action_type == "report_delivery":
        from app.report_delivery import FORMATS, REPORT_REGISTRY

        report_type = changes.get("report_type")
        if report_type not in REPORT_REGISTRY:
            raise HTTPException(
                status_code=400,
                detail=f"report_type must be one of: {', '.join(sorted(REPORT_REGISTRY))}",
            )
        if changes.get("format") not in FORMATS:
            raise HTTPException(status_code=400, detail=f"format must be one of: {', '.join(sorted(FORMATS))}")
        destination_email = str(changes.get("destination_email") or "").strip()
        if "@" not in destination_email or "." not in destination_email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="A valid destination_email is required")


class ChangeRequestPayload(BaseModel):
    source: Literal["in_app", "telegram", "whatsapp", "other"] = "in_app"
    source_reference: str = Field(default="", max_length=500)
    audio_reference: str = Field(default="", max_length=2000)
    transcript: str = Field(min_length=2, max_length=10000)
    action_type: Literal["online_product_update", "campaign_draft", "note_only", "sale_invoice_draft", "report_delivery"]
    target_id: Optional[int] = None
    proposed_changes: Dict[str, Any] = Field(default_factory=dict)


class DecisionPayload(BaseModel):
    note: str = Field(default="", max_length=2000)


class TranscriptReviewPayload(BaseModel):
    transcript: str = Field(min_length=2, max_length=10000)
    action_type: Literal["online_product_update", "campaign_draft", "note_only", "sale_invoice_draft", "report_delivery"]
    target_id: Optional[int] = None
    proposed_changes: Dict[str, Any] = Field(default_factory=dict)


@router.post("/audio")
async def upload_audio(request: Request, audio: UploadFile = File(...)):
    _auth(request)
    original_suffix = Path(audio.filename or "").suffix.lower()
    if original_suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported audio file type")
    if audio.content_type and not (
        audio.content_type.startswith("audio/")
        or audio.content_type in {"application/ogg", "video/webm"}
    ):
        raise HTTPException(status_code=415, detail="File content type is not audio")
    reference = f"{secrets.token_hex(16)}{original_suffix}"
    destination = _audio_path(reference)
    digest = hashlib.sha256()
    size = 0
    try:
        with destination.open("xb") as output:
            while chunk := await audio.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_AUDIO_BYTES:
                    raise HTTPException(status_code=413, detail="Audio file exceeds 20 MB")
                digest.update(chunk)
                output.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="Audio file is empty")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await audio.close()
    return {
        "reference": reference,
        "original_name": Path(audio.filename or "voice").name,
        "content_type": audio.content_type or "application/octet-stream",
        "size_bytes": size,
        "sha256": digest.hexdigest(),
    }


@router.get("/audio/{reference}")
def download_audio(reference: str, request: Request):
    _auth(request)
    path = _require_managed_audio(reference)
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"voice-request{path.suffix}",
    )


@router.get("")
def list_requests(status: str = "all"):
    allowed = {"all", "draft", "needs_transcript_review", "pending_approval", "approved", "rejected", "applied", "failed", "withdrawn"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid request status")
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT r.*, requester.full_name requested_by_name,
                   decider.full_name decided_by_name
            FROM managed_change_requests r
            LEFT JOIN users requester ON requester.id=r.requested_by
            LEFT JOIN users decider ON decider.id=r.decided_by
            WHERE (:status='all' OR r.status=:status)
            ORDER BY CASE
                       WHEN r.status='needs_transcript_review' THEN 0
                       WHEN r.status='pending_approval' THEN 1
                       ELSE 2
                     END,
                     r.id DESC
        """), {"status": status}).mappings().all()
        result = []
        for row in rows:
            item = dict(row)
            try:
                item["proposed_changes"] = json.loads(item["proposed_changes"] or "{}")
            except json.JSONDecodeError:
                item["proposed_changes"] = {}
            result.append(item)
        return result


@router.get("/{request_id}")
def request_detail(request_id: int):
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = _row(conn, request_id)
        events = conn.execute(text("""
            SELECT e.*, u.full_name actor_name, u.username actor_username
            FROM managed_change_events e
            LEFT JOIN users u ON u.id=e.actor_user_id
            WHERE e.request_id=:id ORDER BY e.id
        """), {"id": request_id}).mappings().all()
        result["events"] = [dict(event) for event in events]
        return result


@router.post("")
def create_request(payload: ChangeRequestPayload, request: Request):
    actor, _ = _auth(request)
    _validate(payload.action_type, payload.target_id, payload.proposed_changes)
    if payload.audio_reference:
        _require_managed_audio(payload.audio_reference)
    with engine.begin() as conn:
        _ensure_schema(conn)
        if payload.action_type == "online_product_update":
            if not conn.execute(text("SELECT id FROM products WHERE id=:id"), {"id": payload.target_id}).first():
                raise HTTPException(status_code=404, detail="Product not found")
        result = conn.execute(text("""
            INSERT INTO managed_change_requests
              (source, source_reference, audio_reference, transcript, action_type,
               target_id, proposed_changes, status, requested_by, requested_at)
            VALUES
              (:source, :source_reference, :audio_reference, :transcript, :action_type,
               :target_id, :proposed_changes, 'draft', :actor, :now)
        """), {
            **payload.dict(exclude={"proposed_changes"}),
            "proposed_changes": json.dumps(payload.proposed_changes, ensure_ascii=False, sort_keys=True),
            "actor": actor,
            "now": _now(),
        })
        request_id = result.lastrowid
        _event(conn, request_id, "created", actor, f"source={payload.source}")
        return {"status": "draft", "request_id": request_id}


@router.post("/{request_id}/review-transcript")
def review_transcript(
    request_id: int,
    payload: TranscriptReviewPayload,
    request: Request,
):
    actor = _require_admin(request)
    transcript = payload.transcript.strip()
    _validate(payload.action_type, payload.target_id, payload.proposed_changes)
    with engine.begin() as conn:
        _ensure_schema(conn)
        item = _row(conn, request_id)
        if item["status"] != "needs_transcript_review":
            raise HTTPException(
                status_code=409,
                detail="Request is not awaiting transcript review",
            )
        if payload.action_type == "online_product_update":
            product = conn.execute(
                text("SELECT id FROM products WHERE id=:id"),
                {"id": payload.target_id},
            ).first()
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")
        conn.execute(text("""
            UPDATE managed_change_requests
            SET transcript=:transcript, action_type=:action_type,
                target_id=:target_id, proposed_changes=:proposed_changes,
                status='pending_approval', submitted_at=:now,
                decided_by=NULL, decided_at=NULL, decision_note=''
            WHERE id=:id
        """), {
            "transcript": transcript,
            "action_type": payload.action_type,
            "target_id": payload.target_id,
            "proposed_changes": json.dumps(
                payload.proposed_changes,
                ensure_ascii=False,
                sort_keys=True,
            ),
            "now": _now(),
            "id": request_id,
        })
        detail = (
            f"action={payload.action_type}; "
            f"fields={','.join(sorted(payload.proposed_changes))}"
        )
        _event(conn, request_id, "transcript_reviewed", actor, detail)
        _event(conn, request_id, "submitted", actor, "after transcript review")
        return {
            "status": "pending_approval",
            "request_id": request_id,
        }


@router.post("/{request_id}/submit")
def submit_request(request_id: int, request: Request):
    actor, _ = _auth(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        item = _row(conn, request_id)
        if item["requested_by"] != actor:
            raise HTTPException(status_code=403, detail="Only the requester can submit")
        if item["status"] not in {"draft", "rejected"}:
            raise HTTPException(status_code=409, detail="Request cannot be submitted")
        conn.execute(text("""
            UPDATE managed_change_requests SET status='pending_approval',
            submitted_at=:now, decided_by=NULL, decided_at=NULL,
            decision_note='' WHERE id=:id
        """), {"now": _now(), "id": request_id})
        _event(conn, request_id, "submitted", actor)
        return {"status": "pending_approval", "request_id": request_id}


def _apply(conn, item, actor):
    changes = item["proposed_changes"]
    _validate(item["action_type"], item["target_id"], changes)
    if item["action_type"] == "note_only":
        return "No executable change; note approved"
    if item["action_type"] == "online_product_update":
        existing = conn.execute(text("""
            SELECT * FROM online_product_settings WHERE product_id=:id
        """), {"id": item["target_id"]}).mappings().first()
        defaults = {
            "is_published": bool(existing["is_published"]) if existing else False,
            "sync_stock": bool(existing["sync_stock"]) if existing else True,
            "online_price": existing["online_price"] if existing else None,
            "discount_percent": existing["discount_percent"] if existing else 0,
            "sale_start": existing["sale_start"] if existing else "",
            "sale_end": existing["sale_end"] if existing else "",
            "website_slug": existing["website_slug"] if existing else "",
        }
        defaults.update(changes)
        conn.execute(text("""
            INSERT INTO online_product_settings
              (product_id, is_published, sync_stock, online_price, discount_percent,
               sale_start, sale_end, website_slug, updated_by, updated_at)
            VALUES
              (:product_id, :is_published, :sync_stock, :online_price, :discount_percent,
               :sale_start, :sale_end, :website_slug, :actor, :now)
            ON CONFLICT(product_id) DO UPDATE SET
              is_published=excluded.is_published, sync_stock=excluded.sync_stock,
              online_price=excluded.online_price, discount_percent=excluded.discount_percent,
              sale_start=excluded.sale_start, sale_end=excluded.sale_end,
              website_slug=excluded.website_slug, updated_by=excluded.updated_by,
              updated_at=excluded.updated_at
        """), {**defaults, "product_id": item["target_id"], "actor": actor, "now": _now()})
        return f"Online product {item['target_id']} updated: {', '.join(sorted(changes))}"
    if item["action_type"] == "campaign_draft":
        result = conn.execute(text("""
            INSERT INTO social_campaigns
              (title, body, channel, product_id, media_url, destination_url,
               scheduled_at, status, created_by, created_at, decided_by, decided_at, decision_note)
            VALUES
              (:title, :body, :channel, :product_id, :media_url, :destination_url,
               :scheduled_at, 'approved', :actor, :now, :actor, :now, 'Approved managed change')
        """), {
            "title": str(changes.get("title") or "").strip(),
            "body": str(changes.get("body") or ""),
            "channel": changes["channel"],
            "product_id": changes.get("product_id"),
            "media_url": str(changes.get("media_url") or ""),
            "destination_url": str(changes.get("destination_url") or ""),
            "scheduled_at": str(changes.get("scheduled_at") or ""),
            "actor": actor,
            "now": _now(),
        })
        return f"Approved campaign draft created: {result.lastrowid}"
    if item["action_type"] == "sale_invoice_draft":
        customer_id = changes["customer_id"]
        customer = conn.execute(
            text("SELECT name FROM customers WHERE id=:id"), {"id": customer_id}
        ).mappings().first()
        if not customer:
            raise ValueError(f"Customer {customer_id} no longer exists")
        item_descriptions = []
        for entry in changes["items"]:
            product = conn.execute(
                text("SELECT name FROM products WHERE id=:id"), {"id": entry["product_id"]}
            ).mappings().first()
            if not product:
                raise ValueError(f"Product {entry['product_id']} no longer exists")
            item_descriptions.append(f"{product['name']} x{entry['quantity']}")
        # Deliberately does not create a live Invoice/GL entry here - approval
        # only confirms the request is well-formed. A staff member still
        # builds and reviews the real invoice through the normal Invoices
        # page (pre-filled from this request), the same "human does the
        # final step" pattern used for catalog orders and tiered pricing.
        return (
            f"Sale invoice draft ready for {customer['name']}: "
            + ", ".join(item_descriptions)
        )
    if item["action_type"] == "report_delivery":
        from app.report_delivery import generate_and_send_report

        result = generate_and_send_report(
            changes["report_type"], changes["format"], changes["destination_email"],
        )
        return (
            f"Report '{changes['report_type']}' ({changes['format'].upper()}) "
            f"to {changes['destination_email']}: {result['status']} - {result['detail']}"
        )
    raise HTTPException(status_code=400, detail="Unsupported action")


@router.post("/{request_id}/approve")
def approve_request(request_id: int, payload: DecisionPayload, request: Request):
    actor = _require_admin(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        item = _row(conn, request_id)
        if item["status"] != "pending_approval":
            raise HTTPException(status_code=409, detail="Request is not pending approval")
        if item["requested_by"] == actor:
            raise HTTPException(status_code=409, detail="Maker-checker violation: requester cannot approve")
        try:
            result = _apply(conn, item, actor)
            status = "applied"
        except HTTPException:
            raise
        except Exception as error:
            conn.execute(text("""
                UPDATE managed_change_requests SET status='failed', decided_by=:actor,
                decided_at=:now, decision_note=:note, apply_result=:result WHERE id=:id
            """), {"actor": actor, "now": _now(), "note": payload.note.strip(), "result": str(error), "id": request_id})
            _event(conn, request_id, "failed", actor, str(error))
            return {"status": "failed", "request_id": request_id, "detail": str(error)}
        conn.execute(text("""
            UPDATE managed_change_requests SET status=:status, decided_by=:actor,
            decided_at=:now, decision_note=:note, applied_at=:now,
            apply_result=:result WHERE id=:id
        """), {"status": status, "actor": actor, "now": _now(), "note": payload.note.strip(), "result": result, "id": request_id})
        _event(conn, request_id, "approved_and_applied", actor, result)
        return {"status": status, "request_id": request_id, "result": result}


@router.post("/{request_id}/reject")
def reject_request(request_id: int, payload: DecisionPayload, request: Request):
    actor = _require_admin(request)
    note = payload.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    with engine.begin() as conn:
        _ensure_schema(conn)
        item = _row(conn, request_id)
        if item["status"] != "pending_approval":
            raise HTTPException(status_code=409, detail="Request is not pending approval")
        conn.execute(text("""
            UPDATE managed_change_requests SET status='rejected', decided_by=:actor,
            decided_at=:now, decision_note=:note WHERE id=:id
        """), {"actor": actor, "now": _now(), "note": note, "id": request_id})
        _event(conn, request_id, "rejected", actor, note)
        return {"status": "rejected", "request_id": request_id}
