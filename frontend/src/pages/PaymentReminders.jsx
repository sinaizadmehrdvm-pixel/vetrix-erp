import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, Send } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  getOverdueInvoices,
  getPaymentReminderLog,
  getPaymentReminderStatus,
  sendPaymentReminderNow,
} from "../services/api";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";

const STATUS_STYLES = {
  sent: "bg-emerald-500/20 text-emerald-200",
  failed: "bg-red-500/15 text-red-200",
  skipped_not_configured: "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]",
  skipped_no_email: "bg-amber-500/15 text-amber-200",
};

const STATUS_LABELS_FA = {
  sent: "ارسال شد",
  failed: "ناموفق",
  skipped_not_configured: "پیکربندی نشده",
  skipped_no_email: "بدون ایمیل",
};

const STATUS_LABELS_EN = {
  sent: "Sent",
  failed: "Failed",
  skipped_not_configured: "Not configured",
  skipped_no_email: "No email",
};

const STATUS_LABELS_AR = {
  sent: "تم الإرسال",
  failed: "فشل",
  skipped_not_configured: "غير مُهيّأ",
  skipped_no_email: "بدون بريد إلكتروني",
};

const STATUS_LABELS_TR = {
  sent: "Gönderildi",
  failed: "Başarısız",
  skipped_not_configured: "Yapılandırılmadı",
  skipped_no_email: "E-posta yok",
};

function statusLabelsFor(language) {
  if (language === "fa") return STATUS_LABELS_FA;
  if (language === "ar") return STATUS_LABELS_AR;
  if (language === "tr") return STATUS_LABELS_TR;
  return STATUS_LABELS_EN;
}

export default function PaymentReminders() {
  const { dir, language, money, n } = useLanguage();

  const [status, setStatus] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [statusData, overdueData, logData] = await Promise.all([
        getPaymentReminderStatus(),
        getOverdueInvoices(),
        getPaymentReminderLog(),
      ]);
      setStatus(statusData);
      setOverdue(overdueData.items || []);
      setLog(logData.items || []);
    } catch (err) {
      toast.error(err.message);
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
        toast(result.detail || result.status, { icon: "⚠️" });
      }
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingId(null);
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
                ? `آستانه معوقگی: ${status.overdue_days_threshold} روز`
                : language === "ar"
                ? `عتبة التأخر: ${status.overdue_days_threshold} يوم`
                : language === "tr"
                ? `Gecikme eşiği: ${status.overdue_days_threshold} gün`
                : `Overdue threshold: ${status.overdue_days_threshold} day(s)`}
            </span>
            <span className="text-[var(--erp-muted)]">
              {language === "fa"
                ? `فاصله بین یادآوری‌ها: ${status.cooldown_days} روز`
                : language === "ar"
                ? `الفاصل بين التذكيرات: ${status.cooldown_days} يوم`
                : language === "tr"
                ? `Hatırlatmalar arası bekleme: ${status.cooldown_days} gün`
                : `Cooldown between reminders: ${status.cooldown_days} day(s)`}
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
                  <div className="font-bold">#{n(item.invoice_id)} — {item.customer_name}</div>
                  <div className="text-xs text-[var(--erp-muted)]">{money(item.remaining_amount)}</div>
                </div>
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
                    ? "ارسال یادآوری"
                    : language === "ar"
                    ? "إرسال تذكير"
                    : language === "tr"
                    ? "Hatırlatma gönder"
                    : "Send reminder"}
                </button>
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
                  {entry.detail && <span className="text-[var(--erp-muted)] ms-2">— {entry.detail}</span>}
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
