import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, Clock, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import JalaliDateField from "../../../components/forms/JalaliDateField";
import { toJalali, toHijriText } from "../../../utils/date";
import { toPersianDigits } from "../../../localization/helpers";
import Select from "../../../components/ui/Select";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function toComparableDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{4}\/\d{2}\/\d{2}/.test(text)) return text.replaceAll("/", "-").slice(0, 10);
  return text;
}

function isOverdue(task) {
  if (task.status === "done" || task.status === "cancelled") return false;
  const due = toComparableDate(task.due_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < todayKey();
}

function isToday(task) {
  return toComparableDate(task.due_date) === todayKey();
}

function priorityLabel(priority, language) {
  const key = String(priority || "normal").toLowerCase();
  const maps = {
    fa: { low: "کم", normal: "معمولی", medium: "متوسط", high: "زیاد", urgent: "فوری" },
    ar: { low: "منخفضة", normal: "عادية", medium: "متوسطة", high: "مرتفعة", urgent: "عاجلة" },
    tr: { low: "Düşük", normal: "Normal", medium: "Orta", high: "Yüksek", urgent: "Acil" },
    en: { low: "Low", normal: "Normal", medium: "Medium", high: "High", urgent: "Urgent" },
  };
  return (maps[language] || maps.en)[key] || priority || "-";
}

function statusLabel(status, language) {
  const key = String(status || "open").toLowerCase();
  const maps = {
    fa: { open: "باز", doing: "در حال انجام", done: "انجام شده", cancelled: "لغو شده" },
    ar: { open: "مفتوحة", doing: "قيد التنفيذ", done: "منجزة", cancelled: "ملغاة" },
    tr: { open: "Açık", doing: "Devam ediyor", done: "Tamamlandı", cancelled: "İptal edildi" },
    en: { open: "Open", doing: "Doing", done: "Done", cancelled: "Cancelled" },
  };
  return (maps[language] || maps.en)[key] || status || "-";
}

function priorityTone(priority) {
  const key = String(priority || "normal").toLowerCase();
  if (key === "urgent") return "bg-red-500/15 text-red-200 border-red-400/20";
  if (key === "high") return "bg-amber-500/15 text-amber-200 border-amber-400/20";
  if (key === "medium") return "bg-[var(--erp-glow)] text-[var(--erp-accent)] border-[var(--erp-border)]";
  if (key === "low") return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  return "bg-slate-500/15 text-[var(--erp-text)] border-slate-400/20";
}

function statusTone(status) {
  const key = String(status || "open").toLowerCase();
  if (key === "done") return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  if (key === "doing") return "bg-[var(--erp-glow)] text-[var(--erp-accent)] border-[var(--erp-border)]";
  if (key === "cancelled") return "bg-slate-500/15 text-[var(--erp-muted)] border-slate-400/20";
  return "bg-amber-500/15 text-amber-200 border-amber-400/20";
}

function normalizeTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).map((task, index) => ({
    id: task.id || `task-${index}`,
    title: task.title || "",
    description: task.description || "",
    due_date: task.due_date || "",
    status: task.status || "open",
    priority: task.priority || "normal",
    assignee: task.assignee || task.user || "",
    created_at: task.created_at || "",
    completed_at: task.completed_at || "",
    raw: task,
  }));
}

