import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import JalaliDateField from "../components/forms/JalaliDateField";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import { getAuditEvents, getAuditIntegrity } from "../services/auditApi";

const PAGE_SIZE = 50;
const initialFilters = {
  actor: "",
  action: "",
  path: "",
  success: "all",
  from_date: "",
  to_date: "",
};

export default function AuditTrail() {
  const { user } = useAuth();
  const { language, dir, date, time, n } = useLanguage();
  const fa = language === "fa";
  const isAdmin = user?.role === "admin";
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "مرکز حسابرسی و امنیت" : language === "ar" ? "مركز التدقيق والأمان" : language === "tr" ? "Denetim ve Güvenlik Merkezi" : "Audit & Security Center",
    subtitle: fa
      ? "سابقه زنجیره‌ای و قابل‌راستی‌آزمایی تمام تغییرات حساس سیستم"
      : language === "ar"
      ? "سجل قابل للتحقق ومرتبط بتسلسل تجزئة لكل تغيير حساس في النظام"
      : language === "tr"
      ? "Sistemdeki her hassas değişikliğin doğrulanabilir, hash zincirine dayalı geçmişi"
      : "A verifiable hash-chained history of every sensitive system change",
    valid: fa ? "زنجیره حسابرسی سالم است" : language === "ar" ? "سلسلة التدقيق سليمة" : language === "tr" ? "Denetim zinciri geçerli" : "Audit chain is valid",
    broken: fa ? "هشدار: سابقه حسابرسی دست‌کاری شده است" : language === "ar" ? "تحذير: تم التلاعب بسجل التدقيق" : language === "tr" ? "Uyarı: denetim geçmişi değiştirilmiş" : "Warning: audit history was altered",
    checked: fa ? "رویداد بررسی‌شده" : language === "ar" ? "حدثًا تم التحقق منها" : language === "tr" ? "olay doğrulandı" : "events verified",
    denied: fa ? "این بخش فقط برای مدیر سیستم قابل مشاهده است." : language === "ar" ? "هذا القسم مقتصر على المسؤولين." : language === "tr" ? "Bu alan yalnızca yöneticilere açıktır." : "This area is restricted to administrators.",
    actor: fa ? "کاربر" : language === "ar" ? "الفاعل" : language === "tr" ? "Kullanıcı" : "Actor",
    action: fa ? "عملیات" : language === "ar" ? "الإجراء" : language === "tr" ? "İşlem" : "Action",
    resource: fa ? "مسیر / منبع" : language === "ar" ? "المسار / المورد" : language === "tr" ? "Yol / Kaynak" : "Path / resource",
    result: fa ? "نتیجه" : language === "ar" ? "النتيجة" : language === "tr" ? "Sonuç" : "Result",
    all: fa ? "همه" : language === "ar" ? "الكل" : language === "tr" ? "Tümü" : "All",
    success: fa ? "موفق" : language === "ar" ? "ناجح" : language === "tr" ? "Başarılı" : "Success",
    failed: fa ? "ناموفق" : language === "ar" ? "فاشل" : language === "tr" ? "Başarısız" : "Failed",
    from: fa ? "از تاریخ" : language === "ar" ? "من تاريخ" : language === "tr" ? "Başlangıç" : "From",
    to: fa ? "تا تاریخ" : language === "ar" ? "إلى تاريخ" : language === "tr" ? "Bitiş" : "To",
    apply: fa ? "اعمال فیلتر" : language === "ar" ? "تطبيق الفلاتر" : language === "tr" ? "Filtreleri uygula" : "Apply filters",
    reset: fa ? "پاک‌کردن" : language === "ar" ? "إعادة تعيين" : language === "tr" ? "Sıfırla" : "Reset",
    dateTime: fa ? "زمان" : language === "ar" ? "التاريخ والوقت" : language === "tr" ? "Tarih ve saat" : "Date & time",
    role: fa ? "نقش" : language === "ar" ? "الدور" : language === "tr" ? "Rol" : "Role",
    method: fa ? "متد" : language === "ar" ? "الطريقة" : language === "tr" ? "Yöntem" : "Method",
    status: fa ? "کد وضعیت" : language === "ar" ? "الحالة" : language === "tr" ? "Durum" : "Status",
    ip: fa ? "نشانی IP" : language === "ar" ? "عنوان IP" : language === "tr" ? "IP adresi" : "IP address",
    requestId: fa ? "شناسه رویداد" : language === "ar" ? "معرف الحدث" : language === "tr" ? "Olay kimliği" : "Event ID",
    empty: fa ? "رویدادی با این فیلتر یافت نشد." : language === "ar" ? "لا توجد أحداث مطابقة لهذه الفلاتر." : language === "tr" ? "Bu filtrelerle eşleşen olay bulunamadı." : "No events match these filters.",
    showing: fa ? "نمایش" : language === "ar" ? "عرض" : language === "tr" ? "Gösteriliyor" : "Showing",
    of: fa ? "از" : language === "ar" ? "من" : language === "tr" ? "/" : "of",
  };

  async function load(nextPage = page, nextFilters = applied) {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [eventData, integrityData] = await Promise.all([
        getAuditEvents({
          ...nextFilters,
          limit: PAGE_SIZE,
          offset: nextPage * PAGE_SIZE,
        }),
        getAuditIntegrity(),
      ]);
      setEvents(eventData.items || []);
      setTotal(eventData.total || 0);
      setIntegrity(integrityData);
    } catch (requestError) {
      setError(requestError.message || "Unable to load audit events");
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const initialTimer = setTimeout(() => { void stableLoad(0, applied); }, 0);
    return () => clearTimeout(initialTimer);
  }, [language, isAdmin, applied, stableLoad]);

  function applyFilters(event) {
    event.preventDefault();
    setApplied(filters);
    setPage(0);
    load(0, filters);
  }

  function resetFilters() {
    setFilters(initialFilters);
    setApplied(initialFilters);
    setPage(0);
    load(0, initialFilters);
  }

  function move(nextPage) {
    setPage(nextPage);
    load(nextPage, applied);
  }

  const roleLabel = (role) => {
    const labels = fa
      ? { admin: "مدیر سیستم", accountant: "حسابدار", sales: "فروش", warehouse: "انباردار", viewer: "مشاهده‌گر", user: "کاربر عادی", unknown: "نامشخص" }
      : language === "ar"
      ? { admin: "مسؤول النظام", accountant: "محاسب", sales: "المبيعات", warehouse: "أمين المستودع", viewer: "مشاهدة فقط", user: "مستخدم عادي", unknown: "غير معروف" }
      : language === "tr"
      ? { admin: "Yönetici", accountant: "Muhasebeci", sales: "Satış", warehouse: "Depo Sorumlusu", viewer: "Salt okunur", user: "Standart kullanıcı", unknown: "Bilinmiyor" }
      : {};
    return labels[role] || role;
  };

  const actionLabel = (action) => {
    const labels = fa
      ? { create: "ایجاد", update: "ویرایش", delete: "حذف", close: "بستن", reopen: "بازگشایی", post: "قطعی‌کردن", cancel: "ابطال", convert: "تبدیل", toggle: "تغییر وضعیت" }
      : language === "ar"
      ? { create: "إنشاء", update: "تعديل", delete: "حذف", close: "إغلاق", reopen: "إعادة فتح", post: "ترحيل", cancel: "إلغاء", convert: "تحويل", toggle: "تغيير الحالة" }
      : language === "tr"
      ? { create: "Oluşturma", update: "Güncelleme", delete: "Silme", close: "Kapatma", reopen: "Yeniden açma", post: "Kesinleştirme", cancel: "İptal", convert: "Dönüştürme", toggle: "Durum değiştirme" }
      : {};
    return labels[action] || action;
  };

  const card = {
    background: "var(--erp-panel)",
    border: "1px solid var(--erp-border)",
    borderRadius: 24,
    boxShadow: "0 18px 55px rgba(2,6,23,.3)",
  };
  const input = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--erp-panel-solid)",
    color: "var(--erp-text)",
    border: "1px solid var(--erp-border)",
    borderRadius: 13,
    padding: "11px 12px",
  };

  if (!isAdmin) {
    return (
      <div dir={dir} className="text-red-200" style={{ ...card, maxWidth: 760, margin: "80px auto", padding: 36, textAlign: "center" }}>
        <ShieldAlert size={48} style={{ margin: "0 auto 18px" }} />
        <h1>{copy.denied}</h1>
      </div>
    );
  }

  const firstShown = total ? page * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1600, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,var(--erp-accent-2),var(--erp-accent))" }}>
            <Fingerprint size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "var(--erp-accent-2)", fontSize: "clamp(27px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "var(--erp-muted)" }}>{copy.subtitle}</p>
          </div>
        </div>
        <button onClick={() => load()} disabled={loading} style={{ display: "flex", gap: 8, alignItems: "center", border: 0, borderRadius: 13, padding: "11px 15px", background: "var(--erp-glow)", color: "var(--erp-accent)", fontWeight: 900, cursor: "pointer" }}>
          <RefreshCw size={17} /> {loading ? "..." : fa ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
        </button>
      </header>

      {integrity && (
        <section style={{ ...card, padding: 18, marginBottom: 18, display: "flex", alignItems: "center", gap: 13, borderColor: integrity.valid ? "rgba(34,197,94,.38)" : "rgba(239,68,68,.5)" }}>
          {integrity.valid ? <ShieldCheck size={30} color="#86efac" /> : <AlertTriangle size={30} color="#fca5a5" />}
          <div>
            <strong className={integrity.valid ? "text-green-200" : "text-red-200"} style={{ fontSize: 18 }}>{integrity.valid ? copy.valid : copy.broken}</strong>
            <div style={{ color: "var(--erp-muted)", marginTop: 4 }}>{n(integrity.events_checked)} {copy.checked}</div>
          </div>
        </section>
      )}

      {error && <div className="text-red-200" style={{ ...card, padding: 15, marginBottom: 18, borderColor: "rgba(239,68,68,.4)" }}>{error}</div>}

      <form onSubmit={applyFilters} style={{ ...card, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          <input style={input} value={language === "fa" ? toPersianDigits(filters.actor) : filters.actor} onChange={(e) => setFilters({ ...filters, actor: toEnglishDigits(e.target.value) })} placeholder={copy.actor} />
          <select style={input} value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
            <option value="">{copy.action}: {copy.all}</option>
            {["create", "update", "delete", "close", "reopen", "post", "cancel", "convert", "toggle"].map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
          </select>
          <input style={input} value={language === "fa" ? toPersianDigits(filters.path) : filters.path} onChange={(e) => setFilters({ ...filters, path: toEnglishDigits(e.target.value) })} placeholder={copy.resource} />
          <select style={input} value={filters.success} onChange={(e) => setFilters({ ...filters, success: e.target.value })}>
            <option value="all">{copy.result}: {copy.all}</option>
            <option value="true">{copy.success}</option>
            <option value="false">{copy.failed}</option>
          </select>
          <label style={{ color: "var(--erp-muted)", fontSize: 12 }}>{copy.from}<div style={{ marginTop: 5 }}><JalaliDateField value={filters.from_date} onChange={(iso) => setFilters({ ...filters, from_date: iso })} fa={language === "fa"} language={language} className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] border border-[var(--erp-border)] rounded-[var(--erp-radius-md)] p-[11px_12px]" /></div></label>
          <label style={{ color: "var(--erp-muted)", fontSize: 12 }}>{copy.to}<div style={{ marginTop: 5 }}><JalaliDateField value={filters.to_date} onChange={(iso) => setFilters({ ...filters, to_date: iso })} fa={language === "fa"} language={language} className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] border border-[var(--erp-border)] rounded-[var(--erp-radius-md)] p-[11px_12px]" /></div></label>
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 13, flexWrap: "wrap" }}>
          <button type="submit" style={{ display: "flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "10px 15px", background: "var(--erp-accent)", color: "#06202a", fontWeight: 900, cursor: "pointer" }}><Search size={16} />{copy.apply}</button>
          <button type="button" onClick={resetFilters} style={{ border: 0, borderRadius: 12, padding: "10px 15px", background: "var(--erp-panel-solid)", color: "var(--erp-text)", fontWeight: 800, cursor: "pointer" }}>{copy.reset}</button>
        </div>
      </form>

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--erp-panel-solid)", color: "var(--erp-accent)" }}>
                {[copy.dateTime, copy.actor, copy.role, copy.action, copy.method, copy.resource, copy.status, copy.ip, copy.requestId].map((heading) => (
                  <th key={heading} style={{ padding: 12, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && events.length === 0 && <tr><td colSpan={9} style={{ padding: 36, textAlign: "center", color: "var(--erp-muted)" }}>{copy.empty}</td></tr>}
              {events.map((event) => {
                const successful = event.status_code < 400;
                return (
                  <tr key={event.id} style={{ borderTop: "1px solid var(--erp-border)" }}>
                    <td style={{ padding: 12, color: "var(--erp-muted)", whiteSpace: "nowrap" }}>{date(event.created_at)} <small style={{ color: "var(--erp-muted)" }}>{time(event.created_at)}</small></td>
                    <td style={{ padding: 12, fontWeight: 900 }}>{event.actor_username}</td>
                    <td style={{ padding: 12, color: "var(--erp-muted)" }}>{roleLabel(event.actor_role)}</td>
                    <td style={{ padding: 12, color: "var(--erp-accent-2)", fontWeight: 800 }}>{actionLabel(event.action)}</td>
                    <td style={{ padding: 12 }}><code>{event.method}</code></td>
                    <td style={{ padding: 12, color: "var(--erp-accent)", direction: "ltr", textAlign: "left" }}>{event.path}</td>
                    <td style={{ padding: 12 }}><span className={successful ? "text-green-300" : "text-red-300"} style={{ fontWeight: 900 }}>{n(event.status_code)}</span></td>
                    <td style={{ padding: 12, color: "var(--erp-muted)", direction: "ltr" }}>{event.client_ip || "-"}</td>
                    <td style={{ padding: 12, color: "var(--erp-muted)", direction: "ltr", fontSize: 11 }}>{event.request_id.slice(0, 8)}…</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderTop: "1px solid var(--erp-border)" }}>
          <span style={{ color: "var(--erp-muted)" }}>{copy.showing} {n(firstShown)}–{n(lastShown)} {copy.of} {n(total)}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={page === 0 || loading} onClick={() => move(page - 1)} style={{ border: 0, borderRadius: 10, padding: 9, background: "var(--erp-panel-solid)", color: "var(--erp-text)", cursor: "pointer" }}>{dir === "rtl" ? <ChevronRight /> : <ChevronLeft />}</button>
            <button disabled={lastShown >= total || loading} onClick={() => move(page + 1)} style={{ border: 0, borderRadius: 10, padding: 9, background: "var(--erp-panel-solid)", color: "var(--erp-text)", cursor: "pointer" }}>{dir === "rtl" ? <ChevronLeft /> : <ChevronRight />}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
