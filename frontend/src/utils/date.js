import moment from "moment-jalaali";
import { toHijri, hijriToGregorian, HIJRI_MONTHS_AR } from "./hijri";

moment.loadPersian({ dialect: "persian-modern" });

export const toJalali = (date) => {
  if (!date) return "";
  return moment(date).format("jYYYY/jMM/jDD");
};

export const todayJalali = () => {
  return moment().format("jYYYY/jMM/jDD");
};

// Parses a "jYYYY/jMM/jDD" (or "-"-separated, Persian- or Latin-digit)
// Jalali date string back to a Gregorian "YYYY-MM-DD" string for storage.
// Returns "" for anything that isn't a valid complete Jalali date, so
// callers can leave the stored value untouched while the user is still
// mid-typing rather than clobbering it with a bad parse.
export const fromJalali = (jalaliString) => {
  if (!jalaliString) return "";
  const latinDigits = String(jalaliString).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const match = latinDigits.match(/^(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return "";
  const [, jy, jm, jd] = match;
  const parsed = moment(`${jy}/${jm}/${jd}`, "jYYYY/jMM/jDD");
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

export const toHijriText = (date) => {
  if (!date) return "";
  const g = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(g.getTime())) return "";
  const h = toHijri(g.getFullYear(), g.getMonth() + 1, g.getDate());
  return `${h.year}/${pad2(h.month)}/${pad2(h.day)}`;
};

export const todayHijri = () => toHijriText(new Date());

// Parses a "hYYYY/hMM/hDD" (or "-"-separated, Latin-digit) Hijri date
// string back to a Gregorian "YYYY-MM-DD" string for storage, mirroring
// fromJalali(). Returns "" for anything that isn't a valid complete
// Hijri date so callers can leave the stored value untouched mid-typing.
export const fromHijriText = (hijriString) => {
  if (!hijriString) return "";
  const latinDigits = String(hijriString).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const match = latinDigits.match(/^(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return "";
  const [, hy, hm, hd] = match;
  const month = Number(hm);
  const day = Number(hd);
  if (month < 1 || month > 12 || day < 1 || day > 30) return "";
  const g = hijriToGregorian(Number(hy), month, day);
  return `${g.year}-${pad2(g.month)}-${pad2(g.day)}`;
};

const CALENDAR_LOCALES = { fa: "fa-IR-u-ca-persian", tr: "tr-TR", en: "en-US" };

// Shared "long date" formatter for the many pages/components that show a
// single business date/timestamp (invoice dates, ledger rows, file
// upload times, etc). Arabic renders through the app's own
// moon-sighting-calibrated toHijri() rather than Intl's built-in
// `-u-ca-islamic` calendar, which can land a day or two off real-world
// Hijri dates - see utils/hijri.js for why. Keeping every call site on
// this one helper (instead of each file rolling its own
// Intl.DateTimeFormat) means an Arabic user sees the same Hijri date for
// a given timestamp everywhere in the app.
export function formatCalendarDate(value, language, options = {}) {
  if (!value) return "-";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    if (language === "ar") {
      const h = toHijri(date.getFullYear(), date.getMonth() + 1, date.getDate());
      const timeSuffix = options.time
        ? ` ${new Intl.DateTimeFormat("ar-AE", { hour: "2-digit", minute: "2-digit" }).format(date)}`
        : "";
      return `${h.day} ${HIJRI_MONTHS_AR[h.month - 1]} ${h.year}${timeSuffix}`;
    }

    return new Intl.DateTimeFormat(CALENDAR_LOCALES[language] || CALENDAR_LOCALES.en, {
      year: "numeric",
      month: "long",
      day: "numeric",
      ...(options.time ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  } catch {
    return String(value);
  }
}