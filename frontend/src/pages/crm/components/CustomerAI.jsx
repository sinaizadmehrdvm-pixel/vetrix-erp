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

function riskLabel(value, language) {
  const key = String(value || "low").toLowerCase();
  const maps = {
    fa: { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" },
    ar: { low: "منخفض", medium: "متوسط", high: "مرتفع", critical: "حرج" },
    tr: { low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik" },
    en: { low: "Low", medium: "Medium", high: "High", critical: "Critical" },
  };
  return (maps[language] || maps.en)[key] || value || "-";
}

function actionLabel(action, language) {
  const key = String(action || "").toLowerCase();
  const maps = {
    fa: {
      urgent_call: "تماس فوری",
      payment_followup: "پیگیری پرداخت",
      loyalty_offer: "پیشنهاد وفاداری",
      regular_followup: "پیگیری معمول",
      cross_sell: "پیشنهاد کالای مکمل",
      vip_retention: "حفظ مشتری VIP",
    },
    ar: {
      urgent_call: "اتصال فوري",
      payment_followup: "متابعة الدفع",
      loyalty_offer: "عرض ولاء",
      regular_followup: "متابعة اعتيادية",
      cross_sell: "عرض بيع تكميلي",
      vip_retention: "الاحتفاظ بعميل VIP",
    },
    tr: {
      urgent_call: "Acil arama",
      payment_followup: "Ödeme takibi",
      loyalty_offer: "Sadakat teklifi",
      regular_followup: "Rutin takip",
      cross_sell: "Çapraz satış teklifi",
      vip_retention: "VIP müşteri koruma",
    },
    en: {
      urgent_call: "Urgent call",
      payment_followup: "Payment follow-up",
      loyalty_offer: "Loyalty offer",
      regular_followup: "Regular follow-up",
      cross_sell: "Cross-sell offer",
      vip_retention: "VIP retention",
    },
  };
  return (maps[language] || maps.en)[key] || action || "-";
}

function levelLabel(level, language) {
  const key = String(level || "Bronze");
  const maps = {
    fa: { VIP: "VIP", Platinum: "پلاتینیوم", Gold: "طلایی", Silver: "نقره‌ای", Bronze: "برنزی" },
    ar: { VIP: "VIP", Platinum: "بلاتيني", Gold: "ذهبي", Silver: "فضي", Bronze: "برونزي" },
    tr: { VIP: "VIP", Platinum: "Platin", Gold: "Altın", Silver: "Gümüş", Bronze: "Bronz" },
    en: { VIP: "VIP", Platinum: "Platinum", Gold: "Gold", Silver: "Silver", Bronze: "Bronze" },
  };
  return (maps[language] || maps.en)[key] || key;
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

function suggestionList(analysis, language, n) {
  const list = [];
  const tr = (fa, ar, tr, en) =>
    language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? tr : en;

  if (analysis.paymentRisk >= 65) {
    list.push({
      icon: <Wallet size={18} />,
      title: tr("پیگیری فوری وصول مطالبات", "متابعة عاجلة لتحصيل المستحقات", "Acil alacak takibi", "Urgent receivable follow-up"),
      text: tr(
        "مانده بدهی مشتری بالاست. امروز تماس بگیر و برنامه پرداخت مشخص کن.",
        "رصيد مديونية العميل مرتفع. اتصل اليوم واتفق على خطة سداد.",
        "Müşterinin borç bakiyesi yüksek. Bugün arayın ve bir ödeme planı belirleyin.",
        "Customer debt risk is high. Call today and agree on a payment plan."
      ),
      tone: "rose",
    });
  }

  if (analysis.churnRisk >= 60) {
    list.push({
      icon: <TrendingDown size={18} />,
      title: tr("ریسک ریزش مشتری", "خطر فقدان العميل", "Müşteri kaybı riski", "Churn risk"),
      text: tr(
        "فاصله از آخرین خرید زیاد شده است. پیشنهاد ویژه یا تماس پیگیری می‌تواند مشتری را فعال کند.",
        "مضت فترة طويلة منذ آخر عملية شراء. قد يساعد عرض خاص أو مكالمة متابعة في إعادة تنشيط العميل.",
        "Son satın almadan bu yana uzun zaman geçti. Özel bir teklif veya takip araması müşteriyi yeniden aktif hale getirebilir.",
        "It has been a while since the last purchase. A follow-up call or offer may reactivate the customer."
      ),
      tone: "amber",
    });
  }

  if (analysis.purchaseProbability >= 70) {
    list.push({
      icon: <Gift size={18} />,
      title: tr("فرصت فروش مکمل", "فرصة بيع تكميلي", "Çapraz satış fırsatı", "Cross-sell opportunity"),
      text: tr(
        "احتمال خرید مجدد خوب است. کالاهای مکمل یا خدمات پس از فروش را پیشنهاد کن.",
        "احتمال الشراء مرة أخرى جيد. اقترح منتجات تكميلية أو خدمات ما بعد البيع.",
        "Tekrar satın alma olasılığı yüksek. Tamamlayıcı ürünler veya satış sonrası hizmetler önerin.",
        "Purchase probability is strong. Offer complementary products or after-sales service."
      ),
      tone: "cyan",
    });
  }

  if (["VIP", "Platinum", "Gold"].includes(analysis.loyaltyLevel)) {
    list.push({
      icon: <Crown size={18} />,
      title: tr("مشتری ارزشمند", "عميل ذو قيمة عالية", "Değerli müşteri", "Valuable customer"),
      text: tr(
        `سطح مشتری ${analysis.loyaltyLevel} است. مراقبت اختصاصی و پیگیری منظم پیشنهاد می‌شود.`,
        `مستوى العميل ${analysis.loyaltyLevel}. يُنصح بالاهتمام الخاص والمتابعة المنتظمة.`,
        `Müşteri seviyesi ${analysis.loyaltyLevel}. Özel ilgi ve düzenli takip önerilir.`,
        `Customer level is ${analysis.loyaltyLevel}. Use dedicated care and regular follow-up.`
      ),
      tone: "emerald",
    });
  }

  if (analysis.suggestedDiscount > 0) {
    list.push({
      icon: <Sparkles size={18} />,
      title: tr("تخفیف پیشنهادی", "الخصم المقترح", "Önerilen indirim", "Suggested discount"),
      text: tr(
        `برای این مشتری تخفیف پیشنهادی ${n(analysis.suggestedDiscount)}% است.`,
        `الخصم المقترح لهذا العميل هو ${n(analysis.suggestedDiscount)}%.`,
        `Bu müşteri için önerilen indirim %${n(analysis.suggestedDiscount)}.`,
        `Suggested discount for this customer is ${n(analysis.suggestedDiscount)}%.`
      ),
      tone: "cyan",
    });
  }

  if (!list.length) {
    list.push({
      icon: <CheckCircle2 size={18} />,
      title: tr("وضعیت پایدار", "حالة مستقرة", "Kararlı durum", "Stable status"),
      text: tr(
        "مشتری در وضعیت پایدار قرار دارد. پیگیری معمول کافی است.",
        "حالة العميل مستقرة. المتابعة الاعتيادية كافية.",
        "Müşteri durumu istikrarlı. Rutin takip yeterli.",
        "Customer status is stable. Regular follow-up is enough."
      ),
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
  language,
  money = (v) => String(v ?? 0),
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
  onCreateTask,
  onCreateInteraction,
}) {
  const lang = language || (fa ? "fa" : "en");
  const tr = (faText, arText, trText, enText) =>
    lang === "fa" ? faText : lang === "ar" ? arText : lang === "tr" ? trText : enText;

  const analysis = useMemo(() => buildSmartAnalysis({ customer, summary, invoices, ai }), [customer, summary, invoices, ai]);
  const suggestions = useMemo(() => suggestionList(analysis, lang, n), [analysis, lang, n]);

  async function createFollowupTask() {
    if (!onCreateTask) return;
    await onCreateTask({
      title:
        analysis.nextAction === "payment_followup"
          ? tr("پیگیری پرداخت مشتری", "متابعة دفعات العميل", "Müşteri ödeme takibi", "Payment follow-up")
          : analysis.nextAction === "urgent_call"
          ? tr("تماس فوری با مشتری", "اتصال عاجل بالعميل", "Müşteriyle acil görüşme", "Urgent customer call")
          : tr("پیگیری فروش مشتری", "متابعة مبيعات العميل", "Müşteri satış takibi", "Sales follow-up"),
      description: tr(
        `پیشنهاد هوشمند VITALIX: ${actionLabel(analysis.nextAction, lang)}`,
        `اقتراح VITALIX الذكي: ${actionLabel(analysis.nextAction, lang)}`,
        `VITALIX akıllı önerisi: ${actionLabel(analysis.nextAction, lang)}`,
        `VITALIX smart suggestion: ${actionLabel(analysis.nextAction, lang)}`
      ),
      due_date: "",
      priority: analysis.riskLevel === "critical" || analysis.riskLevel === "high" ? "urgent" : "normal",
      status: "open",
    });
  }

  async function createCallInteraction() {
    if (!onCreateInteraction) return;
    await onCreateInteraction({
      interaction_type: "call",
      title: tr("تماس پیشنهادی هوش مصنوعی", "مكالمة مقترحة بالذكاء الاصطناعي", "Yapay zeka önerisi arama", "AI suggested call"),
      description: tr(
        `بهترین زمان تماس: ${analysis.bestContactTime} - اقدام پیشنهادی: ${actionLabel(analysis.nextAction, lang)}`,
        `أفضل وقت للاتصال: ${analysis.bestContactTime} - الإجراء المقترح: ${actionLabel(analysis.nextAction, lang)}`,
        `En iyi arama zamanı: ${analysis.bestContactTime} - Önerilen işlem: ${actionLabel(analysis.nextAction, lang)}`,
        `Best contact time: ${analysis.bestContactTime} - Suggested action: ${actionLabel(analysis.nextAction, lang)}`
      ),
      result: "",
      next_followup: "",
    });
  }

  return (
    <section className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5 text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2">
            <Brain />
            {tr("هوش فروش مشتری", "ذكاء مبيعات العميل", "Müşteri satış zekası", "Customer Sales Intelligence")}
          </h2>
          <p className="text-[var(--erp-muted)] text-sm mt-2">
            {tr(
              "تحلیل رفتار خرید، ریسک ریزش، احتمال خرید مجدد، RFM و پیشنهاد اقدام بعدی",
              "تحليل سلوك الشراء وخطر فقدان العميل واحتمال الشراء مرة أخرى وRFM واقتراح الإجراء التالي",
              "Satın alma davranışı, kayıp riski, tekrar satın alma olasılığı, RFM ve sıradaki en iyi eylem önerisi",
              "Purchase behavior, churn risk, purchase probability, RFM and next-best action"
            )}
          </p>
        </div>

        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2 disabled:opacity-60">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <div className="rounded-[2rem] bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5">
          <div className="text-center">
            <div className="text-[var(--erp-muted)] text-sm font-bold">{tr("امتیاز سلامت مشتری", "درجة سلامة العميل", "Müşteri sağlık skoru", "Customer health score")}</div>
            <div className="relative w-48 h-48 mx-auto my-5 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(var(--erp-accent) ${analysis.healthScore * 3.6}deg, var(--erp-panel-solid) 0deg)` }}>
              <div className="w-36 h-36 rounded-full bg-[var(--erp-bg-soft)] flex flex-col items-center justify-center">
                <div className="text-5xl font-black text-[var(--erp-accent)]">{n(analysis.healthScore)}</div>
                <div className="text-[var(--erp-muted)] text-xs">/{n(100)}</div>
              </div>
            </div>

            <div className={`inline-flex px-4 py-2 rounded-full border font-black ${riskTone(analysis.riskLevel)}`}>
              <ShieldAlert size={17} className="mx-1" />
              {tr("ریسک", "الخطورة", "Risk", "Risk")}: {riskLabel(analysis.riskLevel, lang)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <MiniKpi title={tr("سطح وفاداری", "مستوى الولاء", "Sadakat seviyesi", "Loyalty")} value={levelLabel(analysis.loyaltyLevel, lang)} />
            <MiniKpi title={tr("مصرف اعتبار", "استخدام الائتمان", "Kredi kullanımı", "Credit usage")} value={`${n(Math.round(analysis.creditUsage))}%`} />
            <MiniKpi title={tr("بهترین زمان تماس", "أفضل وقت للاتصال", "En iyi arama zamanı", "Best call time")} value={analysis.bestContactTime} wide />
          </div>

          <div className="grid grid-cols-1 gap-3 mt-5">
            <button type="button" onClick={createFollowupTask} className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center justify-center gap-2">
              <CalendarClock size={18} />
              {tr("ساخت وظیفه پیشنهادی", "إنشاء مهمة مقترحة", "Önerilen görevi oluştur", "Create suggested task")}
            </button>
            <button type="button" onClick={createCallInteraction} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center justify-center gap-2">
              <Phone size={18} />
              {tr("ثبت تماس پیشنهادی", "تسجيل مكالمة مقترحة", "Önerilen aramayı kaydet", "Log suggested call")}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AiMetric icon={<Target />} title={tr("احتمال خرید مجدد", "احتمال الشراء مرة أخرى", "Tekrar satın alma olasılığı", "Purchase probability")} value={`${n(Math.round(analysis.purchaseProbability))}%`} progress={analysis.purchaseProbability} tone="cyan" />
            <AiMetric icon={<TrendingDown />} title={tr("ریسک ریزش", "خطر فقدان العميل", "Kayıp riski", "Churn risk")} value={`${n(Math.round(analysis.churnRisk))}%`} progress={analysis.churnRisk} tone={analysis.churnRisk >= 60 ? "rose" : "emerald"} />
            <AiMetric icon={<AlertTriangle />} title={tr("ریسک پرداخت", "خطر السداد", "Ödeme riski", "Payment risk")} value={`${n(Math.round(analysis.paymentRisk))}%`} progress={analysis.paymentRisk} tone={analysis.paymentRisk >= 60 ? "rose" : "emerald"} />
          </div>

          <div className="rounded-[2rem] bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5">
            <h3 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-4">
              <LineChart />
              {tr("تحلیل RFM", "تحليل RFM", "RFM Analizi", "RFM Analysis")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <RfmBox title={tr("تازگی خرید", "الحداثة", "Yenilik", "Recency")} score={analysis.rfm.recencyScore} detail={analysis.rfm.recencyDays == null ? "-" : tr(`${n(analysis.rfm.recencyDays)} روز`, `${n(analysis.rfm.recencyDays)} يوم`, `${n(analysis.rfm.recencyDays)} gün`, `${analysis.rfm.recencyDays} days`)} tr={tr} n={n} />
              <RfmBox title={tr("تکرار خرید", "التكرار", "Sıklık", "Frequency")} score={analysis.rfm.frequencyScore} detail={n(analysis.rfm.frequency)} tr={tr} n={n} />
              <RfmBox title={tr("ارزش خرید", "القيمة", "Parasal değer", "Monetary")} score={analysis.rfm.monetaryScore} detail={money(analysis.rfm.monetary)} tr={tr} n={n} />
            </div>
          </div>

          <div className="rounded-[2rem] bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5">
            <h3 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-4">
              <Sparkles />
              {tr("پیشنهادهای هوشمند VITALIX", "اقتراحات VITALIX الذكية", "VITALIX akıllı önerileri", "VITALIX Smart Suggestions")}
            </h3>
            <div className="space-y-3">
              {suggestions.map((item, index) => <SuggestionCard key={index} item={item} />)}
            </div>
          </div>

          <div className="rounded-[2rem] bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5">
            <h3 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-4">
              <TrendingUp />
              {tr("اقدام بعدی پیشنهادی", "الإجراء التالي المقترح", "Sıradaki önerilen eylem", "Next Best Action")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ActionBox icon={<Phone />} title={tr("اقدام پیشنهادی", "الإجراء المقترح", "Önerilen işlem", "Suggested action")} value={actionLabel(analysis.nextAction, lang)} />
              <ActionBox icon={<Gift />} title={tr("تخفیف پیشنهادی", "الخصم المقترح", "Önerilen indirim", "Suggested discount")} value={`${n(analysis.suggestedDiscount)}%`} />
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
    <div className={`rounded-2xl bg-[var(--erp-panel)] border border-[var(--erp-border)] p-4 ${wide ? "col-span-2" : ""}`}>
      <div className="text-[var(--erp-muted)] text-xs font-bold">{title}</div>
      <div className="text-[var(--erp-text)] font-black mt-2">{value}</div>
    </div>
  );
}

function AiMetric({ icon, title, value, progress, tone = "cyan" }) {
  const toneColor = tone === "rose" ? "#fb7185" : tone === "emerald" ? "#34d399" : "var(--erp-accent)";
  return (
    <div className="rounded-[2rem] bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div>
          <div className="text-3xl font-black text-[var(--erp-text)] mt-2">{value}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] border border-[var(--erp-border)] flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="h-3 rounded-full bg-[var(--erp-bg-soft)] mt-4 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${clamp(progress)}%`, background: toneColor }} />
      </div>
    </div>
  );
}

function RfmBox({ title, score, detail, tr, n = (v) => String(v ?? "") }) {
  return (
    <div className="rounded-3xl bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5">
      <div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div>
      <div className="text-3xl font-black text-[var(--erp-accent)] mt-2">{n(Math.round(score))}</div>
      <div className="h-2 rounded-full bg-[var(--erp-panel-solid)] mt-3 overflow-hidden">
        <div className="h-full bg-cyan-400" style={{ width: `${clamp(score)}%` }} />
      </div>
      <div className="text-xs text-[var(--erp-muted)] mt-3">{tr("جزئیات", "التفاصيل", "Detay", "Detail")}: {detail}</div>
    </div>
  );
}

function SuggestionCard({ item }) {
  const toneClass = {
    cyan: "bg-[var(--erp-glow)] text-[var(--erp-accent)] border-[var(--erp-border)]",
    emerald: "bg-emerald-400/10 text-emerald-200 border-emerald-400/20",
    rose: "bg-rose-400/10 text-rose-200 border-rose-400/20",
    amber: "bg-amber-400/10 text-amber-200 border-amber-400/20",
  }[item.tone] || "bg-[var(--erp-glow)] text-[var(--erp-accent)] border-[var(--erp-border)]";

  return (
    <div className="rounded-3xl bg-[var(--erp-panel)] border border-[var(--erp-border)] p-4 flex gap-3">
      <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${toneClass}`}>
        {item.icon}
      </div>
      <div>
        <div className="font-black text-[var(--erp-text)]">{item.title}</div>
        <p className="text-[var(--erp-muted)] text-sm leading-7 mt-1">{item.text}</p>
      </div>
    </div>
  );
}

function ActionBox({ icon, title, value }) {
  return (
    <div className="rounded-3xl bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] border border-[var(--erp-border)] flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-[var(--erp-muted)] text-xs font-bold">{title}</div>
          <div className="text-[var(--erp-text)] font-black mt-1">{value}</div>
        </div>
      </div>
    </div>
  );
}
