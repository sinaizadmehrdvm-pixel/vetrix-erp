import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CalendarClock,
  Crown,
  DollarSign,
  Download,
  Lightbulb,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useLanguage } from "../localization/LanguageContext";
import { API_URL, getAuthHeaders, getReportsOverview } from "../services/api";


function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function fallbackMonths() {
  return Array.from({ length: 8 }, (_, i) => ({ label: `M${i + 1}`, sales: 0, purchases: 0, profit: 0 }));
}

function normalizeMonthly(data) {
  const rows = data?.monthly_sales || data?.sales_chart || data?.chart || data?.profit_loss?.monthly || fallbackMonths();
  return (Array.isArray(rows) ? rows : fallbackMonths()).map((row, index) => {
    const sales = toNumber(row.sales ?? row.revenue ?? row.total_sales ?? row.amount);
    const purchases = toNumber(row.purchases ?? row.total_purchases ?? row.cost ?? 0);
    const profit = toNumber(row.profit ?? row.net_profit ?? sales - purchases);
    return { label: row.label || row.month_name || row.date || `M${index + 1}`, sales, purchases, profit };
  });
}

function movingAverageForecast(rows) {
  const last = rows.slice(-3);
  if (!last.length) return 0;
  return last.reduce((s, x) => s + toNumber(x.sales), 0) / last.length;
}

function trendPercent(rows) {
  if (rows.length < 2) return 0;
  const prev = toNumber(rows[rows.length - 2].sales);
  const current = toNumber(rows[rows.length - 1].sales);
  if (!prev) return current ? 100 : 0;
  return ((current - prev) / prev) * 100;
}

function buildInsights({ reports, dashboard, monthly, fa, money, n }) {
  const profit = reports?.profit_loss || {};
  const inventory = reports?.inventory || {};
  const invoiceSummary = reports?.invoice_summary || {};
  const trend = trendPercent(monthly);
  const forecast = movingAverageForecast(monthly);
  const netProfit = toNumber(profit.net_profit ?? dashboard?.net_profit ?? 0);
  const salesMonth = toNumber(reports?.today_month?.sales_month ?? dashboard?.total_revenue ?? 0);
  const lowStock = toNumber(inventory.low_stock_count ?? dashboard?.low_stock ?? 0);
  const openInvoices = toNumber(invoiceSummary.open_count ?? dashboard?.open_invoices ?? 0);
  const list = [];

  if (trend > 15) {
    list.push({ tone: "emerald", icon: <TrendingUp />, title: fa ? "رشد فروش قابل توجه" : "Strong sales growth", text: fa ? `فروش نسبت به دوره قبل حدود ${n(Math.round(trend))}% رشد داشته است.` : `Sales grew about ${Math.round(trend)}% vs previous period.` });
  } else if (trend < -15) {
    list.push({ tone: "rose", icon: <TrendingDown />, title: fa ? "افت فروش" : "Sales drop", text: fa ? `فروش نسبت به دوره قبل حدود ${n(Math.abs(Math.round(trend)))}% کاهش داشته است. کمپین فروش پیشنهاد می‌شود.` : `Sales dropped about ${Math.abs(Math.round(trend))}%. A campaign is recommended.` });
  }

  if (netProfit < 0) {
    list.push({ tone: "rose", icon: <AlertTriangle />, title: fa ? "هشدار سود منفی" : "Negative profit warning", text: fa ? "سود خالص منفی است. هزینه‌ها، قیمت فروش و تخفیف‌ها باید بررسی شوند." : "Net profit is negative. Review costs, pricing and discounts." });
  } else if (netProfit > 0) {
    list.push({ tone: "emerald", icon: <DollarSign />, title: fa ? "وضعیت سود مثبت" : "Positive profit", text: fa ? `سود خالص فعلی ${money(netProfit)} است.` : `Current net profit is ${money(netProfit)}.` });
  }

  if (lowStock > 0) {
    list.push({ tone: "amber", icon: <Package />, title: fa ? "نیاز به تامین موجودی" : "Inventory replenishment", text: fa ? `${n(lowStock)} کالا کم‌موجود است. پیشنهاد خرید و تامین فعال شود.` : `${lowStock} item(s) are low-stock. Purchase planning is recommended.` });
  }

  if (openInvoices > 0) {
    list.push({ tone: "cyan", icon: <Wallet />, title: fa ? "پیگیری فاکتورهای باز" : "Open invoices follow-up", text: fa ? `${n(openInvoices)} فاکتور باز وجود دارد. پیگیری وصول مطالبات پیشنهاد می‌شود.` : `${openInvoices} open invoice(s). Receivable follow-up is recommended.` });
  }

  if (forecast > salesMonth && salesMonth > 0) {
    list.push({ tone: "emerald", icon: <Brain />, title: fa ? "پیش‌بینی رشد فروش" : "Sales forecast growth", text: fa ? `بر اساس میانگین اخیر، فروش دوره بعد می‌تواند حدود ${money(forecast)} باشد.` : `Based on recent average, next period sales may be around ${money(forecast)}.` });
  }

  if (!list.length) {
    list.push({ tone: "cyan", icon: <Sparkles />, title: fa ? "وضعیت پایدار" : "Stable business status", text: fa ? "اطلاعات فعلی نشانه بحران جدی ندارد. ادامه پایش روزانه پیشنهاد می‌شود." : "Current data shows no major issue. Continue daily monitoring." });
  }
  return list;
}

