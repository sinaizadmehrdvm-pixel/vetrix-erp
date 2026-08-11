import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, X } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  recalculateBiFindings, getBiFindings, getBiFinding, acknowledgeBiFinding, dismissBiFinding,
  reopenBiFinding, resolveBiFinding, createBiActionPlan, startBiActionPlan, completeBiActionPlan,
  cancelBiActionPlan, createBiActionTask, updateBiActionTask, getBiImprovementDashboard,
} from "../services/api";
import { getUsers } from "../services/usersApi";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";
import Modal from "../components/ui/Modal";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const btnClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-2 disabled:opacity-60";
const ghostBtnClass = "rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] px-3 py-2 text-sm font-bold";

const SEVERITY_TONE = {
  critical: "bg-red-500/15 text-red-200",
  warning: "bg-amber-500/15 text-amber-200",
  info: "bg-cyan-500/15 text-cyan-200",
};

const STATUS_TONE = {
  new: "bg-cyan-500/15 text-cyan-200",
  acknowledged: "bg-slate-500/15 text-slate-200",
  action_planned: "bg-indigo-500/15 text-indigo-200",
  in_progress: "bg-amber-500/15 text-amber-200",
  monitoring: "bg-purple-500/15 text-purple-200",
  resolved: "bg-emerald-500/15 text-emerald-200",
  reopened: "bg-orange-500/15 text-orange-200",
  dismissed: "bg-zinc-500/15 text-zinc-300",
};

