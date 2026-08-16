import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CreditCard, Gift, Mail, MessageCircle, Phone, Plus, RefreshCw, ShieldAlert, Sparkles, Target, TrendingUp, Trophy, UserRound, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../../localization/useLanguage";
import { toPersianDigits } from "../../localization/helpers";
import { confirmAction } from "../../components/ui/confirmService";
import Select from "../../components/ui/Select";
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

function toNumber(value) {
  return Number(String(value ?? "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,،]/g, "").replace(/[^\d.-]/g, "") || 0);
}


function riskLabel(risk, language) {
  const mapFa = { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" };
  const mapAr = { low: "منخفض", medium: "متوسط", high: "مرتفع", critical: "حرج" };
  const mapTr = { low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik" };
  const mapEn = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
  const map = language === "fa" ? mapFa : language === "ar" ? mapAr : language === "tr" ? mapTr : mapEn;
  return map[risk] || risk || "-";
}

function levelLabel(level, language) {
  const mapFa = { VIP: "VIP", Platinum: "پلاتینیوم", Gold: "طلایی", Silver: "نقره‌ای", Bronze: "برنزی" };
  const mapAr = { VIP: "VIP", Platinum: "بلاتيني", Gold: "ذهبي", Silver: "فضي", Bronze: "برونزي" };
  const mapTr = { VIP: "VIP", Platinum: "Platin", Gold: "Altın", Silver: "Gümüş", Bronze: "Bronz" };
  const mapEn = { VIP: "VIP", Platinum: "Platinum", Gold: "Gold", Silver: "Silver", Bronze: "Bronze" };
  const map = language === "fa" ? mapFa : language === "ar" ? mapAr : language === "tr" ? mapTr : mapEn;
  return map[level] || level || "-";
}

function actionLabel(action, language) {
  const mapFa = {
    urgent_call: "تماس فوری",
    payment_followup: "پیگیری پرداخت",
    loyalty_offer: "پیشنهاد وفاداری",
    regular_followup: "پیگیری معمول",
    cross_sell: "پیشنهاد فروش مکمل",
    vip_retention: "حفظ مشتری VIP",
  };
  const mapAr = {
    urgent_call: "اتصال فوري",
    payment_followup: "متابعة الدفع",
    loyalty_offer: "عرض ولاء",
    regular_followup: "متابعة اعتيادية",
    cross_sell: "بيع تكميلي",
    vip_retention: "الاحتفاظ بعميل VIP",
  };
  const mapTr = {
    urgent_call: "Acil arama",
    payment_followup: "Ödeme takibi",
    loyalty_offer: "Sadakat teklifi",
    regular_followup: "Rutin takip",
    cross_sell: "Çapraz satış",
    vip_retention: "VIP müşteri koruma",
  };
  const mapEn = {
    urgent_call: "Urgent call",
    payment_followup: "Payment follow-up",
    loyalty_offer: "Loyalty offer",
    regular_followup: "Regular follow-up",
    cross_sell: "Cross-sell",
    vip_retention: "VIP retention",
  };
  const map = language === "fa" ? mapFa : language === "ar" ? mapAr : language === "tr" ? mapTr : mapEn;
  return map[action] || action || "-";
}

const tabs = [
  { id: "overview", fa: "نمای کلی", ar: "نظرة عامة", tr: "Genel bakış", en: "Overview" },
  { id: "financial", fa: "مالی", ar: "مالي", tr: "Finansal", en: "Financial" },
  { id: "timeline", fa: "تایم‌لاین", ar: "الجدول الزمني", tr: "Zaman çizelgesi", en: "Timeline" },
  { id: "tasks", fa: "وظایف", ar: "المهام", tr: "Görevler", en: "Tasks" },
  { id: "files", fa: "فایل‌ها", ar: "الملفات", tr: "Dosyalar", en: "Files" },
  { id: "ai", fa: "هوش فروش", ar: "ذكاء المبيعات", tr: "Satış zekası", en: "AI" },
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
      setMessage(
        language === "fa"
          ? "خطا در دریافت اطلاعات CRM. بک‌اند را ری‌استارت کن."
          : language === "ar"
          ? "خطأ في تحميل بيانات CRM. أعد تشغيل الخادم الخلفي."
          : language === "tr"
          ? "CRM verileri yüklenirken hata oluştu. Sunucuyu yeniden başlatın."
          : "CRM loading error. Restart backend."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void loadCustomer360(); }, 0);
    return () => clearTimeout(initialTimer);
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
    if (!(await confirmAction(language === "fa" ? "یادداشت حذف شود؟" : language === "ar" ? "هل تريد حذف الملاحظة؟" : language === "tr" ? "Not silinsin mi?" : "Delete note?"))) return;
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
    if (!(await confirmAction(language === "fa" ? "وظیفه حذف شود؟" : language === "ar" ? "هل تريد حذف المهمة؟" : language === "tr" ? "Görev silinsin mi?" : "Delete task?"))) return;
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
      note: language === "fa" ? "تبدیل امتیاز به اعتبار هدیه" : language === "ar" ? "استبدال النقاط برصيد هدية" : language === "tr" ? "Puanlar hediye bakiyesine dönüştürüldü" : "Redeemed loyalty points",
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

    setMessage(language === "fa" ? "فایل با موفقیت آپلود شد." : language === "ar" ? "تم رفع الملف بنجاح." : language === "tr" ? "Dosya başarıyla yüklendi." : "File uploaded.");
    await loadCustomer360();
  }

  async function deleteCustomerFile(fileId) {
    if (!(await confirmAction(language === "fa" ? "فایل حذف شود؟" : language === "ar" ? "هل تريد حذف الملف؟" : language === "tr" ? "Dosya silinsin mi?" : "Delete file?"))) return;

    const res = await fetch(`${API_BASE}/api/crm/files/${fileId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!res.ok) throw new Error("Delete failed");

    setMessage(language === "fa" ? "فایل حذف شد." : language === "ar" ? "تم حذف الملف." : language === "tr" ? "Dosya silindi." : "File deleted.");
    await loadCustomer360();
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
      title: note.title || (language === "fa" ? "یادداشت" : language === "ar" ? "ملاحظة" : language === "tr" ? "Not" : "Note"),
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
  }, [timeline, notes, tasks, language]);

  if (!customer) {
    return (
      <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] p-8">
        <Link to="/customers" className="text-[var(--erp-accent)] font-bold">
          {language === "fa" ? "بازگشت به طرف‌حساب‌ها" : language === "ar" ? "العودة إلى الأطراف" : language === "tr" ? "Carilere dön" : "Back to customers"}
        </Link>
        <div className="mt-6">
          {loading
            ? language === "fa"
              ? "در حال بارگذاری..."
              : language === "ar"
              ? "جارٍ التحميل..."
              : language === "tr"
              ? "Yükleniyor..."
              : "Loading..."
            : message || (language === "fa" ? "اطلاعاتی یافت نشد." : language === "ar" ? "لم يتم العثور على بيانات." : language === "tr" ? "Veri bulunamadı." : "No data found.")}
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
      className="min-h-screen p-6 space-y-6 text-[var(--erp-text)]"
      style={{
        direction: dir,
        background:
          "radial-gradient(circle at top left, var(--erp-glow), transparent 35%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 35%), var(--erp-bg)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/customers" className="inline-flex items-center gap-2 text-[var(--erp-accent)] font-bold mb-4">
            <ArrowLeft size={18} />
            {language === "fa" ? "بازگشت به طرف‌حساب‌ها" : language === "ar" ? "العودة إلى الأطراف" : language === "tr" ? "Carilere dön" : "Back to customers"}
          </Link>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">
            {language === "fa" ? "پرونده ۳۶۰ درجه طرف‌حساب" : language === "ar" ? "ملف الطرف 360 درجة" : language === "tr" ? "360 Derece Cari Profili" : "Customer 360 Enterprise"}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {language === "fa"
              ? "پرونده کامل مالی، CRM، وفاداری، فایل‌ها، وظایف، تایم‌لاین و هوش فروش مشتری"
              : language === "ar"
              ? "ملف موحّد للمالية وCRM والولاء والملفات والمهام والجدول الزمني وذكاء المبيعات"
              : language === "tr"
              ? "Birleşik finans, CRM, sadakat, dosyalar, görevler, zaman çizelgesi ve satış zekası"
              : "Unified finance, CRM, loyalty, files, tasks, timeline and sales intelligence"}
          </p>
        </div>

        <button
          onClick={loadCustomer360}
          disabled={loading}
          className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)] disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>

      {message && <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-4 text-emerald-200">{message}</div>}

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-5">
        <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-16 h-16 rounded-3xl bg-[var(--erp-glow)] border border-[var(--erp-border)] flex items-center justify-center text-[var(--erp-accent)]">
                  <UserRound size={32} />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-[var(--erp-text)]">{customer.name}</h2>
                  <p className="text-[var(--erp-muted)]">
                    {levelLabel(loyaltyLevel, language)} • {riskLabel(risk, language)} • {date(customer.created_at, { month: "long" })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-[var(--erp-glow)] text-[var(--erp-accent)] border border-[var(--erp-border)] text-xs font-bold">
                    {tag}
                  </span>
                ))}
                {!tags.length && (
                  <span className="px-3 py-1 rounded-full bg-slate-400/10 text-[var(--erp-muted)] border border-slate-400/20 text-xs font-bold">
                    {fa ? "بدون برچسب" : language === "ar" ? "بدون وسوم" : language === "tr" ? "Etiket yok" : "No tags"}
                  </span>
                )}
              </div>
            </div>

            <div className="text-center rounded-3xl bg-[var(--erp-panel-solid)] p-5 min-w-[160px]">
              <div className="text-[var(--erp-muted)] text-sm">
                {fa ? "امتیاز مشتری" : language === "ar" ? "درجة العميل" : language === "tr" ? "Müşteri puanı" : "Customer score"}
              </div>
              <div className="text-5xl font-black text-[var(--erp-accent)] mt-2">{n(score)}</div>
              <div className="text-xs text-[var(--erp-muted)]">/{n(100)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
            <Info icon={<Phone />} label={fa ? "تلفن" : language === "ar" ? "الهاتف" : language === "tr" ? "Telefon" : "Phone"} value={(fa ? toPersianDigits(customer.phone || customer.mobile) : customer.phone || customer.mobile) || "-"} />
            <Info icon={<Mail />} label={fa ? "ایمیل" : language === "ar" ? "البريد الإلكتروني" : language === "tr" ? "E-posta" : "Email"} value={customer.email || "-"} />
            <Info icon={<ShieldAlert />} label={fa ? "ریسک" : language === "ar" ? "المخاطر" : language === "tr" ? "Risk" : "Risk"} value={riskLabel(risk, language)} />
          </div>
        </div>

        <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-yellow-400/20 p-6 shadow-2xl">
          <h2 className="text-yellow-300 font-black text-xl flex items-center gap-2 mb-4">
            <Trophy />
            {fa ? "باشگاه مشتریان" : language === "ar" ? "برنامج ولاء العملاء" : language === "tr" ? "Müşteri sadakat kulübü" : "Customer Loyalty"}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Kpi title={fa ? "سطح" : language === "ar" ? "المستوى" : language === "tr" ? "Seviye" : "Level"} value={levelLabel(loyaltyLevel, language)} />
            <Kpi title={fa ? "امتیاز قابل استفاده" : language === "ar" ? "النقاط المتاحة" : language === "tr" ? "Kullanılabilir puan" : "Available points"} value={n(Math.round(toNumber(loyalty.points)))} />
            <Kpi title={fa ? "اعتبار هدیه" : language === "ar" ? "رصيد الهدايا" : language === "tr" ? "Hediye bakiyesi" : "Gift credit"} value={money(loyalty.gift_credit || 0)} />
            <Kpi title={fa ? "تخفیف اختصاصی" : language === "ar" ? "خصم حصري" : language === "tr" ? "Özel indirim" : "Discount"} value={`${n(loyalty.discount_percent || 0)}%`} />
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-[var(--erp-muted)] mb-2">
              <span>{fa ? "پیشرفت تا سطح بعدی" : language === "ar" ? "التقدّم إلى المستوى التالي" : language === "tr" ? "Sonraki seviyeye ilerleme" : "Next level progress"}</span>
              <span>{n(Math.round(progress))}%</span>
            </div>
            <div className="h-3 bg-[var(--erp-panel-solid)] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-cyan-400" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
            <input
              className="crm-input"
              placeholder={fa ? "مثلاً ۱۰۰ امتیاز" : language === "ar" ? "مثال: 100 نقطة" : language === "tr" ? "Örn. 100 puan" : "Points"}
              value={redeemPointsValue}
              onChange={(e) => setRedeemPointsValue(e.target.value)}
            />
            <button onClick={handleRedeemPoints} className="crm-btn" style={{ background: "#fde047" }}>
              <Gift size={16} />
              {fa ? "تبدیل" : language === "ar" ? "استبدال" : language === "tr" ? "Kullan" : "Redeem"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <Stat icon={<Wallet />} title={fa ? "مانده" : language === "ar" ? "الرصيد" : language === "tr" ? "Bakiye" : "Balance"} value={money(Math.abs(toNumber(summary.balance)))} />
        <Stat icon={<TrendingUp />} title={fa ? "ارزش خرید" : language === "ar" ? "القيمة الدائمة" : language === "tr" ? "Yaşam boyu değer" : "Lifetime value"} value={money(summary.lifetime_value || 0)} />
        <Stat icon={<CreditCard />} title={fa ? "تعداد فاکتور" : language === "ar" ? "عدد الفواتير" : language === "tr" ? "Fatura sayısı" : "Invoices"} value={n(summary.invoice_count || 0)} />
        <Stat icon={<Target />} title={fa ? "فاکتور باز" : language === "ar" ? "فواتير مفتوحة" : language === "tr" ? "Açık faturalar" : "Open invoices"} value={n(summary.open_invoice_count || 0)} />
        <Stat icon={<Sparkles />} title={fa ? "مصرف اعتبار" : language === "ar" ? "استخدام الائتمان" : language === "tr" ? "Kredi kullanımı" : "Credit usage"} value={`${n(creditUsage)}%`} />
      </section>

      <nav className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-2 flex gap-2 overflow-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 rounded-2xl font-black whitespace-nowrap transition ${
              activeTab === tab.id
                ? "bg-[var(--erp-accent)] text-slate-950"
                : "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)] hover:text-[var(--erp-accent)]"
            }`}
          >
            {fa ? tab.fa : language === "ar" ? tab.ar : language === "tr" ? tab.tr : tab.en}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
          <CustomerTimeline
            events={allTimeline}
            fa={fa}
            language={language}
            money={money}
            n={n}
            loading={loading}
            onRefresh={loadCustomer360}
            onAddNote={addNote}
            onDeleteEvent={removeNote}
          />

          <div className="space-y-5">
            <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-6 shadow-2xl">
              <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-4">
                <Sparkles />
                {fa ? "تحلیل سریع فروش" : language === "ar" ? "تحليل سريع للمبيعات" : language === "tr" ? "Hızlı satış analizi" : "Quick Sales Insight"}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <Kpi title={fa ? "احتمال خرید" : language === "ar" ? "احتمالية الشراء" : language === "tr" ? "Satın alma olasılığı" : "Purchase probability"} value={`${n(ai.purchase_probability || 0)}%`} />
                <Kpi title={fa ? "ریسک ریزش" : language === "ar" ? "مخاطر فقدان العميل" : language === "tr" ? "Kayıp riski" : "Churn risk"} value={`${n(ai.churn_risk || 0)}%`} />
                <Kpi title={fa ? "اقدام بعدی" : language === "ar" ? "الإجراء التالي" : language === "tr" ? "Sonraki eylem" : "Next action"} value={actionLabel(ai.next_action, language)} wide />
                <Kpi title={fa ? "تخفیف پیشنهادی" : language === "ar" ? "الخصم المقترح" : language === "tr" ? "Önerilen indirim" : "Suggested discount"} value={`${n(ai.suggested_discount || 0)}%`} wide />
              </div>
            </div>

            <CrmForm title={fa ? "ثبت یادداشت" : language === "ar" ? "إضافة ملاحظة" : language === "tr" ? "Not ekle" : "Add note"} icon={<MessageCircle />}>
              <input className="crm-input" placeholder={fa ? "عنوان" : language === "ar" ? "العنوان" : language === "tr" ? "Başlık" : "Title"} value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} />
              <textarea className="crm-input" rows={3} placeholder={fa ? "متن یادداشت" : language === "ar" ? "نص الملاحظة" : language === "tr" ? "Not metni" : "Note"} value={noteForm.text} onChange={(e) => setNoteForm({ ...noteForm, text: fa ? toPersianDigits(e.target.value) : e.target.value })} />
              <button onClick={() => addNote()} className="crm-btn">
                <Plus size={16} />
                {fa ? "ثبت یادداشت" : language === "ar" ? "حفظ الملاحظة" : language === "tr" ? "Notu kaydet" : "Save note"}
              </button>
            </CrmForm>

            <CrmForm title={fa ? "ثبت تماس / تعامل" : language === "ar" ? "إضافة تفاعل" : language === "tr" ? "Etkileşim ekle" : "Add interaction"} icon={<Phone />}>
              <Select
                value={interactionForm.interaction_type}
                onChange={(value) => setInteractionForm({ ...interactionForm, interaction_type: value })}
                options={[
                  { value: "call", label: fa ? "تماس" : language === "ar" ? "اتصال" : language === "tr" ? "Arama" : "Call" },
                  { value: "meeting", label: fa ? "جلسه" : language === "ar" ? "اجتماع" : language === "tr" ? "Toplantı" : "Meeting" },
                  { value: "sms", label: fa ? "پیامک" : language === "ar" ? "رسالة نصية" : language === "tr" ? "SMS" : "SMS" },
                  { value: "whatsapp", label: fa ? "واتساپ" : language === "ar" ? "واتساب" : language === "tr" ? "WhatsApp" : "WhatsApp" },
                ]}
              />
              <input className="crm-input" placeholder={fa ? "عنوان" : language === "ar" ? "العنوان" : language === "tr" ? "Başlık" : "Title"} value={interactionForm.title} onChange={(e) => setInteractionForm({ ...interactionForm, title: e.target.value })} />
              <textarea className="crm-input" rows={2} placeholder={fa ? "توضیح تعامل" : language === "ar" ? "وصف التفاعل" : language === "tr" ? "Etkileşim açıklaması" : "Interaction description"} value={interactionForm.description} onChange={(e) => setInteractionForm({ ...interactionForm, description: fa ? toPersianDigits(e.target.value) : e.target.value })} />
              <button onClick={() => addInteraction()} className="crm-btn">
                <Plus size={16} />
                {fa ? "ثبت تعامل" : language === "ar" ? "حفظ التفاعل" : language === "tr" ? "Etkileşimi kaydet" : "Save interaction"}
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
          language={language}
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
          language={language}
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
          language={language}
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
          language={language}
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
          language={language}
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
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border: 1px solid var(--erp-border);
          border-radius: 16px;
          padding: 12px;
          outline: none;
        }
        .crm-input::placeholder {
          color: var(--erp-muted);
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
    <div className="rounded-2xl bg-[var(--erp-panel-solid)] p-4">
      <div className="flex items-center gap-2 text-[var(--erp-muted)] text-xs font-bold mb-2">
        {icon}
        {label}
      </div>
      <div className="font-black text-[var(--erp-text)] break-words">{value}</div>
    </div>
  );
}

function Stat({ icon, title, value }) {
  return (
    <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div>
          <div className="text-2xl font-black text-[var(--erp-accent)] mt-2">{value}</div>
        </div>
        <div className="text-[var(--erp-accent)]">{icon}</div>
      </div>
    </div>
  );
}

function Kpi({ title, value, wide }) {
  return (
    <div className={`rounded-2xl bg-[var(--erp-panel-solid)] p-4 ${wide ? "col-span-2" : ""}`}>
      <div className="text-[var(--erp-muted)] text-xs font-bold">{title}</div>
      <div className="text-[var(--erp-text)] font-black mt-2">{value}</div>
    </div>
  );
}

function CrmForm({ title, icon, children }) {
  return (
    <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5">
      <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-4">
        {icon}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
