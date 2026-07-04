const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value) {
  return String(value).replace(/[0-9]/g, (digit) => persianDigits[Number(digit)]);
}

export function formatNumber(value, lang = "en") {
  const number = Number(value || 0);

  if (lang === "fa") {
    return toPersianDigits(number.toLocaleString("en-US"));
  }

  return number.toLocaleString("en-US");
}