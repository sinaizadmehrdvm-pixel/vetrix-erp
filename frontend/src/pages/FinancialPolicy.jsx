import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, FileClock, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import JalaliDateField from "../components/forms/JalaliDateField";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import {
  activateFinancialPolicy,
  createFinancialPolicy,
  getActiveFinancialPolicy,
  getFinancialPolicies,
} from "../services/financialPolicyApi";

const CALENDAR_LABELS = {
  gregory: { fa: "میلادی", ar: "ميلادي", tr: "Miladi", en: "Gregorian" },
  persian: { fa: "شمسی (جلالی)", ar: "فارسي (جلالي)", tr: "Şemsi (Celali)", en: "Persian (Jalali)" },
  islamic: { fa: "قمری", ar: "هجري قمري", tr: "Hicri", en: "Islamic (Hijri)" },
  "islamic-umalqura": { fa: "قمری (ام‌القری)", ar: "هجري (أم القرى)", tr: "Hicri (Ümmülkura)", en: "Islamic (Umm al-Qura)" },
};

const ROUNDING_LABELS = {
  half_up: { fa: "گرد کردن معمولی (نیم به بالا)", ar: "تقريب عادي (نصف لأعلى)", tr: "Standart yuvarlama (yarımdan yukarı)", en: "Standard rounding (half up)" },
  half_even: { fa: "گرد کردن بانکی (نیم به زوج)", ar: "تقريب مصرفي (نصف للزوجي)", tr: "Bankacı yuvarlaması (yarımdan çifte)", en: "Banker's rounding (half to even)" },
  down: { fa: "همیشه رو به پایین", ar: "دائمًا للأسفل", tr: "Her zaman aşağı", en: "Always down" },
  up: { fa: "همیشه رو به بالا", ar: "دائمًا للأعلى", tr: "Her zaman yukarı", en: "Always up" },
};

