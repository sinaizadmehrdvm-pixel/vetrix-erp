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
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Notice from "../components/ui/Notice";
import Field, { Input, Select, Textarea } from "../components/ui/Field";

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

const CALENDAR_LABELS = {
  persian: { fa: "شمسی", ar: "الهجري الشمسي", tr: "Şemsi (Jalali)", en: "Persian (Jalali)" },
  gregory: { fa: "میلادی", ar: "ميلادي", tr: "Miladi", en: "Gregorian" },
  islamic: { fa: "قمری", ar: "هجري قمري", tr: "Hicri", en: "Islamic (Hijri)" },
};

function calendarLabel(value, language) {
  const entry = CALENDAR_LABELS[value];
  if (!entry) return value;
  return entry[language] || entry.en;
}

const MEASUREMENT_LABELS = {
  metric: { fa: "متریک", ar: "متري", tr: "Metrik", en: "Metric" },
  imperial: { fa: "امپریال", ar: "إمبراطوري", tr: "İngiliz birimi", en: "Imperial" },
  us: { fa: "آمریکایی", ar: "أمريكي", tr: "ABD birimi", en: "US customary" },
};

function measurementLabel(value, language) {
  const entry = MEASUREMENT_LABELS[value];
  if (!entry) return value;
  return entry[language] || entry.en;
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
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const { theme, themes, setTheme } = useTheme();

  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");

  const label = {
    title: fa ? "تنظیمات" : language === "ar" ? "الإعدادات" : language === "tr" ? "Ayarlar" : "Settings",
    subtitle: fa
      ? "مدیریت اطلاعات شرکت، فاکتور، مالیات، ظاهر، لوگو و تنظیمات اصلی سیستم"
      : language === "ar"
      ? "إدارة معلومات الشركة والفواتير والضرائب والمظهر والشعار وإعدادات النظام الأساسية"
      : language === "tr"
      ? "Şirket bilgilerini, faturaları, vergiyi, temayı, logoyu ve temel sistem ayarlarını yönetin"
      : "Manage company info, invoices, tax, theme, logo and core settings",
    language: fa ? "زبان سیستم" : language === "ar" ? "لغة النظام" : language === "tr" ? "Sistem Dili" : "System Language",
    company: fa ? "اطلاعات شرکت" : language === "ar" ? "معلومات الشركة" : language === "tr" ? "Şirket Bilgileri" : "Company Information",
    media: fa ? "لوگو، مهر و امضا" : language === "ar" ? "الشعار والختم والتوقيع" : language === "tr" ? "Logo, Kaşe ve İmza" : "Logo, Stamp & Signature",
    invoice: fa ? "تنظیمات فاکتور" : language === "ar" ? "إعدادات الفاتورة" : language === "tr" ? "Fatura Ayarları" : "Invoice Settings",
    finance: fa ? "تنظیمات مالی" : language === "ar" ? "الإعدادات المالية" : language === "tr" ? "Mali Ayarlar" : "Financial Settings",
    appearance: fa ? "ظاهر برنامه" : language === "ar" ? "المظهر" : language === "tr" ? "Görünüm" : "Appearance",
    backupSms: fa ? "بکاپ و پیامک" : language === "ar" ? "النسخ الاحتياطي والرسائل النصية" : language === "tr" ? "Yedekleme ve SMS" : "Backup & SMS",
    save: fa ? "ذخیره تنظیمات" : language === "ar" ? "حفظ الإعدادات" : language === "tr" ? "Ayarları Kaydet" : "Save Settings",
    refresh: fa ? "دریافت مجدد" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh",
    saving: fa ? "در حال ذخیره..." : language === "ar" ? "جارٍ الحفظ..." : language === "tr" ? "Kaydediliyor..." : "Saving...",
    loading: fa ? "در حال دریافت..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading...",
    saved: fa ? "تنظیمات با موفقیت ذخیره شد." : language === "ar" ? "تم حفظ الإعدادات بنجاح." : language === "tr" ? "Ayarlar başarıyla kaydedildi." : "Settings saved successfully.",
    error: fa ? "خطا در دریافت یا ذخیره تنظیمات." : language === "ar" ? "حدث خطأ أثناء تحميل الإعدادات أو حفظها." : language === "tr" ? "Ayarlar yüklenirken veya kaydedilirken hata oluştu." : "Error loading or saving settings.",
    imageSelect: fa ? "انتخاب تصویر" : language === "ar" ? "اختيار صورة" : language === "tr" ? "Görsel seç" : "Choose image",
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
      setMessageTone("danger");
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
      setMessageTone("success");
      await loadSettings();
    } catch (error) {
      console.error("Settings save error:", error);
      setMessage(label.error);
      setMessageTone("danger");
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
      alert(fa ? "خطا در پردازش تصویر" : language === "ar" ? "خطأ في معالجة الصورة" : language === "tr" ? "Görsel işleme hatası" : "Image processing error");
    }
  }

  return (
    <div dir={dir || (fa || language === "ar" ? "rtl" : "ltr")} className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">{label.title}</h1>
          <p className="text-[var(--erp-muted)] mt-2">{label.subtitle}</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={loadSettings}>
            {loading ? label.loading : label.refresh}
          </Button>

          <Button variant="primary" icon={Save} loading={saving} onClick={saveSettings}>
            {saving ? label.saving : label.save}
          </Button>
        </div>
      </div>

      {message && (
        <Notice tone={messageTone} className="font-bold">
          {message}
        </Notice>
      )}

      <Card icon={<Languages />} title={label.language}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>

          <InfoCard
            title={fa ? "حالت فعلی" : language === "ar" ? "الوضع الحالي" : language === "tr" ? "Mevcut Mod" : "Current Mode"}
            value={
              fa
                ? "فارسی، راست‌به‌چپ، اعداد فارسی"
                : language === "ar"
                ? "العربية، من اليمين إلى اليسار، أرقام عربية"
                : language === "tr"
                ? "Türkçe, soldan sağa, Latin rakamları"
                : "English, left-to-right, English numbers"
            }
          />
        </div>
      </Card>

      <Card icon={<Globe2 />} title={tr("کشور و استانداردهای محلی", "الدولة والمعايير المحلية", "Ülke ve Yerel Standartlar", "Country & Local Standards")}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={tr("کشور محل فعالیت شرکت", "بلد نشاط الشركة", "Şirketin faaliyet gösterdiği ülke", "Company operating country")}>
            <Select
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
                  {item.name[language] || item.name.en}
                </option>
              ))}
            </Select>
          </Field>

          <InfoCard title={tr("ارز و اعشار", "العملة والكسور العشرية", "Para birimi ve ondalık", "Currency & decimals")} value={`${countryProfile.currency} · ${showDigits(countryProfile.currencyDigits, fa)}`} />
          <InfoCard title={tr("تقویم اصلی", "التقويم الأساسي", "Ana takvim", "Primary calendar")} value={calendarLabel(countryProfile.calendar, language)} />
          <InfoCard title={tr("منطقه زمانی", "المنطقة الزمنية", "Saat dilimi", "Time zone")} value={countryProfile.timeZone} />
          <InfoCard title={tr("سیستم اندازه‌گیری", "نظام القياس", "Ölçüm sistemi", "Measurement system")} value={measurementLabel(countryProfile.measurementSystem, language)} />
          <InfoCard title={tr("شروع سال مالی", "بداية السنة المالية", "Mali yıl başlangıcı", "Fiscal year start")} value={countryProfile.fiscalYearStart} />
        </div>

        <Notice tone="info" className="mt-4 flex items-start gap-3">
          <CalendarDays className="shrink-0" />
          <p className="text-sm">
            {tr(
              "تغییر کشور، قالب پول، تاریخ، ساعت، تقویم، منطقه زمانی و واحدها را هماهنگ می‌کند. نرخ مالیات تا زمان تأیید حسابدار همان کشور به‌صورت قابل‌ویرایش باقی می‌ماند.",
              "يؤدي تغيير الدولة إلى مواءمة العملة والتواريخ والتقويم والمنطقة الزمنية والوحدات. تبقى معدلات الضريبة قابلة للتعديل حتى يتم التحقق منها من قبل محاسب محلي.",
              "Ülke değiştirmek para birimi, tarih, takvim, saat dilimi ve birimleri buna göre ayarlar. Vergi oranları, yerel bir muhasebeci tarafından onaylanana kadar düzenlenebilir kalır.",
              "Changing country aligns money, dates, calendar, time zone, and units. Tax rates remain editable until verified by a local accountant."
            )}
          </p>
        </Notice>
      </Card>

      <Card icon={<Building2 />} title={label.company}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={tr("نام شرکت", "اسم الشركة", "Şirket Adı", "Company Name")}>
            <Input value={settings.company_name || ""} onChange={(e) => setField("company_name", e.target.value)} />
          </Field>

          <Field label={tr("نام مدیر", "اسم المدير", "Yönetici Adı", "Manager Name")}>
            <Input value={settings.manager_name || ""} onChange={(e) => setField("manager_name", e.target.value)} />
          </Field>

          <Field label={tr("تلفن", "الهاتف", "Telefon", "Phone")}>
            <Input value={showDigits(settings.phone, fa)} onChange={(e) => setNumberField("phone", e.target.value)} />
          </Field>

          <Field label={tr("موبایل", "الجوال", "Cep Telefonu", "Mobile")}>
            <Input value={showDigits(settings.mobile, fa)} onChange={(e) => setNumberField("mobile", e.target.value)} />
          </Field>

          <Field label={tr("ایمیل", "البريد الإلكتروني", "E-posta", "Email")}>
            <Input value={settings.email || ""} onChange={(e) => setField("email", e.target.value)} />
          </Field>

          <Field label={tr("وب‌سایت", "الموقع الإلكتروني", "Web Sitesi", "Website")}>
            <Input value={settings.website || ""} onChange={(e) => setField("website", e.target.value)} />
          </Field>

          <Field label={tr("شناسه ملی", "الرقم الوطني", "Ulusal Kimlik No", "National ID")}>
            <Input value={showDigits(settings.national_id, fa)} onChange={(e) => setNumberField("national_id", e.target.value)} />
          </Field>

          <Field label={tr("کد اقتصادی", "الرمز الاقتصادي", "Ekonomik Kod", "Economic Code")}>
            <Input value={showDigits(settings.economic_code, fa)} onChange={(e) => setNumberField("economic_code", e.target.value)} />
          </Field>

          <Field label={tr("آدرس", "العنوان", "Adres", "Address")}>
            <Textarea rows={2} value={settings.address || ""} onChange={(e) => setField("address", fa ? toPersianDigits(e.target.value) : e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card icon={<Upload />} title={label.media}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UploadBox label={tr("لوگوی شرکت", "شعار الشركة", "Şirket Logosu", "Company Logo")} buttonText={label.imageSelect} value={settings.logo_data} onChange={(file) => handleImage("logo_data", file)} />
          <UploadBox label={tr("مهر شرکت", "ختم الشركة", "Şirket Kaşesi", "Company Stamp")} buttonText={label.imageSelect} value={settings.stamp_data} onChange={(file) => handleImage("stamp_data", file)} />
          <UploadBox label={tr("امضا", "التوقيع", "İmza", "Signature")} buttonText={label.imageSelect} value={settings.signature_data} onChange={(file) => handleImage("signature_data", file)} />
        </div>
      </Card>

      <Card icon={<FileText />} title={label.invoice}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Toggle label={tr("نمایش لوگو در فاکتور", "إظهار الشعار في الفاتورة", "Faturada logo göster", "Show logo on invoice")} checked={settings.show_logo} onChange={(v) => setField("show_logo", v)} />
          <Toggle label={tr("نمایش QR Code", "إظهار رمز QR", "QR Kodu göster", "Show QR Code")} checked={settings.show_qr} onChange={(v) => setField("show_qr", v)} />
          <Toggle label={tr("نمایش بارکد", "إظهار الباركود", "Barkod göster", "Show Barcode")} checked={settings.show_barcode} onChange={(v) => setField("show_barcode", v)} />
        </div>

        <div className="mt-4">
          <Field label={tr("متن پایین فاکتور", "نص أسفل الفاتورة", "Fatura Alt Metni", "Invoice Footer")}>
            <Textarea rows={3} value={settings.invoice_footer || ""} onChange={(e) => setField("invoice_footer", fa ? toPersianDigits(e.target.value) : e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card icon={<Wallet />} title={label.finance}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label={tr("واحد پول", "العملة", "Para Birimi", "Currency")}>
            <Select value={settings.currency || "تومان"} onChange={(e) => setField("currency", e.target.value)}>
              <option value="IRR">{tr("ریال ایران (IRR)", "الريال الإيراني (IRR)", "İran riyali (IRR)", "Iranian rial (IRR)")}</option>
              <option value="تومان">{tr("تومان (واحد نمایشی)", "تومان (وحدة عرض)", "Tomen (görüntüleme birimi)", "Toman (display unit)")}</option>
              <option value="EUR">{tr("یورو (EUR)", "يورو (EUR)", "Euro (EUR)", "Euro (EUR)")}</option>
              <option value="AED">{tr("درهم امارات (AED)", "الدرهم الإماراتي (AED)", "BAE dirhemi (AED)", "UAE dirham (AED)")}</option>
              <option value="GBP">{tr("پوند بریتانیا (GBP)", "الجنيه الإسترليني (GBP)", "İngiliz sterlini (GBP)", "Pound sterling (GBP)")}</option>
              <option value="USD">{tr("دلار آمریکا (USD)", "الدولار الأمريكي (USD)", "ABD doları (USD)", "US dollar (USD)")}</option>
            </Select>
          </Field>

          <Field label={tr("درصد مالیات پیش‌فرض", "نسبة الضريبة الافتراضية", "Varsayılan Vergi Oranı", "Default Tax Percent")}>
            <Input value={showDigits(settings.tax_percent, fa)} onChange={(e) => setNumberField("tax_percent", e.target.value)} />
          </Field>

          <Field label={tr("درصد تخفیف پیش‌فرض", "نسبة الخصم الافتراضية", "Varsayılan İndirim Oranı", "Default Discount Percent")}>
            <Input value={showDigits(settings.discount_percent, fa)} onChange={(e) => setNumberField("discount_percent", e.target.value)} />
          </Field>

          <Field label={tr("سال مالی", "السنة المالية", "Mali Yıl", "Fiscal Year")}>
            <Input value={showDigits(settings.fiscal_year, fa)} onChange={(e) => setNumberField("fiscal_year", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card icon={<Palette />} title={label.appearance}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
          <Field label={tr("رنگ و تم برنامه", "لون وسمة التطبيق", "Renk ve Tema", "Color theme")}>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {themes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTheme(item.id);
                    setField("theme", item.id);
                  }}
                  className="rounded-[var(--erp-radius-md)] p-3 text-start font-black border"
                  style={{
                    background: theme === item.id ? "var(--erp-glow)" : "var(--erp-panel-solid)",
                    borderColor: theme === item.id ? item.accent : "var(--erp-border)",
                    color: "var(--erp-text)",
                    boxShadow: theme === item.id ? `0 0 0 2px ${item.accent}55` : "none",
                  }}
                  aria-pressed={theme === item.id}
                >
                  <span className="block w-8 h-8 rounded-full mb-2" style={{ background: item.accent }} />
                  {item[language] || item.en}
                </button>
              ))}
            </div>
          </Field>
          </div>

          <Field label={tr("حداقل موجودی پیش‌فرض", "الحد الأدنى الافتراضي للمخزون", "Varsayılan Düşük Stok", "Default Low Stock")}>
            <Input value={showDigits(settings.low_stock_default, fa)} onChange={(e) => setNumberField("low_stock_default", e.target.value)} />
          </Field>

          <InfoCard title={tr("نام سیستم", "اسم النظام", "Sistem Adı", "System Name")} value={t?.appName || "Vetrix ERP"} />
        </div>
      </Card>

      <Card icon={<Bell />} title={label.backupSms}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Toggle label={tr("بکاپ خودکار", "نسخ احتياطي تلقائي", "Otomatik Yedekleme", "Auto Backup")} checked={settings.auto_backup} onChange={(v) => setField("auto_backup", v)} />

          <Field label={tr("پنل پیامک", "لوحة الرسائل النصية", "SMS Paneli", "SMS Panel")}>
            <Input value={settings.sms_panel || ""} onChange={(e) => setField("sms_panel", e.target.value)} />
          </Field>

          <Field label={tr("کلید API پیامک", "مفتاح API للرسائل النصية", "SMS API Anahtarı", "SMS API Key")}>
            <Input value={settings.sms_api_key || ""} onChange={(e) => setField("sms_api_key", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Notice tone="success" className="flex items-center gap-3">
        <ShieldCheck className="shrink-0" />
        <span className="font-black">
          {tr(
            "تنظیمات در دیتابیس ذخیره می‌شود و بعد از بستن برنامه باقی می‌ماند.",
            "يتم حفظ الإعدادات في قاعدة البيانات وتبقى بعد إغلاق التطبيق.",
            "Ayarlar veritabanında saklanır ve uygulama kapatıldıktan sonra kalıcı olur.",
            "Settings are saved in the database and persist after closing the app."
          )}
        </span>
      </Notice>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-4 flex items-center justify-between gap-3 cursor-pointer border border-[var(--erp-border)]">
      <span className="text-[var(--erp-text)] font-bold">{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function InfoCard({ title, value }) {
  return (
    <div className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-4">
      <p className="text-[var(--erp-muted)] text-sm">{title}</p>
      <h3 className="font-black text-[var(--erp-text)] mt-2">{value}</h3>
    </div>
  );
}

function UploadBox({ label, value, buttonText, onChange }) {
  return (
    <div className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-4 border border-[var(--erp-border)]">
      <label className="text-sm font-bold text-[var(--erp-accent)] block mb-3">{label}</label>
      <label className="cursor-pointer bg-[var(--erp-bg-soft)] rounded-[var(--erp-radius-md)] border border-dashed border-[var(--erp-border)] p-4 min-h-[130px] flex items-center justify-center text-[var(--erp-muted)]">
        {value ? <img src={value} alt="" className="max-h-28 object-contain rounded-[var(--erp-radius-sm)]" /> : <span>{buttonText}</span>}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files?.[0])} />
      </label>
    </div>
  );
}