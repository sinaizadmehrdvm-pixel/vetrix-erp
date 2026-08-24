"""Layer-1 rule-based executive intent classifier (Task 05).

Deliberately NOT AI - keyword/phrase matching per language, exactly the
same "deliberately NOT AI" precedent already established in
app/change_requests.py's Voice Assistant Layer 1 (see that module's own
docstring). This module implements the ExecutiveIntentProvider interface
conceptually described in the task spec: swap this file's
classify_intent() for a real-LLM-backed implementation later without
touching app/executive_agent/agent.py's orchestration logic, tools.py's
registry, or RBAC enforcement - none of which the intent layer is allowed
to influence.
"""
import re

_KEYWORDS = {
    "daily_company_summary": [
        "خلاصه امروز", "امروز چه خبر", "وضعیت امروز", "امروز چطور بود", "بریفینگ امروز",
        "ملخص اليوم", "ماذا حدث اليوم",
        "bugünkü özet", "bugün ne oldu",
        "daily brief", "today's summary", "executive brief", "what happened today",
    ],
    "improvement_plan_status": [
        "برنامه بهبود", "برنامه پیگیری", "پیگیری بهتر شده", "به کجا رسید",
        "خطة التحسين", "خطة المتابعة",
        "iyileştirme planı", "takip planı",
        "improvement plan", "follow-up plan", "action plan status",
    ],
    "open_executive_alerts": [
        "مهم‌ترین مشکل", "چه مشکلاتی", "نیاز به پیگیری", "هشدار", "مشکلات باز",
        "أهم المشاكل", "تنبيهات",
        "en önemli sorun", "uyarılar",
        "critical issue", "important problem", "open alert", "needs attention",
    ],
    "budget_variance": [
        "بودجه", "از بودجه رد", "مصرف بودجه",
        "الميزانية",
        "bütçe",
        "budget", "over budget", "utilization",
    ],
    "campaign_performance": [
        "کمپین", "فروش آنلاین", "تبلیغات",
        "حملة", "مبيعات إلكترونية",
        "kampanya", "çevrimiçi satış",
        "campaign", "online sales", "advertising",
    ],
    "cheque_summary": [
        "چک", "چک‌های", "چک پرداختی", "چک دریافتی",
        "شيك", "الشيكات",
        "çek",
        "cheque", "check due",
    ],
    "customer_risk_summary": [
        "مشتری پرریسک", "مشتری‌های پرریسک", "خرید نکرده",
        "عملاء عاليي المخاطر",
        "riskli müşteri",
        "risky customer", "high-risk customer",
    ],
    "receivables_summary": [
        "طلب معوق", "مطالبات", "طلب داریم", "دریافتنی",
        "مستحقات", "ذمم",
        "alacak",
        "receivable", "outstanding payment", "overdue receivable",
    ],
    "payables_summary": [
        "بدهی", "پرداختنی", "چه پرداخت‌هایی",
        "مدفوعات مستحقة",
        "borç ödemesi",
        "payable", "what payments",
    ],
    "inventory_risk_summary": [
        "کمبود موجودی", "کالای راکد", "نزدیک انقضا", "کم داریم",
        "نقص المخزون", "مخزون راكد",
        "düşük stok", "durgun stok",
        "low stock", "dead stock", "out of stock", "expiring",
    ],
    "branch_performance": [
        "کدوم شعبه", "کدام شعبه", "شعبه استانبول", "مقایسه شعبه",
        "أي فرع",
        "hangi şube",
        "which branch", "branch performance", "branch comparison",
    ],
    "profit_summary": [
        "سود", "حاشیه سود",
        "الربح", "هامش الربح",
        "kâr", "kar marjı",
        "profit", "margin",
    ],
    "cashflow_summary": [
        "نقدینگی", "وجه نقد", "وضعیت نقد",
        "السيولة النقدية",
        "nakit durumu",
        "cash position", "cashflow",
    ],
    "sales_summary": [
        "فروش",
        "المبيعات",
        "satış",
        "sales", "sold",
    ],
}

# Checked in this exact order - broader/more specific intents before the
# generic "فروش"/"sales" catch-all, so e.g. "فروش این ماه رو با ماه قبل
# مقایسه کن" still matches sales_summary rather than accidentally matching
# a narrower keyword first.
_INTENT_ORDER = [
    "daily_company_summary", "improvement_plan_status", "open_executive_alerts",
    "budget_variance", "campaign_performance", "cheque_summary", "customer_risk_summary",
    "receivables_summary", "payables_summary", "inventory_risk_summary",
    "branch_performance", "profit_summary", "cashflow_summary", "sales_summary",
]

_GROSS_WORDS = {"ناخالص", "إجمالي", "brüt", "gross"}
_NET_WORDS = {"خالص", "صافي", "net"}
_COMPARISON_WORDS = {"نسبت به", "در مقایسه", "compared", "مقارنة", "kıyasla", "vs", "نسبت"}


def classify_intent(text_message: str):
    """Returns {intent, needs_profit_clarification, is_comparison} or None
    if nothing recognized - callers MUST treat None as "ask for
    clarification" or fall back to conversation context, never guess."""
    normalized = (text_message or "").strip().lower()
    if not normalized:
        return None
    for intent in _INTENT_ORDER:
        if any(keyword in normalized for keyword in _KEYWORDS[intent]):
            result = {"intent": intent, "is_comparison": any(w in normalized for w in _COMPARISON_WORDS)}
            if intent == "profit_summary":
                has_gross = any(w in normalized for w in _GROSS_WORDS)
                has_net = any(w in normalized for w in _NET_WORDS)
                result["needs_profit_clarification"] = not (has_gross or has_net)
                result["profit_type"] = "gross" if has_gross else "net" if has_net else None
            return result
    return None


def extract_branch_name(text_message: str, branch_names: list[str]):
    """Real substring matching against this company's actual branch names
    (case-insensitive) - never a guessed/fabricated branch."""
    normalized = (text_message or "").strip().lower()
    for name in branch_names:
        if name and name.lower() in normalized:
            return name
    return None


_FOLLOW_UP_ONLY_WORDS = re.compile(
    r"^(نسبت به .+|در مقایسه .+|چرا\??|چطور\??|why\??|compared to .+|vs .+|kıyasla .*)$",
    re.IGNORECASE,
)


def is_bare_follow_up(text_message: str):
    """True only for a message that is JUST a comparison/why phrase with no
    new metric keyword of its own - the signal to inherit the prior turn's
    active tool from conversation context rather than reclassify from
    scratch."""
    normalized = (text_message or "").strip().lower()
    return classify_intent(normalized) is None and bool(_FOLLOW_UP_ONLY_WORDS.match(normalized))
