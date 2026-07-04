import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  Flame,
  Mail,
  MapPin,
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

const API_URL = "http://127.0.0.1:8001";

const demoCustomer = {
  id: 1,
  name: "سعید",
  company: "Hyper Doctor",
  customer_type: "company",
  phone: "09120000000",
  email: "customer@example.com",
  city: "تهران",
  address: "تهران، خیابان ولیعصر",
  total_purchase: 89000000,
  total_paid: 41000000,
  debt: 48000000,
  credit_limit: 120000000,
  score: 88,
  risk_level: "medium",
  lifetime_value: 145000000,
  tags: "VIP, تجهیزات پزشکی, عمده",
};

const demoTimeline = [
  {
    id: 1,
    type: "invoice",
    title: "فاکتور فروش ثبت شد",
    description: "فاکتور فروش تجهیزات تنفسی",
    amount: 600000,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    type: "payment",
    title: "دریافت وجه",
    description: "دریافت بابت تسویه بخشی از بدهی",
    amount: 100000,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    type: "note",
    title: "یادداشت پیگیری",
    description: "برای خرید بعدی ماسک و فیلتر CPAP تماس گرفته شود.",
    amount: 0,
    created_at: new Date().toISOString(),
  },
];

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

function scoreGrade(score) {
  const s = toNumber(score);
  if (s >= 90) return "A+";
  if (s >= 75) return "A";
  if (s >= 55) return "B";
  return "C";
}

function timelineIcon(type) {
  if (type === "invoice") return <FileText size={18} />;
  if (type === "payment") return <CreditCard size={18} />;
  if (type === "call") return <Phone size={18} />;
  if (type === "task") return <BellRing size={18} />;
  return <MessageCircle size={18} />;
}

