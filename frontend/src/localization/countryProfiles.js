import { toHijri, HIJRI_MONTHS_AR } from "../utils/hijri";

export const COUNTRY_PROFILES = {
  IR: {
    code: "IR",
    name: { en: "Iran", fa: "ایران", ar: "إيران", tr: "İran" },
    locale: { en: "en-IR", fa: "fa-IR" },
    direction: "rtl",
    currency: "IRR",
    currencyLabel: { en: "Iranian rial", fa: "ریال ایران" },
    currencyDigits: 0,
    accountingUnit: "toman",
    calendar: "persian",
    alternateCalendar: "gregory",
    timeZone: "Asia/Tehran",
    firstDayOfWeek: 6,
    weekendDays: [5],
    measurementSystem: "metric",
    fiscalYearStart: "01-01-persian",
    taxSystemLabel: { en: "VAT / tax profile", fa: "پروفایل مالیات و ارزش افزوده" },
  },
  DE: {
    code: "DE",
    name: { en: "Germany", fa: "آلمان", ar: "ألمانيا", tr: "Almanya" },
    locale: { en: "de-DE", fa: "de-DE" },
    direction: "ltr",
    currency: "EUR",
    currencyLabel: { en: "Euro", fa: "یورو" },
    currencyDigits: 2,
    accountingUnit: "major",
    calendar: "gregory",
    alternateCalendar: null,
    timeZone: "Europe/Berlin",
    firstDayOfWeek: 1,
    weekendDays: [0, 6],
    measurementSystem: "metric",
    fiscalYearStart: "01-01",
    taxSystemLabel: { en: "VAT profile", fa: "پروفایل مالیات بر ارزش افزوده" },
  },
  FI: {
    code: "FI",
    name: { en: "Finland", fa: "فنلاند", ar: "فنلندا", tr: "Finlandiya" },
    locale: { en: "fi-FI", fa: "fi-FI" },
    direction: "ltr",
    currency: "EUR",
    currencyLabel: { en: "Euro", fa: "یورو" },
    currencyDigits: 2,
    accountingUnit: "major",
    calendar: "gregory",
    alternateCalendar: null,
    timeZone: "Europe/Helsinki",
    firstDayOfWeek: 1,
    weekendDays: [0, 6],
    measurementSystem: "metric",
    fiscalYearStart: "01-01",
    taxSystemLabel: { en: "VAT profile", fa: "پروفایل مالیات بر ارزش افزوده" },
  },
  AE: {
    code: "AE",
    name: { en: "United Arab Emirates", fa: "امارات متحده عربی", ar: "الإمارات العربية المتحدة", tr: "Birleşik Arap Emirlikleri" },
    locale: { en: "en-AE", fa: "ar-AE" },
    direction: "rtl",
    currency: "AED",
    currencyLabel: { en: "UAE dirham", fa: "درهم امارات" },
    currencyDigits: 2,
    accountingUnit: "major",
    calendar: "gregory",
    alternateCalendar: "islamic-umalqura",
    timeZone: "Asia/Dubai",
    firstDayOfWeek: 1,
    weekendDays: [0, 6],
    measurementSystem: "metric",
    fiscalYearStart: "01-01",
    taxSystemLabel: { en: "VAT profile", fa: "پروفایل مالیات بر ارزش افزوده" },
  },
  GB: {
    code: "GB",
    name: { en: "United Kingdom", fa: "بریتانیا", ar: "المملكة المتحدة", tr: "Birleşik Krallık" },
    locale: { en: "en-GB", fa: "en-GB" },
    direction: "ltr",
    currency: "GBP",
    currencyLabel: { en: "Pound sterling", fa: "پوند بریتانیا" },
    currencyDigits: 2,
    accountingUnit: "major",
    calendar: "gregory",
    alternateCalendar: null,
    timeZone: "Europe/London",
    firstDayOfWeek: 1,
    weekendDays: [0, 6],
    measurementSystem: "metric",
    fiscalYearStart: "configurable",
    taxSystemLabel: { en: "VAT profile", fa: "پروفایل مالیات بر ارزش افزوده" },
  },
  US: {
    code: "US",
    name: { en: "United States", fa: "ایالات متحده آمریکا", ar: "الولايات المتحدة الأمريكية", tr: "Amerika Birleşik Devletleri" },
    locale: { en: "en-US", fa: "en-US" },
    direction: "ltr",
    currency: "USD",
    currencyLabel: { en: "US dollar", fa: "دلار آمریکا" },
    currencyDigits: 2,
    accountingUnit: "major",
    calendar: "gregory",
    alternateCalendar: null,
    timeZone: "America/New_York",
    firstDayOfWeek: 0,
    weekendDays: [0, 6],
    measurementSystem: "us",
    fiscalYearStart: "configurable",
    taxSystemLabel: { en: "Sales tax profile", fa: "پروفایل مالیات فروش" },
  },
};