export default function BusinessIntelligence() {
  const { language, dir, money, n } = useLanguage();
  const fa = language === "fa";
  const [reports, setReports] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [crm, setCrm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadBI() {
    try {
      setLoading(true);
      setMessage("");
      const [reportsData, dashboardRes, crmRes] = await Promise.all([
        getReportsOverview().catch(() => null),
        fetch(`${API_URL}/dashboard-stats`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${API_URL}/api/crm/dashboard`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setReports(reportsData || {});
      setDashboard(dashboardRes || {});
      setCrm(crmRes || {});
    } catch (error) {
      console.error("BI loading error:", error);
      setMessage(fa ? "خطا در دریافت اطلاعات هوش تجاری" : "Business intelligence loading error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBI();
  }, [language]);

  const monthly = useMemo(() => normalizeMonthly(reports), [reports]);
  const maxSales = Math.max(...monthly.map((x) => toNumber(x.sales)), 1);
  const maxProfit = Math.max(...monthly.map((x) => Math.abs(toNumber(x.profit))), 1);

  const metrics = useMemo(() => {
    const profit = reports?.profit_loss || {};
    const cash = reports?.cashflow || {};
    const inventory = reports?.inventory || {};
    const invoices = reports?.invoice_summary || {};
    const todayMonth = reports?.today_month || {};
    const salesMonth = toNumber(todayMonth.sales_month ?? dashboard?.total_revenue ?? 0);
    const purchasesMonth = toNumber(todayMonth.purchases_month ?? dashboard?.total_purchases ?? 0);
    const netProfit = toNumber(profit.net_profit ?? dashboard?.net_profit ?? salesMonth - purchasesMonth);
    const profitMargin = salesMonth ? (netProfit / salesMonth) * 100 : 0;
    return {
      salesToday: toNumber(todayMonth.sales_today ?? 0),
      salesMonth,
      purchasesMonth,
      netProfit,
      profitMargin,
      forecast: movingAverageForecast(monthly),
      trend: trendPercent(monthly),
      cashBalance: toNumber(cash.balance ?? cash.cash_balance ?? 0),
      receiptToday: toNumber(todayMonth.receipt_today ?? cash.receipt_today ?? 0),
      paymentToday: toNumber(todayMonth.payment_today ?? cash.payment_today ?? 0),
      openInvoices: toNumber(invoices.open_count ?? 0),
      openAmount: toNumber(invoices.open_amount ?? 0),
      inventoryValue: toNumber(inventory.inventory_value ?? 0),
      lowStock: toNumber(inventory.low_stock_count ?? 0),
      customersCount: toNumber(crm?.customers_count ?? dashboard?.customers_count ?? 0),
      vipCount: toNumber(crm?.vip_count ?? 0),
      riskCount: toNumber(crm?.risk_count ?? 0),
      receivablesTotal: toNumber(crm?.receivables_total ?? 0),
      scoreAvg: toNumber(crm?.customer_score_avg ?? 0),
    };
  }, [reports, dashboard, crm, monthly]);

  const insights = useMemo(() => buildInsights({ reports, dashboard, monthly, fa, money, n }), [reports, dashboard, monthly, fa, money, n]);

  const purchaseSuggestions = useMemo(() => {
    const inventory = reports?.inventory || {};
    const rows = Array.isArray(inventory.low_stock_items) ? inventory.low_stock_items : Array.isArray(dashboard?.alerts) ? dashboard.alerts : [];
    return rows.slice(0, 8).map((item, index) => ({
      id: item.id || index,
      name: item.name || item.product_name || item.title || item.message || (fa ? "کالای کم‌موجود" : "Low stock item"),
      stock: toNumber(item.stock ?? item.quantity ?? item.current_stock ?? 0),
      min: toNumber(item.min_stock ?? item.reorder_level ?? item.minimum_stock ?? 0),
      suggested: Math.max(1, toNumber(item.reorder_qty ?? item.suggested_qty ?? item.min_stock ?? 1)),
    }));
  }, [reports, dashboard, fa]);

  function exportSnapshot() {
    const lines = [
      fa ? "گزارش هوش تجاری Vetrix ERP" : "Vetrix ERP BI Snapshot",
      "--------------------------------",
      `${fa ? "فروش ماه" : "Sales month"}: ${money(metrics.salesMonth)}`,
      `${fa ? "سود خالص" : "Net profit"}: ${money(metrics.netProfit)}`,
      `${fa ? "حاشیه سود" : "Profit margin"}: ${n(Math.round(metrics.profitMargin))}%`,
      `${fa ? "پیش‌بینی فروش" : "Sales forecast"}: ${money(metrics.forecast)}`,
      `${fa ? "کالاهای کم موجود" : "Low stock"}: ${n(metrics.lowStock)}`,
      `${fa ? "مطالبات" : "Receivables"}: ${money(metrics.receivablesTotal)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vetrix-bi-snapshot.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir={dir} className="min-h-screen p-6 text-white" style={{ direction: dir, background: "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 35%), radial-gradient(circle at top right, rgba(168,85,247,0.14), transparent 35%), #071028" }}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-4xl font-black text-cyan-400 flex items-center gap-3"><Brain size={40} />{fa ? "هوش تجاری و مدیریت هوشمند" : "Business Intelligence"}</h1>
          <p className="text-slate-400 mt-2">{fa ? "تحلیل فروش، سود، نقدینگی، مشتریان، موجودی، پیش‌بینی و پیشنهادهای مدیریتی" : "Sales, profit, cashflow, customers, inventory, forecasting and management suggestions"}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={exportSnapshot} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2"><Download size={18} />{fa ? "خروجی خلاصه" : "Export"}</button>
          <button onClick={loadBI} disabled={loading} className="px-4 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2 disabled:opacity-60"><RefreshCw size={18} className={loading ? "animate-spin" : ""} />{fa ? "به‌روزرسانی" : "Refresh"}</button>
        </div>
      </div>

      {message && <div className="rounded-2xl bg-red-500/10 border border-red-400/20 text-red-200 p-4 mb-5">{message}</div>}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-5">
        <KpiCard icon={<DollarSign />} title={fa ? "فروش امروز" : "Sales today"} value={money(metrics.salesToday)} tone="cyan" />
        <KpiCard icon={<TrendingUp />} title={fa ? "فروش ماه" : "Sales month"} value={money(metrics.salesMonth)} tone="emerald" />
        <KpiCard icon={<Wallet />} title={fa ? "سود خالص" : "Net profit"} value={money(metrics.netProfit)} tone={metrics.netProfit >= 0 ? "emerald" : "rose"} />
        <KpiCard icon={<Target />} title={fa ? "حاشیه سود" : "Profit margin"} value={`${n(Math.round(metrics.profitMargin))}%`} tone={metrics.profitMargin >= 20 ? "emerald" : metrics.profitMargin >= 5 ? "amber" : "rose"} />
        <KpiCard icon={<Brain />} title={fa ? "پیش‌بینی فروش" : "Sales forecast"} value={money(metrics.forecast)} hint={fa ? "میانگین سه دوره اخیر" : "3-period moving average"} tone="cyan" />
        <KpiCard icon={<Package />} title={fa ? "ارزش موجودی" : "Inventory value"} value={money(metrics.inventoryValue)} tone="cyan" />
        <KpiCard icon={<AlertTriangle />} title={fa ? "کالاهای کم‌موجود" : "Low stock"} value={n(metrics.lowStock)} tone={metrics.lowStock > 0 ? "rose" : "emerald"} />
        <KpiCard icon={<Users />} title={fa ? "مشتریان پرریسک" : "Risk customers"} value={n(metrics.riskCount)} tone={metrics.riskCount > 0 ? "amber" : "emerald"} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.3fr_.7fr] gap-5 mb-5">
        <Panel title={fa ? "نمودار فروش، خرید و سود" : "Sales, purchases and profit chart"} icon={<BarChart3 />}>
          <div className="h-80 flex items-end gap-3 px-2 overflow-x-auto">
            {monthly.map((row, index) => (
              <div key={`${row.label}-${index}`} className="flex-1 flex flex-col items-center gap-2 min-w-[42px]">
                <div className="w-full h-64 flex items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t-xl bg-cyan-400/80" style={{ height: `${clamp((toNumber(row.sales) / maxSales) * 100, 3, 100)}%` }} title={`${row.label} - ${money(row.sales)}`} />
                  <div className="w-1/3 rounded-t-xl bg-amber-400/80" style={{ height: `${clamp((toNumber(row.purchases) / maxSales) * 100, 3, 100)}%` }} title={`${row.label} - ${money(row.purchases)}`} />
                  <div className={`w-1/3 rounded-t-xl ${row.profit >= 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`} style={{ height: `${clamp((Math.abs(toNumber(row.profit)) / maxProfit) * 100, 3, 100)}%` }} title={`${row.label} - ${money(row.profit)}`} />
                </div>
                <div className="text-[11px] text-slate-400 whitespace-nowrap">{row.label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-300">
            <Legend color="bg-cyan-400" label={fa ? "فروش" : "Sales"} />
            <Legend color="bg-amber-400" label={fa ? "خرید" : "Purchases"} />
            <Legend color="bg-emerald-400" label={fa ? "سود" : "Profit"} />
          </div>
        </Panel>

        <Panel title={fa ? "وضعیت مدیریتی سریع" : "Executive summary"} icon={<Crown />}>
          <div className="space-y-4">
            <ScoreGauge value={metrics.scoreAvg || 50} title={fa ? "میانگین امتیاز مشتریان" : "Avg customer score"} n={n} />
            <ExecutiveRow label={fa ? "دریافت امروز" : "Receipts today"} value={money(metrics.receiptToday)} />
            <ExecutiveRow label={fa ? "پرداخت امروز" : "Payments today"} value={money(metrics.paymentToday)} />
            <ExecutiveRow label={fa ? "فاکتورهای باز" : "Open invoices"} value={n(metrics.openInvoices)} />
            <ExecutiveRow label={fa ? "مبلغ فاکتورهای باز" : "Open amount"} value={money(metrics.openAmount)} />
            <ExecutiveRow label={fa ? "مطالبات CRM" : "CRM receivables"} value={money(metrics.receivablesTotal)} />
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5 mb-5">
        <Panel title={fa ? "پیشنهادهای هوشمند مدیریتی" : "Smart management insights"} icon={<Lightbulb />}>
          <div className="space-y-3">{insights.map((item, index) => <InsightCard key={index} item={item} />)}</div>
        </Panel>
        <Panel title={fa ? "پیشنهاد خرید و تامین موجودی" : "Purchase & replenishment suggestions"} icon={<ShoppingCart />}>
          <div className="space-y-3">
            {purchaseSuggestions.length ? purchaseSuggestions.map((item) => (
              <div key={item.id} className="rounded-3xl bg-slate-800/70 border border-white/5 p-4 flex items-center justify-between gap-3">
                <div><div className="font-black text-white">{item.name}</div><div className="text-slate-400 text-sm mt-1">{fa ? "موجودی" : "Stock"}: {n(item.stock)} / {fa ? "حداقل" : "Min"}: {n(item.min)}</div></div>
                <div className="text-cyan-300 font-black">{fa ? "خرید پیشنهادی" : "Suggested"}: {n(item.suggested)}</div>
              </div>
            )) : <div className="rounded-3xl bg-slate-800/70 border border-white/5 p-8 text-center text-slate-400">{fa ? "فعلاً پیشنهاد خریدی ثبت نشده است." : "No purchase suggestions yet."}</div>}
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <MiniPanel icon={<Users />} title={fa ? "مشتریان" : "Customers"} main={n(metrics.customersCount)} sub={`${fa ? "VIP" : "VIP"}: ${n(metrics.vipCount)}`} />
        <MiniPanel icon={<CalendarClock />} title={fa ? "روند فروش" : "Sales trend"} main={`${n(Math.round(metrics.trend))}%`} sub={metrics.trend >= 0 ? (fa ? "رو به رشد" : "Growing") : (fa ? "کاهشی" : "Declining")} />
        <MiniPanel icon={<Package />} title={fa ? "سلامت موجودی" : "Inventory health"} main={metrics.lowStock > 0 ? (fa ? "نیازمند بررسی" : "Needs review") : (fa ? "مناسب" : "Good")} sub={`${fa ? "کم‌موجود" : "Low stock"}: ${n(metrics.lowStock)}`} />
      </section>
    </div>
  );
}

function KpiCard({ icon, title, value, hint, tone = "cyan" }) {
  const toneClass = { cyan: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20", emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", rose: "text-rose-300 bg-rose-400/10 border-rose-400/20", amber: "text-amber-300 bg-amber-400/10 border-amber-400/20" }[tone];
  return <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-slate-400 text-sm font-bold">{title}</div><div className="text-2xl font-black text-white mt-2">{value}</div>{hint && <div className="text-xs text-slate-500 mt-2">{hint}</div>}</div><div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${toneClass}`}>{icon}</div></div></div>;
}

function Panel({ title, icon, children }) {
  return <section className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5"><h2 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-5">{icon}{title}</h2>{children}</section>;
}

function Legend({ color, label }) {
  return <div className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${color}`} />{label}</div>;
}

function InsightCard({ item }) {
  const toneClass = { cyan: "bg-cyan-400/10 text-cyan-200 border-cyan-400/20", emerald: "bg-emerald-400/10 text-emerald-200 border-emerald-400/20", rose: "bg-rose-400/10 text-rose-200 border-rose-400/20", amber: "bg-amber-400/10 text-amber-200 border-amber-400/20" }[item.tone] || "bg-cyan-400/10 text-cyan-200 border-cyan-400/20";
  return <div className="rounded-3xl bg-slate-800/70 border border-white/5 p-4 flex gap-3"><div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${toneClass}`}>{item.icon}</div><div><div className="font-black text-white">{item.title}</div><p className="text-slate-300 text-sm leading-7 mt-1">{item.text}</p></div></div>;
}

function ExecutiveRow({ label, value }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-800/70 border border-white/5 p-3"><span className="text-slate-400 text-sm">{label}</span><b className="text-cyan-300">{value}</b></div>;
}

function ScoreGauge({ value, title, n }) {
  const score = clamp(toNumber(value));
  return <div className="text-center rounded-3xl bg-slate-800/70 border border-white/5 p-5"><div className="text-slate-400 text-sm mb-3">{title}</div><div className="w-36 h-36 mx-auto rounded-full flex items-center justify-center" style={{ background: `conic-gradient(#22d3ee ${score * 3.6}deg, rgba(51,65,85,.8) 0deg)` }}><div className="w-28 h-28 rounded-full bg-slate-950 flex flex-col items-center justify-center"><div className="text-4xl font-black text-cyan-300">{n(Math.round(score))}</div><div className="text-xs text-slate-500">/100</div></div></div></div>;
}

function MiniPanel({ icon, title, main, sub }) {
  return <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 flex items-center justify-center">{icon}</div><div><div className="text-slate-400 text-sm font-bold">{title}</div><div className="text-xl font-black text-white mt-1">{main}</div><div className="text-xs text-slate-500 mt-1">{sub}</div></div></div></div>;
}