export default function Customer360() {
  const { id } = useParams();
  const { language, dir, money, n, date } = useLanguage();
  const fa = language === "fa";

  const [customer, setCustomer] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");

  async function api(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status === "error") {
      throw new Error(data?.message || data?.detail || `API ${res.status}`);
    }
    return data;
  }

  async function loadCustomer360() {
    try {
      setLoading(true);
      setMessage("");
      setOfflineMode(false);

      const [customerData, timelineData] = await Promise.all([
        api(`/crm/customers/${id}`),
        api(`/crm/customers/${id}/timeline`),
      ]);

      setCustomer(customerData);
      setTimeline(Array.isArray(timelineData) ? timelineData : []);
    } catch (error) {
      console.warn("CRM API not ready, using demo mode:", error);
      setOfflineMode(true);
      setCustomer({ ...demoCustomer, id: id || 1 });
      setTimeline(demoTimeline);
      setMessage(
        fa
          ? "فعلاً API کامل CRM فعال نیست؛ صفحه در حالت نمایشی اجرا شده است."
          : "Full CRM API is not active yet; running in demo mode."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomer360();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, language]);

  const ai = useMemo(() => {
    if (!customer) return null;
    const debt = toNumber(customer.debt);
    const totalPurchase = toNumber(customer.total_purchase);
    const score = toNumber(customer.score);
    const risk = customer.risk_level || "low";

    let recommendation = fa
      ? "وضعیت مشتری پایدار است. پیگیری منظم ادامه پیدا کند."
      : "Customer status is stable. Continue regular follow-up.";

    if (debt > 0 && risk !== "low") {
      recommendation = fa
        ? "این مشتری بدهی فعال دارد. پیشنهاد می‌شود پیگیری تسویه و پیشنهاد خرید بعدی با تخفیف کنترل‌شده انجام شود."
        : "This customer has active debt. Follow up settlement and offer controlled next-purchase incentive.";
    }

    if (score >= 85) {
      recommendation = fa
        ? "مشتری ارزشمند است. برای حفظ وفاداری، پیشنهاد ویژه یا قرارداد بلندمدت ارائه شود."
        : "High-value customer. Offer a loyalty incentive or long-term agreement.";
    }

    return {
      purchasePower: totalPurchase > 100000000 ? "high" : totalPurchase > 30000000 ? "medium" : "low",
      recommendation,
      nextAction: debt > 0 ? (fa ? "پیگیری پرداخت" : "Payment follow-up") : (fa ? "پیشنهاد فروش بعدی" : "Next sales offer"),
      churnRisk: risk === "high" ? 75 : risk === "medium" ? 45 : 15,
    };
  }, [customer, fa]);

  if (!customer) {
    return (
      <div dir={dir} className="min-h-screen bg-slate-950 text-white p-8">
        {fa ? "در حال بارگذاری..." : "Loading..."}
      </div>
    );
  }

  const score = toNumber(customer.score);
  const debt = toNumber(customer.debt);
  const creditLimit = toNumber(customer.credit_limit);
  const creditUsage = creditLimit > 0 ? Math.min(100, (debt / creditLimit) * 100) : 0;
  const tags = String(customer.tags || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

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
            {fa
              ? "اطلاعات مالی، ارتباطی، تایم‌لاین، امتیاز، ریسک و پیشنهاد هوشمند مشتری"
              : "Financial, contact, timeline, score, risk and AI recommendation"}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={loadCustomer360}
            disabled={loading}
            className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20 disabled:opacity-60"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {fa ? "به‌روزرسانی" : "Refresh"}
          </button>

          <button className="px-4 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2">
            <Plus size={18} />
            {fa ? "یادآوری جدید" : "New reminder"}
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-2xl p-4 bg-amber-500/10 border border-amber-400/20 text-amber-200 flex items-center gap-2">
          <ShieldAlert size={18} />
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <ProfileCard customer={customer} fa={fa} score={score} tags={tags} />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Kpi title={fa ? "کل خرید" : "Total purchase"} value={money(customer.total_purchase || 0)} icon={<TrendingUp />} color="text-emerald-300" />
          <Kpi title={fa ? "کل پرداخت" : "Total paid"} value={money(customer.total_paid || 0)} icon={<Wallet />} color="text-cyan-300" />
          <Kpi title={fa ? "مانده بدهی" : "Debt"} value={money(customer.debt || 0)} icon={<CreditCard />} color={debt > 0 ? "text-rose-300" : "text-emerald-300"} />
          <Kpi title={fa ? "ارزش طول عمر" : "Lifetime value"} value={money(customer.lifetime_value || 0)} icon={<Flame />} color="text-amber-300" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <Panel title={fa ? "هوش مشتری" : "Customer intelligence"} icon={<Sparkles />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SmartMetric title={fa ? "رتبه مشتری" : "Grade"} value={scoreGrade(score)} text={fa ? "بر اساس خرید، پرداخت و ریسک" : "Based on purchases, payments and risk"} icon={<Star />} />
            <SmartMetric title={fa ? "ریسک از دست دادن" : "Churn risk"} value={`${n(ai?.churnRisk || 0)}%`} text={riskLabel(customer.risk_level, fa)} icon={<ShieldAlert />} />
            <SmartMetric title={fa ? "اقدام بعدی" : "Next action"} value={ai?.nextAction || "-"} text={fa ? "پیشنهاد هوشمند سیستم" : "AI suggested action"} icon={<Target />} />
          </div>

          <div className="mt-5 rounded-3xl bg-cyan-500/10 border border-cyan-400/20 p-5">
            <div className="text-cyan-300 font-black flex items-center gap-2 mb-2">
              <Sparkles size={20} />
              {fa ? "پیشنهاد هوشمند Vetrix" : "Vetrix AI recommendation"}
            </div>
            <p className="text-slate-200 leading-8">{ai?.recommendation}</p>
          </div>
        </Panel>

        <Panel title={fa ? "اعتبار و ریسک مالی" : "Credit & financial risk"} icon={<CreditCard />}>
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-800/70 p-4">
              <div className="flex justify-between text-sm text-slate-400 mb-2">
                <span>{fa ? "مصرف اعتبار" : "Credit usage"}</span>
                <span>{n(creditUsage.toFixed(1))}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${creditUsage > 80 ? "bg-rose-400" : creditUsage > 50 ? "bg-amber-300" : "bg-emerald-400"}`}
                  style={{ width: `${creditUsage}%` }}
                />
              </div>
            </div>

            <RiskRow label={fa ? "سقف اعتبار" : "Credit limit"} value={money(creditLimit)} />
            <RiskRow label={fa ? "بدهی فعلی" : "Current debt"} value={money(debt)} danger={debt > 0} />
            <RiskRow label={fa ? "سطح ریسک" : "Risk level"} value={riskLabel(customer.risk_level, fa)} danger={customer.risk_level === "high"} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <Panel title={fa ? "تایم‌لاین مشتری" : "Customer timeline"} icon={<CalendarClock />}>
          <div className="space-y-3">
            {timeline.map((item) => (
              <TimelineItem key={item.id} item={item} money={money} date={date} />
            ))}
          </div>
        </Panel>

        <Panel title={fa ? "یادداشت و پیگیری" : "Notes & follow-up"} icon={<MessageCircle />}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            placeholder={fa ? "یادداشت داخلی برای این مشتری..." : "Internal note for this customer..."}
            className="w-full rounded-2xl bg-slate-800 text-white border border-cyan-500/10 p-4 outline-none"
          />
          <button
            onClick={() => {
              if (!note.trim()) return;
              setTimeline((prev) => [
                {
                  id: Date.now(),
                  type: "note",
                  title: fa ? "یادداشت داخلی" : "Internal note",
                  description: note,
                  amount: 0,
                  created_at: new Date().toISOString(),
                },
                ...prev,
              ]);
              setNote("");
            }}
            className="w-full mt-4 px-4 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black"
          >
            {fa ? "ثبت یادداشت" : "Save note"}
          </button>

          <div className="grid grid-cols-1 gap-3 mt-4">
            <ActionButton icon={<Phone />} text={fa ? "تماس با مشتری" : "Call customer"} />
            <ActionButton icon={<MessageCircle />} text={fa ? "ارسال واتساپ" : "Send WhatsApp"} />
            <ActionButton icon={<Mail />} text={fa ? "ارسال ایمیل" : "Send email"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ProfileCard({ customer, fa, score, tags }) {
  return (
    <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-500/20 p-6 shadow-2xl">
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 text-cyan-300 flex items-center justify-center">
          <UserRound size={42} />
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-black text-white">{customer.name}</h2>
          <div className="text-cyan-300 font-bold mt-1 flex items-center gap-2">
            <BadgeCheck size={18} />
            {scoreGrade(score)} / {score}
          </div>
          <div className="text-slate-400 mt-1">{customer.company || (fa ? "بدون شرکت" : "No company")}</div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <InfoLine icon={<Phone />} text={customer.phone || "-"} />
        <InfoLine icon={<Mail />} text={customer.email || "-"} />
        <InfoLine icon={<MapPin />} text={`${customer.city || ""} ${customer.address || ""}`.trim() || "-"} />
        <InfoLine icon={<Building2 />} text={customer.customer_type || "-"} />
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-200 border border-cyan-400/20 text-xs font-bold">
              {tag}
            </span>
          ))
        ) : (
          <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs">
            {fa ? "بدون برچسب" : "No tags"}
          </span>
        )}
      </div>
    </div>
  );
}

function Kpi({ title, value, icon, color }) {
  return (
    <div className="rounded-3xl bg-slate-900/70 border border-cyan-500/20 p-5 shadow-xl">
      <div className="flex items-center gap-2 text-slate-400 font-bold mb-3">
        <span className={color}>{icon}</span>
        {title}
      </div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-500/20 p-5 shadow-xl">
      <h2 className="text-xl font-black text-cyan-300 mb-5 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function SmartMetric({ title, value, text, icon }) {
  return (
    <div className="rounded-3xl bg-slate-800/70 p-5 border border-white/5">
      <div className="text-cyan-300 mb-3">{icon}</div>
      <div className="text-slate-400 text-sm font-bold">{title}</div>
      <div className="text-2xl font-black text-white mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-2">{text}</div>
    </div>
  );
}

function RiskRow({ label, value, danger }) {
  return (
    <div className="rounded-2xl bg-slate-800/70 p-4 flex items-center justify-between gap-3">
      <span className="text-slate-400 font-bold">{label}</span>
      <span className={`font-black ${danger ? "text-rose-300" : "text-emerald-300"}`}>{value}</span>
    </div>
  );
}

function TimelineItem({ item, money, date }) {
  return (
    <div className="rounded-2xl bg-slate-800/70 border border-white/5 p-4 flex items-start gap-3">
      <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 text-cyan-300 flex items-center justify-center">
        {timelineIcon(item.type)}
      </div>
      <div className="flex-1">
        <div className="font-black text-white">{item.title}</div>
        <div className="text-slate-400 text-sm mt-1">{item.description || "-"}</div>
        <div className="text-xs text-slate-500 mt-2">
          {date ? date(item.created_at) : String(item.created_at || "").slice(0, 10)}
          {toNumber(item.amount) > 0 ? ` • ${money(item.amount)}` : ""}
        </div>
      </div>
    </div>
  );
}

function InfoLine({ icon, text }) {
  return (
    <div className="flex items-center gap-3 text-slate-300">
      <span className="text-cyan-300">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function ActionButton({ icon, text }) {
  return (
    <button className="w-full rounded-2xl bg-slate-800 hover:bg-slate-700 border border-white/5 px-4 py-3 text-white font-bold flex items-center justify-center gap-2">
      <span className="text-cyan-300">{icon}</span>
      {text}
    </button>
  );
}
