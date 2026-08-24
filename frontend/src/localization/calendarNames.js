// Shared locale-aware calendar name tables - month/weekday names for every
// calendar system this app supports. Used by both JalaliDateField (the
// form date-picker popup) and the Dashboard's DateBadge/CalendarWidget, so
// the two can't drift into showing different names for the same language
// (e.g. one correctly localizing Turkish weekday names while the other
// silently falls back to English).

export const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export const GREGORIAN_MONTHS = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

// Short weekday abbreviations for compact grid headers - Saturday-first for
// Jalali (matches its own week-start convention), Sunday-first for
// Hijri/Gregorian (matches `Date.prototype.getDay()`, which both of those
// builders' offset math is derived from).
export const WEEKDAYS_SHORT = {
  fa: ["ش", "ی", "د", "س", "چ", "پ", "ج"],
  ar: ["ح", "ن", "ث", "ر", "خ", "ج", "س"],
  tr: ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

// Full weekday names for spelled-out display (e.g. the Dashboard's date
// badge) - same week-start ordering as WEEKDAYS_SHORT above (position 0 is
// Saturday for fa, Sunday for ar/tr/en).
export const WEEKDAYS_FULL = {
  fa: ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  tr: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

// Weekly non-working day(s) per calendar system, as column indexes into
// WEEKDAYS_SHORT/WEEKDAYS_FULL and into each builder's day-cell grid -
// Friday only for Jalali (Iran), Friday+Saturday for Hijri, Saturday+Sunday
// for Gregorian. Shared so JalaliDateField's popup and CalendarWidget's
// dashboard grid mark the same days as weekends for the same language,
// instead of one of them only ever highlighting a single column.
export const WEEKEND_INDEXES = { jalali: [6], hijri: [5, 6], gregorian: [0, 6] };
