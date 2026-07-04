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