// Gregorian <-> Hijri (Islamic) calendar conversion using the standard
// tabular/arithmetic Islamic calendar algorithm (civil epoch, JDN
// 1948440 = 1 Muharram 1 AH = 19 July 622 CE proleptic Gregorian). This
// is the same widely-used reference algorithm behind most calendar
// converters, and matches the commonly-cited international reference
// point (1 Jan 2000 CE = 24 Ramadan 1420 AH) with no adjustment.
//
// Like every calculated Hijri calendar, the raw tabular result can
// differ from a given country's officially *announced* (committee/
// moon-sighting based) calendar - real Hijri months run 29 or 30 days
// depending on the actual decision, which no fixed formula can know in
// advance. For Iran specifically, cross-checking against the official
// government holiday calendar for Mordad 1405 (13 Mordad = 20 Safar,
// 21 Mordad = 28 Safar, 22 Mordad = 29 Safar, 30 Mordad = 8 Rabi
// al-Awwal 1448 - via eghtesadonline.com's coverage of the official
// calendar) showed the raw tabular output landing exactly one day
// behind Iran's official calendar across all four anchor points,
// including the month rollover into Rabi al-Awwal - so a +1 day
// correction is applied to match Iran's official calendar for the
// current Hijri year. This is a point-in-time calibration, not a
// universal constant: if it ever drifts again for a future year, the
// fix is to re-derive HIJRI_DAY_ADJUSTMENT the same way, against a
// fresh official anchor date.
const ISLAMIC_EPOCH_JDN = 1948440;
const HIJRI_DAY_ADJUSTMENT = 1;

export const HIJRI_MONTHS_FA = [
  "محرم", "صفر", "ربیع‌الاول", "ربیع‌الثانی", "جمادی‌الاول", "جمادی‌الثانی",
  "رجب", "شعبان", "رمضان", "شوال", "ذی‌القعده", "ذی‌الحجه",
];
export const HIJRI_MONTHS_EN = [
  "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Awwal", "Jumada al-Thani",
  "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah",
];

function gregorianToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function islamicToJDN(year, month, day) {
  return (
    day +
    Math.ceil(29.5 * (month - 1)) +
    (year - 1) * 354 +
    Math.floor((3 + 11 * year) / 30) +
    ISLAMIC_EPOCH_JDN -
    1
  );
}

/** Returns { year, month, day } - month is 1-based (1 = Muharram). */
export function toHijri(gYear, gMonth1Based, gDay) {
  const jdn = gregorianToJDN(gYear, gMonth1Based, gDay) + HIJRI_DAY_ADJUSTMENT;
  const year = Math.floor((30 * (jdn - ISLAMIC_EPOCH_JDN) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jdn - (29 + islamicToJDN(year, 1, 1))) / 29.5) + 1);
  const day = jdn - islamicToJDN(year, month, 1) + 1;
  return { year, month, day };
}
