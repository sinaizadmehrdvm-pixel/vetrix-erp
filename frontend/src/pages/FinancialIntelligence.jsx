import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Brain,
  Calculator,
  CircleDollarSign,
  LineChart,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getFinancialIntelligenceOverview, simulateFinancialScenario } from "../services/api";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";

function toNum(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

export default function FinancialIntelligence() {
  const { language, dir, money, n } = useLanguage();
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
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  const summary = data?.summary || {};
  const cashflow = data?.cashflow || {};
  const kpis = data?.kpis || {};
  const products = data?.product_profitability || [];
  const customers = data?.customer_profitability || [];
  const recommendations = data?.recommendations || [];

  const healthLabel = useMemo(() => {
    if (summary.cash_health === "danger") return language === "fa" ? "پرریسک" : language === "ar" ? "خطر" : language === "tr" ? "Tehlike" : "Danger";
    if (summary.cash_health === "warning") return language === "fa" ? "نیازمند توجه" : language === "ar" ? "يتطلب انتباهاً" : language === "tr" ? "Dikkat Gerekli" : "Warning";
    return language === "fa" ? "سالم" : language === "ar" ? "سليم" : language === "tr" ? "Sağlıklı" : "Healthy";
  }, [summary.cash_health, language]);

  if (loading) {
    return <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] p-8">{language === "fa" ? "در حال بارگذاری هوش مالی..." : language === "ar" ? "جارٍ تحميل الذكاء المالي..." : language === "tr" ? "Finansal zeka yükleniyor..." : "Loading financial intelligence..."}</div>;
  }

  return (
    <div dir={dir} className="min-h-screen p-7 text-[var(--erp-text)] bg-gradient-to-br from-[var(--erp-bg)] via-[var(--erp-panel-solid)] to-[var(--erp-bg-soft)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)] flex items-center gap-3">
            <Brain /> {language === "fa" ? "هوش مالی مدیریتی" : language === "ar" ? "الذكاء المالي" : language === "tr" ? "Finansal Zeka" : "Financial Intelligence"}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {language === "fa" ? "پیش‌بینی جریان نقدی، سود واقعی، KPI مدیرعامل و شبیه‌ساز مالی" : language === "ar" ? "توقع التدفق النقدي، الربحية الفعلية، مؤشرات أداء الرئيس التنفيذي، ومحاكي مالي" : language === "tr" ? "Nakit akışı tahmini, gerçek kârlılık, CEO KPI'ları ve finansal simülatör" : "Cashflow forecast, profitability, CEO KPIs and financial simulator"}
          </p>
        </div>
        <button onClick={load} className="px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2">
          <RefreshCw size={18} /> {language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>

      {error && <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200 font-bold">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard title={language === "fa" ? "فروش کل" : language === "ar" ? "إجمالي المبيعات" : language === "tr" ? "Toplam Satış" : "Total Sales"} value={money(summary.total_sales)} icon={<CircleDollarSign />} tone="cyan" />
        <KpiCard title={language === "fa" ? "سود خالص" : language === "ar" ? "صافي الربح" : language === "tr" ? "Net Kâr" : "Net Profit"} value={money(summary.net_profit)} icon={toNum(summary.net_profit) >= 0 ? <TrendingUp /> : <TrendingDown />} tone={toNum(summary.net_profit) >= 0 ? "emerald" : "red"} />
        <KpiCard title={language === "fa" ? "حاشیه سود خالص" : language === "ar" ? "هامش الربح الصافي" : language === "tr" ? "Net Kâr Marjı" : "Net Margin"} value={`${n(summary.net_margin_percent || 0)}٪`} icon={<BarChart3 />} tone="violet" />
        <KpiCard title={language === "fa" ? "وضعیت نقدینگی" : language === "ar" ? "سلامة السيولة" : language === "tr" ? "Nakit Sağlığı" : "Cash Health"} value={healthLabel} icon={<Wallet />} tone={summary.cash_health === "danger" ? "red" : summary.cash_health === "warning" ? "amber" : "emerald"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_.9fr] gap-5 mb-6">
        <Panel title={language === "fa" ? "پیش‌بینی جریان نقدی" : language === "ar" ? "توقع التدفق النقدي" : language === "tr" ? "Nakit Akışı Tahmini" : "Cash Flow Forecast"} icon={<Banknote />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(cashflow.periods || []).map((p) => (
              <div key={p.days} className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
                <div className="text-[var(--erp-accent)] font-black">{n(p.days)} {language === "fa" ? "روز آینده" : language === "ar" ? "أيام قادمة" : language === "tr" ? "gün sonra" : "days"}</div>
                <div className="mt-3 text-sm text-[var(--erp-muted)] space-y-2">
                  <Row label={language === "fa" ? "ورودی" : language === "ar" ? "التدفق الداخل" : language === "tr" ? "Giriş" : "Inflow"} value={money(p.expected_inflow)} />
                  <Row label={language === "fa" ? "خروجی" : language === "ar" ? "التدفق الخارج" : language === "tr" ? "Çıkış" : "Outflow"} value={money(p.expected_outflow)} />
                  <Row label={language === "fa" ? "مانده" : language === "ar" ? "الصافي" : language === "tr" ? "Net" : "Net"} value={money(p.net_cashflow)} strong />
                </div>
                <div className={`mt-3 text-xs font-black ${p.risk === "shortage" ? "text-red-300" : p.risk === "stable" ? "text-amber-300" : "text-emerald-300"}`}>
                  {p.risk === "shortage" ? (language === "fa" ? "ریسک کسری" : language === "ar" ? "خطر عجز نقدي" : language === "tr" ? "Nakit Açığı Riski" : "Shortage risk") : p.risk === "stable" ? (language === "fa" ? "پایدار" : language === "ar" ? "مستقر" : language === "tr" ? "Stabil" : "Stable") : language === "fa" ? "سالم" : language === "ar" ? "سليم" : language === "tr" ? "Sağlıklı" : "Healthy"}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={language === "fa" ? "KPI مدیرعامل" : language === "ar" ? "مؤشرات أداء الرئيس التنفيذي" : language === "tr" ? "CEO KPI'ları" : "CEO KPIs"} icon={<Activity />}>
          <div className="space-y-3">
            <Row label="ROI" value={`${n(kpis.roi_percent || 0)}٪`} strong />
            <Row label={language === "fa" ? "سرمایه در گردش" : language === "ar" ? "رأس المال العامل" : language === "tr" ? "İşletme Sermayesi" : "Working Capital"} value={money(kpis.working_capital)} strong />
            <Row label={language === "fa" ? "نسبت نقدینگی" : language === "ar" ? "نسبة السيولة النقدية" : language === "tr" ? "Nakit Oranı" : "Cash Ratio"} value={n(kpis.cash_ratio || 0)} />
            <Row label={language === "fa" ? "بهترین مشتری" : language === "ar" ? "أفضل عميل" : language === "tr" ? "En İyi Müşteri" : "Top Customer"} value={kpis.top_customer || "-"} />
            <Row label={language === "fa" ? "بهترین کالا" : language === "ar" ? "أفضل منتج" : language === "tr" ? "En İyi Ürün" : "Top Product"} value={kpis.top_product || "-"} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
        <Panel title={language === "fa" ? "سود واقعی کالاها" : language === "ar" ? "ربحية المنتجات" : language === "tr" ? "Ürün Kârlılığı" : "Product Profitability"} icon={<LineChart />}>
          <Table
            headers={language === "fa" ? ["کالا", "فروش", "سود", "حاشیه"] : language === "ar" ? ["المنتج", "المبيعات", "الربح", "الهامش"] : language === "tr" ? ["Ürün", "Satış", "Kâr", "Marj"] : ["Product", "Revenue", "Profit", "Margin"]}
            rows={products.slice(0, 8).map((p) => [p.name, money(p.revenue), money(p.profit), `${n(p.margin_percent || 0)}٪`])}
            empty={language === "fa" ? "داده‌ای برای تحلیل کالا وجود ندارد." : language === "ar" ? "لا توجد بيانات لتحليل المنتجات." : language === "tr" ? "Ürün analizi için veri yok." : "No product data."}
          />
        </Panel>

        <Panel title={language === "fa" ? "سوددهی مشتریان" : language === "ar" ? "ربحية العملاء" : language === "tr" ? "Müşteri Kârlılığı" : "Customer Profitability"} icon={<Users />}>
          <Table
            headers={language === "fa" ? ["مشتری", "فروش", "بدهی", "وضعیت"] : language === "ar" ? ["العميل", "المبيعات", "الرصيد المفتوح", "المخاطر"] : language === "tr" ? ["Müşteri", "Satış", "Açık Bakiye", "Risk"] : ["Customer", "Sales", "Open", "Risk"]}
            rows={customers.slice(0, 8).map((c) => [c.name, money(c.sales), money(c.open_amount), riskLabel(c.risk_level, language)])}
            empty={language === "fa" ? "داده‌ای برای تحلیل مشتری وجود ندارد." : language === "ar" ? "لا توجد بيانات لتحليل العملاء." : language === "tr" ? "Müşteri analizi için veri yok." : "No customer data."}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[.9fr_1.1fr] gap-5 mb-6">
        <Panel title={language === "fa" ? "شبیه‌ساز مالی" : language === "ar" ? "المحاكي المالي" : language === "tr" ? "Finansal Simülatör" : "Financial Simulator"} icon={<Calculator />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SimInput label={language === "fa" ? "رشد فروش ٪" : language === "ar" ? "نمو المبيعات %" : language === "tr" ? "Satış Büyümesi %" : "Sales growth %"} value={scenario.sales_growth_percent} onChange={(v) => setScenario({ ...scenario, sales_growth_percent: Number(v) })} />
            <SimInput label={language === "fa" ? "تغییر قیمت خرید ٪" : language === "ar" ? "تغير تكلفة الشراء %" : language === "tr" ? "Alış Maliyeti Değişimi %" : "Purchase cost %"} value={scenario.purchase_cost_change_percent} onChange={(v) => setScenario({ ...scenario, purchase_cost_change_percent: Number(v) })} />
            <SimInput label={language === "fa" ? "تغییر قیمت فروش ٪" : language === "ar" ? "تغير سعر البيع %" : language === "tr" ? "Satış Fiyatı Değişimi %" : "Selling price %"} value={scenario.selling_price_change_percent} onChange={(v) => setScenario({ ...scenario, selling_price_change_percent: Number(v) })} />
            <SimInput label={language === "fa" ? "تغییر هزینه‌ها ٪" : language === "ar" ? "تغير المصروفات %" : language === "tr" ? "Gider Değişimi %" : "Expense change %"} value={scenario.expense_change_percent} onChange={(v) => setScenario({ ...scenario, expense_change_percent: Number(v) })} />
            <SimInput label={language === "fa" ? "بهبود وصول مطالبات ٪" : language === "ar" ? "تحسين التحصيل %" : language === "tr" ? "Tahsilat İyileştirme %" : "Collection improvement %"} value={scenario.collection_improvement_percent} onChange={(v) => setScenario({ ...scenario, collection_improvement_percent: Number(v) })} />
          </div>
          <button onClick={runSimulation} className="mt-4 w-full rounded-2xl bg-emerald-400 text-slate-950 font-black py-3">
            {language === "fa" ? "اجرای سناریو" : language === "ar" ? "تشغيل السيناريو" : language === "tr" ? "Senaryoyu Çalıştır" : "Run Scenario"}
          </button>
          {simulation && (
            <div className="mt-4 rounded-3xl bg-[var(--erp-panel-solid)] border border-emerald-400/20 p-4 space-y-2">
              <Row label={language === "fa" ? "سود خالص شبیه‌سازی" : language === "ar" ? "صافي الربح المحاكى" : language === "tr" ? "Simüle Net Kâr" : "Simulated net profit"} value={money(simulation.result.simulated_net_profit)} strong />
              <Row label={language === "fa" ? "تغییر سود" : language === "ar" ? "فرق الربح" : language === "tr" ? "Kâr Farkı" : "Profit delta"} value={money(simulation.result.profit_delta)} strong />
              <div className={simulation.result.status === "better" ? "text-emerald-300 font-black" : simulation.result.status === "worse" ? "text-red-300 font-black" : "text-[var(--erp-muted)] font-black"}>
                {simulation.result.status === "better" ? (language === "fa" ? "سناریو سودده‌تر است" : language === "ar" ? "سيناريو أفضل" : language === "tr" ? "Daha İyi Senaryo" : "Better scenario") : simulation.result.status === "worse" ? (language === "fa" ? "سناریو ریسک دارد" : language === "ar" ? "سيناريو محفوف بالمخاطر" : language === "tr" ? "Riskli Senaryo" : "Risky scenario") : language === "fa" ? "بدون تغییر مهم" : language === "ar" ? "محايد" : language === "tr" ? "Nötr" : "Neutral"}
              </div>
            </div>
          )}
        </Panel>

        <Panel title={language === "fa" ? "پیشنهادهای هوشمند مالی" : language === "ar" ? "توصيات الذكاء الاصطناعي المالية" : language === "tr" ? "Yapay Zeka Mali Önerileri" : "AI Financial Recommendations"} icon={<Brain />}>
          <div className="space-y-3">
            {recommendations.map((r, i) => (
              <div key={i} className={`rounded-3xl p-4 border ${r.level === "danger" ? "bg-red-500/10 border-red-400/20" : r.level === "warning" ? "bg-amber-500/10 border-amber-400/20" : "bg-emerald-500/10 border-emerald-400/20"}`}>
                <div className="flex items-center gap-2 font-black text-[var(--erp-text)]">
                  {r.level === "danger" || r.level === "warning" ? <AlertTriangle size={18} /> : <TrendingUp size={18} />}
                  {r.title}
                </div>
                <p className="text-[var(--erp-muted)] mt-2 text-sm">{r.message}</p>
                <div className="text-[var(--erp-accent)] mt-2 text-xs font-bold">{r.action}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function riskLabel(risk, language) {
  if (risk === "high") return language === "fa" ? "پرریسک" : language === "ar" ? "مرتفع" : language === "tr" ? "Yüksek" : "High";
  if (risk === "medium") return language === "fa" ? "متوسط" : language === "ar" ? "متوسط" : language === "tr" ? "Orta" : "Medium";
  return language === "fa" ? "امن" : language === "ar" ? "آمن" : language === "tr" ? "Güvenli" : "Safe";
}

function Panel({ title, icon, children }) {
  return (
    <div className="rounded-[28px] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5 shadow-2xl">
      <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-4">{icon}{title}</h2>
      {children}
    </div>
  );
}

function KpiCard({ title, value, icon, tone }) {
  const tones = {
    cyan: "border-[var(--erp-border)] bg-[var(--erp-glow)] text-[var(--erp-accent)]",
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
      <div className="mt-4 text-2xl font-black text-[var(--erp-text)]">{value}</div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-border)] pb-2">
      <span className="text-[var(--erp-muted)]">{label}</span>
      <b className={strong ? "text-[var(--erp-accent)]" : "text-[var(--erp-text)]"}>{value}</b>
    </div>
  );
}

function SimInput({ label, value, onChange }) {
  const { language } = useLanguage();
  return (
    <label className="block">
      <span className="text-[var(--erp-accent)] text-sm font-bold">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={language === "fa" ? toPersianDigits(value) : value}
        onChange={(e) => onChange(cleanNumberInput(e.target.value))}
        className="mt-2 w-full rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-3 text-[var(--erp-text)] outline-none"
      />
    </label>
  );
}

function Table({ headers, rows, empty }) {
  return (
    <div className="overflow-auto rounded-2xl border border-[var(--erp-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]">
          <tr>{headers.map((h) => <th key={h} className="p-3 text-start">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--erp-border)] hover:bg-white/5">
              {row.map((cell, j) => <td key={j} className="p-3 text-[var(--erp-text)]">{cell}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={headers.length} className="p-6 text-center text-[var(--erp-muted)]">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
