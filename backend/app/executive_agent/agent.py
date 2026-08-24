"""Executive Conversational Agent - orchestration, conversation storage,
Telegram binding, and settings (Task 05).

Pipeline (per the task spec's own Section 1):
  message -> intent classification (intents.py, Layer 1, not AI) ->
  period resolution (periods.py) -> RBAC-checked tool call (tools.py,
  the ONLY way this module touches business data) -> response composition
  -> conversation/tool-run audit storage.

No LLM, STT, or TTS provider exists anywhere in this codebase (confirmed
fresh for this task - see the completion report). Voice input/output are
therefore exposed only as an honest "not configured" status via
SpeechToTextProvider/TextToSpeechProvider below, never faked.
"""
import json
import secrets
import time
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.company_scope import current_company_id
from app.database import engine

from . import periods as periods_module
from .intents import classify_intent, extract_branch_name, is_bare_follow_up
from .tools import TOOLS, run_tool

router = APIRouter(prefix="/api/executive-agent", tags=["Executive Agent"])

ALLOWED_ROLES = {"admin", "accountant"}
BINDING_CODE_TTL_MINUTES = 10

# Coarse report category per tool, for the external-channel (Telegram)
# allow-list policy - see task spec Section 26/33. No tool here ever
# touches HR compensation or banking data at all (those live in separate,
# already-admin-only modules this agent's tool registry doesn't include),
# so the policy is a genuine extra layer, not the only safeguard.
CATEGORY_BY_TOOL = {
    "daily_company_summary": "summary",
    "sales_summary": "sales",
    "profit_summary": "sales",
    "cashflow_summary": "cash",
    "receivables_summary": "receivables",
    "payables_summary": "receivables",
    "cheque_summary": "cheques",
    "inventory_risk_summary": "inventory",
    "branch_performance": "sales",
    "budget_variance": "budget",
    "campaign_performance": "campaigns",
    "customer_risk_summary": "customers",
    "open_executive_alerts": "alerts",
    "improvement_plan_status": "improvement",
}
DEFAULT_ALLOWED_CATEGORIES = ["summary", "sales", "cash", "receivables", "cheques", "inventory", "alerts", "improvement", "budget", "campaigns", "customers"]

