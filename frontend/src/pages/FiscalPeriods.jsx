import { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
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
import { confirmAction } from "../components/ui/confirmService";

import { useAuth } from "../auth/AuthContext";
import JalaliDateField from "../components/forms/JalaliDateField";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import {
  closeFiscalPeriod,
  createFiscalPeriod,
  getFiscalPeriods,
  getFiscalClosingPreview,
  reopenFiscalPeriod,
} from "../services/fiscalPeriodsApi";

// The suggested default name only - the admin can freely retype it, but it
// shouldn't start out as a hardcoded English word ("Fiscal") + Latin digits
// on an RTL Persian page.
function currentYearForm(language) {
  const year = new Date().getFullYear();
  const label = language === "fa" ? "سال مالی" : language === "ar" ? "السنة المالية" : language === "tr" ? "Mali Yıl" : "Fiscal";
  const yearText = language === "fa" ? toPersianDigits(String(year)) : String(year);
  return {
    name: `${label} ${yearText}`,
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
  };
}

export default function FiscalPeriods() {
  const { user } = useAuth();
  const { language, dir, date, money, n } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const isAdmin = user?.role === "admin";
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(() => currentYearForm(language));
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const copy = {
    title: tr("مدیریت دوره‌های مالی", "إدارة الفترات المالية", "Mali Dönem Yönetimi", "Fiscal Period Management"),
    subtitle: tr(
      "ایجاد سال مالی، کنترل تراز اسناد و قفل عملیات دوره‌های بسته",
      "إنشاء سنة مالية، والتحقق من توازن المستندات، وقفل نشاط الفترات المغلقة",
      "Mali yıl oluşturma, belge dengesini kontrol etme ve kapalı dönem işlemlerini kilitleme",
      "Create fiscal years, verify voucher balance, and lock closed-period activity"
    ),
    refresh: tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh"),
    newPeriod: tr("ایجاد دوره مالی جدید", "إنشاء فترة مالية جديدة", "Yeni mali dönem oluştur", "Create a Fiscal Period"),
    name: tr("نام دوره", "اسم الفترة", "Dönem adı", "Period name"),
    start: tr("تاریخ شروع", "تاريخ البدء", "Başlangıç tarihi", "Start date"),
    end: tr("تاریخ پایان", "تاريخ الانتهاء", "Bitiş tarihi", "End date"),
    create: tr("ایجاد دوره", "إنشاء الفترة", "Dönem oluştur", "Create period"),
    open: tr("باز", "مفتوحة", "Açık", "Open"),
    closed: tr("بسته", "مغلقة", "Kapalı", "Closed"),
    close: tr("بستن دوره", "إغلاق الفترة", "Dönemi kapat", "Close period"),
    reopen: tr("بازگشایی دوره", "إعادة فتح الفترة", "Dönemi yeniden aç", "Reopen period"),
    vouchers: tr("تعداد اسناد", "عدد المستندات", "Belge sayısı", "Vouchers"),
    debit: tr("جمع بدهکار", "إجمالي المدين", "Toplam borç", "Total debit"),
    credit: tr("جمع بستانکار", "إجمالي الدائن", "Toplam alacak", "Total credit"),
    difference: tr("اختلاف", "الفرق", "Fark", "Difference"),
    balanced: tr("تراز", "متوازن", "Dengeli", "Balanced"),
    unbalanced: tr("دارای اختلاف", "غير متوازن", "Dengesiz", "Out of balance"),
    empty: tr("هنوز دوره مالی ایجاد نشده است.", "لم يتم إنشاء أي فترة مالية بعد.", "Henüz mali dönem oluşturulmadı.", "No fiscal periods have been created."),
    adminOnly: tr(
      "ایجاد، بستن و بازگشایی دوره فقط برای مدیر سیستم فعال است.",
      "إنشاء الفترات وإغلاقها وإعادة فتحها متاح فقط لمدير النظام.",
      "Dönem oluşturma, kapatma ve yeniden açma yalnızca sistem yöneticisi içindir.",
      "Only administrators can create, close, or reopen fiscal periods."
    ),
    closeWarning: tr(
      "پس از بستن دوره، ثبت، تغییر یا حذف اسناد آن ممکن نیست. دوره بسته شود؟",
      "بعد إغلاق الفترة، لا يمكن تسجيل أو تعديل أو حذف مستنداتها. هل تريد إغلاق الفترة؟",
      "Dönem kapatıldıktan sonra belge oluşturma, değiştirme veya silme mümkün değildir. Dönem kapatılsın mı?",
      "Closing locks voucher creation, changes, and deletion in this period. Continue?"
    ),
    reopenWarning: tr(
      "با بازگشایی، عملیات مالی این دوره دوباره فعال می‌شود. ادامه می‌دهید؟",
      "بإعادة الفتح، سيتم تفعيل النشاط المالي لهذه الفترة مرة أخرى. هل تريد المتابعة؟",
      "Yeniden açıldığında bu dönemin mali işlemleri tekrar etkinleşir. Devam edilsin mi?",
      "Reopening enables financial activity in this period again. Continue?"
    ),
  };

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getFiscalPeriods();
      setPeriods(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.message || tr("خطا در دریافت دوره‌ها", "خطأ في تحميل الفترات", "Dönemler yüklenirken hata oluştu", "Unable to load periods"));
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoad]);

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
      toast.error(tr("همه فیلدها الزامی هستند.", "جميع الحقول مطلوبة.", "Tüm alanlar zorunludur.", "All fields are required."));
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error(tr("تاریخ پایان باید بعد از شروع باشد.", "يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء.", "Bitiş tarihi başlangıç tarihinden sonra olmalıdır.", "End date must be after start date."));
      return;
    }
    setCreating(true);
    try {
      await createFiscalPeriod({ ...form, name: form.name.trim() });
      toast.success(tr("دوره مالی ایجاد شد.", "تم إنشاء الفترة المالية.", "Mali dönem oluşturuldu.", "Fiscal period created."));
      setForm(currentYearForm(language));
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setCreating(false);
    }
  }

  async function changeStatus(period, action) {
    if (!isAdmin || busyId) return;
    setBusyId(period.id);
    try {
      let warning = action === "close" ? copy.closeWarning : copy.reopenWarning;
      if (action === "close") {
        const preview = await getFiscalClosingPreview(period.id);
        warning += tr(
          `\n\nسود/زیان خالص: ${money(preview.net_income)}\nحساب‌های قابل بستن: ${n(preview.accounts.length)}`,
          `\n\nصافي الربح/الخسارة: ${money(preview.net_income)}\nالحسابات القابلة للإغلاق: ${n(preview.accounts.length)}`,
          `\n\nNet kâr/zarar: ${money(preview.net_income)}\nKapatılacak hesaplar: ${n(preview.accounts.length)}`,
          `\n\nNet income/loss: ${money(preview.net_income)}\nAccounts to close: ${n(preview.accounts.length)}`
        );
      }
      if (!(await confirmAction(warning))) {
        setBusyId(null);
        return;
      }
      if (action === "close") await closeFiscalPeriod(period.id);
      else await reopenFiscalPeriod(period.id);
      toast.success(
        action === "close"
          ? tr("دوره مالی بسته شد.", "تم إغلاق الفترة المالية.", "Mali dönem kapatıldı.", "Fiscal period closed.")
          : tr("دوره مالی بازگشایی شد.", "تم إعادة فتح الفترة المالية.", "Mali dönem yeniden açıldı.", "Fiscal period reopened."),
      );
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  const card = {
    background: "var(--erp-panel)",
    border: "1px solid var(--erp-border)",
    borderRadius: 24,
    boxShadow: "0 20px 60px rgba(2,6,23,.3)",
  };
  const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid var(--erp-border)",
    background: "var(--erp-panel-solid)",
    color: "var(--erp-text)",
    outline: "none",
  };

  return (
    <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 52, height: 52, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#22c55e)", color: "#03111f" }}>
              <CalendarDays size={28} />
            </div>
            <div>
              <h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(28px,4vw,42px)", fontWeight: 950 }}>{copy.title}</h1>
              <p style={{ margin: "7px 0 0", color: "var(--erp-muted)" }}>{copy.subtitle}</p>
            </div>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, borderRadius: 14, padding: "12px 17px", fontWeight: 900, cursor: "pointer", background: "var(--erp-panel-solid)", color: "var(--erp-accent)" }}>
          <RefreshCw size={18} className={loading ? "spin" : ""} />
          {copy.refresh}
        </button>
      </header>

      {!isAdmin && (
        <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: 16, marginBottom: 20, borderColor: "rgba(245,158,11,.35)" }}>
          <ShieldCheck color="#fbbf24" />
          <span className="text-amber-200">{copy.adminOnly}</span>
        </div>
      )}

      {error && (
        <div className="text-red-200" style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: 16, marginBottom: 20, borderColor: "rgba(239,68,68,.4)" }}>
          <AlertTriangle />
          {error}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
        {[
          [CalendarDays, tr("کل دوره‌ها", "إجمالي الفترات", "Toplam dönemler", "Periods"), n(periods.length), "var(--erp-accent)"],
          [UnlockKeyhole, tr("دوره‌های باز", "الفترات المفتوحة", "Açık dönemler", "Open periods"), n(totals.open), "#86efac"],
          [FileText, copy.vouchers, n(totals.vouchers), "#c4b5fd"],
          [Scale, copy.difference, money(Math.abs(totals.debit - totals.credit)), Math.abs(totals.debit - totals.credit) < 0.01 ? "#86efac" : "#fca5a5"],
        ].map(([Icon, label, value, color]) => (
          <article key={label} style={{ ...card, padding: 18 }}>
            <Icon size={22} color={color} />
            <div style={{ color: "var(--erp-muted)", marginTop: 12, fontSize: 13 }}>{label}</div>
            <div style={{ color, marginTop: 5, fontSize: 23, fontWeight: 950 }}>{value}</div>
          </article>
        ))}
      </section>

      {isAdmin && (
        <form onSubmit={submit} style={{ ...card, padding: 20, marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 18px", display: "flex", alignItems: "center", gap: 9, color: "var(--erp-accent)" }}>
            <Plus size={22} /> {copy.newPeriod}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,2fr) minmax(170px,1fr) minmax(170px,1fr) auto", gap: 12, alignItems: "end" }}>
            <label style={{ color: "var(--erp-muted)", fontSize: 13 }}>
              {copy.name}
              <input value={pd(form.name)} onChange={(event) => setForm({ ...form, name: toEnglishDigits(event.target.value) })} style={{ ...input, marginTop: 7 }} />
            </label>
            <label style={{ color: "var(--erp-muted)", fontSize: 13 }}>
              {copy.start}
              <JalaliDateField value={form.start_date} onChange={(iso) => setForm({ ...form, start_date: iso })} fa={language === "fa"} language={language} className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] border border-[var(--erp-border)] rounded-[var(--erp-radius-md)] p-[12px_14px] w-full" style={{ marginTop: 7 }} />
            </label>
            <label style={{ color: "var(--erp-muted)", fontSize: 13 }}>
              {copy.end}
              <JalaliDateField value={form.end_date} onChange={(iso) => setForm({ ...form, end_date: iso })} fa={language === "fa"} language={language} className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] border border-[var(--erp-border)] rounded-[var(--erp-radius-md)] p-[12px_14px] w-full" style={{ marginTop: 7 }} />
            </label>
            <button disabled={creating} type="submit" style={{ border: 0, borderRadius: 14, padding: "13px 20px", minHeight: 45, fontWeight: 950, cursor: creating ? "wait" : "pointer", background: "linear-gradient(135deg,var(--erp-accent),#22c55e)", color: "#03111f" }}>
              {creating ? "..." : copy.create}
            </button>
          </div>
        </form>
      )}

      <section style={{ display: "grid", gap: 16 }}>
        {!loading && periods.length === 0 && (
          <div style={{ ...card, padding: 36, textAlign: "center", color: "var(--erp-muted)" }}>{copy.empty}</div>
        )}
        {periods.map((period) => {
          const difference = Number(period.total_debit || 0) - Number(period.total_credit || 0);
          const balanced = Math.abs(difference) < 0.01;
          const isOpen = period.status === "open";
          return (
            <article key={period.id} style={{ ...card, padding: 20, borderColor: isOpen ? "rgba(34,197,94,.32)" : "var(--erp-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, color: "var(--erp-text)", fontSize: 24 }}>{pd(period.name)}</h2>
                    <span className={isOpen ? "text-green-200" : undefined} style={{ display: "inline-flex", gap: 6, alignItems: "center", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 900, ...(isOpen ? null : { color: "var(--erp-muted)" }), background: isOpen ? "rgba(34,197,94,.14)" : "var(--erp-glow)" }}>
                      {isOpen ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
                      {isOpen ? copy.open : copy.closed}
                    </span>
                    <span className={balanced ? "text-green-300" : "text-red-300"} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 800 }}>
                      {balanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      {balanced ? copy.balanced : copy.unbalanced}
                    </span>
                  </div>
                  <div style={{ marginTop: 9, color: "var(--erp-muted)" }}>{date(period.start_date)} — {date(period.end_date)}</div>
                </div>
                {isAdmin && (
                  <button onClick={() => changeStatus(period, isOpen ? "close" : "reopen")} disabled={busyId === period.id} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, borderRadius: 13, padding: "11px 15px", fontWeight: 900, cursor: "pointer", color: isOpen ? "var(--erp-danger-solid-text)" : "var(--erp-accent)", background: isOpen ? "var(--erp-danger-solid)" : "var(--erp-panel-solid)" }}>
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
                  <div key={label} style={{ borderRadius: 16, padding: 13, background: "var(--erp-panel-solid)" }}>
                    <div style={{ color: "var(--erp-muted)", fontSize: 12 }}>{label}</div>
                    <div style={{ color: "var(--erp-text)", fontWeight: 900, marginTop: 6 }}>{value}</div>
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
