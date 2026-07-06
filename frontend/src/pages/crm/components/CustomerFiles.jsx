import { Download, FileArchive, FileImage, FileText, FolderOpen, Plus, RefreshCw, Search, Trash2, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";

function formatDate(value, fa) {
  if (!value) return "-";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return String(value);
  }
}

function fileIcon(file) {
  const name = String(file?.name || file?.file_name || file?.title || "").toLowerCase();
  const type = String(file?.type || file?.file_type || "").toLowerCase();
  if (type.includes("image") || /\.(png|jpg|jpeg|webp|gif)$/.test(name)) return <FileImage size={20} />;
  if (type.includes("zip") || /\.(zip|rar|7z)$/.test(name)) return <FileArchive size={20} />;
  return <FileText size={20} />;
}

function fileCategoryLabel(category, fa) {
  const key = String(category || "document").toLowerCase();
  const faMap = { document: "سند", contract: "قرارداد", identity: "مدارک هویتی", invoice: "فاکتور", medical: "پزشکی", warranty: "گارانتی", service: "خدمات", other: "سایر" };
  const enMap = { document: "Document", contract: "Contract", identity: "Identity", invoice: "Invoice", medical: "Medical", warranty: "Warranty", service: "Service", other: "Other" };
  return (fa ? faMap : enMap)[key] || category || "-";
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

export default function CustomerFiles({ files = [], fa = true, n = (v) => String(v ?? ""), loading = false, onRefresh, onUploadFile, onDeleteFile }) {
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
    <section className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-cyan-300 flex items-center gap-2"><FolderOpen />{fa ? "فایل‌ها و اسناد مشتری" : "Customer Files & Documents"}</h2>
          <p className="text-slate-400 text-sm mt-2">{fa ? "قراردادها، مدارک هویتی، تصاویر، PDFها، اسناد گارانتی و فایل‌های خدمات" : "Contracts, identity documents, images, PDFs, warranty and service files"}</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2 disabled:opacity-60">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />{fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <FileStat title={fa ? "کل فایل‌ها" : "Total files"} value={n(stats.total)} />
        <FileStat title={fa ? "قرارداد" : "Contracts"} value={n(stats.contracts)} />
        <FileStat title={fa ? "هویتی" : "Identity"} value={n(stats.identity)} />
        <FileStat title={fa ? "تصاویر" : "Images"} value={n(stats.images)} />
      </div>

      <div className="rounded-3xl bg-slate-800/60 border border-white/5 p-5 mb-5">
        <h3 className="text-cyan-300 font-black mb-4 flex items-center gap-2"><UploadCloud size={21} />{fa ? "افزودن فایل جدید" : "Upload new file"}</h3>
        <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed border-cyan-400/20 bg-slate-900/70 rounded-3xl p-8 text-center cursor-pointer hover:border-cyan-300/50 transition mb-4">
          <UploadCloud size={42} className="mx-auto text-cyan-300 mb-3" />
          <div className="font-black text-white">{selectedFile ? selectedFile.name : fa ? "برای انتخاب فایل کلیک کن" : "Click to choose a file"}</div>
          <div className="text-slate-400 text-sm mt-2">{fa ? "PDF، تصویر، Word، Excel، ZIP و سایر فایل‌ها" : "PDF, image, Word, Excel, ZIP and more"}</div>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] || null)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <input value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} placeholder={fa ? "عنوان فایل" : "File title"} className="crm-input" />
          <select value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })} className="crm-input">
            <option value="document">{fa ? "سند عمومی" : "Document"}</option>
            <option value="contract">{fa ? "قرارداد" : "Contract"}</option>
            <option value="identity">{fa ? "مدارک هویتی" : "Identity"}</option>
            <option value="invoice">{fa ? "فاکتور" : "Invoice"}</option>
            <option value="medical">{fa ? "پزشکی" : "Medical"}</option>
            <option value="warranty">{fa ? "گارانتی" : "Warranty"}</option>
            <option value="service">{fa ? "خدمات" : "Service"}</option>
            <option value="other">{fa ? "سایر" : "Other"}</option>
          </select>
          <textarea value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} placeholder={fa ? "توضیحات فایل" : "File description"} rows={3} className="crm-input lg:col-span-2" />
        </div>

        <button type="button" onClick={submitUpload} disabled={!selectedFile} className="mt-4 px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2 disabled:opacity-50">
          <Plus size={18} />{fa ? "ثبت فایل" : "Save file"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3 mb-4">
        <div className="relative">
          <Search size={18} className="absolute top-3.5 right-4 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={fa ? "جستجو در فایل‌ها..." : "Search files..."} className="w-full bg-slate-800 text-white rounded-2xl pr-11 pl-4 py-3 outline-none border border-cyan-400/10" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3 outline-none border border-cyan-400/10">
          <option value="all">{fa ? "همه دسته‌ها" : "All categories"}</option>
          <option value="document">{fa ? "سند عمومی" : "Document"}</option>
          <option value="contract">{fa ? "قرارداد" : "Contract"}</option>
          <option value="identity">{fa ? "مدارک هویتی" : "Identity"}</option>
          <option value="invoice">{fa ? "فاکتور" : "Invoice"}</option>
          <option value="medical">{fa ? "پزشکی" : "Medical"}</option>
          <option value="warranty">{fa ? "گارانتی" : "Warranty"}</option>
          <option value="service">{fa ? "خدمات" : "Service"}</option>
          <option value="other">{fa ? "سایر" : "Other"}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((file) => (
          <div key={file.id} className="rounded-3xl bg-slate-800/70 border border-white/5 p-4 hover:border-cyan-400/20 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 flex items-center justify-center">{fileIcon(file)}</div>
                <div><div className="font-black text-white break-words">{file.title}</div><div className="text-xs text-slate-500 mt-1">{formatDate(file.created_at, fa)}</div></div>
              </div>
              {onDeleteFile && <button type="button" onClick={() => onDeleteFile(file.id)} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-200 flex items-center justify-center"><Trash2 size={16} /></button>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-cyan-400/10 text-cyan-200 border border-cyan-400/20">{fileCategoryLabel(file.category, fa)}</span>
              {file.size && <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-500/10 text-slate-300 border border-slate-400/20">{file.size}</span>}
            </div>

            {file.description && <p className="text-slate-300 text-sm leading-7 mt-3 line-clamp-3">{file.description}</p>}

            <div className="mt-4">
              {file.url ? <a href={file.url} target="_blank" rel="noreferrer" className="w-full px-4 py-3 rounded-2xl bg-slate-900 text-cyan-200 font-black flex items-center justify-center gap-2"><Download size={17} />{fa ? "باز کردن / دانلود" : "Open / Download"}</a> : <button type="button" disabled className="w-full px-4 py-3 rounded-2xl bg-slate-900 text-slate-500 font-black flex items-center justify-center gap-2"><Download size={17} />{fa ? "فایل هنوز آپلود نشده" : "No uploaded file"}</button>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="md:col-span-2 xl:col-span-3 rounded-3xl bg-slate-800/60 border border-white/5 p-8 text-center text-slate-400">{fa ? "فایلی برای نمایش وجود ندارد." : "No files to show."}</div>}
      </div>

      <style>{`
        .crm-input { width: 100%; background: #0f172a; color: white; border: 1px solid rgba(34,211,238,.14); border-radius: 16px; padding: 12px; outline: none; }
        .crm-input::placeholder { color: rgba(148, 163, 184, .75); }
      `}</style>
    </section>
  );
}

function FileStat({ title, value }) {
  return <div className="rounded-2xl bg-slate-800/70 border border-white/5 p-4"><div className="text-slate-400 text-xs font-bold">{title}</div><div className="text-2xl font-black text-cyan-300 mt-2">{value}</div></div>;
}
