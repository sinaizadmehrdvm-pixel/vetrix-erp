import { useEffect, useState } from "react";
import {
  Building2,
  Save,
  RefreshCw,
  Languages,
  FileText,
  Wallet,
  Palette,
  Upload,
  ShieldCheck,
  Bell,
  Globe2,
  CalendarDays,
} from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { API_URL, getAuthHeaders } from "../services/api";
import { useTheme } from "../theme/useTheme";

const emptySettings = {
  company_name: "Vetrix ERP",
  manager_name: "",
  phone: "",
  mobile: "",
  email: "",
  website: "",
  address: "",
  national_id: "",
  economic_code: "",
  currency: "تومان",
  country_code: "IR",
  locale_code: "fa-IR",
  currency_code: "IRR",
  calendar_system: "persian",
  time_zone: "Asia/Tehran",
  first_day_of_week: 6,
  fiscal_year_start: "01-01-persian",
  tax_profile_version: "",
  tax_profile_verified_at: "",
  rounding_mode: "half_up",
  decimal_places: 0,
  measurement_system: "metric",
  tax_percent: 10,
  discount_percent: 0,
  fiscal_year: "",
  invoice_footer: "",
  show_qr: true,
  show_barcode: true,
  show_logo: true,
  logo_data: "",
  stamp_data: "",
  signature_data: "",
  theme: "dark",
  low_stock_default: 5,
  auto_backup: false,
  sms_panel: "",
  sms_api_key: "",
};

const inputClass =
  "bg-slate-800 text-white placeholder-slate-400 border border-cyan-500/10 focus:border-cyan-400 rounded-2xl p-4 outline-none transition-all w-full";

