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
import { useLanguage } from "../localization/useLanguage";

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
  const fa = language === "fa";
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
      setMessage(fa ? "خطا در دریافت اطلاعات CRM Enterprise" : "Failed to load Enterprise CRM");
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
    setMessage(fa ? "سرنخ جدید ثبت شد." : "Lead created.");
    await load();
  }

  async function submitOpportunity(e) {
    e.preventDefault();
    if (!opportunity.title.trim()) return;
    await createEnterpriseOpportunity(opportunity);
    setOpportunity(emptyOpportunity());
    setMessage(fa ? "فرصت فروش ثبت شد." : "Opportunity created.");
    await load();
  }

  async function submitFollowup(e) {
    e.preventDefault();
    if (!followup.title.trim()) return;
    await createEnterpriseFollowup(followup);
    setFollowup(emptyFollowup());
    setMessage(fa ? "پیگیری ثبت شد." : "Follow-up created.");
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
            {fa ? "CRM Enterprise هوشمند" : "Enterprise CRM AI"}
          </h1>
          <p style={{ color: "#94a3b8", marginTop: 8 }}>
            {fa ? "مدیریت سرنخ، قیف فروش، امتیاز مشتری، ریسک ریزش و پیگیری‌ها" : "Leads, pipeline, customer scoring, churn risk and follow-ups"}
          </p>
        </div>
        <button onClick={load} style={primaryButton("#22d3ee", "#071028")}>
          <RefreshCw size={18} /> {loading ? (fa ? "در حال دریافت..." : "Loading...") : fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      {message && <div style={noticeStyle}>{message}</div>}

      <div style={gridCards}>
        <Kpi icon={<UsersRound />} label={fa ? "کل مشتریان" : "Customers"} value={n(summary.customers_count || 0)} color="#22d3ee" />
        <Kpi icon={<Crown />} label={fa ? "VIP / طلایی" : "VIP / Gold"} value={n(summary.vip_count || 0)} color="#f59e0b" />
        <Kpi icon={<AlertTriangle />} label={fa ? "ریسک ریزش" : "Churn risk"} value={n(summary.risk_count || 0)} color="#fb7185" />
        <Kpi icon={<Wallet />} label={fa ? "بدهکاران" : "Debtors"} value={n(summary.debtors_count || 0)} color="#f97316" />
        <Kpi icon={<Target />} label={fa ? "ارزش قیف فروش" : "Pipeline value"} value={money(summary.pipeline_value || 0)} color="#22c55e" />
        <Kpi icon={<CalendarClock />} label={fa ? "پیگیری باز" : "Open follow-ups"} value={n(summary.open_followups || 0)} color="#a78bfa" />
      </div>

      <div style={tabsStyle}>
        {[
          ["pipeline", fa ? "قیف فروش" : "Pipeline"],
          ["customers", fa ? "امتیاز مشتری" : "Customer Score"],
          ["leads", fa ? "سرنخ‌ها" : "Leads"],
          ["followups", fa ? "پیگیری‌ها" : "Follow-ups"],
          ["ai", fa ? "پیشنهادهای AI" : "AI Suggestions"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={tabButton(activeTab === key)}>{label}</button>
        ))}
      </div>

      {activeTab === "pipeline" && (
        <div style={sectionGrid}>
          <Panel title={fa ? "ایجاد فرصت فروش" : "New opportunity"} icon={<Plus />}>
            <form onSubmit={submitOpportunity} style={{ display: "grid", gap: 10 }}>
              <Input placeholder={fa ? "عنوان فرصت" : "Title"} value={opportunity.title} onChange={(v) => setOpportunity({ ...opportunity, title: v })} />
              <Input placeholder={fa ? "ارزش" : "Value"} type="number" value={opportunity.value} onChange={(v) => setOpportunity({ ...opportunity, value: Number(v) })} />
              <Input placeholder={fa ? "مسئول" : "Owner"} value={opportunity.owner} onChange={(v) => setOpportunity({ ...opportunity, owner: v })} />
              <select style={inputStyle} value={opportunity.stage} onChange={(e) => setOpportunity({ ...opportunity, stage: e.target.value })}>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button style={primaryButton()}>{fa ? "ثبت فرصت" : "Create"}</button>
            </form>
          </Panel>
          <div style={{ ...panelStyle, overflowX: "auto" }}>
            <h2 style={panelTitle}><Target size={20} /> {fa ? "Sales Pipeline" : "Sales Pipeline"}</h2>
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
          <Panel title={fa ? "مشتریان برتر" : "Top customers"} icon={<TrendingUp />}>
            {topCustomers.map((c) => <CustomerScore key={c.customer_id} c={c} money={money} n={n} />)}
          </Panel>
          <Panel title={fa ? "مشتریان در خطر" : "Risk customers"} icon={<AlertTriangle />}>
            {riskCustomers.slice(0, 10).map((c) => <CustomerScore key={c.customer_id} c={c} money={money} n={n} />)}
            {!riskCustomers.length && <Empty fa={fa} />}
          </Panel>
        </div>
      )}

      {activeTab === "leads" && (
        <div style={sectionGrid}>
          <Panel title={fa ? "ثبت سرنخ جدید" : "New lead"} icon={<Plus />}>
            <form onSubmit={submitLead} style={{ display: "grid", gap: 10 }}>
              <Input placeholder={fa ? "نام" : "Name"} value={lead.name} onChange={(v) => setLead({ ...lead, name: v })} />
              <Input placeholder={fa ? "موبایل" : "Phone"} value={lead.phone} onChange={(v) => setLead({ ...lead, phone: v })} />
              <Input placeholder={fa ? "منبع جذب" : "Source"} value={lead.source} onChange={(v) => setLead({ ...lead, source: v })} />
              <Input placeholder={fa ? "ارزش احتمالی" : "Value"} type="number" value={lead.value} onChange={(v) => setLead({ ...lead, value: Number(v) })} />
              <button style={primaryButton()}>{fa ? "ثبت سرنخ" : "Create lead"}</button>
            </form>
          </Panel>
          <Panel title={fa ? "آخرین سرنخ‌ها" : "Latest leads"} icon={<Target />}>
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
          <Panel title={fa ? "ثبت پیگیری" : "New follow-up"} icon={<CalendarClock />}>
            <form onSubmit={submitFollowup} style={{ display: "grid", gap: 10 }}>
              <Input placeholder={fa ? "عنوان پیگیری" : "Title"} value={followup.title} onChange={(v) => setFollowup({ ...followup, title: v })} />
              <Input type="date" value={followup.due_date} onChange={(v) => setFollowup({ ...followup, due_date: v })} />
              <select style={inputStyle} value={followup.channel} onChange={(e) => setFollowup({ ...followup, channel: e.target.value })}>
                <option value="call">{fa ? "تماس" : "Call"}</option>
                <option value="meeting">{fa ? "جلسه" : "Meeting"}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="collection">{fa ? "وصول مطالبات" : "Collection"}</option>
              </select>
              <button style={primaryButton()}>{fa ? "ثبت پیگیری" : "Create follow-up"}</button>
            </form>
          </Panel>
          <Panel title={fa ? "پیگیری‌های باز" : "Open follow-ups"} icon={<Phone />}>
            {followups.map((f) => (
              <div key={f.id} style={cardMini}>
                <b>{f.title}</b>
                <span>{f.channel} • {f.due_date || "-"}</span>
                <button onClick={() => doneFollowup(f.id)} style={{ ...primaryButton("#22c55e", "#071028"), padding: "8px 10px", marginTop: 8 }}><CheckCircle2 size={15} /> {fa ? "انجام شد" : "Done"}</button>
              </div>
            ))}
            {!followups.length && <Empty fa={fa} />}
          </Panel>
        </div>
      )}

      {activeTab === "ai" && (
        <div style={sectionGrid}>
          <Panel title={fa ? "پیشنهادهای هوشمند" : "AI Suggestions"} icon={<Brain />}>
            {suggestions.map((s, index) => (
              <div key={index} style={{ ...cardMini, borderColor: s.priority === "high" ? "rgba(248,113,113,.45)" : "rgba(34,211,238,.22)" }}>
                <b>{s.title}</b>
                <span>{s.message}</span>
              </div>
            ))}
            {!suggestions.length && <Empty fa={fa} />}
          </Panel>
          <Panel title={fa ? "منطق AI CRM" : "CRM AI Logic"} icon={<Brain />}>
            <ul style={{ color: "#cbd5e1", lineHeight: 2 }}>
              <li>{fa ? "امتیاز مشتری بر اساس مبلغ فروش، تعداد خرید، تازگی خرید و مانده بدهی محاسبه می‌شود." : "Customer score is based on sales value, frequency, recency and balance."}</li>
              <li>{fa ? "ریسک ریزش بر اساس فاصله آخرین خرید و وضعیت پرداخت تعیین می‌شود." : "Churn risk is based on purchase recency and payment status."}</li>
              <li>{fa ? "پیشنهادهای مدیریتی برای تماس، وصول مطالبات و فروش مجدد تولید می‌شود." : "Management suggestions are generated for follow-up, collection and resell."}</li>
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
      <h2 style={panelTitle}>{icon} {title}</h2>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />;
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

function Empty({ fa }) {
  return <div style={{ color: "#94a3b8", padding: 18, textAlign: "center" }}>{fa ? "داده‌ای برای نمایش وجود ندارد." : "No data."}</div>;
}

const panelStyle = {
  background: "rgba(15,23,42,.72)",
  border: "1px solid rgba(34,211,238,.18)",
  borderRadius: 24,
  padding: 20,
  boxShadow: "0 24px 70px rgba(0,0,0,.22)",
};

const panelTitle = { color: "#67e8f9", fontSize: 20, fontWeight: 900, display: "flex", gap: 10, alignItems: "center", marginTop: 0 };
const gridCards = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, marginBottom: 20 };
const sectionGrid = { display: "grid", gridTemplateColumns: "minmax(280px, .75fr) minmax(420px, 2fr)", gap: 18 };
const tabsStyle = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 };
const tabButton = (active) => ({ padding: "12px 18px", borderRadius: 16, border: "none", cursor: "pointer", fontWeight: 900, color: active ? "#071028" : "white", background: active ? "#22d3ee" : "#1e293b" });
const inputStyle = { width: "100%", background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.18)", borderRadius: 14, padding: 12, outline: "none", boxSizing: "border-box" };
const primaryButton = (bg = "#22d3ee", color = "#071028") => ({ background: bg, color, border: "none", borderRadius: 16, padding: "12px 16px", fontWeight: 950, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 });
const cardMini = { background: "rgba(30,41,59,.75)", border: "1px solid rgba(34,211,238,.16)", borderRadius: 16, padding: 12, marginBottom: 10, display: "grid", gap: 6, color: "#e2e8f0" };
const noticeStyle = { background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.25)", color: "#bbf7d0", padding: 14, borderRadius: 16, marginBottom: 18, fontWeight: 800 };