WRITE_TRIGGER_WORDS = [
    "یادآوری بفرست", "پیام بفرست", "ارسال کن",
    "أرسل تذكيرًا", "أرسل رسالة",
    "hatırlatma gönder", "mesaj gönder",
    "send reminder", "send message",
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS executive_agent_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            channel VARCHAR NOT NULL DEFAULT 'app',
            context_json TEXT NOT NULL DEFAULT '{}',
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS executive_agent_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role VARCHAR NOT NULL,
            text TEXT NOT NULL,
            language VARCHAR DEFAULT 'en',
            intent VARCHAR,
            period_json TEXT,
            evidence_json TEXT,
            created_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS executive_agent_tool_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER,
            tool VARCHAR NOT NULL,
            parameters_json TEXT NOT NULL DEFAULT '{}',
            status VARCHAR NOT NULL,
            execution_ms INTEGER,
            result_summary_json TEXT,
            error VARCHAR,
            actor_user_id INTEGER,
            channel VARCHAR,
            created_at VARCHAR NOT NULL,
            company_id INTEGER
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS executive_agent_external_bindings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            provider VARCHAR NOT NULL,
            external_identity VARCHAR,
            verified BOOLEAN NOT NULL DEFAULT 0,
            binding_code VARCHAR,
            code_expires_at VARCHAR,
            created_at VARCHAR NOT NULL,
            verified_at VARCHAR,
            revoked_at VARCHAR,
            company_id INTEGER,
            UNIQUE(provider, external_identity)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS executive_agent_settings (
            company_id INTEGER PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            default_branch_id INTEGER,
            allowed_categories_json TEXT NOT NULL DEFAULT '[]',
            updated_at VARCHAR NOT NULL
        )
    """))
    from app.company_scope import ensure_company_id_column
    for tbl in ("executive_agent_conversations", "executive_agent_messages", "executive_agent_tool_runs", "executive_agent_external_bindings"):
        ensure_company_id_column(conn, tbl)


def _auth(request: Request):
    auth = getattr(request.state, "auth", {})
    try:
        user_id = int(auth["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication context")
    role = str(auth.get("role") or "viewer").lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Executive Agent access requires an admin or accountant role")
    return user_id, role


def _json_default(value):
    if isinstance(value, date):
        return value.isoformat()
    raise TypeError(f"Not JSON serializable: {value!r}")


def _dumps(value):
    return json.dumps(value, ensure_ascii=False, default=_json_default)


def _get_settings(conn, company_id):
    row = conn.execute(text("SELECT * FROM executive_agent_settings WHERE company_id=:company_id"), {"company_id": company_id}).mappings().first()
    if not row:
        return {"enabled": True, "default_branch_id": None, "allowed_categories": list(DEFAULT_ALLOWED_CATEGORIES)}
    categories = json.loads(row["allowed_categories_json"] or "[]") or list(DEFAULT_ALLOWED_CATEGORIES)
    return {"enabled": bool(row["enabled"]), "default_branch_id": row["default_branch_id"], "allowed_categories": categories}


def _branch_names(conn, company_id):
    from app.branches import _ensure_schema as _ensure_branches_schema
    _ensure_branches_schema(conn)
    rows = conn.execute(text("SELECT id, name FROM branches WHERE company_id=:company_id AND active=1"), {"company_id": company_id}).mappings().all()
    return [dict(r) for r in rows]


def _log_tool_run(conn, conversation_id, company_id, actor_user_id, channel, tool, parameters, status, started_at, result=None, error=None):
    conn.execute(text("""
        INSERT INTO executive_agent_tool_runs
          (conversation_id, tool, parameters_json, status, execution_ms, result_summary_json, error, actor_user_id, channel, created_at, company_id)
        VALUES
          (:conversation_id, :tool, :parameters, :status, :execution_ms, :result_summary, :error, :actor, :channel, :now, :company_id)
    """), {
        "conversation_id": conversation_id, "tool": tool, "parameters": _dumps(parameters), "status": status,
        "execution_ms": int((time.monotonic() - started_at) * 1000),
        "result_summary": _dumps(result)[:4000] if result is not None else None,
        "error": (error or "")[:500], "actor": actor_user_id, "channel": channel, "now": _now(), "company_id": company_id,
    })


def _route_write_action(conn, actor_user_id, company_id, text_message):
    """Task 05, Section 11: any write-intent request is NEVER executed by
    this agent - it is turned into a real 'note_only' draft row in the
    EXISTING Change Request Center (app/change_requests.py), reusing that
    module's own schema-ensure/event-log functions rather than duplicating
    them. A draft still requires the manager's own explicit submit, then a
    second person's approval, exactly like every other change request -
    the agent cannot submit or approve on the manager's behalf."""
    from app.change_requests import _ensure_schema as _ensure_change_requests_schema
    from app.change_requests import _event as _change_request_event

    _ensure_change_requests_schema(conn)
    result = conn.execute(text("""
        INSERT INTO managed_change_requests
          (source, source_reference, audio_reference, transcript, action_type,
           target_id, proposed_changes, status, requested_by, requested_at, company_id)
        VALUES
          ('in_app', 'executive_agent', '', :transcript, 'note_only',
           NULL, '{}', 'draft', :actor, :now, :company_id)
    """), {"transcript": text_message[:10000], "actor": actor_user_id, "now": _now(), "company_id": company_id})
    request_id = result.lastrowid
    _change_request_event(conn, request_id, "created", actor_user_id, "source=executive_agent")
    return request_id


def _store_message(conn, conversation_id, company_id, role, text_value, language, intent=None, period=None, evidence=None):
    conn.execute(text("""
        INSERT INTO executive_agent_messages (conversation_id, role, text, language, intent, period_json, evidence_json, created_at, company_id)
        VALUES (:conversation_id, :role, :text, :language, :intent, :period, :evidence, :now, :company_id)
    """), {
        "conversation_id": conversation_id, "role": role, "text": text_value, "language": language,
        "intent": intent, "period": _dumps(period) if period else None, "evidence": _dumps(evidence) if evidence else None,
        "now": _now(), "company_id": company_id,
    })


_CLARIFICATION_NO_INTENT = {
    "fa": "متوجه نشدم دقیقاً چه گزارشی می‌خواهید. می‌توانید یکی از این‌ها را بپرسید: خلاصه امروز، فروش، سود، مطالبات، چک‌ها، موجودی، بودجه، مهم‌ترین مشکلات.",
    "ar": "لم أفهم التقرير المطلوب بالضبط. يمكنك أن تسأل عن: ملخص اليوم، المبيعات، الربح، المستحقات، الشيكات، المخزون، الميزانية، أهم المشاكل.",
    "tr": "Tam olarak hangi raporu istediğinizi anlayamadım. Şunlardan birini sorabilirsiniz: bugünkü özet, satışlar, kâr, alacaklar, çekler, stok, bütçe, en önemli sorunlar.",
    "en": "I couldn't tell exactly which report you want. You can ask about: today's summary, sales, profit, receivables, cheques, inventory, budget, or the most important open issues.",
}
_CLARIFICATION_BRANCH = {
    "fa": "کدام شعبه؟ گزینه‌ها: {branches}",
    "ar": "أي فرع؟ الخيارات: {branches}",
    "tr": "Hangi şube? Seçenekler: {branches}",
    "en": "Which branch? Options: {branches}",
}
_CLARIFICATION_PROFIT = {
    "fa": "منظورتان سود ناخالص است یا سود خالص؟",
    "ar": "هل تقصد الربح الإجمالي أم الربح الصافي؟",
    "tr": "Brüt kârı mı yoksa net kârı mı kastediyorsunuz?",
    "en": "Do you mean gross profit or net profit?",
}
_PERMISSION_DENIED = {
    "fa": "دسترسی لازم برای این گزارش را ندارید.",
    "ar": "ليس لديك الصلاحية اللازمة لهذا التقرير.",
    "tr": "Bu rapor için gerekli yetkiye sahip değilsiniz.",
    "en": "You don't have permission for this report.",
}
_CATEGORY_BLOCKED = {
    "fa": "این دسته گزارش از طریق کانال خارجی مجاز نیست.",
    "ar": "هذه الفئة من التقارير غير مسموح بها عبر القناة الخارجية.",
    "tr": "Bu rapor kategorisi harici kanal üzerinden izinli değil.",
    "en": "This report category isn't allowed over this external channel.",
}
_UNAVAILABLE = {
    "fa": "این اطلاعات در حال حاضر در دسترس نیست.",
    "ar": "هذه المعلومات غير متوفرة حاليًا.",
    "tr": "Bu bilgi şu anda kullanılamıyor.",
    "en": "This information isn't available right now.",
}


def _tr(table, language):
    return table.get(language, table["en"])


def _format_money(value):
    try:
        return f"{float(value):,.0f}"
    except (TypeError, ValueError):
        return str(value)


def _compose_response(tool_name, result, language, period_label):
    """Executive Response Composer - direct answer first, then a handful
    of supporting figures, per the task spec's Section 9. Built entirely
    from the tool's own real output; never adds a number that didn't come
    from `result`."""
    lines = []
    if tool_name == "daily_company_summary":
        lines.append(_tr({
            "fa": f"فروش امروز {_format_money(result['sales_today'])} بوده.",
            "ar": f"بلغت مبيعات اليوم {_format_money(result['sales_today'])}.",
            "tr": f"Bugünkü satış {_format_money(result['sales_today'])}.",
            "en": f"Today's sales are {_format_money(result['sales_today'])}.",
        }, language))
        lines.append(_tr({
            "fa": f"دریافتی: {_format_money(result['collections_today'])} · پرداختی: {_format_money(result['payments_today'])}",
            "ar": f"التحصيل: {_format_money(result['collections_today'])} · المدفوعات: {_format_money(result['payments_today'])}",
            "tr": f"Tahsilat: {_format_money(result['collections_today'])} · Ödeme: {_format_money(result['payments_today'])}",
            "en": f"Collections: {_format_money(result['collections_today'])} · Payments: {_format_money(result['payments_today'])}",
        }, language))
        if result["critical_alert_count"]:
            lines.append(_tr({
                "fa": f"{result['critical_alert_count']} مورد بحرانی نیاز به بررسی دارد.",
                "ar": f"{result['critical_alert_count']} حالة حرجة تحتاج للمراجعة.",
                "tr": f"{result['critical_alert_count']} kritik durum incelenmeli.",
                "en": f"{result['critical_alert_count']} critical item(s) need review.",
            }, language))
    elif tool_name == "sales_summary":
        lines.append(_tr({
            "fa": f"فروش {period_label}: {_format_money(result['total_sales'])} ({result['invoice_count']} فاکتور)",
            "ar": f"مبيعات {period_label}: {_format_money(result['total_sales'])} ({result['invoice_count']} فاتورة)",
            "tr": f"{period_label} satışı: {_format_money(result['total_sales'])} ({result['invoice_count']} fatura)",
            "en": f"Sales for {period_label}: {_format_money(result['total_sales'])} ({result['invoice_count']} invoices)",
        }, language))
        if result.get("variance_percent") is not None:
            direction = "up" if result["variance_percent"] >= 0 else "down"
            lines.append(_tr({
                "fa": f"نسبت به دوره قبل: {result['variance_percent']}%",
                "ar": f"مقارنة بالفترة السابقة: {result['variance_percent']}%",
                "tr": f"önceki döneme göre: %{result['variance_percent']}",
                "en": f"{direction} {abs(result['variance_percent'])}% vs. the prior period",
            }, language))
        if result.get("limitation"):
            lines.append(result["limitation"])
    elif tool_name == "profit_summary":
        lines.append(_tr({
            "fa": f"سود خالص {period_label}: {_format_money(result['net_profit'])} (حاشیه {result['margin_percent']}%)",
            "ar": f"الربح الصافي {period_label}: {_format_money(result['net_profit'])} (هامش {result['margin_percent']}%)",
            "tr": f"{period_label} net kâr: {_format_money(result['net_profit'])} (marj %{result['margin_percent']})",
            "en": f"Net profit for {period_label}: {_format_money(result['net_profit'])} (margin {result['margin_percent']}%)",
        }, language))
        lines.append(_tr({
            "fa": f"سود ناخالص: {_format_money(result['gross_profit'])}",
            "ar": f"الربح الإجمالي: {_format_money(result['gross_profit'])}",
            "tr": f"Brüt kâr: {_format_money(result['gross_profit'])}",
            "en": f"Gross profit: {_format_money(result['gross_profit'])}",
        }, language))
        if result.get("limitation"):
            lines.append(result["limitation"])
    elif tool_name == "cashflow_summary":
        lines.append(_tr({
            "fa": f"دریافتی {period_label}: {_format_money(result['receipts'])} · پرداختی: {_format_money(result['payments'])}",
            "ar": f"التحصيل {period_label}: {_format_money(result['receipts'])} · المدفوعات: {_format_money(result['payments'])}",
            "tr": f"{period_label} tahsilat: {_format_money(result['receipts'])} · ödeme: {_format_money(result['payments'])}",
            "en": f"Receipts for {period_label}: {_format_money(result['receipts'])} · Payments: {_format_money(result['payments'])}",
        }, language))
    elif tool_name == "receivables_summary":
        lines.append(_tr({
            "fa": f"مطالبات معوق: {_format_money(result['overdue_receivable'])} از {_format_money(result['total_receivable'])} کل",
            "ar": f"المستحقات المتأخرة: {_format_money(result['overdue_receivable'])} من إجمالي {_format_money(result['total_receivable'])}",
            "tr": f"Gecikmiş alacak: {_format_money(result['overdue_receivable'])} / toplam {_format_money(result['total_receivable'])}",
            "en": f"Overdue receivables: {_format_money(result['overdue_receivable'])} out of {_format_money(result['total_receivable'])} total",
        }, language))
        if result.get("limitation"):
            lines.append(result["limitation"])
    elif tool_name == "payables_summary":
        lines.append(_tr({
            "fa": f"بدهی معوق: {_format_money(result['overdue_payable'])} از {_format_money(result['total_payable'])} کل",
            "ar": f"المدفوعات المتأخرة: {_format_money(result['overdue_payable'])} من إجمالي {_format_money(result['total_payable'])}",
            "tr": f"Gecikmiş borç: {_format_money(result['overdue_payable'])} / toplam {_format_money(result['total_payable'])}",
            "en": f"Overdue payables: {_format_money(result['overdue_payable'])} out of {_format_money(result['total_payable'])} total",
        }, language))
    elif tool_name == "cheque_summary":
        lines.append(_tr({
            "fa": f"چک دریافتنی: {result['incoming_count']} ({_format_money(result['incoming_amount'])}) · چک پرداختنی: {result['outgoing_count']} ({_format_money(result['outgoing_amount'])})",
            "ar": f"شيكات واردة: {result['incoming_count']} ({_format_money(result['incoming_amount'])}) · شيكات صادرة: {result['outgoing_count']} ({_format_money(result['outgoing_amount'])})",
            "tr": f"Alınan çek: {result['incoming_count']} ({_format_money(result['incoming_amount'])}) · Verilen çek: {result['outgoing_count']} ({_format_money(result['outgoing_amount'])})",
            "en": f"Incoming cheques: {result['incoming_count']} ({_format_money(result['incoming_amount'])}) · Outgoing: {result['outgoing_count']} ({_format_money(result['outgoing_amount'])})",
        }, language))
        if result["overdue_count"]:
            lines.append(_tr({"fa": f"{result['overdue_count']} چک سررسید گذشته.", "ar": f"{result['overdue_count']} شيك متأخر.", "tr": f"{result['overdue_count']} vadesi geçmiş çek.", "en": f"{result['overdue_count']} cheque(s) overdue."}, language))
    elif tool_name == "inventory_risk_summary":
        branch_name = result.get("branch_name")
        if branch_name:
            lines.append(_tr({
                "fa": f"شعبه {branch_name}: {result['low_stock_count']} کالا کمبود موجودی و {result['dead_stock_count']} کالا راکد دارند.",
                "ar": f"فرع {branch_name}: {result['low_stock_count']} منتج بمخزون منخفض و{result['dead_stock_count']} منتج راكد.",
                "tr": f"{branch_name} şubesi: {result['low_stock_count']} üründe düşük stok, {result['dead_stock_count']} üründe durgun stok var.",
                "en": f"{branch_name} branch: {result['low_stock_count']} products are low on stock and {result['dead_stock_count']} are dead stock.",
            }, language))
        else:
            lines.append(_tr({
                "fa": f"{result['low_stock_count']} کالا کمبود موجودی و {result['dead_stock_count']} کالا راکد دارند.",
                "ar": f"{result['low_stock_count']} منتج بمخزون منخفض و{result['dead_stock_count']} منتج راكد.",
                "tr": f"{result['low_stock_count']} üründe düşük stok, {result['dead_stock_count']} üründe durgun stok var.",
                "en": f"{result['low_stock_count']} products are low on stock and {result['dead_stock_count']} are dead stock.",
            }, language))
    elif tool_name == "branch_performance":
        if not result["branches"]:
            lines.append(result.get("limitation") or _tr(_UNAVAILABLE, language))
        else:
            top = result["branches"][0]
            lines.append(_tr({
                "fa": f"بهترین فروش {period_label}: شعبه {top['branch_name']} با {_format_money(top['sales'])}",
                "ar": f"أفضل مبيعات {period_label}: فرع {top['branch_name']} بمبلغ {_format_money(top['sales'])}",
                "tr": f"{period_label} en iyi satış: {top['branch_name']} şubesi, {_format_money(top['sales'])}",
                "en": f"Best sales for {period_label}: {top['branch_name']} branch with {_format_money(top['sales'])}",
            }, language))
            if result.get("limitation"):
                lines.append(result["limitation"])
    elif tool_name == "budget_variance":
        if not result["plans"]:
            lines.append(result.get("limitation") or _tr(_UNAVAILABLE, language))
        else:
            plan = result["plans"][0]
            over = plan["actual_expense"] - plan["planned_expense"]
            lines.append(_tr({
                "fa": f"بودجه «{plan['plan_name']}»: مصرف {_format_money(plan['actual_expense'])} از {_format_money(plan['planned_expense'])} برنامه‌ریزی‌شده" + (f" ({_format_money(over)} بیش از بودجه)" if over > 0 else ""),
                "ar": f"ميزانية «{plan['plan_name']}»: {_format_money(plan['actual_expense'])} من أصل {_format_money(plan['planned_expense'])} مخطط",
                "tr": f"«{plan['plan_name']}» bütçesi: planlanan {_format_money(plan['planned_expense'])} üzerinden {_format_money(plan['actual_expense'])} harcandı",
                "en": f"Budget '{plan['plan_name']}': spent {_format_money(plan['actual_expense'])} of {_format_money(plan['planned_expense'])} planned" + (f" ({_format_money(over)} over budget)" if over > 0 else ""),
            }, language))
    elif tool_name == "campaign_performance":
        lines.append(_tr({
            "fa": f"{result['total_campaigns']} کمپین ({result['published_campaigns']} منتشرشده)",
            "ar": f"{result['total_campaigns']} حملة ({result['published_campaigns']} منشورة)",
            "tr": f"{result['total_campaigns']} kampanya ({result['published_campaigns']} yayınlandı)",
            "en": f"{result['total_campaigns']} campaigns ({result['published_campaigns']} published)",
        }, language))
        lines.append(result["limitation"])
    elif tool_name == "customer_risk_summary":
        lines.append(_tr({
            "fa": f"{result['risky_customer_count']} مشتری پرریسک شناسایی شد.",
            "ar": f"تم تحديد {result['risky_customer_count']} عميل عالي المخاطر.",
            "tr": f"{result['risky_customer_count']} riskli müşteri belirlendi.",
            "en": f"{result['risky_customer_count']} risky customers identified.",
        }, language))
    elif tool_name == "open_executive_alerts":
        lines.append(_tr({
            "fa": f"{result['counts']['critical']} بحرانی و {result['counts']['warning']} هشدار باز است.",
            "ar": f"{result['counts']['critical']} حرج و{result['counts']['warning']} تحذير مفتوح.",
            "tr": f"{result['counts']['critical']} kritik ve {result['counts']['warning']} uyarı açık.",
            "en": f"{result['counts']['critical']} critical and {result['counts']['warning']} warning item(s) open.",
        }, language))
        for item in result["items"][:3]:
            lines.append(f"· {item['title']}")
    elif tool_name == "improvement_plan_status":
        if not result["items"]:
            lines.append(_tr({"fa": "موردی یافت نشد.", "ar": "لم يتم العثور على شيء.", "tr": "Bir şey bulunamadı.", "en": "Nothing found."}, language))
        for item in result["items"][:3]:
            lines.append(f"· {item['finding']} — {item['status']} ({item.get('current_metric')})")
    return "\n".join(lines) if lines else _tr(_UNAVAILABLE, language)


def _reply_and_close(conn, conversation_id, company_id, reply, language, status, intent=None, extra=None):
    _store_message(conn, conversation_id, company_id, "agent", reply, language, intent=intent)
    conn.execute(text("UPDATE executive_agent_conversations SET updated_at=:now WHERE id=:id"), {"now": _now(), "id": conversation_id})
    return {"conversation_id": conversation_id, "text": reply, "status": status, **(extra or {})}


def answer_question(user_id, role, company_id, text_message, conversation_id=None, channel="app", language="en", branch_id=None, engine=engine):
    """The single orchestration entry point - text in, structured answer
    out. Used identically by the in-app chat endpoint and the Telegram
    bound-chat handler, so both channels get the exact same RBAC/evidence/
    audit guarantees. See verify_binding_code's docstring for why this
    accepts an explicit engine.

    Deliberately does NOT hold one open transaction for the whole function:
    run_tool() below calls into other modules (executive_alerts, aging,
    treasury, budget_plans, ...) that each open their OWN short
    engine.begin()/SessionLocal - nesting a second write transaction from
    this function on top of an already-open one is exactly what causes
    SQLite's single-writer lock to raise "database is locked" under this
    codebase's setup (the same class of bug fixed in Task 04's
    bi_improvement.recalculate_findings). Every DB touch here therefore
    uses its own short-lived `with engine.begin() as conn:` block, and
    run_tool() is always called with no connection of this function's own
    held open."""
    with engine.begin() as conn:
        _ensure_schema(conn)
        settings = _get_settings(conn, company_id)
        if not settings["enabled"]:
            return {"conversation_id": conversation_id, "text": _tr({"fa": "دستیار مدیریتی غیرفعال است.", "ar": "المساعد التنفيذي معطل.", "tr": "Yönetici asistanı devre dışı.", "en": "The Executive Agent is disabled."}, language), "status": "disabled"}

        if conversation_id:
            convo = conn.execute(text("SELECT * FROM executive_agent_conversations WHERE id=:id AND company_id=:company_id AND user_id=:user_id"), {"id": conversation_id, "company_id": company_id, "user_id": user_id}).mappings().first()
            if not convo:
                raise HTTPException(status_code=404, detail="Conversation not found")
        else:
            now = _now()
            result = conn.execute(text("""
                INSERT INTO executive_agent_conversations (user_id, channel, context_json, created_at, updated_at, company_id)
                VALUES (:user_id, :channel, '{}', :now, :now, :company_id)
            """), {"user_id": user_id, "channel": channel, "now": now, "company_id": company_id})
            conversation_id = result.lastrowid
            convo = {"id": conversation_id, "context_json": "{}"}

        context = json.loads(convo["context_json"] or "{}")
        _store_message(conn, conversation_id, company_id, "user", text_message, language)

        if any(w in text_message.lower() for w in WRITE_TRIGGER_WORDS):
            request_id = _route_write_action(conn, user_id, company_id, text_message)
            reply = _tr({
                "fa": f"این یک عملیات نوشتنی است و بلافاصله اجرا نمی‌شود. یک درخواست تغییر پیش‌نویس (#{request_id}) در مرکز درخواست‌های تغییر ایجاد شد؛ لطفاً آن را بررسی و تأیید کنید.",
                "ar": f"هذا إجراء كتابة ولن يُنفَّذ فورًا. تم إنشاء طلب تغيير كمسودة (#{request_id}) في مركز طلبات التغيير؛ يرجى مراجعته والموافقة عليه.",
                "tr": f"Bu bir yazma işlemi ve hemen çalıştırılmaz. Değişiklik İsteği Merkezi'nde bir taslak istek (#{request_id}) oluşturuldu; lütfen inceleyip onaylayın.",
                "en": f"This is a write action and is not executed immediately. A draft change request (#{request_id}) was created in the Change Request Center - please review and approve it there.",
            }, language)
            return _reply_and_close(conn, conversation_id, company_id, reply, language, "confirmation_required", "write_action_routed", {"change_request_id": request_id})

        branches = _branch_names(conn, company_id)
        named_branch = extract_branch_name(text_message, [b["name"] for b in branches])
        resolved_branch_id = next((b["id"] for b in branches if b["name"] == named_branch), None) if named_branch else branch_id

        period = periods_module.resolve_period(text_message, language)
        classification = classify_intent(text_message)

        if classification is None and is_bare_follow_up(text_message) and context.get("tool"):
            tool_name = context["tool"]
            params = dict(context.get("params", {}))
        elif classification is None:
            if period and context.get("tool"):
                tool_name = context["tool"]
                params = dict(context.get("params", {}))
            else:
                return _reply_and_close(conn, conversation_id, company_id, _tr(_CLARIFICATION_NO_INTENT, language), language, "needs_clarification")
        else:
            tool_name = classification["intent"]
            params = {}
            if classification.get("needs_profit_clarification"):
                return _reply_and_close(conn, conversation_id, company_id, _tr(_CLARIFICATION_PROFIT, language), language, "needs_clarification")

        if tool_name == "branch_performance" and resolved_branch_id is None and len(branches) > 1 and "همه" not in text_message and "all" not in text_message.lower():
            reply = _tr(_CLARIFICATION_BRANCH, language).format(branches=", ".join(b["name"] for b in branches))
            return _reply_and_close(conn, conversation_id, company_id, reply, language, "needs_clarification")

        if resolved_branch_id is not None:
            params["branch_id"] = resolved_branch_id
        if period:
            params["start_date"], params["end_date"] = period["start_date"], period["end_date"]
            period_label = periods_module.format_period_label(period, language)
        elif "start_date" in params:
            period_label = f"{params['start_date']} .. {params['end_date']}"
        else:
            period_label = _tr({"fa": "امروز", "ar": "اليوم", "tr": "bugün", "en": "today"}, language)

        category = CATEGORY_BY_TOOL.get(tool_name, "summary")
        if channel != "app" and category not in settings["allowed_categories"]:
            return _reply_and_close(conn, conversation_id, company_id, _tr(_CATEGORY_BLOCKED, language), language, "category_blocked")

    # Tool execution happens with NO connection of ours held open - see the
    # function docstring for why.
    started_at = time.monotonic()
    try:
        result = run_tool(tool_name, role, company_id, **params)
        tool_status = "success"
        tool_error = None
    except PermissionError:
        result = None
        tool_status = "denied"
        tool_error = None
    except Exception as error:  # noqa: BLE001 - must degrade to an honest error message, never an invented answer
        result = None
        tool_status = "error"
        tool_error = str(error)

    with engine.begin() as conn:
        _log_tool_run(conn, conversation_id, company_id, user_id, channel, tool_name, params, tool_status, started_at, result=result, error=tool_error)
        if tool_status == "denied":
            return _reply_and_close(conn, conversation_id, company_id, _tr(_PERMISSION_DENIED, language), language, "permission_denied")
        if tool_status == "error":
            return _reply_and_close(conn, conversation_id, company_id, _tr(_UNAVAILABLE, language), language, "error")

        reply_text = _compose_response(tool_name, result, language, period_label)
        evidence = {
            "source_module": result.get("source_module"), "period": period_label,
            "generated_at": _now(), "tool": tool_name, "parameters": {k: v for k, v in params.items()},
        }
        _store_message(conn, conversation_id, company_id, "agent", reply_text, language, intent=tool_name, period=period, evidence=evidence)

        new_context = {"tool": tool_name, "params": {k: v for k, v in params.items() if k not in ("start_date", "end_date")}}
        conn.execute(text("UPDATE executive_agent_conversations SET context_json=:context, updated_at=:now WHERE id=:id"), {"context": _dumps(new_context), "now": _now(), "id": conversation_id})

        return {
            "conversation_id": conversation_id, "text": reply_text, "status": "ok",
            "tool": tool_name, "period": {"start_date": period["start_date"].isoformat(), "end_date": period["end_date"].isoformat()} if period else None,
            "evidence": evidence, "data": result,
        }


# --------------------------------------------------------------------------
# Voice provider abstractions - honest "not configured" (Task 05, Section
# 15/16). No STT/TTS/LLM provider exists anywhere in this codebase
# (confirmed fresh for this task); these interfaces exist so a real
# provider can be plugged in later without touching answer_question above.
# --------------------------------------------------------------------------

class SpeechToTextProvider:
    def transcribe(self, audio_bytes: bytes, language: str) -> str:
        raise NotImplementedError

    def status(self) -> dict:
        return {"configured": False, "reason": "No speech-to-text provider is configured."}


class TextToSpeechProvider:
    def synthesize(self, text_value: str, language: str, voice: str | None = None) -> bytes:
        raise NotImplementedError

    def status(self) -> dict:
        return {"configured": False, "reason": "No text-to-speech provider is configured."}


_STT_PROVIDER = SpeechToTextProvider()
_TTS_PROVIDER = TextToSpeechProvider()


# --------------------------------------------------------------------------
# FastAPI routes
# --------------------------------------------------------------------------

class AskPayload(BaseModel):
    text: str
    conversation_id: int | None = None
    language: str = "en"


@router.post("/ask")
def ask(payload: AskPayload, request: Request):
    user_id, role = _auth(request)
    company_id = current_company_id(request)
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="A question is required")
    return answer_question(user_id, role, company_id, payload.text.strip(), payload.conversation_id, "app", payload.language)


