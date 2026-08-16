import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Edit3,
  FileText,
  Grid3X3,
  Maximize2,
  Printer,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import { getCache } from "../storage/db";
import Select from "../components/ui/Select";
import { getInvoice, getPdfTemplates, savePdfTemplate } from "../services/api";
import { promptAction } from "../components/ui/confirmService";
import {
  PAGE_SIZES,
  buildDefaultConfig,
  defaultTemplateName,
  normalizeConfig,
  getInvoiceItems,
  computeInvoiceTotals,
  buildReplaceTokens,
} from "./invoicePrintHelpers";
import { Canvas, PrintElement } from "./invoicePrintComponents";

function snap(value) {
  return Math.round(Number(value || 0) / 10) * 10;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export default function InvoicePrint({ invoice: propInvoice = null }) {
  const { id } = useParams();
  const { language, n, money, date, dir } = useLanguage();
  const fa = language === "fa";

  const [cachedInvoice, setCachedInvoice] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("default");
  const [templateName, setTemplateName] = useState(() => defaultTemplateName(language));
  const [config, setConfig] = useState(() => buildDefaultConfig(language));
  const [selectedElementId, setSelectedElementId] = useState("title");
  const [editMode, setEditMode] = useState(true);
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [zoom, setZoom] = useState(0.82);
  const [showGrid, setShowGrid] = useState(true);
  const [message, setMessage] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const invoice = propInvoice || cachedInvoice;
  const items = useMemo(() => getInvoiceItems(invoice), [invoice]);
  const page = PAGE_SIZES[config.page_size] || PAGE_SIZES.A4;
  const selectedElement = config.elements.find((el) => el.id === selectedElementId) || null;

  const totals = useMemo(() => computeInvoiceTotals(invoice, items), [invoice, items]);

  // Keep the quick "default template" in sync with the active language -
  // without this, switching the app language while already on this page
  // left the template name and every element's default text stuck in
  // whatever language was active when the component first mounted.
  // Resynced during render (React's documented pattern for this) rather
  // than in an effect, which would cause an extra render pass.
  const [syncedLanguage, setSyncedLanguage] = useState(language);
  if (language !== syncedLanguage) {
    setSyncedLanguage(language);
    if (selectedTemplateId === "default") {
      setConfig(buildDefaultConfig(language));
      setTemplateName(defaultTemplateName(language));
      setSelectedElementId("title");
    }
  }

  useEffect(() => {
    async function loadInvoiceDetails() {
      if (propInvoice || !id) return;
      // Prefer the backend (has line items); the local list cache only ever
      // held list-summary rows with no items, which made every invoice
      // printed from the invoice list show an empty items table.
      try {
        const full = await getInvoice(id);
        setCachedInvoice(full);
        return;
      } catch (e) {
        console.error("Invoice fetch error:", e);
      }
      try {
        const cached = await getCache("invoices");
        if (Array.isArray(cached)) {
          const found = cached.find((x) => String(x.id) === String(id));
          setCachedInvoice(found || null);
        }
      } catch (e) {
        console.error("Invoice cache error:", e);
      }
    }
    loadInvoiceDetails();
  }, [id, propInvoice]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadTemplates(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTemplates() {
    try {
      setLoadingTemplates(true);
      const data = await getPdfTemplates();
      const normalized = (Array.isArray(data) ? data : []).map((tpl) => ({
        ...tpl,
        config: normalizeConfig(tpl.config, language),
      }));
      setTemplates(normalized);
    } catch (err) {
      console.error("Print templates loading error", err);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }

  function updateConfig(nextConfig) {
    setConfig(normalizeConfig(nextConfig, language));
  }

  function updateElement(id, patch) {
    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));
  }

  function handleTemplateChange(templateId) {
    setSelectedTemplateId(templateId);

    if (templateId === "default") {
      setTemplateName(defaultTemplateName(language));
      updateConfig(buildDefaultConfig(language));
      setSelectedElementId("title");
      setMessage(
        fa
          ? "قالب پیش‌فرض اعمال شد."
          : language === "ar"
          ? "تم تطبيق القالب الافتراضي."
          : language === "tr"
          ? "Varsayılan şablon uygulandı."
          : "Default template applied."
      );
      return;
    }

    const template = templates.find((tpl) => String(tpl.id) === String(templateId));
    if (!template) return;

    setTemplateName(
      template.name || (fa ? "قالب چاپ" : language === "ar" ? "قالب الطباعة" : language === "tr" ? "Yazdırma Şablonu" : "Print template")
    );
    updateConfig(template.config || buildDefaultConfig(language));
    setSelectedElementId((template.config?.elements || [])[0]?.id || "title");
    setMessage(
      fa
        ? "قالب انتخاب شد و روی پیش‌نمایش اعمال شد."
        : language === "ar"
        ? "تم تحميل القالب وتطبيقه على المعاينة."
        : language === "tr"
        ? "Şablon yüklendi ve önizlemeye uygulandı."
        : "Template loaded in preview."
    );
  }

  async function saveAsTemplate() {
    const suffix = invoice?.id ? ` #${invoice.id}` : "";
    const newName = await promptAction(
      fa
        ? "نام قالب جدید را وارد کن:"
        : language === "ar"
        ? "أدخل اسم القالب الجديد:"
        : language === "tr"
        ? "Yeni şablon adını girin:"
        : "Enter new template name:",
      { defaultValue: `${templateName}${suffix}` }
    );

    if (!newName) return;

    await savePdfTemplate({
      name: newName,
      page_size: config.page_size,
      config,
    });

    setMessage(
      fa
        ? "قالب جدید ذخیره شد."
        : language === "ar"
        ? "تم حفظ القالب الجديد."
        : language === "tr"
        ? "Yeni şablon kaydedildi."
        : "New template saved."
    );
    await loadTemplates();
  }

  function duplicateElement() {
    if (!selectedElement) return;
    const copyLabel =
      fa ? `${selectedElement.label || selectedElement.type} کپی`
      : language === "ar" ? `نسخة ${selectedElement.label || selectedElement.type}`
      : language === "tr" ? `${selectedElement.label || selectedElement.type} Kopyası`
      : `${selectedElement.label || selectedElement.type} copy`;
    const copy = {
      ...clone(selectedElement),
      id: `${selectedElement.id}_copy_${Date.now()}`,
      label: copyLabel,
      x: selectedElement.x + 20,
      y: selectedElement.y + 20,
    };
    setConfig((prev) => ({ ...prev, elements: [...prev.elements, copy] }));
    setSelectedElementId(copy.id);
  }

  function deleteElement() {
    if (!selectedElement) return;
    const nextElements = config.elements.filter((el) => el.id !== selectedElement.id);
    setConfig((prev) => ({ ...prev, elements: nextElements }));
    setSelectedElementId(nextElements[0]?.id || "");
  }

  function onElementMouseDown(event, element) {
    if (!editMode) return;
    if (event.target?.dataset?.resize === "true") return;

    event.preventDefault();
    setSelectedElementId(element.id);
    setDrag({
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX: element.x,
      originalY: element.y,
    });
  }

  function onResizeMouseDown(event, element) {
    if (!editMode) return;
    event.preventDefault();
    event.stopPropagation();

    setSelectedElementId(element.id);
    setResize({
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      originalW: element.w,
      originalH: element.h,
    });
  }

  function onCanvasMouseMove(event) {
    if (!editMode) return;

    if (drag) {
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;

      updateElement(drag.id, {
        x: Math.max(0, Math.min(page.w - 20, snap(drag.originalX + dx))),
        y: Math.max(0, Math.min(page.h - 20, snap(drag.originalY + dy))),
      });
    }

    if (resize) {
      const dx = (event.clientX - resize.startX) / zoom;
      const dy = (event.clientY - resize.startY) / zoom;

      updateElement(resize.id, {
        w: Math.max(30, snap(resize.originalW + dx)),
        h: Math.max(25, snap(resize.originalH + dy)),
      });
    }
  }

  function stopPointerActions() {
    setDrag(null);
    setResize(null);
  }

  const replaceTokens = buildReplaceTokens({ invoice, items, totals, language, n, money, date });

  function renderElement(element) {
    return <PrintElement element={element} items={items} language={language} n={n} money={money} invoice={invoice} replaceTokens={replaceTokens} />;
  }

  if (!invoice) {
    return (
      <section className="p-6 text-[var(--erp-text)] bg-[var(--erp-bg)] min-h-screen">
        <Link to="/invoices" className="text-[var(--erp-accent)] font-bold">
          {fa ? "بازگشت به فاکتورها" : language === "ar" ? "العودة إلى الفواتير" : language === "tr" ? "Faturalara Dön" : "Back to invoices"}
        </Link>
        <div className="mt-6 text-[var(--erp-muted)]">
          {fa
            ? "فاکتور پیدا نشد. یک بار صفحه فاکتورها را باز کن تا کش آفلاین به‌روزرسانی شود."
            : language === "ar"
            ? "لم يتم العثور على الفاتورة. افتح صفحة الفواتير مرة واحدة لتحديث الذاكرة المؤقتة غير المتصلة."
            : language === "tr"
            ? "Fatura bulunamadı. Çevrimdışı önbelleği güncellemek için faturalar sayfasını bir kez açın."
            : "Invoice not found."}
        </div>
      </section>
    );
  }

  return (
    <section dir={dir} className="print-studio-page min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] p-5">
      <div className="no-print flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-3xl font-black text-[var(--erp-accent)]">
            {fa ? "استودیوی چاپ فاکتور" : language === "ar" ? "استوديو طباعة الفواتير" : language === "tr" ? "Fatura Baskı Stüdyosu" : "Invoice Print Studio"}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {fa
              ? `فاکتور شماره ${n(invoice.id)} را با قالب ذخیره‌شده چاپ کن.`
              : language === "ar"
              ? `اطبع الفاتورة رقم ${n(invoice.id)} باستخدام قالب محفوظ.`
              : language === "tr"
              ? `${n(invoice.id)} numaralı faturayı kayıtlı bir şablonla yazdırın.`
              : `Print invoice #${invoice.id} with a saved template.`}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link to={`/invoice-print/${invoice.id}`} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2">
            <ArrowLeft size={18} />
            {fa ? "بازگشت به گزینه‌های چاپ" : language === "ar" ? "الرجوع إلى خيارات الطباعة" : language === "tr" ? "Yazdırma Seçeneklerine Dön" : "Back to print options"}
          </Link>

          <button type="button" onClick={saveAsTemplate} className="px-4 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2">
            <Save size={18} />
            {fa ? "ذخیره به عنوان قالب" : language === "ar" ? "حفظ كقالب" : language === "tr" ? "Şablon Olarak Kaydet" : "Save as template"}
          </button>

          <button type="button" onClick={() => window.print()} className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2">
            <Printer size={18} />
            {fa ? "چاپ / ذخیره PDF" : language === "ar" ? "طباعة / حفظ PDF" : language === "tr" ? "Yazdır / PDF Kaydet" : "Print / PDF"}
          </button>
        </div>
      </div>

      {message && (
        <div className="no-print mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-emerald-200 font-bold">
          {message}
        </div>
      )}

      <div className="no-print grid grid-cols-1 xl:grid-cols-[310px_1fr_320px] gap-5">
        <aside className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 space-y-4">
          <h2 className="text-[var(--erp-accent)] font-black flex items-center gap-2">
            <FileText size={20} />
            {fa ? "قالب چاپ" : language === "ar" ? "قالب الطباعة" : language === "tr" ? "Yazdırma Şablonu" : "Print Template"}
          </h2>

          <Field label={fa ? "انتخاب قالب ذخیره‌شده" : language === "ar" ? "اختيار قالب محفوظ" : language === "tr" ? "Kayıtlı Şablon Seç" : "Saved template"}>
            <Select
              value={selectedTemplateId}
              onChange={(value) => handleTemplateChange(value)}
              options={[
                { value: "default", label: fa ? "قالب پیش‌فرض سریع" : language === "ar" ? "القالب الافتراضي السريع" : language === "tr" ? "Hızlı Varsayılan Şablon" : "Default template" },
                ...templates.map((template) => ({ value: template.id, label: template.name })),
              ]}
            />
          </Field>

          <Field label={fa ? "نام قالب / نسخه چاپ" : language === "ar" ? "اسم القالب / نسخة الطباعة" : language === "tr" ? "Şablon Adı / Baskı Sürümü" : "Template name"}>
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="studio-input" />
          </Field>

          <Field label={fa ? "اندازه صفحه" : language === "ar" ? "حجم الصفحة" : language === "tr" ? "Sayfa Boyutu" : "Page size"}>
            <Select
              value={config.page_size}
              onChange={(value) => updateConfig({ ...config, page_size: value })}
              options={[
                { value: "A4", label: "A4" },
                { value: "A5", label: "A5" },
                { value: "THERMAL80", label: "Thermal 80" },
                { value: "THERMAL58", label: "Thermal 58" },
              ]}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={loadTemplates} className="studio-tool-button">
              <RefreshCw size={16} />
              {loadingTemplates ? "..." : fa ? "دریافت" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
            </button>
            <button onClick={() => setEditMode((v) => !v)} className="studio-tool-button">
              <Edit3 size={16} />
              {editMode
                ? (fa ? "ویرایش روشن" : language === "ar" ? "التعديل مفعّل" : language === "tr" ? "Düzenleme Açık" : "Edit on")
                : (fa ? "ویرایش خاموش" : language === "ar" ? "التعديل متوقف" : language === "tr" ? "Düzenleme Kapalı" : "Edit off")}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setZoom((z) => Math.max(0.45, z - 0.1))} className="studio-tool-button">
              <Maximize2 size={16} /> -
            </button>
            <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} className="studio-tool-button">
              <Maximize2 size={16} /> +
            </button>
          </div>

          <button onClick={() => setShowGrid((v) => !v)} className="w-full studio-tool-button">
            <Grid3X3 size={16} />
            {showGrid
              ? (fa ? "Grid روشن" : language === "ar" ? "الشبكة مفعّلة" : language === "tr" ? "Izgara Açık" : "Grid on")
              : (fa ? "Grid خاموش" : language === "ar" ? "الشبكة متوقفة" : language === "tr" ? "Izgara Kapalı" : "Grid off")}
          </button>
        </aside>

        <main
          className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 overflow-auto"
          onMouseMove={onCanvasMouseMove}
          onMouseUp={stopPointerActions}
          onMouseLeave={stopPointerActions}
        >
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[var(--erp-accent)] font-black">{fa ? "پیش‌نمایش قابل ویرایش" : language === "ar" ? "معاينة قابلة للتعديل" : language === "tr" ? "Düzenlenebilir Önizleme" : "Editable preview"}</div>
            <div className="text-[var(--erp-muted)] text-sm">{page.label} • {Math.round(zoom * 100)}%</div>
          </div>

          <Canvas page={page} zoom={zoom} showGrid={showGrid} config={config} selectedElementId={selectedElementId} editMode={editMode} onElementMouseDown={onElementMouseDown} onResizeMouseDown={onResizeMouseDown} renderElement={renderElement} dir={dir} />
        </main>

        <aside className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 space-y-4">
          <h2 className="text-[var(--erp-accent)] font-black flex items-center gap-2">
            <Settings2 size={20} />
            {fa ? "تنظیمات بخش" : language === "ar" ? "إعدادات العنصر" : language === "tr" ? "Seçili Öğe Ayarları" : "Selected element"}
          </h2>

          {selectedElement ? (
            <>
              <div className="font-black text-[var(--erp-text)]">{selectedElement.label || selectedElement.type}</div>

              <div className="grid grid-cols-2 gap-2">
                <NumberProp label="X" value={selectedElement.x} onChange={(v) => updateElement(selectedElement.id, { x: Number(v) })} />
                <NumberProp label="Y" value={selectedElement.y} onChange={(v) => updateElement(selectedElement.id, { y: Number(v) })} />
                <NumberProp label="W" value={selectedElement.w} onChange={(v) => updateElement(selectedElement.id, { w: Number(v) })} />
                <NumberProp label="H" value={selectedElement.h} onChange={(v) => updateElement(selectedElement.id, { h: Number(v) })} />
              </div>

              <Field label={fa ? "متن" : language === "ar" ? "النص" : language === "tr" ? "Metin" : "Text"}>
                <textarea value={selectedElement.text || ""} onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })} rows={4} className="studio-input" />
              </Field>

              <NumberProp label={fa ? "سایز فونت" : language === "ar" ? "حجم الخط" : language === "tr" ? "Yazı Boyutu" : "Font size"} value={selectedElement.fontSize} onChange={(v) => updateElement(selectedElement.id, { fontSize: Number(v) })} />
              <NumberProp label={fa ? "گردی گوشه" : language === "ar" ? "استدارة الحواف" : language === "tr" ? "Köşe Yarıçapı" : "Radius"} value={selectedElement.radius} onChange={(v) => updateElement(selectedElement.id, { radius: Number(v) })} />

              <ColorProp label={fa ? "رنگ متن" : language === "ar" ? "لون النص" : language === "tr" ? "Metin Rengi" : "Text color"} value={selectedElement.color} onChange={(v) => updateElement(selectedElement.id, { color: v })} />
              <ColorProp label={fa ? "پس‌زمینه" : language === "ar" ? "الخلفية" : language === "tr" ? "Arka Plan" : "Background"} value={selectedElement.bg} onChange={(v) => updateElement(selectedElement.id, { bg: v })} />
              <ColorProp label={fa ? "خط دور" : language === "ar" ? "الحدود" : language === "tr" ? "Kenarlık" : "Border"} value={selectedElement.border} onChange={(v) => updateElement(selectedElement.id, { border: v })} />

              <button onClick={duplicateElement} className="studio-tool-button w-full"><Copy size={16} /> {fa ? "کپی از بخش" : language === "ar" ? "نسخ العنصر" : language === "tr" ? "Öğeyi Çoğalt" : "Duplicate"}</button>
              <button onClick={deleteElement} className="px-4 py-3 rounded-2xl bg-red-500 text-white font-black flex justify-center gap-2 w-full"><Trash2 size={16} /> {fa ? "حذف بخش" : language === "ar" ? "حذف العنصر" : language === "tr" ? "Öğeyi Sil" : "Delete"}</button>
            </>
          ) : (
            <div className="text-[var(--erp-muted)]">{fa ? "یک بخش را انتخاب کن." : language === "ar" ? "اختر عنصرًا." : language === "tr" ? "Bir öğe seçin." : "Select an element."}</div>
          )}
        </aside>
      </div>

      <div className="print-only">
        <Canvas page={page} zoom={1} showGrid={false} config={config} selectedElementId={null} editMode={false} onElementMouseDown={() => {}} onResizeMouseDown={() => {}} renderElement={renderElement} dir={dir} />
      </div>

      <style>{`
        .studio-input {
          width: 100%;
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border: 1px solid var(--erp-border);
          border-radius: 16px;
          padding: 12px;
          outline: none;
        }
        .studio-tool-button {
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border-radius: 16px;
          padding: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .studio-tool-button:hover { background: var(--erp-glow); }
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

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="text-[var(--erp-accent)] text-sm font-bold block">{label}</label>
      {children}
    </div>
  );
}

function NumberProp({ label, value, onChange }) {
  const { language } = useLanguage();
  const display = value ?? 0;
  return (
    <Field label={label}>
      <input
        type="text"
        inputMode="numeric"
        value={language === "fa" ? toPersianDigits(display) : display}
        onChange={(e) => onChange(cleanNumberInput(e.target.value))}
        className="studio-input"
      />
    </Field>
  );
}

function ColorProp({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} className="w-full h-11 bg-[var(--erp-panel-solid)] rounded-2xl p-1" />
    </Field>
  );
}
