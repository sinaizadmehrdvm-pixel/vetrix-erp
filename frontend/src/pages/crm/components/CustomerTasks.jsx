import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, Clock, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

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

function priorityLabel(priority, fa) {
  const key = String(priority || "normal").toLowerCase();
  const faMap = { low: "کم", normal: "معمولی", medium: "متوسط", high: "زیاد", urgent: "فوری" };
  const enMap = { low: "Low", normal: "Normal", medium: "Medium", high: "High", urgent: "Urgent" };
  return (fa ? faMap : enMap)[key] || priority || "-";
}

function statusLabel(status, fa) {
  const key = String(status || "open").toLowerCase();
  const faMap = { open: "باز", doing: "در حال انجام", done: "انجام شده", cancelled: "لغو شده" };
  const enMap = { open: "Open", doing: "Doing", done: "Done", cancelled: "Cancelled" };
  return (fa ? faMap : enMap)[key] || status || "-";
}

function priorityTone(priority) {
  const key = String(priority || "normal").toLowerCase();
  if (key === "urgent") return "bg-red-500/15 text-red-200 border-red-400/20";
  if (key === "high") return "bg-amber-500/15 text-amber-200 border-amber-400/20";
  if (key === "medium") return "bg-cyan-500/15 text-cyan-200 border-cyan-400/20";
  if (key === "low") return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  return "bg-slate-500/15 text-slate-200 border-slate-400/20";
}