export const COUNTRY_CODES = Object.keys(COUNTRY_PROFILES);
export const DEFAULT_COUNTRY = "IR";

export function getCountryProfile(countryCode) {
  return COUNTRY_PROFILES[countryCode] || COUNTRY_PROFILES[DEFAULT_COUNTRY];
}

// Per-language fallback locales, used when a country profile doesn't
// carry an explicit entry for the selected language (most profiles
// above only define en/fa). Without this, picking Arabic or Turkish
// while the country profile is e.g. Iran would silently fall back to
// English number/date formatting instead of actually switching.
const LANGUAGE_LOCALE_FALLBACK = {
  en: "en-US",
  fa: "fa-IR",
  ar: "ar-AE",
  tr: "tr-TR",
};

export function localeFor(profile, language) {
  return (
    profile.locale?.[language] ||
    LANGUAGE_LOCALE_FALLBACK[language] ||
    profile.locale?.en ||
    "en-US"
  );
}

export function formatCountryNumber(value, profile, language, options = {}) {
  return new Intl.NumberFormat(localeFor(profile, language), options).format(Number(value || 0));
}

export function formatCountryMoney(value, profile, language, currencyOverride) {
  const currency = currencyOverride || profile.currency;
  return new Intl.NumberFormat(localeFor(profile, language), {
    style: "currency",
    currency,
    minimumFractionDigits: profile.currencyDigits,
    maximumFractionDigits: profile.currencyDigits,
  }).format(Number(value || 0));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

// Arabic dates render through our own moon-sighting-calibrated toHijri()
// (see utils/hijri.js) rather than Intl's built-in `-u-ca-islamic`
// calendar, which uses a plain tabular algorithm and can land a day or
// two off real-world Hijri dates - exactly the kind of mismatch this
// app's accounting users have called out before. Routing every Arabic
// date display through the same conversion keeps the whole app (this
// function, the calendar widget, day-details) agreed on one Hijri date.
function formatHijriDate(date, profile, options) {
  // Read the Gregorian y/m/d in the company's own time zone (not the
  // browser's) before converting to Hijri, matching how the Intl-based
  // branch below always formats in `profile.timeZone`.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: profile.timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const h = toHijri(get("year"), get("month"), get("day"));
  if (options.month === "long") {
    return `${h.day} ${HIJRI_MONTHS_AR[h.month - 1]} ${h.year}`;
  }
  return `${pad2(h.day)}/${pad2(h.month)}/${h.year}`;
}

export function formatCountryDate(value, profile, language, options = {}) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  // Calendar system follows the selected UI language first (Persian ->
  // Jalali, Arabic -> Hijri, everything else -> Gregorian) rather than
  // the company's country profile alone - otherwise switching the
  // language away from Persian while the country profile stayed Iran
  // (the app default) would keep showing Jalali dates in a non-Persian
  // UI.
  if (language === "ar" && !options.calendar) {
    return formatHijriDate(date, profile, options);
  }

  const languageCalendar = language === "fa" ? "persian" : "gregory";
  const calendar = options.calendar || languageCalendar;
  const locale = `${localeFor(profile, language)}-u-ca-${calendar}`;
  return new Intl.DateTimeFormat(locale, {
    timeZone: profile.timeZone,
    year: "numeric",
    month: options.month || "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatCountryTime(value, profile, language) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(localeFor(profile, language), {
    timeZone: profile.timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
