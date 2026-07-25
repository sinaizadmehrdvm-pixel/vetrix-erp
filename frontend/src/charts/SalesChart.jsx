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
const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

// The backend buckets this chart by Gregorian year-month (index 0 =
// current month, counting backward). Converting each bucket's "day 1"
// to Jalali independently is unreliable - Persian month boundaries
// fall mid-Gregorian-month, so two consecutive Gregorian buckets can
// land in the same Jalali month while another gets skipped, scrambling
// the label order. Anchoring once on "today" and stepping back by
// array index keeps the labels perfectly sequential instead.
function monthLabelForIndex(index, fa) {
  const anchor = moment().subtract(index, "jMonth");
  return fa ? JALALI_MONTHS_FA[anchor.jMonth()] : anchor.format("MMM");
}

export default function SalesChart({ data = [] }) {
  const { t, language, n, money, dir } = useLanguage();
  const fa = language === "fa";

  const chartData = data.map((item, index) => ({
    ...item,
    monthLabel: monthLabelForIndex(index, fa),
    sales: Number(item.sales || 0),
  }));

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
              right: dir === "rtl" ? 40 : 20,
              left: dir === "rtl" ? 20 : 40,
              bottom: 10,
            }}
          >
            <XAxis
              dataKey="monthLabel"
              reversed={dir === "rtl"}
              stroke="var(--erp-muted)"
              tick={{ fill: "var(--erp-muted)", fontSize: 13 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />

            <YAxis
              orientation={dir === "rtl" ? "right" : "left"}
              stroke="var(--erp-muted)"
              tickFormatter={(value) => n(value)}
              tick={{ fill: "var(--erp-muted)", fontSize: 13 }}
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
