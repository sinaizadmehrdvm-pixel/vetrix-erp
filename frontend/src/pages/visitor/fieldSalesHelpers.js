// Shared between VisitorHome.jsx (Today + My Customers) and
// VisitorVisits.jsx (Visits workspace) - both need the same "is this
// visit/customer due, overdue, or needing follow-up" derivations, and
// both must derive them from the exact same real data/rules or the two
// pages would silently disagree with each other.

// Outcomes that leave real unfinished business on a customer, per
// backend/app/field_visits.py's OUTCOMES set - a genuinely-derived
// "needs follow-up" signal instead of a fabricated flag.
export const FOLLOWUP_OUTCOMES = new Set(["no_order_price_objection", "no_order_out_of_stock", "complaint_lodged"]);

// Visit timer / duration display, consolidated from three near-identical
// copies (ActiveVisitWorkspace.jsx, VisitCompletionPanel.jsx,
// VisitorVisits.jsx) that each hand-rolled a `fa ? regex-replace digits :
// leave as Latin` check - which only ever handled Persian and left Arabic
// on Latin digits. `n` is the shared number formatter from useLanguage()
// (Intl.NumberFormat under the hood), so minutes/seconds render through
// the exact same locale/digit convention as every other number in the
// app - Persian digits for fa, the app's established convention for ar,
// Latin for tr/en - while `minimumIntegerDigits: 2` keeps the zero-padded
// "00:07" shape Intl.NumberFormat doesn't produce on its own.
export function formatElapsed(seconds, n) {
  const m = n(Math.floor(seconds / 60), { minimumIntegerDigits: 2, useGrouping: false });
  const s = n(Math.floor(seconds % 60), { minimumIntegerDigits: 2, useGrouping: false });
  return `${m}:${s}`;
}

export function isToday(dateLike) {
  if (!dateLike) return false;
  const d = new Date(dateLike);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function daysSince(dateLike) {
  if (!dateLike) return null;
  const diff = Date.now() - new Date(dateLike).getTime();
  return Math.floor(diff / 86400000);
}

// Visit-cadence urgency, derived only from real coverage data (never
// visited, or overdue by X days) - not a fabricated priority score.
export function overdueTier(coverage) {
  if (!coverage?.overdue) return null;
  const days = coverage.days_since_last_visit;
  if (days === null || days >= 60) return "high";
  if (days >= 30) return "medium";
  return "low";
}

export const TIER_TONE = { high: "danger", medium: "warning", low: "info" };

// Mirrors backend/app/field_visits.py's OUTCOMES enum exactly. Lives here
// (not in ActiveVisitWorkspace.jsx, which both VisitorVisits.jsx and
// Customer360Drawer.jsx need this from) so that Customer360Drawer - itself
// rendered by ActiveVisitWorkspace - doesn't import back from it.
export const OUTCOMES = [
  { value: "order_placed", label: { fa: "سفارش ثبت شد", ar: "تم تسجيل الطلب", tr: "Sipariş alındı", en: "Order placed" } },
  { value: "no_order_no_need", label: { fa: "بدون سفارش - نیازی نبود", ar: "بدون طلب - لا حاجة", tr: "Siparişsiz - ihtiyaç yok", en: "No order - no need" } },
  { value: "no_order_price_objection", label: { fa: "بدون سفارش - اعتراض قیمت", ar: "بدون طلب - اعتراض على السعر", tr: "Siparişsiz - fiyat itirazı", en: "No order - price objection" } },
  { value: "no_order_out_of_stock", label: { fa: "بدون سفارش - موجودی ما تمام شده", ar: "بدون طلب - نفاد المخزون", tr: "Siparişsiz - stok yok", en: "No order - we're out of stock" } },
  { value: "customer_unavailable", label: { fa: "مشتری در دسترس نبود", ar: "العميل غير متوفر", tr: "Müşteri müsait değildi", en: "Customer unavailable" } },
  { value: "store_closed", label: { fa: "فروشگاه بسته بود", ar: "المتجر مغلق", tr: "Mağaza kapalıydı", en: "Store closed" } },
  { value: "complaint_lodged", label: { fa: "شکایت ثبت شد", ar: "تم تسجيل شكوى", tr: "Şikayet kaydedildi", en: "Complaint lodged" } },
  { value: "information_only", label: { fa: "فقط اطلاع‌رسانی", ar: "معلومات فقط", tr: "Sadece bilgilendirme", en: "Information only" } },
  { value: "other", label: { fa: "سایر", ar: "أخرى", tr: "Diğer", en: "Other" } },
];

// Most-recent-visit-per-customer -> "needs follow-up" set. `visits` must
// already be ordered visit_time DESC (the /api/field-visits list endpoint
// always returns it that way), so the first match per customer_id is
// their latest visit.
export function deriveFollowupCustomerIds(visits) {
  const seen = new Set();
  const result = new Set();
  for (const v of visits) {
    if (seen.has(v.customer_id)) continue;
    seen.add(v.customer_id);
    if (FOLLOWUP_OUTCOMES.has(v.outcome)) result.add(v.customer_id);
  }
  return result;
}
