import { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { BriefcaseBusiness, Plus, RefreshCw, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import { getCustomers, getPipelineDeals, createPipelineDeal, updatePipelineDeal, deletePipelineDeal } from "../services/api";
import JalaliDateField from "../components/forms/JalaliDateField";
import Select from "../components/ui/Select";

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];

function toNumber(value) { return Number(String(value ?? "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,،]/g, "").replace(/[^\d.-]/g, "") || 0); }
function Field({ label, children }) { return <div className="space-y-2"><label className="text-sm font-bold text-[var(--erp-accent)] block">{label}</label>{children}</div>; }

export default function SalesPipeline() {
  const { language, dir, n, money } = useLanguage();
  const fa = language === "fa";
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", customer_id: "", amount: "", probability: "", expected_close_date: "", note: "" });

  const stageLabel = {
    lead: fa ? "سرنخ" : language === "ar" ? "عميل محتمل" : language === "tr" ? "Aday" : "Lead",
    qualified: fa ? "واجد شرایط" : language === "ar" ? "مؤهّل" : language === "tr" ? "Nitelikli" : "Qualified",
    proposal: fa ? "پیشنهاد قیمت" : language === "ar" ? "عرض سعر" : language === "tr" ? "Teklif" : "Proposal",
    negotiation: fa ? "مذاکره" : language === "ar" ? "تفاوض" : language === "tr" ? "Müzakere" : "Negotiation",
    won: fa ? "برنده" : language === "ar" ? "فوز" : language === "tr" ? "Kazanıldı" : "Won",
    lost: fa ? "ازدست‌رفته" : language === "ar" ? "خسارة" : language === "tr" ? "Kaybedildi" : "Lost",
  };

  const label = {
    title: fa ? "قیف فروش" : language === "ar" ? "قمع المبيعات" : language === "tr" ? "Satış Hunisi" : "Sales Pipeline",
    subtitle: fa ? "مدیریت معاملات از سرنخ تا برد یا باخت" : language === "ar" ? "إدارة الصفقات من العميل المحتمل حتى الفوز أو الخسارة" : language === "tr" ? "Fırsatları adaydan kazanç veya kayba kadar yönetin" : "Manage deals from lead to won or lost",
    newDeal: fa ? "معامله جدید" : language === "ar" ? "صفقة جديدة" : language === "tr" ? "Yeni Fırsat" : "New deal",
    dealTitle: fa ? "عنوان معامله" : language === "ar" ? "عنوان الصفقة" : language === "tr" ? "Fırsat Başlığı" : "Deal title",
    customer: fa ? "مشتری" : language === "ar" ? "العميل" : language === "tr" ? "Müşteri" : "Customer",
    noCustomer: fa ? "بدون مشتری مشخص" : language === "ar" ? "بدون عميل محدد" : language === "tr" ? "Müşteri belirtilmedi" : "No customer specified",
    amount: fa ? "مبلغ برآوردی" : language === "ar" ? "المبلغ المقدّر" : language === "tr" ? "Tahmini Tutar" : "Estimated amount",
    probability: fa ? "احتمال برد (٪)" : language === "ar" ? "احتمال الفوز (٪)" : language === "tr" ? "Kazanma Olasılığı (%)" : "Win probability (%)",
    closeDate: fa ? "تاریخ تخمینی بستن" : language === "ar" ? "تاريخ الإغلاق المتوقع" : language === "tr" ? "Tahmini Kapanış" : "Expected close",
    note: fa ? "توضیحات" : language === "ar" ? "ملاحظات" : language === "tr" ? "Not" : "Note",
    save: fa ? "ثبت معامله" : language === "ar" ? "حفظ الصفقة" : language === "tr" ? "Fırsatı Kaydet" : "Create deal",
    refresh: fa ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh",
    noDeals: fa ? "معامله‌ای در این مرحله نیست." : language === "ar" ? "لا توجد صفقات في هذه المرحلة." : language === "tr" ? "Bu aşamada fırsat yok." : "No deals in this stage.",
    prevStage: fa ? "مرحله قبل" : language === "ar" ? "المرحلة السابقة" : language === "tr" ? "Önceki Aşama" : "Previous stage",
    nextStage: fa ? "مرحله بعد" : language === "ar" ? "المرحلة التالية" : language === "tr" ? "Sonraki Aşama" : "Next stage",
    totalPipeline: fa ? "جمع کل قیف" : language === "ar" ? "إجمالي القمع" : language === "tr" ? "Toplam Huni" : "Total pipeline",
  };

  async function load() {
    setLoading(true); setError("");
    try {
      const [d, c] = await Promise.all([getPipelineDeals(), getCustomers()]);
      setDeals(Array.isArray(d) ? d : []);
      setCustomers(Array.isArray(c) ? c : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  const stableLoad = useStableCallback(load);
  useEffect(() => { const t = setTimeout(() => { void stableLoad(); }, 0); return () => clearTimeout(t); }, [language, stableLoad]);

  const columns = useMemo(() => {
    const byStage = Object.fromEntries(STAGES.map((s) => [s, []]));
    for (const deal of deals) {
      const stage = STAGES.includes(deal.stage) ? deal.stage : "lead";
      byStage[stage].push(deal);
    }
    return byStage;
  }, [deals]);

  const totalPipeline = useMemo(
    () => deals.filter((d) => d.stage !== "won" && d.stage !== "lost").reduce((sum, d) => sum + toNumber(d.amount), 0),
    [deals]
  );

  function customerName(id) {
    return customers.find((c) => Number(c.id) === Number(id))?.name || "";
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error(fa ? "عنوان معامله لازم است" : "Deal title is required"); return; }
    try {
      const result = await createPipelineDeal({
        title: form.title,
        customer_id: form.customer_id ? Number(form.customer_id) : 0,
        stage: "lead",
        amount: toNumber(form.amount),
        probability: toNumber(form.probability),
        expected_close_date: form.expected_close_date,
        note: form.note,
      });
      if (result?.status === "error") throw new Error(result.message);
      toast.success(label.save);
      setForm({ title: "", customer_id: "", amount: "", probability: "", expected_close_date: "", note: "" });
      await load();
    } catch (err) { toast.error(err.message); }
  }

  async function moveStage(deal, direction) {
    const index = STAGES.indexOf(deal.stage);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= STAGES.length) return;
    try {
      await updatePipelineDeal(deal.id, { ...deal, stage: STAGES[nextIndex] });
      await load();
    } catch (err) { toast.error(err.message); }
  }

  async function removeDeal(deal) {
    if (!window.confirm(fa ? `معامله «${deal.title}» حذف شود؟` : `Delete deal "${deal.title}"?`)) return;
    try { await deletePipelineDeal(deal.id); await load(); } catch (err) { toast.error(err.message); }
  }

  return (
    <div dir={dir} style={{ direction: dir }} className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)] flex items-center gap-3"><BriefcaseBusiness size={32} />{label.title}</h1>
          <p className="text-[var(--erp-muted)] mt-2">{label.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <div className="text-xs text-[var(--erp-muted)]">{label.totalPipeline}</div>
            <div className="text-xl font-black text-[var(--erp-accent)]">{money(totalPipeline)}</div>
          </div>
          <button onClick={load} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] border border-[var(--erp-border)] font-black flex items-center gap-2">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />{label.refresh}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-500/15 border border-red-400/30 text-red-200 rounded-2xl p-4">{error}</div>}

      <form onSubmit={submit} className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
        <h2 className="text-xl font-black text-[var(--erp-accent)] mb-4">{label.newDeal}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={label.dealTitle}>
            <input className="bg-[var(--erp-panel-solid)] rounded-2xl p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400" value={form.title} onChange={(e) => setForm({ ...form, title: fa ? toPersianDigits(e.target.value) : e.target.value })} />
          </Field>
          <Field label={label.customer}>
            <Select
              className="w-full"
              value={form.customer_id}
              onChange={(value) => setForm({ ...form, customer_id: value })}
              options={[
                { value: "", label: label.noCustomer },
                ...customers.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Field>
          <Field label={label.amount}>
            <input type="text" inputMode="numeric" className="bg-[var(--erp-panel-solid)] rounded-2xl p-3 outline-none w-full border border-[var(--erp-border)]" value={fa ? toPersianDigits(form.amount) : form.amount} onChange={(e) => setForm({ ...form, amount: cleanNumberInput(e.target.value) })} placeholder={fa ? "۰" : "0"} />
          </Field>
          <Field label={label.probability}>
            <input type="text" inputMode="numeric" className="bg-[var(--erp-panel-solid)] rounded-2xl p-3 outline-none w-full border border-[var(--erp-border)]" value={fa ? toPersianDigits(form.probability) : form.probability} onChange={(e) => setForm({ ...form, probability: cleanNumberInput(e.target.value) })} placeholder={fa ? "۰" : "0"} />
          </Field>
          <Field label={label.closeDate}>
            <JalaliDateField className="bg-[var(--erp-panel-solid)] rounded-2xl p-3 outline-none w-full border border-[var(--erp-border)]" value={form.expected_close_date} onChange={(iso) => setForm({ ...form, expected_close_date: iso })} fa={fa} language={language} />
          </Field>
          <Field label={label.note}>
            <input className="bg-[var(--erp-panel-solid)] rounded-2xl p-3 outline-none w-full border border-[var(--erp-border)]" value={form.note} onChange={(e) => setForm({ ...form, note: fa ? toPersianDigits(e.target.value) : e.target.value })} />
          </Field>
        </div>
        <button type="submit" className="mt-4 px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2">
          <Plus size={18} />{label.save}
        </button>
      </form>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {STAGES.map((stage) => (
          <div key={stage} className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-[var(--erp-accent)]">{stageLabel[stage]}</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]">{n(columns[stage].length)}</span>
            </div>
            <div className="space-y-3">
              {columns[stage].length === 0 && <div className="text-xs text-[var(--erp-muted)]">{label.noDeals}</div>}
              {columns[stage].map((deal) => (
                <div key={deal.id} className="bg-[var(--erp-panel-solid)] rounded-2xl p-3 border border-[var(--erp-border)]">
                  <div className="font-bold text-[var(--erp-text)] text-sm">{deal.title}</div>
                  {deal.customer_id ? <div className="text-xs text-[var(--erp-muted)] mt-1">{customerName(deal.customer_id)}</div> : null}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-black text-[var(--erp-accent)]">{money(deal.amount)}</span>
                    {deal.probability ? <span className="text-xs text-[var(--erp-muted)]">{n(deal.probability)}%</span> : null}
                  </div>
                  <div className="flex items-center justify-between mt-3 gap-1">
                    <button onClick={() => moveStage(deal, -1)} disabled={STAGES.indexOf(stage) === 0} className="p-1.5 rounded-lg bg-[var(--erp-glow)] text-[var(--erp-accent)] disabled:opacity-30" title={label.prevStage}>
                      <ArrowLeft size={14} className={dir === "rtl" ? "rotate-180" : ""} />
                    </button>
                    <button onClick={() => removeDeal(deal)} className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300" title={fa ? "حذف" : "Delete"}>
                      <Trash2 size={14} />
                    </button>
                    <button onClick={() => moveStage(deal, 1)} disabled={STAGES.indexOf(stage) === STAGES.length - 1} className="p-1.5 rounded-lg bg-[var(--erp-glow)] text-[var(--erp-accent)] disabled:opacity-30" title={label.nextStage}>
                      <ArrowRight size={14} className={dir === "rtl" ? "rotate-180" : ""} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
