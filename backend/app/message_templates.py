"""Editable customer-facing message templates (payment reminders today,
extensible to any future channel/key) with a lightweight, admin-managed
allowlist of non-admin editors - "a team the manager has granted access
to", per the actual request, layered on top of the existing role system
rather than building a whole new per-permission grant engine.

Every key/channel/language combination has a hardcoded DEFAULT (the
original literal strings this module replaces); a company can override
any subset of them, and un-customized combinations keep working exactly
as before by falling back to the default text.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from app.company_scope import current_company_id

router = APIRouter(prefix="/api/message-templates", tags=["Message Templates"])

LANGUAGES = {"fa", "ar", "tr", "en"}

# Mirrors app/payment_reminders.py's _REMINDER_SUBJECTS/_REMINDER_BODIES -
# the single source of truth moves here; payment_reminders.py now calls
# get_effective_template() instead of reading its own module-level dicts.
DEFAULT_TEMPLATES = {
    ("payment_reminder_friendly", "email"): {
        "fa": {"subject": "یادآوری پرداخت فاکتور شماره {id}", "body": "سلام {name} عزیز،\n\nیادآوری می‌کنیم فاکتور شماره {id} به مبلغ {amount} هنوز تسویه نشده است. لطفاً هر زمان که ممکن بود نسبت به تسویه اقدام فرمایید.\n\nبا تشکر،\n{brand}"},
        "ar": {"subject": "تذكير بسداد الفاتورة رقم {id}", "body": "مرحبًا {name}،\n\nنود تذكيركم بأن الفاتورة رقم {id} بمبلغ {amount} لا تزال غير مسددة. يرجى التكرم بالتسوية في أقرب وقت ممكن.\n\nشكرًا لكم،\n{brand}"},
        "tr": {"subject": "{id} numaralı fatura için ödeme hatırlatması", "body": "Sayın {name},\n\n{id} numaralı, {amount} tutarındaki faturanızın henüz ödenmediğini hatırlatmak isteriz. Uygun olduğunuzda ödemeyi tamamlamanızı rica ederiz.\n\nTeşekkürler,\n{brand}"},
        "en": {"subject": "Payment reminder - Invoice #{id}", "body": "Dear {name},\n\nThis is a reminder that invoice #{id} for {amount} is still unpaid. Please arrange payment at your earliest convenience.\n\nThank you,\n{brand}"},
    },
    ("payment_reminder_firm", "email"): {
        "fa": {"subject": "پیگیری تسویه فاکتور معوق شماره {id}", "body": "سلام {name} عزیز،\n\nفاکتور شماره {id} به مبلغ {amount} بیش از یک هفته است که معوق مانده است. خواهشمندیم در اسرع وقت نسبت به تسویه یا هماهنگی با ما اقدام فرمایید.\n\nبا احترام،\n{brand}"},
        "ar": {"subject": "متابعة تسوية الفاتورة المتأخرة رقم {id}", "body": "مرحبًا {name}،\n\nالفاتورة رقم {id} بمبلغ {amount} متأخرة منذ أكثر من أسبوع. يرجى التسوية أو التواصل معنا في أقرب وقت.\n\nمع التقدير،\n{brand}"},
        "tr": {"subject": "{id} numaralı gecikmiş fatura takibi", "body": "Sayın {name},\n\n{id} numaralı, {amount} tutarındaki fatura bir haftadan uzun süredir gecikmiş durumda. Lütfen en kısa sürede ödeme yapın veya bizimle iletişime geçin.\n\nSaygılarımızla,\n{brand}"},
        "en": {"subject": "Follow-up: overdue invoice #{id}", "body": "Dear {name},\n\nInvoice #{id} for {amount} has now been overdue for more than a week. Please settle it or contact us as soon as possible.\n\nRegards,\n{brand}"},
    },
    ("payment_reminder_urgent", "email"): {
        "fa": {"subject": "اخطار نهایی: فاکتور شماره {id} به‌شدت معوق است", "body": "سلام {name} عزیز،\n\nفاکتور شماره {id} به مبلغ {amount} بیش از یک ماه است که تسویه نشده و نیازمند اقدام فوری است. لطفاً هرچه سریع‌تر با ما تماس بگیرید.\n\n{brand}"},
        "ar": {"subject": "إشعار نهائي: الفاتورة رقم {id} متأخرة جدًا", "body": "مرحبًا {name}،\n\nالفاتورة رقم {id} بمبلغ {amount} لم تُسدد منذ أكثر من شهر وتتطلب إجراءً فوريًا. يرجى التواصل معنا في أقرب وقت ممكن.\n\n{brand}"},
        "tr": {"subject": "Son uyarı: {id} numaralı fatura ciddi şekilde gecikti", "body": "Sayın {name},\n\n{id} numaralı, {amount} tutarındaki fatura bir aydan uzun süredir ödenmedi ve acil işlem gerektiriyor. Lütfen en kısa sürede bizimle iletişime geçin.\n\n{brand}"},
        "en": {"subject": "Final notice: invoice #{id} is seriously overdue", "body": "Dear {name},\n\nInvoice #{id} for {amount} has been unpaid for over a month and requires urgent attention. Please contact us as soon as possible.\n\n{brand}"},
    },
    ("invoice_payment_link", "message"): {
        "fa": {"subject": "", "body": "سلام {name} عزیز،\n\nبرای پرداخت امن مبلغ {amount} بابت فاکتور شماره {id} از لینک زیر استفاده کنید:\n{link}\n\nاین لینک مخصوص شماست و مستقیماً به {brand} متصل می‌شود.\n\nبا تشکر،\n{brand}"},
        "ar": {"subject": "", "body": "مرحبًا {name}،\n\nللدفع الآمن لمبلغ {amount} مقابل الفاتورة رقم {id}، استخدم الرابط التالي:\n{link}\n\nهذا الرابط خاص بك ويتصل مباشرة بـ {brand}.\n\nشكرًا لكم،\n{brand}"},
        "tr": {"subject": "", "body": "Sayın {name},\n\n{id} numaralı fatura için {amount} tutarını güvenle ödemek üzere aşağıdaki bağlantıyı kullanın:\n{link}\n\nBu bağlantı size özeldir ve doğrudan {brand} ile bağlantılıdır.\n\nTeşekkürler,\n{brand}"},
        "en": {"subject": "", "body": "Dear {name},\n\nTo securely pay {amount} for invoice #{id}, use the link below:\n{link}\n\nThis link is unique to you and connects directly to {brand}.\n\nThank you,\n{brand}"},
    },
    ("purchase_order_dispatch", "email"): {
        "fa": {"subject": "سفارش خرید شماره {id} از {brand}", "body": "سلام {name} عزیز،\n\nسفارش خرید شماره {id} به مبلغ {amount} برای شما ارسال شد. لطفاً پس از بررسی، تأیید یا زمان تحویل را اعلام فرمایید.\n\nبا تشکر،\n{brand}"},
        "ar": {"subject": "أمر الشراء رقم {id} من {brand}", "body": "مرحبًا {name}،\n\nتم إرسال أمر الشراء رقم {id} بمبلغ {amount} إليكم. يرجى المراجعة وتأكيد موعد التسليم.\n\nشكرًا لكم،\n{brand}"},
        "tr": {"subject": "{id} numaralı satın alma siparişi - {brand}", "body": "Sayın {name},\n\n{id} numaralı, {amount} tutarındaki satın alma siparişi size gönderildi. Lütfen inceleyip teslimat tarihini onaylayın.\n\nTeşekkürler,\n{brand}"},
        "en": {"subject": "Purchase order #{id} from {brand}", "body": "Dear {name},\n\nPurchase order #{id} for {amount} has been sent to you. Please review and confirm delivery timing.\n\nThank you,\n{brand}"},
    },
    ("campaign_promo", "message"): {
        "fa": {"subject": "", "body": "سلام {name} عزیز،\n\n{brand} پیشنهاد ویژه‌ای برای شما دارد. برای مشاهده جزئیات: {link}\n\nبرای توقف دریافت پیام‌های تبلیغاتی به ما اطلاع دهید."},
        "ar": {"subject": "", "body": "مرحبًا {name}،\n\nلدى {brand} عرض خاص لك. لعرض التفاصيل: {link}\n\nلإيقاف الرسائل الترويجية، يرجى إخبارنا."},
        "tr": {"subject": "", "body": "Sayın {name},\n\n{brand} sizin için özel bir teklif hazırladı. Detaylar için: {link}\n\nTanıtım mesajlarını almak istemiyorsanız lütfen bize bildirin."},
        "en": {"subject": "", "body": "Dear {name},\n\n{brand} has a special offer for you. See details: {link}\n\nTo stop receiving promotional messages, please let us know."},
    },
    ("purchase_order_dispatch", "message"): {
        "fa": {"subject": "", "body": "سلام {name} عزیز،\n\nسفارش خرید شماره {id} به مبلغ {amount} برای شما ارسال شد. لطفاً تأیید فرمایید.\n\n{brand}"},
        "ar": {"subject": "", "body": "مرحبًا {name}،\n\nتم إرسال أمر الشراء رقم {id} بمبلغ {amount} إليكم. يرجى التأكيد.\n\n{brand}"},
        "tr": {"subject": "", "body": "Sayın {name},\n\n{id} numaralı, {amount} tutarındaki satın alma siparişi size gönderildi. Lütfen onaylayın.\n\n{brand}"},
        "en": {"subject": "", "body": "Dear {name},\n\nPurchase order #{id} for {amount} has been sent to you. Please confirm.\n\n{brand}"},
    },
}

KEY_LABELS = {
    "payment_reminder_friendly": {"fa": "یادآوری پرداخت - لحن دوستانه", "ar": "تذكير الدفع - ودّي", "tr": "Ödeme hatırlatma - dostane", "en": "Payment reminder - friendly"},
    "payment_reminder_firm": {"fa": "یادآوری پرداخت - لحن جدی", "ar": "تذكير الدفع - حازم", "tr": "Ödeme hatırlatma - kararlı", "en": "Payment reminder - firm"},
    "payment_reminder_urgent": {"fa": "یادآوری پرداخت - اخطار نهایی", "ar": "تذكير الدفع - إشعار نهائي", "tr": "Ödeme hatırlatma - son uyarı", "en": "Payment reminder - urgent"},
    "invoice_payment_link": {"fa": "لینک پرداخت امن فاکتور", "ar": "رابط الدفع الآمن للفاتورة", "tr": "Güvenli fatura ödeme bağlantısı", "en": "Secure invoice payment link"},
    "purchase_order_dispatch": {"fa": "ارسال سفارش خرید به تأمین‌کننده", "ar": "إرسال أمر الشراء إلى المورد", "tr": "Satın alma siparişini tedarikçiye gönder", "en": "Purchase order dispatch to supplier"},
    "campaign_promo": {"fa": "پیام تبلیغاتی کمپین", "ar": "رسالة الحملة الترويجية", "tr": "Kampanya tanıtım mesajı", "en": "Campaign promotional message"},
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS message_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_key VARCHAR NOT NULL,
            channel VARCHAR NOT NULL DEFAULT 'email',
            language VARCHAR NOT NULL,
            subject VARCHAR DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            updated_by INTEGER,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER,
            UNIQUE(template_key, channel, language, company_id)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS message_template_editors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            company_id INTEGER,
            granted_by INTEGER,
            granted_at VARCHAR NOT NULL,
            UNIQUE(user_id, company_id)
        )
    """))


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
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user_id


