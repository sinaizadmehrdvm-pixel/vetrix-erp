import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, History, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { applyImport, downloadImportTemplate, getImportBatches, previewImport } from "../services/dataImportApi";

export default function DataImportCenter() {
  const { language, dir, n, date } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const [entity, setEntity] = useState("customers");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const t = {
    title: tr("ورود گروهی امن اطلاعات", "استيراد آمن للبيانات بالجملة", "Güvenli toplu veri içe aktarma", "Safe Bulk Data Import"),
    sub: tr(
      "فایل ابتدا بررسی می‌شود و تا تأیید شما هیچ داده‌ای ثبت نخواهد شد.",
      "يتم التحقق من الملف أولاً، ولن يتم تسجيل أي بيانات حتى تؤكد ذلك.",
      "Dosya önce doğrulanır; siz onaylayana kadar hiçbir veri kaydedilmez.",
      "Files are validated first; nothing is written until you approve."
    ),
    customers: tr("طرف‌حساب‌ها", "الأطراف", "Cariler", "Parties"),
    products: tr("کالاها", "المنتجات", "Ürünler", "Products"),
    template: tr("دانلود الگوی Excel", "تنزيل قالب Excel", "Excel şablonunu indir", "Download Excel template"),
    choose: tr("انتخاب فایل Excel", "اختر ملف Excel", "Excel dosyası seçin", "Choose Excel file"),
    preview: tr("بررسی و پیش‌نمایش", "التحقق والمعاينة", "Doğrula ve önizle", "Validate and preview"),
    apply: tr("تأیید و ثبت نهایی", "تأكيد وتطبيق نهائي", "Onayla ve uygula", "Approve and apply"),
    total: tr("کل ردیف‌ها", "إجمالي الصفوف", "Toplam satır", "Total rows"),
    valid: tr("معتبر", "صالح", "Geçerli", "Valid"),
    errors: tr("خطادار", "به خطأ", "Hatalı", "Errors"),
    duplicate: tr("تکراری", "مكرر", "Yinelenen", "Duplicates"),
    history: tr("تاریخچه ورود اطلاعات", "سجل استيراد البيانات", "Veri içe aktarma geçmişi", "Import history"),
    status: tr("وضعیت", "الحالة", "Durum", "Status"),
    file: tr("فایل", "الملف", "Dosya", "File"),
    no: tr("هنوز Batch ثبت نشده است.", "لم يتم تسجيل أي دفعة بعد.", "Henüz içe aktarma grubu yok.", "No import batches yet."),
    warning: tr(
      "ردیف‌های تکراری ثبت نمی‌شوند. اگر هر ردیف خطا داشته باشد، Apply تا رفع خطا مسدود است.",
      "لن يتم تسجيل الصفوف المكررة. إذا كان هناك أي صف يحتوي على خطأ، يُحظر التطبيق حتى يتم إصلاحه.",
      "Yinelenen satırlar kaydedilmez. Herhangi bir satırda hata varsa, hata giderilene kadar Uygula engellenir.",
      "Duplicates are skipped. Apply is blocked while any row has validation errors."
    ),
  };
  async function load() { try { setBatches(await getImportBatches()); } catch (error) { toast.error(error.message); } }
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function runPreview() {
    if (!file) return toast.error(t.choose);
    setBusy(true);
    try { setPreview(await previewImport(entity, file)); } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  }
  async function runApply() {
    if (!preview?.can_apply) return;
    setBusy(true);
    try {
      const result = await applyImport(preview.batch_id);
      toast.success(tr(`${n(result.inserted)} ردیف ثبت شد.`, `تم تسجيل ${n(result.inserted)} صف.`, `${n(result.inserted)} satır içe aktarıldı.`, `${n(result.inserted)} rows imported.`));
      setPreview(null); setFile(null); await load();
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  }
  const card = { background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 24, boxShadow: "0 18px 55px rgba(2,6,23,.28)" };
  return <div dir={dir} style={{ maxWidth: 1500, margin: "0 auto", color: "var(--erp-text)" }}>
    <header style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
      <div style={{ width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}><FileSpreadsheet size={30}/></div>
      <div><h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(28px,4vw,40px)" }}>{t.title}</h1><p style={{ color: "var(--erp-muted)", margin: "6px 0 0" }}>{t.sub}</p></div>
    </header>
    <section style={{ ...card, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
        <select value={entity} onChange={e => { setEntity(e.target.value); setPreview(null); }} style={{ padding: 12, borderRadius: 13, background: "var(--erp-bg)", color: "var(--erp-text)", border: "1px solid var(--erp-border)" }}><option value="customers">{t.customers}</option><option value="products">{t.products}</option></select>
        <button onClick={() => downloadImportTemplate(entity, language)} style={{ padding: 12, borderRadius: 13, fontWeight: 900, background: "#164e63", color: "#cffafe", border: 0 }}><Download size={17} style={{ display: "inline", marginInlineEnd: 7 }}/>{t.template}</button>
        <label style={{ padding: 12, borderRadius: 13, border: "1px dashed var(--erp-accent)", cursor: "pointer" }}><Upload size={17} style={{ display: "inline", marginInlineEnd: 7 }}/>{file?.name || t.choose}<input hidden type="file" accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); }}/></label>
        <button disabled={!file || busy} onClick={runPreview} style={{ padding: 12, borderRadius: 13, fontWeight: 900, border: 0, background: "var(--erp-accent)", color: "#071028", opacity: !file || busy ? .5 : 1 }}>{busy ? "..." : t.preview}</button>
      </div>
      <p style={{ color: "#fbbf24", marginBottom: 0 }}><AlertTriangle size={17} style={{ display: "inline", marginInlineEnd: 7 }}/>{t.warning}</p>
    </section>
    {preview && <section aria-live="polite" style={{ ...card, padding: 18, marginBottom: 14 }}>
      <div className="erp-import-metrics">
        {[[t.total,preview.total_rows],[t.valid,preview.valid_rows],[t.errors,preview.error_rows],[t.duplicate,preview.duplicate_rows]].map(([label,value]) => <div key={label} style={{ padding: 13, borderRadius: 15, background: "var(--erp-bg)" }}><small style={{ color: "var(--erp-muted)" }}>{label}</small><strong style={{ display: "block", fontSize: 24 }}>{n(value)}</strong></div>)}
      </div>
      <div className="erp-table-scroll"><table className="erp-data-table"><thead><tr><th>#</th><th>{tr("نام", "الاسم", "Ad", "Name")}</th><th>{t.status}</th><th>{tr("جزئیات", "التفاصيل", "Ayrıntılar", "Details")}</th></tr></thead><tbody>{preview.preview.map(row => <tr key={row.row}><td>{n(row.row)}</td><td>{row.data.name}</td><td>{row.errors.length ? t.errors : row.duplicate ? t.duplicate : t.valid}</td><td>{row.errors.map(x => x.message).join(" · ") || "—"}</td></tr>)}</tbody></table></div>
      <button disabled={!preview.can_apply || busy} onClick={runApply} style={{ marginTop: 13, padding: "12px 18px", borderRadius: 13, border: 0, fontWeight: 900, background: "#166534", color: "#dcfce7", opacity: !preview.can_apply || busy ? .5 : 1 }}><CheckCircle2 size={18} style={{ display: "inline", marginInlineEnd: 7 }}/>{t.apply}</button>
    </section>}
    <section style={{ ...card, padding: 18 }}><h2><History size={21} style={{ display: "inline", marginInlineEnd: 8 }}/>{t.history}</h2>
      {!batches.length && <p style={{ color: "var(--erp-muted)" }}>{t.no}</p>}
      <div style={{ display: "grid", gap: 8 }}>{batches.map(batch => <div key={batch.id} style={{ padding: 13, borderRadius: 15, background: "var(--erp-bg)", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><strong>{batch.file_name}</strong><span>{batch.entity_type}</span><span>{t.status}: {batch.status}</span><span>{date(batch.created_at)}</span></div>)}</div>
    </section>
  </div>;
}
