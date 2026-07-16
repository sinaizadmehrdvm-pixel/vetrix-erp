import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import StatsCard from "../widgets/StatsCard";
import SalesChart from "../charts/SalesChart";
import InventoryAlerts from "../smart/InventoryAlerts";
import AiInsights from "../smart/AiInsights";
import RecentInvoices from "../widgets/RecentInvoices";
import TopProducts from "../widgets/TopProducts";
import ActivityTimeline from "../timeline/ActivityTimeline";
import ExportButtons from "../export/ExportButtons";
import LiveClock from "../widgets/LiveClock";
import SmartSearch from "../search/SmartSearch";
import LiveNotification from "../components/LiveNotification";

import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  AlertTriangle,
  TrendingUp,
  Receipt,
  CreditCard,
  Wallet,
  ShieldAlert,
  Target,
  BellRing,
  Flame,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Gauge,
  Banknote,
  ClipboardList,
  UserRoundCheck,
  Boxes,
  Sparkles,
  ChevronDown,
} from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { fetchAuthenticatedResource, getDashboardStats, getReportsOverview } from "../services/api";


function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeActivity(items, t) {
  return safeArray(items).map((item) => {
    const title = String(item.title || "").toLowerCase();
    let title_fa = item.title_fa;
    if (!title_fa && title.includes("new invoice")) title_fa = t("newInvoiceCreated");
    if (!title_fa && title.includes("stock updated")) title_fa = t("stockUpdated");
    if (!title_fa && title.includes("customer added")) title_fa = t("customerAdded");
    return { ...item, title_fa };
  });
}

function normalizeAlerts(alerts, t) {
  return safeArray(alerts).map((alert) => {
    const message = String(alert.message || "").toLowerCase();
    let message_fa = alert.message_fa;
    if (!message_fa && message.includes("stock is low")) message_fa = t("stockIsLow");
    if (!message_fa && message.includes("low stock")) message_fa = t("stockIsLow");
    return { ...alert, message_fa };
  });
}

function normalizeInsight(insight, t) {
  if (!insight) return null;
  return {
    ...insight,
    status_fa: insight.status_fa || t("goodFinancialCondition"),
    recommendation_fa: insight.recommendation_fa || t("improveSalesStrategy"),
  };
}

function normalizeNotifications(items, t) {
  return safeArray(items).map((item) => {
    const title = String(item.title || "").toLowerCase();
    const message = String(item.message || "").toLowerCase();
    let title_fa = item.title_fa;
    let message_fa = item.message_fa;
    if (!title_fa && title.includes("low stock")) title_fa = t("lowStockAlert");
    if (!title_fa && title.includes("profit")) title_fa = t("profitWarning");
    if (!title_fa && title.includes("system")) title_fa = t("systemHealthy");
    if (!message_fa && message.includes("stock review")) message_fa = "کالاها نیاز به بررسی موجودی دارند.";
    if (!message_fa && message.includes("net profit")) message_fa = "سود خالص نیاز به بررسی دارد.";
    return { ...item, title_fa, message_fa };
  });
}

