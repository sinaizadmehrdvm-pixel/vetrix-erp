import { formatNumber } from "./numbers";

export function formatCurrency(value, lang = "en") {
  const formatted = formatNumber(value, lang);

  if (lang === "fa") {
    return `${formatted} تومان`;
  }

  return `$${formatted}`;
}

export function getDirection(lang = "en") {
  return lang === "fa" ? "rtl" : "ltr";
}