def _require_template_editor(request: Request):
    user_id, role = _auth(request)
    if role == "admin":
        return user_id
    with engine.begin() as conn:
        _ensure_schema(conn)
        allowed = conn.execute(text("""
            SELECT 1 FROM message_template_editors WHERE user_id=:user_id AND company_id=:company_id
        """), {"user_id": user_id, "company_id": current_company_id(request)}).first()
    if not allowed:
        raise HTTPException(status_code=403, detail="You don't have permission to edit message templates")
    return user_id


def get_effective_template(db_conn, template_key: str, channel: str, language: str, company_id) -> dict:
    """Used by payment_reminders.py (and any future sender) - DB override
    if the company customized this combination, otherwise the built-in
    default. Never raises: an unknown key/language just falls back to the
    English default so a sender never breaks over a missing template.

    Deliberately a read-only sqlite_master existence check rather than
    calling _ensure_schema() (a write) on a connection/transaction this
    function doesn't own - callers pass in db.connection() from their own
    already-open session, and running a write there from a shared helper
    is exactly the nested-transaction lock pattern this codebase has hit
    before (see invoice_settled_amount()'s identical guard)."""
    row = None
    table_exists = db_conn.execute(text(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='message_templates'"
    )).first()
    if table_exists:
        row = db_conn.execute(text("""
            SELECT subject, body FROM message_templates
            WHERE template_key=:key AND channel=:channel AND language=:language AND company_id=:company_id
        """), {"key": template_key, "channel": channel, "language": language, "company_id": company_id}).mappings().first()
    if row and (row["body"] or "").strip():
        return {"subject": row["subject"] or "", "body": row["body"]}
    defaults = DEFAULT_TEMPLATES.get((template_key, channel), {})
    return defaults.get(language) or defaults.get("en") or {"subject": "", "body": ""}


