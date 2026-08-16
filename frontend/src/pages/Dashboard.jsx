import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import StatsCard from "../widgets/StatsCard";
import ExecutiveAlertsPanel from "../widgets/ExecutiveAlertsPanel";
import DateBadge from "../widgets/DateBadge";
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
import { useLiveNotifications } from "../hooks/useLiveNotifications";

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
import { fetchAuthenticatedResource, getAiBiSummary, getDashboardStats, getReportsOverview } from "../services/api";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Notice from "../components/ui/Notice";
import { TONE_STYLES } from "../components/ui/tones";


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

function mapLiveEventToNotification(event, fa, money) {
  if (event.type === "low_stock") {
    return {
      type: "warning",
      title: "Low stock alert",
      title_fa: "هشدار موجودی کم",
      message: `${event.product_name} stock is low (${event.stock}).`,
      message_fa: `موجودی «${event.product_name}» کم است (${event.stock}).`,
    };
  }
  if (event.type === "new_invoice") {
    return {
      type: "success",
      title: "New sale invoice",
      title_fa: "فاکتور فروش جدید",
      message: `Invoice #${event.invoice_id} for ${money(event.total_amount)}.`,
      message_fa: `فاکتور شماره ${event.invoice_id} به مبلغ ${money(event.total_amount)}.`,
    };
  }
  if (event.type === "payment_received") {
    return {
      type: "success",
      title: "Payment received",
      title_fa: "دریافت وجه",
      message: `Received ${money(event.amount)}.`,
      message_fa: `مبلغ ${money(event.amount)} دریافت شد.`,
    };
  }
  return null;
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

function buildSmartAlerts({ language, reports, stats, n }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
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
      title: tr("هشدار موجودی کالا", "تنبيه المخزون", "Envanter uyarısı", "Inventory alert"),
      text: tr(
        `${n(lowStock)} کالا به حداقل موجودی رسیده‌اند.`,
        `${n(lowStock)} منتجات وصلت إلى الحد الأدنى من المخزون.`,
        `${n(lowStock)} ürün minimum stok seviyesine ulaştı.`,
        `${n(lowStock)} products are low in stock.`
      ),
      action: tr("بررسی انبار", "مراجعة المخزون", "Envanteri incele", "Review inventory"),
      to: "/products",
    });
  }

  if (openCount > 0 || openAmount > 0) {
    alerts.push({
      level: "warning",
      icon: <ClipboardList size={18} />,
      title: tr("فاکتورهای تسویه‌نشده", "فواتير غير مسواة", "Ödenmemiş faturalar", "Unsettled invoices"),
      text: tr(
        `${n(openCount || 0)} فاکتور باز با مبلغ قابل پیگیری وجود دارد.`,
        `توجد ${n(openCount || 0)} فاتورة مفتوحة تتطلب متابعة.`,
        `${n(openCount || 0)} açık fatura takip gerektiriyor.`,
        `${n(openCount || 0)} open invoices require follow-up.`
      ),
      action: tr("پیگیری مطالبات", "متابعة المستحقات", "Alacakları takip et", "Follow up"),
      to: "/invoices",
    });
  }

  if (netProfit < 0) {
    alerts.push({
      level: "danger",
      icon: <ArrowDownRight size={18} />,
      title: tr("سود خالص منفی", "صافي ربح سلبي", "Negatif net kâr", "Negative net profit"),
      text: tr(
        "هزینه‌ها یا خریدها بیشتر از فروش ثبت‌شده است.",
        "المصروفات أو المشتريات أعلى من المبيعات المسجلة.",
        "Giderler veya alışlar kaydedilen satışlardan yüksek.",
        "Costs or purchases are higher than recorded sales."
      ),
      action: tr("تحلیل سود و زیان", "تحليل الأرباح والخسائر", "Kâr/zarar analizi", "Analyze P&L"),
      to: "/financial-statements",
    });
  }

  if (netCash < 0) {
    alerts.push({
      level: "warning",
      icon: <Banknote size={18} />,
      title: tr("جریان نقدی منفی", "تدفق نقدي سلبي", "Negatif nakit akışı", "Negative cashflow"),
      text: tr(
        "پرداخت‌ها از دریافت‌ها بیشتر شده‌اند.",
        "المدفوعات أصبحت أعلى من المقبوضات.",
        "Ödemeler tahsilatlardan fazla oldu.",
        "Payments are higher than receipts."
      ),
      action: tr("کنترل نقدینگی", "التحكم في السيولة", "Nakit kontrolü", "Cash control"),
      to: "/reports",
    });
  }

  if (netSales === 0) {
    alerts.push({
      level: "info",
      icon: <Target size={18} />,
      title: tr("فروش ثبت نشده", "لا توجد مبيعات مسجلة", "Satış kaydedilmedi", "No sales recorded"),
      text: tr(
        "برای تحلیل دقیق، فاکتورهای فروش روزانه را ثبت کن.",
        "لتحليل دقيق، سجّل فواتير المبيعات اليومية.",
        "Daha doğru analiz için günlük satış faturalarını kaydedin.",
        "Record daily sales invoices for better analysis."
      ),
      action: tr("ثبت فروش", "تسجيل مبيعات", "Satış kaydet", "Record sales"),
      to: "/invoices",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: "success",
      icon: <CheckCircle2 size={18} />,
      title: tr("وضعیت سیستم پایدار است", "حالة النظام مستقرة", "Sistem durumu istikrarlı", "System looks stable"),
      text: tr(
        "هشدار جدی در فروش، نقدینگی و موجودی دیده نشد.",
        "لم يتم رصد أي تنبيه جوهري في المبيعات أو السيولة أو المخزون.",
        "Satış, nakit akışı ve envanterde kritik bir uyarı görülmedi.",
        "No critical sales, cashflow or inventory alert was detected."
      ),
      action: tr("ادامه پایش", "مواصلة المراقبة", "İzlemeye devam et", "Keep monitoring"),
      to: "/reports",
    });
  }

  return alerts;
}

