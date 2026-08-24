import { useMemo } from "react";
import moment from "moment-jalaali";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { fixedJalaliOccasionFor, fixedHijriOccasionFor } from "../localization/occasions";
import { toHijri, hijriToGregorian, daysInHijriMonth, addHijriMonths, HIJRI_MONTHS_AR } from "../utils/hijri";
import { toPersianDigits } from "../utils/date";
import { JALALI_MONTHS_FA, GREGORIAN_MONTHS, WEEKDAYS_SHORT, WEEKEND_INDEXES } from "../localization/calendarNames";

// moment-jalaali's loadPersian() (called once, in src/utils/date.js) quietly
// switches moment's *global* default locale to Persian - so even plain
// Gregorian format tokens like "MMMM" silently return Persian month names.
// The Gregorian side of this widget therefore never formats through
// moment; it reads the native Date object directly.

function calendarSystemFor(language) {
  if (language === "fa") return "jalali";
  if (language === "ar") return "hijri";
  return "gregorian";
}

function occasionsFor(jMonth1Based, jDay, gYear, gMonth1Based, gDay) {
  const jalali = fixedJalaliOccasionFor(jMonth1Based, jDay);
  const hijri = toHijri(gYear, gMonth1Based, gDay);
  const hijriOccasion = fixedHijriOccasionFor(hijri.month, hijri.day);
  const list = [jalali, hijriOccasion].filter(Boolean);
  return { list, hijri };
}

function buildJalaliMonth(cursor) {
  const year = cursor.jYear();
  const month = cursor.jMonth();
  const daysInMonth = moment.jDaysInMonth(year, month);
  const firstOfMonth = cursor.clone().jDate(1);
  const offset = (firstOfMonth.day() + 1) % 7; // Saturday-first
  const today = moment();
  const isCurrentMonth = today.jYear() === year && today.jMonth() === month;

  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const m = cursor.clone().jDate(day);
    const gDate = m.toDate();
    const gYear = gDate.getFullYear();
    const gMonth = gDate.getMonth() + 1;
    const gDay = gDate.getDate();
    const { list: occasions, hijri } = occasionsFor(month + 1, day, gYear, gMonth, gDay);
    const isWeekend = WEEKEND_INDEXES.jalali.includes((offset + day - 1) % 7);
    const isHoliday = isWeekend || occasions.some((occasion) => occasion.holiday);
    cells.push({
      key: `${year}-${month}-${day}`,
      day,
      isToday: isCurrentMonth && today.jDate() === day,
      isWeekend,
      isHoliday,
      occasions,
      dateInfo: {
        jYear: year, jMonth: month + 1, jDay: day,
        gYear, gMonth, gDay,
        hYear: hijri.year, hMonth: hijri.month, hDay: hijri.day,
        weekdayIndex: (offset + day - 1) % 7,
        isToday: isCurrentMonth && today.jDate() === day,
        isHoliday,
        occasions,
      },
    });
  }
  return { title: `${JALALI_MONTHS_FA[month]} ${toPersianDigits(year)}`, weekdays: WEEKDAYS_SHORT.fa, cells };
}

function buildGregorianMonth(cursor, language) {
  const date = cursor.toDate();
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay(); // Sunday-first
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const jm = moment(new Date(year, month, day));
    const { list: occasions, hijri } = occasionsFor(jm.jMonth() + 1, jm.jDate(), year, month + 1, day);
    const isWeekend = WEEKEND_INDEXES.gregorian.includes((offset + day - 1) % 7);
    const isHoliday = isWeekend || occasions.some((occasion) => occasion.holiday);
    cells.push({
      key: `${year}-${month}-${day}`,
      day,
      isToday: isCurrentMonth && today.getDate() === day,
      isWeekend,
      isHoliday,
      occasions,
      dateInfo: {
        jYear: jm.jYear(), jMonth: jm.jMonth() + 1, jDay: jm.jDate(),
        gYear: year, gMonth: month + 1, gDay: day,
        hYear: hijri.year, hMonth: hijri.month, hDay: hijri.day,
        weekdayIndex: (offset + day - 1) % 7,
        isToday: isCurrentMonth && today.getDate() === day,
        isHoliday,
        occasions,
      },
    });
  }
  // Was always English regardless of `language` - Turkish users saw
  // "January"/"Sun Mon Tue..." in the actual grid even after DateBadge's
  // own trigger text was localized, since this builder never received
  // the active language at all.
  const monthNames = GREGORIAN_MONTHS[language] || GREGORIAN_MONTHS.en;
  return { title: `${monthNames[month]} ${year}`, weekdays: WEEKDAYS_SHORT[language] || WEEKDAYS_SHORT.en, cells };
}

