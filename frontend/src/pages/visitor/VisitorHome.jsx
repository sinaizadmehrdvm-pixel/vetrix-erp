import { useMemo } from "react";
import {
  ClipboardCheck, Clock3, ShoppingCart, TrendingUp, Wallet, AlertCircle,
  Percent, CalendarClock,
} from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useFieldSales } from "./useFieldSales";
import Card from "../../components/ui/Card";
import { SkeletonRows } from "../../components/ui/Skeleton";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import ActiveVisitWorkspace from "./ActiveVisitWorkspace";
import TodayRoute from "./TodayRoute";
import FieldSalesCustomerList from "./FieldSalesCustomerList";
import FieldSalesOrdersView from "./FieldSalesOrdersView";
import FieldSalesCollectionsView from "./FieldSalesCollectionsView";
import FieldSalesPerformanceView from "./FieldSalesPerformanceView";

function KpiCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <Card tone="kpi" padding={false}>
      <div style={{ padding: "11px 13px" }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{ width: 26, height: 26, borderRadius: "var(--erp-radius-sm)", background: "var(--erp-glow)", color: tone || "var(--erp-accent)" }}
          >
            <Icon size={13} />
          </span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: tone || "var(--erp-text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 11.5, color: "var(--erp-muted)", marginTop: 1 }}>{label}</div>
        {hint ? <div style={{ fontSize: 10, color: "var(--erp-muted)", marginTop: 3, opacity: 0.85 }}>{hint}</div> : null}
      </div>
    </Card>
  );
}

// Content of the /visitor index route: a pure activeView-driven switcher
// over FieldSalesContext - no local data fetching, no self-wrapping in a
// layout (FieldSalesLayout mounts this via <Outlet/> and already provides
// the identity strip + command bar). ActiveVisitWorkspace is mounted
// unconditionally at the top of every internal view so the active visit
// (and its Order/Payment/Customer360 drawers) never unmounts while
// switching between Today/Customers/Orders/Collections/Performance - it
// stays visually first (spec: "Active Visit is visually the core
// workflow") whichever tab is open.
//
// On the Today view specifically it sits beside Today's route in a dense
// ~65/35 desktop split instead of each being a separate full-width block,
// with the KPI strip immediately below (not several screens down) and
// nothing else stacked underneath - the above-the-fold composition this
// pass asked for.
export default function VisitorHome() {
  const { language, n } = useLanguage();
  const {
    activeView, customers, loadingCustomers, summary,
    dueTodayCustomers, remainingToday, salesToday, paymentsToday,
    ordersTodayFromInvoices, followupCustomerIds,
  } = useFieldSales();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const customerPickerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers]
  );

  if (activeView === "customers") {
    return (
      <div>
        <ActiveVisitWorkspace customerPickerOptions={customerPickerOptions} />
        <FieldSalesCustomerList id="customers" />
      </div>
    );
  }
  if (activeView === "orders") {
    return (
      <div>
        <ActiveVisitWorkspace customerPickerOptions={customerPickerOptions} />
        <FieldSalesOrdersView />
      </div>
    );
  }
  if (activeView === "collections") {
    return (
      <div>
        <ActiveVisitWorkspace customerPickerOptions={customerPickerOptions} />
        <FieldSalesCollectionsView />
      </div>
    );
  }
  if (activeView === "performance") {
    return (
      <div>
        <ActiveVisitWorkspace customerPickerOptions={customerPickerOptions} />
        <FieldSalesPerformanceView />
      </div>
    );
  }

  return (
    <div>
      {/* Main workspace: Active Visit (~65%) + Today's route (~35%) on
          desktop/tablet, stacked single-column on mobile. minmax(0, ...)
          on both tracks so long content inside either column shrinks/
          truncates instead of forcing the grid (and page) wider. */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start mb-4">
        <ActiveVisitWorkspace customerPickerOptions={customerPickerOptions} compact />
        <TodayRoute compact />
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-2" aria-label={tr("شاخص‌های امروز", "مؤشرات اليوم", "Bugünkü göstergeler", "Today's indicators")}>
        {loadingCustomers && !summary ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} tone="kpi" padding={false}><div style={{ padding: 13 }}><SkeletonRows rows={2} height={12} /></div></Card>
          ))
        ) : (
          <>
            <KpiCard icon={CalendarClock} label={tr("سررسید امروز", "عملاء اليوم", "Bugün sırası", "Due today")} value={n(dueTodayCustomers.length)} hint={tr("از فاصله ویزیت", "من دورة الزيارات", "ziyaret sıklığından", "from visit cadence")} />
            <KpiCard icon={ClipboardCheck} label={tr("ویزیت تکمیل‌شده", "زيارات مكتملة", "Tamamlanan", "Completed visits")} value={n(summary?.today?.visits ?? 0)} tone="var(--erp-success)" />
            <KpiCard icon={Clock3} label={tr("باقی‌مانده", "المتبقي", "Kalan", "Remaining")} value={n(remainingToday)} />
            <KpiCard icon={ShoppingCart} label={tr("سفارش امروز", "طلبات اليوم", "Bugünkü sipariş", "Orders today")} value={n(summary?.today?.orders ?? ordersTodayFromInvoices)} tone="var(--erp-accent)" />
            <KpiCard icon={TrendingUp} label={tr("فروش امروز", "مبيعات اليوم", "Bugünkü satış", "Sales today")} value={<MoneyDisplay value={salesToday} compact fontSize={18} />} />
            <KpiCard icon={Wallet} label={tr("وصول امروز", "التحصيل اليوم", "Bugünkü tahsilat", "Collections today")} value={<MoneyDisplay value={paymentsToday} compact fontSize={18} />} tone="var(--erp-success)" />
            <KpiCard icon={AlertCircle} label={tr("نیازمند پیگیری", "بحاجة لمتابعة", "Takip gereken", "Needs follow-up")} value={n(followupCustomerIds.size)} tone="var(--erp-warning)" />
            <KpiCard icon={Percent} label={tr("نرخ تبدیل", "معدل التحويل", "Dönüşüm oranı", "Conversion rate")} value={`${n(summary?.today?.conversion_rate ?? 0)}%`} />
          </>
        )}
      </section>
    </div>
  );
}
