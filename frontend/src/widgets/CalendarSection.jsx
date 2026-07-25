import { useMemo, useState } from "react";
import moment from "moment-jalaali";
import { useLanguage } from "../localization/useLanguage";
import CalendarWidget from "./CalendarWidget";
import DayDetailsCard from "./DayDetailsCard";

function todayDateInfo() {
  const now = moment();
  const weekdayIndex = (now.day() + 1) % 7; // Saturday-first, matches CalendarWidget
  return {
    key: `${now.jYear()}-${now.jMonth()}-${now.jDate()}`,
    dateInfo: {
      jYear: now.jYear(),
      jMonth: now.jMonth() + 1,
      jDay: now.jDate(),
      gYear: now.toDate().getFullYear(),
      gMonth: now.toDate().getMonth() + 1,
      gDay: now.toDate().getDate(),
      weekdayIndex,
      isToday: true,
      occasion: null,
    },
  };
}

export default function CalendarSection() {
  const { dir } = useLanguage();
  const [cursor, setCursor] = useState(() => moment());
  const initial = useMemo(() => todayDateInfo(), []);
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
      <div style={{ width: 300, flexShrink: 0 }}>
        <CalendarWidget
          cursor={cursor}
          onCursorChange={handleCursorChange}
          selectedKey={selectedKey}
          onSelectDay={handleSelectDay}
        />
      </div>
      <div style={{ width: 220, flexShrink: 0 }}>
        <DayDetailsCard dateInfo={selectedDateInfo} />
      </div>
    </div>
  );
}