export default function CustomerTasks({
  tasks = [],
  fa = true,
  language,
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}) {
  const lang = language || (fa ? "fa" : "en");
  const tr = (faText, arText, trText, enText) =>
    lang === "fa" ? faText : lang === "ar" ? arText : lang === "tr" ? trText : enText;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [form, setForm] = useState({ title: "", description: "", due_date: "", priority: "normal", status: "open", assignee: "" });

  const rows = useMemo(() => normalizeTasks(tasks), [tasks]);

  const stats = useMemo(() => ({
    total: rows.length,
    open: rows.filter((x) => x.status !== "done" && x.status !== "cancelled").length,
    done: rows.filter((x) => x.status === "done").length,
    urgent: rows.filter((x) => x.priority === "urgent" || x.priority === "high").length,
    today: rows.filter(isToday).length,
    overdue: rows.filter(isOverdue).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((task) => {
      const matchesQuery = !q || task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q) || task.assignee.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" && task.status !== "done" && task.status !== "cancelled") || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      return matchesQuery && matchesStatus && matchesPriority;
    });
  }, [rows, query, statusFilter, priorityFilter]);

  async function submitTask() {
    if (!form.title.trim() || !onCreateTask) return;
    await onCreateTask({ title: form.title.trim(), description: form.description.trim(), due_date: form.due_date.trim(), priority: form.priority, status: form.status, assignee: form.assignee.trim() });
    setForm({ title: "", description: "", due_date: "", priority: "normal", status: "open", assignee: "" });
  }

  async function changeStatus(task, nextStatus) {
    if (!onUpdateTask) return;
    await onUpdateTask(task.id, { ...task.raw, title: task.title, description: task.description, due_date: task.due_date, priority: task.priority, status: nextStatus });
  }

  return (
    <section className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5 text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2"><BellRing />{tr("وظایف و پیگیری‌های مشتری", "مهام ومتابعات العميل", "Müşteri görevleri ve takipleri", "Customer Tasks & Follow-ups")}</h2>
          <p className="text-[var(--erp-muted)] text-sm mt-2">{tr("تماس، جلسه، تحویل کالا، پیگیری وصول مطالبات و یادآوری‌های اختصاصی مشتری", "المكالمات والاجتماعات والتسليم ومتابعة التحصيل والتذكيرات الخاصة بالعميل", "Aramalar, toplantılar, teslimatlar, tahsilat takibi ve müşteriye özel hatırlatmalar", "Calls, meetings, deliveries, receivable follow-ups and customer reminders")}</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2 disabled:opacity-60">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />{tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <TaskStat icon={<BellRing />} title={tr("کل", "الإجمالي", "Toplam", "Total")} value={n(stats.total)} tone="cyan" />
        <TaskStat icon={<Clock />} title={tr("باز", "مفتوحة", "Açık", "Open")} value={n(stats.open)} tone="amber" />
        <TaskStat icon={<CheckCircle2 />} title={tr("انجام شده", "منجزة", "Tamamlandı", "Done")} value={n(stats.done)} tone="emerald" />
        <TaskStat icon={<AlertTriangle />} title={tr("فوری/مهم", "عاجلة", "Acil", "Urgent")} value={n(stats.urgent)} tone="rose" />
        <TaskStat icon={<CalendarClock />} title={tr("امروز", "اليوم", "Bugün", "Today")} value={n(stats.today)} tone="cyan" />
        <TaskStat icon={<XCircle />} title={tr("عقب‌افتاده", "متأخرة", "Gecikmiş", "Overdue")} value={n(stats.overdue)} tone="rose" />
      </div>

      <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5 mb-5">
        <h3 className="text-[var(--erp-accent)] font-black mb-4 flex items-center gap-2"><Plus size={20} />{tr("ثبت وظیفه جدید", "إضافة مهمة جديدة", "Yeni görev ekle", "Add new task")}</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr("عنوان وظیفه؛ مثال: تماس برای پیگیری پرداخت", "عنوان المهمة؛ مثال: اتصال لمتابعة الدفع", "Görev başlığı; örn: Ödeme takibi için arama", "Task title")} className="crm-input" />
          <JalaliDateField value={form.due_date} onChange={(isoDate) => setForm({ ...form, due_date: isoDate })} fa={lang === "fa"} language={lang} className="crm-input" style={{ gap: 8 }} />
          <input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder={tr("مسئول انجام", "المسؤول", "Sorumlu", "Assignee")} className="crm-input" />
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={form.priority}
              onChange={(value) => setForm({ ...form, priority: value })}
              className="crm-input"
              options={[
                { value: "low", label: tr("اولویت کم", "أولوية منخفضة", "Düşük öncelik", "Low") },
                { value: "normal", label: tr("اولویت معمولی", "أولوية عادية", "Normal öncelik", "Normal") },
                { value: "medium", label: tr("اولویت متوسط", "أولوية متوسطة", "Orta öncelik", "Medium") },
                { value: "high", label: tr("اولویت زیاد", "أولوية مرتفعة", "Yüksek öncelik", "High") },
                { value: "urgent", label: tr("فوری", "عاجلة", "Acil", "Urgent") },
              ]}
            />
            <Select
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              className="crm-input"
              options={[
                { value: "open", label: tr("باز", "مفتوحة", "Açık", "Open") },
                { value: "doing", label: tr("در حال انجام", "قيد التنفيذ", "Devam ediyor", "Doing") },
                { value: "done", label: tr("انجام شده", "منجزة", "Tamamlandı", "Done") },
                { value: "cancelled", label: tr("لغو شده", "ملغاة", "İptal edildi", "Cancelled") },
              ]}
            />
          </div>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: lang === "fa" ? toPersianDigits(e.target.value) : e.target.value })} placeholder={tr("توضیحات وظیفه", "وصف المهمة", "Görev açıklaması", "Task description")} rows={3} className="crm-input lg:col-span-2" />
        </div>
        <button type="button" onClick={submitTask} className="mt-4 px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2"><Plus size={18} />{tr("ثبت وظیفه", "حفظ المهمة", "Görevi kaydet", "Save task")}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_190px_190px] gap-3 mb-4">
        <div className="relative"><Search size={18} className="absolute top-3.5 right-4 text-[var(--erp-muted)]" /><input value={query} onChange={(e) => setQuery(lang === "fa" ? toPersianDigits(e.target.value) : e.target.value)} placeholder={tr("جستجو در وظایف...", "بحث في المهام...", "Görevlerde ara...", "Search tasks...")} className="w-full bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl pr-11 pl-4 py-3 outline-none border border-[var(--erp-border)]" /></div>
        <Select
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          className="w-full"
          options={[
            { value: "all", label: tr("همه وضعیت‌ها", "جميع الحالات", "Tüm durumlar", "All statuses") },
            { value: "active", label: tr("فعال", "نشطة", "Aktif", "Active") },
            { value: "open", label: tr("باز", "مفتوحة", "Açık", "Open") },
            { value: "doing", label: tr("در حال انجام", "قيد التنفيذ", "Devam ediyor", "Doing") },
            { value: "done", label: tr("انجام شده", "منجزة", "Tamamlandı", "Done") },
            { value: "cancelled", label: tr("لغو شده", "ملغاة", "İptal edildi", "Cancelled") },
          ]}
        />
        <Select
          value={priorityFilter}
          onChange={(value) => setPriorityFilter(value)}
          className="w-full"
          options={[
            { value: "all", label: tr("همه اولویت‌ها", "جميع الأولويات", "Tüm öncelikler", "All priorities") },
            { value: "urgent", label: tr("فوری", "عاجلة", "Acil", "Urgent") },
            { value: "high", label: tr("زیاد", "مرتفعة", "Yüksek", "High") },
            { value: "medium", label: tr("متوسط", "متوسطة", "Orta", "Medium") },
            { value: "normal", label: tr("معمولی", "عادية", "Normal", "Normal") },
            { value: "low", label: tr("کم", "منخفضة", "Düşük", "Low") },
          ]}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((task) => (
          <div key={task.id} className={`rounded-3xl border p-4 transition ${isOverdue(task) ? "bg-red-500/10 border-red-400/20" : isToday(task) ? "bg-[var(--erp-glow)] border-[var(--erp-border)]" : "bg-[var(--erp-panel-solid)] border-[var(--erp-border)] hover:border-cyan-400/20"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-[var(--erp-text)]">{task.title || "-"}</h3>
                  {isOverdue(task) && <span className="px-3 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-200 border border-red-400/20">{tr("عقب‌افتاده", "متأخرة", "Gecikmiş", "Overdue")}</span>}
                  {isToday(task) && <span className="px-3 py-1 rounded-full text-xs font-black bg-[var(--erp-glow)] text-[var(--erp-accent)] border border-[var(--erp-border)]">{tr("امروز", "اليوم", "Bugün", "Today")}</span>}
                </div>
                {task.description && <p className="text-[var(--erp-muted)] text-sm leading-7 mt-2 whitespace-pre-line">{task.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className={`px-3 py-1 rounded-full border text-xs font-black ${statusTone(task.status)}`}>{statusLabel(task.status, lang)}</span>
                  <span className={`px-3 py-1 rounded-full border text-xs font-black ${priorityTone(task.priority)}`}>{priorityLabel(task.priority, lang)}</span>
                  {task.due_date && <span className="px-3 py-1 rounded-full border text-xs font-black bg-slate-500/10 text-[var(--erp-muted)] border-slate-400/20 flex items-center gap-1"><CalendarClock size={13} />{lang === "fa" ? toJalali(task.due_date) : lang === "ar" ? toHijriText(task.due_date) : task.due_date}</span>}
                  {task.assignee && <span className="px-3 py-1 rounded-full border text-xs font-black bg-blue-500/10 text-blue-200 border-blue-400/20">{task.assignee}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {task.status !== "done" && <button type="button" onClick={() => changeStatus(task, "done")} className="px-3 py-2 rounded-2xl bg-emerald-500/15 text-emerald-200 font-black flex items-center gap-1"><CheckCircle2 size={16} />{tr("انجام شد", "منجزة", "Tamamlandı", "Done")}</button>}
                {task.status !== "doing" && task.status !== "done" && <button type="button" onClick={() => changeStatus(task, "doing")} className="px-3 py-2 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] font-black">{tr("در حال انجام", "قيد التنفيذ", "Devam ediyor", "Doing")}</button>}
                {onDeleteTask && <button type="button" onClick={() => onDeleteTask(task.id)} className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-200 flex items-center justify-center"><Trash2 size={17} /></button>}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-8 text-center text-[var(--erp-muted)]">{tr("وظیفه‌ای برای نمایش وجود ندارد.", "لا توجد مهام لعرضها.", "Gösterilecek görev yok.", "No tasks to show.")}</div>}
      </div>
      <style>{`.crm-input{width:100%;background:var(--erp-panel-solid);color:var(--erp-text);border:1px solid var(--erp-border);border-radius:16px;padding:12px;outline:none}.crm-input::placeholder{color:var(--erp-muted)}`}</style>
    </section>
  );
}

function TaskStat({ icon, title, value, tone = "cyan" }) {
  const toneClass = { cyan: "text-[var(--erp-accent)] bg-[var(--erp-glow)] border-[var(--erp-border)]", emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", rose: "text-rose-300 bg-rose-400/10 border-rose-400/20", amber: "text-amber-300 bg-amber-400/10 border-amber-400/20" }[tone] || "text-[var(--erp-accent)] bg-[var(--erp-glow)] border-[var(--erp-border)]";
  return <div className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4"><div className="flex items-center justify-between gap-2"><div><div className="text-[var(--erp-muted)] text-xs font-bold">{title}</div><div className="text-2xl font-black text-[var(--erp-text)] mt-2">{value}</div></div><div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${toneClass}`}>{icon}</div></div></div>;
}
