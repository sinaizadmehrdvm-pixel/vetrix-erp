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

function monthLabelFor(item, fa) {
  // item.key is an unambiguous "YYYY-MM" (Gregorian) from the backend -
  // always derive the label from it instead of the backend's own
  // "month" field (which bakes in a fixed fa+en string regardless of the
  // app's selected language) or the array index (which only lined up
  // with a calendar month by coincidence for a 12-month chart).
  if (!item.key) return item.month || "";
  const parsed = moment(`${item.key}-01`, "YYYY-MM-DD");
  if (!parsed.isValid()) return item.month || "";
  return fa ? JALALI_MONTHS_FA[parsed.jMonth()] : parsed.format("MMM");
}

export default function SalesChart({ data = [] }) {
  const { t, language, n, money, dir } = useLanguage();
  const fa = language === "fa";

  const chartData = data.map((item) => ({
    ...item,
    monthLabel: monthLabelFor(item, fa),
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
