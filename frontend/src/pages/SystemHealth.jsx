import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileClock,
  HardDrive,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Warehouse,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";
import { getSystemHealth } from "../services/systemHealthApi";

const categoryIcons = {
  database: Database,
  accounting: Scale,
  inventory: Warehouse,
  security: ShieldCheck,
  recovery: HardDrive,
};

export default function SystemHealth() {
  const { user } = useAuth();
  const { language, dir, date, time, n } = useLanguage();
  const fa = language === "fa";
  const isAdmin = user?.role === "admin";
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "سلامت سیستم و آمادگی تولید" : "System Health & Production Readiness",
    subtitle: fa
      ? "کنترل یکپارچگی مالی، امنیت، دیتابیس، انبار و قابلیت بازیابی"
      : "Integrity checks for finance, security, database, inventory, and recovery",
    denied: fa ? "این بخش فقط برای مدیر سیستم قابل مشاهده است." : "This area is restricted to administrators.",
    healthy: fa ? "سیستم سالم است" : "System healthy",
    degraded: fa ? "سیستم دارای هشدار است" : "System has warnings",
    critical: fa ? "نیاز به اقدام فوری" : "Immediate action required",
    passed: fa ? "موفق" : "Passed",
    warnings: fa ? "هشدار" : "Warnings",
    failures: fa ? "خطا" : "Failures",
    checks: fa ? "کنترل" : "Checks",
    lastCheck: fa ? "آخرین بررسی" : "Last checked",
    refresh: fa ? "بررسی مجدد" : "Run checks",
    noData: fa ? "اطلاعات سلامت دریافت نشد." : "No health data available.",
    database: fa ? "دیتابیس" : "Database",
    accounting: fa ? "حسابداری" : "Accounting",
    inventory: fa ? "انبار" : "Inventory",
    security: fa ? "امنیت" : "Security",
    recovery: fa ? "بازیابی" : "Recovery",
  };

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setHealth(await getSystemHealth());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [language, isAdmin]);

  const grouped = useMemo(() => {
    const result = {};
    for (const check of health?.checks || []) {
      (result[check.category] ||= []).push(check);
    }
    return result;
  }, [health]);

  const statusConfig = {
    healthy: { color: "#86efac", background: "rgba(34,197,94,.14)", icon: CheckCircle2, label: copy.healthy },
    degraded: { color: "#fde68a", background: "rgba(245,158,11,.14)", icon: AlertTriangle, label: copy.degraded },
    critical: { color: "#fca5a5", background: "rgba(239,68,68,.14)", icon: TriangleAlert, label: copy.critical },
  };
  const current = statusConfig[health?.status] || statusConfig.degraded;
  const OverallIcon = current.icon;

  const card = {
    background: "linear-gradient(145deg,rgba(15,23,42,.95),rgba(15,23,42,.72))",
    border: "1px solid rgba(34,211,238,.2)",
    borderRadius: 24,
    boxShadow: "0 18px 55px rgba(2,6,23,.3)",
  };

  if (!isAdmin) {
    return (
      <div dir={dir} style={{ ...card, maxWidth: 760, margin: "80px auto", padding: 36, textAlign: "center", color: "#fecaca" }}>
        <ShieldAlert size={48} style={{ margin: "0 auto 16px" }} />
        <h1>{copy.denied}</h1>
      </div>
    );
  }

  return (
    <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            <Activity size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#a5f3fc", fontSize: "clamp(28px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", gap: 8, alignItems: "center", border: 0, borderRadius: 13, padding: "11px 15px", background: "#164e63", color: "#cffafe", fontWeight: 900, cursor: "pointer" }}>
          <RefreshCw size={17} /> {loading ? "..." : copy.refresh}
        </button>
      </header>

      {error && <div style={{ ...card, padding: 16, marginBottom: 18, color: "#fecaca" }}>{error}</div>}
      {!health && !loading && !error && <div style={{ ...card, padding: 34, textAlign: "center", color: "#94a3b8" }}>{copy.noData}</div>}

      {health && (
        <>
          <section style={{ ...card, padding: 22, marginBottom: 17, display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap", borderColor: current.color }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 54, height: 54, borderRadius: 17, display: "grid", placeItems: "center", color: current.color, background: current.background }}>
                <OverallIcon size={30} />
              </div>
              <div>
                <strong style={{ color: current.color, fontSize: 24 }}>{current.label}</strong>
                <div style={{ color: "#94a3b8", marginTop: 5 }}>
                  {copy.lastCheck}: {date(health.checked_at)} {time(health.checked_at)}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Summary label={copy.checks} value={n(health.summary.total)} color="#a5f3fc" />
              <Summary label={copy.passed} value={n(health.summary.passed)} color="#86efac" />
              <Summary label={copy.warnings} value={n(health.summary.warnings)} color="#fde68a" />
              <Summary label={copy.failures} value={n(health.summary.failures)} color="#fca5a5" />
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 15 }}>
            {Object.entries(grouped).map(([category, checks]) => {
              const CategoryIcon = categoryIcons[category] || Activity;
              return (
                <article key={category} style={{ ...card, padding: 18 }}>
                  <h2 style={{ margin: "0 0 14px", display: "flex", alignItems: "center", gap: 9, color: "#67e8f9", textTransform: "capitalize" }}>
                    <CategoryIcon size={21} />
                    {copy[category] || category}
                  </h2>
                  <div style={{ display: "grid", gap: 9 }}>
                    {checks.map((check) => (
                      <CheckRow key={check.id} check={check} fa={fa} />
                    ))}
                  </div>
                </article>
              );
            })}
          </section>

          <section style={{ ...card, padding: 18, marginTop: 17 }}>
            <h2 style={{ margin: "0 0 13px", color: "#c4b5fd", display: "flex", gap: 8, alignItems: "center" }}>
              <FileClock size={20} /> {fa ? "شاخص‌های عملیاتی" : "Operational metrics"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9 }}>
              {Object.entries(health.metrics || {}).map(([key, value]) => (
                <div key={key} style={{ padding: 12, borderRadius: 14, background: "rgba(30,41,59,.7)" }}>
                  <div style={{ color: "#94a3b8", fontSize: 11 }}>{key.replaceAll("_", " ")}</div>
                  <div style={{ color: "#e0f2fe", fontWeight: 900, marginTop: 5 }}>{typeof value === "number" ? n(value) : value}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#94a3b8", fontSize: 11 }}>{label}</div>
      <div style={{ color, fontWeight: 950, fontSize: 21, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function CheckRow({ check, fa }) {
  const config = {
    pass: { color: "#86efac", icon: CheckCircle2, label: fa ? "سالم" : "Pass" },
    warn: { color: "#fde68a", icon: AlertTriangle, label: fa ? "هشدار" : "Warning" },
    fail: { color: "#fca5a5", icon: TriangleAlert, label: fa ? "خطا" : "Failure" },
  }[check.status];
  const Icon = config.icon;
  return (
    <div style={{ padding: 12, borderRadius: 15, background: "rgba(30,41,59,.68)", borderInlineStart: `3px solid ${config.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 9, alignItems: "center" }}>
        <strong style={{ color: "#e2e8f0" }}>{check.label}</strong>
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center", color: config.color, fontSize: 11, fontWeight: 900 }}>
          <Icon size={14} /> {config.label}
        </span>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>{check.message}</div>
    </div>
  );
}
