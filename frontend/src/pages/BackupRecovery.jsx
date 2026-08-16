import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileCheck2,
  HardDrive,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  TestTube2,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { confirmAction, promptAction } from "../components/ui/confirmService";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import {
  createBackup,
  createBackupDeliveryPolicy,
  deleteBackup,
  deleteBackupDeliveryPolicy,
  downloadBackup,
  getBackupDeliveryLog,
  getBackupDeliveryPolicies,
  getBackups,
  restoreBackup,
  runBackupDeliveryPolicyNow,
  testRestoreBackup,
  verifyBackup,
} from "../services/backupApi";
import Select from "../components/ui/Select";

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
    title: fa ? "پشتیبان‌گیری و بازیابی" : language === "ar" ? "النسخ الاحتياطي والاستعادة" : language === "tr" ? "Yedekleme ve Kurtarma" : "Backup & Recovery",
    subtitle: fa
      ? "نسخه‌های معتبر دیتابیس با checksum و بازیابی اضطراری"
      : language === "ar"
      ? "لقطات قاعدة بيانات موثّقة بمجاميع اختبارية (checksum) واستعادة طوارئ"
      : language === "tr"
      ? "Sağlama toplamlı (checksum) doğrulanmış veritabanı anlık görüntüleri ve acil durum kurtarma"
      : "Verified database snapshots with checksums and emergency recovery",
    denied: fa ? "این بخش فقط برای مدیر سیستم قابل دسترسی است." : language === "ar" ? "هذا القسم مقتصر على المسؤولين." : language === "tr" ? "Bu alan yalnızca yöneticilere açıktır." : "This area is restricted to administrators.",
    create: fa ? "ایجاد بکاپ جدید" : language === "ar" ? "إنشاء نسخة احتياطية" : language === "tr" ? "Yedek oluştur" : "Create backup",
    empty: fa ? "هنوز نسخه پشتیبانی وجود ندارد." : language === "ar" ? "لم يتم إنشاء أي نسخة احتياطية بعد." : language === "tr" ? "Henüz yedek oluşturulmadı." : "No backups have been created.",
    filename: fa ? "نام فایل" : language === "ar" ? "اسم الملف" : language === "tr" ? "Dosya adı" : "Filename",
    createdAt: fa ? "زمان ایجاد" : language === "ar" ? "تاريخ الإنشاء" : language === "tr" ? "Oluşturulma" : "Created",
    kind: fa ? "نوع" : language === "ar" ? "النوع" : language === "tr" ? "Tür" : "Type",
    size: fa ? "حجم" : language === "ar" ? "الحجم" : language === "tr" ? "Boyut" : "Size",
    integrity: fa ? "سلامت" : language === "ar" ? "السلامة" : language === "tr" ? "Bütünlük" : "Integrity",
    checksum: "SHA-256",
    actions: fa ? "عملیات" : language === "ar" ? "الإجراءات" : language === "tr" ? "İşlemler" : "Actions",
    verify: fa ? "بررسی" : language === "ar" ? "تحقّق" : language === "tr" ? "Doğrula" : "Verify",
    download: fa ? "دانلود" : language === "ar" ? "تنزيل" : language === "tr" ? "İndir" : "Download",
    rehearse: fa ? "آزمایش بازیابی" : language === "ar" ? "اختبار الاستعادة" : language === "tr" ? "Kurtarmayı test et" : "Test restore",
    restore: fa ? "بازیابی" : language === "ar" ? "استعادة" : language === "tr" ? "Geri yükle" : "Restore",
    restoreLocked: fa ? "ابتدا آزمایش بازیابی موفق را اجرا کنید" : language === "ar" ? "شغّل أولاً اختبار استعادة ناجحًا" : language === "tr" ? "Önce başarılı bir kurtarma testi çalıştırın" : "Run a successful restore test first",
    remove: fa ? "حذف" : language === "ar" ? "حذف" : language === "tr" ? "Sil" : "Delete",
    valid: fa ? "سالم" : language === "ar" ? "سليم" : language === "tr" ? "Geçerli" : "Valid",
    invalid: fa ? "نامعتبر" : language === "ar" ? "غير سليم" : language === "tr" ? "Geçersiz" : "Invalid",
    notChecked: fa ? "بررسی‌نشده" : language === "ar" ? "لم يُتحقق منه" : language === "tr" ? "Kontrol edilmedi" : "Not checked",
    restoreWarning: fa
      ? "بازیابی، دیتابیس فعلی را جایگزین می‌کند. قبل از آن یک بکاپ اضطراری خودکار ساخته می‌شود."
      : language === "ar"
      ? "تستبدل الاستعادة قاعدة البيانات الحالية. يتم أولاً إنشاء نسخة احتياطية طارئة تلقائيًا."
      : language === "tr"
      ? "Geri yükleme mevcut veritabanının yerini alır. Önce otomatik bir acil durum yedeği oluşturulur."
      : "Restore replaces the current database. An emergency backup is created first.",
    rehearsalInfo: fa
      ? "بازیابی واقعی فقط پس از آزمایش موفق روی یک کپی موقت فعال می‌شود؛ دیتابیس جاری در آزمایش تغییر نمی‌کند."
      : language === "ar"
      ? "لا تُفعَّل الاستعادة الفعلية إلا بعد نجاح اختبار على نسخة مؤقتة؛ ولا تتأثر قاعدة البيانات الحالية بهذا الاختبار."
      : language === "tr"
      ? "Gerçek geri yükleme yalnızca geçici bir kopya üzerinde yapılan başarılı bir deneme sonrasında etkinleşir; test sırasında canlı veritabanı asla değiştirilmez."
      : "Real restore unlocks only after a successful rehearsal on a temporary copy; the live database is never changed by the test.",
    autoInfo: fa
      ? "در صورت فعال‌بودن «بکاپ خودکار» در تنظیمات، بعد از فعالیت سیستم و حداکثر هر ۲۴ ساعت یک snapshot ساخته می‌شود."
      : language === "ar"
      ? "عند تفعيل «النسخ الاحتياطي التلقائي» في الإعدادات، يؤدي نشاط النظام إلى إنشاء لقطة موثّقة واحدة على الأكثر كل 24 ساعة."
      : language === "tr"
      ? "Ayarlar'da «Otomatik Yedekleme» etkinleştirildiğinde, sistem etkinliği en fazla 24 saatte bir doğrulanmış anlık görüntü oluşturur."
      : "When Auto Backup is enabled in Settings, activity triggers at most one verified snapshot every 24 hours.",
  };

  const kindNames = {
    manual: fa ? "دستی" : language === "ar" ? "يدوي" : language === "tr" ? "Manuel" : "Manual",
    auto: fa ? "خودکار" : language === "ar" ? "تلقائي" : language === "tr" ? "Otomatik" : "Automatic",
    pre: fa ? "اضطراری" : language === "ar" ? "طارئ" : language === "tr" ? "Acil durum" : "Emergency",
    pre_restore: fa ? "قبل از بازیابی" : language === "ar" ? "قبل الاستعادة" : language === "tr" ? "Geri yüklemeden önce" : "Pre-restore",
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

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const initialTimer = setTimeout(() => { void stableLoad(false); }, 0);
    return () => clearTimeout(initialTimer);
  }, [language, isAdmin, stableLoad]);

  async function create() {
    setCreating(true);
    try {
      await createBackup();
      toast.success(fa ? "بکاپ معتبر ایجاد شد." : language === "ar" ? "تم إنشاء نسخة احتياطية موثّقة." : language === "tr" ? "Doğrulanmış yedek oluşturuldu." : "Verified backup created.");
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
      if (result.valid) toast.success(fa ? "سلامت بکاپ تأیید شد." : language === "ar" ? "تم التحقق من سلامة النسخة الاحتياطية." : language === "tr" ? "Yedek bütünlüğü doğrulandı." : "Backup integrity verified.");
      else toast.error(fa ? "بکاپ آسیب‌دیده است." : language === "ar" ? "النسخة الاحتياطية تالفة." : language === "tr" ? "Yedek bozuk." : "Backup is corrupted.");
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
          : language === "ar"
          ? `نجح اختبار الاستعادة؛ تم فحص ${n(result.table_count)} جدول.`
          : language === "tr"
          ? `Geri yükleme testi başarılı; ${n(result.table_count)} tablo kontrol edildi.`
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
      toast.success(fa ? "دانلود آغاز شد." : language === "ar" ? "بدأ التنزيل." : language === "tr" ? "İndirme başladı." : "Download started.");
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
    const entered = await promptAction(
      `${copy.restoreWarning}\n\n${fa ? "برای تأیید دقیقاً وارد کنید:" : language === "ar" ? "للتأكيد، أدخل بالضبط:" : language === "tr" ? "Onaylamak için tam olarak şunu yazın:" : "Type exactly to confirm:"}\n${expected}`,
    );
    if (entered === null) return;
    if (entered !== expected) {
      toast.error(fa ? "عبارت تأیید صحیح نیست." : language === "ar" ? "نص التأكيد غير مطابق." : language === "tr" ? "Onay metni eşleşmiyor." : "Confirmation text does not match.");
      return;
    }
    setBusy(item.filename);
    try {
      const result = await restoreBackup(item.filename, entered);
      toast.success(
        fa
          ? `بازیابی انجام شد؛ بکاپ اضطراری: ${result.safety_backup}`
          : language === "ar"
          ? `اكتملت الاستعادة؛ النسخة الاحتياطية الوقائية: ${result.safety_backup}`
          : language === "tr"
          ? `Geri yükleme tamamlandı; güvenlik yedeği: ${result.safety_backup}`
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
    const confirmed = await confirmAction(
      fa
        ? `بکاپ «${item.filename}» برای همیشه حذف شود؟`
        : language === "ar"
        ? `هل تريد حذف النسخة الاحتياطية «${item.filename}» نهائيًا؟`
        : language === "tr"
        ? `“${item.filename}” yedeği kalıcı olarak silinsin mi?`
        : `Permanently delete “${item.filename}”?`,
      { danger: true },
    );
    if (!confirmed) return;
    setBusy(item.filename);
    try {
      await deleteBackup(item.filename);
      toast.success(fa ? "بکاپ حذف شد." : language === "ar" ? "تم حذف النسخة الاحتياطية." : language === "tr" ? "Yedek silindi." : "Backup deleted.");
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
    background: "var(--erp-panel)",
    border: "1px solid var(--erp-border)",
    borderRadius: 24,
    boxShadow: "0 18px 55px rgba(2,6,23,.3)",
  };

  if (!isAdmin) {
    return (
      <div dir={dir} className="text-red-200" style={{ ...card, maxWidth: 760, margin: "80px auto", padding: 36, textAlign: "center" }}>
        <ShieldAlert size={48} style={{ margin: "0 auto 16px" }} />
        <h1>{copy.denied}</h1>
      </div>
    );
  }

  return (
    <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1550, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#03131d" }}>
            <DatabaseBackup size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(28px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "var(--erp-muted)" }}>{copy.subtitle}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={() => load(false)} disabled={loading} style={{ display: "flex", gap: 7, alignItems: "center", border: 0, borderRadius: 13, padding: "11px 14px", background: "var(--erp-panel-solid)", color: "var(--erp-text)", fontWeight: 800, cursor: "pointer" }}>
            <RefreshCw size={17} /> {fa ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
          </button>
          <button onClick={create} disabled={creating} style={{ display: "flex", gap: 7, alignItems: "center", border: 0, borderRadius: 13, padding: "11px 15px", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#03131d", fontWeight: 950, cursor: "pointer" }}>
            <HardDrive size={17} /> {creating ? "..." : copy.create}
          </button>
        </div>
      </header>

      <div style={{ ...card, padding: 15, marginBottom: 10, color: "var(--erp-accent)", display: "flex", gap: 10, alignItems: "center" }}>
        <FileCheck2 color="var(--erp-accent)" />
        {copy.autoInfo}
      </div>
      <div className="text-green-200" style={{ ...card, padding: 15, marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}>
        <TestTube2 color="#86efac" />
        {copy.rehearsalInfo}
      </div>
      {error && <div className="text-red-200" style={{ ...card, padding: 15, marginBottom: 18 }}>{error}</div>}

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1150, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--erp-panel-solid)", color: "var(--erp-accent)" }}>
                <th style={{ padding: 13, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12 }}>#</th>
                {[copy.filename, copy.createdAt, copy.kind, copy.size, copy.integrity, copy.checksum, copy.actions].map((heading) => (
                  <th key={heading} style={{ padding: 13, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && backups.length === 0 && <tr><td colSpan={8} style={{ padding: 38, textAlign: "center", color: "var(--erp-muted)" }}>{copy.empty}</td></tr>}
              {backups.map((item, rowIndex) => (
                <tr key={item.filename} style={{ borderTop: "1px solid var(--erp-border)" }}>
                  <td style={{ padding: 13, color: "var(--erp-muted)", fontWeight: 700 }}>{n(rowIndex + 1)}</td>
                  <td style={{ padding: 13, color: "var(--erp-accent)", direction: "ltr", textAlign: "left", fontSize: 12 }}>{item.filename}</td>
                  <td style={{ padding: 13, whiteSpace: "nowrap" }}>{date(item.created_at)} <small style={{ color: "var(--erp-muted)" }}>{time(item.created_at)}</small></td>
                  <td style={{ padding: 13 }}>{kindNames[item.kind] || item.kind}</td>
                  <td style={{ padding: 13 }}>{formatBytes(item.size_bytes)}</td>
                  <td style={{ padding: 13 }}>
                    <span className={item.valid === true ? "text-green-300" : item.valid === false ? "text-red-300" : "text-amber-200"} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {item.valid === true ? <CheckCircle2 size={16} /> : item.valid === false ? <AlertTriangle size={16} /> : <FileCheck2 size={16} />}
                      {item.valid === true ? copy.valid : item.valid === false ? copy.invalid : copy.notChecked}
                    </span>
                  </td>
                  <td title={item.sha256} style={{ padding: 13, color: "var(--erp-muted)", direction: "ltr", fontFamily: "monospace" }}>{item.sha256.slice(0, 12)}…</td>
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

      <DeliveryPolicies card={card} language={language} dir={dir} n={n} date={date} />
    </div>
  );
}

function DeliveryPolicies({ card, language, dir, n, date }) {
  const tr = (fa_, ar_, tr_, en_) => (language === "fa" ? fa_ : language === "ar" ? ar_ : language === "tr" ? tr_ : en_);

  function frequencyLabel(value) {
    return {
      daily: tr("روزانه", "يومي", "Günlük", "Daily"),
      weekly: tr("هفتگی", "أسبوعي", "Haftalık", "Weekly"),
      manual: tr("دستی", "يدوي", "Manuel", "Manual"),
    }[value] || value;
  }

  function channelLabel(value) {
    return {
      download: tr("لینک دانلود", "رابط تنزيل", "İndirme linki", "Download link"),
      email: tr("ایمیل", "البريد الإلكتروني", "E-posta", "Email"),
      telegram: "Telegram",
      whatsapp: "WhatsApp",
    }[value] || value;
  }

  const [policies, setPolicies] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", frequency: "daily", channel: "download", target: "" });
  const [scheduleNote, setScheduleNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [policyData, logData] = await Promise.all([getBackupDeliveryPolicies(), getBackupDeliveryLog()]);
      setPolicies(policyData.items || []);
      setScheduleNote(policyData.scheduler_note || "");
      setLog(logData.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function createPolicy(event) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    try {
      const recipients = draft.channel === "download" ? [{ channel: "download", target: "" }] : [{ channel: draft.channel, target: draft.target }];
      await createBackupDeliveryPolicy({ name: draft.name, frequency: draft.frequency, recipients });
      setDraft({ name: "", frequency: "daily", channel: "download", target: "" });
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function runNow(policy) {
    setBusy(policy.id);
    try {
      const result = await runBackupDeliveryPolicyNow(policy.id);
      toast.success(`${tr("وضعیت تحویل", "حالة التسليم", "Teslimat durumu", "Delivery status")}: ${result.status}`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy("");
    }
  }

  async function remove(policy) {
    setBusy(policy.id);
    try {
      await deleteBackupDeliveryPolicy(policy.id);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section style={{ ...card, padding: 20, marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0, color: "var(--erp-accent)", fontSize: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <Send size={20} />
          {tr("سیاست‌های تحویل خودکار بکاپ", "سياسات التسليم التلقائي للنسخ الاحتياطية", "Otomatik yedek teslim politikaları", "Automated Backup Delivery Policies")}
        </h2>
        <button onClick={() => setFormOpen((v) => !v)} style={{ display: "flex", gap: 6, alignItems: "center", border: 0, borderRadius: 12, padding: "9px 13px", background: "var(--erp-panel-solid)", color: "var(--erp-text)", fontWeight: 800, cursor: "pointer" }}>
          <Plus size={16} /> {tr("سیاست جدید", "سياسة جديدة", "Yeni politika", "New policy")}
        </button>
      </div>

      {scheduleNote && (
        <div className="text-amber-200" style={{ ...card, padding: 12, marginBottom: 14, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          {scheduleNote}
        </div>
      )}

      {formOpen && (
        <form onSubmit={createPolicy} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <input required placeholder={tr("نام سیاست", "اسم السياسة", "Politika adı", "Policy name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            style={{ flex: "1 1 180px", padding: 10, borderRadius: 10, background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", color: "var(--erp-text)" }} />
          <Select
            value={draft.frequency}
            onChange={(value) => setDraft({ ...draft, frequency: value })}
            options={[
              { value: "daily", label: tr("روزانه", "يومي", "Günlük", "Daily") },
              { value: "weekly", label: tr("هفتگی", "أسبوعي", "Haftalık", "Weekly") },
              { value: "manual", label: tr("دستی", "يدوي", "Manuel", "Manual") },
            ]}
          />
          <Select
            value={draft.channel}
            onChange={(value) => setDraft({ ...draft, channel: value })}
            options={[
              { value: "download", label: tr("لینک امن دانلود", "رابط تنزيل آمن", "Güvenli indirme linki", "Secure download link") },
              { value: "email", label: tr("ایمیل", "البريد الإلكتروني", "E-posta", "Email") },
              { value: "telegram", label: "Telegram" },
              { value: "whatsapp", label: "WhatsApp" },
            ]}
          />
          {draft.channel !== "download" && (
            <input placeholder={tr("مقصد (ایمیل/چت‌آیدی/شماره)", "الهدف (بريد/معرف/رقم)", "Hedef (e-posta/sohbet id/numara)", "Target (email/chat id/number)")} value={draft.target}
              onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              style={{ flex: "1 1 200px", padding: 10, borderRadius: 10, background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", color: "var(--erp-text)" }} />
          )}
          <button type="submit" style={{ border: 0, borderRadius: 10, padding: "10px 16px", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#03131d", fontWeight: 900, cursor: "pointer" }}>
            {tr("ذخیره", "حفظ", "Kaydet", "Save")}
          </button>
        </form>
      )}

      {!loading && policies.length === 0 && (
        <p style={{ color: "var(--erp-muted)" }}>{tr("سیاستی تعریف نشده.", "لا توجد سياسات.", "Politika tanımlanmadı.", "No policies defined yet.")}</p>
      )}

      {policies.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 18 }}>
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--erp-panel-solid)", color: "var(--erp-accent)" }}>
                {["#", tr("نام", "الاسم", "Ad", "Name"), tr("دوره", "التكرار", "Sıklık", "Frequency"), tr("گیرندگان", "المستلمون", "Alıcılar", "Recipients"), tr("آخرین اجرا", "آخر تشغيل", "Son çalıştırma", "Last run"), tr("عملیات", "الإجراءات", "İşlemler", "Actions")]
                  .map((h) => <th key={h} style={{ padding: 11, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {policies.map((p, i) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--erp-border)" }}>
                  <td style={{ padding: 11, color: "var(--erp-muted)", fontWeight: 700 }}>{n(i + 1)}</td>
                  <td style={{ padding: 11, fontWeight: 700 }}>{p.name}{!p.enabled ? ` (${tr("غیرفعال", "معطل", "devre dışı", "disabled")})` : ""}</td>
                  <td style={{ padding: 11 }}>{frequencyLabel(p.frequency)}</td>
                  <td style={{ padding: 11 }}>{(p.recipients || []).map((r) => channelLabel(r.channel)).join(", ") || "—"}</td>
                  <td style={{ padding: 11 }}>{p.last_run_at ? date(p.last_run_at) : "—"}</td>
                  <td style={{ padding: 11 }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <ActionButton title={tr("اجرای فوری", "تشغيل الآن", "Şimdi çalıştır", "Run now")} onClick={() => runNow(p)} disabled={busy === p.id}><Mail size={16} /></ActionButton>
                      <ActionButton title={tr("حذف", "حذف", "Sil", "Delete")} onClick={() => remove(p)} disabled={busy === p.id} danger><Trash2 size={16} /></ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <h3 style={{ color: "var(--erp-muted)", fontSize: 14, marginBottom: 8 }}>{tr("تاریخچه تحویل", "سجل التسليم", "Teslimat geçmişi", "Delivery history")}</h3>
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--erp-panel-solid)", color: "var(--erp-accent)" }}>
                {["#", tr("فایل", "الملف", "Dosya", "File"), tr("وضعیت", "الحالة", "Durum", "Status"), tr("زمان", "الوقت", "Zaman", "Time")]
                  .map((h) => <th key={h} style={{ padding: 11, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 10).map((item, i) => (
                <tr key={item.id} style={{ borderTop: "1px solid var(--erp-border)" }}>
                  <td style={{ padding: 11, color: "var(--erp-muted)", fontWeight: 700 }}>{n(i + 1)}</td>
                  <td style={{ padding: 11, direction: "ltr", textAlign: "left", fontSize: 12 }}>{item.backup_filename || "—"}</td>
                  <td style={{ padding: 11 }}>{item.status}</td>
                  <td style={{ padding: 11 }}>{date(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ActionButton({ title, onClick, disabled, danger, children }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled} className={danger ? "text-red-200" : undefined} style={{ border: 0, borderRadius: 10, width: 36, height: 36, display: "grid", placeItems: "center", background: danger ? "var(--erp-danger-solid)" : "var(--erp-glow)", ...(danger ? {} : { color: "var(--erp-accent)" }), cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }}>
      {children}
    </button>
  );
}
