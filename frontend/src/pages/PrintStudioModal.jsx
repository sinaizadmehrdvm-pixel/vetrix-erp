import { useEffect, useMemo, useState } from "react";
import {
  X,
  Printer,
  FileText,
  RefreshCw,
  Wand2,
  ExternalLink,
  Settings,
  Eye,
} from "lucide-react";
import { API_URL, getPdfTemplates } from "../services/api";
import { useLanguage } from "../localization/useLanguage";
import Modal from "../components/ui/Modal";

const PAGE_SIZES = [
  { value: "A4", fa: "A4 رسمی", ar: "A4 رسمي", tr: "A4 resmi", en: "A4 official" },
  { value: "A5", fa: "A5 جمع‌وجور", ar: "A5 مدمج", tr: "A5 kompakt", en: "A5 compact" },
  { value: "THERMAL80", fa: "فیش ۸۰ میلی‌متری", ar: "إيصال 80 مم", tr: "80mm termal fiş", en: "Thermal 80mm" },
  { value: "THERMAL58", fa: "فیش ۵۸ میلی‌متری", ar: "إيصال 58 مم", tr: "58mm termal fiş", en: "Thermal 58mm" },
];

const PDF_TEMPLATES = [
  { value: "official", fa: "رسمی", ar: "رسمي", tr: "Resmi", en: "Official" },
  { value: "premium", fa: "پرمیوم", ar: "متميز", tr: "Premium", en: "Premium" },
  { value: "compact", fa: "فشرده", ar: "مدمج", tr: "Kompakt", en: "Compact" },
  { value: "thermal", fa: "فیش فروشگاهی", ar: "إيصال المتجر", tr: "Mağaza fişi", en: "Thermal" },
];

function getInvoiceId(invoice) {
  return invoice?.id || invoice?.invoice_id || invoice;
}

function buildQuery(params) {
  const q = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      q.set(key, String(value));
    }
  });

  return q.toString();
}

function normalizeTemplate(template) {
  const rawConfig = template?.config && typeof template.config === "object" ? template.config : {};
  const elements = Array.isArray(rawConfig.elements) ? rawConfig.elements : [];

  return {
    ...template,
    id: template?.id,
    name: template?.name || "قالب بدون نام",
    page_size: template?.page_size || rawConfig.page_size || "A4",
    config: {
      ...rawConfig,
      page_size: rawConfig.page_size || template?.page_size || "A4",
      theme: rawConfig.theme || { primary: "#0f172a", accent: "#06b6d4" },
      elements,
    },
  };
}

function normalizeTemplateList(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.templates)
        ? data.templates
        : [];

  return list.map(normalizeTemplate).filter((item) => item?.id !== undefined && item?.id !== null);
}

