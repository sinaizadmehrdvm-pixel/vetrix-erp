import { useEffect, useRef, useState } from "react";
import moment from "moment-jalaali";
import { useLanguage } from "../localization/useLanguage";
import CalendarSection from "./CalendarSection";

const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const GREGORIAN_MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_NAMES_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const WEEKDAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DateBadge() {
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const now = moment();
  const weekdayIndex = (now.day() + 1) % 7; // Saturday-first
  const day = fa ? n(now.jDate()) : now.toDate().getDate();
  const month = fa ? JALALI_MONTHS_FA[now.jMonth()] : GREGORIAN_MONTHS_EN[now.toDate().getMonth()];
  const weekday = fa ? WEEKDAY_NAMES_FA[weekdayIndex] : WEEKDAY_NAMES_EN[weekdayIndex];

  return (
    <div ref={containerRef} style={{ position: "relative", direction: dir }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="erp-surface"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 18,
          padding: "8px 14px 8px 8px",
          border: open ? "1px solid var(--erp-accent)" : undefined,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "var(--erp-accent)",
            color: "#071028",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {day}
        </span>
        <span style={{ textAlign: "start", lineHeight: 1.3 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: "var(--erp-text)" }}>{weekday}</span>
          <span style={{ display: "block", fontSize: 11, color: "var(--erp-muted)" }}>{month}</span>
        </span>
      </button>

      {open && (
        <div
          className="erp-surface"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            insetInlineEnd: 0,
            zIndex: 50,
            borderRadius: 20,
            padding: 14,
            boxShadow: "0 20px 60px rgba(0,0,0,.35)",
            width: "max-content",
          }}
        >
          <CalendarSection />
        </div>
      )}
    </div>
  );
}
