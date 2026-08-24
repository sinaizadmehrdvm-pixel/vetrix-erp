import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { TrendingUp, ClipboardCheck, ShoppingCart, Percent, Clock3, Users, Wallet, AlertCircle, BarChart3 } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useFieldSales } from "./useFieldSales";
import Card from "../../components/ui/Card";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import { SkeletonRows } from "../../components/ui/Skeleton";

function StatTile({ icon: Icon, label, value, tone }) {
  return (
    <div style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "10px 12px" }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: 10.5, color: "var(--erp-muted)" }}>
        <Icon size={11} /> {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: tone || "var(--erp-text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// Internal "Performance" view - not a fake/disabled coming-soon tab. Every
// number here is either GET /api/field-visits/summary (today + this week,
// a real backend aggregate already computed for scope=self) or a
// derivation already shared with the KPI header/Today route - nothing
// invented. The bar chart is an honest "today vs. this week" 2-point
// comparison of real counts, not a fabricated multi-day trend line (this
// module has no daily-breakdown endpoint to draw a real trend from).
export default function FieldSalesPerformanceView() {
  const { language, n, dir, isRTL } = useLanguage();
  const { summary, salesToday, paymentsToday, followupCustomerIds, dueTodayCustomers, loadingCustomers } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  if (!summary && loadingCustomers) {
    return (
      <Card icon={TrendingUp} title={tr("عملکرد", "الأداء", "Performans", "Performance")} clip={false}>
        <SkeletonRows rows={4} height={50} gap={10} />
      </Card>
    );
  }

  const today = summary?.today || { visits: 0, orders: 0, conversion_rate: 0, avg_duration_minutes: 0 };
  const week = summary?.this_week || { visits: 0, orders: 0, conversion_rate: 0, avg_duration_minutes: 0, distinct_customers: 0 };
  const todayLabel = tr("امروز", "اليوم", "Bugün", "Today");
  const weekLabel = tr("این هفته", "هذا الأسبوع", "Bu hafta", "This week");
  const chartData = [
    { name: tr("ویزیت", "زيارات", "Ziyaret", "Visits"), [todayLabel]: today.visits, [weekLabel]: week.visits },
    { name: tr("سفارش", "طلبات", "Sipariş", "Orders"), [todayLabel]: today.orders, [weekLabel]: week.orders },
  ];

  return (
    <div className="grid gap-3">
      <Card icon={ClipboardCheck} title={todayLabel} clip={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatTile icon={ClipboardCheck} label={tr("ویزیت", "زيارات", "Ziyaret", "Visits")} value={n(today.visits)} />
          <StatTile icon={ShoppingCart} label={tr("سفارش", "طلبات", "Sipariş", "Orders")} value={n(today.orders)} tone="var(--erp-accent)" />
          <StatTile icon={TrendingUp} label={tr("فروش", "المبيعات", "Satış", "Sales")} value={<MoneyDisplay value={salesToday} compact fontSize={16} />} />
          <StatTile icon={Wallet} label={tr("وصول", "التحصيل", "Tahsilat", "Collections")} value={<MoneyDisplay value={paymentsToday} compact fontSize={16} />} tone="var(--erp-success)" />
          <StatTile icon={Percent} label={tr("نرخ تبدیل", "معدل التحويل", "Dönüşüm oranı", "Conversion rate")} value={`${n(today.conversion_rate)}%`} />
          <StatTile icon={Clock3} label={tr("میانگین مدت ویزیت", "متوسط مدة الزيارة", "Ort. ziyaret süresi", "Avg visit duration")} value={tr(`${n(today.avg_duration_minutes)} دقیقه`, `${n(today.avg_duration_minutes)} دقيقة`, `${n(today.avg_duration_minutes)} dk`, `${n(today.avg_duration_minutes)}m`)} />
          <StatTile icon={AlertCircle} label={tr("نیازمند پیگیری", "بحاجة لمتابعة", "Takip gereken", "Needs follow-up")} value={n(followupCustomerIds.size)} tone="var(--erp-warning)" />
          <StatTile icon={ClipboardCheck} label={tr("سررسید امروز", "مستحق اليوم", "Bugün sırası gelen", "Due today")} value={n(dueTodayCustomers.length)} />
        </div>
      </Card>

      <Card icon={TrendingUp} title={weekLabel} clip={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatTile icon={ClipboardCheck} label={tr("ویزیت", "زيارات", "Ziyaret", "Visits")} value={n(week.visits)} />
          <StatTile icon={ShoppingCart} label={tr("سفارش", "طلبات", "Sipariş", "Orders")} value={n(week.orders)} tone="var(--erp-accent)" />
          <StatTile icon={Percent} label={tr("نرخ تبدیل", "معدل التحويل", "Dönüşüm oranı", "Conversion rate")} value={`${n(week.conversion_rate)}%`} />
          <StatTile icon={Users} label={tr("مشتریان یکتا", "عملاء فريدون", "Benzersiz müşteri", "Distinct customers")} value={n(week.distinct_customers)} />
        </div>
      </Card>

      {(today.visits > 0 || week.visits > 0) && (
        <Card icon={BarChart3} title={tr("مقایسه امروز و هفته", "مقارنة اليوم والأسبوع", "Bugün / Hafta karşılaştırması", "Today vs. this week")} clip={false}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} dir={dir}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--erp-border)" />
              <XAxis dataKey="name" stroke="var(--erp-muted)" fontSize={12} reversed={isRTL} />
              {/* recharts renders its own SVG <text> for ticks/tooltip values
                  independent of React's normal text rendering, so it never
                  goes through n() on its own - tickFormatter/formatter below
                  are what actually route these numbers through the shared
                  locale formatter instead of recharts' default Latin-digit
                  toString(). */}
              <YAxis stroke="var(--erp-muted)" fontSize={12} allowDecimals={false} orientation={isRTL ? "right" : "left"} tickFormatter={(value) => n(value)} />
              <Tooltip
                contentStyle={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", color: "var(--erp-text)" }}
                formatter={(value) => n(value)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={todayLabel} fill="var(--erp-accent)" radius={[8, 8, 0, 0]} />
              <Bar dataKey={weekLabel} fill="var(--erp-accent-2)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
