import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronLeft, X } from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { getExecutiveAlertsSummary } from "../services/api";

const VISIBLE_ROLES = new Set(["admin", "accountant"]);

function dismissKey() {
  return `vetrix_alerts_dismissed_${new Date().toISOString().slice(0, 10)}`;
}

const CATEGORY_ICON_TONE = {
  receivable: "text-cyan-300",
  payable: "text-amber-300",
  cheque_in: "text-cyan-300",
  cheque_out: "text-amber-300",
  low_stock: "text-rose-300",
};

// Session-only dismissal (sessionStorage, keyed by today's date) - hiding
// this panel never marks the underlying items as resolved; the full
// Alerts Center (ExecutiveAlerts.jsx) always shows every unresolved item
// regardless of whether this quick panel was dismissed.
export default function ExecutiveAlertsPanel() {
  const { user } = useAuth();
  const { dir, language, money, n } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [summary, setSummary] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(dismissKey()) === "1"; } catch { return false; }
  });

  const eligible = VISIBLE_ROLES.has(user?.role) || user?.is_super_admin;

  useEffect(() => {
    if (!eligible) return undefined;
    const timer = setTimeout(() => {
      getExecutiveAlertsSummary().then(setSummary).catch((err) => toast.error(err.message));
    }, 0);
    return () => clearTimeout(timer);
  }, [eligible]);

  if (!eligible || dismissed || !summary || summary.counts.total === 0) return null;

  function dismiss() {
    try { sessionStorage.setItem(dismissKey(), "1"); } catch { /* sessionStorage unavailable (e.g. private mode) - panel stays visible for this load only */ }
    setDismissed(true);
  }

  const topItems = summary.items.slice(0, 4);

  return (
    <div
      dir={dir}
      className="rounded-2xl p-4 mb-6"
      style={{ background: "var(--erp-panel)", border: "1px solid var(--erp-border)" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-300" />
          <div>
            <div className="font-black text-[var(--erp-text)]">
              {tr("مرور وضعیت روزانه", "مراجعة الوضع اليومي", "Günlük durum özeti", "Daily situation review")}
            </div>
            <div className="text-sm text-[var(--erp-muted)]">
              {tr(
                `${n(summary.counts.critical)} مورد بحرانی، ${n(summary.counts.warning)} هشدار — مجموع مواجهه مالی: ${money(summary.total_financial_exposure)}`,
                `${n(summary.counts.critical)} حرج، ${n(summary.counts.warning)} تحذير — إجمالي التعرض المالي: ${money(summary.total_financial_exposure)}`,
                `${n(summary.counts.critical)} kritik, ${n(summary.counts.warning)} uyarı — toplam finansal risk: ${money(summary.total_financial_exposure)}`,
                `${n(summary.counts.critical)} critical, ${n(summary.counts.warning)} warning — total financial exposure: ${money(summary.total_financial_exposure)}`
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/executive-alerts" className="text-sm font-bold px-3 py-2 rounded-xl bg-[var(--erp-accent)] text-black flex items-center gap-1">
            {tr("مرکز هشدارها", "مركز التنبيهات", "Uyarı merkezi", "Alerts Center")} <ChevronLeft size={14} />
          </Link>
          <button onClick={dismiss} className="p-2 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]" title={tr("بستن برای این نشست", "إغلاق لهذه الجلسة", "Bu oturum için kapat", "Dismiss for this session")}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
        {topItems.map((item, index) => (
          <div key={index} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--erp-panel-solid)] px-3 py-2 text-sm">
            <span className={CATEGORY_ICON_TONE[item.category] || ""}>{item.title}</span>
            {item.amount ? <span className="font-bold">{money(item.amount)}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