function buildSmartAlerts({ fa, reports, stats }) {
  const profit = reports?.profit_loss || {};
  const cash = reports?.cashflow || {};
  const invoices = reports?.invoice_summary || {};
  const inventory = reports?.inventory || {};
  const alerts = [];

  const netProfit = toNumber(profit.net_profit ?? stats?.net_profit);
  const netSales = toNumber(profit.net_sales ?? stats?.total_revenue);
  const lowStock = toNumber(inventory.low_stock_count ?? stats?.low_stock);
  const openCount = toNumber(invoices.open_count);
  const openAmount = toNumber(invoices.open_amount);
  const netCash = toNumber(cash.net_cashflow);

  if (lowStock > 0) {
    alerts.push({
      level: "danger",
      icon: <Boxes size={18} />,
      title: fa ? "هشدار موجودی کالا" : "Inventory alert",
      text: fa
        ? `${lowStock} کالا به حداقل موجودی رسیده‌اند.`
        : `${lowStock} products are low in stock.`,
      action: fa ? "بررسی انبار" : "Review inventory",
    });
  }

  if (openCount > 0 || openAmount > 0) {
    alerts.push({
      level: "warning",
      icon: <ClipboardList size={18} />,
      title: fa ? "فاکتورهای تسویه‌نشده" : "Unsettled invoices",
      text: fa
        ? `${openCount || 0} فاکتور باز با مبلغ قابل پیگیری وجود دارد.`
        : `${openCount || 0} open invoices require follow-up.`,
      action: fa ? "پیگیری مطالبات" : "Follow up",
    });
  }

  if (netProfit < 0) {
    alerts.push({
      level: "danger",
      icon: <ArrowDownRight size={18} />,
      title: fa ? "سود خالص منفی" : "Negative net profit",
      text: fa
        ? "هزینه‌ها یا خریدها بیشتر از فروش ثبت‌شده است."
        : "Costs or purchases are higher than recorded sales.",
      action: fa ? "تحلیل سود و زیان" : "Analyze P&L",
    });
  }

  if (netCash < 0) {
    alerts.push({
      level: "warning",
      icon: <Banknote size={18} />,
      title: fa ? "جریان نقدی منفی" : "Negative cashflow",
      text: fa
        ? "پرداخت‌ها از دریافت‌ها بیشتر شده‌اند."
        : "Payments are higher than receipts.",
      action: fa ? "کنترل نقدینگی" : "Cash control",
    });
  }

  if (netSales === 0) {
    alerts.push({
      level: "info",
      icon: <Target size={18} />,
      title: fa ? "فروش ثبت نشده" : "No sales recorded",
      text: fa
        ? "برای تحلیل دقیق، فاکتورهای فروش روزانه را ثبت کن."
        : "Record daily sales invoices for better analysis.",
      action: fa ? "ثبت فروش" : "Record sales",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: "success",
      icon: <CheckCircle2 size={18} />,
      title: fa ? "وضعیت سیستم پایدار است" : "System looks stable",
      text: fa
        ? "هشدار جدی در فروش، نقدینگی و موجودی دیده نشد."
        : "No critical sales, cashflow or inventory alert was detected.",
      action: fa ? "ادامه پایش" : "Keep monitoring",
    });
  }

  return alerts;
}

function buildBusinessScore({ reports, stats }) {
  const profit = reports?.profit_loss || {};
  const cash = reports?.cashflow || {};
  const invoices = reports?.invoice_summary || {};
  const inventory = reports?.inventory || {};

  let score = 100;

  if (toNumber(profit.net_profit ?? stats?.net_profit) < 0) score -= 25;
  if (toNumber(cash.net_cashflow) < 0) score -= 15;
  if (toNumber(invoices.open_count) > 0) score -= Math.min(20, toNumber(invoices.open_count) * 3);
  if (toNumber(inventory.low_stock_count ?? stats?.low_stock) > 0) score -= Math.min(20, toNumber(inventory.low_stock_count ?? stats?.low_stock) * 4);
  if (toNumber(profit.net_sales ?? stats?.total_revenue) === 0) score -= 15;

  return Math.max(0, Math.min(100, score));
}

function buildQuickActions(fa) {
  return [
    { title: fa ? "ثبت فاکتور فروش" : "New sale invoice", path: "/invoices", icon: <Receipt size={18} /> },
    { title: fa ? "ثبت دریافت" : "New receipt", path: "/receipts", icon: <Wallet size={18} /> },
    { title: fa ? "ثبت پرداخت" : "New payment", path: "/payments", icon: <CreditCard size={18} /> },
    { title: fa ? "افزودن مشتری" : "Add customer", path: "/customers", icon: <Users size={18} /> },
    { title: fa ? "گزارش‌های حرفه‌ای" : "Reports", path: "/reports", icon: <TrendingUp size={18} /> },
  ];
}

