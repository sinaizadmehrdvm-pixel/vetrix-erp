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

const cardClass = "rounded-2xl border border-white/10 bg-white/5 p-5";

const STATUS_STYLES = {
  sent: "bg-emerald-500/20 text-emerald-200",
  failed: "bg-red-500/15 text-red-200",
  skipped_not_configured: "bg-white/10 text-slate-300",
  skipped_no_email: "bg-amber-500/15 text-amber-200",
};

export default function PaymentReminders() {
  const { dir, language, money } = useLanguage();
  const fa = language === "fa";

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
        toast.success(fa ? "یادآوری ارسال شد." : "Reminder sent.");
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
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-white">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <BellRing className="text-cyan-400" />
        {fa ? "یادآوری خودکار پرداخت‌های معوق" : "Automated overdue payment reminders"}
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
                ? (fa ? "ایمیل پیکربندی شده" : "Email is configured")
                : (fa ? "ایمیل پیکربندی نشده" : "Email is not configured")}
            </span>
            <span className="text-slate-400">
              {fa
                ? `آستانه معوقگی: ${status.overdue_days_threshold} روز`
                : `Overdue threshold: ${status.overdue_days_threshold} day(s)`}
            </span>
            <span className="text-slate-400">
              {fa
                ? `فاصله بین یادآوری‌ها: ${status.cooldown_days} روز`
                : `Cooldown between reminders: ${status.cooldown_days} day(s)`}
            </span>
          </div>
          {!status.smtp_configured && (
            <p className="text-xs text-slate-400 mt-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-300 flex-shrink-0" />
              {fa
                ? "بدون تنظیم SMTP، یادآوری‌ها فقط ثبت می‌شوند و ایمیلی ارسال نمی‌شود."
                : "Without SMTP configuration, reminders are only logged - no email is actually sent."}
            </p>
          )}
        </section>
      )}

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{fa ? "فاکتورهای معوق" : "Overdue invoices"}</h2>
        {loading ? (
          <p className="text-slate-400">{fa ? "در حال بارگذاری..." : "Loading..."}</p>
        ) : overdue.length === 0 ? (
          <p className="text-slate-400">{fa ? "فاکتور معوقی وجود ندارد." : "No overdue invoices."}</p>
        ) : (
          <div className="space-y-2">
            {overdue.map((item) => (
              <div key={item.invoice_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
                <div>
                  <div className="font-bold">#{item.invoice_id} — {item.customer_name}</div>
                  <div className="text-xs text-slate-400">{money(item.remaining_amount)}</div>
                </div>
                <button
                  onClick={() => handleSendNow(item.invoice_id)}
                  disabled={sendingId === item.invoice_id}
                  className="px-3 py-2 rounded-xl bg-cyan-400 text-black font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                >
                  <Send size={14} />
                  {sendingId === item.invoice_id ? (fa ? "..." : "...") : (fa ? "ارسال یادآوری" : "Send reminder")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{fa ? "گزارش یادآوری‌ها" : "Reminder log"}</h2>
        {log.length === 0 ? (
          <p className="text-slate-400">{fa ? "هنوز یادآوری ثبت نشده است." : "No reminders logged yet."}</p>
        ) : (
          <div className="space-y-2">
            {log.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/20 px-4 py-3 text-sm">
                <div>
                  <span className="font-bold">#{entry.invoice_id}</span>{" "}
                  <span className="text-slate-300">{entry.customer_name}</span>
                  {entry.detail && <span className="text-slate-500 ms-2">— {entry.detail}</span>}
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${STATUS_STYLES[entry.status] || "bg-white/10 text-slate-300"}`}>
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
