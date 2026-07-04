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
import { useLanguage } from "../localization/LanguageContext";

const PAGE_SIZES = [
  { value: "A4", fa: "A4 رسمی", en: "A4 official" },
  { value: "A5", fa: "A5 جمع‌وجور", en: "A5 compact" },
  { value: "THERMAL80", fa: "فیش ۸۰ میلی‌متری", en: "Thermal 80mm" },
  { value: "THERMAL58", fa: "فیش ۵۸ میلی‌متری", en: "Thermal 58mm" },
];

const PDF_TEMPLATES = [
  { value: "official", fa: "رسمی", en: "Official" },
  { value: "premium", fa: "پرمیوم", en: "Premium" },
  { value: "compact", fa: "فشرده", en: "Compact" },
  { value: "thermal", fa: "فیش فروشگاهی", en: "Thermal" },
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
  const fa = language === "fa";
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
        setMessage(fa ? "هنوز قالبی ذخیره نشده است." : "No saved templates yet.");
      }
    } catch (error) {
      console.error("Print Studio templates error:", error);
      setTemplates([]);
      setSelectedTemplateId("");
      setMessage(fa ? "خطا در دریافت قالب‌ها" : "Error loading templates");
    } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTemplate = useMemo(() => {
    return templates.find((x) => String(x.id) === String(selectedTemplateId));
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (selectedTemplate?.page_size) {
      setPageSize(selectedTemplate.page_size);
    }
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
    <div
      dir={dir}
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm p-3 md:p-6 overflow-auto"
    >
      <div className="max-w-7xl mx-auto bg-slate-950 border border-cyan-500/20 rounded-[2rem] shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-l from-cyan-500/20 via-slate-900 to-blue-900/30 border-b border-cyan-500/20 p-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl font-black text-cyan-300 flex items-center gap-2">
              <Printer /> Vetrix Print Studio
            </h2>
            <p className="text-slate-400 mt-2">
              {fa
                ? `چاپ و پیش‌نمایش فاکتور شماره ${invoiceId} با انتخاب قالب طراحی‌شده`
                : `Preview and print invoice #${invoiceId} with saved templates`}
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
            <Panel title={fa ? "انتخاب قالب چاپ" : "Print template"} icon={<FileText size={19} />}>
              <Field label={fa ? "قالب طراحی‌شده" : "Saved designer template"}>
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
                      {fa ? "قالبی ذخیره نشده" : "No saved template"}
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
                  {loadingTemplates ? (fa ? "دریافت..." : "Loading...") : fa ? "بروزرسانی" : "Refresh"}
                </button>

                <button type="button" onClick={openDesigner} className="btn-cyan">
                  <Wand2 size={16} />
                  {fa ? "طراحی قالب" : "Designer"}
                </button>
              </div>

              {selectedTemplate && (
                <div className="rounded-2xl bg-slate-900/80 border border-cyan-500/10 p-3 text-xs text-slate-300 leading-7">
                  <div>
                    {fa ? "نام قالب" : "Template"}: <b>{selectedTemplate.name}</b>
                  </div>
                  <div>
                    {fa ? "اندازه" : "Size"}: <b>{selectedTemplate.page_size || "A4"}</b>
                  </div>
                  <div>
                    {fa ? "تعداد اجزاء" : "Elements"}:{" "}
                    <b>{selectedTemplate.config?.elements?.length || 0}</b>
                  </div>
                </div>
              )}
            </Panel>

            <Panel title={fa ? "تنظیمات چاپ" : "Print settings"} icon={<Settings size={19} />}>
              <Field label={fa ? "اندازه کاغذ" : "Page size"}>
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
                      {fa ? x.fa : x.en}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={fa ? "قالب پایه PDF" : "Base PDF style"}>
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
                      {fa ? x.fa : x.en}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={fa ? "جهت صفحه" : "Orientation"}>
                <select
                  value={orientation}
                  onChange={(e) => {
                    setOrientation(e.target.value);
                    setPreviewKey((x) => x + 1);
                  }}
                  className="print-input"
                >
                  <option value="portrait">{fa ? "عمودی" : "Portrait"}</option>
                  <option value="landscape">{fa ? "افقی" : "Landscape"}</option>
                </select>
              </Field>

              <label className="bg-slate-900/80 border border-cyan-500/10 rounded-2xl p-3 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-slate-200 font-bold">
                  {fa ? "ویرایش موقت قبل چاپ" : "Temporary edit before print"}
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

            <Panel title={fa ? "عملیات" : "Actions"} icon={<Eye size={19} />}>
              <button type="button" onClick={refreshPreview} className="btn-dark w-full">
                <RefreshCw size={17} />
                {fa ? "تازه‌سازی پیش‌نمایش" : "Refresh preview"}
              </button>

              <button type="button" onClick={openPrint} className="btn-cyan w-full">
                <Printer size={17} />
                {fa ? "باز کردن چاپ فاکتور" : "Open invoice print"}
              </button>

              <button type="button" onClick={openReportPdf} className="btn-dark w-full">
                <ExternalLink size={17} />
                {fa ? "دانلود گزارش PDF با همین تنظیمات" : "Download report PDF"}
              </button>
            </Panel>
          </div>

          <div className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl overflow-hidden min-h-[780px]">
            <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-black text-cyan-300">
                {fa ? "پیش‌نمایش زنده چاپ" : "Live print preview"}
              </div>

              <div className="text-xs text-slate-400">
                {fa
                  ? "اگر قالب را در Designer تغییر دادی، بروزرسانی را بزن."
                  : "After editing a template in Designer, refresh the preview."}
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
          background: #1e293b;
          color: white;
          border: 1px solid rgba(34,211,238,.16);
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
          background: #1e293b;
          color: #cffafe;
          font-weight: 900;
          border: 1px solid rgba(34,211,238,.16);
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
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 space-y-4">
      <h3 className="text-cyan-300 font-black flex items-center gap-2">
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
      <label className="text-sm text-cyan-200 font-bold block">{label}</label>
      {children}
    </div>
  );
}
