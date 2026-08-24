import { PartyPopper, Sparkles } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { HIJRI_MONTHS_FA, HIJRI_MONTHS_EN, HIJRI_MONTHS_AR } from "../utils/hijri";

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
const WEEKDAY_NAMES_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function calendarSystemFor(language) {
  if (language === "fa") return "jalali";
  if (language === "ar") return "hijri";
  return "gregorian";
}

export default function DayDetailsCard({ dateInfo }) {
  const { language, dir, n } = useLanguage();
  const calendarSystem = calendarSystemFor(language);
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  if (!dateInfo) return null;

  // Weekday index follows Saturday-first for Jalali and Sunday-first for
  // both Hijri and Gregorian (see CalendarWidget's month builders), so
  // Jalali needs its own name array while Hijri/Gregorian share the
  // Sunday-first WEEKDAY_NAMES_* arrays.
  const weekdayLabel =
    calendarSystem === "jalali" ? WEEKDAY_NAMES_FA[dateInfo.weekdayIndex]
    : calendarSystem === "hijri" ? WEEKDAY_NAMES_AR[dateInfo.weekdayIndex]
    : WEEKDAY_NAMES_EN[dateInfo.weekdayIndex];

  const bigDay = calendarSystem === "jalali" ? dateInfo.jDay : calendarSystem === "hijri" ? dateInfo.hDay : dateInfo.gDay;
  const bigYear = calendarSystem === "jalali" ? dateInfo.jYear : calendarSystem === "hijri" ? dateInfo.hYear : dateInfo.gYear;
  const bigMonth =
    calendarSystem === "jalali" ? JALALI_MONTHS_FA[dateInfo.jMonth - 1]
    : calendarSystem === "hijri" ? HIJRI_MONTHS_AR[dateInfo.hMonth - 1]
    : GREGORIAN_MONTHS_EN[dateInfo.gMonth - 1];

  const hijriMonth = tr(HIJRI_MONTHS_FA[dateInfo.hMonth - 1], HIJRI_MONTHS_AR[dateInfo.hMonth - 1], HIJRI_MONTHS_EN[dateInfo.hMonth - 1], HIJRI_MONTHS_EN[dateInfo.hMonth - 1]);
  const otherCalendars =
    calendarSystem === "jalali"
      ? [
          { label: "میلادی", value: `${dateInfo.gDay} ${GREGORIAN_MONTHS_EN[dateInfo.gMonth - 1]} ${dateInfo.gYear}` },
          { label: "قمری", value: `${n(dateInfo.hDay)} ${hijriMonth} ${n(dateInfo.hYear)}` },
        ]
      : calendarSystem === "hijri"
      ? [
          { label: "ميلادي", value: `${n(dateInfo.gDay)} ${GREGORIAN_MONTHS_EN[dateInfo.gMonth - 1]} ${n(dateInfo.gYear)}` },
          { label: "الفارسي", value: `${n(dateInfo.jDay)} ${JALALI_MONTHS_FA[dateInfo.jMonth - 1]} ${n(dateInfo.jYear)}` },
        ]
      : [
          { label: "Jalali", value: `${dateInfo.jDay} ${JALALI_MONTHS_FA[dateInfo.jMonth - 1]} ${dateInfo.jYear}` },
          { label: "Hijri", value: `${dateInfo.hDay} ${hijriMonth} ${dateInfo.hYear}` },
        ];

  const occasions = dateInfo.occasions || (dateInfo.occasion ? [dateInfo.occasion] : []);

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
          {dateInfo.isToday ? tr("امروز", "اليوم", "Bugün", "Today") : tr("جزئیات روز", "تفاصيل اليوم", "Gün ayrıntıları", "Day details")}
        </span>
      </div>

      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: dateInfo.isHoliday ? "#fb7185" : "var(--erp-accent)" }}>
          {n(bigDay)}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>{bigMonth} {n(bigYear)}</div>
        <div style={{ fontSize: 13, color: "var(--erp-muted)", marginTop: 2 }}>{weekdayLabel}</div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
          color: "var(--erp-muted)",
          paddingTop: 10,
          borderTop: "1px solid var(--erp-border)",
          marginBottom: occasions.length > 0 ? 12 : 0,
        }}
      >
        {otherCalendars.map((entry) => (
          <div key={entry.label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{entry.label}</span>
            <bdi>{entry.value}</bdi>
          </div>
        ))}
      </div>

      {occasions.length > 0 && (
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {occasions.map((occasion, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                background: occasion.holiday ? "rgba(251,113,133,0.12)" : "var(--erp-glow)",
                border: occasion.holiday ? "1px solid rgba(251,113,133,0.4)" : "1px solid var(--erp-border)",
                borderRadius: 14,
                padding: 12,
              }}
            >
              <PartyPopper size={16} color={occasion.holiday ? "#fb7185" : "var(--erp-accent)"} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {occasion.holiday && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fb7185" }}>
                    {tr("تعطیل رسمی", "عطلة رسمية", "Resmi tatil", "Official holiday")}
                  </span>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.6 }}>{calendarSystem === "jalali" ? occasion.fa : occasion.en}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
