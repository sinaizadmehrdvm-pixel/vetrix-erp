import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useLanguage } from "../localization/useLanguage";

function dateFromMonthKey(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return Number.isNaN(date.getTime()) ? null : date;
}

function localizedMonthLabel(item, language) {
  const date = dateFromMonthKey(item.key);
  if (date) {
    return new Intl.DateTimeFormat(language === "fa" ? "fa-IR-u-ca-persian" : "en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  const fallback = String(item.month || "");
  if (fallback.includes("/")) {
    const [faLabel, enLabel] = fallback.split("/");
    return language === "fa" ? faLabel.trim() : enLabel.trim();
  }

  return fallback;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export default function SalesChart({ data = [], compact = false }) {
  const { t, language, n, money, dir } = useLanguage();

  const chartData = data.map((item) => ({
    ...item,
    monthLabel: localizedMonthLabel(item, language),
    sales: toFiniteNumber(item.sales),
  }));

  return (
    <div
      style={{
        background: "var(--erp-panel)",
        borderRadius: 16,
        padding: compact ? 12 : 20,
        minHeight: compact ? 235 : 360,
        direction: dir,
      }}
    >
      <h2
        style={{
          color: "var(--erp-text)",
          marginBottom: compact ? 8 : 20,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("salesOverview")}
      </h2>

      <div style={{ direction: "ltr", width: "100%", minWidth: 0, height: compact ? 180 : 280, overflow: "hidden" }}>
        <ResponsiveContainer width="99%" height={compact ? 180 : 280}>
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
