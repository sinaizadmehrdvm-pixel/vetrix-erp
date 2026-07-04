import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Calculator,
  Cash,
  CircleDollarSign,
  LineChart,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getFinancialIntelligenceOverview, simulateFinancialScenario } from "../services/api";
import { useLanguage } from "../localization/LanguageContext";

function toNum(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

export default function FinancialIntelligence() {
  const { language, dir, money, n } = useLanguage();
  const fa = language === "fa";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState({
    sales_growth_percent: 10,
    purchase_cost_change_percent: 0,
    selling_price_change_percent: 0,
    expense_change_percent: 0,
    collection_improvement_percent: 0,
  });
  const [simulation, setSimulation] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await getFinancialIntelligenceOverview();
      setData(res);
    } catch (err) {
      setError(err?.message || "Financial Intelligence error");
    } finally {
      setLoading(false);
    }
  }

  async function runSimulation() {
    try {
      const res = await simulateFinancialScenario(scenario);
      setSimulation(res);
    } catch (err) {
      setError(err?.message || "Simulation error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = data?.summary || {};
  const cashflow = data?.cashflow || {};
  const kpis = data?.kpis || {};
  const products = data?.product_profitability || [];
  const customers = data?.customer_profitability || [];
  const recommendations = data?.recommendations || [];
  const forecast = data?.sales_forecast || [];

  const healthLabel = useMemo(() => {
    if (summary.cash_health === "danger") return fa ? "پرریسک" : "Danger";
    if (summary.cash_health === "warning") return fa ? "نیازمند توجه" : "Warning";
    return fa ? "سالم" : "Healthy";
  }, [summary.cash_health, fa]);

  if (loading) {
    return <div dir={dir} className="min-h-screen bg-slate-950 text-white p-8">{fa ? "در حال بارگذاری هوش مالی..." : "Loading financial intelligence..."}</div>;
  }

  return (
    <div dir={dir} className="min-h-screen p-7 text-white bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-4xl font-black text-cyan-300 flex items-center gap-3">
            <Brain /> {fa ? "هوش مالی مدیریتی" : "Financial Intelligence"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa ? "پیش‌بینی جریان نقدی، سود واقعی، KPI مدیرعامل و شبیه‌ساز مالی" : "Cashflow forecast, profitability, CEO KPIs and financial simulator"}
          </p>
        </div>
        <button onClick={load} className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2">
          <RefreshCw size={18} /> {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      {error && <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200 font-bold">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard title={fa ? "فروش کل" : "Total Sales"} value={money(summary.total_sales)} icon={<CircleDollarSign />} tone="cyan" />
        <KpiCard title={fa ? "سود خالص" : "Net Profit"} value={money(summary.net_profit)} icon={toNum(summary.net_profit) >= 0 ? <TrendingUp /> : <TrendingDown />} tone={toNum(summary.net_profit) >= 0 ? "emerald" : "red"} />
        <KpiCard title={fa ? "حاشیه سود خالص" : "Net Margin"} value={`${n(summary.net_margin_percent || 0)}٪`} icon={<BarChart3 />} tone="violet" />
        <KpiCard title={fa ? "وضعیت نقدینگی" : "Cash Health"} value={healthLabel} icon={<Wallet />} tone={summary.cash_health === "danger" ? "red" : summary.cash_health === "warning" ? "amber" : "emerald"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_.9fr] gap-5 mb-6">
        <Panel title={fa ? "پیش‌بینی جریان نقدی" : "Cash Flow Forecast"} icon={<Cash />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(cashflow.periods || []).map((p) => (
              <div key={p.days} className="rounded-3xl bg-slate-800/70 border border-cyan-400/10 p-4">
                <div className="text-cyan-200 font-black">{n(p.days)} {fa ? "روز آینده" : "days"}</div>
                <div className="mt-3 text-sm text-slate-300 space-y-2">
                  <Row label={fa ? "ورودی" : "Inflow"} value={money(p.expected_inflow)} />
                  <Row label={fa ? "خروجی" : "Outflow"} value={money(p.expected_outflow)} />
                  <Row label={fa ? "مانده" : "Net"} value={money(p.net_cashflow)} strong />
                </div>
                <div className={`mt-3 text-xs font-black ${p.risk === "shortage" ? "text-red-300" : p.risk === "stable" ? "text-amber-300" : "text-emerald-300"}`}>
                  {p.risk === "shortage" ? (fa ? "ریسک کسری" : "Shortage risk") : p.risk === "stable" ? (fa ? "پایدار" : "Stable") : fa ? "سالم" : "Healthy"}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={fa ? "KPI مدیرعامل" : "CEO KPIs"} icon={<Activity />}>
          <div className="space-y-3">
            <Row label="ROI" value={`${n(kpis.roi_percent || 0)}٪`} strong />
            <Row label={fa ? "سرمایه در گردش" : "Working Capital"} value={money(kpis.working_capital)} strong />
            <Row label={fa ? "نسبت نقدینگی" : "Cash Ratio"} value={n(kpis.cash_ratio || 0)} />
            <Row label={fa ? "بهترین مشتری" : "Top Customer"} value={kpis.top_customer || "-"} />
            <Row label={fa ? "بهترین کالا" : "Top Product"} value={kpis.top_product || "-"} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
        <Panel title={fa ? "سود واقعی کالاها" : "Product Profitability"} icon={<LineChart />}>
          <Table
            headers={fa ? ["کالا", "فروش", "سود", "حاشیه"] : ["Product", "Revenue", "Profit", "Margin"]}
            rows={products.slice(0, 8).map((p) => [p.name, money(p.revenue), money(p.profit), `${n(p.margin_percent || 0)}٪`])}
            empty={fa ? "داده‌ای برای تحلیل کالا وجود ندارد." : "No product data."}
          />
        </Panel>

        <Panel title={fa ? "سوددهی مشتریان" : "Customer Profitability"} icon={<Users />}>
          <Table
            headers={fa ? ["مشتری", "فروش", "بدهی", "وضعیت"] : ["Customer", "Sales", "Open", "Risk"]}
            rows={customers.slice(0, 8).map((c) => [c.name, money(c.sales), money(c.open_amount), riskLabel(c.risk_level, fa)])}
            empty={fa ? "داده‌ای برای تحلیل مشتری وجود ندارد." : "No customer data."}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[.9fr_1.1fr] gap-5 mb-6">
        <Panel title={fa ? "شبیه‌ساز مالی" : "Financial Simulator"} icon={<Calculator />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SimInput label={fa ? "رشد فروش ٪" : "Sales growth %"} value={scenario.sales_growth_percent} onChange={(v) => setScenario({ ...scenario, sales_growth_percent: Number(v) })} />
            <SimInput label={fa ? "تغییر قیمت خرید ٪" : "Purchase cost %"} value={scenario.purchase_cost_change_percent} onChange={(v) => setScenario({ ...scenario, purchase_cost_change_percent: Number(v) })} />
            <SimInput label={fa ? "تغییر قیمت فروش ٪" : "Selling price %"} value={scenario.selling_price_change_percent} onChange={(v) => setScenario({ ...scenario, selling_price_change_percent: Number(v) })} />
            <SimInput label={fa ? "تغییر هزینه‌ها ٪" : "Expense change %"} value={scenario.expense_change_percent} onChange={(v) => setScenario({ ...scenario, expense_change_percent: Number(v) })} />
          </div>
          <button onClick={runSimulation} className="mt-4 w-full rounded-2xl bg-emerald-400 text-slate-950 font-black py-3">
            {fa ? "اجرای سناریو" : "Run Scenario"}
          </button>
          {simulation && (
            <div className="mt-4 rounded-3xl bg-slate-800/80 border border-emerald-400/20 p-4 space-y-2">
              <Row label={fa ? "سود خالص شبیه‌سازی" : "Simulated net profit"} value={money(simulation.result.simulated_net_profit)} strong />
              <Row label={fa ? "تغییر سود" : "Profit delta"} value={money(simulation.result.profit_delta)} strong />
              <div className={simulation.result.status === "better" ? "text-emerald-300 font-black" : simulation.result.status === "worse" ? "text-red-300 font-black" : "text-slate-300 font-black"}>
                {simulation.result.status === "better" ? (fa ? "سناریو سودده‌تر است" : "Better scenario") : simulation.result.status === "worse" ? (fa ? "سناریو ریسک دارد" : "Risky scenario") : fa ? "بدون تغییر مهم" : "Neutral"}
              </div>
            </div>
          )}
        </Panel>

        <Panel title={fa ? "پیشنهادهای هوشمند مالی" : "AI Financial Recommendations"} icon={<Brain />}>
          <div className="space-y-3">
            {recommendations.map((r, i) => (
              <div key={i} className={`rounded-3xl p-4 border ${r.level === "danger" ? "bg-red-500/10 border-red-400/20" : r.level === "warning" ? "bg-amber-500/10 border-amber-400/20" : "bg-emerald-500/10 border-emerald-400/20"}`}>
                <div className="flex items-center gap-2 font-black text-white">
                  {r.level === "danger" || r.level === "warning" ? <AlertTriangle size={18} /> : <TrendingUp size={18} />}
                  {r.title}
                </div>
                <p className="text-slate-300 mt-2 text-sm">{r.message}</p>
                <div className="text-cyan-200 mt-2 text-xs font-bold">{r.action}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function riskLabel(risk, fa) {
  if (risk === "high") return fa ? "پرریسک" : "High";
  if (risk === "medium") return fa ? "متوسط" : "Medium";
  return fa ? "امن" : "Safe";
}

function Panel({ title, icon, children }) {
  return (
    <div className="rounded-[28px] bg-slate-900/70 border border-cyan-500/20 p-5 shadow-2xl">
      <h2 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-4">{icon}{title}</h2>
      {children}
    </div>
  );
}

function KpiCard({ title, value, icon, tone }) {
  const tones = {
    cyan: "border-cyan-400/25 bg-cyan-500/10 text-cyan-200",
    emerald: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    red: "border-red-400/25 bg-red-500/10 text-red-200",
    amber: "border-amber-400/25 bg-amber-500/10 text-amber-200",
    violet: "border-violet-400/25 bg-violet-500/10 text-violet-200",
  };
  return (
    <div className={`rounded-[28px] border p-5 ${tones[tone] || tones.cyan}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold opacity-90">{title}</div>
        {icon}
      </div>
      <div className="mt-4 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
      <span className="text-slate-400">{label}</span>
      <b className={strong ? "text-cyan-200" : "text-white"}>{value}</b>
    </div>
  );
}

function SimInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-cyan-200 text-sm font-bold">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-2xl bg-slate-800 border border-cyan-400/20 p-3 text-white outline-none" />
    </label>
  );
}

function Table({ headers, rows, empty }) {
  return (
    <div className="overflow-auto rounded-2xl border border-cyan-400/10">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-cyan-100">
          <tr>{headers.map((h) => <th key={h} className="p-3 text-right">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, i) => (
            <tr key={i} className="border-t border-white/10 hover:bg-white/5">
              {row.map((cell, j) => <td key={j} className="p-3 text-slate-200">{cell}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={headers.length} className="p-6 text-center text-slate-400">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