function buildQuickActions(language) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  return [
    { title: tr("ثبت فاکتور فروش", "تسجيل فاتورة بيع", "Satış faturası oluştur", "New sale invoice"), path: "/invoices", icon: <Receipt size={18} /> },
    { title: tr("ثبت دریافت", "تسجيل مقبوضات", "Tahsilat kaydet", "New receipt"), path: "/receipts", icon: <Wallet size={18} /> },
    { title: tr("ثبت پرداخت", "تسجيل مدفوعات", "Ödeme kaydet", "New payment"), path: "/payments", icon: <CreditCard size={18} /> },
    { title: tr("افزودن مشتری", "إضافة عميل", "Müşteri ekle", "Add customer"), path: "/customers", icon: <Users size={18} /> },
    { title: tr("گزارش‌های حرفه‌ای", "تقارير احترافية", "Profesyonel raporlar", "Reports"), path: "/reports", icon: <TrendingUp size={18} /> },
  ];
}

export default function Dashboard() {
  const { t, n, money, time, dir, language } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState(null);
  const [healthScore, setHealthScore] = useState(null);
  const [activity, setActivity] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");
      const [statsData, activityResponse, reportsData, aiBiSummary] = await Promise.all([
        getDashboardStats(),
        fetchAuthenticatedResource("/activity").catch(() => null),
        getReportsOverview().catch(() => null),
        getAiBiSummary().catch(() => null),
      ]);
      const activityData = activityResponse
        ? await activityResponse.json().catch(() => [])
        : [];

      setStats(statsData || {});
      setReports(reportsData || {});
      // Sourced from the same /api/ai-bi/summary endpoint the AI-BI page
      // reads, so the business health score never drifts between pages.
      setHealthScore(aiBiSummary ? Number(aiBiSummary.health_score || 0) : null);
      setActivity(safeArray(activityData));
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Dashboard loading error:", error);
      setError(tr("خطا در دریافت اطلاعات داشبورد", "خطأ في تحميل بيانات لوحة التحكم", "Panel verileri yüklenirken hata oluştu", "Dashboard loading error"));
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

  const liveEvents = useLiveNotifications();

  const dashboardData = useMemo(() => {
    if (!stats) return null;
    const pushedNotifications = liveEvents
      .map((event) => mapLiveEventToNotification(event, language === "fa", money))
      .filter(Boolean);
    return {
      ...stats,
      alerts: normalizeAlerts(stats.alerts, t),
      ai_insight: normalizeInsight(stats.ai_insight, t),
      live_notifications: [
        ...pushedNotifications,
        ...normalizeNotifications(stats.live_notifications, t),
      ],
    };
  }, [stats, t, liveEvents, language, money]);

  const activityData = useMemo(() => {
    return normalizeActivity(activity, t);
  }, [activity, t]);

  if (!dashboardData) {
    return (
      <div style={{ color: "var(--erp-text)", padding: 30, direction: dir }}>
        {tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}
      </div>
    );
  }

  const profit = reports?.profit_loss || {};
  const cash = reports?.cashflow || {};
  const invoices = reports?.invoice_summary || {};
  const todayMonth = reports?.today_month || {};
  const inventory = reports?.inventory || {};
  const openInvoices = safeArray(reports?.open_invoices);
  const businessScore = healthScore ?? 0;
  const smartAlerts = buildSmartAlerts({ language, reports, stats: dashboardData, n });
  const quickActions = buildQuickActions(language);
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
          <h1 className="text-[var(--erp-accent)] text-4xl font-black mb-2 text-right">
            {t("dashboard")}
          </h1>
          <div
            aria-hidden="true"
            className="mb-3"
            style={{ width: 64, height: 3, borderRadius: 2, background: "linear-gradient(90deg, var(--erp-accent), var(--erp-accent-2))" }}
          />
          <p className="text-[var(--erp-muted)]">
            {tr(
              "داشبورد هوشمند فروش، نقدینگی، سود، مطالبات، هشدارها و رشد کسب‌وکار",
              "لوحة تحكم ذكية للمبيعات والسيولة والأرباح والمستحقات والتنبيهات ونمو الأعمال",
              "Satış, nakit akışı, kâr, alacaklar, uyarılar ve iş büyümesi için akıllı panel",
              "Smart dashboard for sales, cashflow, profit, receivables, alerts and business growth"
            )}
          </p>
          {lastUpdate && (
            <p className="text-xs text-[var(--erp-muted)] mt-2">
              {tr("آخرین بروزرسانی: ", "آخر تحديث: ", "Son güncelleme: ", "Last update: ")}
{time(lastUpdate)}
            </p>
          )}
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <LiveClock />
          <DateBadge />
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={loadDashboard}>
            {tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
          </Button>
        </div>
      </div>

      <ExecutiveAlertsPanel />

      {error && (
        <Notice tone="danger" className="mb-5 flex items-center gap-2">
          <AlertTriangle size={18} />
          {error}
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-5">
        <ExecutiveHero
          language={language}
          money={money}
          n={n}
          score={businessScore}
          netProfit={netProfit}
          profitMargin={profitMargin}
          openAmount={toNumber(invoices.open_amount)}
          cashflow={toNumber(cash.net_cashflow)}
        />

        <SmartAlertCenter language={language} alerts={smartAlerts} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 20, flexWrap: "wrap", direction: dir }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <SmartSearch value={search} onChange={setSearch} />
        </div>
      </div>

      <QuickActions language={language} actions={quickActions} />

      <ExportButtons />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginTop: 20, marginBottom: 30, direction: dir, alignItems: "stretch" }}>
        <StatsCard to="/invoices" title={tr("فروش امروز", "مبيعات اليوم", "Bugünkü satış", "Sales today")} value={money(todayMonth.sales_today || 0)} icon={<DollarSign />} color="#22d3ee" />
        <StatsCard to="/invoices" title={tr("فروش ماه", "مبيعات الشهر", "Aylık satış", "Sales this month")} value={money(todayMonth.sales_month || dashboardData.total_revenue || 0)} icon={<TrendingUp />} color="#10b981" />
        <StatsCard to="/invoices" title={tr("خرید ماه", "مشتريات الشهر", "Aylık alış", "Purchases this month")} value={money(todayMonth.purchases_month || dashboardData.total_purchases || 0)} icon={<ShoppingCart />} color="#f59e0b" />
        <StatsCard to="/receipts" title={tr("دریافت امروز", "مقبوضات اليوم", "Bugünkü tahsilat", "Receipts today")} value={money(todayMonth.receipt_today || cash.receipt_today || 0)} icon={<Receipt />} color="#10b981" />
        <StatsCard to="/payments" title={tr("پرداخت امروز", "مدفوعات اليوم", "Bugünkü ödeme", "Payments today")} value={money(todayMonth.payment_today || cash.payment_today || 0)} icon={<CreditCard />} color="#ef4444" />
        <StatsCard to="/reports" title={tr("سود خالص", "صافي الربح", "Net kâr", "Net profit")} value={money(profit.net_profit ?? dashboardData.net_profit ?? 0)} icon={<TrendingUp />} color={netProfit >= 0 ? "#22d3ee" : "#ef4444"} />
        <StatsCard to="/invoices" title={tr("فاکتورهای باز", "الفواتير المفتوحة", "Açık faturalar", "Open invoices")} value={n(invoices.open_count || openInvoices.length || 0)} icon={<Wallet />} color="#f59e0b" />
        <StatsCard to="/products" title={tr("کالاهای کم موجود", "منتجات منخفضة المخزون", "Düşük stoklu ürünler", "Low stock")} value={n(inventory.low_stock_count ?? dashboardData.low_stock ?? 0)} icon={<AlertTriangle />} color="#ef4444" />
      </div>

      <details className="group rounded-[var(--erp-radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-4">
        <summary className="cursor-pointer list-none rounded-[var(--erp-radius-md)] bg-[var(--erp-panel-solid)] px-4 py-3 text-[var(--erp-accent)] font-black flex items-center justify-between gap-3">
          <span>{tr("نمایش جزئیات و تحلیل‌های بیشتر", "عرض المزيد من التفاصيل والتحليلات", "Daha fazla ayrıntı ve analiz göster", "Show more details and analytics")}</span>
          <ChevronDown className="transition-transform group-open:rotate-180" size={20} />
        </summary>
        <div className="pt-4">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginBottom: 30, direction: dir }}>
        <StatsCard to="/invoices" title={t("invoices")} value={n(dashboardData.invoices_count || 0)} icon={<ShoppingCart />} color="#6366f1" />
        <StatsCard to="/customers" title={t("customers")} value={n(dashboardData.customers_count || 0)} icon={<Users />} color="#10b981" />
        <StatsCard to="/products" title={t("products")} value={n(dashboardData.products_count || 0)} icon={<Package />} color="#f59e0b" />
        <StatsCard to="/products" title={tr("ارزش موجودی", "قيمة المخزون", "Envanter değeri", "Inventory value")} value={money(inventory.inventory_value || 0)} icon={<Package />} color="#22d3ee" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 mb-5">
        <div>
          <SalesChart data={dashboardData.sales_chart || []} />
        </div>
        <BusinessPulse language={language} n={n} money={money} reports={reports} stats={dashboardData} />
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

