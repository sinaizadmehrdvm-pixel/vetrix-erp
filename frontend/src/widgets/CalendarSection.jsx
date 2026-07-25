import { useMemo, useState } from "react";
import moment from "moment-jalaali";
import { useLanguage } from "../localization/useLanguage";
import CalendarWidget from "./CalendarWidget";
import DayDetailsCard from "./DayDetailsCard";
import { fixedJalaliOccasionFor, fixedHijriOccasionFor } from "../localization/occasions";
import { toHijri } from "../utils/hijri";

function todayDateInfo(fa) {
  const now = moment();
  // Weekday indexing must match each calendar's own convention -
  // Saturday-first for Jalali, Sunday-first for Gregorian (see
  // CalendarWidget's buildJalaliMonth/buildGregorianMonth) - otherwise
  // this initial "today" state (shown before the user clicks any day)
  // reads the wrong weekday name in English mode.
  const weekdayIndex = fa ? (now.day() + 1) % 7 : now.day();
  const gDate = now.toDate();
  const gYear = gDate.getFullYear();
  const gMonth = gDate.getMonth() + 1;
  const gDay = gDate.getDate();
  const hijri = toHijri(gYear, gMonth, gDay);
  const occasions = [
    fixedJalaliOccasionFor(now.jMonth() + 1, now.jDate()),
    fixedHijriOccasionFor(hijri.month, hijri.day),
  ].filter(Boolean);
  const isWeekend = fa ? weekdayIndex === 6 : weekdayIndex === 0 || weekdayIndex === 6;
  const isHoliday = isWeekend || occasions.some((occasion) => occasion.holiday);
  return {
    key: `${now.jYear()}-${now.jMonth()}-${now.jDate()}`,
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
  const fa = language === "fa";
  const [cursor, setCursor] = useState(() => moment());
  const initial = useMemo(() => todayDateInfo(fa), [fa]);
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
