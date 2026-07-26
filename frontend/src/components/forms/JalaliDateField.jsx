import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { toJalali, todayJalali, fromJalali, toHijriText, todayHijri, fromHijriText } from "../../utils/date";

function calendarSystemFor(lang, fa) {
  if (lang === "fa" || (!lang && fa)) return "jalali";
  if (lang === "ar") return "hijri";
  return "gregorian";
}

// A text date field that stores/emits a Gregorian ISO ("YYYY-MM-DD") value
// but displays and accepts the calendar matching the active app language:
// Jalali for Persian, Hijri for Arabic, and plain Gregorian for Turkish/
// English - the app stores every business date as ISO, but several pages
// were showing a Jalali-format placeholder ("۱۴۰۵/۰۳/۰۹") while actually
// reading/writing the raw ISO string with only its digits swapped to
// Persian numerals, which isn't a real calendar conversion and made the
// "Today" button fill a value that contradicted the field's own
// placeholder.
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

  // Resync the local draft text when the value/language changes from
  // outside (e.g. the Today button, or the parent resetting the form) -
  // done during render (React's documented pattern for this) rather than
  // in an effect, which would cause an extra render pass.
  const [syncedKey, setSyncedKey] = useState(`${calendarSystem}:${value}`);
  const nextKey = `${calendarSystem}:${value}`;
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setText(displayFor(value));
  }

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
  }

  return (
    <div style={{ display: "flex", gap: 8, ...style }}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        placeholder={
          placeholder ||
          (calendarSystem === "jalali"
            ? "تاریخ شمسی مثل ۱۴۰۵/۰۳/۰۹"
            : calendarSystem === "hijri"
            ? "تاريخ هجري مثل 1448/02/11"
            : tr("", "", "Tarih, ör. 2026-05-30", "Date like 2026-05-30"))
        }
        className={className}
        style={{ width: "100%" }}
      />
      <button
        type="button"
        onClick={setToday}
        className="px-4 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2"
        style={{ minWidth: 105, flexShrink: 0 }}
      >
        <CalendarDays size={17} />
        {tr("امروز", "اليوم", "Bugün", "Today")}
      </button>
    </div>
  );
}
