import { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  Brain,
  RefreshCw,
  UsersRound,
  Target,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  Plus,
  CheckCircle2,
  Phone,
  Crown,
  Wallet,
} from "lucide-react";
import {
  getEnterpriseCrmOverview,
  createEnterpriseLead,
  createEnterpriseOpportunity,
  createEnterpriseFollowup,
  markEnterpriseFollowupDone,
  moveEnterpriseOpportunityStage,
} from "../services/api";
import JalaliDateField from "../components/forms/JalaliDateField";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";

const STAGE_COLORS = {
  new: "#22d3ee",
  contacted: "#60a5fa",
  meeting: "#a78bfa",
  proposal: "#f59e0b",
  negotiation: "#fb7185",
  won: "#22c55e",
  lost: "#ef4444",
};

function emptyLead() {
  return { name: "", phone: "", source: "manual", status: "new", value: 0, owner: "", note: "" };
}

function emptyOpportunity() {
  return { title: "", stage: "new", value: 0, probability: 20, owner: "", note: "" };
}

function emptyFollowup() {
  return { title: "", due_date: "", priority: "normal", channel: "call", note: "" };
}

export default function EnterpriseCRM() {
  const { language, dir, n, money } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [lead, setLead] = useState(emptyLead());
  const [opportunity, setOpportunity] = useState(emptyOpportunity());
  const [followup, setFollowup] = useState(emptyFollowup());
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setLoading(true);
      const res = await getEnterpriseCrmOverview();
      setData(res);
    } catch (error) {
      console.error(error);
      setMessage(language === "fa" ? "خطا در دریافت اطلاعات CRM Enterprise" : language === "ar" ? "خطأ في تحميل بيانات CRM Enterprise" : language === "tr" ? "Enterprise CRM verileri yüklenirken hata oluştu" : "Failed to load Enterprise CRM");
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [stableLoad]);

  const summary = data?.summary || {};
  const customerScores = useMemo(() => data?.customer_scores || [], [data]);
  const riskCustomers = data?.risk_customers || [];
  const stages = data?.pipeline_stages || [];
  const suggestions = data?.ai_suggestions || [];
  const followups = data?.followups || [];

  const topCustomers = useMemo(() => customerScores.slice(0, 8), [customerScores]);

  async function submitLead(e) {
    e.preventDefault();
    if (!lead.name.trim()) return;
    await createEnterpriseLead(lead);
    setLead(emptyLead());
    setMessage(language === "fa" ? "سرنخ جدید ثبت شد." : language === "ar" ? "تم تسجيل عميل محتمل جديد." : language === "tr" ? "Yeni potansiyel müşteri oluşturuldu." : "Lead created.");
    await load();
  }

  async function submitOpportunity(e) {
    e.preventDefault();
    if (!opportunity.title.trim()) return;
    await createEnterpriseOpportunity(opportunity);
    setOpportunity(emptyOpportunity());
    setMessage(language === "fa" ? "فرصت فروش ثبت شد." : language === "ar" ? "تم تسجيل الفرصة البيعية." : language === "tr" ? "Satış fırsatı oluşturuldu." : "Opportunity created.");
    await load();
  }

  async function submitFollowup(e) {
    e.preventDefault();
    if (!followup.title.trim()) return;
    await createEnterpriseFollowup(followup);
    setFollowup(emptyFollowup());
    setMessage(language === "fa" ? "پیگیری ثبت شد." : language === "ar" ? "تم تسجيل المتابعة." : language === "tr" ? "Takip oluşturuldu." : "Follow-up created.");
    await load();
  }

  async function moveStage(item, stage) {
    await moveEnterpriseOpportunityStage(item.id, stage);
    await load();
  }

  async function doneFollowup(id) {
    await markEnterpriseFollowupDone(id);
    await load();
  }

  return (
    <div
      dir={dir}
      style={{
        minHeight: "100vh",
        padding: 28,
        background:
          "radial-gradient(circle at top right, rgba(34,211,238,.18), transparent 28%), radial-gradient(circle at top left, rgba(168,85,247,.18), transparent 32%), #071028",
        color: "white",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 950, color: "#22d3ee", margin: 0 }}>
            {language === "fa" ? "CRM Enterprise هوشمند" : language === "ar" ? "CRM Enterprise الذكي" : language === "tr" ? "Akıllı Enterprise CRM" : "Enterprise CRM AI"}
          </h1>
          <p style={{ color: "#94a3b8", marginTop: 8 }}>
            {language === "fa" ? "مدیریت سرنخ، قیف فروش، امتیاز مشتری، ریسک ریزش و پیگیری‌ها" : language === "ar" ? "إدارة العملاء المحتملين وقمع المبيعات ودرجة العميل ومخاطر التسرب والمتابعات" : language === "tr" ? "Potansiyel müşteri, satış hunisi, müşteri puanlama, kayıp riski ve takip yönetimi" : "Leads, pipeline, customer scoring, churn risk and follow-ups"}
          </p>
        </div>
        <button onClick={load} style={primaryButton("#22d3ee", "#071028")}>
          <RefreshCw size={18} /> {loading ? (language === "fa" ? "در حال دریافت..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading...") : language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>

      {message && <div className="text-green-200" style={noticeStyle}>{message}</div>}

      <div style={gridCards}>
        <Kpi icon={<UsersRound />} label={language === "fa" ? "کل مشتریان" : language === "ar" ? "إجمالي العملاء" : language === "tr" ? "Toplam Müşteri" : "Customers"} value={n(summary.customers_count || 0)} color="#22d3ee" />
        <Kpi icon={<Crown />} label={language === "fa" ? "VIP / طلایی" : language === "ar" ? "VIP / ذهبي" : language === "tr" ? "VIP / Altın" : "VIP / Gold"} value={n(summary.vip_count || 0)} color="#f59e0b" />
        <Kpi icon={<AlertTriangle />} label={language === "fa" ? "ریسک ریزش" : language === "ar" ? "مخاطر التسرب" : language === "tr" ? "Kayıp riski" : "Churn risk"} value={n(summary.risk_count || 0)} color="#fb7185" />
        <Kpi icon={<Wallet />} label={language === "fa" ? "بدهکاران" : language === "ar" ? "المدينون" : language === "tr" ? "Borçlular" : "Debtors"} value={n(summary.debtors_count || 0)} color="#f97316" />
        <Kpi icon={<Target />} label={language === "fa" ? "ارزش قیف فروش" : language === "ar" ? "قيمة قمع المبيعات" : language === "tr" ? "Satış hunisi değeri" : "Pipeline value"} value={money(summary.pipeline_value || 0)} color="#22c55e" />
        <Kpi icon={<CalendarClock />} label={language === "fa" ? "پیگیری باز" : language === "ar" ? "متابعات مفتوحة" : language === "tr" ? "Açık takipler" : "Open follow-ups"} value={n(summary.open_followups || 0)} color="#a78bfa" />
      </div>

      <div style={tabsStyle}>
        {[
          ["pipeline", language === "fa" ? "قیف فروش" : language === "ar" ? "قمع المبيعات" : language === "tr" ? "Satış hunisi" : "Pipeline"],
          ["customers", language === "fa" ? "امتیاز مشتری" : language === "ar" ? "درجة العميل" : language === "tr" ? "Müşteri puanı" : "Customer Score"],
          ["leads", language === "fa" ? "سرنخ‌ها" : language === "ar" ? "العملاء المحتملون" : language === "tr" ? "Potansiyel müşteriler" : "Leads"],
          ["followups", language === "fa" ? "پیگیری‌ها" : language === "ar" ? "المتابعات" : language === "tr" ? "Takipler" : "Follow-ups"],
          ["ai", language === "fa" ? "پیشنهادهای AI" : language === "ar" ? "اقتراحات الذكاء الاصطناعي" : language === "tr" ? "Yapay zeka önerileri" : "AI Suggestions"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={tabButton(activeTab === key)}>{label}</button>
        ))}
      </div>

      {activeTab === "pipeline" && (
        <div style={sectionGrid}>
          <Panel title={language === "fa" ? "ایجاد فرصت فروش" : language === "ar" ? "إنشاء فرصة بيعية" : language === "tr" ? "Yeni satış fırsatı" : "New opportunity"} icon={<Plus />}>
            <form onSubmit={submitOpportunity} style={{ display: "grid", gap: 10 }}>
              <Input placeholder={language === "fa" ? "عنوان فرصت" : language === "ar" ? "عنوان الفرصة" : language === "tr" ? "Fırsat başlığı" : "Title"} value={opportunity.title} onChange={(v) => setOpportunity({ ...opportunity, title: v })} />
              <Input placeholder={language === "fa" ? "ارزش" : language === "ar" ? "القيمة" : language === "tr" ? "Değer" : "Value"} type="number" value={opportunity.value} onChange={(v) => setOpportunity({ ...opportunity, value: Number(v) })} />
              <Input placeholder={language === "fa" ? "مسئول" : language === "ar" ? "المسؤول" : language === "tr" ? "Sorumlu" : "Owner"} value={opportunity.owner} onChange={(v) => setOpportunity({ ...opportunity, owner: v })} />
              <select style={inputStyle} value={opportunity.stage} onChange={(e) => setOpportunity({ ...opportunity, stage: e.target.value })}>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button style={primaryButton()}>{language === "fa" ? "ثبت فرصت" : language === "ar" ? "إنشاء" : language === "tr" ? "Oluştur" : "Create"}</button>
            </form>
          </Panel>
          <div style={{ ...panelStyle, overflowX: "auto" }}>
            <h2 className="text-cyan-300" style={panelTitle}><Target size={20} /> {language === "fa" ? "Sales Pipeline" : language === "ar" ? "Sales Pipeline" : language === "tr" ? "Sales Pipeline" : "Sales Pipeline"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(210px, 1fr))", gap: 12 }}>
              {stages.map((stage) => (
                <div key={stage.key} style={{ background: "rgba(15,23,42,.72)", border: `1px solid ${STAGE_COLORS[stage.key]}55`, borderRadius: 18, padding: 12, minHeight: 280 }}>
                  <div style={{ color: STAGE_COLORS[stage.key], fontWeight: 900, marginBottom: 8 }}>{stage.label}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>{n(stage.count)} • {money(stage.value || 0)}</div>
                  {(stage.items || []).map((item) => (
                    <div key={item.id} style={cardMini}>
                      <b>{item.title}</b>
                      <span>{money(item.value || 0)}</span>
                      <select style={{ ...inputStyle, marginTop: 8, padding: 8 }} value={item.stage} onChange={(e) => moveStage(item, e.target.value)}>
                        {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "customers" && (
        <div style={sectionGrid}>
          <Panel title={language === "fa" ? "مشتریان برتر" : language === "ar" ? "أفضل العملاء" : language === "tr" ? "En iyi müşteriler" : "Top customers"} icon={<TrendingUp />}>
            {topCustomers.map((c) => <CustomerScore key={c.customer_id} c={c} money={money} n={n} />)}
          </Panel>
          <Panel title={language === "fa" ? "مشتریان در خطر" : language === "ar" ? "عملاء معرضون للخطر" : language === "tr" ? "Riskli müşteriler" : "Risk customers"} icon={<AlertTriangle />}>
            {riskCustomers.slice(0, 10).map((c) => <CustomerScore key={c.customer_id} c={c} money={money} n={n} />)}
            {!riskCustomers.length && <Empty language={language} />}
          </Panel>
        </div>
      )}

      {activeTab === "leads" && (
        <div style={sectionGrid}>
          <Panel title={language === "fa" ? "ثبت سرنخ جدید" : language === "ar" ? "تسجيل عميل محتمل جديد" : language === "tr" ? "Yeni potansiyel müşteri" : "New lead"} icon={<Plus />}>
            <form onSubmit={submitLead} style={{ display: "grid", gap: 10 }}>
              <Input placeholder={language === "fa" ? "نام" : language === "ar" ? "الاسم" : language === "tr" ? "Ad" : "Name"} value={lead.name} onChange={(v) => setLead({ ...lead, name: v })} />
              <Input placeholder={language === "fa" ? "موبایل" : language === "ar" ? "الجوال" : language === "tr" ? "Cep telefonu" : "Phone"} value={lead.phone} onChange={(v) => setLead({ ...lead, phone: v })} />
              <Input placeholder={language === "fa" ? "منبع جذب" : language === "ar" ? "مصدر الاكتساب" : language === "tr" ? "Kaynak" : "Source"} value={lead.source} onChange={(v) => setLead({ ...lead, source: v })} />
              <Input placeholder={language === "fa" ? "ارزش احتمالی" : language === "ar" ? "القيمة المحتملة" : language === "tr" ? "Tahmini değer" : "Value"} type="number" value={lead.value} onChange={(v) => setLead({ ...lead, value: Number(v) })} />
              <button style={primaryButton()}>{language === "fa" ? "ثبت سرنخ" : language === "ar" ? "إنشاء عميل محتمل" : language === "tr" ? "Potansiyel müşteri oluştur" : "Create lead"}</button>
            </form>
          </Panel>
          <Panel title={language === "fa" ? "آخرین سرنخ‌ها" : language === "ar" ? "أحدث العملاء المحتملين" : language === "tr" ? "Son potansiyel müşteriler" : "Latest leads"} icon={<Target />}>
            {(data?.leads || []).map((l) => (
              <div key={l.id} style={cardMini}>
                <b>{l.name}</b>
                <span>{l.phone || "-"}</span>
                <span>{l.source || "manual"} • {money(l.value || 0)}</span>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {activeTab === "followups" && (
        <div style={sectionGrid}>
          <Panel title={language === "fa" ? "ثبت پیگیری" : language === "ar" ? "تسجيل متابعة" : language === "tr" ? "Yeni takip" : "New follow-up"} icon={<CalendarClock />}>
            <form onSubmit={submitFollowup} style={{ display: "grid", gap: 10 }}>
              <Input placeholder={language === "fa" ? "عنوان پیگیری" : language === "ar" ? "عنوان المتابعة" : language === "tr" ? "Takip başlığı" : "Title"} value={followup.title} onChange={(v) => setFollowup({ ...followup, title: v })} />
              <JalaliDateField value={followup.due_date} onChange={(v) => setFollowup({ ...followup, due_date: v })} fa={language === "fa"} language={language} className="w-full bg-[#1e293b] text-white border border-[rgba(34,211,238,.18)] rounded-[14px] p-3" />
              <select style={inputStyle} value={followup.channel} onChange={(e) => setFollowup({ ...followup, channel: e.target.value })}>
                <option value="call">{language === "fa" ? "تماس" : language === "ar" ? "اتصال" : language === "tr" ? "Arama" : "Call"}</option>
                <option value="meeting">{language === "fa" ? "جلسه" : language === "ar" ? "اجتماع" : language === "tr" ? "Toplantı" : "Meeting"}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="collection">{language === "fa" ? "وصول مطالبات" : language === "ar" ? "تحصيل المستحقات" : language === "tr" ? "Alacak tahsilatı" : "Collection"}</option>
              </select>
              <button style={primaryButton()}>{language === "fa" ? "ثبت پیگیری" : language === "ar" ? "إنشاء متابعة" : language === "tr" ? "Takip oluştur" : "Create follow-up"}</button>
            </form>
          </Panel>
          <Panel title={language === "fa" ? "پیگیری‌های باز" : language === "ar" ? "المتابعات المفتوحة" : language === "tr" ? "Açık takipler" : "Open follow-ups"} icon={<Phone />}>
            {followups.map((f) => (
              <div key={f.id} style={cardMini}>
                <b>{f.title}</b>
                <span>{f.channel} • {f.due_date || "-"}</span>
                <button onClick={() => doneFollowup(f.id)} style={{ ...primaryButton("#22c55e", "#071028"), padding: "8px 10px", marginTop: 8 }}><CheckCircle2 size={15} /> {language === "fa" ? "انجام شد" : language === "ar" ? "تم" : language === "tr" ? "Tamamlandı" : "Done"}</button>
              </div>
            ))}
            {!followups.length && <Empty language={language} />}
          </Panel>
        </div>
      )}

      {activeTab === "ai" && (
        <div style={sectionGrid}>
          <Panel title={language === "fa" ? "پیشنهادهای هوشمند" : language === "ar" ? "اقتراحات ذكية" : language === "tr" ? "Akıllı öneriler" : "AI Suggestions"} icon={<Brain />}>
            {suggestions.map((s, index) => (
              <div key={index} style={{ ...cardMini, borderColor: s.priority === "high" ? "rgba(248,113,113,.45)" : "rgba(34,211,238,.22)" }}>
                <b>{s.title}</b>
                <span>{s.message}</span>
              </div>
            ))}
            {!suggestions.length && <Empty language={language} />}
          </Panel>
          <Panel title={language === "fa" ? "منطق AI CRM" : language === "ar" ? "منطق الذكاء الاصطناعي في CRM" : language === "tr" ? "CRM Yapay Zeka Mantığı" : "CRM AI Logic"} icon={<Brain />}>
            <ul style={{ color: "#cbd5e1", lineHeight: 2 }}>
              <li>{language === "fa" ? "امتیاز مشتری بر اساس مبلغ فروش، تعداد خرید، تازگی خرید و مانده بدهی محاسبه می‌شود." : language === "ar" ? "يتم احتساب درجة العميل بناءً على قيمة المبيعات وعدد المشتريات وحداثتها ورصيد الحساب." : language === "tr" ? "Müşteri puanı satış tutarı, satın alma sıklığı, güncelliği ve bakiyeye göre hesaplanır." : "Customer score is based on sales value, frequency, recency and balance."}</li>
              <li>{language === "fa" ? "ریسک ریزش بر اساس فاصله آخرین خرید و وضعیت پرداخت تعیین می‌شود." : language === "ar" ? "يتم تحديد مخاطر التسرب بناءً على مدة آخر عملية شراء وحالة السداد." : language === "tr" ? "Kayıp riski, son satın alma süresi ve ödeme durumuna göre belirlenir." : "Churn risk is based on purchase recency and payment status."}</li>
              <li>{language === "fa" ? "پیشنهادهای مدیریتی برای تماس، وصول مطالبات و فروش مجدد تولید می‌شود." : language === "ar" ? "يتم توليد اقتراحات إدارية للاتصال وتحصيل المستحقات وإعادة البيع." : language === "tr" ? "Arama, tahsilat ve yeniden satış için yönetimsel öneriler oluşturulur." : "Management suggestions are generated for follow-up, collection and resell."}</li>
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, color }) {
  return (
    <div style={{ ...panelStyle, minHeight: 115, borderColor: `${color}55` }}>
      <div style={{ color, display: "flex", justifyContent: "space-between", alignItems: "center" }}>{icon}<span style={{ fontSize: 13 }}>{label}</span></div>
      <div style={{ fontSize: 26, fontWeight: 950, marginTop: 14 }}>{value}</div>
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div style={panelStyle}>
      <h2 className="text-cyan-300" style={panelTitle}>{icon} {title}</h2>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  const { language } = useLanguage();
  if (type === "number") {
    return (
      <input
        type="text"
        inputMode="numeric"
        value={language === "fa" ? toPersianDigits(value) : value}
        onChange={(e) => onChange(cleanNumberInput(e.target.value))}
        placeholder={placeholder}
        style={inputStyle}
      />
    );
  }
  return <input type={type} value={value} onChange={(e) => onChange(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)} placeholder={placeholder} style={inputStyle} />;
}

function CustomerScore({ c, money, n }) {
  return (
    <div style={cardMini}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <b>{c.name}</b>
        <strong style={{ color: c.score >= 70 ? "#22c55e" : c.churn_risk >= 60 ? "#fb7185" : "#22d3ee" }}>{n(c.score)}</strong>
      </div>
      <span>{c.segment} • LTV: {money(c.ltv || 0)}</span>
      <span>Risk: {n(c.churn_risk || 0)}% • Balance: {money(c.balance || 0)}</span>
      <small style={{ color: "#94a3b8" }}>{c.recommendation}</small>
    </div>
  );
}

function Empty({ language }) {
  return <div style={{ color: "#94a3b8", padding: 18, textAlign: "center" }}>{language === "fa" ? "داده‌ای برای نمایش وجود ندارد." : language === "ar" ? "لا توجد بيانات لعرضها." : language === "tr" ? "Gösterilecek veri yok." : "No data."}</div>;
}

const panelStyle = {
  background: "rgba(15,23,42,.72)",
  border: "1px solid rgba(34,211,238,.18)",
  borderRadius: 24,
  padding: 20,
  boxShadow: "0 24px 70px rgba(0,0,0,.22)",
};

const panelTitle = { fontSize: 20, fontWeight: 900, display: "flex", gap: 10, alignItems: "center", marginTop: 0 };
const gridCards = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, marginBottom: 20 };
const sectionGrid = { display: "grid", gridTemplateColumns: "minmax(280px, .75fr) minmax(420px, 2fr)", gap: 18 };
const tabsStyle = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 };
const tabButton = (active) => ({ padding: "12px 18px", borderRadius: 16, border: "none", cursor: "pointer", fontWeight: 900, color: active ? "#071028" : "white", background: active ? "#22d3ee" : "#1e293b" });
const inputStyle = { width: "100%", background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.18)", borderRadius: 14, padding: 12, outline: "none", boxSizing: "border-box" };
const primaryButton = (bg = "#22d3ee", color = "#071028") => ({ background: bg, color, border: "none", borderRadius: 16, padding: "12px 16px", fontWeight: 950, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 });
const cardMini = { background: "rgba(30,41,59,.75)", border: "1px solid rgba(34,211,238,.16)", borderRadius: 16, padding: 12, marginBottom: 10, display: "grid", gap: 6, color: "#e2e8f0" };
const noticeStyle = { background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.25)", padding: 14, borderRadius: 16, marginBottom: 18, fontWeight: 800 };
