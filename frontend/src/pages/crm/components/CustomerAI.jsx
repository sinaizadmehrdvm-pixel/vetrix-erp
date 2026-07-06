import {
  AlertTriangle,
  Brain,
  CalendarClock,
  CheckCircle2,
  Crown,
  Gift,
  LineChart,
  Phone,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo } from "react";

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

function riskLabel(value, fa) {
  const key = String(value || "low").toLowerCase();
  const faMap = { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" };
  const enMap = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
  return (fa ? faMap : enMap)[key] || value || "-";
}

function actionLabel(action, fa) {
  const key = String(action || "").toLowerCase();
  const faMap = {
    urgent_call: "تماس فوری",
    payment_followup: "پیگیری پرداخت",
    loyalty_offer: "پیشنهاد وفاداری",
    regular_followup: "پیگیری معمول",
    cross_sell: "پیشنهاد کالای مکمل",
    vip_retention: "حفظ مشتری VIP",
  };
  const enMap = {
    urgent_call: "Urgent call",
    payment_followup: "Payment follow-up",
    loyalty_offer: "Loyalty offer",
    regular_followup: "Regular follow-up",
    cross_sell: "Cross-sell offer",
    vip_retention: "VIP retention",
  };
  return (fa ? faMap : enMap)[key] || action || "-";
}

function levelLabel(level, fa) {
  const key = String(level || "Bronze");
  const faMap = { VIP: "VIP", Platinum: "پلاتینیوم", Gold: "طلایی", Silver: "نقره‌ای", Bronze: "برنزی" };
  const enMap = { VIP: "VIP", Platinum: "Platinum", Gold: "Gold", Silver: "Silver", Bronze: "Bronze" };
  return (fa ? faMap : enMap)[key] || key;
}

function getDaysSince(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

function normalizeInvoices(invoices) {
  return (Array.isArray(invoices) ? invoices : []).map((inv) => ({
    id: inv.id,
    invoice_type: inv.invoice_type || inv.type || "sale",
    total_amount: toNumber(inv.total_amount ?? inv.total ?? 0),
    payment_status: inv.payment_status || inv.status || "unpaid",
    created_at: inv.created_at || inv.date || "",
  }));
}

function buildRfmScore(invoices, summary) {
  const sales = normalizeInvoices(invoices).filter((x) => x.invoice_type === "sale");
  const lastSale = sales.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
  const recencyDays = getDaysSince(lastSale?.created_at);
  const frequency = sales.length;
  const monetary = toNumber(summary?.lifetime_value || summary?.total_sales || sales.reduce((s, x) => s + x.total_amount, 0));

  const recencyScore = recencyDays == null ? 20 : recencyDays <= 15 ? 100 : recencyDays <= 45 ? 80 : recencyDays <= 90 ? 55 : recencyDays <= 180 ? 35 : 15;
  const frequencyScore = frequency >= 20 ? 100 : frequency >= 10 ? 80 : frequency >= 5 ? 60 : frequency >= 2 ? 40 : frequency === 1 ? 25 : 10;
  const monetaryScore = monetary >= 500000000 ? 100 : monetary >= 200000000 ? 85 : monetary >= 80000000 ? 65 : monetary >= 25000000 ? 45 : monetary > 0 ? 25 : 10;
  const total = Math.round(recencyScore * 0.35 + frequencyScore * 0.3 + monetaryScore * 0.35);

  return { recencyDays, frequency, monetary, recencyScore, frequencyScore, monetaryScore, total };
}

function buildSmartAnalysis({ customer, summary, invoices, ai }) {
  const rfm = buildRfmScore(invoices, summary);
  const balance = toNumber(summary?.balance ?? customer?.balance ?? 0);
  const debt = balance > 0 ? balance : 0;
  const creditLimit = toNumber(customer?.credit_limit || summary?.credit_limit || 0);
  const creditUsage = creditLimit > 0 ? clamp((debt / creditLimit) * 100) : 0;
  const loyalty = summary?.loyalty || customer?.loyalty || {};
  const loyaltyLevel = loyalty.level || "Bronze";
  const baseScore = toNumber(ai?.score ?? customer?.score ?? customer?.crm_score ?? rfm.total);

  const paymentRisk =
    creditLimit > 0 && debt > creditLimit
      ? 90
      : debt > 0 && creditUsage > 80
      ? 75
      : debt > 0 && creditUsage > 50
      ? 55
      : debt > 0
      ? 35
      : 10;

  const churnRisk =
    ai?.churn_risk != null
      ? toNumber(ai.churn_risk)
      : rfm.recencyDays == null
      ? 55
      : rfm.recencyDays > 180
      ? 85
      : rfm.recencyDays > 90
      ? 65
      : rfm.recencyDays > 45
      ? 40
      : 18;

  const purchaseProbability =
    ai?.purchase_probability != null
      ? toNumber(ai.purchase_probability)
      : clamp(rfm.total + (["VIP", "Platinum", "Gold"].includes(loyaltyLevel) ? 10 : 0) - (debt > 0 ? 8 : 0));

  const healthScore = clamp(Math.round(baseScore * 0.5 + rfm.total * 0.35 + (100 - paymentRisk) * 0.15));

  const riskLevel =
    paymentRisk >= 85 || churnRisk >= 80
      ? "critical"
      : paymentRisk >= 65 || churnRisk >= 60
      ? "high"
      : paymentRisk >= 35 || churnRisk >= 40
      ? "medium"
      : "low";

  const nextAction =
    paymentRisk >= 65
      ? "payment_followup"
      : churnRisk >= 60
      ? "urgent_call"
      : ["VIP", "Platinum"].includes(loyaltyLevel)
      ? "vip_retention"
      : purchaseProbability >= 70
      ? "cross_sell"
      : "regular_followup";

  return {
    rfm,
    balance,
    debt,
    creditLimit,
    creditUsage,
    loyalty,
    loyaltyLevel,
    healthScore,
    paymentRisk: clamp(paymentRisk),
    churnRisk: clamp(churnRisk),
    purchaseProbability: clamp(purchaseProbability),
    riskLevel,
    nextAction,
    suggestedDiscount: toNumber(ai?.suggested_discount ?? loyalty.discount_percent ?? 0),
    bestContactTime: ai?.best_contact_time || "10:00 - 12:00",
  };
}

function suggestionList(analysis, fa) {
  const list = [];

  if (analysis.paymentRisk >= 65) {
    list.push({
      icon: <Wallet size={18} />,
      title: fa ? "پیگیری فوری وصول مطالبات" : "Urgent receivable follow-up",
      text: fa ? "مانده بدهی مشتری بالاست. امروز تماس بگیر و برنامه پرداخت مشخص کن." : "Customer debt risk is high. Call today and agree on a payment plan.",
      tone: "rose",
    });
  }

  if (analysis.churnRisk >= 60) {
    list.push({
      icon: <TrendingDown size={18} />,
      title: fa ? "ریسک ریزش مشتری" : "Churn risk",
      text: fa ? "فاصله از آخرین خرید زیاد شده است. پیشنهاد ویژه یا تماس پیگیری می‌تواند مشتری را فعال کند." : "It has been a while since the last purchase. A follow-up call or offer may reactivate the customer.",
      tone: "amber",
    });
  }

  if (analysis.purchaseProbability >= 70) {
    list.push({
      icon: <Gift size={18} />,
      title: fa ? "فرصت فروش مکمل" : "Cross-sell opportunity",
      text: fa ? "احتمال خرید مجدد خوب است. کالاهای مکمل یا خدمات پس از فروش را پیشنهاد کن." : "Purchase probability is strong. Offer complementary products or after-sales service.",
      tone: "cyan",
    });
  }

  if (["VIP", "Platinum", "Gold"].includes(analysis.loyaltyLevel)) {
    list.push({
      icon: <Crown size={18} />,
      title: fa ? "مشتری ارزشمند" : "Valuable customer",
      text: fa ? `سطح مشتری ${analysis.loyaltyLevel} است. مراقبت اختصاصی و پیگیری منظم پیشنهاد می‌شود.` : `Customer level is ${analysis.loyaltyLevel}. Use dedicated care and regular follow-up.`,
      tone: "emerald",
    });
  }

  if (analysis.suggestedDiscount > 0) {
    list.push({
      icon: <Sparkles size={18} />,
      title: fa ? "تخفیف پیشنهادی" : "Suggested discount",
      text: fa ? `برای این مشتری تخفیف پیشنهادی ${analysis.suggestedDiscount}% است.` : `Suggested discount for this customer is ${analysis.suggestedDiscount}%.`,
      tone: "cyan",
    });
  }

  if (!list.length) {
    list.push({
      icon: <CheckCircle2 size={18} />,
      title: fa ? "وضعیت پایدار" : "Stable status",
      text: fa ? "مشتری در وضعیت پایدار قرار دارد. پیگیری معمول کافی است." : "Customer status is stable. Regular follow-up is enough.",
      tone: "emerald",
    });
  }

  return list;
}

export default function CustomerAI({
  customer,
  summary = {},
  invoices = [],
  ai = {},
  fa = true,
  money = (v) => String(v ?? 0),
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
  onCreateTask,
  onCreateInteraction,
}) {
  const analysis = useMemo(() => buildSmartAnalysis({ customer, summary, invoices, ai }), [customer, summary, invoices, ai]);
  const suggestions = useMemo(() => suggestionList(analysis, fa), [analysis, fa]);

  async function createFollowupTask() {
    if (!onCreateTask) return;
    await onCreateTask({
      title: analysis.nextAction === "payment_followup" ? (fa ? "پیگیری پرداخت مشتری" : "Payment follow-up") : analysis.nextAction === "urgent_call" ? (fa ? "تماس فوری با مشتری" : "Urgent customer call") : (fa ? "پیگیری فروش مشتری" : "Sales follow-up"),
      description: fa ? `پیشنهاد هوشمند Vetrix: ${actionLabel(analysis.nextAction, fa)}` : `Vetrix smart suggestion: ${actionLabel(analysis.nextAction, fa)}`,
      due_date: "",
      priority: analysis.riskLevel === "critical" || analysis.riskLevel === "high" ? "urgent" : "normal",
      status: "open",
    });
  }

  async function createCallInteraction() {
    if (!onCreateInteraction) return;
    await onCreateInteraction({
      interaction_type: "call",
      title: fa ? "تماس پیشنهادی هوش مصنوعی" : "AI suggested call",
      description: fa ? `بهترین زمان تماس: ${analysis.bestContactTime} - اقدام پیشنهادی: ${actionLabel(analysis.nextAction, fa)}` : `Best contact time: ${analysis.bestContactTime} - Suggested action: ${actionLabel(analysis.nextAction, fa)}`,
      result: "",
      next_followup: "",
    });
  }

  return (
    <section className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-cyan-300 flex items-center gap-2">
            <Brain />
            {fa ? "هوش فروش مشتری" : "Customer Sales Intelligence"}
          </h2>
          <p className="text-slate-400 text-sm mt-2">
            {fa ? "تحلیل رفتار خرید، ریسک ریزش، احتمال خرید مجدد، RFM و پیشنهاد اقدام بعدی" : "Purchase behavior, churn risk, purchase probability, RFM and next-best action"}
          </p>
        </div>

        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2 disabled:opacity-60">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <div className="rounded-[2rem] bg-slate-800/70 border border-white/5 p-5">
          <div className="text-center">
            <div className="text-slate-400 text-sm font-bold">{fa ? "امتیاز سلامت مشتری" : "Customer health score"}</div>
            <div className="relative w-48 h-48 mx-auto my-5 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(#22d3ee ${analysis.healthScore * 3.6}deg, rgba(51,65,85,.8) 0deg)` }}>
              <div className="w-36 h-36 rounded-full bg-slate-900 flex flex-col items-center justify-center">
                <div className="text-5xl font-black text-cyan-300">{n(analysis.healthScore)}</div>
                <div className="text-slate-500 text-xs">/100</div>
              </div>
            </div>

            <div className={`inline-flex px-4 py-2 rounded-full border font-black ${riskTone(analysis.riskLevel)}`}>
              <ShieldAlert size={17} className="mx-1" />
              {fa ? "ریسک" : "Risk"}: {riskLabel(analysis.riskLevel, fa)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <MiniKpi title={fa ? "سطح وفاداری" : "Loyalty"} value={levelLabel(analysis.loyaltyLevel, fa)} />
            <MiniKpi title={fa ? "مصرف اعتبار" : "Credit usage"} value={`${n(Math.round(analysis.creditUsage))}%`} />
            <MiniKpi title={fa ? "بهترین زمان تماس" : "Best call time"} value={analysis.bestContactTime} wide />
          </div>

          <div className="grid grid-cols-1 gap-3 mt-5">
            <button type="button" onClick={createFollowupTask} className="px-4 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center justify-center gap-2">
              <CalendarClock size={18} />
              {fa ? "ساخت وظیفه پیشنهادی" : "Create suggested task"}
            </button>
            <button type="button" onClick={createCallInteraction} className="px-4 py-3 rounded-2xl bg-slate-700 text-cyan-200 font-black flex items-center justify-center gap-2">
              <Phone size={18} />
              {fa ? "ثبت تماس پیشنهادی" : "Log suggested call"}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AiMetric icon={<Target />} title={fa ? "احتمال خرید مجدد" : "Purchase probability"} value={`${n(Math.round(analysis.purchaseProbability))}%`} progress={analysis.purchaseProbability} tone="cyan" />
            <AiMetric icon={<TrendingDown />} title={fa ? "ریسک ریزش" : "Churn risk"} value={`${n(Math.round(analysis.churnRisk))}%`} progress={analysis.churnRisk} tone={analysis.churnRisk >= 60 ? "rose" : "emerald"} />
            <AiMetric icon={<AlertTriangle />} title={fa ? "ریسک پرداخت" : "Payment risk"} value={`${n(Math.round(analysis.paymentRisk))}%`} progress={analysis.paymentRisk} tone={analysis.paymentRisk >= 60 ? "rose" : "emerald"} />
          </div>

          <div className="rounded-[2rem] bg-slate-800/70 border border-white/5 p-5">
            <h3 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-4">
              <LineChart />
              {fa ? "تحلیل RFM" : "RFM Analysis"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <RfmBox title={fa ? "تازگی خرید" : "Recency"} score={analysis.rfm.recencyScore} detail={analysis.rfm.recencyDays == null ? "-" : fa ? `${n(analysis.rfm.recencyDays)} روز` : `${analysis.rfm.recencyDays} days`} fa={fa} />
              <RfmBox title={fa ? "تکرار خرید" : "Frequency"} score={analysis.rfm.frequencyScore} detail={n(analysis.rfm.frequency)} fa={fa} />
              <RfmBox title={fa ? "ارزش خرید" : "Monetary"} score={analysis.rfm.monetaryScore} detail={money(analysis.rfm.monetary)} fa={fa} />
            </div>
          </div>

          <div className="rounded-[2rem] bg-slate-800/70 border border-white/5 p-5">
            <h3 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-4">
              <Sparkles />
              {fa ? "پیشنهادهای هوشمند Vetrix" : "Vetrix Smart Suggestions"}
            </h3>
            <div className="space-y-3">
              {suggestions.map((item, index) => <SuggestionCard key={index} item={item} />)}
            </div>
          </div>

          <div className="rounded-[2rem] bg-slate-800/70 border border-white/5 p-5">
            <h3 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-4">
              <TrendingUp />
              {fa ? "اقدام بعدی پیشنهادی" : "Next Best Action"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ActionBox icon={<Phone />} title={fa ? "اقدام پیشنهادی" : "Suggested action"} value={actionLabel(analysis.nextAction, fa)} />
              <ActionBox icon={<Gift />} title={fa ? "تخفیف پیشنهادی" : "Suggested discount"} value={`${n(analysis.suggestedDiscount)}%`} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function riskTone(risk) {
  if (risk === "critical") return "bg-red-500/15 text-red-200 border-red-400/20";
  if (risk === "high") return "bg-orange-500/15 text-orange-200 border-orange-400/20";
  if (risk === "medium") return "bg-amber-500/15 text-amber-200 border-amber-400/20";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
}

function MiniKpi({ title, value, wide }) {
  return (
    <div className={`rounded-2xl bg-slate-900/70 border border-white/5 p-4 ${wide ? "col-span-2" : ""}`}>
      <div className="text-slate-400 text-xs font-bold">{title}</div>
      <div className="text-white font-black mt-2">{value}</div>
    </div>
  );
}

function AiMetric({ icon, title, value, progress, tone = "cyan" }) {
  const toneColor = tone === "rose" ? "#fb7185" : tone === "emerald" ? "#34d399" : "#22d3ee";
  return (
    <div className="rounded-[2rem] bg-slate-800/70 border border-white/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-slate-400 text-sm font-bold">{title}</div>
          <div className="text-3xl font-black text-white mt-2">{value}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="h-3 rounded-full bg-slate-900 mt-4 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${clamp(progress)}%`, background: toneColor }} />
      </div>
    </div>
  );
}

function RfmBox({ title, score, detail, fa }) {
  return (
    <div className="rounded-3xl bg-slate-900/70 border border-white/5 p-5">
      <div className="text-slate-400 text-sm font-bold">{title}</div>
      <div className="text-3xl font-black text-cyan-300 mt-2">{Math.round(score)}</div>
      <div className="h-2 rounded-full bg-slate-800 mt-3 overflow-hidden">
        <div className="h-full bg-cyan-400" style={{ width: `${clamp(score)}%` }} />
      </div>
      <div className="text-xs text-slate-500 mt-3">{fa ? "جزئیات" : "Detail"}: {detail}</div>
    </div>
  );
}

function SuggestionCard({ item }) {
  const toneClass = {
    cyan: "bg-cyan-400/10 text-cyan-200 border-cyan-400/20",
    emerald: "bg-emerald-400/10 text-emerald-200 border-emerald-400/20",
    rose: "bg-rose-400/10 text-rose-200 border-rose-400/20",
    amber: "bg-amber-400/10 text-amber-200 border-amber-400/20",
  }[item.tone] || "bg-cyan-400/10 text-cyan-200 border-cyan-400/20";

  return (
    <div className="rounded-3xl bg-slate-900/70 border border-white/5 p-4 flex gap-3">
      <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${toneClass}`}>
        {item.icon}
      </div>
      <div>
        <div className="font-black text-white">{item.title}</div>
        <p className="text-slate-300 text-sm leading-7 mt-1">{item.text}</p>
      </div>
    </div>
  );
}

function ActionBox({ icon, title, value }) {
  return (
    <div className="rounded-3xl bg-slate-900/70 border border-white/5 p-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-slate-400 text-xs font-bold">{title}</div>
          <div className="text-white font-black mt-1">{value}</div>
        </div>
      </div>
    </div>
  );
}
