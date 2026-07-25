import { useState } from "react";
import moment from "moment-jalaali";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

// moment-jalaali's loadPersian() (called once, in src/utils/date.js) quietly
// switches moment's *global* default locale to Persian - so even plain
// Gregorian format tokens like "MMMM" silently return Persian month names.
// The Gregorian side of this widget therefore never formats through
// moment; it reads the native Date object directly.
const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const GREGORIAN_MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"]; // Saturday-first
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    cells.push({
      day,
      isToday: isCurrentMonth && today.jDate() === day,
      isWeekend: (offset + day - 1) % 7 === 6, // Friday column
    });
  }
  return { title: `${JALALI_MONTHS_FA[month]} ${year}`, weekdays: WEEKDAYS_FA, cells };
}

function buildGregorianMonth(cursor) {
  const date = cursor.toDate();
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay(); // Sunday-first
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      isToday: isCurrentMonth && today.getDate() === day,
      isWeekend: (offset + day - 1) % 7 === 0 || (offset + day - 1) % 7 === 6,
    });
  }
  return { title: `${GREGORIAN_MONTHS_EN[month]} ${year}`, weekdays: WEEKDAYS_EN, cells };
}

export default function CalendarWidget() {
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";
  const [cursor, setCursor] = useState(() => moment());

  const { title, weekdays, cells } = fa ? buildJalaliMonth(cursor) : buildGregorianMonth(cursor);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function goPrev() {
    setCursor((current) => current.clone().subtract(1, fa ? "jMonth" : "month"));
  }
  function goNext() {
    setCursor((current) => current.clone().add(1, fa ? "jMonth" : "month"));
  }
  function goToday() {
    setCursor(moment());
  }

  return (
    <div
      className="erp-surface"
      style={{
        borderRadius: 24,
        padding: 20,
        color: "var(--erp-text)",
        direction: dir,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarDays size={20} color="var(--erp-accent)" />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{title}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={goPrev}
            aria-label={fa ? "ماه قبل" : "Previous month"}
            style={iconButtonStyle}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={goToday}
            style={{ ...iconButtonStyle, width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 800, color: "var(--erp-accent)" }}
          >
            {fa ? "امروز" : "Today"}
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={fa ? "ماه بعد" : "Next month"}
            style={iconButtonStyle}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {weekdays.map((wd, index) => (
          <div
            key={index}
            style={{
              textAlign: "center",
              fontSize: 12,
              fontWeight: 800,
              color: index === weekdays.length - 1 ? "#fb7185" : "var(--erp-muted)",
              padding: "4px 0",
            }}
          >
            {wd}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {week.map((cell, dayIndex) => (
              <div
                key={dayIndex}
                style={{
                  aspectRatio: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: cell?.isToday ? 900 : 600,
                  background: cell?.isToday ? "var(--erp-accent)" : "transparent",
                  color: cell
                    ? cell.isToday
                      ? "#071028"
                      : cell.isWeekend
                        ? "#fb7185"
                        : "var(--erp-text)"
                    : "transparent",
                }}
              >
                {cell ? n(cell.day) : ""}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const iconButtonStyle = {
  width: 30,
  height: 30,
  borderRadius: 10,
  border: "none",
  background: "var(--erp-panel-solid)",
  color: "var(--erp-text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
