import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useLanguage } from "../localization/useLanguage";

import { buildSalesChartData } from "./salesChartLabels";

export default function SalesChart({ data = [], compact = false }) {
  const { t, language, n, money, dir } = useLanguage();

  const chartData = buildSalesChartData(data, language);

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
