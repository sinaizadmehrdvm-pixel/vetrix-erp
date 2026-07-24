import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Gauge,
  PackageSearch,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { getAiBiAnomalies, getAiBiCashflowForecast, getAiBiSummary } from "../services/api";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function scoreLabel(score, fa) {
  if (score >= 75) return fa ? "عالی و پایدار" : "Excellent";
  if (score >= 45) return fa ? "نیازمند توجه" : "Needs attention";
  return fa ? "پرریسک" : "High risk";
}

function scoreColor(score) {
  if (score >= 75) return "#10b981";
  if (score >= 45) return "#f59e0b";
  return "#ef4444";
}

export default function AiBusinessIntelligence() {
  const { language, dir, n, money } = useLanguage();
  const fa = language === "fa";
  const [data, setData] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const result = await getAiBiSummary();
      if (result?.status === "error") throw new Error(result.message || "AI BI error");
      setData(result || {});
    } catch (err) {
      console.error("AI BI loading error:", err);
      setError(fa ? "خطا در دریافت تحلیل هوشمند" : "AI BI loading error");
    } finally {
      setLoading(false);
    }
    try {
      setAnomalies(await getAiBiAnomalies());
    } catch (err) {
      console.error("AI BI anomaly loading error:", err);
    }
    try {
      setForecast(await getAiBiCashflowForecast(30));
    } catch (err) {
      console.error("AI BI cashflow forecast loading error:", err);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void loadData(); }, 0);;
    const timer = setInterval(loadData, 30000);
    return () => { clearTimeout(initialTimer); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const kpis = data?.kpis || {};
  const alerts = safeArray(data?.alerts);
  const recommendations = safeArray(data?.recommendations);
  const topCustomers = safeArray(data?.top_customers);
  const riskyCustomers = safeArray(data?.risky_customers);
  const lowStock = safeArray(data?.low_stock_products);
  const deadStock = safeArray(data?.dead_stock_products);
  const openInvoices = safeArray(data?.open_invoices);
  const score = Number(data?.health_score || 0);

  const scoreStyle = useMemo(() => ({ color: scoreColor(score) }), [score]);

  return (
    <div
      dir={dir}
      className="min-h-screen text-[var(--erp-text)]"
      style={{
        padding: 30,
        background:
          "radial-gradient(circle at top left, var(--erp-glow), transparent 34%), radial-gradient(circle at top right, rgba(16,185,129,.13), transparent 36%), var(--erp-bg)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)] flex items-center gap-3">
            <BrainCircuit size={36} />
            {fa ? "هوش تجاری Vetrix" : "Vetrix AI Business Intelligence"}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {fa
              ? "تحلیل هوشمند فروش، سود، نقدینگی، موجودی، مطالبات و ریسک‌های مدیریتی"
              : "Smart analysis for sales, profit, cashflow, inventory, receivables and business risk"}
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {fa ? "تحلیل مجدد" : "Refresh analysis"}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl p-4 mb-5 bg-rose-500/10 border border-rose-400/20 text-rose-200 flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {!data ? (
        <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-8 text-[var(--erp-muted)]">
          {fa ? "در حال آماده‌سازی تحلیل هوشمند..." : "Preparing AI analysis..."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[.85fr_1.15fr] gap-5 mb-5">
            <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-6 overflow-hidden relative">
              <div className="absolute -top-20 -left-20 w-60 h-60 rounded-full bg-[var(--erp-glow)] blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-3">
                  <Gauge /> {fa ? "امتیاز سلامت کسب‌وکار" : "Business health score"}
                </div>
                <div className="text-7xl font-black" style={scoreStyle}>{n(score)}</div>
                <div className="text-xl font-black mt-2" style={scoreStyle}>{scoreLabel(score, fa)}</div>
                <div className="h-3 rounded-full bg-[var(--erp-panel-solid)] mt-5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${score}%`, background: scoreColor(score) }}
                  />
                </div>
                <p className="text-[var(--erp-muted)] mt-5 leading-8">{data.narrative}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <KpiCard title={fa ? "فروش خالص" : "Net sales"} value={money(kpis.net_sales || 0)} icon={<TrendingUp />} color="var(--erp-accent)" />
              <KpiCard title={fa ? "سود ناخالص" : "Gross profit"} value={money(kpis.gross_profit || 0)} icon={<BarChart3 />} color={(kpis.gross_profit || 0) >= 0 ? "#10b981" : "#ef4444"} />
              <KpiCard title={fa ? "رشد فروش ماه" : "Monthly sales growth"} value={`${n(Number(kpis.sales_growth_percent || 0).toFixed(1))}%`} icon={(kpis.sales_growth_percent || 0) >= 0 ? <TrendingUp /> : <TrendingDown />} color={(kpis.sales_growth_percent || 0) >= 0 ? "#10b981" : "#ef4444"} />
              <KpiCard title={fa ? "جریان نقدی خالص" : "Net cashflow"} value={money(kpis.net_cashflow || 0)} icon={<Wallet />} color={(kpis.net_cashflow || 0) >= 0 ? "#10b981" : "#ef4444"} />
              <KpiCard title={fa ? "مطالبات باز" : "Open receivables"} value={money(kpis.open_invoices_amount || 0)} icon={<AlertTriangle />} color="#f59e0b" />
              <KpiCard title={fa ? "کالاهای کم‌موجود" : "Low stock"} value={n(kpis.low_stock_count || 0)} icon={<PackageSearch />} color="#ef4444" />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            <Panel title={fa ? "هشدارهای هوشمند" : "Smart alerts"} icon={<AlertTriangle />}>
              <div className="space-y-3">
                {alerts.map((item, index) => <AlertRow key={index} item={item} />)}
              </div>
            </Panel>

            <Panel title={fa ? "پیشنهادهای مدیریتی" : "Management recommendations"} icon={<Sparkles />}>
              <div className="space-y-3">
                {recommendations.map((item, index) => (
                  <div key={index} className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
                    <div className="text-[var(--erp-text)] font-black">{item.title}</div>
                    <div className="text-[var(--erp-muted)] text-sm mt-2 leading-7">{item.text}</div>
                    <div className="text-[var(--erp-accent)] text-xs font-bold mt-3">{fa ? "اثر مورد انتظار: " : "Expected impact: "}{item.impact}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            <Panel
              title={fa ? "پیش‌بینی جریان نقدی (۳۰ روز آینده)" : "Cash flow forecast (next 30 days)"}
              icon={<Wallet />}
            >
              {!forecast ? (
                <div className="text-slate-400">{fa ? "در حال محاسبه..." : "Calculating..."}</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-800/80 p-4">
                      <div className="text-xs text-slate-400 mb-1">{fa ? "وضعیت نقدی فعلی" : "Current net cash"}</div>
                      <div className="text-xl font-black" style={{ color: forecast.current_net_cash >= 0 ? "#10b981" : "#ef4444" }}>
                        {money(forecast.current_net_cash)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-800/80 p-4">
                      <div className="text-xs text-slate-400 mb-1">
                        {fa ? "پیش‌بینی روند (۳۰ روز)" : "Trend projection (30d)"}
                      </div>
                      <div className="text-xl font-black" style={{ color: forecast.trend_projected_net_cash >= 0 ? "#10b981" : "#ef4444" }}>
                        {money(forecast.trend_projected_net_cash)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-800/80 p-4">
                    <div className="text-sm font-bold text-cyan-300 mb-2">
                      {fa ? "رویدادهای زمان‌بندی‌شده (چک‌ها)" : "Scheduled events (cheques)"}
                    </div>
                    <div className="flex justify-between text-sm text-slate-300 mb-1">
                      <span>{fa ? "ورودی مورد انتظار" : "Expected inflow"}</span>
                      <span className="text-emerald-300 font-bold">{money(forecast.scheduled_inflow)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>{fa ? "خروجی مورد انتظار" : "Expected outflow"}</span>
                      <span className="text-rose-300 font-bold">{money(forecast.scheduled_outflow)}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-800/80 p-4">
                    <div className="flex justify-between text-sm text-slate-300 mb-1">
                      <span>{fa ? "مطالبات باز (بدون تاریخ مشخص)" : "Open receivables (undated)"}</span>
                      <span className="text-emerald-300 font-bold">{money(forecast.open_receivables)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>{fa ? "بدهی‌های باز (بدون تاریخ مشخص)" : "Open payables (undated)"}</span>
                      <span className="text-rose-300 font-bold">{money(forecast.open_payables)}</span>
                    </div>
                  </div>

                  {forecast.scheduled_events.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-auto pr-1">
                      {forecast.scheduled_events.map((event, index) => (
                        <div key={index} className="flex justify-between rounded-xl bg-slate-800/60 px-3 py-2 text-xs">
                          <span>{event.cheque_number} ({event.due_date})</span>
                          <span className={event.type === "cheque_received" ? "text-emerald-300" : "text-rose-300"}>
                            {money(event.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Panel>

            <Panel
              title={fa ? "تشخیص ناهنجاری در تراکنش‌ها" : "Transaction anomaly detection"}
              icon={<ShieldAlert />}
            >
              {!anomalies ? (
                <div className="text-slate-400">{fa ? "در حال بررسی..." : "Scanning..."}</div>
              ) : anomalies.items.length === 0 ? (
                <div className="text-[var(--erp-muted)] rounded-2xl bg-[var(--erp-panel-solid)] p-4 flex items-center gap-2">
                  <CheckCircle2 size={18} /> {fa ? "ناهنجاری‌ای شناسایی نشد." : "No anomalies detected."}
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                  {anomalies.items.map((item, index) => (
                    <AnomalyRow key={index} item={item} fa={fa} />
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <DataPanel title={fa ? "مشتریان ارزشمند" : "Top customers"} icon={<UsersRound />} items={topCustomers} money={money} n={n} type="customer" fa={fa} />
            <DataPanel title={fa ? "مشتریان پرریسک" : "Risky customers"} icon={<AlertTriangle />} items={riskyCustomers} money={money} n={n} type="risk" fa={fa} />
            <DataPanel title={fa ? "کالاهای کم‌موجود" : "Low stock products"} icon={<PackageSearch />} items={lowStock} money={money} n={n} type="stock" fa={fa} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
            <DataPanel title={fa ? "کالاهای راکد" : "Dead stock"} icon={<PackageSearch />} items={deadStock} money={money} n={n} type="dead" fa={fa} />
            <DataPanel title={fa ? "فاکتورهای باز مهم" : "Important open invoices"} icon={<Wallet />} items={openInvoices} money={money} n={n} type="invoice" fa={fa} />
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ title, value, icon, color }) {
  return (
    <div className="rounded-[1.5rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5">
      <div className="flex items-center gap-2 text-[var(--erp-muted)] text-sm font-bold mb-3">
        <span style={{ color }}>{icon}</span>
        {title}
      </div>
      <div className="text-2xl font-black" style={{ color }}>{value}</div>
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5">
      <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-4">{icon}{title}</h2>
      {children}
    </div>
  );
}

function AlertRow({ item }) {
  const color = item.level === "danger" ? "rose" : item.level === "warning" ? "amber" : item.level === "success" ? "emerald" : "cyan";
  const cls = {
    rose: "bg-rose-500/10 border-rose-400/20 text-rose-200",
    amber: "bg-amber-500/10 border-amber-400/20 text-amber-200",
    emerald: "bg-emerald-500/10 border-emerald-400/20 text-emerald-200",
    cyan: "bg-[var(--erp-glow)] border-[var(--erp-border)] text-[var(--erp-accent)]",
  }[color];
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="font-black">{item.title}</div>
      <div className="text-sm mt-2 leading-7 text-slate-200">{item.message}</div>
      <div className="text-xs mt-3 font-bold">{item.action}</div>
    </div>
  );
}

const ANOMALY_TYPE_LABELS = {
  unusual_invoice_amount: { fa: "مبلغ غیرعادی فاکتور", en: "Unusual invoice amount" },
  duplicate_payment: { fa: "پرداخت تکراری احتمالی", en: "Possible duplicate payment" },
  off_hours_activity: { fa: "فعالیت در ساعت غیرمعمول", en: "Off-hours activity" },
};

function AnomalyRow({ item, fa }) {
  const cls = {
    high: "bg-rose-500/10 border-rose-400/20 text-rose-200",
    medium: "bg-amber-500/10 border-amber-400/20 text-amber-200",
    low: "bg-cyan-500/10 border-cyan-400/20 text-cyan-200",
  }[item.severity] || "bg-slate-800/70 border-white/5 text-slate-200";
  const label = ANOMALY_TYPE_LABELS[item.type];
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="font-black">{label ? (fa ? label.fa : label.en) : item.type}</div>
      <div className="text-sm mt-2 leading-7 text-slate-200">{item.message}</div>
    </div>
  );
}

function DataPanel({ title, icon, items, money, n, type, fa }) {
  return (
    <Panel title={title} icon={icon}>
      <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
        {items.length === 0 ? (
          <div className="text-slate-400 rounded-2xl bg-slate-800/60 p-4 flex items-center gap-2">
            <CheckCircle2 size={18} /> {fa ? "موردی برای نمایش وجود ندارد." : "Nothing to show."}
          </div>
        ) : items.map((item, index) => (
          <div key={index} className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-[var(--erp-text)]">{item.name || item.customer_name || `#${item.invoice_id || item.id}`}</div>
                <div className="text-[var(--erp-muted)] text-xs mt-1">
                  {type === "customer" && `${fa ? "فروش: " : "Sales: "}${money(item.sales_amount || 0)} • ${fa ? "فاکتور: " : "Invoices: "}${n(item.invoice_count || 0)}`}
                  {type === "risk" && `${fa ? "مانده: " : "Balance: "}${money(item.balance || 0)} • ${fa ? "امتیاز: " : "Score: "}${n(item.score || 0)}`}
                  {type === "stock" && `${fa ? "موجودی: " : "Stock: "}${n(item.stock || 0)} • ${fa ? "حداقل: " : "Min: "}${n(item.min_stock || 0)}`}
                  {type === "dead" && `${fa ? "موجودی: " : "Stock: "}${n(item.stock || 0)} • ${fa ? "ارزش: " : "Value: "}${money(item.stock_value || 0)}`}
                  {type === "invoice" && `${fa ? "باقی‌مانده: " : "Remaining: "}${money(item.remaining_amount || 0)} • ${fa ? "سن: " : "Age: "}${n(item.age_days || 0)} ${fa ? "روز" : "days"}`}
                </div>
              </div>
              <span className="text-[var(--erp-accent)] font-black">#{n(index + 1)}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