function ExecutiveHero({ language, money, n, score, netProfit, profitMargin, openAmount, cashflow }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const scoreColor = score >= 75 ? "var(--erp-success)" : score >= 45 ? "var(--erp-warning)" : "var(--erp-danger)";
  const scoreLabel = score >= 75 ? tr("عالی", "ممتاز", "Mükemmel", "Excellent") : score >= 45 ? tr("نیازمند توجه", "يحتاج إلى اهتمام", "Dikkat gerektiriyor", "Needs attention") : tr("بحرانی", "حرج", "Kritik", "Critical");

  return (
    <div className="relative overflow-hidden rounded-[var(--erp-radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6" style={{ boxShadow: "var(--erp-shadow)" }}>
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-2">
            <Gauge size={22} />
            {tr("امتیاز سلامت کسب‌وکار", "مؤشر سلامة الأعمال", "İş sağlığı skoru", "Business health score")}
          </div>
          <div className="text-6xl font-black" style={{ color: scoreColor }}>{n(score)}</div>
          <div className="text-[var(--erp-muted)] mt-2">{scoreLabel}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[320px]">
          <MiniKpi
            to="/reports"
            title={tr("سود خالص", "صافي الربح", "Net kâr", "Net profit")}
            value={money(netProfit)}
            positive={netProfit >= 0}
            icon={<TrendingUp size={17} />}
          />
          <MiniKpi
            to="/reports"
            title={tr("حاشیه سود", "هامش الربح", "Kâr marjı", "Profit margin")}
            value={`${n(profitMargin.toFixed(1))}%`}
            positive={profitMargin >= 0}
            icon={<Target size={17} />}
          />
          <MiniKpi
            to="/invoices"
            title={tr("مطالبات باز", "المستحقات المفتوحة", "Açık alacaklar", "Open receivables")}
            value={money(openAmount)}
            positive={openAmount <= 0}
            icon={<Wallet size={17} />}
          />
          <MiniKpi
            to="/reports"
            title={tr("نقدینگی خالص", "صافي السيولة", "Net nakit akışı", "Net cashflow")}
            value={money(cashflow)}
            positive={cashflow >= 0}
            icon={<Banknote size={17} />}
          />
        </div>
      </div>

      <div className="relative mt-5 h-3 rounded-full bg-[var(--erp-panel-solid)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function MiniKpi({ title, value, positive, icon, to }) {
  const color = positive ? "var(--erp-success)" : "var(--erp-danger)";
  return (
    <Link
      to={to || "/reports"}
      className="rounded-[var(--erp-radius-md)] bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4 block hover:border-[var(--erp-accent)] transition-colors"
    >
      <div className="flex items-center gap-2 text-[var(--erp-muted)] text-xs font-bold mb-2">
        <span style={{ color }}>{icon}</span>
        {title}
      </div>
      <div className="font-black text-lg" style={{ color }}>{value}</div>
    </Link>
  );
}

function SmartAlertCenter({ language, alerts }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  return (
    <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-5" style={{ boxShadow: "var(--erp-shadow)" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2">
          <BellRing />
          {tr("مرکز هشدار هوشمند", "مركز التنبيهات الذكية", "Akıllı Uyarı Merkezi", "Smart Alert Center")}
        </h2>
        <Badge tone="info">{tr("زنده", "مباشر", "Canlı", "Live")}</Badge>
      </div>

      <div className="space-y-3">
        {alerts.map((item, index) => {
          const style = TONE_STYLES[item.level] || TONE_STYLES.info;
          return (
            <Link
              key={index}
              to={item.to || "/reports"}
              className="block rounded-[var(--erp-radius-md)] p-4 transition-transform hover:scale-[1.01]"
              style={{ background: style.background }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1" style={{ color: style.color }}>{item.icon}</div>
                <div className="flex-1">
                  <div className="text-[var(--erp-text)] font-black">{item.title}</div>
                  <div className="text-[var(--erp-muted)] text-sm mt-1">{item.text}</div>
                  <div className="text-xs font-bold mt-2" style={{ color: style.color }}>{item.action}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function QuickActions({ language, actions }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  return (
    <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-4 mb-5">
      <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-3">
        <Sparkles size={20} />
        {tr("دسترسی سریع عملیاتی", "إجراءات سريعة", "Hızlı işlemler", "Quick actions")}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {actions.map((item, index) => (
          <Link
            key={index}
            to={item.path}
            className="rounded-[var(--erp-radius-md)] bg-[var(--erp-panel-solid)] hover:bg-[var(--erp-glow)] border border-[var(--erp-border)] text-[var(--erp-text)] font-bold flex items-center justify-center gap-2 transition-all"
          >
            <span className="text-[var(--erp-accent)]">{item.icon}</span>
            {item.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

function BusinessPulse({ language, n, money, reports, stats }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const profit = reports?.profit_loss || {};
  const cash = reports?.cashflow || {};
  const inventory = reports?.inventory || {};
  const invoices = reports?.invoice_summary || {};
  const rows = [
    {
      title: tr("رشد فروش", "نمو المبيعات", "Satış büyümesi", "Sales growth"),
      value: money(profit.net_sales ?? stats.total_revenue ?? 0),
      icon: <ArrowUpRight size={18} />,
      color: "var(--erp-success)",
      to: "/invoices",
    },
    {
      title: tr("ریسک موجودی", "مخاطر المخزون", "Envanter riski", "Inventory risk"),
      value: n(inventory.low_stock_count ?? stats.low_stock ?? 0),
      icon: <ShieldAlert size={18} />,
      color: toNumber(inventory.low_stock_count ?? stats.low_stock) > 0 ? "var(--erp-danger)" : "var(--erp-success)",
      to: "/products",
    },
    {
      title: tr("فاکتورهای باز", "الفواتير المفتوحة", "Açık faturalar", "Open invoices"),
      value: n(invoices.open_count || 0),
      icon: <Flame size={18} />,
      color: toNumber(invoices.open_count) > 0 ? "var(--erp-warning)" : "var(--erp-success)",
      to: "/invoices",
    },
    {
      title: tr("نقدینگی ماه", "سيولة الشهر", "Aylık nakit", "Monthly cash"),
      value: money(cash.net_cashflow || 0),
      icon: <UserRoundCheck size={18} />,
      color: toNumber(cash.net_cashflow) >= 0 ? "var(--erp-accent)" : "var(--erp-danger)",
      to: "/reports",
    },
  ];

  return (
    <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-5 h-full flex flex-col" style={{ boxShadow: "var(--erp-shadow)" }}>
      <h2 className="text-[var(--erp-accent)] font-black text-xl mb-4">
        {tr("نبض کسب‌وکار", "نبض الأعمال", "İş nabzı", "Business pulse")}
      </h2>
      <div className="flex-1 flex flex-col justify-between gap-3">
        {rows.map((row, index) => (
          <Link key={index} to={row.to} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-panel-solid)] p-4 flex items-center justify-between gap-3 hover:opacity-90 transition-opacity">
            <div className="flex items-center gap-3">
              <div style={{ color: row.color }}>{row.icon}</div>
              <div className="text-[var(--erp-muted)] font-bold">{row.title}</div>
            </div>
            <div className="font-black" style={{ color: row.color }}>{row.value}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