@router.get("/conversations")
def list_conversations(request: Request):
    user_id, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT id, channel, created_at, updated_at FROM executive_agent_conversations
            WHERE user_id=:user_id AND company_id=:company_id ORDER BY updated_at DESC LIMIT 50
        """), {"user_id": user_id, "company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int, request: Request):
    user_id, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        convo = conn.execute(text("SELECT * FROM executive_agent_conversations WHERE id=:id AND company_id=:company_id AND user_id=:user_id"), {"id": conversation_id, "company_id": company_id, "user_id": user_id}).mappings().first()
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        messages = conn.execute(text("SELECT * FROM executive_agent_messages WHERE conversation_id=:id ORDER BY id"), {"id": conversation_id}).mappings().all()
        items = []
        for m in messages:
            item = dict(m)
            item["period"] = json.loads(item.pop("period_json") or "null")
            item["evidence"] = json.loads(item.pop("evidence_json") or "null")
            items.append(item)
        return {"conversation": dict(convo), "messages": items}


@router.delete("/conversations/{conversation_id}")
def reset_conversation(conversation_id: int, request: Request):
    """"Clear/reset conversation" per task spec Section 5 - deletes the
    conversation's own context/history, never other users' data."""
    user_id, _ = _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        convo = conn.execute(text("SELECT id FROM executive_agent_conversations WHERE id=:id AND company_id=:company_id AND user_id=:user_id"), {"id": conversation_id, "company_id": company_id, "user_id": user_id}).first()
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conn.execute(text("DELETE FROM executive_agent_messages WHERE conversation_id=:id"), {"id": conversation_id})
        conn.execute(text("DELETE FROM executive_agent_conversations WHERE id=:id"), {"id": conversation_id})
        return {"status": "deleted"}


@router.get("/suggestions")
def suggested_questions(request: Request, language: str = "en"):
    _auth(request)
    groups = {
        "today": {
            "fa": ["خلاصه امروز شرکت", "فروش امروز چقدر بود؟", "امروز چه موارد بحرانی داریم؟"],
            "ar": ["ملخص اليوم للشركة", "كم بلغت مبيعات اليوم؟", "ما هي الحالات الحرجة اليوم؟"],
            "tr": ["Bugünkü şirket özeti", "Bugün satış ne kadardı?", "Bugün kritik durumlar neler?"],
            "en": ["Today's company summary", "How much were today's sales?", "What's critical today?"],
        },
        "month": {
            "fa": ["فروش این ماه نسبت به ماه قبل", "وضعیت سود این ماه", "کدام شعبه افت داشته؟"],
            "ar": ["مبيعات هذا الشهر مقارنة بالشهر الماضي", "وضع الربح هذا الشهر", "أي فرع تراجع؟"],
            "tr": ["Bu ayın satışı geçen aya göre", "Bu ayki kâr durumu", "Hangi şube geriledi?"],
            "en": ["This month's sales vs last month", "This month's profit status", "Which branch declined?"],
        },
        "inventory": {
            "fa": ["چه کالاهایی کمبود دارند؟", "کالاهای راکد را نشان بده"],
            "ar": ["ما هي المنتجات الناقصة؟", "أظهر المخزون الراكد"],
            "tr": ["Hangi ürünlerde stok azlığı var?", "Durgun stokları göster"],
            "en": ["Which products are low on stock?", "Show dead stock"],
        },
        "bi": {
            "fa": ["مهم‌ترین مشکلات باز چیست؟", "کدام برنامه‌های بهبود عقب افتاده‌اند؟"],
            "ar": ["ما هي أهم المشاكل المفتوحة؟", "أي خطط تحسين متأخرة؟"],
            "tr": ["En önemli açık sorunlar neler?", "Hangi iyileştirme planları gecikti?"],
            "en": ["What are the most important open issues?", "Which improvement plans are overdue?"],
        },
    }
    return {group: items.get(language, items["en"]) for group, items in groups.items()}


@router.get("/brief")
def daily_brief(request: Request, language: str = "en"):
    user_id, role = _auth(request)
    company_id = current_company_id(request)
    result = answer_question(user_id, role, company_id, "خلاصه امروز" if language == "fa" else "daily brief", None, "app", language)
    return result


@router.get("/status")
def agent_status(request: Request):
    _auth(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        settings = _get_settings(conn, company_id)
    return {
        "enabled": settings["enabled"],
        "stt": _STT_PROVIDER.status(),
        "tts": _TTS_PROVIDER.status(),
        "llm": {"configured": False, "reason": "No LLM provider is configured - questions are understood by a rule-based intent classifier, not AI."},
    }


class SettingsUpdate(BaseModel):
    enabled: bool = True
    default_branch_id: int | None = None
    allowed_categories: list[str] = []


def _require_admin(request: Request):
    auth = getattr(request.state, "auth", {})
    if str(auth.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/settings")
def get_settings_route(request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        return _get_settings(conn, company_id)


@router.put("/settings")
def update_settings_route(payload: SettingsUpdate, request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            INSERT INTO executive_agent_settings (company_id, enabled, default_branch_id, allowed_categories_json, updated_at)
            VALUES (:company_id, :enabled, :default_branch_id, :categories, :now)
            ON CONFLICT(company_id) DO UPDATE SET
              enabled=excluded.enabled, default_branch_id=excluded.default_branch_id,
              allowed_categories_json=excluded.allowed_categories_json, updated_at=excluded.updated_at
        """), {"company_id": company_id, "enabled": payload.enabled, "default_branch_id": payload.default_branch_id, "categories": _dumps(payload.allowed_categories), "now": _now()})
        return _get_settings(conn, company_id)


