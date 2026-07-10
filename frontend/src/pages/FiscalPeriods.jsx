import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldCheck,
  UnlockKeyhole,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";
import {
  closeFiscalPeriod,
  createFiscalPeriod,
  getFiscalPeriods,
  reopenFiscalPeriod,
} from "../services/fiscalPeriodsApi";

function currentYearForm() {
  const year = new Date().getFullYear();
  return {
    name: `Fiscal ${year}`,
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
  };
}

export default function FiscalPeriods() {
  const { user } = useAuth();
  const { language, dir, date, money, n } = useLanguage();
  const fa = language === "fa";
  const isAdmin = user?.role === "admin";
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(currentYearForm);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "مدیریت دوره‌های مالی" : "Fiscal Period Management",
    subtitle: fa
      ? "ایجاد سال مالی، کنترل تراز اسناد و قفل عملیات دوره‌های بسته"
      : "Create fiscal years, verify voucher balance, and lock closed-period activity",
    refresh: fa ? "به‌روزرسانی" : "Refresh",
    newPeriod: fa ? "ایجاد دوره مالی جدید" : "Create a Fiscal Period",
    name: fa ? "نام دوره" : "Period name",
    start: fa ? "تاریخ شروع" : "Start date",
    end: fa ? "تاریخ پایان" : "End date",
    create: fa ? "ایجاد دوره" : "Create period",
    open: fa ? "باز" : "Open",
    closed: fa ? "بسته" : "Closed",
    close: fa ? "بستن دوره" : "Close period",
    reopen: fa ? "بازگشایی دوره" : "Reopen period",
    vouchers: fa ? "تعداد اسناد" : "Vouchers",
    debit: fa ? "جمع بدهکار" : "Total debit",
    credit: fa ? "جمع بستانکار" : "Total credit",
    difference: fa ? "اختلاف" : "Difference",
    balanced: fa ? "تراز" : "Balanced",
    unbalanced: fa ? "دارای اختلاف" : "Out of balance",
    empty: fa ? "هنوز دوره مالی ایجاد نشده است." : "No fiscal periods have been created.",
    adminOnly: fa
      ? "ایجاد، بستن و بازگشایی دوره فقط برای مدیر سیستم فعال است."
      : "Only administrators can create, close, or reopen fiscal periods.",
    closeWarning: fa
      ? "پس از بستن دوره، ثبت، تغییر یا حذف اسناد آن ممکن نیست. دوره بسته شود؟"
      : "Closing locks voucher creation, changes, and deletion in this period. Continue?",
    reopenWarning: fa
      ? "با بازگشایی، عملیات مالی این دوره دوباره فعال می‌شود. ادامه می‌دهید؟"
      : "Reopening enables financial activity in this period again. Continue?",
  };

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getFiscalPeriods();
      setPeriods(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.message || (fa ? "خطا در دریافت دوره‌ها" : "Unable to load periods"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [language]);

  const totals = useMemo(
    () =>
      periods.reduce(
        (sum, period) => ({
          vouchers: sum.vouchers + Number(period.vouchers_count || 0),
          debit: sum.debit + Number(period.total_debit || 0),
          credit: sum.credit + Number(period.total_credit || 0),
          open: sum.open + (period.status === "open" ? 1 : 0),
        }),
        { vouchers: 0, debit: 0, credit: 0, open: 0 },
      ),
    [periods],
  );

  async function submit(event) {
    event.preventDefault();
    if (!isAdmin || creating) return;
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      toast.error(fa ? "همه فیلدها الزامی هستند." : "All fields are required.");
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error(fa ? "تاریخ پایان باید بعد از شروع باشد." : "End date must be after start date.");
      return;
    }
    setCreating(true);
    try {
      await createFiscalPeriod({ ...form, name: form.name.trim() });
      toast.success(fa ? "دوره مالی ایجاد شد." : "Fiscal period created.");
      setForm(currentYearForm());
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setCreating(false);
    }
  }

  async function changeStatus(period, action) {
    if (!isAdmin || busyId) return;
    const warning = action === "close" ? copy.closeWarning : copy.reopenWarning;
    if (!window.confirm(warning)) return;

    setBusyId(period.id);
    try {
      if (action === "close") await closeFiscalPeriod(period.id);
      else await reopenFiscalPeriod(period.id);
      toast.success(
        action === "close"
          ? fa ? "دوره مالی بسته شد." : "Fiscal period closed."
          : fa ? "دوره مالی بازگشایی شد." : "Fiscal period reopened.",
      );
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  const card = {
    background: "linear-gradient(145deg, rgba(15,23,42,.94), rgba(15,23,42,.7))",
    border: "1px solid rgba(34,211,238,.2)",
    borderRadius: 24,
    boxShadow: "0 20px 60px rgba(2,6,23,.3)",
  };
  const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,.25)",
    background: "#111c35",
    color: "#f8fafc",
    outline: "none",
  };

  return (
    <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 52, height: 52, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#22c55e)", color: "#03111f" }}>
              <CalendarDays size={28} />
            </div>
            <div>
              <h1 style={{ margin: 0, color: "#67e8f9", fontSize: "clamp(28px,4vw,42px)", fontWeight: 950 }}>{copy.title}</h1>
              <p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p>
            </div>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, borderRadius: 14, padding: "12px 17px", fontWeight: 900, cursor: "pointer", background: "#164e63", color: "#cffafe" }}>
          <RefreshCw size={18} className={loading ? "spin" : ""} />
          {copy.refresh}
        </button>
      </header>

      {!isAdmin && (
        <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: 16, marginBottom: 20, borderColor: "rgba(245,158,11,.35)" }}>
          <ShieldCheck color="#fbbf24" />
          <span style={{ color: "#fde68a" }}>{copy.adminOnly}</span>
        </div>
      )}

      {error && (
        <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: 16, marginBottom: 20, borderColor: "rgba(239,68,68,.4)", color: "#fecaca" }}>
          <AlertTriangle />
          {error}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
        {[
          [CalendarDays, fa ? "کل دوره‌ها" : "Periods", n(periods.length), "#67e8f9"],
          [UnlockKeyhole, fa ? "دوره‌های باز" : "Open periods", n(totals.open), "#86efac"],
          [FileText, copy.vouchers, n(totals.vouchers), "#c4b5fd"],
          [Scale, copy.difference, money(Math.abs(totals.debit - totals.credit)), Math.abs(totals.debit - totals.credit) < 0.01 ? "#86efac" : "#fca5a5"],
        ].map(([Icon, label, value, color]) => (
          <article key={label} style={{ ...card, padding: 18 }}>
            <Icon size={22} color={color} />
            <div style={{ color: "#94a3b8", marginTop: 12, fontSize: 13 }}>{label}</div>
            <div style={{ color, marginTop: 5, fontSize: 23, fontWeight: 950 }}>{value}</div>
          </article>
        ))}
      </section>

      {isAdmin && (
        <form onSubmit={submit} style={{ ...card, padding: 20, marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 18px", display: "flex", alignItems: "center", gap: 9, color: "#a5f3fc" }}>
            <Plus size={22} /> {copy.newPeriod}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,2fr) minmax(170px,1fr) minmax(170px,1fr) auto", gap: 12, alignItems: "end" }}>
            <label style={{ color: "#cbd5e1", fontSize: 13 }}>
              {copy.name}
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={{ ...input, marginTop: 7 }} />
            </label>
            <label style={{ color: "#cbd5e1", fontSize: 13 }}>
              {copy.start}
              <input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} style={{ ...input, marginTop: 7 }} />
            </label>
            <label style={{ color: "#cbd5e1", fontSize: 13 }}>
              {copy.end}
              <input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} style={{ ...input, marginTop: 7 }} />
            </label>
            <button disabled={creating} type="submit" style={{ border: 0, borderRadius: 14, padding: "13px 20px", minHeight: 45, fontWeight: 950, cursor: creating ? "wait" : "pointer", background: "linear-gradient(135deg,#22d3ee,#22c55e)", color: "#03111f" }}>
              {creating ? "..." : copy.create}
            </button>
          </div>
        </form>
      )}

      <section style={{ display: "grid", gap: 16 }}>
        {!loading && periods.length === 0 && (
          <div style={{ ...card, padding: 36, textAlign: "center", color: "#94a3b8" }}>{copy.empty}</div>
        )}
        {periods.map((period) => {
          const difference = Number(period.total_debit || 0) - Number(period.total_credit || 0);
          const balanced = Math.abs(difference) < 0.01;
          const isOpen = period.status === "open";
          return (
            <article key={period.id} style={{ ...card, padding: 20, borderColor: isOpen ? "rgba(34,197,94,.32)" : "rgba(148,163,184,.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, color: "#e2e8f0", fontSize: 24 }}>{period.name}</h2>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 900, color: isOpen ? "#bbf7d0" : "#cbd5e1", background: isOpen ? "rgba(34,197,94,.14)" : "rgba(100,116,139,.18)" }}>
                      {isOpen ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
                      {isOpen ? copy.open : copy.closed}
                    </span>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: balanced ? "#86efac" : "#fca5a5", fontSize: 13, fontWeight: 800 }}>
                      {balanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      {balanced ? copy.balanced : copy.unbalanced}
                    </span>
                  </div>
                  <div style={{ marginTop: 9, color: "#94a3b8" }}>{date(period.start_date)} — {date(period.end_date)}</div>
                </div>
                {isAdmin && (
                  <button onClick={() => changeStatus(period, isOpen ? "close" : "reopen")} disabled={busyId === period.id} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, borderRadius: 13, padding: "11px 15px", fontWeight: 900, cursor: "pointer", color: isOpen ? "#fee2e2" : "#cffafe", background: isOpen ? "#7f1d1d" : "#155e75" }}>
                    {isOpen ? <LockKeyhole size={17} /> : <RotateCcw size={17} />}
                    {busyId === period.id ? "..." : isOpen ? copy.close : copy.reopen}
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 18 }}>
                {[
                  [copy.vouchers, n(period.vouchers_count || 0)],
                  [copy.debit, money(period.total_debit || 0)],
                  [copy.credit, money(period.total_credit || 0)],
                  [copy.difference, money(Math.abs(difference))],
                ].map(([label, value]) => (
                  <div key={label} style={{ borderRadius: 16, padding: 13, background: "rgba(30,41,59,.72)" }}>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
                    <div style={{ color: "#e0f2fe", fontWeight: 900, marginTop: 6 }}>{value}</div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