function statusTone(status) {
  const key = String(status || "open").toLowerCase();
  if (key === "done") return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  if (key === "doing") return "bg-cyan-500/15 text-cyan-200 border-cyan-400/20";
  if (key === "cancelled") return "bg-slate-500/15 text-slate-300 border-slate-400/20";
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
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}) {
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
    <section className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-cyan-300 flex items-center gap-2"><BellRing />{fa ? "وظایف و پیگیری‌های مشتری" : "Customer Tasks & Follow-ups"}</h2>
          <p className="text-slate-400 text-sm mt-2">{fa ? "تماس، جلسه، تحویل کالا، پیگیری وصول مطالبات و یادآوری‌های اختصاصی مشتری" : "Calls, meetings, deliveries, receivable follow-ups and customer reminders"}</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2 disabled:opacity-60">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />{fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <TaskStat icon={<BellRing />} title={fa ? "کل" : "Total"} value={n(stats.total)} tone="cyan" />
        <TaskStat icon={<Clock />} title={fa ? "باز" : "Open"} value={n(stats.open)} tone="amber" />
        <TaskStat icon={<CheckCircle2 />} title={fa ? "انجام شده" : "Done"} value={n(stats.done)} tone="emerald" />
        <TaskStat icon={<AlertTriangle />} title={fa ? "فوری/مهم" : "Urgent"} value={n(stats.urgent)} tone="rose" />
        <TaskStat icon={<CalendarClock />} title={fa ? "امروز" : "Today"} value={n(stats.today)} tone="cyan" />
        <TaskStat icon={<XCircle />} title={fa ? "عقب‌افتاده" : "Overdue"} value={n(stats.overdue)} tone="rose" />
      </div>

      <div className="rounded-3xl bg-slate-800/60 border border-white/5 p-5 mb-5">
        <h3 className="text-cyan-300 font-black mb-4 flex items-center gap-2"><Plus size={20} />{fa ? "ثبت وظیفه جدید" : "Add new task"}</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={fa ? "عنوان وظیفه؛ مثال: تماس برای پیگیری پرداخت" : "Task title"} className="crm-input" />
          <input value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} placeholder={fa ? "تاریخ شمسی؛ مثال ۱۴۰۵/۰۴/۲۵" : "Date; example 2026/07/16"} className="crm-input" />
          <input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder={fa ? "مسئول انجام" : "Assignee"} className="crm-input" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="crm-input">
              <option value="low">{fa ? "اولویت کم" : "Low"}</option><option value="normal">{fa ? "اولویت معمولی" : "Normal"}</option><option value="medium">{fa ? "اولویت متوسط" : "Medium"}</option><option value="high">{fa ? "اولویت زیاد" : "High"}</option><option value="urgent">{fa ? "فوری" : "Urgent"}</option>
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="crm-input">
              <option value="open">{fa ? "باز" : "Open"}</option><option value="doing">{fa ? "در حال انجام" : "Doing"}</option><option value="done">{fa ? "انجام شده" : "Done"}</option><option value="cancelled">{fa ? "لغو شده" : "Cancelled"}</option>
            </select>
          </div>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={fa ? "توضیحات وظیفه" : "Task description"} rows={3} className="crm-input lg:col-span-2" />
        </div>
        <button type="button" onClick={submitTask} className="mt-4 px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"><Plus size={18} />{fa ? "ثبت وظیفه" : "Save task"}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_190px_190px] gap-3 mb-4">
        <div className="relative"><Search size={18} className="absolute top-3.5 right-4 text-slate-500" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={fa ? "جستجو در وظایف..." : "Search tasks..."} className="w-full bg-slate-800 text-white rounded-2xl pr-11 pl-4 py-3 outline-none border border-cyan-400/10" /></div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3 outline-none border border-cyan-400/10"><option value="all">{fa ? "همه وضعیت‌ها" : "All statuses"}</option><option value="active">{fa ? "فعال" : "Active"}</option><option value="open">{fa ? "باز" : "Open"}</option><option value="doing">{fa ? "در حال انجام" : "Doing"}</option><option value="done">{fa ? "انجام شده" : "Done"}</option><option value="cancelled">{fa ? "لغو شده" : "Cancelled"}</option></select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3 outline-none border border-cyan-400/10"><option value="all">{fa ? "همه اولویت‌ها" : "All priorities"}</option><option value="urgent">{fa ? "فوری" : "Urgent"}</option><option value="high">{fa ? "زیاد" : "High"}</option><option value="medium">{fa ? "متوسط" : "Medium"}</option><option value="normal">{fa ? "معمولی" : "Normal"}</option><option value="low">{fa ? "کم" : "Low"}</option></select>
      </div>

      <div className="space-y-3">
        {filtered.map((task) => (
          <div key={task.id} className={`rounded-3xl border p-4 transition ${isOverdue(task) ? "bg-red-500/10 border-red-400/20" : isToday(task) ? "bg-cyan-400/10 border-cyan-400/20" : "bg-slate-800/70 border-white/5 hover:border-cyan-400/20"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap"><h3 className="font-black text-white">{task.title || "-"}</h3>{isOverdue(task) && <span className="px-3 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-200 border border-red-400/20">{fa ? "عقب‌افتاده" : "Overdue"}</span>}{isToday(task) && <span className="px-3 py-1 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-200 border border-cyan-400/20">{fa ? "امروز" : "Today"}</span>}</div>
                {task.description && <p className="text-slate-300 text-sm leading-7 mt-2 whitespace-pre-line">{task.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3"><span className={`px-3 py-1 rounded-full border text-xs font-black ${statusTone(task.status)}`}>{statusLabel(task.status, fa)}</span><span className={`px-3 py-1 rounded-full border text-xs font-black ${priorityTone(task.priority)}`}>{priorityLabel(task.priority, fa)}</span>{task.due_date && <span className="px-3 py-1 rounded-full border text-xs font-black bg-slate-500/10 text-slate-300 border-slate-400/20 flex items-center gap-1"><CalendarClock size={13} />{task.due_date}</span>}{task.assignee && <span className="px-3 py-1 rounded-full border text-xs font-black bg-blue-500/10 text-blue-200 border-blue-400/20">{task.assignee}</span>}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">{task.status !== "done" && <button type="button" onClick={() => changeStatus(task, "done")} className="px-3 py-2 rounded-2xl bg-emerald-500/15 text-emerald-200 font-black flex items-center gap-1"><CheckCircle2 size={16} />{fa ? "انجام شد" : "Done"}</button>}{task.status !== "doing" && task.status !== "done" && <button type="button" onClick={() => changeStatus(task, "doing")} className="px-3 py-2 rounded-2xl bg-cyan-500/15 text-cyan-200 font-black">{fa ? "در حال انجام" : "Doing"}</button>}{onDeleteTask && <button type="button" onClick={() => onDeleteTask(task.id)} className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-200 flex items-center justify-center"><Trash2 size={17} /></button>}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="rounded-3xl bg-slate-800/60 border border-white/5 p-8 text-center text-slate-400">{fa ? "وظیفه‌ای برای نمایش وجود ندارد." : "No tasks to show."}</div>}
      </div>
      <style>{`.crm-input{width:100%;background:#0f172a;color:white;border:1px solid rgba(34,211,238,.14);border-radius:16px;padding:12px;outline:none}.crm-input::placeholder{color:rgba(148,163,184,.75)}`}</style>
    </section>
  );
}

function TaskStat({ icon, title, value, tone = "cyan" }) {
  const toneClass = { cyan: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20", emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", rose: "text-rose-300 bg-rose-400/10 border-rose-400/20", amber: "text-amber-300 bg-amber-400/10 border-amber-400/20" }[tone] || "text-cyan-300 bg-cyan-400/10 border-cyan-400/20";
  return <div className="rounded-2xl bg-slate-800/70 border border-white/5 p-4"><div className="flex items-center justify-between gap-2"><div><div className="text-slate-400 text-xs font-bold">{title}</div><div className="text-2xl font-black text-white mt-2">{value}</div></div><div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${toneClass}`}>{icon}</div></div></div>;
}
