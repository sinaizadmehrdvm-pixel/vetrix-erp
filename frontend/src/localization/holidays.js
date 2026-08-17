// Reusable holiday lookup for the shared date-picker (JalaliDateField) -
// keeps the "which day is a holiday" concern out of individual pages so
// no page hardcodes its own holiday array.
//
// Jurisdiction resolution order:
//   1. The company/organization's configured country (LanguageProvider's
//      `country`, from Settings - persisted per-company, the authoritative
//      signal when it exists).
//   2. Falls back to a calendar-system-keyed table (no country signal
//      available) using the same conservative fixed-date set.
//
// Deliberately conservative: only fixed, calendar-definitional or
// universally-fixed-date holidays are included. Lunar/moveable religious
// holidays (Eid, Ashura, etc.) require real astronomical/authoritative
// data this app does not have a source for - fabricating specific Hijri
// (or Jalali solar-Hijri secondary) holiday dates in an accounting
// product would be a correctness risk (business-day/due-date
// implications), so those are intentionally left uncovered rather than
// guessed. `holidayCoverage()` below reports this honestly per
// country+calendar combination instead of letting an empty result set be
// silently mistaken for "there are no holidays this jurisdiction observes."
//
// To wire in a real authoritative dataset later (backend-driven feed,
// licensed holiday API, etc.): populate/replace HOLIDAYS_BY_COUNTRY and
// extend COVERAGE - `holidayFor`'s signature and every call site stay the
// same.

// Country code (matches localization/countryProfiles.js's COUNTRY_PROFILES
// keys) -> calendar system -> "MM-DD" -> { [language]: name }.
const HOLIDAYS_BY_COUNTRY = {
  IR: {
    jalali: {
      // Nowruz (Persian New Year) - always 1-4 Farvardin by definition of
      // the Jalali calendar itself, not a computed/looked-up date.
      "01-01": { fa: "نوروز", en: "Nowruz (Persian New Year)" },
      "01-02": { fa: "نوروز", en: "Nowruz (Persian New Year)" },
      "01-03": { fa: "نوروز", en: "Nowruz (Persian New Year)" },
      "01-04": { fa: "نوروز", en: "Nowruz (Persian New Year)" },
    },
  },
  TR: {
    gregorian: {
      "01-01": { tr: "Yılbaşı", en: "New Year's Day" },
    },
  },
  US: {
    gregorian: {
      "01-01": { en: "New Year's Day" },
    },
  },
  GB: {
    gregorian: {
      "01-01": { en: "New Year's Day" },
    },
  },
};

// No-country-configured fallback, keyed directly by calendar system - the
// same fixed-date set as above, used only when the active company has no
// country set (or country lookup is unavailable to the caller).
const FALLBACK_HOLIDAYS = {
  jalali: HOLIDAYS_BY_COUNTRY.IR.jalali,
  gregorian: HOLIDAYS_BY_COUNTRY.TR.gregorian,
};

// Which (country, calendar system) pairs have any curated data at all -
// drives holidayCoverage() so the UI can say "coverage unsupported" rather
// than implying completeness from an empty result.
const COVERAGE = {
  IR: ["jalali"],
  TR: ["gregorian"],
  US: ["gregorian"],
  GB: ["gregorian"],
};

/**
 * @param {"jalali"|"hijri"|"gregorian"} calendarSystem
 * @param {number} monthOneBased - 1-12 in the given calendar system
 * @param {number} day
 * @param {string} language
 * @param {string} [country] - ISO country code (countryProfiles.js keys),
 *   e.g. the active company's configured country. Optional - falls back
 *   to the calendar-system-only table when omitted or unmapped.
 * @returns {{ name: string } | null}
 */
export function holidayFor(calendarSystem, monthOneBased, day, language, country) {
  const key = `${String(monthOneBased).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const table = (country && HOLIDAYS_BY_COUNTRY[country]?.[calendarSystem]) || FALLBACK_HOLIDAYS[calendarSystem];
  if (!table) return null;
  const entry = table[key];
  if (!entry) return null;
  const name = entry[language] || entry.en || entry.fa;
  return name ? { name } : null;
}

/**
 * Honest coverage report for a (country, calendar system) pair - lets a
 * caller distinguish "genuinely no holiday today" from "this jurisdiction
 * isn't covered by curated data yet," instead of treating an empty
 * `holidayFor()` result as proof of the former.
 * @param {string} [country]
 * @param {"jalali"|"hijri"|"gregorian"} calendarSystem
 * @returns {{ supported: boolean, reason: string|null }}
 */
export function holidayCoverage(country, calendarSystem) {
  if (calendarSystem === "hijri") {
    return { supported: false, reason: "lunar-dates-not-available" };
  }
  const supported = country ? Boolean(COVERAGE[country]?.includes(calendarSystem)) : Boolean(FALLBACK_HOLIDAYS[calendarSystem]);
  return { supported, reason: supported ? null : "no-curated-data-for-jurisdiction" };
}
