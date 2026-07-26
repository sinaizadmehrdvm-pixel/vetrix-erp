import moment from "moment-jalaali";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useLanguage } from "../localization/useLanguage";

// moment-jalaali's jMMMM token returns the Latin transliteration
// ("Farvardin"), not the Persian-script name, regardless of
// loadPersian() - so the Persian month name is looked up explicitly.
// loadPersian() also silently switches moment's *global* default
// locale to Persian, which means even plain Gregorian tokens like
// "MMM"/"MMMM" return Persian month names too - so the English label
// is built from the native Date object instead, never through moment.
const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const GREGORIAN_MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// The backend buckets this chart by Gregorian year-month (index 0 =
// current month, counting backward). Converting each bucket's "day 1"
// to Jalali independently is unreliable - Persian month boundaries
// fall mid-Gregorian-month, so two consecutive Gregorian buckets can
// land in the same Jalali month while another gets skipped, scrambling
// the label order. Anchoring once on "today" and stepping back by
// array index keeps the mapping correct regardless of that boundary
// mismatch: each of the 12 points gets exactly one (Jalali month,
// Jalali month-index) pair, with no duplicates and no gaps.
function monthMeta(index, fa) {
  if (fa) {
    const anchor = moment().subtract(index, "jMonth");
    return { order: anchor.jMonth(), label: JALALI_MONTHS_FA[anchor.jMonth()] };
  }
  const anchor = new Date();
  anchor.setDate(1); // avoid month-end rollover (e.g. Mar 31 - 1 month != Feb)
  anchor.setMonth(anchor.getMonth() - index);
  return { order: anchor.getMonth(), label: GREGORIAN_MONTHS_EN[anchor.getMonth()] };
}

export default function SalesChart({ data = [] }) {
  const { t, language, n, money, dir } = useLanguage();
  const fa = language === "fa";

  // Always laid out left-to-right in fixed calendar order (Farvardin/Jan
  // first through Esfand/Dec last), not by recency - a rolling 12-month
  // window contains each calendar month exactly once, so sorting by
  // calendar month index is unambiguous.
  const chartData = data
    .map((item, index) => {
      const meta = monthMeta(index, fa);
      return {
        ...item,
        monthLabel: meta.label,
        monthOrder: meta.order,
        sales: Number(item.sales || 0),
      };
    })
    .sort((a, b) => a.monthOrder - b.monthOrder);

  return (
    <div
      className="erp-surface"
      style={{
        borderRadius: 24,
        padding: 20,
        minHeight: 360,
        direction: dir,
      }}
    >
      <h2
        style={{
          color: "var(--erp-text)",
          marginBottom: 20,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("salesOverview")}
      </h2>

      <div style={{ direction: "ltr", width: "100%", minWidth: 0, height: 280, overflow: "hidden" }}>
        <ResponsiveContainer width="99%" height={280}>
          <LineChart
            data={chartData}
            margin={{
              top: 10,
              right: 20,
              left: 10,
              bottom: 10,
            }}
          >
            <XAxis
              dataKey="monthLabel"
              stroke="var(--erp-muted)"
              tick={{ fill: "var(--erp-muted)", fontSize: 12 }}
              interval={0}
            />

            <YAxis
              orientation="left"
              stroke="var(--erp-muted)"
              tickFormatter={(value) => n(value)}
              tick={{ fill: "var(--erp-muted)", fontSize: 13 }}
              width={80}
            />

            <Tooltip
              formatter={(value) => [money(value), t("sales") || t("revenue")]}
              labelFormatter={(label) => label}
              contentStyle={{
                direction: dir,
                textAlign: dir === "rtl" ? "right" : "left",
                borderRadius: 12,
                border: "none",
                background: "#f8fafc",
                color: "#0f172a",
                fontWeight: 800,
              }}
            />

            <Line
              type="monotone"
              dataKey="sales"
              stroke="var(--erp-accent)"
              strokeWidth={4}
              dot={{ r: 5 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