@router.get("/available-categories")
def available_categories(request: Request):
    _auth(request)
    return {"categories": sorted(set(CATEGORY_BY_TOOL.values()))}


# --------------------------------------------------------------------------
# Telegram binding (Task 05, Section 13) - real HMAC-verified webhook
# already exists (app/inbound_voice.py); this adds the per-user identity
# binding that module never had (it only ever attributed inbound messages
# to ONE shared service-user, or a Customer.telegram_chat_id - neither
# resolves to "this specific manager's own VETRIX identity/role/RBAC").
# --------------------------------------------------------------------------

class BindingCodeRequest(BaseModel):
    pass


@router.post("/telegram/binding-code")
def create_binding_code(request: Request):
    user_id, _ = _auth(request)
    company_id = current_company_id(request)
    code = secrets.token_hex(4).upper()
    expires_at = (datetime.now(timezone.utc).timestamp() + BINDING_CODE_TTL_MINUTES * 60)
    with engine.begin() as conn:
        _ensure_schema(conn)
        conn.execute(text("""
            DELETE FROM executive_agent_external_bindings
            WHERE user_id=:user_id AND provider='telegram' AND verified=0 AND company_id=:company_id
        """), {"user_id": user_id, "company_id": company_id})
        conn.execute(text("""
            INSERT INTO executive_agent_external_bindings
              (user_id, provider, external_identity, verified, binding_code, code_expires_at, created_at, company_id)
            VALUES (:user_id, 'telegram', NULL, 0, :code, :expires_at, :now, :company_id)
        """), {"user_id": user_id, "code": code, "expires_at": datetime.fromtimestamp(expires_at, timezone.utc).isoformat(), "now": _now(), "company_id": company_id})
    return {"code": code, "expires_in_minutes": BINDING_CODE_TTL_MINUTES}


