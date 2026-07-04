import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  CalendarClock,
  CreditCard,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../../localization/LanguageContext";
import {
  createCrmInteraction,
  createCrmNote,
  createCrmTask,
  getCrmCustomer360,
  getCrmCustomerTimeline,
  getCrmNotes,
  getCrmTasks,
  updateCrmTask,
} from "../../services/api";

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function riskLabel(risk, fa) {
  const mapFa = { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" };
  const mapEn = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
  return fa ? mapFa[risk] || risk || "-" : mapEn[risk] || risk || "-";
}

function levelLabel(level, fa) {
  const mapFa = { vip: "VIP", gold: "طلایی", followup: "نیازمند پیگیری", normal: "عادی" };
  const mapEn = { vip: "VIP", gold: "Gold", followup: "Follow-up", normal: "Normal" };
  return fa ? mapFa[level] || level || "-" : mapEn[level] || level || "-";
}

function actionLabel(action, fa) {
  const mapFa = {
    urgent_call: "تماس فوری",
    payment_followup: "پیگیری پرداخت",
    loyalty_offer: "پیشنهاد وفاداری",
    regular_followup: "پیگیری معمول",
  };
  const mapEn = {
    urgent_call: "Urgent call",
    payment_followup: "Payment follow-up",
    loyalty_offer: "Loyalty offer",
    regular_followup: "Regular follow-up",
  };
  return fa ? mapFa[action] || action || "-" : mapEn[action] || action || "-";
}

function timelineIcon(type) {
  if (type === "invoice") return <FileText size={18} />;
  if (["receipt", "payment", "accounting"].includes(type)) return <CreditCard size={18} />;
  if (type === "call") return <Phone size={18} />;
  if (type === "task") return <BellRing size={18} />;
  return <MessageCircle size={18} />;
}

export default function Customer360() {
  const { id } = useParams();
  const { language, dir, money, n, date } = useLanguage();
  const fa = language === "fa";

  const [data, setData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [noteForm, setNoteForm] = useState({ title: "", text: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", due_date: "", priority: "normal" });
  const [interactionForm, setInteractionForm] = useState({ interaction_type: "call", title: "", description: "", result: "", next_followup: "" });

  async function loadCustomer360() {
    try {
      setLoading(true);
      setMessage("");
      const [customerData, timelineData, notesData, tasksData] = await Promise.all([
        getCrmCustomer360(id),
        getCrmCustomerTimeline(id),
        getCrmNotes(id),
        getCrmTasks(id),
      ]);
      setData(customerData);
      setTimeline(Array.isArray(timelineData) ? timelineData : []);
      setNotes(Array.isArray(notesData) ? notesData : []);
      setTasks(Array.isArray(tasksData) ? tasksData : []);
    } catch (error) {
      console.error("CRM Customer 360 loading error:", error);
      setMessage(fa ? "خطا در دریافت اطلاعات CRM. بک‌اند را ری‌استارت کن." : "CRM loading error. Restart backend.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomer360();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, language]);

  async function addNote() {
    if (!noteForm.title.trim() && !noteForm.text.trim()) return;
    await createCrmNote(id, { ...noteForm, note_type: "note" });
    setNoteForm({ title: "", text: "" });
    await loadCustomer360();
  }

  async function addTask() {
    if (!taskForm.title.trim()) return;
    await createCrmTask(id, { ...taskForm, status: "open" });
    setTaskForm({ title: "", description: "", due_date: "", priority: "normal" });
    await loadCustomer360();
  }

  async function addInteraction() {
    if (!interactionForm.title.trim() && !interactionForm.description.trim()) return;
    await createCrmInteraction(id, interactionForm);
    setInteractionForm({ interaction_type: "call", title: "", description: "", result: "", next_followup: "" });
    await loadCustomer360();
  }

  async function markTaskDone(task) {
    await updateCrmTask(task.id, { ...task, status: "done" });
    await loadCustomer360();
  }

  const customer = data?.customer;
  const summary = data?.summary || {};
  const ai = data?.ai || {};
  const invoices = data?.invoices || [];

  const tags = useMemo(() => {
    return String(customer?.tags || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }, [customer]);

  if (!customer) {
    return (
      <div dir={dir} className="min-h-screen bg-slate-950 text-white p-8">
        <Link to="/customers" className="text-cyan-300 font-bold">
          {fa ? "بازگشت به طرف‌حساب‌ها" : "Back to customers"}
        </Link>
        <div className="mt-6">{loading ? (fa ? "در حال بارگذاری..." : "Loading...") : message || (fa ? "اطلاعاتی یافت نشد." : "No data found.")}</div>
      </div>
    );
  }

  const score = toNumber(customer.score);
  const risk = customer.risk_level || "low";
  const debt = toNumber(summary.debt);
  const creditUsage = toNumber(summary.credit_usage);

  return (
    <div
      dir={dir}
      className="min-h-screen p-6 space-y-6 text-white"
      style={{
        direction: dir,
        background:
          "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 35%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 35%), #071028",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/customers" className="inline-flex items-center gap-2 text-cyan-300 font-bold mb-4">
            <ArrowLeft size={18} />
            {fa ? "بازگشت به طرف‌حساب‌ها" : "Back to customers"}
          </Link>
          <h1 className="text-4xl font-black text-cyan-400">
            {fa ? "پرونده ۳۶۰ درجه مشتری" : "Customer 360 Profile"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa ? "اطلاعات مالی، ارتباطی، تایم‌لاین، وظایف، یادداشت‌ها و پیشنهاد هوشمند" : "Financial, contact, timeline, tasks, notes and AI recommendation"}
          </p>
        </div>

        <button
          onClick={loadCustomer360}
          disabled={loading}
          className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      {message && <div className="rounded-2xl bg-rose-500/10 border border-rose-400/20 p-4 text-rose-200">{message}</div>}

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-5">
        <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-16 h-16 rounded-3xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300">
                  <UserRound size={32} />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-white">{customer.name}</h2>
                  <p className="text-slate-400">{levelLabel(customer.crm_level, fa)} • {riskLabel(risk, fa)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-cyan-400/10 text-cyan-200 border border-cyan-400/20 text-xs font-bold">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-center rounded-3xl bg-slate-800/80 p-5 min-w-[160px]">
              <div className="text-slate-400 text-sm">{fa ? "امتیاز مشتری" : "Customer score"}</div>
              <div className="text-5xl font-black text-cyan-300 mt-2">{n(score)}</div>
              <div className="text-xs text-slate-500">/100</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
            <Info icon={<Phone />} label={fa ? "تلفن" : "Phone"} value={customer.phone || customer.mobile || "-"} />
            <Info icon={<Mail />} label={fa ? "ایمیل" : "Email"} value={customer.email || "-"} />
            <Info icon={<ShieldAlert />} label={fa ? "ریسک" : "Risk"} value={riskLabel(risk, fa)} />
          </div>
        </div>

        <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-6 shadow-2xl">
          <h2 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-4">
            <Sparkles />
            {fa ? "تحلیل هوشمند مشتری" : "AI Customer Insight"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Kpi title={fa ? "احتمال خرید" : "Purchase probability"} value={`${n(ai.purchase_probability || 0)}%`} />
            <Kpi title={fa ? "ریسک ریزش" : "Churn risk"} value={`${n(ai.churn_risk || 0)}%`} />
            <Kpi title={fa ? "اقدام بعدی" : "Next action"} value={actionLabel(ai.next_action, fa)} wide />
            <Kpi title={fa ? "بهترین زمان تماس" : "Best contact time"} value={ai.best_contact_time || "-"} wide />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <Stat icon={<Wallet />} title={fa ? "مانده" : "Balance"} value={money(Math.abs(toNumber(summary.balance)))} />
        <Stat icon={<TrendingUp />} title={fa ? "ارزش خرید" : "Lifetime value"} value={money(summary.lifetime_value || 0)} />
        <Stat icon={<FileText />} title={fa ? "تعداد فاکتور" : "Invoices"} value={n(summary.invoice_count || 0)} />
        <Stat icon={<CreditCard />} title={fa ? "فاکتور باز" : "Open invoices"} value={n(summary.open_invoice_count || 0)} />
        <Stat icon={<Target />} title={fa ? "مصرف اعتبار" : "Credit usage"} value={`${n(creditUsage)}%`} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
        <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5">
          <h2 className="text-cyan-300 font-black text-xl mb-4">{fa ? "تایم‌لاین ارتباط و مالی" : "CRM & Financial Timeline"}</h2>
          <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
            {timeline.map((item) => (
              <div key={item.id} className="rounded-2xl bg-slate-800/70 border border-white/5 p-4 flex gap-3">
                <div className="text-cyan-300 mt-1">{timelineIcon(item.type)}</div>
                <div className="flex-1">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div className="font-black text-white">{item.title || item.type}</div>
                    <div className="text-xs text-slate-500">{item.created_at ? date(item.created_at) : "-"}</div>
                  </div>
                  <div className="text-slate-400 text-sm mt-1">{item.description || "-"}</div>
                  {toNumber(item.amount) > 0 && <div className="text-cyan-300 font-black mt-2">{money(item.amount)}</div>}
                </div>
              </div>
            ))}
            {timeline.length === 0 && <div className="text-slate-400">{fa ? "هنوز رویدادی ثبت نشده است." : "No timeline events yet."}</div>}
          </div>
        </div>

        <div className="space-y-5">
          <CrmForm title={fa ? "ثبت یادداشت" : "Add note"} icon={<MessageCircle />}>
            <input className="crm-input" placeholder={fa ? "عنوان" : "Title"} value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} />
            <textarea className="crm-input" rows={3} placeholder={fa ? "متن یادداشت" : "Note"} value={noteForm.text} onChange={(e) => setNoteForm({ ...noteForm, text: e.target.value })} />
            <button onClick={addNote} className="crm-btn"><Plus size={16} /> {fa ? "ثبت یادداشت" : "Save note"}</button>
          </CrmForm>

          <CrmForm title={fa ? "ثبت وظیفه / پیگیری" : "Add task"} icon={<BellRing />}>
            <input className="crm-input" placeholder={fa ? "عنوان وظیفه" : "Task title"} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            <input className="crm-input" type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
            <textarea className="crm-input" rows={2} placeholder={fa ? "توضیح" : "Description"} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
            <button onClick={addTask} className="crm-btn"><Plus size={16} /> {fa ? "ثبت وظیفه" : "Save task"}</button>
          </CrmForm>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5">
          <h2 className="text-cyan-300 font-black text-xl mb-4">{fa ? "وظایف باز" : "Open Tasks"}</h2>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-2xl bg-slate-800/70 p-4 flex justify-between gap-3">
                <div>
                  <div className="font-black text-white">{task.title}</div>
                  <div className="text-slate-400 text-sm">{task.description || "-"}</div>
                  <div className="text-xs text-cyan-300 mt-2">{task.due_date || "-"}</div>
                </div>
                {task.status !== "done" && (
                  <button onClick={() => markTaskDone(task)} className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 font-bold h-fit">
                    {fa ? "انجام شد" : "Done"}
                  </button>
                )}
              </div>
            ))}
            {tasks.length === 0 && <div className="text-slate-400">{fa ? "وظیفه‌ای ثبت نشده است." : "No tasks."}</div>}
          </div>
        </div>

        <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5">
          <h2 className="text-cyan-300 font-black text-xl mb-4">{fa ? "فاکتورهای مشتری" : "Customer invoices"}</h2>
          <div className="space-y-3 max-h-[420px] overflow-auto">
            {invoices.map((inv) => (
              <div key={inv.id} className="rounded-2xl bg-slate-800/70 p-4 flex justify-between gap-3">
                <div>
                  <div className="font-black text-white">#{n(inv.id)} - {inv.invoice_type}</div>
                  <div className="text-slate-400 text-sm">{inv.created_at ? date(inv.created_at) : "-"}</div>
                </div>
                <div className="font-black text-cyan-300">{money(inv.total_amount)}</div>
              </div>
            ))}
            {invoices.length === 0 && <div className="text-slate-400">{fa ? "فاکتوری ثبت نشده است." : "No invoices."}</div>}
          </div>
        </div>
      </section>

      <CrmForm title={fa ? "ثبت تماس / تعامل" : "Add interaction"} icon={<Phone />}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select className="crm-input" value={interactionForm.interaction_type} onChange={(e) => setInteractionForm({ ...interactionForm, interaction_type: e.target.value })}>
            <option value="call">{fa ? "تماس" : "Call"}</option>
            <option value="meeting">{fa ? "جلسه" : "Meeting"}</option>
            <option value="sms">{fa ? "پیامک" : "SMS"}</option>
            <option value="whatsapp">{fa ? "واتساپ" : "WhatsApp"}</option>
          </select>
          <input className="crm-input" placeholder={fa ? "عنوان" : "Title"} value={interactionForm.title} onChange={(e) => setInteractionForm({ ...interactionForm, title: e.target.value })} />
          <input className="crm-input" placeholder={fa ? "نتیجه" : "Result"} value={interactionForm.result} onChange={(e) => setInteractionForm({ ...interactionForm, result: e.target.value })} />
          <input className="crm-input" type="date" value={interactionForm.next_followup} onChange={(e) => setInteractionForm({ ...interactionForm, next_followup: e.target.value })} />
        </div>
        <textarea className="crm-input mt-3" rows={2} placeholder={fa ? "توضیح تعامل" : "Interaction description"} value={interactionForm.description} onChange={(e) => setInteractionForm({ ...interactionForm, description: e.target.value })} />
        <button onClick={addInteraction} className="crm-btn mt-3"><Plus size={16} /> {fa ? "ثبت تعامل" : "Save interaction"}</button>
      </CrmForm>

      <style>{`
        .crm-input {
          width: 100%;
          background: #1e293b;
          color: white;
          border: 1px solid rgba(34,211,238,.18);
          border-radius: 16px;
          padding: 12px;
          outline: none;
        }
        .crm-btn {
          background: #22d3ee;
          color: #020617;
          border-radius: 16px;
          padding: 12px 16px;
          font-weight: 900;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}

function Info({ icon, label, value }) {
  return (
    <div className="rounded-2xl bg-slate-800/70 p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-2">{icon}{label}</div>
      <div className="font-black text-white break-words">{value}</div>
    </div>
  );
}

function Stat({ icon, title, value }) {
  return (
    <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-slate-400 text-sm font-bold">{title}</div>
          <div className="text-2xl font-black text-cyan-300 mt-2">{value}</div>
        </div>
        <div className="text-cyan-300">{icon}</div>
      </div>
    </div>
  );
}

function Kpi({ title, value, wide }) {
  return (
    <div className={`rounded-2xl bg-slate-800/70 p-4 ${wide ? "col-span-2" : ""}`}>
      <div className="text-slate-400 text-xs font-bold">{title}</div>
      <div className="text-white font-black mt-2">{value}</div>
    </div>
  );
}

function CrmForm({ title, icon, children }) {
  return (
    <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5">
      <h2 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-4">
        {icon}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