// Hijri months don't line up with Gregorian month boundaries, so unlike
// the Jalali/Gregorian builders above, this one derives its own
// year/month from the cursor's Gregorian date via toHijri() rather than
// reading it directly off `cursor` - the cursor is still just an opaque
// "some day near the displayed month" moment, same contract as the other
// two builders, so CalendarSection doesn't need to know which calendar
// is active.
function buildHijriMonth(cursor) {
  const gCursor = cursor.toDate();
  const { year, month } = toHijri(gCursor.getFullYear(), gCursor.getMonth() + 1, gCursor.getDate());
  const daysInMonth = daysInHijriMonth(year, month);
  const firstOfMonthG = hijriToGregorian(year, month, 1);
  const offset = new Date(firstOfMonthG.year, firstOfMonthG.month - 1, firstOfMonthG.day).getDay(); // Sunday-first
  const todayG = new Date();
  const todayHijriYmd = toHijri(todayG.getFullYear(), todayG.getMonth() + 1, todayG.getDate());
  const isCurrentMonth = todayHijriYmd.year === year && todayHijriYmd.month === month;

  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const g = hijriToGregorian(year, month, day);
    const jm = moment(new Date(g.year, g.month - 1, g.day));
    const { list: occasions } = occasionsFor(jm.jMonth() + 1, jm.jDate(), g.year, g.month, g.day);
    const isWeekend = WEEKEND_INDEXES.hijri.includes((offset + day - 1) % 7);
    const isHoliday = isWeekend || occasions.some((occasion) => occasion.holiday);
    cells.push({
      key: `${year}-${month}-${day}`,
      day,
      isToday: isCurrentMonth && todayHijriYmd.day === day,
      isWeekend,
      isHoliday,
      occasions,
      dateInfo: {
        jYear: jm.jYear(), jMonth: jm.jMonth() + 1, jDay: jm.jDate(),
        gYear: g.year, gMonth: g.month, gDay: g.day,
        hYear: year, hMonth: month, hDay: day,
        weekdayIndex: (offset + day - 1) % 7,
        isToday: isCurrentMonth && todayHijriYmd.day === day,
        isHoliday,
        occasions,
      },
    });
  }
  return { title: `${HIJRI_MONTHS_AR[month - 1]} ${year}`, weekdays: WEEKDAYS_SHORT.ar, cells, hijriYearMonth: { year, month } };
}

