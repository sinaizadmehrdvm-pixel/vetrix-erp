import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileCheck2,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  TestTube2,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  getBackups,
  restoreBackup,
  testRestoreBackup,
  verifyBackup,
} from "../services/backupApi";

export default function BackupRecovery() {
  const { user } = useAuth();
  const { language, dir, date, time, n } = useLanguage();
  const fa = language === "fa";
  const isAdmin = user?.role === "admin";
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const [rehearsals, setRehearsals] = useState({});
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "پشتیبان‌گیری و بازیابی" : "Backup & Recovery",
    subtitle: fa
      ? "نسخه‌های معتبر دیتابیس با checksum و بازیابی اضطراری"
      : "Verified database snapshots with checksums and emergency recovery",
    denied: fa ? "این بخش فقط برای مدیر سیستم قابل دسترسی است." : "This area is restricted to administrators.",
    create: fa ? "ایجاد بکاپ جدید" : "Create backup",
    empty: fa ? "هنوز نسخه پشتیبانی وجود ندارد." : "No backups have been created.",
    filename: fa ? "نام فایل" : "Filename",
    createdAt: fa ? "زمان ایجاد" : "Created",
    kind: fa ? "نوع" : "Type",
    size: fa ? "حجم" : "Size",
    integrity: fa ? "سلامت" : "Integrity",
    checksum: "SHA-256",
    actions: fa ? "عملیات" : "Actions",
    verify: fa ? "بررسی" : "Verify",
    download: fa ? "دانلود" : "Download",
    rehearse: fa ? "آزمایش بازیابی" : "Test restore",
    restore: fa ? "بازیابی" : "Restore",
    restoreLocked: fa ? "ابتدا آزمایش بازیابی موفق را اجرا کنید" : "Run a successful restore test first",
    remove: fa ? "حذف" : "Delete",
    valid: fa ? "سالم" : "Valid",
    notChecked: fa ? "بررسی‌نشده" : "Not checked",
    restoreWarning: fa
      ? "بازیابی، دیتابیس فعلی را جایگزین می‌کند. قبل از آن یک بکاپ اضطراری خودکار ساخته می‌شود."
      : "Restore replaces the current database. An emergency backup is created first.",
    rehearsalInfo: fa
      ? "بازیابی واقعی فقط پس از آزمایش موفق روی یک کپی موقت فعال می‌شود؛ دیتابیس جاری در آزمایش تغییر نمی‌کند."
      : "Real restore unlocks only after a successful rehearsal on a temporary copy; the live database is never changed by the test.",
    autoInfo: fa
      ? "در صورت فعال‌بودن «بکاپ خودکار» در تنظیمات، بعد از فعالیت سیستم و حداکثر هر ۲۴ ساعت یک snapshot ساخته می‌شود."
      : "When Auto Backup is enabled in Settings, activity triggers at most one verified snapshot every 24 hours.",
  };

  const kindNames = {
    manual: fa ? "دستی" : "Manual",
    auto: fa ? "خودکار" : "Automatic",
    pre: fa ? "اضطراری" : "Emergency",
    pre_restore: fa ? "قبل از بازیابی" : "Pre-restore",
  };

  async function load(verify = false) {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getBackups(verify);
      setBackups(data.items || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, [language, isAdmin]);

  async function create() {
    setCreating(true);
    try {
      await createBackup();
      toast.success(fa ? "بکاپ معتبر ایجاد شد." : "Verified backup created.");
      await load(false);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setCreating(false);
    }
  }

  async function verify(item) {
    setBusy(item.filename);
    try {
      const result = await verifyBackup(item.filename);
      setBackups((current) =>
        current.map((backup) =>
          backup.filename === item.filename ? result : backup,
        ),
      );
      if (result.valid) toast.success(fa ? "سلامت بکاپ تأیید شد." : "Backup integrity verified.");
      else toast.error(fa ? "بکاپ آسیب‌دیده است." : "Backup is corrupted.");
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function rehearse(item) {
    setBusy(item.filename);
    try {
      const result = await testRestoreBackup(item.filename);
      setRehearsals((current) => ({ ...current, [item.filename]: result }));
      toast.success(
        fa
          ? `آزمایش بازیابی موفق بود؛ ${n(result.table_count)} جدول بررسی شد.`
          : `Restore test passed; ${n(result.table_count)} tables checked.`,
      );
    } catch (requestError) {
      setRehearsals((current) => ({ ...current, [item.filename]: { valid: false } }));
      toast.error(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function download(item) {
    setBusy(item.filename);
    try {
      await downloadBackup(item.filename);
      toast.success(fa ? "دانلود آغاز شد." : "Download started.");
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function restore(item) {
    if (!rehearsals[item.filename]?.valid) {
      toast.error(copy.restoreLocked);
      return;
    }
    const expected = `RESTORE ${item.filename}`;
    const entered = window.prompt(
      `${copy.restoreWarning}\n\n${fa ? "برای تأیید دقیقاً وارد کنید:" : "Type exactly to confirm:"}\n${expected}`,
    );
    if (entered === null) return;
    if (entered !== expected) {
      toast.error(fa ? "عبارت تأیید صحیح نیست." : "Confirmation text does not match.");
      return;
    }
    setBusy(item.filename);
    try {
      const result = await restoreBackup(item.filename, entered);
      toast.success(
        fa
          ? `بازیابی انجام شد؛ بکاپ اضطراری: ${result.safety_backup}`
          : `Restore completed; safety backup: ${result.safety_backup}`,
        { duration: 7000 },
      );
      await load(false);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function remove(item) {
    const confirmed = window.confirm(
      fa
        ? `بکاپ «${item.filename}» برای همیشه حذف شود؟`
        : `Permanently delete “${item.filename}”?`,
    );
    if (!confirmed) return;
    setBusy(item.filename);
    try {
      await deleteBackup(item.filename);
      toast.success(fa ? "بکاپ حذف شد." : "Backup deleted.");
      await load(false);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusy("");
    }
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${n(bytes)} B`;
    if (bytes < 1024 * 1024) return `${n((bytes / 1024).toFixed(1))} KB`;
    return `${n((bytes / 1024 / 1024).toFixed(2))} MB`;
  }

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
    <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1550, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#22c55e)", color: "#03131d" }}>
            <DatabaseBackup size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#a5f3fc", fontSize: "clamp(28px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={() => load(false)} disabled={loading} style={{ display: "flex", gap: 7, alignItems: "center", border: 0, borderRadius: 13, padding: "11px 14px", background: "#334155", color: "#e2e8f0", fontWeight: 800, cursor: "pointer" }}>
            <RefreshCw size={17} /> {fa ? "به‌روزرسانی" : "Refresh"}
          </button>
          <button onClick={create} disabled={creating} style={{ display: "flex", gap: 7, alignItems: "center", border: 0, borderRadius: 13, padding: "11px 15px", background: "linear-gradient(135deg,#22d3ee,#22c55e)", color: "#03131d", fontWeight: 950, cursor: "pointer" }}>
            <HardDrive size={17} /> {creating ? "..." : copy.create}
          </button>
        </div>
      </header>

      <div style={{ ...card, padding: 15, marginBottom: 10, color: "#bae6fd", display: "flex", gap: 10, alignItems: "center" }}>
        <FileCheck2 color="#67e8f9" />
        {copy.autoInfo}
      </div>
      <div style={{ ...card, padding: 15, marginBottom: 18, color: "#bbf7d0", display: "flex", gap: 10, alignItems: "center" }}>
        <TestTube2 color="#86efac" />
        {copy.rehearsalInfo}
      </div>
      {error && <div style={{ ...card, padding: 15, marginBottom: 18, color: "#fecaca" }}>{error}</div>}

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1150, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(30,41,59,.9)", color: "#a5f3fc" }}>
                {[copy.filename, copy.createdAt, copy.kind, copy.size, copy.integrity, copy.checksum, copy.actions].map((heading) => (
                  <th key={heading} style={{ padding: 13, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && backups.length === 0 && <tr><td colSpan={7} style={{ padding: 38, textAlign: "center", color: "#94a3b8" }}>{copy.empty}</td></tr>}
              {backups.map((item) => (
                <tr key={item.filename} style={{ borderTop: "1px solid rgba(148,163,184,.1)" }}>
                  <td style={{ padding: 13, color: "#bae6fd", direction: "ltr", textAlign: "left", fontSize: 12 }}>{item.filename}</td>
                  <td style={{ padding: 13, whiteSpace: "nowrap" }}>{date(item.created_at)} <small style={{ color: "#64748b" }}>{time(item.created_at)}</small></td>
                  <td style={{ padding: 13 }}>{kindNames[item.kind] || item.kind}</td>
                  <td style={{ padding: 13 }}>{formatBytes(item.size_bytes)}</td>
                  <td style={{ padding: 13 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: item.valid === true ? "#86efac" : item.valid === false ? "#fca5a5" : "#fde68a" }}>
                      {item.valid === true ? <CheckCircle2 size={16} /> : item.valid === false ? <AlertTriangle size={16} /> : <FileCheck2 size={16} />}
                      {item.valid === true ? copy.valid : item.valid === false ? "Invalid" : copy.notChecked}
                    </span>
                  </td>
                  <td title={item.sha256} style={{ padding: 13, color: "#64748b", direction: "ltr", fontFamily: "monospace" }}>{item.sha256.slice(0, 12)}…</td>
                  <td style={{ padding: 13 }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <ActionButton title={copy.verify} onClick={() => verify(item)} disabled={busy === item.filename}><FileCheck2 size={16} /></ActionButton>
                      <ActionButton title={copy.rehearse} onClick={() => rehearse(item)} disabled={busy === item.filename}><TestTube2 size={16} /></ActionButton>
                      <ActionButton title={copy.download} onClick={() => download(item)} disabled={busy === item.filename}><Download size={16} /></ActionButton>
                      <ActionButton title={rehearsals[item.filename]?.valid ? copy.restore : copy.restoreLocked} onClick={() => restore(item)} disabled={busy === item.filename || !rehearsals[item.filename]?.valid} danger><RotateCcw size={16} /></ActionButton>
                      <ActionButton title={copy.remove} onClick={() => remove(item)} disabled={busy === item.filename} danger><Trash2 size={16} /></ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ActionButton({ title, onClick, disabled, danger, children }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled} style={{ border: 0, borderRadius: 10, width: 36, height: 36, display: "grid", placeItems: "center", background: danger ? "#7f1d1d" : "#164e63", color: danger ? "#fecaca" : "#cffafe", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }}>
      {children}
    </button>
  );
}
