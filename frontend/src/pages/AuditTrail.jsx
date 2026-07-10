import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";
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
    title: fa ? "مرکز حسابرسی و امنیت" : "Audit & Security Center",
    subtitle: fa
      ? "سابقه زنجیره‌ای و قابل‌راستی‌آزمایی تمام تغییرات حساس سیستم"
      : "A verifiable hash-chained history of every sensitive system change",
    valid: fa ? "زنجیره حسابرسی سالم است" : "Audit chain is valid",
    broken: fa ? "هشدار: سابقه حسابرسی دست‌کاری شده است" : "Warning: audit history was altered",
    checked: fa ? "رویداد بررسی‌شده" : "events verified",
    denied: fa ? "این بخش فقط برای مدیر سیستم قابل مشاهده است." : "This area is restricted to administrators.",
    actor: fa ? "کاربر" : "Actor",
    action: fa ? "عملیات" : "Action",
    resource: fa ? "مسیر / منبع" : "Path / resource",
    result: fa ? "نتیجه" : "Result",
    all: fa ? "همه" : "All",
    success: fa ? "موفق" : "Success",
    failed: fa ? "ناموفق" : "Failed",
    from: fa ? "از تاریخ" : "From",
    to: fa ? "تا تاریخ" : "To",
    apply: fa ? "اعمال فیلتر" : "Apply filters",
    reset: fa ? "پاک‌کردن" : "Reset",
    dateTime: fa ? "زمان" : "Date & time",
    role: fa ? "نقش" : "Role",
    method: fa ? "متد" : "Method",
    status: fa ? "کد وضعیت" : "Status",
    ip: fa ? "نشانی IP" : "IP address",
    requestId: fa ? "شناسه رویداد" : "Event ID",
    empty: fa ? "رویدادی با این فیلتر یافت نشد." : "No events match these filters.",
    showing: fa ? "نمایش" : "Showing",
    of: fa ? "از" : "of",
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

  useEffect(() => {
    load(0, applied);
  }, [language, isAdmin]);

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

  const actionLabel = (action) => {
    const labels = fa
      ? { create: "ایجاد", update: "ویرایش", delete: "حذف", close: "بستن", reopen: "بازگشایی", post: "قطعی‌کردن", cancel: "ابطال", convert: "تبدیل", toggle: "تغییر وضعیت" }
      : {};
    return labels[action] || action;
  };

  const card = {
    background: "linear-gradient(145deg,rgba(15,23,42,.95),rgba(15,23,42,.72))",
    border: "1px solid rgba(34,211,238,.2)",
    borderRadius: 24,
    boxShadow: "0 18px 55px rgba(2,6,23,.3)",
  };
  const input = {
    width: "100%",
    boxSizing: "border-box",
    background: "#111c35",
    color: "#f8fafc",
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: 13,
    padding: "11px 12px",
  };

  if (!isAdmin) {
    return (
      <div dir={dir} style={{ ...card, maxWidth: 760, margin: "80px auto", padding: 36, color: "#fecaca", textAlign: "center" }}>
        <ShieldAlert size={48} style={{ margin: "0 auto 18px" }} />
        <h1>{copy.denied}</h1>
      </div>
    );
  }

  const firstShown = total ? page * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1600, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)" }}>
            <Fingerprint size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#c4b5fd", fontSize: "clamp(27px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p>
          </div>
        </div>
        <button onClick={() => load()} disabled={loading} style={{ display: "flex", gap: 8, alignItems: "center", border: 0, borderRadius: 13, padding: "11px 15px", background: "#164e63", color: "#cffafe", fontWeight: 900, cursor: "pointer" }}>
          <RefreshCw size={17} /> {loading ? "..." : fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </header>

      {integrity && (
        <section style={{ ...card, padding: 18, marginBottom: 18, display: "flex", alignItems: "center", gap: 13, borderColor: integrity.valid ? "rgba(34,197,94,.38)" : "rgba(239,68,68,.5)" }}>
          {integrity.valid ? <ShieldCheck size={30} color="#86efac" /> : <AlertTriangle size={30} color="#fca5a5" />}
          <div>
            <strong style={{ color: integrity.valid ? "#bbf7d0" : "#fecaca", fontSize: 18 }}>{integrity.valid ? copy.valid : copy.broken}</strong>
            <div style={{ color: "#94a3b8", marginTop: 4 }}>{n(integrity.events_checked)} {copy.checked}</div>
          </div>
        </section>
      )}

      {error && <div style={{ ...card, padding: 15, marginBottom: 18, color: "#fecaca", borderColor: "rgba(239,68,68,.4)" }}>{error}</div>}

      <form onSubmit={applyFilters} style={{ ...card, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          <input style={input} value={filters.actor} onChange={(e) => setFilters({ ...filters, actor: e.target.value })} placeholder={copy.actor} />
          <select style={input} value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
            <option value="">{copy.action}: {copy.all}</option>
            {["create", "update", "delete", "close", "reopen", "post", "cancel", "convert", "toggle"].map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
          </select>
          <input style={input} value={filters.path} onChange={(e) => setFilters({ ...filters, path: e.target.value })} placeholder={copy.resource} />
          <select style={input} value={filters.success} onChange={(e) => setFilters({ ...filters, success: e.target.value })}>
            <option value="all">{copy.result}: {copy.all}</option>
            <option value="true">{copy.success}</option>
            <option value="false">{copy.failed}</option>
          </select>
          <label style={{ color: "#94a3b8", fontSize: 12 }}>{copy.from}<input type="date" style={{ ...input, marginTop: 5 }} value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} /></label>
          <label style={{ color: "#94a3b8", fontSize: 12 }}>{copy.to}<input type="date" style={{ ...input, marginTop: 5 }} value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} /></label>
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 13, flexWrap: "wrap" }}>
          <button type="submit" style={{ display: "flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "10px 15px", background: "#22d3ee", color: "#06202a", fontWeight: 900, cursor: "pointer" }}><Search size={16} />{copy.apply}</button>
          <button type="button" onClick={resetFilters} style={{ border: 0, borderRadius: 12, padding: "10px 15px", background: "#334155", color: "#e2e8f0", fontWeight: 800, cursor: "pointer" }}>{copy.reset}</button>
        </div>
      </form>

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(30,41,59,.88)", color: "#a5f3fc" }}>
                {[copy.dateTime, copy.actor, copy.role, copy.action, copy.method, copy.resource, copy.status, copy.ip, copy.requestId].map((heading) => (
                  <th key={heading} style={{ padding: 12, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && events.length === 0 && <tr><td colSpan={9} style={{ padding: 36, textAlign: "center", color: "#94a3b8" }}>{copy.empty}</td></tr>}
              {events.map((event) => {
                const successful = event.status_code < 400;
                return (
                  <tr key={event.id} style={{ borderTop: "1px solid rgba(148,163,184,.1)" }}>
                    <td style={{ padding: 12, color: "#cbd5e1", whiteSpace: "nowrap" }}>{date(event.created_at)} <small style={{ color: "#64748b" }}>{time(event.created_at)}</small></td>
                    <td style={{ padding: 12, fontWeight: 900 }}>{event.actor_username}</td>
                    <td style={{ padding: 12, color: "#94a3b8" }}>{event.actor_role}</td>
                    <td style={{ padding: 12, color: "#c4b5fd", fontWeight: 800 }}>{actionLabel(event.action)}</td>
                    <td style={{ padding: 12 }}><code>{event.method}</code></td>
                    <td style={{ padding: 12, color: "#bae6fd", direction: "ltr", textAlign: "left" }}>{event.path}</td>
                    <td style={{ padding: 12 }}><span style={{ color: successful ? "#86efac" : "#fca5a5", fontWeight: 900 }}>{event.status_code}</span></td>
                    <td style={{ padding: 12, color: "#94a3b8", direction: "ltr" }}>{event.client_ip || "-"}</td>
                    <td style={{ padding: 12, color: "#64748b", direction: "ltr", fontSize: 11 }}>{event.request_id.slice(0, 8)}…</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderTop: "1px solid rgba(148,163,184,.12)" }}>
          <span style={{ color: "#94a3b8" }}>{copy.showing} {n(firstShown)}–{n(lastShown)} {copy.of} {n(total)}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={page === 0 || loading} onClick={() => move(page - 1)} style={{ border: 0, borderRadius: 10, padding: 9, background: "#334155", color: "white", cursor: "pointer" }}><ChevronLeft /></button>
            <button disabled={lastShown >= total || loading} onClick={() => move(page + 1)} style={{ border: 0, borderRadius: 10, padding: 9, background: "#334155", color: "white", cursor: "pointer" }}><ChevronRight /></button>
          </div>
        </footer>
      </section>
    </div>
  );
}
