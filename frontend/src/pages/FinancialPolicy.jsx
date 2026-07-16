import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, FileClock, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import {
  activateFinancialPolicy,
  createFinancialPolicy,
  getActiveFinancialPolicy,
  getFinancialPolicies,
} from "../services/financialPolicyApi";

function businessDate(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default function FinancialPolicy() {
  const { language, dir, country, currency, decimalPlaces, roundingMode, date, n, countries, countryProfile } = useLanguage();
  const fa = language === "fa";
  const today = businessDate(countryProfile.timeZone);
  const [policies, setPolicies] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noteById, setNoteById] = useState({});
  const [draft, setDraft] = useState({
    version: `${country || "GLOBAL"}-${today}`,
    country_code: country || "US",
    currency_code: currency || "USD",
    decimal_places: decimalPlaces ?? 2,
    rounding_mode: roundingMode || "half_up",
    effective_from: today,
    calendar_system: countryProfile.calendar,
    time_zone: countryProfile.timeZone,
    first_day_of_week: countryProfile.firstDayOfWeek,
    fiscal_year_start: countryProfile.fiscalYearStart,
    measurement_system: countryProfile.measurementSystem,
    tax_percent: 0,
  });
  const text = useMemo(() => ({
    title: fa ? "سیاست مالی تأییدشده" : "Verified Financial Policy",
    subtitle: fa ? "نسخه‌بندی و کنترل اعشار، ارز و روش گردکردن اسناد مالی" : "Version and govern currency, precision, and rounding for financial documents",
    active: fa ? "سیاست فعال" : "Active policy",
    compatibility: fa ? "حالت سازگاری قدیمی؛ هنوز سیاستی تأیید نشده است." : "Compatibility mode; no verified policy is active yet.",
    create: fa ? "ساخت نسخه پیش‌نویس" : "Create draft version",
    version: fa ? "شناسه نسخه" : "Version identifier",
    country: fa ? "کد کشور" : "Country code",
    currency: fa ? "کد ارز" : "Currency code",
    decimals: fa ? "تعداد اعشار" : "Decimal places",
    rounding: fa ? "روش گردکردن" : "Rounding mode",
    effective: fa ? "تاریخ اجرای سیاست" : "Policy effective date",
    calendar: fa ? "تقویم اصلی" : "Primary calendar",
    timeZone: fa ? "منطقه زمانی" : "Time zone",
    firstDay: fa ? "اولین روز هفته" : "First weekday",
    fiscalStart: fa ? "شروع سال مالی" : "Fiscal year start",
    measurement: fa ? "سیستم اندازه‌گیری" : "Measurement system",
    taxRate: fa ? "نرخ مالیات تأییدشده" : "Verified tax rate",
    save: fa ? "ذخیره پیش‌نویس" : "Save draft",
    history: fa ? "نسخه‌ها و سوابق" : "Versions and history",
    status: fa ? "وضعیت" : "Status",
    verify: fa ? "یادداشت تأیید مدیر" : "Administrator verification note",
    activate: fa ? "تأیید و فعال‌سازی" : "Verify and activate",
    empty: fa ? "هنوز نسخه‌ای ثبت نشده است." : "No policy versions have been created.",
    warning: fa ? "فعال‌سازی فقط روی اسناد جدید از تاریخ اجرا اثر دارد و اسناد تاریخی را بازنویسی نمی‌کند. مقادیر قانونی و مالیاتی باید توسط حسابدار واجد صلاحیت کشور مربوطه کنترل شوند." : "Activation affects only new documents from the effective date and never rewrites historical records. Statutory and tax values must be checked by a qualified accountant in the relevant country.",
    created: fa ? "پیش‌نویس ساخته شد." : "Draft policy created.",
    activated: fa ? "سیاست مالی فعال شد." : "Financial policy activated.",
  }), [fa]);

  async function load() {
    setLoading(true);
    try {
      const [list, current] = await Promise.all([getFinancialPolicies(), getActiveFinancialPolicy()]);
      setPolicies(list);
      setActive(current);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await createFinancialPolicy({
        ...draft,
        country_code: draft.country_code.toUpperCase(),
        currency_code: draft.currency_code.toUpperCase(),
        decimal_places: Number(draft.decimal_places),
        first_day_of_week: Number(draft.first_day_of_week),
        tax_percent: Number(draft.tax_percent),
      });
      toast.success(text.created);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function activate(policy) {
    const note = (noteById[policy.id] || "").trim();
    if (note.length < 3) {
      toast.error(text.verify);
      return;
    }
    setSaving(true);
    try {
      await activateFinancialPolicy(policy.id, note);
      toast.success(text.activated);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const card = { background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 24, boxShadow: "0 18px 55px rgba(2,6,23,.28)" };
  const input = { background: "var(--erp-bg)", color: "var(--erp-text)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: "11px 12px", width: "100%" };

  return <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1500, margin: "0 auto" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}><ShieldCheck size={31} /></div>
        <div><h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(28px,4vw,40px)" }}>{text.title}</h1><p style={{ margin: "6px 0 0", color: "var(--erp-muted)" }}>{text.subtitle}</p></div>
      </div>
      <button onClick={load} disabled={loading} className="erp-surface erp-accent" style={{ borderRadius: 14, padding: "11px 15px", fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}><RefreshCw size={17} />{loading ? "..." : (fa ? "به‌روزرسانی" : "Refresh")}</button>
    </header>

    <div style={{ ...card, padding: 18, marginBottom: 15, borderColor: active?.verified ? "rgba(34,197,94,.45)" : "rgba(245,158,11,.45)" }}>
      <h2 style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 0 }}><BadgeCheck color={active?.verified ? "#4ade80" : "#fbbf24"} />{text.active}</h2>
      {active?.verified ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <strong>{active.version}</strong><span>{active.country_code} · {active.currency_code}</span><span>{n(active.decimal_places)} {text.decimals}</span><span>{active.rounding_mode}</span>
        <span>{active.calendar_system} · {active.time_zone}</span><span>{text.taxRate}: {n(active.tax_percent)}%</span>
      </div> : <p style={{ color: "#fbbf24" }}>{text.compatibility}</p>}
    </div>

    <div style={{ ...card, padding: 16, marginBottom: 15, background: "rgba(245,158,11,.08)", borderColor: "rgba(245,158,11,.35)" }}>{text.warning}</div>

    <form onSubmit={submit} style={{ ...card, padding: 18, marginBottom: 16 }}>
      <h2 style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 0 }}><Plus />{text.create}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <label>{text.version}<input required maxLength={80} value={draft.version} onChange={e => setDraft({ ...draft, version: e.target.value })} style={input} /></label>
        <label>{text.country}<select value={draft.country_code} onChange={e => {
          const profile = countries.find(item => item.code === e.target.value);
          if (!profile) return;
          setDraft({
            ...draft,
            country_code: profile.code,
            currency_code: profile.currency,
            decimal_places: profile.currencyDigits,
            calendar_system: profile.calendar,
            time_zone: profile.timeZone,
            first_day_of_week: profile.firstDayOfWeek,
            fiscal_year_start: profile.fiscalYearStart,
            measurement_system: profile.measurementSystem,
            version: `${profile.code}-${today}`,
          });
        }} style={input}>{countries.map(item => <option key={item.code} value={item.code}>{fa ? item.name.fa : item.name.en}</option>)}</select></label>
        <label>{text.currency}<input required minLength={3} maxLength={3} value={draft.currency_code} onChange={e => setDraft({ ...draft, currency_code: e.target.value.toUpperCase() })} style={input} /></label>
        <label>{text.decimals}<select value={draft.decimal_places} onChange={e => setDraft({ ...draft, decimal_places: e.target.value })} style={input}>{[0,1,2,3,4].map(x => <option key={x} value={x}>{n(x)}</option>)}</select></label>
        <label>{text.rounding}<select value={draft.rounding_mode} onChange={e => setDraft({ ...draft, rounding_mode: e.target.value })} style={input}><option value="half_up">half_up</option><option value="half_even">half_even</option><option value="down">down</option><option value="up">up</option></select></label>
        <label>{text.effective}<input type="date" required value={draft.effective_from} onChange={e => setDraft({ ...draft, effective_from: e.target.value })} style={input} /></label>
        <label>{text.calendar}<select value={draft.calendar_system} onChange={e => setDraft({ ...draft, calendar_system: e.target.value })} style={input}><option value="gregory">gregory</option><option value="persian">persian</option><option value="islamic">islamic</option><option value="islamic-umalqura">islamic-umalqura</option></select></label>
        <label>{text.timeZone}<input required value={draft.time_zone} onChange={e => setDraft({ ...draft, time_zone: e.target.value })} style={input} /></label>
        <label>{text.firstDay}<select value={draft.first_day_of_week} onChange={e => setDraft({ ...draft, first_day_of_week: e.target.value })} style={input}>{[0,1,2,3,4,5,6].map(x => <option key={x} value={x}>{n(x)}</option>)}</select></label>
        <label>{text.fiscalStart}<input required value={draft.fiscal_year_start} onChange={e => setDraft({ ...draft, fiscal_year_start: e.target.value })} style={input} /></label>
        <label>{text.measurement}<select value={draft.measurement_system} onChange={e => setDraft({ ...draft, measurement_system: e.target.value })} style={input}><option value="metric">metric</option><option value="us">US</option><option value="imperial">imperial</option></select></label>
        <label>{text.taxRate}<input type="number" min="0" max="100" step="0.01" required value={draft.tax_percent} onChange={e => setDraft({ ...draft, tax_percent: e.target.value })} style={input} /></label>
      </div>
      <button disabled={saving} style={{ marginTop: 13, border: 0, borderRadius: 13, padding: "11px 16px", background: "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028", fontWeight: 900 }}>{saving ? "..." : text.save}</button>
    </form>

    <section style={{ ...card, padding: 18 }}>
      <h2 style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 0 }}><FileClock />{text.history}</h2>
      {!policies.length && <p style={{ color: "var(--erp-muted)" }}>{text.empty}</p>}
      <div style={{ display: "grid", gap: 10 }}>{policies.map(policy => <article key={policy.id} style={{ padding: 14, border: "1px solid var(--erp-border)", borderRadius: 17, background: "var(--erp-bg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><strong style={{ color: "var(--erp-accent)" }}>{policy.version}</strong><span>{text.status}: {policy.status}</span><span>{policy.country_code} · {policy.currency_code} · {n(policy.decimal_places)}</span><span>{policy.calendar_system} · {policy.time_zone}</span><span>{text.taxRate}: {n(policy.tax_percent)}%</span><span>{date(policy.effective_from)}</span></div>
        {policy.status === "draft" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 11 }}><input placeholder={text.verify} value={noteById[policy.id] || ""} onChange={e => setNoteById({ ...noteById, [policy.id]: e.target.value })} style={{ ...input, flex: "1 1 300px" }} /><button type="button" disabled={saving} onClick={() => activate(policy)} style={{ border: 0, borderRadius: 12, padding: "10px 14px", background: "#166534", color: "#dcfce7", fontWeight: 900 }}>{text.activate}</button></div>}
        {policy.verification_note && <small style={{ display: "block", marginTop: 9, color: "var(--erp-muted)" }}>{policy.verification_note} — {policy.verified_by_name || policy.verified_by}</small>}
      </article>)}</div>
    </section>
  </div>;
}