const MEASUREMENT_LABELS = {
  metric: { fa: "متریک (کیلوگرم، متر)", ar: "متري (كيلوغرام، متر)", tr: "Metrik (kilogram, metre)", en: "Metric (kg, m)" },
  us: { fa: "آمریکایی (پوند، اینچ)", ar: "أمريكي (رطل، بوصة)", tr: "ABD (pound, inç)", en: "US (lb, in)" },
  imperial: { fa: "امپریال (پوند، فوت)", ar: "إمبراطوري (رطل، قدم)", tr: "İngiliz (pound, fit)", en: "Imperial (lb, ft)" },
};

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
    title: language === "fa" ? "سیاست مالی تأییدشده" : language === "ar" ? "السياسة المالية المعتمدة" : language === "tr" ? "Onaylı Mali Politika" : "Verified Financial Policy",
    subtitle: language === "fa" ? "نسخه‌بندی و کنترل اعشار، ارز و روش گردکردن اسناد مالی" : language === "ar" ? "إصدار ومراقبة العملة، الدقة العشرية، وطريقة التقريب للمستندات المالية" : language === "tr" ? "Mali belgeler için para birimi, ondalık hassasiyet ve yuvarlama yönteminin sürümlenmesi ve kontrolü" : "Version and govern currency, precision, and rounding for financial documents",
    active: language === "fa" ? "سیاست فعال" : language === "ar" ? "السياسة الفعالة" : language === "tr" ? "Aktif Politika" : "Active policy",
    compatibility: language === "fa" ? "حالت سازگاری قدیمی؛ هنوز سیاستی تأیید نشده است." : language === "ar" ? "وضع التوافق القديم؛ لا توجد سياسة معتمدة نشطة بعد." : language === "tr" ? "Uyumluluk modu; henüz onaylı bir politika etkin değil." : "Compatibility mode; no verified policy is active yet.",
    create: language === "fa" ? "ساخت نسخه پیش‌نویس" : language === "ar" ? "إنشاء نسخة مسودة" : language === "tr" ? "Taslak Sürüm Oluştur" : "Create draft version",
    version: language === "fa" ? "شناسه نسخه" : language === "ar" ? "معرّف النسخة" : language === "tr" ? "Sürüm Tanımlayıcısı" : "Version identifier",
    country: language === "fa" ? "کد کشور" : language === "ar" ? "رمز الدولة" : language === "tr" ? "Ülke Kodu" : "Country code",
    currency: language === "fa" ? "کد ارز" : language === "ar" ? "رمز العملة" : language === "tr" ? "Para Birimi Kodu" : "Currency code",
    decimals: language === "fa" ? "تعداد اعشار" : language === "ar" ? "عدد الخانات العشرية" : language === "tr" ? "Ondalık Basamak Sayısı" : "Decimal places",
    rounding: language === "fa" ? "روش گردکردن" : language === "ar" ? "طريقة التقريب" : language === "tr" ? "Yuvarlama Yöntemi" : "Rounding mode",
    effective: language === "fa" ? "تاریخ اجرای سیاست" : language === "ar" ? "تاريخ سريان السياسة" : language === "tr" ? "Politika Yürürlük Tarihi" : "Policy effective date",
    calendar: language === "fa" ? "تقویم اصلی" : language === "ar" ? "التقويم الأساسي" : language === "tr" ? "Ana Takvim" : "Primary calendar",
    timeZone: language === "fa" ? "منطقه زمانی" : language === "ar" ? "المنطقة الزمنية" : language === "tr" ? "Saat Dilimi" : "Time zone",
    firstDay: language === "fa" ? "اولین روز هفته" : language === "ar" ? "أول يوم في الأسبوع" : language === "tr" ? "Haftanın İlk Günü" : "First weekday",
    fiscalStart: language === "fa" ? "شروع سال مالی" : language === "ar" ? "بداية السنة المالية" : language === "tr" ? "Mali Yıl Başlangıcı" : "Fiscal year start",
    measurement: language === "fa" ? "سیستم اندازه‌گیری" : language === "ar" ? "نظام القياس" : language === "tr" ? "Ölçüm Sistemi" : "Measurement system",
    taxRate: language === "fa" ? "نرخ مالیات تأییدشده" : language === "ar" ? "معدل الضريبة المعتمد" : language === "tr" ? "Onaylı Vergi Oranı" : "Verified tax rate",
    save: language === "fa" ? "ذخیره پیش‌نویس" : language === "ar" ? "حفظ المسودة" : language === "tr" ? "Taslağı Kaydet" : "Save draft",
    history: language === "fa" ? "نسخه‌ها و سوابق" : language === "ar" ? "الإصدارات والسجل" : language === "tr" ? "Sürümler ve Geçmiş" : "Versions and history",
    status: language === "fa" ? "وضعیت" : language === "ar" ? "الحالة" : language === "tr" ? "Durum" : "Status",
    verify: language === "fa" ? "یادداشت تأیید مدیر" : language === "ar" ? "ملاحظة تحقق المدير" : language === "tr" ? "Yönetici Doğrulama Notu" : "Administrator verification note",
    activate: language === "fa" ? "تأیید و فعال‌سازی" : language === "ar" ? "التحقق والتفعيل" : language === "tr" ? "Doğrula ve Etkinleştir" : "Verify and activate",
    empty: language === "fa" ? "هنوز نسخه‌ای ثبت نشده است." : language === "ar" ? "لم يتم إنشاء أي نسخة من السياسة بعد." : language === "tr" ? "Henüz politika sürümü oluşturulmadı." : "No policy versions have been created.",
    warning: language === "fa" ? "فعال‌سازی فقط روی اسناد جدید از تاریخ اجرا اثر دارد و اسناد تاریخی را بازنویسی نمی‌کند. مقادیر قانونی و مالیاتی باید توسط حسابدار واجد صلاحیت کشور مربوطه کنترل شوند." : language === "ar" ? "التفعيل يؤثر فقط على المستندات الجديدة من تاريخ السريان ولا يعيد كتابة السجلات التاريخية أبدًا. يجب التحقق من القيم القانونية والضريبية من قبل محاسب مؤهل في الدولة المعنية." : language === "tr" ? "Etkinleştirme yalnızca yürürlük tarihinden itibaren yeni belgeleri etkiler ve geçmiş kayıtları asla yeniden yazmaz. Yasal ve vergisel değerler ilgili ülkede yetkili bir muhasebeci tarafından kontrol edilmelidir." : "Activation affects only new documents from the effective date and never rewrites historical records. Statutory and tax values must be checked by a qualified accountant in the relevant country.",
    created: language === "fa" ? "پیش‌نویس ساخته شد." : language === "ar" ? "تم إنشاء المسودة." : language === "tr" ? "Taslak politika oluşturuldu." : "Draft policy created.",
    activated: language === "fa" ? "سیاست مالی فعال شد." : language === "ar" ? "تم تفعيل السياسة المالية." : language === "tr" ? "Mali politika etkinleştirildi." : "Financial policy activated.",
  }), [language]);

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
  // Some select options (rounding mode, calendar, measurement system) have
  // long labels in every language (the longest Turkish rounding label is
  // ~36 characters). Giving the SELECT itself a wide min-width caused it
  // to overflow its grid cell and visually overlap the neighboring field
  // (a real regression seen in testing) - instead the wrapping <label>
  // spans two grid tracks (wideField below), which reserves real layout
  // space so nothing overlaps, and the select still fills that wider box.
  const wideField = { gridColumn: "span 2" };

  return <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1500, margin: "0 auto" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}><ShieldCheck size={31} /></div>
        <div><h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(28px,4vw,40px)" }}>{text.title}</h1><p style={{ margin: "6px 0 0", color: "var(--erp-muted)" }}>{text.subtitle}</p></div>
      </div>
      <button onClick={load} disabled={loading} className="erp-surface erp-accent" style={{ borderRadius: 14, padding: "11px 15px", fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}><RefreshCw size={17} />{loading ? "..." : (language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh")}</button>
    </header>

    <div style={{ ...card, padding: 18, marginBottom: 15, borderColor: active?.verified ? "rgba(34,197,94,.45)" : "rgba(245,158,11,.45)" }}>
      <h2 style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 0 }}><BadgeCheck color={active?.verified ? "#4ade80" : "#fbbf24"} />{text.active}</h2>
      {active?.verified ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <strong>{active.version}</strong><span>{active.country_code} · {active.currency_code}</span><span>{n(active.decimal_places)} {text.decimals}</span><span>{active.rounding_mode}</span>
        <span>{(CALENDAR_LABELS[active.calendar_system]?.[language]) || active.calendar_system} · {active.time_zone}</span><span>{text.taxRate}: {n(active.tax_percent)}%</span>
      </div> : <p style={{ color: "#fbbf24" }}>{text.compatibility}</p>}
    </div>

    <div style={{ ...card, padding: 16, marginBottom: 15, background: "rgba(245,158,11,.08)", borderColor: "rgba(245,158,11,.35)" }}>{text.warning}</div>

    <form onSubmit={submit} style={{ ...card, padding: 18, marginBottom: 16 }}>
      <h2 style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 0 }}><Plus />{text.create}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
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
        }} style={input}>{countries.map(item => <option key={item.code} value={item.code}>{language === "fa" ? item.name.fa : item.name.en}</option>)}</select></label>
        <label>{text.currency}<input required minLength={3} maxLength={3} value={draft.currency_code} onChange={e => setDraft({ ...draft, currency_code: e.target.value.toUpperCase() })} style={input} /></label>
        <label>{text.decimals}<select value={draft.decimal_places} onChange={e => setDraft({ ...draft, decimal_places: e.target.value })} style={input}>{[0,1,2,3,4].map(x => <option key={x} value={x}>{n(x)}</option>)}</select></label>
        <label style={wideField}>{text.rounding}<select value={draft.rounding_mode} onChange={e => setDraft({ ...draft, rounding_mode: e.target.value })} style={input}>{Object.keys(ROUNDING_LABELS).map(key => <option key={key} value={key}>{ROUNDING_LABELS[key][language] || ROUNDING_LABELS[key].en}</option>)}</select></label>
        <label>{text.effective}<JalaliDateField value={draft.effective_from} onChange={(iso) => setDraft({ ...draft, effective_from: iso })} fa={language === "fa"} language={language} className="bg-[var(--erp-bg)] text-[var(--erp-text)] border border-[var(--erp-border)] rounded-xl p-[11px_12px] w-full" /></label>
        <label style={wideField}>{text.calendar}<select value={draft.calendar_system} onChange={e => setDraft({ ...draft, calendar_system: e.target.value })} style={input}>{Object.keys(CALENDAR_LABELS).map(key => <option key={key} value={key}>{CALENDAR_LABELS[key][language] || CALENDAR_LABELS[key].en}</option>)}</select></label>
        <label>{text.timeZone}<input required value={draft.time_zone} onChange={e => setDraft({ ...draft, time_zone: e.target.value })} style={input} /></label>
        <label>{text.firstDay}<select value={draft.first_day_of_week} onChange={e => setDraft({ ...draft, first_day_of_week: e.target.value })} style={input}>{[0,1,2,3,4,5,6].map(x => <option key={x} value={x}>{n(x)}</option>)}</select></label>
        <label>{text.fiscalStart}<input required value={draft.fiscal_year_start} onChange={e => setDraft({ ...draft, fiscal_year_start: e.target.value })} style={input} /></label>
        <label style={wideField}>{text.measurement}<select value={draft.measurement_system} onChange={e => setDraft({ ...draft, measurement_system: e.target.value })} style={input}>{Object.keys(MEASUREMENT_LABELS).map(key => <option key={key} value={key}>{MEASUREMENT_LABELS[key][language] || MEASUREMENT_LABELS[key].en}</option>)}</select></label>
        <label>{text.taxRate}<input type="text" inputMode="numeric" required value={language === "fa" ? toPersianDigits(draft.tax_percent) : draft.tax_percent} onChange={e => setDraft({ ...draft, tax_percent: cleanNumberInput(e.target.value) })} style={input} /></label>
      </div>
      <button disabled={saving} style={{ marginTop: 13, border: 0, borderRadius: 13, padding: "11px 16px", background: "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028", fontWeight: 900 }}>{saving ? "..." : text.save}</button>
    </form>

    <section style={{ ...card, padding: 18 }}>
      <h2 style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 0 }}><FileClock />{text.history}</h2>
      {!policies.length && <p style={{ color: "var(--erp-muted)" }}>{text.empty}</p>}
      <div style={{ display: "grid", gap: 10 }}>{policies.map(policy => <article key={policy.id} style={{ padding: 14, border: "1px solid var(--erp-border)", borderRadius: 17, background: "var(--erp-bg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><strong style={{ color: "var(--erp-accent)" }}>{policy.version}</strong><span>{text.status}: {policy.status}</span><span>{policy.country_code} · {policy.currency_code} · {n(policy.decimal_places)}</span><span>{(CALENDAR_LABELS[policy.calendar_system]?.[language]) || policy.calendar_system} · {policy.time_zone}</span><span>{text.taxRate}: {n(policy.tax_percent)}%</span><span>{date(policy.effective_from)}</span></div>
        {policy.status === "draft" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 11 }}><input placeholder={text.verify} value={noteById[policy.id] || ""} onChange={e => setNoteById({ ...noteById, [policy.id]: e.target.value })} style={{ ...input, flex: "1 1 300px" }} /><button type="button" disabled={saving} onClick={() => activate(policy)} style={{ border: 0, borderRadius: 12, padding: "10px 14px", background: "#166534", color: "#dcfce7", fontWeight: 900 }}>{text.activate}</button></div>}
        {policy.verification_note && <small style={{ display: "block", marginTop: 9, color: "var(--erp-muted)" }}>{policy.verification_note} — {policy.verified_by_name || policy.verified_by}</small>}
      </article>)}</div>
    </section>
  </div>;
}