def verify_binding_code(chat_id: str, supplied_code: str, engine=engine) -> dict | None:
    """Called from app/inbound_voice.py's telegram_webhook when ANY inbound
    chat (its company is not yet known - that's exactly what the code
    resolves) sends a plain-text message matching an outstanding code. The
    code itself was minted by a specific, already-authenticated VETRIX user
    inside their own company (see create_binding_code above), so matching
    on the code alone - not a company_id the webhook doesn't have yet - is
    correct and safe: an 8-character random hex code has ~4 billion
    possible values, and it is deleted the instant it's consumed (even a
    since-expired one), so it can never be guessed or replayed.

    Accepts an explicit `engine` (defaulting to this module's own) so the
    caller can pass its own current engine reference - inbound_voice.py's
    own `engine` name is what test suites monkey-patch to an isolated test
    database; this module's module-level `engine` import is a SEPARATE
    Python reference to originally the same object, which a test patching
    only inbound_voice.engine would never touch, silently diverging."""
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        _ensure_schema(conn)
        pending = conn.execute(text("""
            SELECT * FROM executive_agent_external_bindings
            WHERE provider='telegram' AND binding_code=:code AND verified=0
        """), {"code": supplied_code.strip().upper()}).mappings().first()
        if not pending:
            return None
        company_id = pending["company_id"]
        conn.execute(text("DELETE FROM executive_agent_external_bindings WHERE id=:id"), {"id": pending["id"]})
        if not pending["code_expires_at"] or datetime.fromisoformat(pending["code_expires_at"]) < now:
            return {"status": "expired"}
        conn.execute(text("""
            INSERT INTO executive_agent_external_bindings
              (user_id, provider, external_identity, verified, created_at, verified_at, company_id)
            VALUES (:user_id, 'telegram', :chat_id, 1, :now, :now, :company_id)
            ON CONFLICT(provider, external_identity) DO UPDATE SET
              user_id=excluded.user_id, verified=1, verified_at=excluded.verified_at, revoked_at=NULL
        """), {"user_id": pending["user_id"], "chat_id": str(chat_id), "now": _now(), "company_id": company_id})
        return {"status": "bound", "user_id": pending["user_id"], "company_id": company_id}


