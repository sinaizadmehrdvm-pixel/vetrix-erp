// Two small, curated occasion lists - deliberately NOT an exhaustive
// database, to avoid ever asserting a wrong date in a business tool.
//
// 1) Iranian national occasions on a *fixed* solar (Jalali) date -
//    Nowruz, Nature Day, the Revolution anniversary, etc. These need
//    no calendar conversion at all, so there's no accuracy concern.
//
// 2) Well-established Shia/Iranian occasions on a *fixed* Hijri
//    (lunar) date - Ashura, Eid al-Fitr, etc. These are exact on the
//    Hijri calendar itself; the Gregorian/Jalali -> Hijri conversion
//    (see utils/hijri.js) is calibrated against Iran's official
//    government holiday calendar so these line up with the dates
//    users actually see marked as holidays elsewhere.
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

// Keyed "hijriMonth-hijriDay" (1-based month, 1 = Muharram).
export const FIXED_HIJRI_OCCASIONS = {
  "1-1": { fa: "آغاز سال نو قمری", en: "Islamic New Year" },
  "1-9": { fa: "تاسوعای حسینی", en: "Tasua" },
  "1-10": { fa: "عاشورای حسینی", en: "Ashura" },
  "2-20": { fa: "اربعین حسینی", en: "Arbaeen" },
  "2-28": { fa: "رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)", en: "Passing of the Prophet & martyrdom of Imam Hasan" },
  "2-29": { fa: "شهادت امام رضا (ع)", en: "Martyrdom of Imam Reza" },
  "3-8": { fa: "شهادت امام حسن عسکری (ع)", en: "Martyrdom of Imam Hassan Askari" },
  "3-17": { fa: "میلاد پیامبر اکرم (ص) و امام جعفر صادق (ع)", en: "Birth of the Prophet & Imam Ja'far al-Sadiq" },
  "7-13": { fa: "میلاد امام علی (ع)", en: "Birth of Imam Ali" },
  "7-27": { fa: "مبعث پیامبر اکرم (ص)", en: "Mab'ath of the Prophet" },
  "8-15": { fa: "میلاد امام زمان (عج)", en: "Birth of Imam Mahdi" },
  "9-21": { fa: "شهادت امام علی (ع)", en: "Martyrdom of Imam Ali" },
  "10-1": { fa: "عید فطر", en: "Eid al-Fitr" },
  "12-9": { fa: "روز عرفه", en: "Day of Arafah" },
  "12-10": { fa: "عید قربان", en: "Eid al-Adha" },
  "12-18": { fa: "عید غدیر خم", en: "Eid al-Ghadir" },
};

export function fixedJalaliOccasionFor(jMonth1Based, jDay) {
  return FIXED_JALALI_OCCASIONS[`${jMonth1Based}-${jDay}`] || null;
}

export function fixedHijriOccasionFor(hMonth1Based, hDay) {
  return FIXED_HIJRI_OCCASIONS[`${hMonth1Based}-${hDay}`] || null;
}