export default function Dashboard() {
  const { t, n, money, time, dir, language } = useLanguage();

  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState(null);
  const [activity, setActivity] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");
      const [statsData, activityResponse, reportsData] = await Promise.all([
        getDashboardStats(),
        fetchAuthenticatedResource("/activity").catch(() => null),
        getReportsOverview().catch(() => null),
      ]);
      const activityData = activityResponse
        ? await activityResponse.json().catch(() => [])
        : [];

      setStats(statsData || {});
      setReports(reportsData || {});
      setActivity(safeArray(activityData));
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Dashboard loading error:", error);
      setError(language === "fa" ? "خطا در دریافت اطلاعات داشبورد" : "Dashboard loading error");
      setStats((prev) => prev || {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void loadDashboard(); }, 0);
    const timer = setInterval(loadDashboard, 10000);
    return () => { clearTimeout(initialTimer); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const dashboardData = useMemo(() => {
    if (!stats) return null;
    return {
      ...stats,
      alerts: normalizeAlerts(stats.alerts, t),
      ai_insight: normalizeInsight(stats.ai_insight, t),
      live_notifications: normalizeNotifications(stats.live_notifications, t),
    };
  }, [stats, t]);

  const activityData = useMemo(() => {
    return normalizeActivity(activity, t);
  }, [activity, t]);

  if (!dashboardData) {
    return (
      <div style={{ color: "white", padding: 30, direction: dir }}>
        {language === "fa" ? "در حال بارگذاری..." : "Loading..."}
      </div>
    );
  }

  const fa = language === "fa";
  const profit = reports?.profit_loss || {};
  const cash = reports?.cashflow || {};
  const invoices = reports?.invoice_summary || {};
  const todayMonth = reports?.today_month || {};
  const inventory = reports?.inventory || {};
  const openInvoices = safeArray(reports?.open_invoices);
  const businessScore = buildBusinessScore({ reports, stats: dashboardData });
  const smartAlerts = buildSmartAlerts({ fa, reports, stats: dashboardData });
  const quickActions = buildQuickActions(fa);
  const netProfit = toNumber(profit.net_profit ?? dashboardData.net_profit);
  const netSales = toNumber(profit.net_sales ?? dashboardData.total_revenue);
  const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  return (
    <div
      style={{
        padding: "clamp(8px, 1.4vw, 20px)",
        minHeight: "100vh",
        direction: dir,
        background:
          "radial-gradient(circle at top left, var(--erp-glow), transparent 36%), radial-gradient(circle at top right, var(--erp-glow), transparent 34%), var(--erp-bg)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-white text-4xl font-black mb-2 text-right">
            {t("dashboard")}
          </h1>
          <p className="text-slate-400">
            {fa
              ? "داشبورد هوشمند فروش، نقدینگی، سود، مطالبات، هشدارها و رشد کسب‌وکار"
              : "Smart dashboard for sales, cashflow, profit, receivables, alerts and business growth"}
          </p>
          {lastUpdate && (
            <p className="text-xs text-slate-500 mt-2">
              {fa ? "آخرین بروزرسانی: " : "Last update: "}
{time(lastUpdate)}
            </p>
          )}
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <LiveClock />
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20 disabled:opacity-60"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {fa ? "به‌روزرسانی" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl p-4 bg-rose-500/10 border border-rose-400/20 text-rose-200 flex items-center gap-2">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-5">
        <ExecutiveHero
          fa={fa}
          money={money}
          n={n}
          score={businessScore}
          netProfit={netProfit}
          profitMargin={profitMargin}
          openAmount={toNumber(invoices.open_amount)}
          cashflow={toNumber(cash.net_cashflow)}
        />

        <SmartAlertCenter fa={fa} alerts={smartAlerts} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 20, flexWrap: "wrap", direction: dir }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <SmartSearch value={search} onChange={setSearch} />
        </div>
      </div>

      <QuickActions fa={fa} actions={quickActions} />

      <ExportButtons />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginTop: 20, marginBottom: 30, direction: dir }}>
        <StatsCard title={fa ? "فروش امروز" : "Sales today"} value={money(todayMonth.sales_today || 0)} icon={<DollarSign />} color="#22d3ee" />
        <StatsCard title={fa ? "فروش ماه" : "Sales this month"} value={money(todayMonth.sales_month || dashboardData.total_revenue || 0)} icon={<TrendingUp />} color="#10b981" />
        <StatsCard title={fa ? "خرید ماه" : "Purchases this month"} value={money(todayMonth.purchases_month || dashboardData.total_purchases || 0)} icon={<ShoppingCart />} color="#f59e0b" />
        <StatsCard title={fa ? "دریافت امروز" : "Receipts today"} value={money(todayMonth.receipt_today || cash.receipt_today || 0)} icon={<Receipt />} color="#10b981" />
        <StatsCard title={fa ? "پرداخت امروز" : "Payments today"} value={money(todayMonth.payment_today || cash.payment_today || 0)} icon={<CreditCard />} color="#ef4444" />
        <StatsCard title={fa ? "سود خالص" : "Net profit"} value={money(profit.net_profit ?? dashboardData.net_profit ?? 0)} icon={<TrendingUp />} color={netProfit >= 0 ? "#22d3ee" : "#ef4444"} />
        <StatsCard title={fa ? "فاکتورهای باز" : "Open invoices"} value={n(invoices.open_count || openInvoices.length || 0)} icon={<Wallet />} color="#f59e0b" />
        <StatsCard title={fa ? "کالاهای کم موجود" : "Low stock"} value={n(inventory.low_stock_count ?? dashboardData.low_stock ?? 0)} icon={<AlertTriangle />} color="#ef4444" />
      </div>

      <details className="group rounded-[2rem] border border-cyan-400/20 bg-slate-900/40 p-4">
        <summary className="cursor-pointer list-none rounded-2xl bg-slate-800/80 px-4 py-3 text-cyan-200 font-black flex items-center justify-between gap-3">
          <span>{fa ? "نمایش جزئیات و تحلیل‌های بیشتر" : "Show more details and analytics"}</span>
          <ChevronDown className="transition-transform group-open:rotate-180" size={20} />
        </summary>
        <div className="pt-4">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginBottom: 30, direction: dir }}>
        <StatsCard title={t("invoices")} value={n(dashboardData.invoices_count || 0)} icon={<ShoppingCart />} color="#6366f1" />
        <StatsCard title={t("customers")} value={n(dashboardData.customers_count || 0)} icon={<Users />} color="#10b981" />
        <StatsCard title={t("products")} value={n(dashboardData.products_count || 0)} icon={<Package />} color="#f59e0b" />
        <StatsCard title={fa ? "ارزش موجودی" : "Inventory value"} value={money(inventory.inventory_value || 0)} icon={<Package />} color="#22d3ee" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 mb-5">
        <div>
          <SalesChart data={dashboardData.sales_chart || []} />
        </div>
        <BusinessPulse fa={fa} n={n} money={money} reports={reports} stats={dashboardData} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 20, marginTop: 20, direction: dir }}>
        <InventoryAlerts alerts={dashboardData.alerts || []} />
        <AiInsights insight={dashboardData.ai_insight} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 20, marginTop: 20, direction: dir }}>
        <RecentInvoices invoices={dashboardData.recent_invoices || []} />
        <TopProducts products={dashboardData.top_products || []} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 20, marginTop: 20, direction: dir }}>
        <LiveNotification notifications={dashboardData.live_notifications || []} />
        <ActivityTimeline items={activityData} />
      </div>
        </div>
      </details>
    </div>
  );
}

