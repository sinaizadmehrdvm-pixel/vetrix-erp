import { useEffect, useMemo, useState } from "react";
import {
  Upload, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  Download, RefreshCcw, Undo2, FileText, FileSpreadsheet as FileXlsIcon,
  Save, Loader2, Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { confirmAction } from "../../components/ui/confirmService";
import { useDebounce } from "../../hooks/useDebounce";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td, SortableTh, EmptyRow } from "../../components/ui/Table";
import { getWarehouses } from "../../services/api";
import {
  inspectImportFile, previewImport, applyImport, rollbackImportBatch,
  downloadImportTemplate, getMappingProfiles, saveMappingProfile,
  exportImportReportExcel, exportImportReportSummaryPdf,
} from "../../services/dataImportApi";
import JalaliDateField from "../../components/forms/JalaliDateField";
import Select from "../../components/ui/Select";

const PAGE_SIZE = 50;
const UPDATE_FIELD_OPTIONS = [
  "barcode", "barcode2", "barcode3", "sku", "brand", "unit", "buy_price",
  "sell_price", "min_stock", "main_category", "sub_category", "description", "count_in_pack",
];

function bytesToLabel(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function ProductImportWizard() {
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";
  const ar = language === "ar";
  const trk = language === "tr";
  const tr = (a, b, c, d) => (fa ? a : ar ? b : trk ? c : d);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectData, setInspectData] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [mappingOverride, setMappingOverride] = useState({});
  const [profiles, setProfiles] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const [duplicatePolicy, setDuplicatePolicy] = useState("skip");
  const [matchKeys, setMatchKeys] = useState("code_or_barcode");
  const [updateFieldsSelected, setUpdateFieldsSelected] = useState([]);
  const [allowBlankOverwrite, setAllowBlankOverwrite] = useState(false);
  const [negativeStockPolicy, setNegativeStockPolicy] = useState("block");
  const [warehouses, setWarehouses] = useState([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [rollbackResult, setRollbackResult] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const STEP_LABELS = [
    tr("منبع", "المصدر", "Kaynak", "Source"),
    tr("نگاشت ستون‌ها", "تخطيط الأعمدة", "Sütun eşleme", "Mapping"),
    tr("سیاست‌ها", "السياسات", "İlkeler", "Policy"),
    tr("پیش‌نمایش", "المعاينة", "Önizleme", "Preview"),
    tr("نتیجه", "النتيجة", "Sonuç", "Result"),
  ];

  useEffect(() => {
    getWarehouses().then((w) => setWarehouses(Array.isArray(w?.items) ? w.items : [])).catch(() => setWarehouses([]));
    getMappingProfiles("products").then(setProfiles).catch(() => setProfiles([]));
  }, []);

  async function handleFileChosen(chosenFile) {
    if (!chosenFile) return;
    if (!chosenFile.name.toLowerCase().endsWith(".xlsx")) {
      toast.error(tr("فقط فایل .xlsx پذیرفته می‌شود", "يُقبل ملف .xlsx فقط", "Yalnızca .xlsx dosyası kabul edilir", "Only .xlsx files are accepted"));
      return;
    }
    setFile(chosenFile);
    setInspecting(true);
    setInspectData(null);
    setPreview(null);
    try {
      const data = await inspectImportFile(chosenFile, "products");
      setInspectData(data);
      setSheetName(data.active_sheet);
      setMappingOverride({});
    } catch (error) {
      toast.error(error.message);
      setFile(null);
    } finally {
      setInspecting(false);
    }
  }

  async function handleSheetChange(name) {
    setSheetName(name);
    if (!file) return;
    setInspecting(true);
    try {
      const data = await inspectImportFile(file, "products", name);
      setInspectData(data);
      setMappingOverride({});
    } catch (error) {
      toast.error(error.message);
    } finally {
      setInspecting(false);
    }
  }

  function headerForField(field) {
    if (mappingOverride[field] !== undefined) return mappingOverride[field];
    const index = inspectData?.suggested_mapping?.[field];
    return index !== undefined && inspectData ? inspectData.headers[index] : "";
  }

  function sampleForField(field) {
    if (!inspectData) return "";
    const header = headerForField(field);
    const index = inspectData.headers.indexOf(header);
    return index >= 0 ? inspectData.sample_row[index] ?? "" : "";
  }

  const columnMapJson = useMemo(() => {
    if (!inspectData) return "";
    const map = {};
    for (const field of inspectData.entity_fields) {
      const header = headerForField(field);
      if (header) map[field] = header;
    }
    return JSON.stringify(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectData, mappingOverride]);

  const requiredMapped = Boolean(headerForField("name"));

  function loadProfile(id) {
    setSelectedProfileId(id);
    const profile = profiles.find((p) => String(p.id) === String(id));
    if (!profile) return;
    try {
      setMappingOverride(JSON.parse(profile.mapping_json));
    } catch {
      toast.error(tr("این Mapping خراب است", "هذا التخطيط تالف", "Bu eşleme bozuk", "This mapping profile is corrupted"));
    }
  }

  async function saveCurrentMapping() {
    if (!profileName.trim()) {
      toast.error(tr("نامی برای Mapping وارد کنید", "أدخل اسمًا للتخطيط", "Eşleme için bir ad girin", "Enter a name for this mapping"));
      return;
    }
    try {
      const map = {};
      for (const field of inspectData.entity_fields) {
        const header = headerForField(field);
        if (header) map[field] = header;
      }
      await saveMappingProfile("products", profileName.trim(), map);
      toast.success(tr("Mapping ذخیره شد", "تم حفظ التخطيط", "Eşleme kaydedildi", "Mapping saved"));
      setProfiles(await getMappingProfiles("products"));
      setProfileName("");
    } catch (error) {
      toast.error(error.message);
    }
  }

  function toggleUpdateField(field) {
    setUpdateFieldsSelected((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  }

  async function runPreview() {
    setBusy(true);
    try {
      const options = {
        sheet_name: sheetName,
        column_map_json: columnMapJson,
        duplicate_policy: duplicatePolicy,
        match_keys: matchKeys,
        negative_stock_policy: negativeStockPolicy,
        default_warehouse_id: defaultWarehouseId || undefined,
        update_fields: duplicatePolicy === "update" ? updateFieldsSelected.join(",") : "",
        allow_blank_overwrite: allowBlankOverwrite,
        opening_date: openingDate,
      };
      const result = await previewImport("products", file, options);
      setPreview(result);
      setPage(1);
      setStep(3);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    if (!preview?.can_apply || busy) return;
    setBusy(true);
    try {
      const result = await applyImport(preview.batch_id);
      setApplyResult(result);
      setStep(4);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runRollback() {
    if (!preview || busy) return;
    const ok = await confirmAction(tr(
      "این Batch بازگردانی شود؟ فقط کالاهایی که تازه ایجاد شده و در فاکتور یا تراکنش دیگری استفاده نشده‌اند حذف می‌شوند.",
      "هل تريد التراجع عن هذه الدفعة؟ سيتم حذف المنتجات المُنشأة حديثًا وغير المستخدمة فقط.",
      "Bu grup geri alınsın mı? Yalnızca yeni oluşturulan ve başka bir yerde kullanılmayan ürünler silinecek.",
      "Roll back this batch? Only newly-created products that haven't been used elsewhere will be removed."
    ), { danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await rollbackImportBatch(preview.batch_id);
      setRollbackResult(result);
      toast.success(tr(`وضعیت: ${result.status}`, `الحالة: ${result.status}`, `Durum: ${result.status}`, `Status: ${result.status}`));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  function resetWizard() {
    setStep(0);
    setFile(null);
    setInspectData(null);
    setPreview(null);
    setApplyResult(null);
    setRollbackResult(null);
    setMappingOverride({});
    setDuplicatePolicy("skip");
    setUpdateFieldsSelected([]);
    setSearchInput("");
    setStatusFilter("all");
  }

  const rows = useMemo(() => preview?.preview || [], [preview]);

  function rowStatus(row) {
    if (row.errors.length) return "error";
    if (row.updatable) return "updatable";
    if (row.duplicate) return "duplicate";
    if (row.warnings?.length) return "warning";
    return "valid";
  }

  const stats = useMemo(() => {
    let noPrice = 0, noBarcode = 0, noStock = 0;
    const units = new Set();
    const categories = new Set();
    for (const row of rows) {
      const d = row.data;
      if (!d.sell_price) noPrice += 1;
      if (!d.barcode) noBarcode += 1;
      if (!d.stock) noStock += 1;
      if (d.unit) units.add(d.unit);
      if (d.main_category) categories.add(d.main_category);
    }
    return { noPrice, noBarcode, noStock, unitCount: units.size, categoryCount: categories.size };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = rowStatus(row);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!keyword) return true;
      return JSON.stringify(row.data).toLowerCase().includes(keyword);
    });
  }, [rows, search, statusFilter]);

  const sortedRows = useMemo(() => {
    if (!sortField) return filteredRows;
    const list = [...filteredRows];
    list.sort((a, b) => {
      const av = a.data[sortField] ?? "";
      const bv = b.data[sortField] ?? "";
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function setSort(field, direction) {
    if (!field) { setSortField(null); return; }
    setSortField(field);
    setSortDir(direction);
  }

  const card = { background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 20, padding: 18 };
  const inputStyle = { padding: 10, borderRadius: 12, background: "var(--erp-bg)", color: "var(--erp-text)", border: "1px solid var(--erp-border)", width: "100%" };
  const labelStyle = { fontSize: 13, fontWeight: 700, color: "var(--erp-muted)", marginBottom: 6, display: "block" };

  const STATUS_TONE = { valid: "success", warning: "warning", error: "danger", duplicate: "neutral", updatable: "info" };
  const STATUS_LABEL = {
    valid: tr("معتبر", "صالح", "Geçerli", "Valid"),
    warning: tr("هشدار", "تحذير", "Uyarı", "Warning"),
    error: tr("خطا", "خطأ", "Hata", "Error"),
    duplicate: tr("تکراری", "مكرر", "Yinelenen", "Duplicate"),
    updatable: tr("قابل به‌روزرسانی", "قابل للتحديث", "Güncellenebilir", "Updatable"),
  };

  return (
    <div dir={dir} style={{ direction: dir }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {STEP_LABELS.map((label, index) => (
          <div
            key={label}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999,
              background: index === step ? "var(--erp-accent)" : "var(--erp-panel-solid)",
              color: index === step ? "#071028" : "var(--erp-muted)",
              border: "1px solid var(--erp-border)", fontWeight: 800, fontSize: 13,
              opacity: index > step && !(index === step + 1 && canAdvanceFrom(step)) ? 0.6 : 1,
            }}
          >
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: index <= step ? "rgba(0,0,0,.15)" : "var(--erp-bg)", display: "grid", placeItems: "center", fontSize: 11 }}>
              {n(index + 1)}
            </span>
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div style={card}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileChosen(e.dataTransfer.files?.[0]); }}
            style={{
              border: `2px dashed ${dragOver ? "var(--erp-accent)" : "var(--erp-border)"}`,
              borderRadius: 16, padding: 32, textAlign: "center", marginBottom: 16,
              background: dragOver ? "var(--erp-glow)" : "transparent", transition: "all .15s",
            }}
          >
            <Upload size={32} style={{ color: "var(--erp-accent)", margin: "0 auto 10px" }} />
            <p style={{ margin: 0, fontWeight: 800, color: "var(--erp-text)" }}>
              {tr("فایل Excel را اینجا رها کنید یا انتخاب کنید", "أفلت ملف Excel هنا أو اخترْه", "Excel dosyasını buraya bırakın veya seçin", "Drop your Excel file here or choose one")}
            </p>
            <label style={{ display: "inline-block", marginTop: 14, padding: "10px 18px", borderRadius: 12, background: "var(--erp-accent)", color: "#071028", fontWeight: 900, cursor: "pointer" }}>
              {tr("انتخاب فایل", "اختيار ملف", "Dosya seç", "Choose file")}
              <input hidden type="file" accept=".xlsx" onChange={(e) => handleFileChosen(e.target.files?.[0])} />
            </label>
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" icon={Download} onClick={() => downloadImportTemplate("products", language)}>
                {tr("دانلود الگوی استاندارد", "تنزيل القالب القياسي", "Standart şablonu indir", "Download standard template")}
              </Button>
            </div>
          </div>

          {inspecting && (
            <p style={{ color: "var(--erp-muted)", display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 size={16} className="animate-spin" /> {tr("در حال بررسی فایل...", "جارٍ فحص الملف...", "Dosya inceleniyor...", "Inspecting file...")}
            </p>
          )}

          {file && inspectData && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 14 }}>
              <InfoBox label={tr("نام فایل", "اسم الملف", "Dosya adı", "File name")} value={file.name} />
              <InfoBox label={tr("حجم", "الحجم", "Boyut", "Size")} value={bytesToLabel(file.size)} />
              <InfoBox label={tr("تعداد Sheet", "عدد الأوراق", "Sayfa sayısı", "Sheets")} value={n(inspectData.sheet_names.length)} />
              <InfoBox label={tr("ردیف‌های داده", "صفوف البيانات", "Veri satırları", "Data rows")} value={n(inspectData.row_counts[sheetName] ?? 0)} />
              <InfoBox label={tr("تاریخ انتخاب", "تاريخ الاختيار", "Seçim tarihi", "Selected at")} value={new Date().toLocaleString(language === "fa" ? "fa-IR" : undefined)} />
            </div>
          )}

          {inspectData && inspectData.sheet_names.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{tr("انتخاب Sheet", "اختر الورقة", "Sayfa seçin", "Choose sheet")}</label>
              <Select
                value={sheetName}
                onChange={(value) => handleSheetChange(value)}
                options={inspectData.sheet_names.map((name) => ({ value: name, label: `${name} (${n(inspectData.row_counts[name] ?? 0)})` }))}
              />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button icon={ArrowRight} disabled={!inspectData} onClick={() => setStep(1)}>
              {tr("مرحله بعد", "التالي", "Sonraki", "Next")}
            </Button>
          </div>
        </div>
      )}

      {step === 1 && inspectData && (
        <div style={card}>
          <p style={{ color: "var(--erp-muted)", marginTop: 0 }}>
            {tr("ستون‌های فایل شما به فیلدهای VITALIX نگاشت شده‌اند. در صورت نیاز اصلاح کنید.", "تم تخطيط أعمدة ملفك إلى حقول VITALIX. عدّل عند الحاجة.", "Dosyanızın sütunları VITALIX alanlarına eşlendi. Gerekirse düzenleyin.", "Your file's columns have been mapped to VITALIX fields. Adjust if needed.")}
          </p>

          {profiles.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "var(--erp-muted)" }}>{tr("بارگذاری Mapping ذخیره‌شده:", "تحميل تخطيط محفوظ:", "Kayıtlı eşlemeyi yükle:", "Load saved mapping:")}</label>
              <Select
                value={selectedProfileId}
                onChange={(value) => loadProfile(value)}
                className="w-auto"
                options={[
                  { value: "", label: tr("انتخاب کنید", "اختر", "Seçin", "Select") },
                  ...profiles.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
          )}

          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "start" }}>
                  <th style={{ padding: 8, color: "var(--erp-muted)", fontSize: 12 }}>{tr("فیلد VITALIX", "حقل VITALIX", "VITALIX alanı", "VITALIX field")}</th>
                  <th style={{ padding: 8, color: "var(--erp-muted)", fontSize: 12 }}>{tr("ستون فایل شما", "عمود ملفك", "Dosya sütunu", "Your file column")}</th>
                  <th style={{ padding: 8, color: "var(--erp-muted)", fontSize: 12 }}>{tr("نمونه مقدار", "قيمة نموذجية", "Örnek değer", "Sample value")}</th>
                  <th style={{ padding: 8, color: "var(--erp-muted)", fontSize: 12 }}>{tr("وضعیت", "الحالة", "Durum", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {inspectData.entity_fields.map((field) => {
                  const header = headerForField(field);
                  return (
                    <tr key={field} style={{ borderTop: "1px solid var(--erp-border)" }}>
                      <td style={{ padding: 8, fontWeight: 700 }}>
                        {field}
                        {field === "name" && <span style={{ color: "var(--erp-danger)" }}> *</span>}
                      </td>
                      <td style={{ padding: 8 }}>
                        <Select
                          value={header}
                          onChange={(value) => setMappingOverride((prev) => ({ ...prev, [field]: value }))}
                          options={[
                            { value: "", label: tr("— نگاشت نشده —", "— غير مطابق —", "— eşlenmedi —", "— unmapped —") },
                            ...inspectData.headers.map((h) => ({ value: h, label: h })),
                          ]}
                        />
                      </td>
                      <td style={{ padding: 8, color: "var(--erp-muted)", fontSize: 13 }}>{String(sampleForField(field) ?? "")}</td>
                      <td style={{ padding: 8 }}>
                        {header ? <Badge tone="success">{tr("نگاشت‌شده", "مطابق", "Eşlendi", "Mapped")}</Badge> : <Badge tone="neutral">{tr("خالی", "فارغ", "Boş", "Empty")}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <input
              placeholder={tr("نام برای ذخیره این Mapping", "اسم لحفظ هذا التخطيط", "Bu eşlemeyi kaydetmek için ad", "Name to save this mapping")}
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
            />
            <Button variant="secondary" icon={Save} onClick={saveCurrentMapping}>
              {tr("ذخیره Mapping", "حفظ التخطيط", "Eşlemeyi kaydet", "Save mapping")}
            </Button>
          </div>

          {!requiredMapped && (
            <Notice text={tr("ستون «نام کالا» باید نگاشت شود.", "يجب تخطيط عمود «اسم المنتج».", "«Ürün adı» sütunu eşlenmelidir.", "The \"name\" column must be mapped.")} />
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(0)}>{tr("مرحله قبل", "السابق", "Önceki", "Back")}</Button>
            <Button icon={ArrowRight} disabled={!requiredMapped} onClick={() => setStep(2)}>{tr("مرحله بعد", "التالي", "Sonraki", "Next")}</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
            <div>
              <label style={labelStyle}>{tr("سیاست موارد تکراری", "سياسة التكرارات", "Yinelenen ilkesi", "Duplicate policy")}</label>
              <Select
                value={duplicatePolicy}
                onChange={(value) => setDuplicatePolicy(value)}
                options={[
                  { value: "skip", label: tr("فقط ایجاد کالاهای جدید (رد تکراری‌ها)", "إنشاء الجديد فقط (تجاهل المكرر)", "Yalnızca yenilerini oluştur (yinelenenleri yoksay)", "Create new only (skip duplicates)") },
                  { value: "update", label: tr("به‌روزرسانی کالاهای موجود", "تحديث المنتجات الموجودة", "Mevcut ürünleri güncelle", "Update existing products") },
                ]}
              />
            </div>
            <div>
              <label style={labelStyle}>{tr("بررسی تکراری بر اساس", "التحقق من التكرار حسب", "Yinelenen kontrolü", "Check duplicates by")}</label>
              <Select
                value={matchKeys}
                onChange={(value) => setMatchKeys(value)}
                options={[
                  { value: "code", label: tr("کد کالا", "كود المنتج", "Ürün kodu", "Product code") },
                  { value: "sku", label: "SKU" },
                  { value: "barcode", label: tr("بارکد", "الباركود", "Barkod", "Barcode") },
                  { value: "code_or_barcode", label: tr("کد یا بارکد", "الكود أو الباركود", "Kod veya barkod", "Code or barcode") },
                ]}
              />
            </div>
            <div>
              <label style={labelStyle}>{tr("سیاست موجودی منفی", "سياسة الرصيد السالب", "Negatif stok ilkesi", "Negative stock policy")}</label>
              <Select
                value={negativeStockPolicy}
                onChange={(value) => setNegativeStockPolicy(value)}
                options={[
                  { value: "block", label: tr("مسدود شود", "يُحظر", "Engelle", "Block") },
                  { value: "warn", label: tr("با هشدار پذیرفته شود", "يُقبل مع تحذير", "Uyarı ile kabul et", "Accept with warning") },
                ]}
              />
            </div>
            <div>
              <label style={labelStyle}>{tr("انبار مقصد موجودی اولیه", "المستودع الوجهة للرصيد الافتتاحي", "Açılış stoku hedef deposu", "Opening stock warehouse")}</label>
              <Select
                value={defaultWarehouseId}
                onChange={(value) => setDefaultWarehouseId(value)}
                options={[
                  { value: "", label: tr("پیش‌فرض (Main)", "افتراضي (Main)", "Varsayılan (Main)", "Default (Main)") },
                  ...warehouses.filter((w) => !w.is_default).map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
            </div>
            <div>
              <label style={labelStyle}>{tr("تاریخ سند افتتاحیه", "تاريخ الافتتاح", "Açılış tarihi", "Opening date")}</label>
              <JalaliDateField value={openingDate} onChange={(iso) => setOpeningDate(iso)} fa={fa} language={language} style={inputStyle} />
            </div>
          </div>

          {duplicatePolicy === "update" && (
            <div style={{ marginTop: 16 }}>
              <label style={labelStyle}>{tr("فیلدهایی که هنگام به‌روزرسانی تغییر کنند", "الحقول التي يتم تحديثها", "Güncellenecek alanlar", "Fields to update")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {UPDATE_FIELD_OPTIONS.map((field) => (
                  <label key={field} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 10, background: "var(--erp-bg)", border: "1px solid var(--erp-border)", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={updateFieldsSelected.includes(field)} onChange={() => toggleUpdateField(field)} />
                    {field}
                  </label>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--erp-muted)" }}>
                <input type="checkbox" checked={allowBlankOverwrite} onChange={(e) => setAllowBlankOverwrite(e.target.checked)} />
                {tr("سلول خالی، مقدار موجود را هم پاک کند", "الخلية الفارغة تمسح القيمة الموجودة أيضًا", "Boş hücre mevcut değeri de silsin", "A blank cell also clears the existing value")}
              </label>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)}>{tr("مرحله قبل", "السابق", "Önceki", "Back")}</Button>
            <Button icon={busy ? Loader2 : ArrowRight} loading={busy} onClick={runPreview}>
              {tr("بررسی و پیش‌نمایش", "التحقق والمعاينة", "Doğrula ve önizle", "Validate and preview")}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 16 }}>
            <Metric label={tr("کل ردیف‌ها", "الإجمالي", "Toplam", "Total")} value={preview.total_rows} n={n} />
            <Metric label={tr("معتبر", "صالح", "Geçerli", "Valid")} value={preview.valid_rows} n={n} tone="success" />
            <Metric label={tr("هشدار", "تحذير", "Uyarı", "Warning")} value={preview.warnings.length} n={n} tone="warning" />
            <Metric label={tr("خطا", "خطأ", "Hata", "Error")} value={preview.error_rows} n={n} tone="danger" />
            <Metric label={tr("تکراری", "مكرر", "Yinelenen", "Duplicate")} value={preview.duplicate_rows} n={n} />
            <Metric label={tr("قابل به‌روزرسانی", "قابل للتحديث", "Güncellenebilir", "Updatable")} value={preview.updatable_rows} n={n} tone="info" />
            <Metric label={tr("بدون قیمت فروش", "بدون سعر بيع", "Satış fiyatı yok", "No sell price")} value={stats.noPrice} n={n} />
            <Metric label={tr("بدون بارکد", "بدون باركود", "Barkod yok", "No barcode")} value={stats.noBarcode} n={n} />
            <Metric label={tr("بدون موجودی", "بدون رصيد", "Stok yok", "No stock")} value={stats.noStock} n={n} />
            <Metric label={tr("واحد یکتا", "وحدات فريدة", "Benzersiz birim", "Unique units")} value={stats.unitCount} n={n} />
            <Metric label={tr("گروه یکتا", "مجموعات فريدة", "Benzersiz grup", "Unique groups")} value={stats.categoryCount} n={n} />
          </div>

          {preview.warnings.filter((w) => w.row === 0).map((w, i) => (
            <p key={i} style={{ color: "#f87171", fontWeight: 700 }}><AlertTriangle size={16} style={{ display: "inline", marginInlineEnd: 6 }} />{w.message}</p>
          ))}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="vitalix-input-group" style={{ background: "var(--erp-bg)", gap: 8, padding: "0 12px", flex: 1, minWidth: 220 }}>
              <Search size={16} style={{ color: "var(--erp-accent)" }} />
              <input
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                placeholder={tr("جستجو در ردیف‌ها...", "بحث في الصفوف...", "Satırlarda ara...", "Search rows...")}
                style={{ color: "var(--erp-text)", flex: 1, minWidth: 0, padding: "8px 0" }}
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(value) => { setStatusFilter(value); setPage(1); }}
              className="w-auto"
              options={[
                { value: "all", label: tr("همه وضعیت‌ها", "كل الحالات", "Tüm durumlar", "All statuses") },
                ...Object.entries(STATUS_LABEL).map(([key, label]) => ({ value: key, label })),
              ]}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <Table>
              <Thead>
                <Th>#</Th>
                <SortableTh field="name" sortField={sortField} sortDir={sortDir} onSort={setSort}>{tr("نام", "الاسم", "Ad", "Name")}</SortableTh>
                <SortableTh field="code" sortField={sortField} sortDir={sortDir} onSort={setSort}>{tr("کد", "الكود", "Kod", "Code")}</SortableTh>
                <SortableTh field="main_category" sortField={sortField} sortDir={sortDir} onSort={setSort}>{tr("گروه", "المجموعة", "Grup", "Group")}</SortableTh>
                <SortableTh field="sell_price" sortField={sortField} sortDir={sortDir} onSort={setSort} align="end">{tr("قیمت فروش", "سعر البيع", "Satış fiyatı", "Sell price")}</SortableTh>
                <SortableTh field="stock" sortField={sortField} sortDir={sortDir} onSort={setSort} align="end">{tr("موجودی", "الرصيد", "Stok", "Stock")}</SortableTh>
                <Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
                <Th>{tr("جزئیات", "التفاصيل", "Ayrıntılar", "Details")}</Th>
              </Thead>
              <Tbody>
                {pagedRows.map((row) => {
                  const status = rowStatus(row);
                  const messages = [...row.errors, ...(row.warnings || [])].map((m) => m.message);
                  return (
                    <Tr key={row.row}>
                      <Td>{n(row.row)}</Td>
                      <Td className="font-black">{row.data.name || "-"}</Td>
                      <Td>{row.data.code || "-"}</Td>
                      <Td>{row.data.main_category || "-"}</Td>
                      <Td align="end">{n(row.data.sell_price || 0)}</Td>
                      <Td align="end">{n(row.data.stock || 0)}</Td>
                      <Td><Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge></Td>
                      <Td style={{ fontSize: 12, color: "var(--erp-muted)" }}>{messages.join(" · ") || "—"}</Td>
                    </Tr>
                  );
                })}
                {pagedRows.length === 0 && <EmptyRow colSpan={8}>{tr("موردی یافت نشد.", "لم يتم العثور على نتائج.", "Sonuç bulunamadı.", "No matching rows.")}</EmptyRow>}
              </Tbody>
            </Table>
          </div>

          {sortedRows.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontSize: 13, color: "var(--erp-muted)" }}>
                {tr(`${n(sortedRows.length)} ردیف`, `${n(sortedRows.length)} صف`, `${n(sortedRows.length)} satır`, `${n(sortedRows.length)} rows`)}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: 8, borderRadius: 10, background: "var(--erp-bg)", border: "1px solid var(--erp-border)", opacity: currentPage <= 1 ? 0.5 : 1 }}>
                  {dir === "rtl" ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                </button>
                <span style={{ fontSize: 13 }}>{tr(`صفحه ${n(currentPage)} از ${n(pageCount)}`, `صفحة ${n(currentPage)} من ${n(pageCount)}`, `Sayfa ${n(currentPage)} / ${n(pageCount)}`, `Page ${n(currentPage)} of ${n(pageCount)}`)}</span>
                <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((p) => p + 1)} style={{ padding: 8, borderRadius: 10, background: "var(--erp-bg)", border: "1px solid var(--erp-border)", opacity: currentPage >= pageCount ? 0.5 : 1 }}>
                  {dir === "rtl" ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(2)}>{tr("مرحله قبل", "السابق", "Önceki", "Back")}</Button>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" icon={FileText} onClick={() => exportImportReportExcel(preview.batch_id, "errors")}>
                {tr("خروجی خطاها", "تصدير الأخطاء", "Hataları dışa aktar", "Export errors")}
              </Button>
              <Button icon={CheckCircle2} disabled={!preview.can_apply} loading={busy} onClick={runApply}>
                {tr("تأیید و ثبت نهایی", "تأكيد وتطبيق نهائي", "Onayla ve uygula", "Confirm and apply")}
              </Button>
            </div>
          </div>
          {!preview.can_apply && (
            <Notice text={tr("تا رفع همه خطاها یا نامتوازن‌بودن، امکان ثبت نیست.", "لا يمكن التطبيق حتى يتم حل جميع الأخطاء.", "Tüm hatalar çözülene kadar uygulanamaz.", "Cannot apply until all blocking errors are resolved.")} />
          )}
        </div>
      )}

      {step === 4 && applyResult && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <CheckCircle2 size={28} style={{ color: "var(--erp-success)" }} />
            <h2 style={{ margin: 0, color: "var(--erp-accent)" }}>{tr("Import با موفقیت ثبت شد", "تم تسجيل الاستيراد بنجاح", "İçe aktarma başarıyla uygulandı", "Import applied successfully")}</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
            <Metric label={tr("ایجادشده", "تم الإنشاء", "Oluşturuldu", "Created")} value={applyResult.inserted} n={n} tone="success" />
            <Metric label={tr("به‌روزرسانی‌شده", "تم التحديث", "Güncellendi", "Updated")} value={applyResult.updated} n={n} tone="info" />
            <Metric label={tr("رد‌شده", "تم التجاهل", "Atlandı", "Skipped")} value={applyResult.skipped} n={n} />
          </div>
          <p style={{ color: "var(--erp-muted)", fontSize: 13 }}>{tr("شناسه Batch:", "معرّف الدفعة:", "Grup kimliği:", "Batch ID:")} {preview.batch_id}</p>

          {rollbackResult && (
            <div style={{ background: "var(--erp-bg)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <strong>{tr("نتیجه بازگردانی:", "نتيجة التراجع:", "Geri alma sonucu:", "Rollback result:")}</strong> {rollbackResult.status}
              {rollbackResult.skipped?.length > 0 && (
                <ul style={{ marginTop: 8, paddingInlineStart: 18 }}>
                  {rollbackResult.skipped.map((s) => (
                    <li key={s.product_id} style={{ fontSize: 13, color: "var(--erp-muted)" }}>{s.name}: {s.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            <Button variant="secondary" icon={FileXlsIcon} onClick={() => exportImportReportExcel(preview.batch_id, "full")}>{tr("خروجی کامل Excel", "تصدير Excel كامل", "Tam Excel dışa aktar", "Full Excel export")}</Button>
            <Button variant="secondary" icon={FileXlsIcon} onClick={() => exportImportReportExcel(preview.batch_id, "applied")}>{tr("خروجی ثبت‌شده‌ها", "تصدير المُطبَّقة", "Uygulananları dışa aktar", "Export applied")}</Button>
            <Button variant="secondary" icon={FileText} onClick={() => exportImportReportSummaryPdf(preview.batch_id)}>{tr("گزارش خلاصه PDF", "تقرير موجز PDF", "Özet PDF raporu", "Summary PDF")}</Button>
            {!rollbackResult && (
              <Button variant="danger" icon={Undo2} loading={busy} onClick={runRollback}>{tr("بازگردانی (Rollback)", "تراجع", "Geri al (Rollback)", "Rollback")}</Button>
            )}
          </div>

          <Button variant="secondary" icon={RefreshCcw} onClick={resetWizard}>{tr("Import جدید", "استيراد جديد", "Yeni içe aktarma", "New import")}</Button>
        </div>
      )}
    </div>
  );

  function canAdvanceFrom(currentStep) {
    if (currentStep === 0) return Boolean(inspectData);
    if (currentStep === 1) return requiredMapped;
    if (currentStep === 2) return true;
    if (currentStep === 3) return Boolean(preview?.can_apply);
    return false;
  }
}

function InfoBox({ label, value }) {
  return (
    <div style={{ background: "var(--erp-bg)", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--erp-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 800, marginTop: 4, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function Metric({ label, value, n, tone }) {
  const color = tone === "success" ? "var(--erp-success)" : tone === "warning" ? "var(--erp-warning)" : tone === "danger" ? "var(--erp-danger)" : tone === "info" ? "var(--erp-accent)" : "var(--erp-text)";
  return (
    <div style={{ background: "var(--erp-bg)", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--erp-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 20, marginTop: 4, color, fontVariantNumeric: "tabular-nums" }}>{n(value)}</div>
    </div>
  );
}

function Notice({ text }) {
  return (
    <p style={{ color: "#fbbf24", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
      <AlertTriangle size={16} /> {text}
    </p>
  );
}
