export const COUNTRY_PROFILES = {
  IR: {
    code: "IR",
    name: { en: "Iran", fa: "ایران" },
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
    name: { en: "Germany", fa: "آلمان" },
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
    name: { en: "Finland", fa: "فنلاند" },
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
    name: { en: "United Arab Emirates", fa: "امارات متحده عربی" },
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
    name: { en: "United Kingdom", fa: "بریتانیا" },
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
    name: { en: "United States", fa: "ایالات متحده آمریکا" },
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

export function localeFor(profile, language) {
  return profile.locale?.[language] || profile.locale?.en || "en-US";
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

export function formatCountryDate(value, profile, language, options = {}) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const calendar = options.calendar || profile.calendar;
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
