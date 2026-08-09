import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import moment from "moment-jalaali";
import { toJalali, todayJalali, fromJalali, toHijriText, todayHijri, fromHijriText, toPersianDigits } from "../../utils/date";
import { toHijri, hijriToGregorian, daysInHijriMonth, addHijriMonths, HIJRI_MONTHS_AR } from "../../utils/hijri";

function calendarSystemFor(lang, fa) {
  if (lang === "fa" || (!lang && fa)) return "jalali";
  if (lang === "ar") return "hijri";
  return "gregorian";
}

const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const GREGORIAN_MONTHS = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const WEEKDAYS_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"]; // Saturday-first
const WEEKDAYS_AR = ["ح", "ن", "ث", "ر", "خ", "ج", "س"]; // Sunday-first
const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // Sunday-first

function isoOf(year, month1Based, day) {
  return `${year}-${String(month1Based).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Builds a lightweight month grid (no holiday/occasion lookups - this is
// a date *picker*, not the dashboard calendar widget) for whichever
// calendar system the active language uses.
function buildGrid(calendarSystem, cursor, language) {
  if (calendarSystem === "jalali") {
    const year = cursor.jYear();
    const month = cursor.jMonth();
    const daysInMonth = moment.jDaysInMonth(year, month);
    const offset = (cursor.clone().jDate(1).day() + 1) % 7;
    const today = moment();
    const cells = Array(offset).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const g = cursor.clone().jDate(day).toDate();
      cells.push({ day, label: toPersianDigits(day), iso: isoOf(g.getFullYear(), g.getMonth() + 1, g.getDate()), isToday: today.jYear() === year && today.jMonth() === month && today.jDate() === day });
    }
    return { title: `${JALALI_MONTHS_FA[month]} ${toPersianDigits(year)}`, weekdays: WEEKDAYS_FA, cells };
  }

  if (calendarSystem === "hijri") {
    const gCursor = cursor.toDate();
    const { year, month } = toHijri(gCursor.getFullYear(), gCursor.getMonth() + 1, gCursor.getDate());
    const daysInMonth = daysInHijriMonth(year, month);
    const firstG = hijriToGregorian(year, month, 1);
    const offset = new Date(firstG.year, firstG.month - 1, firstG.day).getDay();
    const todayG = new Date();
    const todayHijriYmd = toHijri(todayG.getFullYear(), todayG.getMonth() + 1, todayG.getDate());
    const cells = Array(offset).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const g = hijriToGregorian(year, month, day);
      cells.push({ day, label: day, iso: isoOf(g.year, g.month, g.day), isToday: todayHijriYmd.year === year && todayHijriYmd.month === month && todayHijriYmd.day === day });
    }
    return { title: `${HIJRI_MONTHS_AR[month - 1]} ${year}`, weekdays: WEEKDAYS_AR, cells, hijriYearMonth: { year, month } };
  }

  const date = cursor.toDate();
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay();
  const today = new Date();
  const monthNames = GREGORIAN_MONTHS[language] || GREGORIAN_MONTHS.en;
  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, label: day, iso: isoOf(year, month + 1, day), isToday: today.getFullYear() === year && today.getMonth() === month && today.getDate() === day });
  }
  return { title: `${monthNames[month]} ${year}`, weekdays: WEEKDAYS_EN, cells };
}

function cursorFromIso(iso) {
  const parsed = iso ? moment(iso) : null;
  return parsed && parsed.isValid() ? parsed : moment();
}

// A text date field that stores/emits a Gregorian ISO ("YYYY-MM-DD") value
// but displays, accepts typed text in, and offers a clickable popup
// calendar for whichever calendar system the active language uses:
// Jalali for Persian, Hijri for Arabic, and plain Gregorian for Turkish/
// English - the app stores every business date as ISO, but several pages
// were showing a Jalali-format placeholder ("۱۴۰۵/۰۳/۰۹") while actually
// reading/writing the raw ISO string with only its digits swapped to
// Persian numerals, which isn't a real calendar conversion and made the
// "Today" button fill a value that contradicted the field's own
// placeholder. There was also no way to *pick* a day visually - only
// type one - so this adds a small popup grid matching the same calendar.
export default function JalaliDateField({ value, onChange, fa, language, className, placeholder, style }) {
  const lang = language || (fa ? "fa" : "en");
  const calendarSystem = calendarSystemFor(lang, fa);
  const tr = (faText, arText, trText, enText) =>
    lang === "fa" ? faText : lang === "ar" ? arText : lang === "tr" ? trText : enText;

  const displayFor = (v) => {
    if (calendarSystem === "jalali") return toJalali(v);
    if (calendarSystem === "hijri") return toHijriText(v);
    return v || "";
  };
  const [text, setText] = useState(() => displayFor(value));
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => cursorFromIso(value));
  const wrapperRef = useRef(null);

  // Resync the local draft text when the value/language changes from
  // outside (e.g. picking a day, the Today shortcut, or the parent
  // resetting the form) - done during render (React's documented pattern
  // for this) rather than in an effect, which would cause an extra
  // render pass.
  const [syncedKey, setSyncedKey] = useState(`${calendarSystem}:${value}`);
  const nextKey = `${calendarSystem}:${value}`;
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setText(displayFor(value));
    setCursor(cursorFromIso(value));
  }

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function commit(nextText) {
    if (calendarSystem === "jalali") {
      const iso = fromJalali(nextText);
      if (iso) onChange(iso);
    } else if (calendarSystem === "hijri") {
      const iso = fromHijriText(nextText);
      if (iso) onChange(iso);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(nextText)) {
      onChange(nextText);
    }
  }

  function setToday() {
    const isoToday = new Date().toISOString().slice(0, 10);
    if (calendarSystem === "jalali") setText(todayJalali());
    else if (calendarSystem === "hijri") setText(todayHijri());
    else setText(isoToday);
    onChange(isoToday);
    setCursor(moment());
    setOpen(false);
  }

  function pickDay(iso) {
    onChange(iso);
    setOpen(false);
  }

  function goPrevMonth() {
    if (calendarSystem === "jalali") {
      setCursor((c) => c.clone().subtract(1, "jMonth"));
    } else if (calendarSystem === "hijri") {
      const { hijriYearMonth } = grid;
      const { year, month } = addHijriMonths(hijriYearMonth, -1);
      const g = hijriToGregorian(year, month, 1);
      setCursor(moment(new Date(g.year, g.month - 1, g.day)));
    } else {
      setCursor((c) => c.clone().subtract(1, "month"));
    }
  }

  function goNextMonth() {
    if (calendarSystem === "jalali") {
      setCursor((c) => c.clone().add(1, "jMonth"));
    } else if (calendarSystem === "hijri") {
      const { hijriYearMonth } = grid;
      const { year, month } = addHijriMonths(hijriYearMonth, 1);
      const g = hijriToGregorian(year, month, 1);
      setCursor(moment(new Date(g.year, g.month - 1, g.day)));
    } else {
      setCursor((c) => c.clone().add(1, "month"));
    }
  }

  const grid = buildGrid(calendarSystem, cursor, lang);

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "flex", gap: 8, ...style }}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={
          placeholder ||
          (calendarSystem === "jalali"
            ? "۱۴۰۵/۰۳/۰۹"
            : calendarSystem === "hijri"
            ? "1448/02/11"
            : tr("", "", "2026-05-30", "2026-05-30"))
        }
        className={className}
        style={{ width: "100%", minWidth: "9.5em" }}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={tr("انتخاب تاریخ", "اختيار التاريخ", "Tarih seç", "Choose date")}
        className="rounded-2xl bg-[var(--erp-accent)] text-slate-950 flex items-center justify-center"
        style={{ width: 44, height: 44, flexShrink: 0 }}
      >
        <CalendarDays size={18} />
      </button>

      {open && (
        <div
          className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] shadow-2xl p-3"
          style={{ position: "absolute", top: "100%", marginTop: 6, zIndex: 50, width: 260, insetInlineEnd: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={goPrevMonth} aria-label={tr("ماه قبل", "الشهر السابق", "Önceki ay", "Previous month")} className="rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-text)] flex items-center justify-center" style={{ width: 26, height: 26 }}>
              <ChevronLeft size={14} />
            </button>
            <div className="text-[var(--erp-text)]" style={{ fontSize: 13, fontWeight: 800 }}>{grid.title}</div>
            <button type="button" onClick={goNextMonth} aria-label={tr("ماه بعد", "الشهر التالي", "Sonraki ay", "Next month")} className="rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-text)] flex items-center justify-center" style={{ width: 26, height: 26 }}>
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {grid.weekdays.map((wd, index) => (
              <div key={index} className="text-[var(--erp-muted)]" style={{ textAlign: "center", fontSize: 10, fontWeight: 800, padding: "2px 0" }}>{wd}</div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {grid.cells.map((cell, index) => (
              <button
                key={index}
                type="button"
                disabled={!cell}
                onClick={() => cell && pickDay(cell.iso)}
                className={cell?.isToday ? "bg-[var(--erp-accent)]" : "bg-transparent hover:bg-[var(--erp-glow)]"}
                style={{
                  aspectRatio: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  padding: 0,
                  borderRadius: 8,
                  border: "none",
                  fontSize: 12,
                  lineHeight: 1,
                  fontFamily: "inherit",
                  fontWeight: cell?.isToday ? 900 : 600,
                  color: cell ? (cell.isToday ? "#071028" : "var(--erp-text)") : "transparent",
                  cursor: cell ? "pointer" : "default",
                }}
              >
                {cell ? cell.label : ""}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={setToday}
            className="w-full rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black"
            style={{ marginTop: 8, padding: "8px 0", fontSize: 12 }}
          >
            {tr("امروز", "اليوم", "Bugün", "Today")}
          </button>
        </div>
      )}
    </div>
  );
}