export default function ImprovementCenter() {
  const { dir, language, n, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [dashboard, setDashboard] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const categoryLabel = (c) => ({
    receivables_aging: tr("مطالبات معوق", "ذمم متأخرة", "Gecikmiş alacaklar", "Overdue receivables"),
    sales_decline: tr("کاهش فروش", "تراجع المبيعات", "Satış düşüşü", "Sales decline"),
    dead_stock: tr("موجودی راکد", "مخزون راكد", "Durgun stok", "Dead stock"),
    low_stock: tr("کمبود موجودی", "نقص المخزون", "Düşük stok", "Low stock"),
    customer_risk: tr("ریسک مشتری", "مخاطر العملاء", "Müşteri riski", "Customer risk"),
    budget_variance: tr("انحراف بودجه", "انحراف الميزانية", "Bütçe sapması", "Budget variance"),
    expiring_stock: tr("انقضای موجودی", "انتهاء صلاحية المخزون", "Stok son kullanma", "Expiring stock"),
    cashflow_pressure: tr("فشار نقدینگی", "ضغط التدفق النقدي", "Nakit akışı baskısı", "Cashflow pressure"),
  }[c] || c);

  const severityLabel = (s) => ({
    critical: tr("بحرانی", "حرج", "Kritik", "Critical"),
    warning: tr("هشدار", "تحذير", "Uyarı", "Warning"),
    info: tr("اطلاعی", "معلوماتي", "Bilgi", "Info"),
  }[s] || s);

  const statusLabel = (s) => ({
    new: tr("جدید", "جديد", "Yeni", "New"),
    acknowledged: tr("تأییدشده", "مُقر به", "Onaylandı", "Acknowledged"),
    action_planned: tr("برنامه‌ریزی‌شده", "تم التخطيط", "Planlandı", "Action planned"),
    in_progress: tr("در حال انجام", "قيد التنفيذ", "Devam ediyor", "In progress"),
    monitoring: tr("در حال پایش", "قيد المراقبة", "İzleniyor", "Monitoring"),
    resolved: tr("حل‌شده", "تم الحل", "Çözüldü", "Resolved"),
    reopened: tr("بازگشایی‌شده", "أُعيد فتحه", "Yeniden açıldı", "Reopened"),
    dismissed: tr("رد‌شده", "مرفوض", "Reddedildi", "Dismissed"),
  }[s] || s);

  async function load() {
    setLoading(true);
    try {
      const [dashboardData, findingsData, usersData] = await Promise.all([
        getBiImprovementDashboard(),
        getBiFindings({ status: statusFilter, severity: severityFilter, category: categoryFilter }),
        getUsers().catch(() => ({ items: [] })),
      ]);
      setDashboard(dashboardData);
      setItems(findingsData.items || []);
      setUsers(usersData.items || usersData.users || (Array.isArray(usersData) ? usersData : []));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, severityFilter, categoryFilter]);

  async function openDetail(id) {
    setDetailId(id);
    setDetailLoading(true);
    try {
      const data = await getBiFinding(id);
      setDetail(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!detailId) return;
    const data = await getBiFinding(detailId);
    setDetail(data);
  }

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const result = await recalculateBiFindings();
      toast.success(tr(
        `${result.created.length} یافته جدید، ${result.updated.length} به‌روزرسانی، ${result.resolved.length} حل‌شده`,
        `${result.created.length} نتيجة جديدة، ${result.updated.length} محدثة، ${result.resolved.length} تم حلها`,
        `${result.created.length} yeni, ${result.updated.length} güncellendi, ${result.resolved.length} çözüldü`,
        `${result.created.length} new, ${result.updated.length} updated, ${result.resolved.length} resolved`,
      ));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRecalculating(false);
    }
  }

  async function handleAcknowledge() {
    try {
      await acknowledgeBiFinding(detailId);
      await Promise.all([refreshDetail(), load()]);
    } catch (err) { toast.error(err.message); }
  }

  async function handleDismiss() {
    const reason = window.prompt(tr("دلیل رد یافته را وارد کنید:", "أدخل سبب الرفض:", "Reddetme nedenini girin:", "Enter a reason to dismiss this finding:"));
    if (!reason || !reason.trim()) return;
    try {
      await dismissBiFinding(detailId, reason.trim());
      await Promise.all([refreshDetail(), load()]);
    } catch (err) { toast.error(err.message); }
  }

  async function handleReopen() {
    try {
      await reopenBiFinding(detailId, "");
      await Promise.all([refreshDetail(), load()]);
    } catch (err) { toast.error(err.message); }
  }

  async function handleResolve() {
    try {
      await resolveBiFinding(detailId, {});
      toast.success(tr("یافته حل شد.", "تم حل النتيجة.", "Bulgu çözüldü.", "Finding resolved."));
      await Promise.all([refreshDetail(), load()]);
    } catch (err) {
      if (err.status === 409) {
        const reason = window.prompt(tr(
          "هدف هنوز محقق نشده. برای حل دستی دلیل را وارد کنید (لغو = انصراف):",
          "لم يتحقق الهدف بعد. أدخل سببًا للحل اليدوي (إلغاء = تراجع):",
          "Hedef henüz karşılanmadı. Manuel çözüm için bir neden girin (iptal = vazgeç):",
          "Target not met yet. Enter a reason to override and resolve anyway (cancel = abort):",
        ));
        if (!reason || !reason.trim()) return;
        try {
          await resolveBiFinding(detailId, { override: true, reason: reason.trim() });
          await Promise.all([refreshDetail(), load()]);
        } catch (err2) { toast.error(err2.message); }
      } else {
        toast.error(err.message);
      }
    }
  }

  const filteredForCount = items;

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <TrendingUp className="text-[var(--erp-accent)]" />
          {tr("مرکز بهبود", "مركز التحسين", "İyileştirme Merkezi", "Improvement Center")}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className={ghostBtnClass} title={tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={handleRecalculate} disabled={recalculating} className={btnClass}>
            {recalculating
              ? tr("در حال محاسبه...", "جارٍ الحساب...", "Hesaplanıyor...", "Recalculating...")
              : tr("محاسبه مجدد یافته‌ها", "إعادة حساب النتائج", "Bulguları yeniden hesapla", "Recalculate findings")}
          </button>
        </div>
      </header>

      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("یافته‌های باز", "النتائج المفتوحة", "Açık bulgular", "Open findings")}</div>
            <div className="text-2xl font-black text-[var(--erp-accent)]">{n(dashboard.open_findings)}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("بحرانی", "حرج", "Kritik", "Critical")}</div>
            <div className="text-2xl font-black text-red-300">{n(dashboard.critical_findings)}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("برنامه‌های در حال اجرا", "خطط قيد التنفيذ", "Devam eden planlar", "Plans in progress")}</div>
            <div className="text-2xl font-black text-amber-300">{n(dashboard.plans_in_progress)}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("وظایف عقب‌افتاده", "المهام المتأخرة", "Süresi geçen görevler", "Overdue actions")}</div>
            <div className="text-2xl font-black text-orange-300">{n(dashboard.overdue_actions)}</div>
          </div>
        </div>
      )}

      <section className={cardClass}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{tr("همه وضعیت‌ها", "كل الحالات", "Tüm durumlar", "All statuses")}</option>
            {["new", "acknowledged", "action_planned", "in_progress", "monitoring", "resolved", "reopened", "dismissed"].map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
          <select className={inputClass} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">{tr("همه سطوح", "كل المستويات", "Tüm seviyeler", "All severities")}</option>
            {["critical", "warning", "info"].map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
          </select>
          <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">{tr("همه دسته‌ها", "كل الفئات", "Tüm kategoriler", "All categories")}</option>
            {["receivables_aging", "sales_decline", "dead_stock", "low_stock", "customer_risk", "budget_variance", "expiring_stock", "cashflow_pressure"].map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
        ) : (
          <Table>
            <Thead>
              <Th>#</Th>
              <Th>{tr("دسته", "الفئة", "Kategori", "Category")}</Th>
              <Th>{tr("عنوان", "العنوان", "Başlık", "Title")}</Th>
              <Th>{tr("سطح", "المستوى", "Seviye", "Severity")}</Th>
              <Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
              <Th>{tr("تاریخ تشخیص", "تاريخ الاكتشاف", "Tespit tarihi", "Detected")}</Th>
              <Th align="end">{tr("عملیات", "إجراء", "İşlem", "Action")}</Th>
            </Thead>
            <Tbody>
              {filteredForCount.length === 0 ? (
                <EmptyRow colSpan={7}>{tr("موردی یافت نشد.", "لا توجد عناصر.", "Öğe bulunamadı.", "No items found.")}</EmptyRow>
              ) : filteredForCount.map((item, index) => (
                <Tr key={item.id}>
                  <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                  <Td>{categoryLabel(item.category)}</Td>
                  <Td className="font-bold">{item.title}</Td>
                  <Td><span className={`px-2 py-1 rounded-lg text-xs font-black ${SEVERITY_TONE[item.severity] || ""}`}>{severityLabel(item.severity)}</span></Td>
                  <Td><span className={`px-2 py-1 rounded-lg text-xs font-black ${STATUS_TONE[item.status] || ""}`}>{statusLabel(item.status)}</span></Td>
                  <Td>{item.detection_date ? date(item.detection_date) : "—"}</Td>
                  <Td align="end">
                    <button onClick={() => openDetail(item.id)} className="text-sm font-bold text-[var(--erp-accent)]">
                      {tr("مشاهده", "عرض", "Görüntüle", "View")}
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </section>

      <Modal open={Boolean(detailId)} onClose={() => { setDetailId(null); setDetail(null); }} maxWidthClassName="max-w-3xl">
        {detailLoading || !detail ? (
          <div className="p-6 text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</div>
        ) : (
          <FindingDetail
            detail={detail}
            tr={tr}
            date={date}
            users={users}
            categoryLabel={categoryLabel}
            severityLabel={severityLabel}
            statusLabel={statusLabel}
            onClose={() => { setDetailId(null); setDetail(null); }}
            onAcknowledge={handleAcknowledge}
            onDismiss={handleDismiss}
            onReopen={handleReopen}
            onResolve={handleResolve}
            onRefresh={async () => { await Promise.all([refreshDetail(), load()]); }}
          />
        )}
      </Modal>
    </div>
  );
}

function FindingDetail({ detail, tr, date, users, categoryLabel, severityLabel, statusLabel, onClose, onAcknowledge, onDismiss, onReopen, onResolve, onRefresh }) {
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState({
    objective: "", selected_action: detail.recommended_actions?.[0] || "", responsible_user_id: "",
    start_date: "", target_date: "", priority: "medium", target_kpi: "", baseline_kpi: detail.current_metric ?? "", target_value: "",
    requires_approval: false, notes: "",
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const openStatuses = ["new", "acknowledged", "action_planned", "in_progress", "monitoring", "reopened"];
  const canPlan = openStatuses.includes(detail.status);

  async function handleCreatePlan(event) {
    event.preventDefault();
    setSavingPlan(true);
    try {
      await createBiActionPlan(detail.id, {
        ...planDraft,
        responsible_user_id: planDraft.responsible_user_id ? Number(planDraft.responsible_user_id) : null,
        baseline_kpi: planDraft.baseline_kpi === "" ? null : Number(planDraft.baseline_kpi),
        target_value: planDraft.target_value === "" ? null : Number(planDraft.target_value),
      });
      toast.success(tr("برنامه اقدام ایجاد شد.", "تم إنشاء خطة العمل.", "Eylem planı oluşturuldu.", "Action plan created."));
      setPlanFormOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPlan(false);
    }
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-1 rounded-lg text-xs font-black ${SEVERITY_TONE[detail.severity] || ""}`}>{severityLabel(detail.severity)}</span>
            <span className={`px-2 py-1 rounded-lg text-xs font-black ${STATUS_TONE[detail.status] || ""}`}>{statusLabel(detail.status)}</span>
            <span className="text-xs text-[var(--erp-muted)]">{categoryLabel(detail.category)}</span>
          </div>
          <h2 className="text-lg font-black">{detail.title}</h2>
          <p className="text-sm text-[var(--erp-muted)] mt-1">{detail.description}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--erp-panel-solid)]"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div><span className="text-[var(--erp-muted)] block">{tr("مقدار فعلی", "القيمة الحالية", "Mevcut değer", "Current")}</span><span className="font-black">{detail.current_metric ?? "—"}</span></div>
        <div><span className="text-[var(--erp-muted)] block">{tr("مقدار مبنا", "القيمة الأساسية", "Temel değer", "Baseline")}</span><span className="font-black">{detail.baseline_metric ?? "—"}</span></div>
        <div><span className="text-[var(--erp-muted)] block">{tr("درصد تغییر", "نسبة التغيير", "Değişim %", "Variance %")}</span><span className="font-black">{detail.variance_percent ?? "—"}</span></div>
        <div><span className="text-[var(--erp-muted)] block">{tr("تاریخ تشخیص", "تاريخ الاكتشاف", "Tespit tarihi", "Detected")}</span><span className="font-black">{detail.detection_date ? date(detail.detection_date) : "—"}</span></div>
      </div>

      {detail.recommended_actions?.length > 0 && (
        <div>
          <div className="text-xs text-[var(--erp-muted)] mb-1">{tr("اقدام‌های پیشنهادی (قاعده‌محور، نه هوش مصنوعی)", "إجراءات مقترحة (قائمة على قواعد، وليست ذكاء اصطناعي)", "Önerilen eylemler (kural tabanlı, yapay zeka değil)", "Recommended actions (rule-based, not AI)")}</div>
          <ul className="flex flex-wrap gap-2">
            {detail.recommended_actions.map((a) => <li key={a} className="text-xs px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]">{a}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {detail.status === "new" && <button onClick={onAcknowledge} className={ghostBtnClass}>{tr("تأیید", "إقرار", "Onayla", "Acknowledge")}</button>}
        {openStatuses.includes(detail.status) && <button onClick={onDismiss} className={ghostBtnClass}>{tr("رد کردن", "رفض", "Reddet", "Dismiss")}</button>}
        {openStatuses.includes(detail.status) && <button onClick={onResolve} className={ghostBtnClass}>{tr("حل کردن", "حل", "Çöz", "Resolve")}</button>}
        {["resolved", "dismissed"].includes(detail.status) && <button onClick={onReopen} className={ghostBtnClass}>{tr("بازگشایی", "إعادة فتح", "Yeniden aç", "Reopen")}</button>}
        {canPlan && <button onClick={() => setPlanFormOpen((v) => !v)} className={btnClass + " text-sm"}>{tr("برنامه اقدام جدید", "خطة عمل جديدة", "Yeni eylem planı", "New action plan")}</button>}
      </div>

      {planFormOpen && (
        <form onSubmit={handleCreatePlan} className="rounded-xl border border-[var(--erp-border)] p-4 space-y-3">
          <textarea className={inputClass} rows={2} placeholder={tr("هدف", "الهدف", "Hedef", "Objective")} value={planDraft.objective} onChange={(e) => setPlanDraft({ ...planDraft, objective: e.target.value })} />
          <select className={inputClass} value={planDraft.selected_action} onChange={(e) => setPlanDraft({ ...planDraft, selected_action: e.target.value })}>
            {(detail.recommended_actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select className={inputClass} value={planDraft.responsible_user_id} onChange={(e) => setPlanDraft({ ...planDraft, responsible_user_id: e.target.value })}>
              <option value="">{tr("مسئول را انتخاب کنید", "اختر المسؤول", "Sorumluyu seç", "Select owner")}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <select className={inputClass} value={planDraft.priority} onChange={(e) => setPlanDraft({ ...planDraft, priority: e.target.value })}>
              {["low", "medium", "high", "critical"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="date" className={inputClass} value={planDraft.start_date} onChange={(e) => setPlanDraft({ ...planDraft, start_date: e.target.value })} placeholder={tr("تاریخ شروع", "تاريخ البدء", "Başlangıç", "Start date")} />
            <input type="date" className={inputClass} value={planDraft.target_date} onChange={(e) => setPlanDraft({ ...planDraft, target_date: e.target.value })} placeholder={tr("تاریخ هدف", "التاريخ المستهدف", "Hedef tarih", "Target date")} />
            <input className={inputClass} placeholder={tr("شاخص هدف (مثلاً درصد فراتر از بودجه)", "المؤشر المستهدف", "Hedef KPI", "Target KPI")} value={planDraft.target_kpi} onChange={(e) => setPlanDraft({ ...planDraft, target_kpi: e.target.value })} />
            <input type="number" step="any" className={inputClass} placeholder={tr("مقدار هدف", "القيمة المستهدفة", "Hedef değer", "Target value")} value={planDraft.target_value} onChange={(e) => setPlanDraft({ ...planDraft, target_value: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={planDraft.requires_approval} onChange={(e) => setPlanDraft({ ...planDraft, requires_approval: e.target.checked })} />
            {tr("نیاز به تأیید مدیر قبل از شروع", "يتطلب موافقة المدير قبل البدء", "Başlamadan önce yönetici onayı gerekir", "Requires manager approval before starting")}
          </label>
          <button type="submit" disabled={savingPlan} className={btnClass}>
            {savingPlan ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره برنامه", "حفظ الخطة", "Planı kaydet", "Save plan")}
          </button>
        </form>
      )}

      {detail.plans?.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-black text-sm">{tr("برنامه‌های اقدام", "خطط العمل", "Eylem planları", "Action plans")}</h3>
          {detail.plans.map((plan) => <PlanCard key={plan.id} plan={plan} tr={tr} users={users} onRefresh={onRefresh} />)}
        </div>
      )}

      {detail.history?.length > 0 && (
        <div>
          <h3 className="font-black text-sm mb-2">{tr("تاریخچه", "السجل", "Geçmiş", "History")}</h3>
          <ul className="space-y-1 text-xs text-[var(--erp-muted)]">
            {detail.history.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <span className="font-bold text-[var(--erp-text)]">{h.event_type}</span>
                <span>{h.actor_name || "—"}</span>
                <span>{h.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, tr, users, onRefresh }) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [busy, setBusy] = useState(false);

  async function runAction(fn) {
    setBusy(true);
    try {
      await fn();
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addTask(event) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    await runAction(() => createBiActionTask(plan.id, { title: taskTitle, deadline: taskDeadline || null, owner_user_id: taskOwner ? Number(taskOwner) : null }));
    setTaskTitle(""); setTaskDeadline(""); setTaskOwner("");
  }

  return (
    <div className="rounded-xl border border-[var(--erp-border)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-bold">{plan.selected_action || plan.objective}</div>
          <div className="text-xs text-[var(--erp-muted)]">{plan.responsible_user_name || "—"} · {plan.priority} · <span className={`px-2 py-0.5 rounded ${STATUS_TONE[plan.status] || ""}`}>{plan.status}</span></div>
        </div>
        <div className="flex gap-2">
          {plan.status === "draft" && !plan.requires_approval && (
            <button disabled={busy} onClick={() => runAction(() => startBiActionPlan(plan.id))} className={ghostBtnClass}>{tr("شروع", "بدء", "Başlat", "Start")}</button>
          )}
          {plan.status === "approved" && (
            <button disabled={busy} onClick={() => runAction(() => startBiActionPlan(plan.id))} className={ghostBtnClass}>{tr("شروع", "بدء", "Başlat", "Start")}</button>
          )}
          {plan.status === "in_progress" && (
            <button disabled={busy} onClick={() => runAction(() => completeBiActionPlan(plan.id, ""))} className={ghostBtnClass}>{tr("تکمیل", "إكمال", "Tamamla", "Complete")}</button>
          )}
          {!["completed", "cancelled"].includes(plan.status) && (
            <button disabled={busy} onClick={() => runAction(() => cancelBiActionPlan(plan.id))} className={ghostBtnClass}>{tr("لغو", "إلغاء", "İptal", "Cancel")}</button>
          )}
        </div>
      </div>

      {plan.tasks?.length > 0 && (
        <ul className="space-y-1">
          {plan.tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm bg-[var(--erp-panel-solid)] rounded-lg px-3 py-2">
              <span>{t.title} {t.owner_user_name ? `· ${t.owner_user_name}` : ""} {t.deadline ? `· ${t.deadline}` : ""}</span>
              <select
                className="text-xs rounded-lg bg-transparent border border-[var(--erp-border)] p-1"
                value={t.status}
                onChange={(e) => runAction(() => updateBiActionTask(t.id, { status: e.target.value }))}
              >
                {["pending", "in_progress", "done", "blocked"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}

      {!["completed", "cancelled"].includes(plan.status) && (
        <form onSubmit={addTask} className="flex flex-wrap gap-2">
          <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("عنوان وظیفه", "عنوان المهمة", "Görev başlığı", "Task title")} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
          <select className={inputClass + " w-40"} value={taskOwner} onChange={(e) => setTaskOwner(e.target.value)}>
            <option value="">{tr("مسئول", "المسؤول", "Sorumlu", "Owner")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <input type="date" className={inputClass + " w-40"} value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} />
          <button type="submit" disabled={busy} className={ghostBtnClass}>{tr("افزودن", "إضافة", "Ekle", "Add")}</button>
        </form>
      )}
    </div>
  );
}
