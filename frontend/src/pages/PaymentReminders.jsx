import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, MessageCircle, Send, Link2, MessageSquareMore } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  getOverdueInvoices,
  getPaymentReminderLog,
  getPaymentReminderStatus,
  sendPaymentReminderNow,
  getWhatsappReminderLink,
  getInvoicePaymentShareLink,
  sendInvoicePaymentLinkSms,
  sendInvoicePaymentLinkTelegram,
  sendInvoicePaymentLinkWhatsappAuto,
  getSettings,
  isNetworkError,
} from "../services/api";
import { translateApiError } from "../localization/apiErrors";

function connectionErrorText(language) {
  return language === "fa"
    ? "اتصال به سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید."
    : language === "ar"
    ? "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت."
    : language === "tr"
    ? "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin."
    : "Could not connect to the server. Check your internet connection.";
}

function friendlyError(err, language) {
  if (isNetworkError(err)) return connectionErrorText(language);
  return translateApiError(err.message, language) || err.message;
}

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";

const STATUS_STYLES = {
  sent: "bg-emerald-500/20 text-emerald-200",
  failed: "bg-red-500/15 text-red-200",
  skipped_not_configured: "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]",
  skipped_no_email: "bg-amber-500/15 text-amber-200",
  link_opened: "bg-emerald-500/20 text-emerald-200",
};

const STATUS_LABELS_FA = {
  sent: "ارسال شد",
  failed: "ناموفق",
  skipped_not_configured: "پیکربندی نشده",
  skipped_no_email: "بدون ایمیل",
  link_opened: "لینک واتساپ باز شد",
};

const STATUS_LABELS_EN = {
  sent: "Sent",
  failed: "Failed",
  skipped_not_configured: "Not configured",
  skipped_no_email: "No email",
  link_opened: "WhatsApp link opened",
};

const STATUS_LABELS_AR = {
  sent: "تم الإرسال",
  failed: "فشل",
  skipped_not_configured: "غير مُهيّأ",
  skipped_no_email: "بدون بريد إلكتروني",
  link_opened: "تم فتح رابط واتساب",
};

const STATUS_LABELS_TR = {
  sent: "Gönderildi",
  failed: "Başarısız",
  skipped_not_configured: "Yapılandırılmadı",
  skipped_no_email: "E-posta yok",
  link_opened: "WhatsApp bağlantısı açıldı",
};

const TIER_STYLES = {
  friendly: "bg-cyan-500/15 text-cyan-200",
  firm: "bg-amber-500/15 text-amber-200",
  urgent: "bg-red-500/20 text-red-200",
};

function tierLabel(tier, language) {
  const labels = {
    friendly: { fa: "تازه معوق", ar: "متأخرة حديثًا", tr: "Yeni gecikti", en: "Just overdue" },
    firm: { fa: "بیش از یک هفته", ar: "أكثر من أسبوع", tr: "Bir haftadan fazla", en: "Over a week" },
    urgent: { fa: "بیش از یک ماه - فوری", ar: "أكثر من شهر - عاجل", tr: "Bir aydan fazla - acil", en: "Over a month - urgent" },
  };
  return (labels[tier] || labels.friendly)[language] || (labels[tier] || labels.friendly).en;
}

function statusLabelsFor(language) {
  if (language === "fa") return STATUS_LABELS_FA;
  if (language === "ar") return STATUS_LABELS_AR;
  if (language === "tr") return STATUS_LABELS_TR;
  return STATUS_LABELS_EN;
}

// The backend logs a handful of fixed English detail strings alongside
// each reminder (see payment_reminders.py::_record callers). Only the
// "failed" status carries a raw exception message (str(error)), which is
// genuinely unpredictable and left untranslated on purpose - everything
// else is one of these known, translatable sentences.
function detailLabel(detail, language) {
  if (!detail) return "";

  if (detail === "SMTP is not configured") {
    return language === "fa"
      ? "SMTP پیکربندی نشده است"
      : language === "ar"
      ? "لم يتم تهيئة SMTP"
      : language === "tr"
      ? "SMTP yapılandırılmadı"
      : detail;
  }

  if (detail === "Customer has no email on file") {
    return language === "fa"
      ? "ایمیلی برای این مشتری ثبت نشده است"
      : language === "ar"
      ? "لا يوجد بريد إلكتروني مسجل لهذا العميل"
      : language === "tr"
      ? "Bu müşteri için kayıtlı e-posta yok"
      : detail;
  }

  const sentMatch = /^Sent to (.+)$/.exec(detail);
  if (sentMatch) {
    const email = sentMatch[1];
    return language === "fa"
      ? `ارسال شد به ${email}`
      : language === "ar"
      ? `أُرسل إلى ${email}`
      : language === "tr"
      ? `Şuraya gönderildi: ${email}`
      : detail;
  }

  return detail;
}