def resolve_telegram_binding(chat_id: str, engine=engine):
    """Returns (user_id, role, company_id) for a verified, non-revoked
    Telegram binding, or None. Used by inbound_voice.py before EVER routing
    a message into answer_question() - the chat_id alone proves nothing
    without this lookup. See verify_binding_code's docstring for why this
    accepts an explicit engine."""
    with engine.begin() as conn:
        _ensure_schema(conn)
        row = conn.execute(text("""
            SELECT b.user_id, b.company_id, u.role FROM executive_agent_external_bindings b
            JOIN users u ON u.id=b.user_id
            WHERE b.provider='telegram' AND b.external_identity=:chat_id AND b.verified=1 AND b.revoked_at IS NULL
        """), {"chat_id": str(chat_id)}).mappings().first()
        if not row or str(row["role"]).lower() not in ALLOWED_ROLES:
            return None
        return row["user_id"], str(row["role"]).lower(), row["company_id"]


@router.get("/tool-runs")
def list_tool_runs(request: Request):
    """Auditability (Task 05, Section 19) - every tool call this agent
    ever made, who triggered it, from which channel, whether it succeeded/
    was denied/errored, and a truncated result summary. Never returns
    secrets - tool results contain only the same business figures already
    shown in the chat reply."""
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT tr.*, u.full_name AS actor_name FROM executive_agent_tool_runs tr
            LEFT JOIN users u ON u.id=tr.actor_user_id
            WHERE tr.company_id=:company_id ORDER BY tr.id DESC LIMIT 100
        """), {"company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.get("/telegram/bindings")
def list_telegram_bindings(request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        rows = conn.execute(text("""
            SELECT b.id, b.user_id, u.full_name, b.verified, b.created_at, b.verified_at, b.revoked_at
            FROM executive_agent_external_bindings b JOIN users u ON u.id=b.user_id
            WHERE b.provider='telegram' AND b.company_id=:company_id AND b.verified=1
            ORDER BY b.created_at DESC
        """), {"company_id": company_id}).mappings().all()
        return {"items": [dict(r) for r in rows]}


@router.delete("/telegram/bindings/{binding_id}")
def revoke_telegram_binding(binding_id: int, request: Request):
    _require_admin(request)
    company_id = current_company_id(request)
    with engine.begin() as conn:
        _ensure_schema(conn)
        result = conn.execute(text("""
            UPDATE executive_agent_external_bindings SET revoked_at=:now
            WHERE id=:id AND company_id=:company_id AND provider='telegram'
        """), {"now": _now(), "id": binding_id, "company_id": company_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Binding not found")
        return {"status": "revoked"}