export default function PrintStudioModal({ invoice, onClose }) {
  const { language, dir } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const invoiceId = getInvoiceId(invoice);

  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [pageSize, setPageSize] = useState("A4");
  const [orientation, setOrientation] = useState("portrait");
  const [baseTemplate, setBaseTemplate] = useState("official");
  const [editMode, setEditMode] = useState(true);
  const [previewKey, setPreviewKey] = useState(1);
  const [message, setMessage] = useState("");

  async function loadTemplates() {
    try {
      setLoadingTemplates(true);
      setMessage("");

      const data = await getPdfTemplates();
      const list = normalizeTemplateList(data);

      setTemplates(list);

      if (list.length > 0) {
        const stillExists = list.some((item) => String(item.id) === String(selectedTemplateId));
        const nextTemplateId = stillExists ? selectedTemplateId : String(list[0].id);
        const nextTemplate = list.find((item) => String(item.id) === String(nextTemplateId));

        setSelectedTemplateId(nextTemplateId);

        if (nextTemplate?.page_size) {
          setPageSize(nextTemplate.page_size);
        }
      } else {
        setSelectedTemplateId("");
        setMessage(tr("هنوز قالبی ذخیره نشده است.", "لا توجد قوالب محفوظة بعد.", "Henüz kayıtlı şablon yok.", "No saved templates yet."));
      }
    } catch (error) {
      console.error("Print Studio templates error:", error);
      setTemplates([]);
      setSelectedTemplateId("");
      setMessage(tr("خطا در دریافت قالب‌ها", "خطأ في تحميل القوالب", "Şablonlar yüklenirken hata oluştu", "Error loading templates"));
    } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void loadTemplates(); }, 0);
    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTemplate = useMemo(() => {
    return templates.find((x) => String(x.id) === String(selectedTemplateId));
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (selectedTemplate?.page_size) {
      const timer = setTimeout(() => setPageSize(selectedTemplate.page_size), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [selectedTemplate]);

  const printUrl = useMemo(() => {
    const qs = buildQuery({
      page_size: pageSize,
      orientation,
      template: baseTemplate,
      template_id: selectedTemplateId,
      edit: editMode ? 1 : 0,
      studio: 1,
      preview_key: previewKey,
    });

    return `${API_URL}/print/invoice/${invoiceId}?${qs}`;
  }, [invoiceId, pageSize, orientation, baseTemplate, selectedTemplateId, editMode, previewKey]);

  const reportPdfUrl = useMemo(() => {
    const qs = buildQuery({
      page_size: pageSize,
      orientation,
      template: baseTemplate,
      template_id: selectedTemplateId,
    });

    return `${API_URL}/export/invoices-pdf?${qs}`;
  }, [pageSize, orientation, baseTemplate, selectedTemplateId]);

  function refreshPreview() {
    setPreviewKey((x) => x + 1);
  }

  function openPrint() {
    window.open(printUrl, "_blank", "noopener,noreferrer");
  }

  function openDesigner() {
    const qs = buildQuery({
      template_id: selectedTemplateId,
      invoice_id: invoiceId,
      from: "print-studio",
    });

    window.open(`/invoice-designer?${qs}`, "_blank", "noopener,noreferrer");
  }

  function openReportPdf() {
    window.open(reportPdfUrl, "_blank", "noopener,noreferrer");
  }

  if (!invoiceId) {
    return null;
  }

  return (
    <Modal open={Boolean(invoiceId)} onClose={onClose} maxWidthClassName="max-w-7xl" className="overflow-hidden" labelledBy="print-studio-title">
      <div dir={dir}>
        <div className="bg-gradient-to-l from-cyan-500/20 via-slate-900 to-blue-900/30 border-b border-[var(--erp-border)] p-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 id="print-studio-title" className="text-3xl font-black text-[var(--erp-accent)] flex items-center gap-2">
              <Printer /> Vetrix Print Studio
            </h2>
            <p className="text-[var(--erp-muted)] mt-2">
              {tr(
                `چاپ و پیش‌نمایش فاکتور شماره ${invoiceId} با انتخاب قالب طراحی‌شده`,
                `طباعة ومعاينة الفاتورة رقم ${invoiceId} باستخدام قالب مصمم`,
                `${invoiceId} numaralı faturayı kayıtlı şablonlarla önizleyin ve yazdırın`,
                `Preview and print invoice #${invoiceId} with saved templates`
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-red-500 text-white flex items-center justify-center"
          >
            <X />
          </button>
        </div>

        {message && (
          <div className="mx-5 mt-5 rounded-2xl p-4 bg-amber-500/10 border border-amber-400/20 text-amber-200 font-bold">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5 p-5">
          <div className="space-y-5">
            <Panel title={tr("انتخاب قالب چاپ", "اختيار قالب الطباعة", "Yazdırma şablonu seçimi", "Print template")} icon={<FileText size={19} />}>
              <Field label={tr("قالب طراحی‌شده", "قالب مصمم", "Kayıtlı tasarım şablonu", "Saved designer template")}>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    setSelectedTemplateId(e.target.value);
                    setPreviewKey((x) => x + 1);
                  }}
                  className="print-input"
                >
                  {templates.length === 0 && (
                    <option value="">
                      {tr("قالبی ذخیره نشده", "لا يوجد قالب محفوظ", "Kayıtlı şablon yok", "No saved template")}
                    </option>
                  )}

                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {tpl.page_size ? `- ${tpl.page_size}` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={loadTemplates}
                  disabled={loadingTemplates}
                  className="btn-dark"
                >
                  <RefreshCw size={16} />
                  {loadingTemplates ? tr("دریافت...", "جارٍ التحميل...", "Yükleniyor...", "Loading...") : tr("بروزرسانی", "تحديث", "Yenile", "Refresh")}
                </button>

                <button type="button" onClick={openDesigner} className="btn-cyan">
                  <Wand2 size={16} />
                  {tr("طراحی قالب", "تصميم القالب", "Şablon tasarla", "Designer")}
                </button>
              </div>

              {selectedTemplate && (
                <div className="rounded-2xl bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] p-3 text-xs text-[var(--erp-muted)] leading-7">
                  <div>
                    {tr("نام قالب", "اسم القالب", "Şablon adı", "Template")}: <b>{selectedTemplate.name}</b>
                  </div>
                  <div>
                    {tr("اندازه", "الحجم", "Boyut", "Size")}: <b>{selectedTemplate.page_size || "A4"}</b>
                  </div>
                  <div>
                    {tr("تعداد اجزاء", "عدد العناصر", "Öğe sayısı", "Elements")}:{" "}
                    <b>{selectedTemplate.config?.elements?.length || 0}</b>
                  </div>
                </div>
              )}
            </Panel>

            <Panel title={tr("تنظیمات چاپ", "إعدادات الطباعة", "Yazdırma ayarları", "Print settings")} icon={<Settings size={19} />}>
              <Field label={tr("اندازه کاغذ", "حجم الورق", "Kağıt boyutu", "Page size")}>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(e.target.value);
                    setPreviewKey((x) => x + 1);
                  }}
                  className="print-input"
                >
                  {PAGE_SIZES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {tr(x.fa, x.ar, x.tr, x.en)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={tr("قالب پایه PDF", "قالب PDF الأساسي", "Temel PDF şablonu", "Base PDF style")}>
                <select
                  value={baseTemplate}
                  onChange={(e) => {
                    setBaseTemplate(e.target.value);
                    setPreviewKey((x) => x + 1);
                  }}
                  className="print-input"
                >
                  {PDF_TEMPLATES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {tr(x.fa, x.ar, x.tr, x.en)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={tr("جهت صفحه", "اتجاه الصفحة", "Sayfa yönü", "Orientation")}>
                <select
                  value={orientation}
                  onChange={(e) => {
                    setOrientation(e.target.value);
                    setPreviewKey((x) => x + 1);
                  }}
                  className="print-input"
                >
                  <option value="portrait">{tr("عمودی", "عمودي", "Dikey", "Portrait")}</option>
                  <option value="landscape">{tr("افقی", "أفقي", "Yatay", "Landscape")}</option>
                </select>
              </Field>

              <label className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-2xl p-3 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-[var(--erp-text)] font-bold">
                  {tr("ویرایش موقت قبل چاپ", "تعديل مؤقت قبل الطباعة", "Yazdırmadan önce geçici düzenleme", "Temporary edit before print")}
                </span>
                <input
                  type="checkbox"
                  checked={editMode}
                  onChange={(e) => {
                    setEditMode(e.target.checked);
                    setPreviewKey((x) => x + 1);
                  }}
                />
              </label>
            </Panel>

            <Panel title={tr("عملیات", "الإجراءات", "İşlemler", "Actions")} icon={<Eye size={19} />}>
              <button type="button" onClick={refreshPreview} className="btn-dark w-full">
                <RefreshCw size={17} />
                {tr("تازه‌سازی پیش‌نمایش", "تحديث المعاينة", "Önizlemeyi yenile", "Refresh preview")}
              </button>

              <button type="button" onClick={openPrint} className="btn-cyan w-full">
                <Printer size={17} />
                {tr("باز کردن چاپ فاکتور", "فتح طباعة الفاتورة", "Fatura yazdırmayı aç", "Open invoice print")}
              </button>

              <button type="button" onClick={openReportPdf} className="btn-dark w-full">
                <ExternalLink size={17} />
                {tr("دانلود گزارش PDF با همین تنظیمات", "تنزيل تقرير PDF بنفس الإعدادات", "Aynı ayarlarla PDF raporu indir", "Download report PDF")}
              </button>
            </Panel>
          </div>

          <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl overflow-hidden min-h-[780px]">
            <div className="p-4 border-b border-[var(--erp-border)] flex items-center justify-between gap-3 flex-wrap">
              <div className="font-black text-[var(--erp-accent)]">
                {tr("پیش‌نمایش زنده چاپ", "معاينة الطباعة المباشرة", "Canlı yazdırma önizlemesi", "Live print preview")}
              </div>

              <div className="text-xs text-[var(--erp-muted)]">
                {tr(
                  "اگر قالب را در Designer تغییر دادی، بروزرسانی را بزن.",
                  "إذا قمت بتعديل القالب في المصمم، اضغط على تحديث.",
                  "Şablonu Designer'da değiştirdiyseniz önizlemeyi yenileyin.",
                  "After editing a template in Designer, refresh the preview."
                )}
              </div>
            </div>

            <iframe
              key={previewKey}
              title="Vetrix Print Preview"
              src={printUrl}
              className="w-full h-[780px] bg-white"
            />
          </div>
        </div>
      </div>

      <style>{`
        .print-input {
          width: 100%;
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border: 1px solid var(--erp-border);
          border-radius: 16px;
          padding: 12px;
          outline: none;
        }
        .btn-dark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 14px;
          border-radius: 16px;
          background: var(--erp-panel-solid);
          color: var(--erp-accent);
          font-weight: 900;
          border: 1px solid var(--erp-border);
        }
        .btn-cyan {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 14px;
          border-radius: 16px;
          background: #22d3ee;
          color: #082f49;
          font-weight: 900;
        }
      `}</style>
    </Modal>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 space-y-4">
      <h3 className="text-[var(--erp-accent)] font-black flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-[var(--erp-accent)] font-bold block">{label}</label>
      {children}
    </div>
  );
}