function toPersianDigits(value) {
  return String(value ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function toEnglishDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function showDigits(value, fa) {
  return fa ? toPersianDigits(value) : String(value ?? "");
}

function cleanNumber(value) {
  return toEnglishDigits(value).replace(/[,،]/g, "").replace(/[^\d.-]/g, "");
}

function toNumber(value) {
  const num = Number(cleanNumber(value));
  return Number.isFinite(num) ? num : 0;
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const max = 700;
        let { width, height } = img;

        if (width > height && width > max) {
          height = Math.round((height * max) / width);
          width = max;
        } else if (height > max) {
          width = Math.round((width * max) / height);
          height = max;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { language, setLanguage, languages, dir, t, country, setCountry, setCompanyFormatting, countries, countryProfile } = useLanguage();
  const fa = language === "fa";
  const { theme, themes, setTheme } = useTheme();

  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const label = {
    title: fa ? "تنظیمات" : "Settings",
    subtitle: fa
      ? "مدیریت اطلاعات شرکت، فاکتور، مالیات، ظاهر، لوگو و تنظیمات اصلی سیستم"
      : "Manage company info, invoices, tax, theme, logo and core settings",
    language: fa ? "زبان سیستم" : "System Language",
    company: fa ? "اطلاعات شرکت" : "Company Information",
    media: fa ? "لوگو، مهر و امضا" : "Logo, Stamp & Signature",
    invoice: fa ? "تنظیمات فاکتور" : "Invoice Settings",
    finance: fa ? "تنظیمات مالی" : "Financial Settings",
    appearance: fa ? "ظاهر برنامه" : "Appearance",
    backupSms: fa ? "بکاپ و پیامک" : "Backup & SMS",
    save: fa ? "ذخیره تنظیمات" : "Save Settings",
    refresh: fa ? "دریافت مجدد" : "Refresh",
    saving: fa ? "در حال ذخیره..." : "Saving...",
    loading: fa ? "در حال دریافت..." : "Loading...",
    saved: fa ? "تنظیمات با موفقیت ذخیره شد." : "Settings saved successfully.",
    error: fa ? "خطا در دریافت یا ذخیره تنظیمات." : "Error loading or saving settings.",
    imageSelect: fa ? "انتخاب تصویر" : "Choose image",
  };

  async function loadSettings() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch(`${API_URL}/settings`, { headers: getAuthHeaders() });
      const data = await res.json();

      if (!res.ok || data?.status === "error") {
        throw new Error(data?.message || "Settings error");
      }

      setSettings({ ...emptySettings, ...data });
      if (data?.theme) setTheme(data.theme);
      if (data?.country_code) setCountry(data.country_code);
      if (data) setCompanyFormatting(data);
    } catch (error) {
      console.error("Settings loading error:", error);
      setMessage(label.error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      setSaving(true);
      setMessage("");

      const payload = {
        ...settings,
        phone: toEnglishDigits(settings.phone),
        mobile: toEnglishDigits(settings.mobile),
        national_id: toEnglishDigits(settings.national_id),
        economic_code: toEnglishDigits(settings.economic_code),
        tax_percent: toNumber(settings.tax_percent),
        discount_percent: toNumber(settings.discount_percent),
        fiscal_year: toEnglishDigits(settings.fiscal_year),
        low_stock_default: toNumber(settings.low_stock_default),
      };

      const res = await fetch(`${API_URL}/settings`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.status === "error") {
        throw new Error(data?.message || "Save error");
      }

      setMessage(label.saved);
      await loadSettings();
    } catch (error) {
      console.error("Settings save error:", error);
      setMessage(label.error);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void loadSettings(); }, 0);
    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function setNumberField(key, value) {
    setSettings((prev) => ({ ...prev, [key]: cleanNumber(value) }));
  }

  async function handleImage(key, file) {
    if (!file) return;

    try {
      const base64 = await compressImage(file);
      setField(key, base64);
    } catch (error) {
      console.error("Image compress error:", error);
      alert(fa ? "خطا در پردازش تصویر" : "Image processing error");
    }
  }

  return (
    <div dir={dir || (fa ? "rtl" : "ltr")} className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-cyan-400">{label.title}</h1>
          <p className="text-slate-400 mt-2">{label.subtitle}</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={loadSettings}
            disabled={loading}
            className="px-5 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20 disabled:opacity-60"
          >
            <RefreshCw size={18} />
            {loading ? label.loading : label.refresh}
          </button>

          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2 disabled:opacity-60"
          >
            <Save size={18} />
            {saving ? label.saving : label.save}
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-2xl p-4 bg-cyan-500/10 border border-cyan-400/20 text-cyan-100 font-bold">
          {message}
        </div>
      )}

      <Section icon={<Languages />} title={label.language}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>

          <InfoCard
            title={fa ? "حالت فعلی" : "Current Mode"}
            value={fa ? "فارسی، راست‌به‌چپ، اعداد فارسی" : "English, left-to-right, English numbers"}
          />
        </div>
      </Section>

      <Section icon={<Globe2 />} title={fa ? "کشور و استانداردهای محلی" : "Country & Local Standards"}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={fa ? "کشور محل فعالیت شرکت" : "Company operating country"}>
            <select
              className={inputClass}
              value={country}
              onChange={(event) => {
                const next = countries.find((item) => item.code === event.target.value);
                if (!next) return;
                setCountry(next.code);
                setCompanyFormatting({
                  currency_code: next.currency,
                  decimal_places: next.currencyDigits,
                  calendar_system: next.calendar,
                  time_zone: next.timeZone,
                  first_day_of_week: next.firstDayOfWeek,
                  measurement_system: next.measurementSystem,
                  fiscal_year_start: next.fiscalYearStart,
                  rounding_mode: "half_up",
                });
                setSettings((prev) => ({
                  ...prev,
                  country_code: next.code,
                  locale_code: next.locale?.[language] || next.locale?.en,
                  currency_code: next.currency,
                  currency: next.currency,
                  calendar_system: next.calendar,
                  time_zone: next.timeZone,
                  first_day_of_week: next.firstDayOfWeek,
                  fiscal_year_start: next.fiscalYearStart,
                  decimal_places: next.currencyDigits,
                  measurement_system: next.measurementSystem,
                  tax_profile_verified_at: "",
                }));
              }}
            >
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {fa ? item.name.fa : item.name.en}
                </option>
              ))}
            </select>
          </Field>

          <InfoCard title={fa ? "ارز و اعشار" : "Currency & decimals"} value={`${countryProfile.currency} · ${showDigits(countryProfile.currencyDigits, fa)}`} />
          <InfoCard title={fa ? "تقویم اصلی" : "Primary calendar"} value={countryProfile.calendar} />
          <InfoCard title={fa ? "منطقه زمانی" : "Time zone"} value={countryProfile.timeZone} />
          <InfoCard title={fa ? "سیستم اندازه‌گیری" : "Measurement system"} value={countryProfile.measurementSystem} />
          <InfoCard title={fa ? "شروع سال مالی" : "Fiscal year start"} value={countryProfile.fiscalYearStart} />
        </div>

        <div className="mt-4 rounded-2xl p-4 flex items-start gap-3" style={{ background: "var(--erp-glow)", border: "1px solid var(--erp-border)" }}>
          <CalendarDays className="erp-accent shrink-0" />
          <p className="text-sm">
            {fa
              ? "تغییر کشور، قالب پول، تاریخ، ساعت، تقویم، منطقه زمانی و واحدها را هماهنگ می‌کند. نرخ مالیات تا زمان تأیید حسابدار همان کشور به‌صورت قابل‌ویرایش باقی می‌ماند."
              : "Changing country aligns money, dates, calendar, time zone, and units. Tax rates remain editable until verified by a local accountant."}
          </p>
        </div>
      </Section>

      <Section icon={<Building2 />} title={label.company}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={fa ? "نام شرکت" : "Company Name"}>
            <input className={inputClass} value={settings.company_name || ""} onChange={(e) => setField("company_name", e.target.value)} />
          </Field>

          <Field label={fa ? "نام مدیر" : "Manager Name"}>
            <input className={inputClass} value={settings.manager_name || ""} onChange={(e) => setField("manager_name", e.target.value)} />
          </Field>

          <Field label={fa ? "تلفن" : "Phone"}>
            <input className={inputClass} value={showDigits(settings.phone, fa)} onChange={(e) => setNumberField("phone", e.target.value)} />
          </Field>

          <Field label={fa ? "موبایل" : "Mobile"}>
            <input className={inputClass} value={showDigits(settings.mobile, fa)} onChange={(e) => setNumberField("mobile", e.target.value)} />
          </Field>

          <Field label={fa ? "ایمیل" : "Email"}>
            <input className={inputClass} value={settings.email || ""} onChange={(e) => setField("email", e.target.value)} />
          </Field>

          <Field label={fa ? "وب‌سایت" : "Website"}>
            <input className={inputClass} value={settings.website || ""} onChange={(e) => setField("website", e.target.value)} />
          </Field>

          <Field label={fa ? "شناسه ملی" : "National ID"}>
            <input className={inputClass} value={showDigits(settings.national_id, fa)} onChange={(e) => setNumberField("national_id", e.target.value)} />
          </Field>

          <Field label={fa ? "کد اقتصادی" : "Economic Code"}>
            <input className={inputClass} value={showDigits(settings.economic_code, fa)} onChange={(e) => setNumberField("economic_code", e.target.value)} />
          </Field>

          <Field label={fa ? "آدرس" : "Address"}>
            <textarea className={inputClass} rows={2} value={settings.address || ""} onChange={(e) => setField("address", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={<Upload />} title={label.media}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UploadBox label={fa ? "لوگوی شرکت" : "Company Logo"} buttonText={label.imageSelect} value={settings.logo_data} onChange={(file) => handleImage("logo_data", file)} />
          <UploadBox label={fa ? "مهر شرکت" : "Company Stamp"} buttonText={label.imageSelect} value={settings.stamp_data} onChange={(file) => handleImage("stamp_data", file)} />
          <UploadBox label={fa ? "امضا" : "Signature"} buttonText={label.imageSelect} value={settings.signature_data} onChange={(file) => handleImage("signature_data", file)} />
        </div>
      </Section>

      <Section icon={<FileText />} title={label.invoice}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Toggle label={fa ? "نمایش لوگو در فاکتور" : "Show logo on invoice"} checked={settings.show_logo} onChange={(v) => setField("show_logo", v)} />
          <Toggle label={fa ? "نمایش QR Code" : "Show QR Code"} checked={settings.show_qr} onChange={(v) => setField("show_qr", v)} />
          <Toggle label={fa ? "نمایش بارکد" : "Show Barcode"} checked={settings.show_barcode} onChange={(v) => setField("show_barcode", v)} />
        </div>

        <div className="mt-4">
          <Field label={fa ? "متن پایین فاکتور" : "Invoice Footer"}>
            <textarea className={inputClass} rows={3} value={settings.invoice_footer || ""} onChange={(e) => setField("invoice_footer", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={<Wallet />} title={label.finance}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label={fa ? "واحد پول" : "Currency"}>
            <select className={inputClass} value={settings.currency || "تومان"} onChange={(e) => setField("currency", e.target.value)}>
              <option value="IRR">{fa ? "ریال ایران (IRR)" : "Iranian rial (IRR)"}</option>
              <option value="تومان">{fa ? "تومان (واحد نمایشی)" : "Toman (display unit)"}</option>
              <option value="EUR">{fa ? "یورو (EUR)" : "Euro (EUR)"}</option>
              <option value="AED">{fa ? "درهم امارات (AED)" : "UAE dirham (AED)"}</option>
              <option value="GBP">{fa ? "پوند بریتانیا (GBP)" : "Pound sterling (GBP)"}</option>
              <option value="USD">{fa ? "دلار آمریکا (USD)" : "US dollar (USD)"}</option>
            </select>
          </Field>

          <Field label={fa ? "درصد مالیات پیش‌فرض" : "Default Tax Percent"}>
            <input className={inputClass} value={showDigits(settings.tax_percent, fa)} onChange={(e) => setNumberField("tax_percent", e.target.value)} />
          </Field>

          <Field label={fa ? "درصد تخفیف پیش‌فرض" : "Default Discount Percent"}>
            <input className={inputClass} value={showDigits(settings.discount_percent, fa)} onChange={(e) => setNumberField("discount_percent", e.target.value)} />
          </Field>

          <Field label={fa ? "سال مالی" : "Fiscal Year"}>
            <input className={inputClass} value={showDigits(settings.fiscal_year, fa)} onChange={(e) => setNumberField("fiscal_year", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={<Palette />} title={label.appearance}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
          <Field label={fa ? "رنگ و تم برنامه" : "Color theme"}>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {themes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTheme(item.id);
                    setField("theme", item.id);
                  }}
                  className="rounded-2xl p-3 text-start font-black border"
                  style={{
                    background: theme === item.id ? "var(--erp-glow)" : "var(--erp-panel-solid)",
                    borderColor: theme === item.id ? item.accent : "var(--erp-border)",
                    color: "var(--erp-text)",
                    boxShadow: theme === item.id ? `0 0 0 2px ${item.accent}55` : "none",
                  }}
                  aria-pressed={theme === item.id}
                >
                  <span className="block w-8 h-8 rounded-full mb-2" style={{ background: item.accent }} />
                  {fa ? item.fa : item.en}
                </button>
              ))}
            </div>
          </Field>
          </div>

          <Field label={fa ? "حداقل موجودی پیش‌فرض" : "Default Low Stock"}>
            <input className={inputClass} value={showDigits(settings.low_stock_default, fa)} onChange={(e) => setNumberField("low_stock_default", e.target.value)} />
          </Field>

          <InfoCard title={fa ? "نام سیستم" : "System Name"} value={t?.appName || "Vetrix ERP"} />
        </div>
      </Section>

      <Section icon={<Bell />} title={label.backupSms}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Toggle label={fa ? "بکاپ خودکار" : "Auto Backup"} checked={settings.auto_backup} onChange={(v) => setField("auto_backup", v)} />

          <Field label={fa ? "پنل پیامک" : "SMS Panel"}>
            <input className={inputClass} value={settings.sms_panel || ""} onChange={(e) => setField("sms_panel", e.target.value)} />
          </Field>

          <Field label={fa ? "کلید API پیامک" : "SMS API Key"}>
            <input className={inputClass} value={settings.sms_api_key || ""} onChange={(e) => setField("sms_api_key", e.target.value)} />
          </Field>
        </div>
      </Section>

      <div className="bg-slate-900/60 border border-emerald-500/20 rounded-3xl p-5 flex items-center gap-3 text-emerald-300">
        <ShieldCheck />
        <span className="font-black">
          {fa ? "تنظیمات در دیتابیس ذخیره می‌شود و بعد از بستن برنامه باقی می‌ماند." : "Settings are saved in the database and persist after closing the app."}
        </span>
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div className="erp-surface rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center erp-accent" style={{ background: "var(--erp-glow)" }}>
          {icon}
        </div>
        <h2 className="text-2xl font-black erp-accent">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-cyan-200 block">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="bg-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer border border-cyan-500/10">
      <span className="text-white font-bold">{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function InfoCard({ title, value }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4">
      <p className="text-slate-400 text-sm">{title}</p>
      <h3 className="font-black text-white mt-2">{value}</h3>
    </div>
  );
}

function UploadBox({ label, value, buttonText, onChange }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 border border-cyan-500/10">
      <label className="text-sm font-bold text-cyan-200 block mb-3">{label}</label>
      <label className="cursor-pointer bg-slate-900/70 rounded-2xl border border-dashed border-cyan-500/30 p-4 min-h-[130px] flex items-center justify-center text-slate-300">
        {value ? <img src={value} alt="" className="max-h-28 object-contain rounded-xl" /> : <span>{buttonText}</span>}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files?.[0])} />
      </label>
    </div>
  );
}