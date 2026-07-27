import { Download, FileArchive, FileImage, FileText, FolderOpen, Plus, RefreshCw, Search, Trash2, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { openAuthenticatedDocument } from "../../../services/api";
import { formatCalendarDate } from "../../../utils/date";
import { toPersianDigits } from "../../../localization/helpers";

function fileIcon(file) {
  const name = String(file?.name || file?.file_name || file?.title || "").toLowerCase();
  const type = String(file?.type || file?.file_type || "").toLowerCase();
  if (type.includes("image") || /\.(png|jpg|jpeg|webp|gif)$/.test(name)) return <FileImage size={20} />;
  if (type.includes("zip") || /\.(zip|rar|7z)$/.test(name)) return <FileArchive size={20} />;
  return <FileText size={20} />;
}

function fileCategoryLabel(category, language) {
  const key = String(category || "document").toLowerCase();
  const maps = {
    fa: { document: "سند", contract: "قرارداد", identity: "مدارک هویتی", invoice: "فاکتور", medical: "پزشکی", warranty: "گارانتی", service: "خدمات", other: "سایر" },
    ar: { document: "مستند", contract: "عقد", identity: "وثائق الهوية", invoice: "فاتورة", medical: "طبي", warranty: "ضمان", service: "خدمة", other: "أخرى" },
    tr: { document: "Belge", contract: "Sözleşme", identity: "Kimlik belgeleri", invoice: "Fatura", medical: "Tıbbi", warranty: "Garanti", service: "Servis", other: "Diğer" },
    en: { document: "Document", contract: "Contract", identity: "Identity", invoice: "Invoice", medical: "Medical", warranty: "Warranty", service: "Service", other: "Other" },
  };
  return (maps[language] || maps.en)[key] || category || "-";
}

function normalizeFiles(files) {
  return (Array.isArray(files) ? files : []).map((file, index) => ({
    id: file.id || file.file_id || `file-${index}`,
    title: file.title || file.name || file.file_name || "File",
    description: file.description || file.note || "",
    category: file.category || file.file_category || "document",
    url: file.url || file.file_url || file.path || "",
    type: file.type || file.file_type || "",
    size: file.size || file.file_size || "",
    created_at: file.created_at || file.uploaded_at || file.date || "",
    raw: file,
  }));
}

export default function CustomerFiles({ files = [], fa = true, language, n = (v) => String(v ?? ""), loading = false, onRefresh, onUploadFile, onDeleteFile }) {
  const lang = language || (fa ? "fa" : "en");
  const tr = (faText, arText, trText, enText) =>
    lang === "fa" ? faText : lang === "ar" ? arText : lang === "tr" ? trText : enText;

  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [uploadForm, setUploadForm] = useState({ title: "", description: "", category: "document" });
  const [selectedFile, setSelectedFile] = useState(null);

  const rows = useMemo(() => normalizeFiles(files), [files]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((file) => {
      const matchesQuery = !q || file.title.toLowerCase().includes(q) || file.description.toLowerCase().includes(q) || file.category.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === "all" || file.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [rows, query, categoryFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    contracts: rows.filter((x) => x.category === "contract").length,
    identity: rows.filter((x) => x.category === "identity").length,
    images: rows.filter((x) => String(x.type).includes("image") || /\.(png|jpg|jpeg|webp|gif)$/i.test(x.title)).length,
  }), [rows]);

  function chooseFile(file) {
    setSelectedFile(file);
    if (file && !uploadForm.title) setUploadForm((prev) => ({ ...prev, title: file.name || "" }));
  }

  async function submitUpload() {
    if (!selectedFile || !onUploadFile) return;
    await onUploadFile({ file: selectedFile, title: uploadForm.title || selectedFile.name, description: uploadForm.description, category: uploadForm.category });
    setSelectedFile(null);
    setUploadForm({ title: "", description: "", category: "document" });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5 text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2"><FolderOpen />{tr("فایل‌ها و اسناد مشتری", "ملفات ومستندات العميل", "Müşteri dosyaları ve belgeleri", "Customer Files & Documents")}</h2>
          <p className="text-[var(--erp-muted)] text-sm mt-2">{tr("قراردادها، مدارک هویتی، تصاویر، PDFها، اسناد گارانتی و فایل‌های خدمات", "العقود ووثائق الهوية والصور وملفات PDF ووثائق الضمان وملفات الخدمة", "Sözleşmeler, kimlik belgeleri, görseller, PDF'ler, garanti ve servis dosyaları", "Contracts, identity documents, images, PDFs, warranty and service files")}</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2 disabled:opacity-60">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />{tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <FileStat title={tr("کل فایل‌ها", "إجمالي الملفات", "Toplam dosya", "Total files")} value={n(stats.total)} />
        <FileStat title={tr("قرارداد", "العقود", "Sözleşmeler", "Contracts")} value={n(stats.contracts)} />
        <FileStat title={tr("هویتی", "وثائق الهوية", "Kimlik", "Identity")} value={n(stats.identity)} />
        <FileStat title={tr("تصاویر", "الصور", "Görseller", "Images")} value={n(stats.images)} />
      </div>

      <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5 mb-5">
        <h3 className="text-[var(--erp-accent)] font-black mb-4 flex items-center gap-2"><UploadCloud size={21} />{tr("افزودن فایل جدید", "إضافة ملف جديد", "Yeni dosya ekle", "Upload new file")}</h3>
        <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed border-[var(--erp-border)] bg-[var(--erp-panel)] rounded-3xl p-8 text-center cursor-pointer hover:border-cyan-300/50 transition mb-4">
          <UploadCloud size={42} className="mx-auto text-[var(--erp-accent)] mb-3" />
          <div className="font-black text-[var(--erp-text)]">{selectedFile ? selectedFile.name : tr("برای انتخاب فایل کلیک کن", "انقر لاختيار ملف", "Dosya seçmek için tıklayın", "Click to choose a file")}</div>
          <div className="text-[var(--erp-muted)] text-sm mt-2">{tr("PDF، تصویر، Word، Excel، ZIP و سایر فایل‌ها", "PDF، صورة، Word، Excel، ZIP والمزيد", "PDF, görsel, Word, Excel, ZIP ve daha fazlası", "PDF, image, Word, Excel, ZIP and more")}</div>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] || null)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <input value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} placeholder={tr("عنوان فایل", "عنوان الملف", "Dosya başlığı", "File title")} className="crm-input" />
          <select value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })} className="crm-input">
            <option value="document">{tr("سند عمومی", "مستند عام", "Genel belge", "Document")}</option>
            <option value="contract">{tr("قرارداد", "عقد", "Sözleşme", "Contract")}</option>
            <option value="identity">{tr("مدارک هویتی", "وثائق الهوية", "Kimlik belgeleri", "Identity")}</option>
            <option value="invoice">{tr("فاکتور", "فاتورة", "Fatura", "Invoice")}</option>
            <option value="medical">{tr("پزشکی", "طبي", "Tıbbi", "Medical")}</option>
            <option value="warranty">{tr("گارانتی", "ضمان", "Garanti", "Warranty")}</option>
            <option value="service">{tr("خدمات", "خدمة", "Servis", "Service")}</option>
            <option value="other">{tr("سایر", "أخرى", "Diğer", "Other")}</option>
          </select>
          <textarea value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: lang === "fa" ? toPersianDigits(e.target.value) : e.target.value })} placeholder={tr("توضیحات فایل", "وصف الملف", "Dosya açıklaması", "File description")} rows={3} className="crm-input lg:col-span-2" />
        </div>

        <button type="button" onClick={submitUpload} disabled={!selectedFile} className="mt-4 px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2 disabled:opacity-50">
          <Plus size={18} />{tr("ثبت فایل", "حفظ الملف", "Dosyayı kaydet", "Save file")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3 mb-4">
        <div className="relative">
          <Search size={18} className="absolute top-3.5 right-4 text-[var(--erp-muted)]" />
          <input value={query} onChange={(e) => setQuery(lang === "fa" ? toPersianDigits(e.target.value) : e.target.value)} placeholder={tr("جستجو در فایل‌ها...", "بحث في الملفات...", "Dosyalarda ara...", "Search files...")} className="w-full bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl pr-11 pl-4 py-3 outline-none border border-[var(--erp-border)]" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl px-4 py-3 outline-none border border-[var(--erp-border)]">
          <option value="all">{tr("همه دسته‌ها", "جميع الفئات", "Tüm kategoriler", "All categories")}</option>
          <option value="document">{tr("سند عمومی", "مستند عام", "Genel belge", "Document")}</option>
          <option value="contract">{tr("قرارداد", "عقد", "Sözleşme", "Contract")}</option>
          <option value="identity">{tr("مدارک هویتی", "وثائق الهوية", "Kimlik belgeleri", "Identity")}</option>
          <option value="invoice">{tr("فاکتور", "فاتورة", "Fatura", "Invoice")}</option>
          <option value="medical">{tr("پزشکی", "طبي", "Tıbbi", "Medical")}</option>
          <option value="warranty">{tr("گارانتی", "ضمان", "Garanti", "Warranty")}</option>
          <option value="service">{tr("خدمات", "خدمة", "Servis", "Service")}</option>
          <option value="other">{tr("سایر", "أخرى", "Diğer", "Other")}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((file) => (
          <div key={file.id} className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4 hover:border-cyan-400/20 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] border border-[var(--erp-border)] flex items-center justify-center">{fileIcon(file)}</div>
                <div><div className="font-black text-[var(--erp-text)] break-words">{file.title}</div><div className="text-xs text-[var(--erp-muted)] mt-1">{formatCalendarDate(file.created_at, lang)}</div></div>
              </div>
              {onDeleteFile && <button type="button" onClick={() => onDeleteFile(file.id)} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-200 flex items-center justify-center"><Trash2 size={16} /></button>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-[var(--erp-glow)] text-[var(--erp-accent)] border border-[var(--erp-border)]">{fileCategoryLabel(file.category, lang)}</span>
              {file.size && <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-500/10 text-[var(--erp-muted)] border border-slate-400/20">{file.size}</span>}
            </div>

            {file.description && <p className="text-[var(--erp-muted)] text-sm leading-7 mt-3 line-clamp-3">{file.description}</p>}

            <div className="mt-4">
              {file.url ? (
                <button
                  type="button"
                  onClick={() => openAuthenticatedDocument(file.url).catch((error) => toast.error(error.message || tr("باز کردن فایل ممکن نشد.", "تعذّر فتح الملف.", "Dosya açılamadı.", "Couldn't open the file.")))}
                  className="w-full px-4 py-3 rounded-2xl bg-[var(--erp-bg-soft)] text-[var(--erp-accent)] font-black flex items-center justify-center gap-2"
                >
                  <Download size={17} />{tr("باز کردن / دانلود", "فتح / تنزيل", "Aç / İndir", "Open / Download")}
                </button>
              ) : (
                <button type="button" disabled className="w-full px-4 py-3 rounded-2xl bg-[var(--erp-bg-soft)] text-[var(--erp-muted)] font-black flex items-center justify-center gap-2"><Download size={17} />{tr("فایل هنوز آپلود نشده", "لم يتم رفع أي ملف بعد", "Henüz dosya yüklenmedi", "No uploaded file")}</button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="md:col-span-2 xl:col-span-3 rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-8 text-center text-[var(--erp-muted)]">{tr("فایلی برای نمایش وجود ندارد.", "لا توجد ملفات لعرضها.", "Gösterilecek dosya yok.", "No files to show.")}</div>}
      </div>

      <style>{`
        .crm-input { width: 100%; background: var(--erp-panel-solid); color: var(--erp-text); border: 1px solid var(--erp-border); border-radius: 16px; padding: 12px; outline: none; }
        .crm-input::placeholder { color: var(--erp-muted); }
      `}</style>
    </section>
  );
}

function FileStat({ title, value }) {
  return <div className="rounded-2xl bg-[var(--erp-panel)] border border-[var(--erp-border)] p-4"><div className="text-[var(--erp-muted)] text-xs font-bold">{title}</div><div className="text-2xl font-black text-[var(--erp-accent)] mt-2">{value}</div></div>;
}