class TemplateUpdate(BaseModel):
    subject: str = Field(default="", max_length=300)
    body: str = Field(min_length=1, max_length=5000)


@router.get("")
def list_templates(request: Request):
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        overrides = {
            (row["template_key"], row["channel"], row["language"]): row
            for row in conn.execute(text("""
                SELECT template_key, channel, language, subject, body, updated_at
                FROM message_templates WHERE company_id=:company_id
            """), {"company_id": company_id}).mappings().all()
        }
    items = []
    for (key, channel), by_language in DEFAULT_TEMPLATES.items():
        for language, default in by_language.items():
            override = overrides.get((key, channel, language))
            items.append({
                "key": key,
                "channel": channel,
                "language": language,
                "label": KEY_LABELS.get(key, {}).get(language) or KEY_LABELS.get(key, {}).get("en") or key,
                "subject": override["subject"] if override else default["subject"],
                "body": override["body"] if override else default["body"],
                "default_subject": default["subject"],
                "default_body": default["body"],
                "is_customized": bool(override),
                "updated_at": override["updated_at"] if override else None,
            })
    return {"items": items}


@router.put("/{template_key}/{channel}/{language}")
def upsert_template(template_key: str, channel: str, language: str, data: TemplateUpdate, request: Request):
    if (template_key, channel) not in DEFAULT_TEMPLATES:
        raise HTTPException(status_code=404, detail="Unknown template key/channel")
    if language not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"language must be one of: {', '.join(sorted(LANGUAGES))}")
    user_id = _require_template_editor(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            INSERT INTO message_templates (template_key, channel, language, subject, body, updated_by, updated_at, company_id)
            VALUES (:key, :channel, :language, :subject, :body, :actor, :now, :company_id)
            ON CONFLICT(template_key, channel, language, company_id) DO UPDATE SET
              subject=excluded.subject, body=excluded.body, updated_by=excluded.updated_by, updated_at=excluded.updated_at
        """), {
            "key": template_key, "channel": channel, "language": language,
            "subject": data.subject.strip(), "body": data.body,
            "actor": user_id, "now": _now(), "company_id": company_id,
        })
    return {"status": "saved"}


@router.post("/{template_key}/{channel}/{language}/reset")
def reset_template(template_key: str, channel: str, language: str, request: Request):
    _require_template_editor(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            DELETE FROM message_templates WHERE template_key=:key AND channel=:channel AND language=:language AND company_id=:company_id
        """), {"key": template_key, "channel": channel, "language": language, "company_id": company_id})
    return {"status": "reset"}


@router.get("/editors")
def list_editors(request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT e.user_id, u.full_name, u.username
            FROM message_template_editors e
            LEFT JOIN users u ON u.id = e.user_id
            WHERE e.company_id=:company_id
            ORDER BY u.full_name
        """), {"company_id": company_id}).mappings().all()
    return {"items": [dict(row) for row in rows]}


class EditorGrant(BaseModel):
    user_id: int


@router.post("/editors")
def grant_editor(data: EditorGrant, request: Request):
    actor = _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        exists = conn.execute(text("SELECT 1 FROM users WHERE id=:id"), {"id": data.user_id}).first()
        if not exists:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(text("""
            INSERT INTO message_template_editors (user_id, company_id, granted_by, granted_at)
            VALUES (:user_id, :company_id, :actor, :now)
            ON CONFLICT(user_id, company_id) DO NOTHING
        """), {"user_id": data.user_id, "company_id": company_id, "actor": actor, "now": _now()})
    return {"status": "granted"}


@router.delete("/editors/{user_id}")
def revoke_editor(user_id: int, request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            DELETE FROM message_template_editors WHERE user_id=:user_id AND company_id=:company_id
        """), {"user_id": user_id, "company_id": company_id})
    return {"status": "revoked"}
