// Gregorian <-> Hijri (Islamic) calendar conversion.
//
// The pure tabular/arithmetic Islamic calendar algorithm (civil epoch,
// JDN 1948440 = 1 Muharram 1 AH) matches the commonly-cited
// international reference point (1 Jan 2000 CE = 24 Ramadan 1420 AH),
// but real Hijri calendars are ultimately fixed by each country's
// moon-sighting committee, not a formula - actual months run 29 or 30
// days depending on the real decision, and that decision drifts against
// the tabular calculation by a different, unpredictable amount every
// month (not a constant offset - see below).
//
// Cross-checking the raw tabular output against Iran's official
// government holiday calendar for six consecutive Hijri months covering
// most of Persian year 1405 (Shawwal 1447 through Rabi al-Awwal 1448)
// showed the real/tabular gap changing sign mid-cycle:
//   Shawwal 1447    starts 2026-03-21  (tabular: +1 day off)
//   Dhu al-Qadah 1447 starts 2026-04-19  (tabular: +1 day off, forced by
//                                          the 58-day gap between the
//                                          Shawwal and Dhu al-Hijjah
//                                          anchors below - 58 only
//                                          factors as 29+29)
//   Dhu al-Hijjah 1447 starts 2026-05-18  (tabular: exact match)
//   Muharram 1448   starts 2026-06-16  (tabular: -1 day off)
//   Safar 1448      starts 2026-07-16  (tabular: -1 day off)
//   Rabi al-Awwal 1448 starts 2026-08-14  (tabular: -1 day off)
// Each anchor was independently confirmed by at least two official
// dates (e.g. Eid al-Adha + Eid al-Ghadir both confirm Dhu al-Hijjah;
// Tasua + Ashura both confirm Muharram; Arbaeen + two further Safar
// holidays confirm Safar). Because the gap flips sign here, a single
// global correction constant cannot be correct for the whole year - it
// would fix one month while breaking the next. Real dates within any
// of these six anchored months are read directly off the anchor
// (exact, no formula error possible). Dates outside this anchored
// range fall back to the tabular algorithm, offset by the nearest
// anchor's own correction so the result stays continuous with the
// verified data instead of snapping back to raw tabular error - this
// is necessarily an estimate for months we have no official anchor
// for yet, same as any calculated Hijri calendar.
const ISLAMIC_EPOCH_JDN = 1948440;

const HIJRI_MONTH_ANCHORS = [
  { hy: 1447, hm: 10, gYear: 2026, gMonth: 3, gDay: 21 }, // Shawwal - Eid al-Fitr
  { hy: 1447, hm: 11, gYear: 2026, gMonth: 4, gDay: 19 }, // Dhu al-Qadah
  { hy: 1447, hm: 12, gYear: 2026, gMonth: 5, gDay: 18 }, // Dhu al-Hijjah - Eid al-Adha / Eid al-Ghadir
  { hy: 1448, hm: 1, gYear: 2026, gMonth: 6, gDay: 16 }, // Muharram - Tasua / Ashura
  { hy: 1448, hm: 2, gYear: 2026, gMonth: 7, gDay: 16 }, // Safar - Arbaeen and later holidays
  { hy: 1448, hm: 3, gYear: 2026, gMonth: 8, gDay: 14 }, // Rabi al-Awwal
];

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

function fromTabularJDN(jdn) {
  const year = Math.floor((30 * (jdn - ISLAMIC_EPOCH_JDN) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jdn - (29 + islamicToJDN(year, 1, 1))) / 29.5) + 1);
  const day = jdn - islamicToJDN(year, month, 1) + 1;
  return { year, month, day };
}

const ANCHORS_WITH_JDN = HIJRI_MONTH_ANCHORS.map((anchor) => ({
  ...anchor,
  jdn: gregorianToJDN(anchor.gYear, anchor.gMonth, anchor.gDay),
}));

/** Returns { year, month, day } - month is 1-based (1 = Muharram). */
export function toHijri(gYear, gMonth1Based, gDay) {
  const jdn = gregorianToJDN(gYear, gMonth1Based, gDay);

  let nearest = ANCHORS_WITH_JDN[0];
  let nearestIndex = 0;
  ANCHORS_WITH_JDN.forEach((anchor, index) => {
    if (anchor.jdn <= jdn) {
      nearest = anchor;
      nearestIndex = index;
    }
  });

  const next = ANCHORS_WITH_JDN[nearestIndex + 1];
  if (jdn >= nearest.jdn && next && jdn < next.jdn) {
    return { year: nearest.hy, month: nearest.hm, day: jdn - nearest.jdn + 1 };
  }

  const correction = nearest.jdn - islamicToJDN(nearest.hy, nearest.hm, 1);
  return fromTabularJDN(jdn - correction);
}
