import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useLanguage } from "../localization/useLanguage";

const MONTH_LABELS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  fa: ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور"],
};

export default function SalesChart({ data = [] }) {
  const { t, language, n, money, dir } = useLanguage();

  const chartData = data.map((item, index) => ({
    ...item,
    monthLabel:
      language === "fa"
        ? MONTH_LABELS.fa[index] || item.month
        : MONTH_LABELS.en[index] || item.month,
    sales: Number(item.sales || 0),
  }));

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.8)",
        borderRadius: 24,
        padding: 20,
        minHeight: 360,
        direction: dir,
      }}
    >
      <h2
        style={{
          color: "white",
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
              stroke="#94a3b8"
              tick={{ fill: "#e2e8f0", fontSize: 13 }}
            />

            <YAxis
              orientation={dir === "rtl" ? "right" : "left"}
              stroke="#94a3b8"
              tickFormatter={(value) => n(value)}
              tick={{ fill: "#e2e8f0", fontSize: 13 }}
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
              stroke="#22d3ee"
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
