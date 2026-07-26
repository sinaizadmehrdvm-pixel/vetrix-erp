import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Printer, Settings2 } from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { getCache } from "../storage/db";
import { getInvoice, getPdfTemplates } from "../services/api";
import {
  PAGE_SIZES,
  buildDefaultConfig,
  normalizeConfig,
  getInvoiceItems,
  computeInvoiceTotals,
  buildReplaceTokens,
} from "./invoicePrintHelpers";
import { Canvas, PrintElement } from "./invoicePrintComponents";

// The invoice list's "Print" button used to drop straight into the full
// drag/resize Print Studio editor, which is overkill for the common
// case of "pick a template, print" - this page is that simple choice
// screen, with a link into the full editor only for when the user
// actually wants to customize a template.
export default function InvoicePrintChoose() {
  const { id } = useParams();
  const { language, n, money, date, dir } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [invoice, setInvoice] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("default");
  const [config, setConfig] = useState(() => buildDefaultConfig(language));
  const [zoom, setZoom] = useState(0.55);

  useEffect(() => {
    async function loadInvoiceDetails() {
      if (!id) return;
      try {
        const full = await getInvoice(id);
        setInvoice(full);
        return;
      } catch (e) {
        console.error("Invoice fetch error:", e);
      }
      try {
        const cached = await getCache("invoices");
        if (Array.isArray(cached)) {
          const found = cached.find((x) => String(x.id) === String(id));
          setInvoice(found || null);
        }
      } catch (e) {
        console.error("Invoice cache error:", e);
      }
    }
    loadInvoiceDetails();
  }, [id]);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const data = await getPdfTemplates();
        const normalized = (Array.isArray(data) ? data : []).map((tpl) => ({
          ...tpl,
          config: normalizeConfig(tpl.config, language),
        }));
        setTemplates(normalized);
      } catch (err) {
        console.error("Print templates loading error", err);
        setTemplates([]);
      }
    }
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Regenerate the default template's text whenever the language changes
  // while it's still selected - resynced during render (React's
  // documented pattern) rather than in an effect, same reasoning as
  // InvoicePrint.jsx.
  const [syncedLanguage, setSyncedLanguage] = useState(language);
  if (language !== syncedLanguage) {
    setSyncedLanguage(language);
    if (selectedTemplateId === "default") {
      setConfig(buildDefaultConfig(language));
    }
  }

  function handleTemplateChange(templateId) {
    setSelectedTemplateId(templateId);
    if (templateId === "default") {
      setConfig(buildDefaultConfig(language));
      return;
    }
    const template = templates.find((tpl) => String(tpl.id) === String(templateId));
    if (template) setConfig(normalizeConfig(template.config, language));
  }

  const items = useMemo(() => getInvoiceItems(invoice), [invoice]);
  const totals = useMemo(() => computeInvoiceTotals(invoice, items), [invoice, items]);
  const page = PAGE_SIZES[config.page_size] || PAGE_SIZES.A4;
  const replaceTokens = buildReplaceTokens({ invoice, items, totals, language, n, money, date });

  function renderElement(element) {
    return <PrintElement element={element} items={items} language={language} n={n} money={money} invoice={invoice} replaceTokens={replaceTokens} />;
  }

  if (!invoice) {
    return (
      <section className="p-6 text-[var(--erp-text)] bg-[var(--erp-bg)] min-h-screen">
        <Link to="/invoices" className="text-[var(--erp-accent)] font-bold">
          {tr("بازگشت به فاکتورها", "العودة إلى الفواتير", "Faturalara Dön", "Back to invoices")}
        </Link>
        <div className="mt-6 text-[var(--erp-muted)]">
          {tr(
            "فاکتور پیدا نشد. یک بار صفحه فاکتورها را باز کن تا کش آفلاین به‌روزرسانی شود.",
            "لم يتم العثور على الفاتورة. افتح صفحة الفواتير مرة واحدة لتحديث الذاكرة المؤقتة غير المتصلة.",
            "Fatura bulunamadı. Çevrimdışı önbelleği güncellemek için faturalar sayfasını bir kez açın.",
            "Invoice not found."
          )}
        </div>
      </section>
    );
  }

  return (
    <section dir={dir} className="print-choose-page min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] p-5">
      <div className="no-print flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-3xl font-black text-[var(--erp-accent)]">
            {tr(`چاپ فاکتور شماره ${n(invoice.id)}`, `طباعة الفاتورة رقم ${n(invoice.id)}`, `${n(invoice.id)} numaralı faturayı yazdır`, `Print invoice #${invoice.id}`)}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {tr(
              "قالب چاپ را انتخاب کن و مستقیم چاپ بگیر، یا اگر لازم بود قالب را ویرایش کن.",
              "اختر قالب الطباعة واطبع مباشرة، أو عدّل القالب إذا لزم الأمر.",
              "Yazdırma şablonunu seçip doğrudan yazdırın, gerekirse şablonu düzenleyin.",
              "Pick a print template and print directly, or edit the template first if you need to."
            )}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link to="/invoices" className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2">
            <ArrowLeft size={18} />
            {tr("بازگشت", "رجوع", "Geri", "Back")}
          </Link>

          <Link to={`/invoice-print/${invoice.id}/edit`} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2">
            <Settings2 size={18} />
            {tr("ویرایش این قالب", "تعديل هذا القالب", "Bu şablonu düzenle", "Customize this template")}
          </Link>

          <button type="button" onClick={() => window.print()} className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2">
            <Printer size={18} />
            {tr("چاپ / ذخیره PDF", "طباعة / حفظ PDF", "Yazdır / PDF Kaydet", "Print / PDF")}
          </button>
        </div>
      </div>

      <div className="no-print grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
        <aside className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 space-y-4 h-fit">
          <h2 className="text-[var(--erp-accent)] font-black flex items-center gap-2">
            <FileText size={20} />
            {tr("قالب چاپ", "قالب الطباعة", "Yazdırma Şablonu", "Print Template")}
          </h2>

          <label className="block space-y-2">
            <span className="text-[var(--erp-accent)] text-sm font-bold block">
              {tr("انتخاب قالب", "اختيار القالب", "Şablon Seç", "Choose template")}
            </span>
            <select value={selectedTemplateId} onChange={(e) => handleTemplateChange(e.target.value)} className="choose-input">
              <option value="default">{tr("قالب پیش‌فرض", "القالب الافتراضي", "Varsayılan Şablon", "Default template")}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-[var(--erp-accent)] text-sm font-bold block">
              {tr("اندازه صفحه", "حجم الصفحة", "Sayfa Boyutu", "Page size")}
            </span>
            <div className="choose-input opacity-80">{page.label}</div>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="choose-tool-button">-</button>
            <button onClick={() => setZoom((z) => Math.min(1, z + 0.1))} className="choose-tool-button">+</button>
          </div>
        </aside>

        <main className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 overflow-auto">
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[var(--erp-accent)] font-black">{tr("پیش‌نمایش", "معاينة", "Önizleme", "Preview")}</div>
            <div className="text-[var(--erp-muted)] text-sm">{page.label} • {Math.round(zoom * 100)}%</div>
          </div>

          <Canvas
            page={page}
            zoom={zoom}
            showGrid={false}
            config={config}
            selectedElementId={null}
            editMode={false}
            onElementMouseDown={() => {}}
            onResizeMouseDown={() => {}}
            renderElement={renderElement}
            dir={dir}
          />
        </main>
      </div>

      <div className="print-only">
        <Canvas page={page} zoom={1} showGrid={false} config={config} selectedElementId={null} editMode={false} onElementMouseDown={() => {}} onResizeMouseDown={() => {}} renderElement={renderElement} dir={dir} />
      </div>

      <style>{`
        .choose-input {
          width: 100%;
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border: 1px solid var(--erp-border);
          border-radius: 16px;
          padding: 12px;
          outline: none;
        }
        .choose-tool-button {
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border-radius: 16px;
          padding: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .choose-tool-button:hover { background: var(--erp-glow); }
        .print-only { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only {
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .print-canvas {
            margin: 0 auto !important;
            box-shadow: none !important;
            transform: none !important;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </section>
  );
}
