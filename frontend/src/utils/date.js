import moment from "moment-jalaali";

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