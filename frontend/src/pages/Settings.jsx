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
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { API_URL, getAuthHeaders } from "../services/api";
import { useTheme } from "../theme/useTheme";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Notice from "../components/ui/Notice";
import Field, { Input, Textarea } from "../components/ui/Field";
import Select from "../components/ui/Select";
import PaymentProvidersCard from "../components/settings/PaymentProvidersCard";
import ExecutiveAgentSettingsCard from "../components/settings/ExecutiveAgentSettingsCard";

const emptySettings = {
  company_name: "",
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
  telegram_bot_token: "",
  whatsapp_phone_number_id: "",
  whatsapp_access_token: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  smtp_from: "",
  reminder_channels: [],
  backup_email: "",
  backup_email_frequency_hours: 168,
  last_backup_email_at: "",
  industry: "general",
};

const INDUSTRY_LABELS = {
  general: { fa: "عمومی", ar: "عام", tr: "Genel", en: "General" },
  veterinary: { fa: "دامپزشکی", ar: "بيطري", tr: "Veterinerlik", en: "Veterinary" },
  human_medical: { fa: "پزشکی انسانی", ar: "طبي بشري", tr: "İnsan sağlığı", en: "Human medical" },
  pharmacy: { fa: "داروخانه", ar: "صيدلية", tr: "Eczane", en: "Pharmacy" },
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
  "islamic-umalqura": { fa: "قمری (ام‌القری)", ar: "هجري (أم القرى)", tr: "Hicri (Ümmülkura)", en: "Islamic (Umm al-Qura)" },
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

// Every currency already used by a built-in country profile (see
// localization/countryProfiles.js), so picking any supported country's
// currency here always has a matching option - plus a couple of common
// extras. Kept as a flat list (not derived from COUNTRY_PROFILES) since
// the field is independently editable and shouldn't silently lose an
// option if a country profile's currency ever changes.
const CURRENCY_OPTIONS = [
  { code: "IRR", digits: 0, label: { fa: "ریال ایران (IRR)", ar: "الريال الإيراني (IRR)", tr: "İran riyali (IRR)", en: "Iranian rial (IRR)" } },
  { code: "TRY", digits: 2, label: { fa: "لیر ترکیه (TRY)", ar: "الليرة التركية (TRY)", tr: "Türk lirası (TRY)", en: "Turkish lira (TRY)" } },
  { code: "EUR", digits: 2, label: { fa: "یورو (EUR)", ar: "يورو (EUR)", tr: "Euro (EUR)", en: "Euro (EUR)" } },
  { code: "AED", digits: 2, label: { fa: "درهم امارات (AED)", ar: "الدرهم الإماراتي (AED)", tr: "BAE dirhemi (AED)", en: "UAE dirham (AED)" } },
  { code: "SAR", digits: 2, label: { fa: "ریال عربستان (SAR)", ar: "الريال السعودي (SAR)", tr: "Suudi riyali (SAR)", en: "Saudi riyal (SAR)" } },
  { code: "GBP", digits: 2, label: { fa: "پوند بریتانیا (GBP)", ar: "الجنيه الإسترليني (GBP)", tr: "İngiliz sterlini (GBP)", en: "Pound sterling (GBP)" } },
  { code: "USD", digits: 2, label: { fa: "دلار آمریکا (USD)", ar: "الدولار الأمريكي (USD)", tr: "ABD doları (USD)", en: "US dollar (USD)" } },
];

// Common zones covering every built-in country profile; free enough to
// extend later without needing a full IANA-zone picker.
const TIME_ZONE_OPTIONS = [
  "Asia/Tehran", "Europe/Istanbul", "Asia/Dubai", "Europe/Berlin",
  "Europe/Helsinki", "Europe/London", "America/New_York", "UTC",
];

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
  const { language, setLanguage, languages, dir, t, country, setCountry, setCompanyFormatting, countries, countryProfile, date } = useLanguage();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const pd = (value) => (fa ? toPersianDigits(value) : value);
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
    smtpTitle: fa ? "تنظیمات ایمیل (SMTP)" : language === "ar" ? "إعدادات البريد الإلكتروني (SMTP)" : language === "tr" ? "E-posta ayarları (SMTP)" : "Email settings (SMTP)",
    smtpHint: fa
      ? "برای ارسال خودکار یادآوری پرداخت و گزارش‌ها از طریق ایمیل، اطلاعات SMTP ایمیل خودتان را وارد کنید (مثلاً Gmail: smtp.gmail.com، پورت ۵۸۷، و یک App Password به‌جای رمز عبور اصلی)."
      : language === "ar"
      ? "لإرسال تذكيرات الدفع والتقارير تلقائيًا عبر البريد الإلكتروني، أدخل بيانات SMTP الخاصة ببريدك (مثلاً Gmail: smtp.gmail.com، المنفذ 587، وكلمة مرور تطبيق بدلاً من كلمة المرور الرئيسية)."
      : language === "tr"
      ? "Ödeme hatırlatmalarını ve raporları e-posta ile otomatik göndermek için kendi e-postanızın SMTP bilgilerini girin (örn. Gmail: smtp.gmail.com, port 587, ana şifre yerine bir Uygulama Şifresi)."
      : "To send payment reminders and reports automatically by email, enter your own email's SMTP details (e.g. Gmail: smtp.gmail.com, port 587, and an App Password instead of your main password).",
    smtpHost: fa ? "آدرس سرور SMTP" : language === "ar" ? "خادم SMTP" : language === "tr" ? "SMTP sunucusu" : "SMTP host",
    smtpPort: fa ? "پورت" : language === "ar" ? "المنفذ" : language === "tr" ? "Port" : "Port",
    smtpUser: fa ? "نام کاربری / ایمیل" : language === "ar" ? "اسم المستخدم / البريد" : language === "tr" ? "Kullanıcı adı / e-posta" : "Username / email",
    smtpPassword: fa ? "رمز عبور / App Password" : language === "ar" ? "كلمة المرور / App Password" : language === "tr" ? "Şifre / Uygulama Şifresi" : "Password / App Password",
    smtpFrom: fa ? "ایمیل فرستنده (اختیاری)" : language === "ar" ? "بريد المرسل (اختياري)" : language === "tr" ? "Gönderen e-posta (opsiyonel)" : "From address (optional)",
    smsHint: fa
      ? "توجه: در حال حاضر این دو فیلد فقط ذخیره می‌شوند و هنوز به هیچ سرویس پیامکی متصل نیستند — ارسال واقعی پیامک هنوز پیاده‌سازی نشده است."
      : language === "ar"
      ? "ملاحظة: هذان الحقلان يُحفظان فقط حاليًا ولم يتم ربطهما بأي مزود رسائل نصية بعد — الإرسال الفعلي للرسائل غير مُفعّل بعد."
      : language === "tr"
      ? "Not: Bu iki alan şu anda yalnızca kaydediliyor ve henüz bir SMS sağlayıcısına bağlı değil — gerçek SMS gönderimi henüz uygulanmadı."
      : "Note: these two fields are currently only saved and are not yet connected to any SMS provider - actual SMS sending is not implemented yet.",
    reminderChannels: fa ? "کانال‌های یادآوری (واتساپ، تلگرام، ...)" : language === "ar" ? "قنوات التذكير (واتساب، تيليجرام، ...)" : language === "tr" ? "Hatırlatma kanalları (WhatsApp, Telegram, ...)" : "Reminder channels (WhatsApp, Telegram, ...)",
    reminderChannelsHint: fa
      ? "واتساپ همیشه فعال است. هر برنامه پیام‌رسان محلی دیگری (بله، ایتا، روبیکا، تلگرام و ...) را با یک لینک اشتراک‌گذاری اضافه کن؛ از {phone} و {message} برای جاگذاری شماره و متن پیام استفاده کن."
      : language === "ar"
      ? "واتساب مفعّل دائمًا. أضف أي تطبيق مراسلة محلي آخر برابط مشاركة؛ استخدم {phone} و {message} لإدراج الرقم ونص الرسالة."
      : language === "tr"
      ? "WhatsApp her zaman etkindir. Başka bir yerel mesajlaşma uygulamasını bir paylaşım bağlantısıyla ekleyin; numarayı ve mesajı yerleştirmek için {phone} ve {message} kullanın."
      : "WhatsApp is always on. Add any other local messenger with a share link; use {phone} and {message} placeholders for the number and message text.",
    channelName: fa ? "نام برنامه" : language === "ar" ? "اسم التطبيق" : language === "tr" ? "Uygulama adı" : "App name",
    channelLink: fa ? "الگوی لینک اشتراک‌گذاری" : language === "ar" ? "نمط رابط المشاركة" : language === "tr" ? "Paylaşım bağlantısı şablonu" : "Share link template",
    addChannel: fa ? "افزودن کانال" : language === "ar" ? "إضافة قناة" : language === "tr" ? "Kanal ekle" : "Add channel",
    noChannels: fa ? "هنوز کانال اضافی‌ای اضافه نشده است." : language === "ar" ? "لم تتم إضافة أي قناة إضافية بعد." : language === "tr" ? "Henüz ek kanal eklenmedi." : "No extra channels added yet.",
    backupHint: fa
      ? "وقتی «بکاپ خودکار» روشن باشد، هر ۲۴ ساعت یک نسخه از کل پایگاه‌داده روی همان سرور (پوشه backend/app/backup/files، یا مسیر متغیر محیطی VETRIX_BACKUP_DIR) ذخیره می‌شود، صحت آن بررسی می‌شود و ۳۰ نسخه آخر نگه داشته می‌شود. چون این نسخه‌ها روی همان سرور هستند، برای امنیت بیشتر (مثلاً خرابی دیسک سرور) پایین یک ایمیل مقصد هم تعریف کن تا نسخه‌ها بیرون از سرور هم ارسال شوند."
      : language === "ar"
      ? "عند تفعيل «النسخ الاحتياطي التلقائي»، تُحفظ نسخة من قاعدة البيانات كل 24 ساعة على نفس الخادم (مجلد backend/app/backup/files أو مسار VETRIX_BACKUP_DIR)، ويتم التحقق من سلامتها والاحتفاظ بآخر 30 نسخة. ولأنها على نفس الخادم، عرّف بريدًا إلكترونيًا أدناه ليتم إرسال نسخة خارج الخادم أيضًا."
      : language === "tr"
      ? "«Otomatik Yedekleme» açıkken, veritabanının bir kopyası her 24 saatte bir aynı sunucuda (backend/app/backup/files klasörü veya VETRIX_BACKUP_DIR yolu) kaydedilir, bütünlüğü kontrol edilir ve son 30 kopya saklanır. Bunlar aynı sunucuda olduğundan, sunucu dışına da gönderilmesi için aşağıya bir e-posta adresi tanımlayın."
      : "When \"Auto Backup\" is on, a copy of the whole database is saved every 24 hours on this same server (backend/app/backup/files folder, or the VETRIX_BACKUP_DIR path), integrity-checked, and the last 30 copies are kept. Since these live on the same server, set a destination email below so copies are also delivered off-server.",
    backupEmail: fa ? "ایمیل مقصد بکاپ" : language === "ar" ? "بريد استلام النسخ الاحتياطية" : language === "tr" ? "Yedekleme e-postası" : "Backup destination email",
    backupFrequency: fa ? "بازه ارسال (ساعت)" : language === "ar" ? "فاصل الإرسال (ساعة)" : language === "tr" ? "Gönderim aralığı (saat)" : "Delivery interval (hours)",
    lastBackupEmail: fa ? "آخرین ارسال" : language === "ar" ? "آخر إرسال" : language === "tr" ? "Son gönderim" : "Last sent",
    never: fa ? "هنوز ارسال نشده" : language === "ar" ? "لم يُرسل بعد" : language === "tr" ? "Henüz gönderilmedi" : "Never sent yet",
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
      // Deliberately does NOT call setTheme(data.theme) here: theme is a
      // live, client-side preference (see ThemeProvider, persisted in
      // localStorage) - silently overriding whatever the user is actively
      // using with a possibly-stale saved value every time this page loads
      // was surprising (e.g. dark mode flipping to light on navigation).
      // The theme swatches below still read/write the live theme directly.
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

  // Independently overrides a single locale/formatting field (currency,
  // calendar, time zone, measurement system, fiscal year start) without
  // resetting the others - setCompanyFormatting() expects the *full*
  // formatting shape each call, so this merges the patch into the current
  // settings first and passes the whole merged object through, rather than
  // just the one changed key (which would otherwise wipe out every other
  // already-chosen override back to "").
  function updateFormatting(patch) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setCompanyFormatting(next);
      return next;
    });
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
      toast.error(fa ? "خطا در پردازش تصویر" : language === "ar" ? "خطأ في معالجة الصورة" : language === "tr" ? "Görsel işleme hatası" : "Image processing error");
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

      <Card icon={Languages} title={label.language}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            value={language}
            onChange={(value) => setLanguage(value)}
            options={languages.map((item) => ({ value: item.code, label: item.label }))}
          />

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

      <Card icon={Globe2} title={tr("کشور و استانداردهای محلی", "الدولة والمعايير المحلية", "Ülke ve Yerel Standartlar", "Country & Local Standards")}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={tr("کشور محل فعالیت شرکت", "بلد نشاط الشركة", "Şirketin faaliyet gösterdiği ülke", "Company operating country")}>
            <Select
              value={country}
              onChange={(value) => {
                const next = countries.find((item) => item.code === value);
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
              options={countries.map((item) => ({ value: item.code, label: item.name[language] || item.name.en }))}
            />
          </Field>

          <Field label={tr("ارز و اعشار", "العملة والكسور العشرية", "Para birimi ve ondalık", "Currency & decimals")}>
            <Select
              value={countryProfile.currency}
              onChange={(value) => {
                const option = CURRENCY_OPTIONS.find((item) => item.code === value);
                if (!option) return;
                updateFormatting({
                  currency_code: option.code,
                  currency: option.code,
                  decimal_places: option.digits,
                });
              }}
              options={CURRENCY_OPTIONS.map((option) => ({ value: option.code, label: option.label[language] || option.label.en }))}
            />
          </Field>

          <Field label={tr("تقویم اصلی", "التقويم الأساسي", "Ana takvim", "Primary calendar")}>
            <Select
              value={countryProfile.calendar}
              onChange={(value) => updateFormatting({ calendar_system: value })}
              options={Object.keys(CALENDAR_LABELS).map((value) => ({ value, label: calendarLabel(value, language) }))}
            />
          </Field>

          <Field label={tr("منطقه زمانی", "المنطقة الزمنية", "Saat dilimi", "Time zone")}>
            <Select
              value={countryProfile.timeZone}
              onChange={(value) => updateFormatting({ time_zone: value })}
              options={TIME_ZONE_OPTIONS.map((zone) => ({ value: zone, label: zone }))}
            />
          </Field>

          <Field label={tr("سیستم اندازه‌گیری", "نظام القياس", "Ölçüm sistemi", "Measurement system")}>
            <Select
              value={countryProfile.measurementSystem}
              onChange={(value) => updateFormatting({ measurement_system: value })}
              options={Object.keys(MEASUREMENT_LABELS).map((value) => ({ value, label: measurementLabel(value, language) }))}
            />
          </Field>

          <Field label={tr("شروع سال مالی", "بداية السنة المالية", "Mali yıl başlangıcı", "Fiscal year start")}>
            <Input
              value={countryProfile.fiscalYearStart}
              onChange={(event) => updateFormatting({ fiscal_year_start: event.target.value })}
              placeholder="MM-DD"
            />
          </Field>
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

      <Card icon={Building2} title={label.company}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={tr("نام شرکت", "اسم الشركة", "Şirket Adı", "Company Name")}>
            <Input value={pd(settings.company_name || "")} onChange={(e) => setField("company_name", toEnglishDigits(e.target.value))} />
          </Field>

          <Field label={tr("نام مدیر", "اسم المدير", "Yönetici Adı", "Manager Name")}>
            <Input value={pd(settings.manager_name || "")} onChange={(e) => setField("manager_name", toEnglishDigits(e.target.value))} />
          </Field>

          <Field
            label={tr("نوع کسب‌وکار (فیلدهای اختصاصی فاکتور)", "نوع النشاط التجاري (حقول الفاتورة المتخصصة)", "İşletme türü (özel fatura alanları)", "Business type (specialized invoice fields)")}
          >
            <Select
              value={settings.industry || "general"}
              onChange={(value) => setField("industry", value)}
              options={Object.keys(INDUSTRY_LABELS).map((value) => ({ value, label: INDUSTRY_LABELS[value][language] || INDUSTRY_LABELS[value].en }))}
            />
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
            <Textarea rows={2} value={pd(settings.address || "")} onChange={(e) => setField("address", toEnglishDigits(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card icon={Upload} title={label.media}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UploadBox label={tr("لوگوی شرکت", "شعار الشركة", "Şirket Logosu", "Company Logo")} buttonText={label.imageSelect} value={settings.logo_data} onChange={(file) => handleImage("logo_data", file)} />
          <UploadBox label={tr("مهر شرکت", "ختم الشركة", "Şirket Kaşesi", "Company Stamp")} buttonText={label.imageSelect} value={settings.stamp_data} onChange={(file) => handleImage("stamp_data", file)} />
          <UploadBox label={tr("امضا", "التوقيع", "İmza", "Signature")} buttonText={label.imageSelect} value={settings.signature_data} onChange={(file) => handleImage("signature_data", file)} />
        </div>
      </Card>

      <Card icon={FileText} title={label.invoice}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Toggle label={tr("نمایش لوگو در فاکتور", "إظهار الشعار في الفاتورة", "Faturada logo göster", "Show logo on invoice")} checked={settings.show_logo} onChange={(v) => setField("show_logo", v)} />
          <Toggle label={tr("نمایش QR Code", "إظهار رمز QR", "QR Kodu göster", "Show QR Code")} checked={settings.show_qr} onChange={(v) => setField("show_qr", v)} />
          <Toggle label={tr("نمایش بارکد", "إظهار الباركود", "Barkod göster", "Show Barcode")} checked={settings.show_barcode} onChange={(v) => setField("show_barcode", v)} />
        </div>

        <div className="mt-4">
          <Field label={tr("متن پایین فاکتور", "نص أسفل الفاتورة", "Fatura Alt Metni", "Invoice Footer")}>
            <Textarea rows={3} value={pd(settings.invoice_footer || "")} onChange={(e) => setField("invoice_footer", toEnglishDigits(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card icon={Wallet} title={label.finance}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label={tr("واحد پول", "العملة", "Para Birimi", "Currency")}>
            <Select
              value={settings.currency || "تومان"}
              onChange={(value) => setField("currency", value)}
              options={[
                { value: "IRR", label: tr("ریال ایران (IRR)", "الريال الإيراني (IRR)", "İran riyali (IRR)", "Iranian rial (IRR)") },
                { value: "تومان", label: tr("تومان (واحد نمایشی)", "تومان (وحدة عرض)", "Tomen (görüntüleme birimi)", "Toman (display unit)") },
                { value: "TRY", label: tr("لیر ترکیه (TRY)", "الليرة التركية (TRY)", "Türk lirası (TRY)", "Turkish lira (TRY)") },
                { value: "EUR", label: tr("یورو (EUR)", "يورو (EUR)", "Euro (EUR)", "Euro (EUR)") },
                { value: "AED", label: tr("درهم امارات (AED)", "الدرهم الإماراتي (AED)", "BAE dirhemi (AED)", "UAE dirham (AED)") },
                { value: "SAR", label: tr("ریال عربستان (SAR)", "الريال السعودي (SAR)", "Suudi riyali (SAR)", "Saudi riyal (SAR)") },
                { value: "GBP", label: tr("پوند بریتانیا (GBP)", "الجنيه الإسترليني (GBP)", "İngiliz sterlini (GBP)", "Pound sterling (GBP)") },
                { value: "USD", label: tr("دلار آمریکا (USD)", "الدولار الأمريكي (USD)", "ABD doları (USD)", "US dollar (USD)") },
              ]}
            />
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

      <Card icon={Palette} title={label.appearance}>
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

          <InfoCard title={tr("نام سیستم", "اسم النظام", "Sistem Adı", "System Name")} value={t?.appName || "VITALIX ACCOUNTING"} />
        </div>
      </Card>

      <Card icon={Bell} title={label.backupSms}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Toggle label={tr("بکاپ خودکار", "نسخ احتياطي تلقائي", "Otomatik Yedekleme", "Auto Backup")} checked={settings.auto_backup} onChange={(v) => setField("auto_backup", v)} />

          <Field label={tr("پنل پیامک", "لوحة الرسائل النصية", "SMS Paneli", "SMS Panel")}>
            <Input value={pd(settings.sms_panel || "")} onChange={(e) => setField("sms_panel", toEnglishDigits(e.target.value))} />
          </Field>

          <Field label={tr("کلید API پیامک", "مفتاح API للرسائل النصية", "SMS API Anahtarı", "SMS API Key")}>
            <Input value={settings.sms_api_key || ""} onChange={(e) => setField("sms_api_key", e.target.value)} />
          </Field>

          <Field label={tr("توکن ربات تلگرام", "رمز بوت تيليجرام", "Telegram bot token", "Telegram bot token")}>
            <Input value={settings.telegram_bot_token || ""} onChange={(e) => setField("telegram_bot_token", e.target.value)} placeholder="123456:ABC-..." />
          </Field>

          <Field label={tr("شناسه شماره واتساپ (Phone Number ID)", "معرّف رقم واتساب (Phone Number ID)", "WhatsApp Phone Number ID", "WhatsApp Phone Number ID")}>
            <Input value={settings.whatsapp_phone_number_id || ""} onChange={(e) => setField("whatsapp_phone_number_id", e.target.value)} />
          </Field>

          <Field label={tr("توکن دسترسی واتساپ (Access Token)", "رمز وصول واتساب (Access Token)", "WhatsApp Access Token", "WhatsApp Access Token")}>
            <Input value={settings.whatsapp_access_token || ""} onChange={(e) => setField("whatsapp_access_token", e.target.value)} />
          </Field>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--erp-warning, #f59e0b)" }}>{label.smsHint}</p>
        <p className="text-xs mt-1" style={{ color: "var(--erp-muted)" }}>
          {tr(
            "توکن ربات تلگرام را از @BotFather بگیرید. برای واتساپ به یک حساب Meta Business Cloud API نیاز دارید. تا وقتی این‌ها تنظیم نشوند، فقط لینک اشتراک‌گذاری دستی واتساپ در دسترس است.",
            "احصل على رمز بوت تيليجرام من @BotFather. لواتساب تحتاج حساب Meta Business Cloud API. حتى إعداد هذه القيم، يبقى رابط واتساب اليدوي فقط متاحًا.",
            "Telegram bot token'ı @BotFather'dan alın. WhatsApp için bir Meta Business Cloud API hesabı gereklidir. Bunlar ayarlanana kadar yalnızca manuel WhatsApp paylaşım bağlantısı kullanılabilir.",
            "Get the Telegram bot token from @BotFather. WhatsApp requires a Meta Business Cloud API account. Until these are set, only the manual WhatsApp share link is available."
          )}
        </p>

        <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--erp-border)" }}>
          <p className="text-sm mb-4" style={{ color: "var(--erp-muted)" }}>{label.backupHint}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Field label={label.backupEmail}>
              <Input value={settings.backup_email || ""} onChange={(e) => setField("backup_email", e.target.value)} dir="ltr" placeholder="admin@example.com" />
            </Field>
            <Field label={label.backupFrequency}>
              <Input value={showDigits(settings.backup_email_frequency_hours, fa)} onChange={(e) => setNumberField("backup_email_frequency_hours", e.target.value)} dir="ltr" />
            </Field>
            <InfoCard title={label.lastBackupEmail} value={settings.last_backup_email_at ? date(settings.last_backup_email_at) : label.never} />
          </div>
        </div>
      </Card>

      <PaymentProvidersCard />

      <ExecutiveAgentSettingsCard />

      <Card icon={Bell} title={label.smtpTitle}>
        <p className="text-sm mb-4" style={{ color: "var(--erp-muted)" }}>{label.smtpHint}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label={label.smtpHost}>
            <Input value={settings.smtp_host || ""} onChange={(e) => setField("smtp_host", e.target.value)} placeholder="smtp.gmail.com" dir="ltr" />
          </Field>
          <Field label={label.smtpPort}>
            <Input value={showDigits(settings.smtp_port, fa)} onChange={(e) => setNumberField("smtp_port", e.target.value)} dir="ltr" />
          </Field>
          <Field label={label.smtpUser}>
            <Input value={settings.smtp_user || ""} onChange={(e) => setField("smtp_user", e.target.value)} dir="ltr" />
          </Field>
          <Field label={label.smtpPassword}>
            <Input type="password" value={settings.smtp_password || ""} onChange={(e) => setField("smtp_password", e.target.value)} dir="ltr" />
          </Field>
          <Field label={label.smtpFrom}>
            <Input value={settings.smtp_from || ""} onChange={(e) => setField("smtp_from", e.target.value)} dir="ltr" />
          </Field>
        </div>
      </Card>

      <Card icon={Bell} title={label.reminderChannels}>
        <p className="text-sm mb-4" style={{ color: "var(--erp-muted)" }}>{label.reminderChannelsHint}</p>
        <ReminderChannelsEditor
          channels={settings.reminder_channels || []}
          onChange={(next) => setField("reminder_channels", next)}
          label={label}
          fa={fa}
        />
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

function ReminderChannelsEditor({ channels, onChange, label, fa }) {
  const pd = (value) => (fa ? toPersianDigits(value) : value);
  const [draft, setDraft] = useState({ name: "", link_template: "" });

  function addChannel() {
    if (!draft.name.trim() || !draft.link_template.trim()) return;
    onChange([...channels, { id: `${Date.now()}`, name: draft.name.trim(), link_template: draft.link_template.trim() }]);
    setDraft({ name: "", link_template: "" });
  }

  function removeChannel(id) {
    onChange(channels.filter((c) => c.id !== id));
  }

  return (
    <div dir={fa ? "rtl" : undefined}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <Field label={label.channelName}>
          <Input value={pd(draft.name)} onChange={(e) => setDraft({ ...draft, name: toEnglishDigits(e.target.value) })} placeholder={fa ? "مثلاً: بله" : "e.g. Bale"} />
        </Field>
        <Field label={label.channelLink} className="md:col-span-2">
          <Input value={draft.link_template} onChange={(e) => setDraft({ ...draft, link_template: e.target.value })} placeholder="https://ble.ir/share/{phone}?text={message}" dir="ltr" />
        </Field>
      </div>
      <button
        type="button"
        onClick={addChannel}
        disabled={!draft.name.trim() || !draft.link_template.trim()}
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
        style={{ background: "var(--erp-glow)", color: "var(--erp-accent)" }}
      >
        <Plus size={16} />
        {label.addChannel}
      </button>

      <div className="grid gap-2 mt-4">
        {channels.length === 0 && <p className="text-sm" style={{ color: "var(--erp-muted)" }}>{label.noChannels}</p>}
        {channels.map((channel) => (
          <div key={channel.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: "var(--erp-border)", background: "var(--erp-panel-solid)" }}>
            <div>
              <div className="font-bold" style={{ color: "var(--erp-text)" }}>{pd(channel.name)}</div>
              <div className="text-xs" style={{ color: "var(--erp-muted)", direction: "ltr" }}>{channel.link_template}</div>
            </div>
            <button type="button" onClick={() => removeChannel(channel.id)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,.12)", color: "#f87171" }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
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