export default function PaymentReminders() {
  const { dir, language, money, n } = useLanguage();

  const [status, setStatus] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState(null);
  const [whatsappId, setWhatsappId] = useState(null);
  const [channelBusyKey, setChannelBusyKey] = useState(null);
  const [extraChannels, setExtraChannels] = useState([]);
  const [paymentLinkId, setPaymentLinkId] = useState(null);
  const [smsId, setSmsId] = useState(null);
  const [telegramLinkId, setTelegramLinkId] = useState(null);
  const [whatsappAutoId, setWhatsappAutoId] = useState(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [statusData, overdueData, logData, settingsData] = await Promise.all([
        getPaymentReminderStatus(),
        getOverdueInvoices(),
        getPaymentReminderLog(),
        getSettings().catch(() => null),
      ]);
      setStatus(statusData);
      setOverdue(overdueData.items || []);
      setLog(logData.items || []);
      setExtraChannels(Array.isArray(settingsData?.reminder_channels) ? settingsData.reminder_channels : []);
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadAll(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function handleSendNow(invoiceId) {
    setSendingId(invoiceId);
    try {
      const result = await sendPaymentReminderNow(invoiceId);
      if (result.status === "sent") {
        toast.success(
          language === "fa"
            ? "یادآوری ارسال شد."
            : language === "ar"
            ? "تم إرسال التذكير."
            : language === "tr"
            ? "Hatırlatma gönderildi."
            : "Reminder sent."
        );
      } else {
        toast(
          (result.detail && detailLabel(result.detail, language)) ||
            statusLabelsFor(language)[result.status] ||
            result.status,
          { icon: "⚠️" }
        );
      }
      await loadAll();
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setSendingId(null);
    }
  }

  async function handleWhatsapp(invoiceId) {
    setWhatsappId(invoiceId);
    try {
      const result = await getWhatsappReminderLink(invoiceId);
      if (!result.available) {
        toast(
          language === "fa" ? "شماره موبایل یا تلفنی برای این مشتری ثبت نشده است." : language === "ar" ? "لا يوجد رقم هاتف مسجل لهذا العميل." : language === "tr" ? "Bu müşteri için kayıtlı telefon numarası yok." : "This customer has no phone number on file.",
          { icon: "⚠️" }
        );
        return;
      }
      window.open(result.url, "_blank", "noreferrer");
      await loadAll();
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setWhatsappId(null);
    }
  }

  // Generic handler for any admin-configured local messenger (Settings >
  // Reminder channels). Reuses the WhatsApp endpoint purely to get the
  // customer's phone number + the already-localized reminder message text,
  // then substitutes {phone}/{message} into that channel's own share-link
  // template - no separate backend endpoint needed per channel.
  async function handleChannel(invoiceId, channel) {
    const key = `${channel.id}:${invoiceId}`;
    setChannelBusyKey(key);
    try {
      const result = await getWhatsappReminderLink(invoiceId);
      if (!result.available) {
        toast(
          language === "fa" ? "شماره موبایل یا تلفنی برای این مشتری ثبت نشده است." : language === "ar" ? "لا يوجد رقم هاتف مسجل لهذا العميل." : language === "tr" ? "Bu müşteri için kayıtlı telefon numarası yok." : "This customer has no phone number on file.",
          { icon: "⚠️" }
        );
        return;
      }
      const url = channel.link_template
        .replace("{phone}", encodeURIComponent(result.number))
        .replace("{message}", encodeURIComponent(result.message));
      window.open(url, "_blank", "noreferrer");
      await loadAll();
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setChannelBusyKey(null);
    }
  }

  const linkCopiedText = language === "fa"
    ? "لینک پرداخت امن کپی شد؛ می‌توانید آن را در هر پیام‌رسان یا پیامک برای مشتری بفرستید."
    : language === "ar"
    ? "تم نسخ رابط الدفع الآمن؛ يمكنك إرساله عبر أي تطبيق مراسلة أو رسالة نصية للعميل."
    : language === "tr"
    ? "Güvenli ödeme bağlantısı kopyalandı; herhangi bir mesajlaşma uygulaması veya SMS ile müşteriye gönderebilirsiniz."
    : "Secure payment link copied; you can send it to the customer via any messenger or SMS.";

  async function handlePaymentLink(invoiceId) {
    setPaymentLinkId(invoiceId);
    try {
      const share = await getInvoicePaymentShareLink(invoiceId);
      await navigator.clipboard.writeText(share.message || share.payment_url);
      toast.success(linkCopiedText);
      if (share.whatsapp_url) {
        window.open(share.whatsapp_url, "_blank", "noreferrer");
      }
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setPaymentLinkId(null);
    }
  }

  async function handlePaymentLinkSms(invoiceId) {
    setSmsId(invoiceId);
    try {
      await sendInvoicePaymentLinkSms(invoiceId);
      toast.success(
        language === "fa" ? "پیامک ارسال شد." : language === "ar" ? "تم إرسال الرسالة النصية." : language === "tr" ? "SMS gönderildi." : "SMS sent."
      );
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setSmsId(null);
    }
  }

  async function handlePaymentLinkTelegram(invoiceId) {
    setTelegramLinkId(invoiceId);
    try {
      await sendInvoicePaymentLinkTelegram(invoiceId);
      toast.success(
        language === "fa" ? "پیام تلگرام ارسال شد." : language === "ar" ? "تم إرسال رسالة تيليجرام." : language === "tr" ? "Telegram mesajı gönderildi." : "Telegram message sent."
      );
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setTelegramLinkId(null);
    }
  }

  async function handlePaymentLinkWhatsappAuto(invoiceId) {
    setWhatsappAutoId(invoiceId);
    try {
      await sendInvoicePaymentLinkWhatsappAuto(invoiceId);
      toast.success(
        language === "fa" ? "پیام واتساپ ارسال شد." : language === "ar" ? "تم إرسال رسالة واتساب." : language === "tr" ? "WhatsApp mesajı gönderildi." : "WhatsApp message sent."
      );
    } catch (err) {
      toast.error(friendlyError(err, language));
    } finally {
      setWhatsappAutoId(null);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <BellRing className="text-[var(--erp-accent)]" />
        {language === "fa"
          ? "یادآوری خودکار پرداخت‌های معوق"
          : language === "ar"
          ? "تذكير تلقائي بالمدفوعات المتأخرة"
          : language === "tr"
          ? "Gecikmiş ödemeler için otomatik hatırlatma"
          : "Automated overdue payment reminders"}
      </h1>

      {status && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span
              className={`px-3 py-1 rounded-lg font-bold ${
                status.smtp_configured ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/15 text-amber-200"
              }`}
            >
              {status.smtp_configured
                ? language === "fa"
                  ? "ایمیل پیکربندی شده"
                  : language === "ar"
                  ? "البريد الإلكتروني مُهيّأ"
                  : language === "tr"
                  ? "E-posta yapılandırıldı"
                  : "Email is configured"
                : language === "fa"
                ? "ایمیل پیکربندی نشده"
                : language === "ar"
                ? "البريد الإلكتروني غير مُهيّأ"
                : language === "tr"
                ? "E-posta yapılandırılmadı"
                : "Email is not configured"}
            </span>
            <span className="text-[var(--erp-muted)]">
              {language === "fa"
                ? `آستانه معوقگی: ${n(status.overdue_days_threshold)} روز`
                : language === "ar"
                ? `عتبة التأخر: ${n(status.overdue_days_threshold)} يوم`
                : language === "tr"
                ? `Gecikme eşiği: ${n(status.overdue_days_threshold)} gün`
                : `Overdue threshold: ${n(status.overdue_days_threshold)} day(s)`}
            </span>
            <span className="text-[var(--erp-muted)]">
              {language === "fa"
                ? `فاصله بین یادآوری‌ها: ${n(status.cooldown_days)} روز`
                : language === "ar"
                ? `الفاصل بين التذكيرات: ${n(status.cooldown_days)} يوم`
                : language === "tr"
                ? `Hatırlatmalar arası bekleme: ${n(status.cooldown_days)} gün`
                : `Cooldown between reminders: ${n(status.cooldown_days)} day(s)`}
            </span>
          </div>
          {!status.smtp_configured && (
            <p className="text-xs text-[var(--erp-muted)] mt-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-300 flex-shrink-0" />
              {language === "fa"
                ? "بدون تنظیم SMTP، یادآوری‌ها فقط ثبت می‌شوند و ایمیلی ارسال نمی‌شود."
                : language === "ar"
                ? "بدون تهيئة SMTP، يتم تسجيل التذكيرات فقط ولا يُرسل أي بريد إلكتروني."
                : language === "tr"
                ? "SMTP yapılandırılmadan hatırlatmalar yalnızca kaydedilir, e-posta gönderilmez."
                : "Without SMTP configuration, reminders are only logged - no email is actually sent."}
            </p>
          )}
        </section>
      )}

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">
          {language === "fa"
            ? "فاکتورهای معوق"
            : language === "ar"
            ? "الفواتير المتأخرة"
            : language === "tr"
            ? "Gecikmiş faturalar"
            : "Overdue invoices"}
        </h2>
        {loading ? (
          <p className="text-[var(--erp-muted)]">
            {language === "fa"
              ? "در حال بارگذاری..."
              : language === "ar"
              ? "جارٍ التحميل..."
              : language === "tr"
              ? "Yükleniyor..."
              : "Loading..."}
          </p>
        ) : overdue.length === 0 ? (
          <p className="text-[var(--erp-muted)]">
            {language === "fa"
              ? "فاکتور معوقی وجود ندارد."
              : language === "ar"
              ? "لا توجد فواتير متأخرة."
              : language === "tr"
              ? "Gecikmiş fatura yok."
              : "No overdue invoices."}
          </p>
        ) : (
          <div className="space-y-2">
            {overdue.map((item) => (
              <div key={item.invoice_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    #{n(item.invoice_id)} — {item.customer_name}
                    {item.tier && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${TIER_STYLES[item.tier] || TIER_STYLES.friendly}`}>
                        {tierLabel(item.tier, language)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--erp-muted)]">{money(item.remaining_amount)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleWhatsapp(item.invoice_id)}
                    disabled={whatsappId === item.invoice_id}
                    className="px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-200 font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                  >
                    <MessageCircle size={14} />
                    {language === "fa" ? "واتساپ" : language === "ar" ? "واتساب" : language === "tr" ? "WhatsApp" : "WhatsApp"}
                  </button>
                  {extraChannels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => handleChannel(item.invoice_id, channel)}
                      disabled={channelBusyKey === `${channel.id}:${item.invoice_id}`}
                      className="px-3 py-2 rounded-xl bg-cyan-500/15 text-cyan-200 font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                    >
                      <MessageCircle size={14} />
                      {channel.name}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePaymentLink(item.invoice_id)}
                    disabled={paymentLinkId === item.invoice_id}
                    className="px-3 py-2 rounded-xl bg-violet-500/15 text-violet-200 font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                    title={language === "fa" ? "کپی لینک پرداخت امن + باز کردن واتساپ" : language === "ar" ? "نسخ رابط الدفع الآمن + فتح واتساب" : language === "tr" ? "Güvenli ödeme bağlantısını kopyala + WhatsApp'ı aç" : "Copy secure payment link + open WhatsApp"}
                  >
                    <Link2 size={14} />
                    {language === "fa" ? "لینک پرداخت" : language === "ar" ? "رابط الدفع" : language === "tr" ? "Ödeme bağlantısı" : "Payment link"}
                  </button>
                  <button
                    onClick={() => handlePaymentLinkSms(item.invoice_id)}
                    disabled={smsId === item.invoice_id}
                    className="px-3 py-2 rounded-xl bg-orange-500/15 text-orange-200 font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                    title={language === "fa" ? "ارسال لینک پرداخت با پیامک (نیازمند تنظیم پنل پیامک)" : language === "ar" ? "إرسال رابط الدفع عبر الرسائل النصية (يتطلب إعداد لوحة الرسائل)" : language === "tr" ? "Ödeme bağlantısını SMS ile gönder (SMS paneli gerektirir)" : "Send payment link via SMS (requires SMS panel setup)"}
                  >
                    <MessageSquareMore size={14} />
                    {language === "fa" ? "پیامک" : language === "ar" ? "رسالة نصية" : language === "tr" ? "SMS" : "SMS"}
                  </button>
                  <button
                    onClick={() => handlePaymentLinkTelegram(item.invoice_id)}
                    disabled={telegramLinkId === item.invoice_id}
                    className="px-3 py-2 rounded-xl bg-sky-500/15 text-sky-200 font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                    title={language === "fa" ? "ارسال خودکار لینک پرداخت با تلگرام (نیازمند توکن ربات و شناسه چت مشتری)" : language === "ar" ? "إرسال رابط الدفع تلقائيًا عبر تيليجرام" : language === "tr" ? "Ödeme bağlantısını Telegram ile otomatik gönder" : "Auto-send payment link via Telegram (requires bot token + customer chat ID)"}
                  >
                    <MessageCircle size={14} />
                    {language === "fa" ? "تلگرام" : language === "ar" ? "تيليجرام" : language === "tr" ? "Telegram" : "Telegram"}
                  </button>
                  <button
                    onClick={() => handlePaymentLinkWhatsappAuto(item.invoice_id)}
                    disabled={whatsappAutoId === item.invoice_id}
                    className="px-3 py-2 rounded-xl bg-teal-500/15 text-teal-200 font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                    title={language === "fa" ? "ارسال خودکار لینک پرداخت با واتساپ (نیازمند تنظیم WhatsApp Cloud API)" : language === "ar" ? "إرسال رابط الدفع تلقائيًا عبر واتساب" : language === "tr" ? "Ödeme bağlantısını WhatsApp ile otomatik gönder" : "Auto-send payment link via WhatsApp (requires WhatsApp Cloud API setup)"}
                  >
                    <MessageCircle size={14} />
                    {language === "fa" ? "واتساپ خودکار" : language === "ar" ? "واتساب تلقائي" : language === "tr" ? "Otomatik WhatsApp" : "Auto WhatsApp"}
                  </button>
                  <button
                    onClick={() => handleSendNow(item.invoice_id)}
                    disabled={sendingId === item.invoice_id}
                    className="px-3 py-2 rounded-xl bg-[var(--erp-accent)] text-black font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                  >
                    <Send size={14} />
                    {sendingId === item.invoice_id
                      ? language === "fa"
                        ? "در حال ارسال..."
                        : language === "ar"
                        ? "جارٍ الإرسال..."
                        : language === "tr"
                        ? "Gönderiliyor..."
                        : "Sending..."
                      : language === "fa"
                      ? "ارسال ایمیل"
                      : language === "ar"
                      ? "إرسال بريد إلكتروني"
                      : language === "tr"
                      ? "E-posta gönder"
                      : "Send email"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">
          {language === "fa"
            ? "گزارش یادآوری‌ها"
            : language === "ar"
            ? "سجل التذكيرات"
            : language === "tr"
            ? "Hatırlatma günlüğü"
            : "Reminder log"}
        </h2>
        {log.length === 0 ? (
          <p className="text-[var(--erp-muted)]">
            {language === "fa"
              ? "هنوز یادآوری ثبت نشده است."
              : language === "ar"
              ? "لم يتم تسجيل أي تذكير بعد."
              : language === "tr"
              ? "Henüz hatırlatma kaydedilmedi."
              : "No reminders logged yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {log.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3 text-sm">
                <div>
                  <span className="font-bold">#{n(entry.invoice_id)}</span>{" "}
                  <span className="text-[var(--erp-muted)]">{entry.customer_name}</span>
                  {entry.detail && <span className="text-[var(--erp-muted)] ms-2">— {detailLabel(entry.detail, language)}</span>}
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${STATUS_STYLES[entry.status] || "bg-white/10 text-[var(--erp-muted)]"}`}>
                  {statusLabelsFor(language)[entry.status] || entry.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
