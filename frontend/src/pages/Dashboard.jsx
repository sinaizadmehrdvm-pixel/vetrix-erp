import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Banknote, ChevronDown, CreditCard, Package, Receipt,
  RefreshCw, TrendingUp, Users, Wallet,
} from "lucide-react";

import SalesChart from "../charts/SalesChart";
import RecentInvoices from "../widgets/RecentInvoices";
import InventoryAlerts from "../smart/InventoryAlerts";
import AiInsights from "../smart/AiInsights";
import TopProducts from "../widgets/TopProducts";
import ActivityTimeline from "../timeline/ActivityTimeline";
import ExportButtons from "../export/ExportButtons";
import SmartSearch from "../search/SmartSearch";
import { useLanguage } from "../localization/useLanguage";
import { fetchAuthenticatedResource, getDashboardStats, getReportsOverview } from "../services/api";

function toNumber(value) {
  return Number(String(value ?? "").replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit)).replace(/[,،]/g, "").replace(/[^\d.-]/g, "")) || 0;
}

function safeArray(value) { return Array.isArray(value) ? value : []; }

function formatMoney(value, money) {
  return money(toNumber(value));
}

function makeAlerts({ inventory, invoices, cash, profit, stats, t }) {
  const candidates = [
    [toNumber(inventory.low_stock_count ?? stats.low_stock) > 0, "danger", "inventoryAlert", "inventoryAlertText", "/warehouse"],
    [toNumber(invoices.open_count) > 0, "warning", "unsettledInvoices", "unsettledInvoicesText", "/invoices"],
    [toNumber(cash.net_cashflow) < 0, "warning", "negativeCashflow", "negativeCashflowText", "/transactions"],
    [toNumber(profit.net_profit ?? stats.net_profit) < 0, "danger", "negativeNetProfit", "negativeNetProfitText", "/reports"],
  ];
  const alerts = candidates.filter(([show]) => show).map(([, level, title, text, path]) => ({ level, title: t(title), text: t(text), path }));
  return alerts.length ? alerts : [{ level: "success", title: t("systemHealthy"), text: t("noCriticalAlerts"), path: "/reports" }];
}

function quickActions(t) {
  return [
    ["newSaleInvoice", "/invoices", Receipt], ["newReceipt", "/receipts", Wallet],
    ["newPayment", "/payments", CreditCard], ["addCustomer", "/customers", Users], ["reports", "/reports", TrendingUp],
  ].map(([label, path, Icon]) => ({ label: t(label), path, Icon }));
}

