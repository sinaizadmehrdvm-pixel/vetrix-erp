// A deliberately small, high-confidence set of Iranian national
// occasions that fall on a *fixed* solar (Jalali) calendar date every
// year - Nowruz, Nature Day, the Revolution anniversary, etc. Lunar
// Hijri-calendar occasions (Eid al-Fitr, Ashura, Tasua, ...) shift by
// ~11 days each Jalali year and are deliberately left out: converting
// them correctly requires a verified Hijri<->Jalali table this app
// doesn't have, and showing a wrong religious/national holiday date
// in a business tool is worse than showing none. Keyed as "month-day"
// with a 1-based Jalali month.
export const FIXED_JALALI_OCCASIONS = {
  "1-1": { fa: "جشن نوروز", en: "Nowruz (Persian New Year)" },
  "1-2": { fa: "تعطیلات نوروز", en: "Nowruz holiday" },
  "1-3": { fa: "تعطیلات نوروز", en: "Nowruz holiday" },
  "1-4": { fa: "تعطیلات نوروز", en: "Nowruz holiday" },
  "1-12": { fa: "روز جمهوری اسلامی", en: "Islamic Republic Day" },
  "1-13": { fa: "روز طبیعت (سیزده‌به‌در)", en: "Nature Day (Sizdah Bedar)" },
  "2-11": { fa: "روز جهانی کارگر", en: "International Workers' Day" },
  "3-14": { fa: "سالگرد رحلت امام خمینی", en: "Anniversary of Imam Khomeini's passing" },
  "3-15": { fa: "قیام پانزده خرداد", en: "15 Khordad Uprising" },
  "9-16": { fa: "روز دانشجو", en: "Student Day" },
  "11-22": { fa: "پیروزی انقلاب اسلامی", en: "Islamic Revolution Victory Day" },
  "12-29": { fa: "روز ملی شدن صنعت نفت", en: "Oil Industry Nationalization Day" },
};

export function fixedOccasionFor(jMonth1Based, jDay) {
  return FIXED_JALALI_OCCASIONS[`${jMonth1Based}-${jDay}`] || null;
}