function ExecutiveHero({ fa, money, n, score, netProfit, profitMargin, openAmount, cashflow }) {
  const scoreColor = score >= 75 ? "text-emerald-300" : score >= 45 ? "text-amber-300" : "text-rose-300";
  const scoreLabel = score >= 75 ? (fa ? "عالی" : "Excellent") : score >= 45 ? (fa ? "نیازمند توجه" : "Needs attention") : (fa ? "بحرانی" : "Critical");

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-900/70 p-6 shadow-2xl">
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-cyan-300 font-black mb-2">
            <Gauge size={22} />
            {fa ? "امتیاز سلامت کسب‌وکار" : "Business health score"}
          </div>
          <div className={`text-6xl font-black ${scoreColor}`}>{n(score)}</div>
          <div className="text-slate-400 mt-2">{scoreLabel}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[320px]">
          <MiniKpi
            fa={fa}
            title={fa ? "سود خالص" : "Net profit"}
            value={money(netProfit)}
            positive={netProfit >= 0}
            icon={<TrendingUp size={17} />}
          />
          <MiniKpi
            fa={fa}
            title={fa ? "حاشیه سود" : "Profit margin"}
            value={`${n(profitMargin.toFixed(1))}%`}
            positive={profitMargin >= 0}
            icon={<Target size={17} />}
          />
          <MiniKpi
            fa={fa}
            title={fa ? "مطالبات باز" : "Open receivables"}
            value={money(openAmount)}
            positive={openAmount <= 0}
            icon={<Wallet size={17} />}
          />
          <MiniKpi
            fa={fa}
            title={fa ? "نقدینگی خالص" : "Net cashflow"}
            value={money(cashflow)}
            positive={cashflow >= 0}
            icon={<Banknote size={17} />}
          />
        </div>
      </div>

      <div className="relative mt-5 h-3 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function MiniKpi({ title, value, positive, icon }) {
  return (
    <div className="rounded-2xl bg-slate-800/80 border border-white/5 p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-2">
        <span className={positive ? "text-emerald-300" : "text-rose-300"}>{icon}</span>
        {title}
      </div>
      <div className={`font-black text-lg ${positive ? "text-emerald-300" : "text-rose-300"}`}>{value}</div>
    </div>
  );
}

