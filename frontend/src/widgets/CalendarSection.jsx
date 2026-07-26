import { useMemo, useState } from "react";
import moment from "moment-jalaali";
import { useLanguage } from "../localization/useLanguage";
import CalendarWidget from "./CalendarWidget";
import DayDetailsCard from "./DayDetailsCard";
import { fixedJalaliOccasionFor, fixedHijriOccasionFor } from "../localization/occasions";
import { toHijri } from "../utils/hijri";

function calendarSystemFor(language) {
  if (language === "fa") return "jalali";
  if (language === "ar") return "hijri";
  return "gregorian";
}

function todayDateInfo(calendarSystem) {
  const now = moment();
  const gDate = now.toDate();
  const gYear = gDate.getFullYear();
  const gMonth = gDate.getMonth() + 1;
  const gDay = gDate.getDate();
  const hijri = toHijri(gYear, gMonth, gDay);
  const occasions = [
    fixedJalaliOccasionFor(now.jMonth() + 1, now.jDate()),
    fixedHijriOccasionFor(hijri.month, hijri.day),
  ].filter(Boolean);

  // Weekday indexing and the cell `key` format must both match the
  // active calendar's own convention from CalendarWidget's month
  // builders - Saturday-first keyed on jYear/jMonth(0-based)/jDate for
  // Jalali, Sunday-first keyed on hYear/hMonth(1-based)/hDay for Hijri,
  // Sunday-first keyed on gYear/gMonth(0-based)/gDay for Gregorian -
  // otherwise this initial "today" state (shown before the user clicks
  // any day) would never match its own cell's key and never highlight.
  let weekdayIndex;
  let isWeekend;
  let key;
  if (calendarSystem === "jalali") {
    weekdayIndex = (now.day() + 1) % 7;
    isWeekend = weekdayIndex === 6;
    key = `${now.jYear()}-${now.jMonth()}-${now.jDate()}`;
  } else if (calendarSystem === "hijri") {
    weekdayIndex = now.day();
    isWeekend = weekdayIndex === 5 || weekdayIndex === 6;
    key = `${hijri.year}-${hijri.month}-${hijri.day}`;
  } else {
    weekdayIndex = now.day();
    isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
    key = `${gYear}-${gMonth - 1}-${gDay}`;
  }

  const isHoliday = isWeekend || occasions.some((occasion) => occasion.holiday);
  return {
    key,
    dateInfo: {
      jYear: now.jYear(),
      jMonth: now.jMonth() + 1,
      jDay: now.jDate(),
      gYear, gMonth, gDay,
      hYear: hijri.year, hMonth: hijri.month, hDay: hijri.day,
      weekdayIndex,
      isToday: true,
      isHoliday,
      occasions,
    },
  };
}

export default function CalendarSection() {
  const { dir, language } = useLanguage();
  const calendarSystem = calendarSystemFor(language);
  const [cursor, setCursor] = useState(() => moment());
  const initial = useMemo(() => todayDateInfo(calendarSystem), [calendarSystem]);
  const [selectedKey, setSelectedKey] = useState(initial.key);
  const [selectedDateInfo, setSelectedDateInfo] = useState(initial.dateInfo);

  function handleSelectDay(key, dateInfo) {
    setSelectedKey(key);
    setSelectedDateInfo(dateInfo);
  }

  function handleCursorChange(next) {
    setCursor(next);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, direction: dir }}>
      <div style={{ width: 340, flexShrink: 0 }}>
        <CalendarWidget
          cursor={cursor}
          onCursorChange={handleCursorChange}
          selectedKey={selectedKey}
          onSelectDay={handleSelectDay}
        />
      </div>
      <div style={{ width: 260, flexShrink: 0 }}>
        <DayDetailsCard dateInfo={selectedDateInfo} />
      </div>
    </div>
  );
}
