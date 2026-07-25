import { PartyPopper, Sparkles } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const GREGORIAN_MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const WEEKDAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DayDetailsCard({ dateInfo }) {
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";

  if (!dateInfo) return null;

  const weekdayLabel = fa ? WEEKDAY_NAMES_FA[dateInfo.weekdayIndex] : WEEKDAY_NAMES_EN[dateInfo.weekdayIndex];
  const bigDay = fa ? dateInfo.jDay : dateInfo.gDay;
  const bigMonth = fa ? JALALI_MONTHS_FA[dateInfo.jMonth - 1] : GREGORIAN_MONTHS_EN[dateInfo.gMonth - 1];
  const bigYear = fa ? dateInfo.jYear : dateInfo.gYear;
  const otherCalendarLabel = fa
    ? `${dateInfo.gDay} ${GREGORIAN_MONTHS_EN[dateInfo.gMonth - 1]} ${dateInfo.gYear}`
    : `${dateInfo.jDay} ${JALALI_MONTHS_FA[dateInfo.jMonth - 1]} ${dateInfo.jYear}`;

  return (
    <div
      className="erp-surface"
      style={{
        borderRadius: 20,
        padding: 16,
        color: "var(--erp-text)",
        direction: dir,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <Sparkles size={15} color="var(--erp-accent)" />
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--erp-muted)" }}>
          {dateInfo.isToday ? (fa ? "امروز" : "Today") : fa ? "جزئیات روز" : "Day details"}
        </span>
      </div>

      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: "var(--erp-accent)" }}>{n(bigDay)}</div>
        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>{bigMonth} {n(bigYear)}</div>
        <div style={{ fontSize: 13, color: "var(--erp-muted)", marginTop: 2 }}>{weekdayLabel}</div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: "var(--erp-muted)",
          textAlign: "center",
          paddingTop: 10,
          borderTop: "1px solid var(--erp-border)",
          marginBottom: dateInfo.occasion ? 12 : 0,
        }}
      >
        {fa ? "تقویم دیگر: " : "Other calendar: "}
        {otherCalendarLabel}
      </div>

      {dateInfo.occasion && (
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: "var(--erp-glow)",
            border: "1px solid var(--erp-border)",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <PartyPopper size={16} color="var(--erp-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.6 }}>
            {fa ? dateInfo.occasion.fa : dateInfo.occasion.en}
          </div>
        </div>
      )}
    </div>
  );
}