export default function CalendarWidget({ cursor, onCursorChange, selectedKey, onSelectDay }) {
  const { language, dir, n } = useLanguage();
  const calendarSystem = calendarSystemFor(language);
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  // Memoized so a scroll/resize-triggered re-render of DateBadge (which
  // keeps its portaled popover positioned while open) doesn't rebuild this
  // month grid - including per-day occasion/Hijri lookups - on every tick.
  const built = useMemo(() => (
    calendarSystem === "jalali" ? buildJalaliMonth(cursor)
    : calendarSystem === "hijri" ? buildHijriMonth(cursor)
    : buildGregorianMonth(cursor, language)
  ), [calendarSystem, cursor, language]);
  const { title, weekdays, cells } = built;

  function goPrev() {
    if (calendarSystem === "jalali") {
      onCursorChange(cursor.clone().subtract(1, "jMonth"));
    } else if (calendarSystem === "hijri") {
      const { year, month } = addHijriMonths(built.hijriYearMonth, -1);
      const g = hijriToGregorian(year, month, 1);
      onCursorChange(moment(new Date(g.year, g.month - 1, g.day)));
    } else {
      onCursorChange(cursor.clone().subtract(1, "month"));
    }
  }
  function goNext() {
    if (calendarSystem === "jalali") {
      onCursorChange(cursor.clone().add(1, "jMonth"));
    } else if (calendarSystem === "hijri") {
      const { year, month } = addHijriMonths(built.hijriYearMonth, 1);
      const g = hijriToGregorian(year, month, 1);
      onCursorChange(moment(new Date(g.year, g.month - 1, g.day)));
    } else {
      onCursorChange(cursor.clone().add(1, "month"));
    }
  }
  function goToday() {
    onCursorChange(moment());
  }

  return (
    <div
      className="erp-surface"
      style={{
        borderRadius: 20,
        padding: 16,
        color: "var(--erp-text)",
        direction: dir,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CalendarDays size={16} color="var(--erp-accent)" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>{title}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" onClick={goPrev} aria-label={tr("ماه قبل", "الشهر السابق", "Önceki ay", "Previous month")} style={iconButtonStyle}>
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={goToday}
            style={{ ...iconButtonStyle, width: "auto", padding: "0 8px", fontSize: 11, fontWeight: 800, color: "var(--erp-accent)" }}
          >
            {tr("امروز", "اليوم", "Bugün", "Today")}
          </button>
          <button type="button" onClick={goNext} aria-label={tr("ماه بعد", "الشهر التالي", "Sonraki ay", "Next month")} style={iconButtonStyle}>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* A single grid spans the weekday headers *and* every day cell -
          separate grid instances per week row can round column widths
          a pixel or two differently from each other, drifting the last
          column visibly out of alignment over several rows. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {weekdays.map((wd, index) => (
          <div
            key={`h-${index}`}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 800,
              // Was `index === weekdays.length - 1` - only ever highlighted
              // the single last column, correct for Jalali's one-day
              // weekend but wrong for Hijri (Fri+Sat) and Gregorian
              // (Sat+Sun), which need two columns marked.
              color: WEEKEND_INDEXES[calendarSystem].includes(index) ? "var(--erp-accent-2)" : "var(--erp-muted)",
              padding: "2px 0 6px",
            }}
          >
            {wd}
          </div>
        ))}

        {cells.map((cell, index) => {
          const isSelected = cell && cell.key === selectedKey;
          return (
            <button
              key={index}
              type="button"
              disabled={!cell}
              onClick={() => cell && onSelectDay(cell.key, cell.dateInfo)}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                border: isSelected && !cell?.isToday ? "1.5px solid var(--erp-accent)" : "1.5px solid transparent",
                boxSizing: "border-box",
                fontSize: 13,
                fontWeight: cell?.isToday ? 900 : 600,
                background: cell?.isToday ? "var(--erp-accent)" : "transparent",
                color: cell
                  ? cell.isToday
                    ? "var(--erp-on-accent)"
                    : cell.isHoliday
                      ? "var(--erp-danger)"
                      : "var(--erp-text)"
                  : "transparent",
                cursor: cell ? "pointer" : "default",
                padding: 0,
                fontFamily: "inherit",
                lineHeight: 1,
              }}
            >
              {/* The occasion dot is positioned absolutely so its presence
                  never shifts the number away from dead-center - previously
                  it sat below the number in a flex column, so cells with an
                  occasion pushed their number upward relative to neighbors
                  without one, making the whole row look misaligned. */}
              <span>{cell ? n(cell.day) : ""}</span>
              {cell?.occasions.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 5,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: cell.isToday ? "var(--erp-on-accent)" : cell.isHoliday ? "var(--erp-danger)" : "var(--erp-accent)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const iconButtonStyle = {
  width: 24,
  height: 24,
  borderRadius: 8,
  border: "none",
  background: "var(--erp-panel-solid)",
  color: "var(--erp-text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxSizing: "border-box",
};
