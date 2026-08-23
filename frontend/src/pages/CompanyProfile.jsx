import { useEffect, useState } from "react";
import { Building2, Download, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import {
  getCompanyProfile, updateCompanyProfile, getCompanyGoals, createCompanyGoal, updateCompanyGoal, deleteCompanyGoal,
  getCompanyDocuments, uploadCompanyDocument, deleteCompanyDocument, fetchAuthenticatedResource,
} from "../services/api";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";
import JalaliDateField from "../components/forms/JalaliDateField";
import Select from "../components/ui/Select";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const btnClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-2 disabled:opacity-60";
const labelClass = "text-sm block";
const labelTextClass = "block mb-1 text-[var(--erp-muted)]";

const TABS = ["identity", "activity", "mission", "contact", "banking", "goals", "documents", "relationships"];

const PROFILE_FIELDS = [
  "legal_name", "company_code", "company_type", "legal_form", "registration_number", "vat_number", "registration_date",
  "main_activity", "activity_description", "business_categories", "products_services", "target_markets",
  "geographic_scope", "business_model", "mission", "vision", "strategic_objectives", "annual_objectives",
  "province", "city", "district", "postal_code", "billing_address", "legal_address", "operational_address",
  "bank_name", "bank_account_holder", "bank_iban", "payment_instructions",
  "secondary_logo_data", "brand_primary_color", "brand_secondary_color",
];

export default function CompanyProfile() {
  const { dir, language, n, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);

  const [tab, setTab] = useState("identity");
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getCompanyProfile();
      setProfile(data);
      setDraft(Object.fromEntries(PROFILE_FIELDS.map((f) => [f, data[f] ?? ""])));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  function set(field, value) { setDraft((d) => ({ ...d, [field]: value })); }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateCompanyProfile(draft);
      toast.success(tr("پروفایل ذخیره شد.", "تم حفظ الملف.", "Profil kaydedildi.", "Profile saved."));
      await load();
    } catch (err) {
      if (err.status === 400) toast.error(err.message);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const tabLabel = (t) => ({
    identity: tr("هویت", "الهوية", "Kimlik", "Identity"),
    activity: tr("فعالیت کسب‌وکار", "نشاط الأعمال", "İş faaliyeti", "Business activity"),
    mission: tr("مأموریت و اهداف", "المهمة والأهداف", "Misyon ve hedefler", "Mission & objectives"),
    contact: tr("تماس و آدرس", "الاتصال والعنوان", "İletişim ve adres", "Contact & address"),
    banking: tr("بانکی و برند", "البنكي والعلامة التجارية", "Banka ve marka", "Banking & branding"),
    goals: tr("اهداف راهبردی", "الأهداف الاستراتيجية", "Stratejik hedefler", "Strategic goals"),
    documents: tr("مدارک شرکت", "مستندات الشركة", "Şirket belgeleri", "Company documents"),
    relationships: tr("ارتباطات", "العلاقات", "İlişkiler", "Relationships"),
  }[t] || t);

  if (loading || !profile) {
    return <div dir={dir} className="p-6 text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</div>;
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Building2 className="text-[var(--erp-accent)]" />
          {tr("پروفایل کامل شرکت", "الملف الشامل للشركة", "Tam Şirket Profili", "Complete Company Profile")}
        </h1>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-[var(--erp-muted)]">{pd(profile.trading_name)}</span>
          <span className={`px-2 py-1 rounded-lg font-black ${profile.is_active ? "bg-emerald-500/15 text-emerald-200" : "bg-zinc-500/15 text-zinc-300"}`}>
            {profile.is_active ? tr("فعال", "نشط", "Aktif", "Active") : tr("غیرفعال", "غير نشط", "Pasif", "Inactive")}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border ${tab === t ? "bg-[var(--erp-accent)] text-black border-transparent" : "bg-[var(--erp-panel-solid)] border-[var(--erp-border)]"}`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {["identity", "activity", "mission", "contact", "banking"].includes(tab) && (
        <form onSubmit={save} className={cardClass + " space-y-4"}>
          {tab === "identity" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className={labelClass}><span className={labelTextClass}>{tr("نام تجاری (از تنظیمات)", "الاسم التجاري (من الإعدادات)", "Ticari ad (Ayarlardan)", "Trading name (from Settings)")}</span><input className={inputClass} value={pd(profile.trading_name)} disabled /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("نام حقوقی", "الاسم القانوني", "Yasal ad", "Legal name")}</span><input className={inputClass} value={pd(draft.legal_name)} onChange={(e) => set("legal_name", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("کد شرکت", "رمز الشركة", "Şirket kodu", "Company code")}</span><input className={inputClass} value={pd(draft.company_code)} onChange={(e) => set("company_code", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}>
                <span className={labelTextClass}>{tr("نوع شرکت", "نوع الشركة", "Şirket türü", "Company type")}</span>
                <Select
                  className="w-full"
                  value={draft.company_type}
                  onChange={(value) => set("company_type", value)}
                  options={[
                    { value: "", label: "—" },
                    ...["sole_proprietorship", "partnership", "llc", "corporation", "cooperative", "other"].map((v) => ({ value: v, label: v })),
                  ]}
                />
              </label>
              <label className={labelClass}><span className={labelTextClass}>{tr("شکل حقوقی", "الشكل القانوني", "Yasal şekil", "Legal form")}</span><input className={inputClass} value={pd(draft.legal_form)} onChange={(e) => set("legal_form", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("شماره ثبت", "رقم التسجيل", "Tescil no", "Registration number")}</span><input className={inputClass} value={pd(draft.registration_number)} onChange={(e) => set("registration_number", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("شماره مالیات بر ارزش‌افزوده", "الرقم الضريبي (VAT)", "KDV no", "VAT number")}</span><input className={inputClass} value={pd(draft.vat_number)} onChange={(e) => set("vat_number", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("شناسه ملی (از تنظیمات)", "الهوية الوطنية (من الإعدادات)", "Ulusal kimlik (Ayarlardan)", "National ID (from Settings)")}</span><input className={inputClass} value={pd(profile.national_id)} disabled /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("تاریخ ثبت", "تاريخ التسجيل", "Tescil tarihi", "Registration date")}</span><JalaliDateField className={inputClass} value={draft.registration_date || ""} onChange={(iso) => set("registration_date", iso)} language={language} /></label>
            </div>
          )}

          {tab === "activity" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className={labelClass}><span className={labelTextClass}>{tr("فعالیت اصلی", "النشاط الرئيسي", "Ana faaliyet", "Main activity")}</span><input className={inputClass} value={pd(draft.main_activity)} onChange={(e) => set("main_activity", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("صنعت (از تنظیمات)", "الصناعة (من الإعدادات)", "Sektör (Ayarlardan)", "Industry (from Settings)")}</span><input className={inputClass} value={profile.industry} disabled /></label>
              <label className={labelClass + " md:col-span-2"}><span className={labelTextClass}>{tr("توضیح فعالیت", "وصف النشاط", "Faaliyet açıklaması", "Activity description")}</span><textarea rows={2} className={inputClass} value={pd(draft.activity_description)} onChange={(e) => set("activity_description", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("دسته‌های کسب‌وکار", "فئات الأعمال", "İş kategorileri", "Business categories")}</span><input className={inputClass} value={pd(draft.business_categories)} onChange={(e) => set("business_categories", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("محصولات/خدمات", "المنتجات/الخدمات", "Ürün/Hizmetler", "Products/Services")}</span><input className={inputClass} value={pd(draft.products_services)} onChange={(e) => set("products_services", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("بازارهای هدف", "الأسواق المستهدفة", "Hedef pazarlar", "Target markets")}</span><input className={inputClass} value={pd(draft.target_markets)} onChange={(e) => set("target_markets", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("محدوده جغرافیایی", "النطاق الجغرافي", "Coğrafi kapsam", "Geographic scope")}</span><input className={inputClass} value={pd(draft.geographic_scope)} onChange={(e) => set("geographic_scope", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass + " md:col-span-2"}><span className={labelTextClass}>{tr("مدل کسب‌وکار", "نموذج العمل", "İş modeli", "Business model")}</span><textarea rows={2} className={inputClass} value={pd(draft.business_model)} onChange={(e) => set("business_model", toEnglishDigits(e.target.value))} /></label>
            </div>
          )}

          {tab === "mission" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className={labelClass}><span className={labelTextClass}>{tr("مأموریت", "المهمة", "Misyon", "Mission")}</span><textarea rows={3} className={inputClass} value={pd(draft.mission)} onChange={(e) => set("mission", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("چشم‌انداز", "الرؤية", "Vizyon", "Vision")}</span><textarea rows={3} className={inputClass} value={pd(draft.vision)} onChange={(e) => set("vision", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("اهداف راهبردی", "الأهداف الاستراتيجية", "Stratejik hedefler", "Strategic objectives")}</span><textarea rows={3} className={inputClass} value={pd(draft.strategic_objectives)} onChange={(e) => set("strategic_objectives", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("اهداف سالانه", "الأهداف السنوية", "Yıllık hedefler", "Annual objectives")}</span><textarea rows={3} className={inputClass} value={pd(draft.annual_objectives)} onChange={(e) => set("annual_objectives", toEnglishDigits(e.target.value))} /></label>
            </div>
          )}

          {tab === "contact" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className={labelClass}><span className={labelTextClass}>{tr("استان", "المحافظة", "İl", "Province")}</span><input className={inputClass} value={pd(draft.province)} onChange={(e) => set("province", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("شهر", "المدينة", "Şehir", "City")}</span><input className={inputClass} value={pd(draft.city)} onChange={(e) => set("city", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("منطقه", "المنطقة", "İlçe", "District")}</span><input className={inputClass} value={pd(draft.district)} onChange={(e) => set("district", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("کد پستی", "الرمز البريدي", "Posta kodu", "Postal code")}</span><input className={inputClass} value={pd(draft.postal_code)} onChange={(e) => set("postal_code", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("تلفن (از تنظیمات)", "الهاتف (من الإعدادات)", "Telefon (Ayarlardan)", "Phone (from Settings)")}</span><input className={inputClass} value={pd(profile.phone)} disabled /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("ایمیل (از تنظیمات)", "البريد (من الإعدادات)", "E-posta (Ayarlardan)", "Email (from Settings)")}</span><input className={inputClass} value={profile.email} disabled /></label>
              <label className={labelClass + " md:col-span-3"}><span className={labelTextClass}>{tr("آدرس صورتحساب", "عنوان الفوترة", "Fatura adresi", "Billing address")}</span><textarea rows={2} className={inputClass} value={pd(draft.billing_address)} onChange={(e) => set("billing_address", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass + " md:col-span-3"}><span className={labelTextClass}>{tr("آدرس قانونی", "العنوان القانوني", "Yasal adres", "Legal address")}</span><textarea rows={2} className={inputClass} value={pd(draft.legal_address)} onChange={(e) => set("legal_address", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass + " md:col-span-3"}><span className={labelTextClass}>{tr("آدرس عملیاتی", "العنوان التشغيلي", "Operasyonel adres", "Operational address")}</span><textarea rows={2} className={inputClass} value={pd(draft.operational_address)} onChange={(e) => set("operational_address", toEnglishDigits(e.target.value))} /></label>
            </div>
          )}

          {tab === "banking" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className={labelClass}><span className={labelTextClass}>{tr("نام بانک", "اسم البنك", "Banka adı", "Bank name")}</span><input className={inputClass} value={pd(draft.bank_name)} onChange={(e) => set("bank_name", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("صاحب حساب", "صاحب الحساب", "Hesap sahibi", "Account holder")}</span><input className={inputClass} value={pd(draft.bank_account_holder)} onChange={(e) => set("bank_account_holder", toEnglishDigits(e.target.value))} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("شماره شبا/آیبان", "IBAN", "IBAN", "IBAN")}</span><input className={inputClass} value={draft.bank_iban} onChange={(e) => set("bank_iban", e.target.value)} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("رنگ اصلی برند", "لون العلامة الأساسي", "Ana marka rengi", "Brand primary color")}</span><input type="color" className={inputClass + " h-11"} value={draft.brand_primary_color || "#22d3ee"} onChange={(e) => set("brand_primary_color", e.target.value)} /></label>
              <label className={labelClass}><span className={labelTextClass}>{tr("رنگ ثانویه برند", "لون العلامة الثانوي", "İkincil marka rengi", "Brand secondary color")}</span><input type="color" className={inputClass + " h-11"} value={draft.brand_secondary_color || "#0f172a"} onChange={(e) => set("brand_secondary_color", e.target.value)} /></label>
              <label className={labelClass + " md:col-span-2"}><span className={labelTextClass}>{tr("دستورالعمل پرداخت", "تعليمات الدفع", "Ödeme talimatı", "Payment instructions")}</span><textarea rows={2} className={inputClass} value={pd(draft.payment_instructions)} onChange={(e) => set("payment_instructions", toEnglishDigits(e.target.value))} /></label>
              <p className="text-xs text-[var(--erp-muted)] md:col-span-2">{tr("لوگو از تنظیمات اصلی استفاده می‌شود؛ اینجا فقط رنگ برند و لوگوی ثانویه ذخیره می‌شود (هنوز در استودیوی طراحی مصرف نمی‌شود).", "يُستخدم الشعار من الإعدادات الرئيسية؛ هنا فقط لون العلامة والشعار الثانوي (لم يُستخدم بعد في استوديو التصميم).", "Logo, ana Ayarlar'dan kullanılır; burada yalnızca marka rengi ve ikincil logo saklanır (henüz Tasarım Stüdyosu'nda kullanılmıyor).", "Logo is reused from Settings; only brand color and a secondary logo are stored here (not yet consumed by Design Studio).")}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className={btnClass}>
              {saving ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره پروفایل", "حفظ الملف", "Profili kaydet", "Save profile")}
            </button>
          </div>
        </form>
      )}

      {tab === "goals" && <GoalsPanel tr={tr} n={n} date={date} language={language} />}
      {tab === "documents" && <DocumentsPanel tr={tr} n={n} date={date} language={language} />}
      {tab === "relationships" && (
        <div className={cardClass}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><div className="text-xs text-[var(--erp-muted)]">{tr("شعبه‌ها", "الفروع", "Şubeler", "Branches")}</div><div className="text-2xl font-black">{n(profile.relationships.branches_count)}</div></div>
            <div><div className="text-xs text-[var(--erp-muted)]">{tr("انبارها", "المستودعات", "Depolar", "Warehouses")}</div><div className="text-2xl font-black">{n(profile.relationships.warehouses_count)}</div></div>
            <div><div className="text-xs text-[var(--erp-muted)]">{tr("کاربران", "المستخدمون", "Kullanıcılar", "Users")}</div><div className="text-2xl font-black">{n(profile.relationships.users_count)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalsPanel({ tr, n, date, language }) {
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ title: "", measurable_target: "", start_date: "", target_date: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getCompanyGoals();
      setItems(data.items || []);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function addGoal(event) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await createCompanyGoal(draft);
      setDraft({ title: "", measurable_target: "", start_date: "", target_date: "" });
      await load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function changeStatus(goal, status) {
    try {
      await updateCompanyGoal(goal.id, { status });
      await load();
    } catch (err) { toast.error(err.message); }
  }

  async function remove(id) {
    try {
      await deleteCompanyGoal(id);
      await load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className={cardClass + " space-y-4"}>
      <form onSubmit={addGoal} className="flex flex-wrap gap-2">
        <input className={inputClass + " flex-1 min-w-[200px]"} placeholder={tr("عنوان هدف", "عنوان الهدف", "Hedef başlığı", "Goal title")} value={pd(draft.title)} onChange={(e) => setDraft({ ...draft, title: toEnglishDigits(e.target.value) })} />
        <input className={inputClass + " w-52"} placeholder={tr("شاخص قابل‌اندازه‌گیری", "مؤشر قابل للقياس", "Ölçülebilir hedef", "Measurable target")} value={pd(draft.measurable_target)} onChange={(e) => setDraft({ ...draft, measurable_target: toEnglishDigits(e.target.value) })} />
        <JalaliDateField className={inputClass + " w-40"} value={draft.target_date} onChange={(iso) => setDraft({ ...draft, target_date: iso })} language={language} />
        <button type="submit" disabled={saving} className={btnClass}><Plus size={16} /></button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead>
            <Th>#</Th>
            <Th>{tr("عنوان", "العنوان", "Başlık", "Title")}</Th>
            <Th>{tr("شاخص", "المؤشر", "Hedef", "Target")}</Th>
            <Th>{tr("پیشرفت", "التقدم", "İlerleme", "Progress")}</Th>
            <Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
            <Th>{tr("تاریخ هدف", "التاريخ المستهدف", "Hedef tarih", "Target date")}</Th>
            <Th align="end">{tr("عملیات", "إجراء", "İşlem", "Action")}</Th>
          </Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={7}>{tr("هدفی ثبت نشده.", "لا توجد أهداف.", "Hedef yok.", "No goals yet.")}</EmptyRow> : items.map((g, i) => (
              <Tr key={g.id}>
                <Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td>
                <Td className="font-bold">{pd(g.title)}</Td>
                <Td>{pd(g.measurable_target) || "—"}</Td>
                <Td>{n(g.progress_percent)}%</Td>
                <Td>
                  <Select
                    value={g.status}
                    onChange={(value) => changeStatus(g, value)}
                    options={["not_started", "in_progress", "completed", "at_risk", "cancelled"].map((s) => ({ value: s, label: s }))}
                  />
                </Td>
                <Td>{g.target_date ? date(g.target_date) : "—"}</Td>
                <Td align="end"><button onClick={() => remove(g.id)} className="text-red-300"><Trash2 size={16} /></button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function DocumentsPanel({ tr, n, date, language }) {
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState("registration");
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getCompanyDocuments();
      setItems(data.items || []);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function upload(event) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", documentType);
      formData.append("title", title);
      formData.append("expiry_date", expiryDate);
      await uploadCompanyDocument(formData);
      setFile(null); setTitle(""); setExpiryDate("");
      await load();
    } catch (err) { toast.error(err.message); } finally { setUploading(false); }
  }

  async function download(doc) {
    try {
      const response = await fetchAuthenticatedResource(`/api/company-profile/documents/${doc.id}/download`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = doc.file_name || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message); }
  }

  async function remove(id) {
    try {
      await deleteCompanyDocument(id);
      await load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className={cardClass + " space-y-4"}>
      <form onSubmit={upload} className="flex flex-wrap gap-2 items-center">
        <Select
          className="w-40"
          value={documentType}
          onChange={(value) => setDocumentType(value)}
          options={["registration", "tax", "license", "contract", "certification", "other"].map((t) => ({ value: t, label: t }))}
        />
        <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("عنوان", "العنوان", "Başlık", "Title")} value={pd(title)} onChange={(e) => setTitle(toEnglishDigits(e.target.value))} />
        <JalaliDateField className={inputClass + " w-40"} value={expiryDate} onChange={(iso) => setExpiryDate(iso)} language={language} placeholder={tr("تاریخ انقضا", "تاريخ الانتهاء", "Son geçerlilik", "Expiry date")} />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
        <button type="submit" disabled={uploading || !file} className={btnClass}>{tr("بارگذاری", "رفع", "Yükle", "Upload")}</button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead>
            <Th>#</Th>
            <Th>{tr("نوع", "النوع", "Tür", "Type")}</Th>
            <Th>{tr("عنوان", "العنوان", "Başlık", "Title")}</Th>
            <Th>{tr("تاریخ انقضا", "تاريخ الانتهاء", "Son geçerlilik", "Expiry")}</Th>
            <Th align="end">{tr("عملیات", "إجراء", "İşlem", "Action")}</Th>
          </Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("مدرکی بارگذاری نشده.", "لا توجد مستندات.", "Belge yok.", "No documents uploaded.")}</EmptyRow> : items.map((d, i) => (
              <Tr key={d.id}>
                <Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td>
                <Td>{d.document_type}</Td>
                <Td className="font-bold">{pd(d.title)}</Td>
                <Td>{d.expiry_date ? date(d.expiry_date) : "—"}</Td>
                <Td align="end" className="flex gap-2 justify-end">
                  <button onClick={() => download(d)} className="text-[var(--erp-accent)]"><Download size={16} /></button>
                  <button onClick={() => remove(d.id)} className="text-red-300"><Trash2 size={16} /></button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
