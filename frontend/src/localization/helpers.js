const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toPersianDigits(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, (digit) => persianDigits[Number(digit)]);
}

export function toEnglishDigits(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);

  persianDigits.forEach((digit, index) => {
    text = text.replaceAll(digit, String(index));
  });

  arabicDigits.forEach((digit, index) => {
    text = text.replaceAll(digit, String(index));
  });

  return text;
}

export function cleanNumberInput(value) {
  const english = toEnglishDigits(value);
  return english.replace(/[^\d.-]/g, "");
}

export function parseNumberInput(value) {
  const cleaned = cleanNumberInput(value);
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

export function displayInputNumber(value, language = "fa") {
  if (value === null || value === undefined) return "";
  return language === "fa" ? toPersianDigits(value) : String(value);
}

export function formatNumber(value, language = "en") {
  try {
    const numericValue = Number(value || 0);
    const locale =
      language === "fa" ? "fa-IR" : language === "tr" ? "tr-TR" : "en-US";
    return new Intl.NumberFormat(locale).format(numericValue);
  } catch {
    return String(value ?? "");
  }
}

export function formatMoney(value, language = "en") {
  const formatted = formatNumber(value, language);

  if (language === "fa") return `${formatted} تومان`;
  if (language === "tr") return `₺${formatted}`;
  return `$${formatted}`;
}

export function formatDate(date, language = "en") {
  try {
    const value = date ? new Date(date) : new Date();
    const locale =
      language === "fa"
        ? "fa-IR-u-ca-persian"
        : language === "tr"
        ? "tr-TR"
        : "en-US";

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(value);
  } catch {
    return String(date ?? "");
  }
}

const INVOICE_TYPE_LABELS = {
  sale: { fa: "فاکتور فروش", ar: "فاتورة مبيعات", tr: "Satış Faturası", en: "Sales invoice" },
  buy: { fa: "فاکتور خرید", ar: "فاتورة مشتريات", tr: "Alış Faturası", en: "Purchase invoice" },
  proforma: { fa: "پیش‌فاکتور", ar: "فاتورة أولية", tr: "Proforma Fatura", en: "Proforma invoice" },
  return_sale: { fa: "مرجوعی فروش", ar: "مرتجع مبيعات", tr: "Satış İadesi", en: "Sales return" },
  return_buy: { fa: "مرجوعی خرید", ar: "مرتجع مشتريات", tr: "Alış İadesi", en: "Purchase return" },
};

const PAYMENT_STATUS_LABELS = {
  unpaid: { fa: "پرداخت نشده", ar: "غير مدفوعة", tr: "Ödenmedi", en: "Unpaid" },
  partial: { fa: "پرداخت جزئی", ar: "مدفوعة جزئيًا", tr: "Kısmi Ödendi", en: "Partial" },
  paid: { fa: "تسویه شده", ar: "مدفوعة", tr: "Ödendi", en: "Paid" },
  final: { fa: "نهایی", ar: "نهائي", tr: "Kesin", en: "Final" },
};

// Shared enum-to-label lookups - every page that shows an invoice's raw
// invoice_type/payment_status backend value needs the same translation,
// and duplicating it ad hoc per page is how several pages ended up
// leaking the untranslated English enum value into Persian mode.
//
// `language` accepts either the language code ("fa"/"ar"/"tr"/"en") or,
// for backward compatibility, a boolean (true => fa, false/undefined => en).
export function invoiceTypeLabel(type, language = "en") {
  const entry = INVOICE_TYPE_LABELS[type];
  if (!entry) return type || "-";
  const lang = language === true ? "fa" : language === false ? "en" : language;
  return entry[lang] || entry.en;
}

export function paymentStatusLabel(status, language = "en") {
  const entry = PAYMENT_STATUS_LABELS[status];
  if (!entry) return status || "-";
  const lang = language === true ? "fa" : language === false ? "en" : language;
  return entry[lang] || entry.en;
}

export function formatTime(date, language = "en") {
  try {
    const value = date ? new Date(date) : new Date();
    const locale =
      language === "fa" ? "fa-IR" : language === "tr" ? "tr-TR" : "en-US";

    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(value);
  } catch {
    return "";
  }
}