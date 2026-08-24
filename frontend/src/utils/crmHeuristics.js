import { toEnglishDigits } from "../localization/helpers";

// Shared client-side CRM heuristic - originally lived only in Customers.jsx.
// Extracted so the Field Sales module (VisitorHome.jsx/VisitorVisits.jsx)
// can reuse the exact same scoring/status logic instead of inventing a
// second, divergent "customer health" engine. Deliberately the *lighter*
// of the two CRM systems in this app (the richer one lives server-side at
// /api/crm and is per-customer, e.g. getCrmCustomerProfile - too expensive
// to call once per row in a list). This one only needs fields already
// present on a plain GET /customers row (balance, credit_limit, ...), so a
// full customer list can be scored in one pass with zero extra requests.
export function toNumber(value) {
  const cleaned = toEnglishDigits(String(value ?? ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return Number(cleaned || 0);
}

export function crmScore(item) {
  const balance = Math.abs(toNumber(item.balance));
  const creditLimit = toNumber(item.credit_limit);
  const opening = Math.abs(toNumber(item.opening_balance));
  let score = 45;

  if (item.party_type === "vip" || item.customer_type === "vip") score += 25;
  if (item.party_type === "company" || item.customer_type === "company") score += 12;
  if (item.party_type === "doctor" || item.customer_type === "doctor") score += 10;
  if (item.phone || item.mobile) score += 8;
  if (item.email) score += 4;
  if (item.city || item.address) score += 5;
  if (opening > 0) score += Math.min(12, opening / 1000000);
  if (creditLimit > 0) score += 6;
  if (balance > 0 && creditLimit > 0 && balance > creditLimit) score -= 20;
  if (balance > 0 && creditLimit === 0) score -= 8;
  if (item.pending_sync) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function crmRank(score) {
  if (score >= 85) return { key: "A+", tone: "success" };
  if (score >= 70) return { key: "A", tone: "success" };
  if (score >= 50) return { key: "B", tone: "info" };
  return { key: "C", tone: "danger" };
}

export function crmStatus(item, language) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);
  if (balance > 0 && limit > 0 && balance > limit) {
    return { key: "over_limit", label: fa ? "بیش از سقف اعتبار" : ar ? "تجاوز حد الائتمان" : tr ? "Kredi limiti aşıldı" : "Over credit limit", tone: "danger" };
  }
  if (balance > 0) {
    return { key: "debtor", label: fa ? "نیازمند پیگیری" : ar ? "بحاجة إلى متابعة" : tr ? "Takip gerekiyor" : "Needs follow-up", tone: "warning" };
  }
  if (balance < 0) {
    return { key: "creditor", label: fa ? "بستانکار" : ar ? "دائن" : tr ? "Alacaklı" : "Creditor", tone: "success" };
  }
  return { key: "healthy", label: fa ? "سالم" : ar ? "سليم" : tr ? "Sağlıklı" : "Healthy", tone: "info" };
}

export function crmTags(item, language) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  const tags = [];
  const type = item.party_type || item.customer_type;
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);

  if (type === "vip") tags.push("VIP");
  if (type === "doctor") tags.push(fa ? "پزشک" : ar ? "طبيب" : tr ? "Doktor" : "Doctor");
  if (type === "company") tags.push(fa ? "شرکتی" : ar ? "شركة" : tr ? "Şirket" : "Company");
  if (type === "supplier") tags.push(fa ? "تأمین‌کننده" : ar ? "مورّد" : tr ? "Tedarikçi" : "Supplier");
  if (balance > 0) tags.push(fa ? "مطالبات" : ar ? "ذمم مدينة" : tr ? "Alacak" : "Receivable");
  if (limit > 0) tags.push(fa ? "اعتباری" : ar ? "ائتمان" : tr ? "Kredili" : "Credit");
  if (balance > limit && limit > 0) tags.push(fa ? "ریسک" : ar ? "مخاطرة" : tr ? "Risk" : "Risk");
  if (item.pending_sync) tags.push(fa ? "آفلاین" : ar ? "غير متصل" : tr ? "Çevrimdışı" : "Offline");

  return tags.slice(0, 4);
}

export function followupSuggestion(item, language) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);
  if (balance > 0 && limit > 0 && balance > limit) return fa ? "تماس فوری برای تسویه یا افزایش اعتبار" : ar ? "اتصال عاجل للتسوية أو مراجعة حد الائتمان" : tr ? "Tahsilat veya kredi limiti gözden geçirmesi için acil arama" : "Urgent call for settlement or credit review";
  if (balance > 0) return fa ? "پیگیری دریافت مطالبات" : ar ? "متابعة تحصيل الذمم المدينة" : tr ? "Alacak tahsilatını takip et" : "Follow up receivables";
  if (!item.phone && !item.mobile) return fa ? "تکمیل شماره تماس" : ar ? "استكمال رقم الاتصال" : tr ? "İletişim numarasını tamamla" : "Complete contact number";
  if (!item.city && !item.address) return fa ? "تکمیل اطلاعات آدرس" : ar ? "استكمال بيانات العنوان" : tr ? "Adres bilgilerini tamamla" : "Complete address info";
  return fa ? "حفظ ارتباط و ثبت تعامل بعدی" : ar ? "الحفاظ على التواصل وتسجيل التفاعل القادم" : tr ? "İlişkiyi sürdür ve bir sonraki teması kaydet" : "Maintain relationship and log next touchpoint";
}