export default function Dashboard() {
  const { t, n, money, time, dir } = useLanguage();
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState(null);
  const [activity, setActivity] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const [statsData, activityResponse, reportsData] = await Promise.all([
        getDashboardStats(), fetchAuthenticatedResource("/activity").catch(() => null), getReportsOverview().catch(() => null),
      ]);
      setStats(statsData || {});
      setReports(reportsData || {});
      setActivity(activityResponse ? await activityResponse.json().catch(() => []) : []);
      setLastUpdate(new Date());
    } catch (loadError) {
      console.error("Dashboard loading error:", loadError);
      setError(t("dashboardLoadError"));
      setStats((current) => current || {});
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => { void loadDashboard(); }, 0);
    const refreshTimer = window.setInterval(() => { void loadDashboard(); }, 60000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(refreshTimer); };
  }, [loadDashboard]);

  const data = stats || {};
  const profit = reports?.profit_loss || {};
  const cash = reports?.cashflow || {};
  const invoices = reports?.invoice_summary || {};
  const todayMonth = reports?.today_month || {};
  const inventory = reports?.inventory || {};
  const alerts = makeAlerts({ inventory, invoices, cash, profit, stats: data, t });
  const actions = quickActions(t);
  const primaryKpis = [
    ["salesToday", formatMoney(todayMonth.sales_today, money), TrendingUp, "var(--erp-accent)"],
    ["salesThisMonth", formatMoney(todayMonth.sales_month ?? data.total_revenue, money), Receipt, "var(--erp-accent-2)"],
    ["netProfit", formatMoney(profit.net_profit ?? data.net_profit, money), Banknote, toNumber(profit.net_profit ?? data.net_profit) >= 0 ? "var(--erp-accent-2)" : "#ef4444"],
    ["openInvoices", n(toNumber(invoices.open_count)), Wallet, "#f59e0b"],
    ["lowStock", n(toNumber(inventory.low_stock_count ?? data.low_stock)), Package, "#ef4444"],
    ["netCashflow", formatMoney(cash.net_cashflow, money), CreditCard, toNumber(cash.net_cashflow) >= 0 ? "var(--erp-accent)" : "#ef4444"],
  ];

  if (!stats) return <div className="dashboard-loading" dir={dir}>{t("loading")}</div>;

  return <main className="dashboard-page" dir={dir} aria-busy={loading}>
    <header className="dashboard-compact-header">
      <div>
        <h1>{t("dashboard")}</h1>
        <p>{lastUpdate ? `${t("lastUpdated")}: ${time(lastUpdate)}` : t("dashboardAtAGlance")}</p>
      </div>
      <button type="button" onClick={loadDashboard} disabled={loading} className="dashboard-refresh" aria-label={t("refreshDashboard")}>
        <RefreshCw size={17} className={loading ? "animate-spin" : ""} aria-hidden="true" /> <span>{t("refresh")}</span>
      </button>
    </header>

    {error && <div className="dashboard-error" role="alert"><AlertTriangle size={18} />{error}</div>}

    <section aria-label={t("quickActions")} className="dashboard-actions">
      {actions.map(({ label, path, Icon }) => <Link key={path} to={path} className="dashboard-action"><Icon size={17} aria-hidden="true" />{label}</Link>)}
      <details className="dashboard-more-actions">
        <summary><ChevronDown size={16} aria-hidden="true" />{t("moreActions")}</summary>
        <div className="dashboard-more-panel">
          <SmartSearch value={search} onChange={setSearch} />
          <ExportButtons />
        </div>
      </details>
    </section>

    <section className="dashboard-kpis" aria-label={t("businessSummary")}>
      {primaryKpis.map(([label, value, Icon, color]) => <article className="dashboard-kpi" key={label}>
        <span className="dashboard-kpi-icon" style={{ color }}><Icon size={19} aria-hidden="true" /></span>
        <div><p>{t(label)}</p><strong>{value}</strong></div>
      </article>)}
    </section>

    <section className="dashboard-core-grid">
      <div className="dashboard-chart"><SalesChart data={safeArray(data.sales_chart)} compact /></div>
      <AlertPanel alerts={alerts} t={t} />
    </section>
    <section className="dashboard-invoices"><RecentInvoices invoices={safeArray(data.recent_invoices).slice(0, 4)} compact /></section>

    <details className="dashboard-secondary">
      <summary><ChevronDown size={18} aria-hidden="true" />{t("moreDashboardDetails")}</summary>
      <div className="dashboard-secondary-grid">
        <InventoryAlerts alerts={safeArray(data.alerts)} />
        <AiInsights insight={data.ai_insight} />
        <TopProducts products={safeArray(data.top_products)} />
        <ActivityTimeline items={safeArray(activity)} />
      </div>
    </details>
  </main>;
}

function AlertPanel({ alerts, t }) {
  return <aside className="dashboard-alerts" aria-label={t("prioritizedAlerts")}>
    <div className="dashboard-panel-title"><AlertTriangle size={18} aria-hidden="true" /><h2>{t("prioritizedAlerts")}</h2></div>
    <div>{alerts.slice(0, 3).map((alert) => <Link to={alert.path} className={`dashboard-alert dashboard-alert-${alert.level}`} key={alert.title}>
      <strong>{alert.title}</strong><span>{alert.text}</span>
    </Link>)}</div>
  </aside>;
}