function SmartAlertCenter({ fa, alerts }) {
  return (
    <div className="rounded-[2rem] border border-cyan-400/20 bg-slate-900/70 p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-cyan-300 font-black text-xl flex items-center gap-2">
          <BellRing />
          {fa ? "مرکز هشدار هوشمند" : "Smart Alert Center"}
        </h2>
        <span className="text-xs rounded-full bg-cyan-400/10 text-cyan-200 px-3 py-1">
          {fa ? "زنده" : "Live"}
        </span>
      </div>

      <div className="space-y-3">
        {alerts.map((item, index) => (
          <div
            key={index}
            className={`rounded-2xl p-4 border ${
              item.level === "danger"
                ? "bg-rose-500/10 border-rose-400/20"
                : item.level === "warning"
                ? "bg-amber-500/10 border-amber-400/20"
                : item.level === "success"
                ? "bg-emerald-500/10 border-emerald-400/20"
                : "bg-cyan-500/10 border-cyan-400/20"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="text-cyan-300 mt-1">{item.icon}</div>
              <div className="flex-1">
                <div className="text-white font-black">{item.title}</div>
                <div className="text-slate-300 text-sm mt-1">{item.text}</div>
                <div className="text-cyan-300 text-xs font-bold mt-2">{item.action}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickActions({ fa, actions }) {
  return (
    <div className="rounded-[2rem] border border-cyan-400/20 bg-slate-900/60 p-4 mb-5">
      <div className="flex items-center gap-2 text-cyan-300 font-black mb-3">
        <Sparkles size={20} />
        {fa ? "دسترسی سریع عملیاتی" : "Quick actions"}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {actions.map((item, index) => (
          <Link
            key={index}
            to={item.path}
            className="rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-white/5 px-4 py-3 text-white font-bold flex items-center justify-center gap-2 transition-all"
          >
            <span className="text-cyan-300">{item.icon}</span>
            {item.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

function BusinessPulse({ fa, n, money, reports, stats }) {
  const profit = reports?.profit_loss || {};
  const cash = reports?.cashflow || {};
  const inventory = reports?.inventory || {};
  const invoices = reports?.invoice_summary || {};
  const rows = [
    {
      title: fa ? "رشد فروش" : "Sales growth",
      value: money(profit.net_sales ?? stats.total_revenue ?? 0),
      icon: <ArrowUpRight size={18} />,
      color: "text-emerald-300",
    },
    {
      title: fa ? "ریسک موجودی" : "Inventory risk",
      value: n(inventory.low_stock_count ?? stats.low_stock ?? 0),
      icon: <ShieldAlert size={18} />,
      color: toNumber(inventory.low_stock_count ?? stats.low_stock) > 0 ? "text-rose-300" : "text-emerald-300",
    },
    {
      title: fa ? "فاکتورهای باز" : "Open invoices",
      value: n(invoices.open_count || 0),
      icon: <Flame size={18} />,
      color: toNumber(invoices.open_count) > 0 ? "text-amber-300" : "text-emerald-300",
    },
    {
      title: fa ? "نقدینگی ماه" : "Monthly cash",
      value: money(cash.net_cashflow || 0),
      icon: <UserRoundCheck size={18} />,
      color: toNumber(cash.net_cashflow) >= 0 ? "text-cyan-300" : "text-rose-300",
    },
  ];

  return (
    <div className="rounded-[2rem] border border-cyan-400/20 bg-slate-900/70 p-5 shadow-2xl h-full">
      <h2 className="text-cyan-300 font-black text-xl mb-4">
        {fa ? "نبض کسب‌وکار" : "Business pulse"}
      </h2>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-2xl bg-slate-800/70 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`${row.color}`}>{row.icon}</div>
              <div className="text-slate-300 font-bold">{row.title}</div>
            </div>
            <div className={`font-black ${row.color}`}>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
