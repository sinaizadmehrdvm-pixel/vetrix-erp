import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BellRing, CreditCard, Gift, Mail, MessageCircle, Phone, Plus, RefreshCw, ShieldAlert, Sparkles, Target, TrendingUp, Trophy, UserRound, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../../localization/LanguageContext";
import {
  API_URL,
  createCrmInteraction,
  createCrmNote,
  createCrmTask,
  deleteCrmNote,
  deleteCrmTask,
  getCrmCustomer360,
  getCrmCustomerTimeline,
  getAuthHeaders,
  getCrmNotes,
  getCrmTasks,
  redeemCrmCustomerPoints,
  updateCrmTask,
} from "../../services/api";

import CustomerTimeline from "./components/CustomerTimeline";
import CustomerFinancial from "./components/CustomerFinancial";
import CustomerTasks from "./components/CustomerTasks";
import CustomerFiles from "./components/CustomerFiles";
import CustomerAI from "./components/CustomerAI";


const API_BASE = API_URL || "http://127.0.0.1:8001";

function cleanPhone(value) {
  let phone = String(value || "").replace(/[^\\d+]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = `98${phone.slice(1)}`;
  if (phone.startsWith("+")) phone = phone.slice(1);
  return phone;
}

function openWhatsApp(phone, text = "") {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return false;
  const url = `https://wa.me/${cleaned}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  window.open(url, "_blank", "noreferrer");
  return true;
}

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
  const mapFa = { VIP: "VIP", Platinum: "پلاتینیوم", Gold: "طلایی", Silver: "نقره‌ای", Bronze: "برنزی" };
  const mapEn = { VIP: "VIP", Platinum: "Platinum", Gold: "Gold", Silver: "Silver", Bronze: "Bronze" };
  return fa ? mapFa[level] || level || "-" : mapEn[level] || level || "-";
}

function actionLabel(action, fa) {
  const mapFa = {
    urgent_call: "تماس فوری",
    payment_followup: "پیگیری پرداخت",
    loyalty_offer: "پیشنهاد وفاداری",
    regular_followup: "پیگیری معمول",
    cross_sell: "پیشنهاد فروش مکمل",
    vip_retention: "حفظ مشتری VIP",
  };
  const mapEn = {
    urgent_call: "Urgent call",
    payment_followup: "Payment follow-up",
    loyalty_offer: "Loyalty offer",
    regular_followup: "Regular follow-up",
    cross_sell: "Cross-sell",
    vip_retention: "VIP retention",
  };
  return fa ? mapFa[action] || action || "-" : mapEn[action] || action || "-";
}

const tabs = [
  { id: "overview", fa: "نمای کلی", en: "Overview" },
  { id: "financial", fa: "مالی", en: "Financial" },
  { id: "timeline", fa: "تایم‌لاین", en: "Timeline" },
  { id: "tasks", fa: "وظایف", en: "Tasks" },
  { id: "files", fa: "فایل‌ها", en: "Files" },
  { id: "ai", fa: "هوش فروش", en: "AI" },
];

export default function Customer360() {
  const { id } = useParams();
  const { language, dir, money, n, date } = useLanguage();
  const fa = language === "fa";

  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [noteForm, setNoteForm] = useState({ title: "", text: "" });
  const [interactionForm, setInteractionForm] = useState({ interaction_type: "call", title: "", description: "", result: "", next_followup: "" });
  const [redeemPointsValue, setRedeemPointsValue] = useState("");

  
async function fetchCustomerFiles(customerId) {
    try {
      const res = await fetch(`${API_BASE}/api/crm/customers/${customerId}/files`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    } catch {
      return [];
    }
  }

  async function loadCustomer360() {
    try {
      setLoading(true);
      setMessage("");

      const [customerData, timelineData, notesData, tasksData, filesData] = await Promise.all([
        getCrmCustomer360(id),
        getCrmCustomerTimeline(id),
        getCrmNotes(id),
        getCrmTasks(id),
        fetchCustomerFiles(id),
      ]);

      setData(customerData);
      setTimeline(Array.isArray(timelineData) ? timelineData : []);
      setNotes(Array.isArray(notesData) ? notesData : []);
      setTasks(Array.isArray(tasksData) ? tasksData : []);

      const maybeFiles = filesData?.length ? filesData : customerData?.files || customerData?.documents || customerData?.attachments || [];
      const maybeLedger = customerData?.ledger || customerData?.accounting_entries || customerData?.entries || [];
      setFiles(Array.isArray(maybeFiles) ? maybeFiles : []);
      setLedger(Array.isArray(maybeLedger) ? maybeLedger : []);
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

  async function addNote(payload = null) {
    const body = payload || { ...noteForm, note_type: "note" };
    if (!String(body.title || "").trim() && !String(body.text || "").trim()) return;

    await createCrmNote(id, body);
    setNoteForm({ title: "", text: "" });
    await loadCustomer360();
  }

  async function removeNote(note) {
    if (!note?.id) return;
    if (!window.confirm(fa ? "یادداشت حذف شود؟" : "Delete note?")) return;
    await deleteCrmNote(note.id);
    await loadCustomer360();
  }

  async function addTask(payload) {
    if (!payload?.title?.trim()) return;
    await createCrmTask(id, { ...payload, status: payload.status || "open" });
    await loadCustomer360();
  }

  async function editTask(taskId, payload) {
    await updateCrmTask(taskId, payload);
    await loadCustomer360();
  }

  async function removeTask(taskId) {
    if (!window.confirm(fa ? "وظیفه حذف شود؟" : "Delete task?")) return;
    await deleteCrmTask(taskId);
    await loadCustomer360();
  }

  async function addInteraction(payload = null) {
    const body = payload || interactionForm;
    if (!String(body.title || "").trim() && !String(body.description || "").trim()) return;

    await createCrmInteraction(id, body);
    setInteractionForm({ interaction_type: "call", title: "", description: "", result: "", next_followup: "" });
    await loadCustomer360();
  }

  async function handleRedeemPoints() {
    const points = toNumber(redeemPointsValue);
    if (points <= 0) return;
    await redeemCrmCustomerPoints(id, {
      points,
      note: fa ? "تبدیل امتیاز به اعتبار هدیه" : "Redeemed loyalty points",
    });
    setRedeemPointsValue("");
    await loadCustomer360();
  }

  async function uploadCustomerFile(payload) {
    if (!payload?.file) return;

    const form = new FormData();
    form.append("file", payload.file);
    form.append("title", payload.title || payload.file.name);
    form.append("description", payload.description || "");
    form.append("category", payload.category || "document");

    const res = await fetch(`${API_BASE}/api/crm/customers/${id}/files`, {
      method: "POST",
      headers: getAuthHeaders({}, false),
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Upload failed");
    }

    setMessage(fa ? "فایل با موفقیت آپلود شد." : "File uploaded.");
    await loadCustomer360();
  }

  async function deleteCustomerFile(fileId) {
    if (!window.confirm(fa ? "فایل حذف شود؟" : "Delete file?")) return;

    const res = await fetch(`${API_BASE}/api/crm/files/${fileId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!res.ok) throw new Error("Delete failed");

    setMessage(fa ? "فایل حذف شد." : "File deleted.");
    await loadCustomer360();
  }

  
function handleWhatsApp() {
    const text = fa
      ? `سلام ${data?.customer?.name || ""} عزیز، از طرف Vetrix ERP برای پیگیری با شما در ارتباط هستیم.`
      : `Hello ${data?.customer?.name || ""}, we are contacting you from Vetrix ERP for follow-up.`;
    const ok = openWhatsApp(data?.customer?.mobile || data?.customer?.phone, text);
    if (!ok) setMessage(fa ? "شماره موبایل معتبر برای واتساپ ثبت نشده است." : "No valid WhatsApp number.");
  }

  const customer = data?.customer;
  const summary = data?.summary || {};
  const ai = data?.ai || {};
  const invoices = data?.invoices || [];
  const loyalty = summary?.loyalty || customer?.loyalty || {};

  const tags = useMemo(() => {
    return String(customer?.tags || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }, [customer]);

  const allTimeline = useMemo(() => {
    const noteEvents = notes.map((note) => ({
      ...note,
      id: `note-${note.id}`,
      type: note.note_type || "note",
      source: "note",
      title: note.title || (fa ? "یادداشت" : "Note"),
      description: note.text || "",
      created_at: note.created_at,
    }));

    const taskEvents = tasks.map((task) => ({
      ...task,
      id: `task-${task.id}`,
      type: "task",
      source: "task",
      title: task.title,
      description: task.description || "",
      created_at: task.created_at || task.due_date,
    }));

    return [...timeline, ...noteEvents, ...taskEvents];
  }, [timeline, notes, tasks, fa]);

  if (!customer) {
    return (
      <div dir={dir} className="min-h-screen bg-slate-950 text-white p-8">
        <Link to="/customers" className="text-cyan-300 font-bold">
          {fa ? "بازگشت به طرف‌حساب‌ها" : "Back to customers"}
        </Link>
        <div className="mt-6">
          {loading ? (fa ? "در حال بارگذاری..." : "Loading...") : message || (fa ? "اطلاعاتی یافت نشد." : "No data found.")}
        </div>
      </div>
    );
  }

  const score = toNumber(customer.score ?? customer.crm_score);
  const risk = customer.risk_level || "low";
  const creditUsage = toNumber(summary.credit_usage);
  const loyaltyLevel = loyalty.level || "Bronze";
  const totalSpent = toNumber(loyalty.total_spent || summary.lifetime_value || 0);
  const nextLevelTarget =
    loyaltyLevel === "Bronze"
      ? 25000000
      : loyaltyLevel === "Silver"
      ? 80000000
      : loyaltyLevel === "Gold"
      ? 200000000
      : loyaltyLevel === "Platinum"
      ? 500000000
      : totalSpent;
  const progress = nextLevelTarget > 0 ? Math.min(100, (totalSpent / nextLevelTarget) * 100) : 100;

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
            {fa ? "پرونده ۳۶۰ درجه طرف‌حساب" : "Customer 360 Enterprise"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa
              ? "پرونده کامل مالی، CRM، وفاداری، فایل‌ها، وظایف، تایم‌لاین و هوش فروش مشتری"
              : "Unified finance, CRM, loyalty, files, tasks, timeline and sales intelligence"}
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

      {message && <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-4 text-emerald-200">{message}</div>}

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
                  <p className="text-slate-400">
                    {levelLabel(loyaltyLevel, fa)} • {riskLabel(risk, fa)} • {date(customer.created_at, { month: "long" })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-cyan-400/10 text-cyan-200 border border-cyan-400/20 text-xs font-bold">
                    {tag}
                  </span>
                ))}
                {!tags.length && (
                  <span className="px-3 py-1 rounded-full bg-slate-400/10 text-slate-300 border border-slate-400/20 text-xs font-bold">
                    {fa ? "بدون برچسب" : "No tags"}
                  </span>
                )}
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

        <div className="rounded-[2rem] bg-slate-900/70 border border-yellow-400/20 p-6 shadow-2xl">
          <h2 className="text-yellow-300 font-black text-xl flex items-center gap-2 mb-4">
            <Trophy />
            {fa ? "باشگاه مشتریان" : "Customer Loyalty"}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Kpi title={fa ? "سطح" : "Level"} value={levelLabel(loyaltyLevel, fa)} />
            <Kpi title={fa ? "امتیاز قابل استفاده" : "Available points"} value={n(Math.round(toNumber(loyalty.points)))} />
            <Kpi title={fa ? "اعتبار هدیه" : "Gift credit"} value={money(loyalty.gift_credit || 0)} />
            <Kpi title={fa ? "تخفیف اختصاصی" : "Discount"} value={`${n(loyalty.discount_percent || 0)}%`} />
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>{fa ? "پیشرفت تا سطح بعدی" : "Next level progress"}</span>
              <span>{n(Math.round(progress))}%</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-cyan-400" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
            <input
              className="crm-input"
              placeholder={fa ? "مثلاً ۱۰۰ امتیاز" : "Points"}
              value={redeemPointsValue}
              onChange={(e) => setRedeemPointsValue(e.target.value)}
            />
            <button onClick={handleRedeemPoints} className="crm-btn" style={{ background: "#fde047" }}>
              <Gift size={16} />
              {fa ? "تبدیل" : "Redeem"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <Stat icon={<Wallet />} title={fa ? "مانده" : "Balance"} value={money(Math.abs(toNumber(summary.balance)))} />
        <Stat icon={<TrendingUp />} title={fa ? "ارزش خرید" : "Lifetime value"} value={money(summary.lifetime_value || 0)} />
        <Stat icon={<CreditCard />} title={fa ? "تعداد فاکتور" : "Invoices"} value={n(summary.invoice_count || 0)} />
        <Stat icon={<Target />} title={fa ? "فاکتور باز" : "Open invoices"} value={n(summary.open_invoice_count || 0)} />
        <Stat icon={<Sparkles />} title={fa ? "مصرف اعتبار" : "Credit usage"} value={`${n(creditUsage)}%`} />
      </section>

      <nav className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-2 flex gap-2 overflow-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 rounded-2xl font-black whitespace-nowrap transition ${
              activeTab === tab.id
                ? "bg-cyan-400 text-slate-950"
                : "bg-slate-800/70 text-slate-300 hover:text-cyan-200"
            }`}
          >
            {fa ? tab.fa : tab.en}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
          <CustomerTimeline
            events={allTimeline}
            fa={fa}
            money={money}
            n={n}
            loading={loading}
            onRefresh={loadCustomer360}
            onAddNote={addNote}
            onDeleteEvent={removeNote}
          />

          <div className="space-y-5">
            <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-6 shadow-2xl">
              <h2 className="text-cyan-300 font-black text-xl flex items-center gap-2 mb-4">
                <Sparkles />
                {fa ? "تحلیل سریع فروش" : "Quick Sales Insight"}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <Kpi title={fa ? "احتمال خرید" : "Purchase probability"} value={`${n(ai.purchase_probability || 0)}%`} />
                <Kpi title={fa ? "ریسک ریزش" : "Churn risk"} value={`${n(ai.churn_risk || 0)}%`} />
                <Kpi title={fa ? "اقدام بعدی" : "Next action"} value={actionLabel(ai.next_action, fa)} wide />
                <Kpi title={fa ? "تخفیف پیشنهادی" : "Suggested discount"} value={`${n(ai.suggested_discount || 0)}%`} wide />
              </div>
            </div>

            <CrmForm title={fa ? "ثبت یادداشت" : "Add note"} icon={<MessageCircle />}>
              <input className="crm-input" placeholder={fa ? "عنوان" : "Title"} value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} />
              <textarea className="crm-input" rows={3} placeholder={fa ? "متن یادداشت" : "Note"} value={noteForm.text} onChange={(e) => setNoteForm({ ...noteForm, text: e.target.value })} />
              <button onClick={() => addNote()} className="crm-btn">
                <Plus size={16} />
                {fa ? "ثبت یادداشت" : "Save note"}
              </button>
            </CrmForm>

            <CrmForm title={fa ? "ثبت تماس / تعامل" : "Add interaction"} icon={<Phone />}>
              <select className="crm-input" value={interactionForm.interaction_type} onChange={(e) => setInteractionForm({ ...interactionForm, interaction_type: e.target.value })}>
                <option value="call">{fa ? "تماس" : "Call"}</option>
                <option value="meeting">{fa ? "جلسه" : "Meeting"}</option>
                <option value="sms">{fa ? "پیامک" : "SMS"}</option>
                <option value="whatsapp">{fa ? "واتساپ" : "WhatsApp"}</option>
              </select>
              <input className="crm-input" placeholder={fa ? "عنوان" : "Title"} value={interactionForm.title} onChange={(e) => setInteractionForm({ ...interactionForm, title: e.target.value })} />
              <textarea className="crm-input" rows={2} placeholder={fa ? "توضیح تعامل" : "Interaction description"} value={interactionForm.description} onChange={(e) => setInteractionForm({ ...interactionForm, description: e.target.value })} />
              <button onClick={() => addInteraction()} className="crm-btn">
                <Plus size={16} />
                {fa ? "ثبت تعامل" : "Save interaction"}
              </button>
            </CrmForm>
          </div>
        </section>
      )}

      {activeTab === "financial" && (
        <CustomerFinancial
          customer={customer}
          summary={summary}
          invoices={invoices}
          ledger={ledger}
          fa={fa}
          money={money}
          n={n}
          loading={loading}
          onRefresh={loadCustomer360}
        />
      )}

      {activeTab === "timeline" && (
        <CustomerTimeline
          events={allTimeline}
          fa={fa}
          money={money}
          n={n}
          loading={loading}
          onRefresh={loadCustomer360}
          onAddNote={addNote}
          onDeleteEvent={removeNote}
        />
      )}

      {activeTab === "tasks" && (
        <CustomerTasks
          tasks={tasks}
          fa={fa}
          n={n}
          loading={loading}
          onRefresh={loadCustomer360}
          onCreateTask={addTask}
          onUpdateTask={editTask}
          onDeleteTask={removeTask}
        />
      )}

      {activeTab === "files" && (
        <CustomerFiles
          files={files}
          fa={fa}
          n={n}
          loading={loading}
          onRefresh={loadCustomer360}
          onUploadFile={uploadCustomerFile}
          onDeleteFile={deleteCustomerFile}
        />
      )}

      {activeTab === "ai" && (
        <CustomerAI
          customer={customer}
          summary={summary}
          invoices={invoices}
          ai={ai}
          fa={fa}
          money={money}
          n={n}
          loading={loading}
          onRefresh={loadCustomer360}
          onCreateTask={addTask}
          onCreateInteraction={addInteraction}
        />
      )}

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
        .crm-input::placeholder {
          color: rgba(203, 213, 225, .65);
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
      <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-2">
        {icon}
        {label}
      </div>
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
