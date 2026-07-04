import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Maximize2,
  Move,
  Printer,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

import { useLanguage } from "../localization/LanguageContext";
import { getCache } from "../storage/db";
import {
  API_URL,
  getPdfTemplates,
  savePdfTemplate,
} from "../services/api";

const INVOICES_CACHE_KEY = "invoices";
const GRID = 10;

const PAGE_SIZES = {
  A4: { w: 794, h: 1123, label: "A4" },
  A5: { w: 559, h: 794, label: "A5" },
  THERMAL80: { w: 302, h: 980, label: "Thermal 80" },
  THERMAL58: { w: 220, h: 980, label: "Thermal 58" },
};

const defaultPrintConfig = {
  page_size: "A4",
  theme: { primary: "#0f172a", accent: "#06b6d4" },
  elements: [
    { id: "title", type: "text", label: "عنوان فاکتور", text: "{{invoice_title}}", x: 540, y: 45, w: 190, h: 45, fontSize: 24, color: "#0f172a", bg: "#ffffff", border: "#ffffff", radius: 10, align: "center", bold: true },
    { id: "logo", type: "logo", label: "لوگو", text: "LOGO", x: 55, y: 40, w: 120, h: 65, fontSize: 18, color: "#0891b2", bg: "#ecfeff", border: "#bae6fd", radius: 16, align: "center", bold: true },
    { id: "company", type: "text", label: "نام شرکت", text: "Vetrix ERP\nسیستم حسابداری و مدیریت فروش", x: 190, y: 45, w: 300, h: 75, fontSize: 18, color: "#0891b2", bg: "#ffffff", border: "#ffffff", radius: 8, align: "center", bold: true },
    { id: "invoiceInfo", type: "box", label: "اطلاعات فاکتور", text: "شماره: {{invoice_id}}\nتاریخ: {{invoice_date}}\nوضعیت: {{payment_status}}", x: 520, y: 120, w: 220, h: 90, fontSize: 13, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
    { id: "customer", type: "box", label: "طرف حساب", text: "طرف حساب\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}", x: 55, y: 145, w: 400, h: 95, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 14, align: "right", bold: false },
    { id: "table", type: "table", label: "جدول اقلام", text: "جدول اقلام فاکتور", x: 55, y: 275, w: 685, h: 265, fontSize: 13, color: "#0f172a", bg: "#ffffff", border: "#94a3b8", radius: 10, align: "center", bold: true },
    { id: "totals", type: "totals", label: "جمع فاکتور", text: "جمع جزء: {{subtotal}}\nتخفیف: {{discount}}\nمالیات: {{tax}}\nحمل: {{shipping}}\nمبلغ نهایی: {{total}}", x: 55, y: 570, w: 300, h: 160, fontSize: 14, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
    { id: "qr", type: "qr", label: "QR Code", text: "QR", x: 590, y: 600, w: 105, h: 105, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
    { id: "note", type: "box", label: "توضیحات", text: "توضیحات\n{{invoice_note}}", x: 55, y: 760, w: 685, h: 75, fontSize: 13, color: "#334155", bg: "#ffffff", border: "#e2e8f0", radius: 12, align: "right", bold: false },
    { id: "signature", type: "box", label: "امضا", text: "امضاء فروشنده / حسابدار", x: 55, y: 900, w: 250, h: 85, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
    { id: "stamp", type: "box", label: "مهر", text: "مهر شرکت / امضاء طرف حساب", x: 490, y: 900, w: 250, h: 85, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
    { id: "footer", type: "text", label: "متن پایین", text: "با تشکر از اعتماد شما", x: 250, y: 1035, w: 300, h: 35, fontSize: 13, color: "#334155", bg: "transparent", border: "transparent", radius: 0, align: "center", bold: true },
  ],
};


function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function snap(value) {
  return Math.round(Number(value || 0) / GRID) * GRID;
}

function toNumber(value) {
  const cleaned = String(value ?? "0")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}


function asPlainText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value);
    return text === "[object Object]" ? fallback : text;
  }
  if (typeof value === "object") {
    return (
      value.title_fa ||
      value.title ||
      value.label_fa ||
      value.label ||
      value.name_fa ||
      value.name ||
      value.text_fa ||
      value.text ||
      fallback
    );
  }
  return fallback;
}

function normalizeElement(element, index = 0) {
  const fallbackLabel = element?.type ? String(element.type) : `بخش ${index + 1}`;
  return {
    ...element,
    id: element?.id || `${element?.type || "element"}_${index}_${Date.now()}`,
    label: asPlainText(element?.label, fallbackLabel),
    text: asPlainText(element?.text, ""),
    type: asPlainText(element?.type, "text"),
    x: toNumber(element?.x),
    y: toNumber(element?.y),
    w: toNumber(element?.w || 120),
    h: toNumber(element?.h || 40),
    fontSize: toNumber(element?.fontSize || 13),
    radius: toNumber(element?.radius || 0),
    color: asPlainText(element?.color, "#0f172a"),
    bg: asPlainText(element?.bg, "#ffffff"),
    border: asPlainText(element?.border, "transparent"),
    align: asPlainText(element?.align, "center"),
    bold: !!element?.bold,
  };
}

function resolveTemplateName(tpl, index = 0) {
  const raw = tpl?.name ?? tpl?.title ?? tpl?.config?.name ?? tpl?.config?.title;
  return asPlainText(raw, `قالب ${index + 1}`);
}

function getInvoiceItems(invoice) {
  if (Array.isArray(invoice?.items)) return invoice.items;
  if (Array.isArray(invoice?.invoice_items)) return invoice.invoice_items;
  if (Array.isArray(invoice?.details)) return invoice.details;
  return [];
}

function getInvoiceTitle(invoice, fa) {
  const type = invoice?.invoice_type || invoice?.type || "sale";
  const labelsFa = {
    sale: "فاکتور فروش",
    buy: "فاکتور خرید",
    proforma: "پیش‌فاکتور",
    return_sale: "مرجوعی فروش",
    return_buy: "مرجوعی خرید",
  };
  const labelsEn = {
    sale: "Sales Invoice",
    buy: "Purchase Invoice",
    proforma: "Proforma Invoice",
    return_sale: "Sales Return",
    return_buy: "Purchase Return",
  };
  return invoice?.invoice_type_label || (fa ? labelsFa[type] : labelsEn[type]) || (fa ? "فاکتور" : "Invoice");
}

function paymentLabel(status, fa) {
  const key = String(status || "unpaid").toLowerCase();
  if (!fa) return key || "-";
  return {
    paid: "تسویه شده",
    unpaid: "تسویه نشده",
    partial: "تسویه ناقص",
    draft: "پیش‌نویس",
  }[key] || key || "-";
}

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : defaultPrintConfig;
  return {
    ...defaultPrintConfig,
    ...source,
    theme: { ...defaultPrintConfig.theme, ...(source.theme || {}) },
    elements: (Array.isArray(source.elements) && source.elements.length ? source.elements : defaultPrintConfig.elements).map(normalizeElement),
  };
}


function getBackendBase() {
  const raw = String(API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  return raw.replace(/\/api$/i, "");
}

function normalizeTemplateList(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.templates)
    ? payload.templates
    : [];

  return list
    .filter(Boolean)
    .map((tpl, index) => {
      const normalizedConfig = normalizeConfig(tpl.config || tpl.template || tpl);
      return {
        id: tpl.id ?? tpl.template_id ?? resolveTemplateName(tpl, index),
        name: resolveTemplateName(tpl, index),
        page_size: tpl.page_size || normalizedConfig.page_size || "A4",
        config: normalizedConfig,
        raw: tpl,
      };
    })
    .filter((tpl) => tpl.id !== undefined && tpl.id !== null);
}

async function fetchJsonSafe(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} - ${url}`);
  return await res.json();
}

async function loadPdfTemplatesUnified() {
  const base = getBackendBase();
  const urls = [
    `${base}/designer/templates`,
    `${base}/api/designer/templates`,
  ];

  try {
    const data = await getPdfTemplates();
    const normalized = normalizeTemplateList(data);
    if (normalized.length) return normalized;
  } catch (err) {
    console.warn("getPdfTemplates failed, trying direct endpoints", err);
  }

  for (const url of urls) {
    try {
      const data = await fetchJsonSafe(url);
      const normalized = normalizeTemplateList(data);
      if (normalized.length) return normalized;
    } catch (err) {
      console.warn("template endpoint failed", url, err);
    }
  }

  return [];
}

async function savePdfTemplateUnified(payload) {
  const base = getBackendBase();
  const body = {
    name: payload.name,
    page_size: payload.page_size || payload.config?.page_size || "A4",
    config: normalizeConfig(payload.config),
  };

  try {
    return await savePdfTemplate(body);
  } catch (err) {
    console.warn("savePdfTemplate failed, trying direct endpoint", err);
  }

  const urls = [
    `${base}/designer/template`,
    `${base}/designer/templates`,
    `${base}/api/designer/template`,
    `${base}/api/designer/templates`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      return await fetchJsonSafe(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = err;
      console.warn("save template endpoint failed", url, err);
    }
  }
  throw lastError || new Error("Template save failed");
}

export default function InvoicePrint({ invoice: propInvoice = null }) {
  const { id } = useParams();
  const { language, n, money, date, dir } = useLanguage();
  const fa = language === "fa";

  const [cachedInvoice, setCachedInvoice] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("default");
  const [templateName, setTemplateName] = useState(fa ? "قالب چاپ فاکتور" : "Invoice print template");
  const [config, setConfig] = useState(defaultPrintConfig);
  const [selectedElementId, setSelectedElementId] = useState("title");
  const [editMode, setEditMode] = useState(true);
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [zoom, setZoom] = useState(0.85);
  const [showGrid, setShowGrid] = useState(true);
  const [message, setMessage] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const canvasRef = useRef(null);

  const invoice = propInvoice || cachedInvoice;
  const items = useMemo(() => getInvoiceItems(invoice), [invoice]);
  const page = PAGE_SIZES[config.page_size] || PAGE_SIZES.A4;
  const selectedElement = config.elements.find((el) => el.id === selectedElementId) || null;

  const totals = useMemo(() => {
    const subtotal =
      invoice?.subtotal ??
      items.reduce((sum, item) => {
        return sum + toNumber(item.quantity) * toNumber(item.unit_price ?? item.price);
      }, 0);

    const discount = toNumber(invoice?.discount ?? invoice?.discount_amount);
    const tax = toNumber(invoice?.tax ?? invoice?.tax_amount);
    const shipping = toNumber(invoice?.shipping_cost);
    const total = invoice?.total_amount ?? invoice?.total ?? subtotal - discount + tax + shipping;
    const settled = toNumber(invoice?.settled_amount ?? invoice?.paid_amount ?? invoice?.received_amount);
    const remaining = Math.max(toNumber(invoice?.remaining_amount ?? total - settled), 0);

    return { subtotal, discount, tax, shipping, total, settled, remaining };
  }, [invoice, items]);

  useEffect(() => {
    async function loadCachedInvoice() {
      if (propInvoice || !id) return;

      const cached = await getCache(INVOICES_CACHE_KEY);
      if (Array.isArray(cached)) {
        const found = cached.find((x) => String(x.id) === String(id));
        setCachedInvoice(found || null);
      }
    }

    loadCachedInvoice();
  }, [id, propInvoice]);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function refreshOnFocus() {
      loadTemplates();
    }
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshOnFocus();
    });
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTemplates() {
    try {
      setLoadingTemplates(true);
      const normalized = await loadPdfTemplatesUnified();
      setTemplates(normalized);
      if (!normalized.length) {
        setMessage(
          fa
            ? "قالبی از بک‌اند دریافت نشد. آدرس /designer/templates را بررسی کن."
            : "No template was received from backend. Check /designer/templates."
        );
      }
    } catch (err) {
      console.error("Print templates loading error", err);
      setTemplates([]);
      setMessage(fa ? "خطا در دریافت قالب‌های چاپ." : "Template loading error.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  function updateConfig(nextConfig) {
    setConfig(normalizeConfig(nextConfig));
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
      setTemplateName(fa ? "قالب چاپ فاکتور" : "Invoice print template");
      updateConfig(defaultPrintConfig);
      setSelectedElementId("title");
      return;
    }

    const template = templates.find((tpl) => String(tpl.id) === String(templateId));
    if (!template) {
      setMessage(fa ? "قالب انتخاب‌شده پیدا نشد. دوباره دریافت را بزن." : "Selected template was not found. Refresh templates.");
      return;
    }

    const normalizedConfig = normalizeConfig(template.config);
    setTemplateName(asPlainText(template.name, fa ? "قالب چاپ" : "Print template"));
    updateConfig(normalizedConfig);
    setSelectedElementId((normalizedConfig.elements || [])[0]?.id || "title");
    setMessage(fa ? "قالب انتخاب شد و در پیش‌نمایش اعمال شد." : "Template loaded in preview.");
  }

  async function saveAsTemplate() {
    const suffix = invoice?.id ? ` #${invoice.id}` : "";
    const newName = window.prompt(
      fa ? "نام قالب جدید را وارد کن:" : "Enter new template name:",
      `${templateName}${suffix}`
    );

    if (!newName) return;

    await savePdfTemplateUnified({
      name: newName,
      page_size: config.page_size,
      config: normalizeConfig(config),
    });

    setTemplateName(newName);
    setMessage(fa ? "قالب جدید ذخیره شد و لیست قالب‌ها دوباره دریافت شد." : "New template saved and template list refreshed.");
    await loadTemplates();
  }

  function duplicateElement() {
    if (!selectedElement) return;

    const copy = {
      ...selectedElement,
      id: `${selectedElement.id}_copy_${Date.now()}`,
      label: `${asPlainText(selectedElement.label, selectedElement.type)} کپی`,
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

  function bringToFront() {
    if (!selectedElement) return;
    setConfig((prev) => ({
      ...prev,
      elements: [...prev.elements.filter((el) => el.id !== selectedElement.id), selectedElement],
    }));
  }

  function sendToBack() {
    if (!selectedElement) return;
    setConfig((prev) => ({
      ...prev,
      elements: [selectedElement, ...prev.elements.filter((el) => el.id !== selectedElement.id)],
    }));
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

  function handlePrint() {
    setTimeout(() => window.print(), 100);
  }

  function openBackendPrint() {
    const query = new URLSearchParams({
      page_size: config.page_size || "A4",
      edit: "1",
    });

    if (selectedTemplateId && selectedTemplateId !== "default") {
      query.set("template_id", selectedTemplateId);
    }

    window.open(`${API_URL}/print/invoice/${invoice.id}?${query.toString()}`, "_blank", "noreferrer");
  }

  function replaceTokens(text) {
    const customerName = invoice?.customerName || invoice?.customer_name || invoice?.customer?.name || "-";
    const customerPhone = invoice?.customer?.phone || invoice?.customer_phone || invoice?.phone || "ثبت نشده";
    const customerAddress = invoice?.customer?.address || invoice?.customer_address || invoice?.address || "ثبت نشده";
    const invoiceDate = date(invoice?.created_at || new Date());
    const invoiceTitle = getInvoiceTitle(invoice, fa);
    const status = paymentLabel(invoice?.payment_status || invoice?.status, fa);

    const tokens = {
      "{{invoice_title}}": invoiceTitle,
      "{{invoice_id}}": `#${n(invoice?.id || "")}`,
      "{{invoice_date}}": invoiceDate,
      "{{payment_status}}": status,
      "{{customer_name}}": customerName,
      "{{customer_phone}}": customerPhone,
      "{{customer_address}}": customerAddress,
      "{{subtotal}}": money(totals.subtotal),
      "{{discount}}": money(totals.discount),
      "{{tax}}": money(totals.tax),
      "{{shipping}}": money(totals.shipping),
      "{{total}}": money(totals.total),
      "{{settled}}": money(totals.settled),
      "{{remaining}}": money(totals.remaining),
      "{{invoice_note}}": invoice?.invoice_note || invoice?.note || "-",
    };

    return String(text || "").replace(/\{\{[^}]+\}\}/g, (match) => tokens[match] ?? match);
  }

  function renderElement(element) {
    if (element.type === "table") {
      return <InvoiceItemsTable items={items} fa={fa} n={n} money={money} />;
    }

    if (element.type === "totals") {
      return <InvoiceTotals totals={totals} fa={fa} money={money} />;
    }

    if (element.type === "qr") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-700">
          <div className="w-14 h-14 border-4 border-slate-800 grid grid-cols-3 grid-rows-3 gap-1 p-1 bg-white">
            <span className="bg-slate-900" />
            <span />
            <span className="bg-slate-900" />
            <span />
            <span className="bg-slate-900" />
            <span />
            <span className="bg-slate-900" />
            <span />
            <span className="bg-slate-900" />
          </div>
          <small>QR #{n(invoice?.id || "")}</small>
        </div>
      );
    }

    if (element.type === "logo") {
      return (
        <div className="w-full h-full flex items-center justify-center text-cyan-700 font-black">
          {replaceTokens(asPlainText(element.text, "LOGO"))}
        </div>
      );
    }

    return (
      <div className="whitespace-pre-line leading-relaxed w-full">
        {replaceTokens(asPlainText(element.text, ""))}
      </div>
    );
  }

  if (!invoice) {
    return (
      <section className="p-6 text-white bg-slate-950 min-h-screen">
        <Link to="/invoices" className="text-cyan-300 font-bold">
          {fa ? "بازگشت به فاکتورها" : "Back to invoices"}
        </Link>
        <div className="mt-6 text-slate-300">
          {fa ? "فاکتور پیدا نشد یا هنوز در کش آفلاین موجود نیست." : "Invoice not found."}
        </div>
      </section>
    );
  }

  return (
    <section dir={dir || (fa ? "rtl" : "ltr")} className="print-studio-page min-h-screen bg-slate-950 text-white p-5">
      <div className="no-print flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-3xl font-black text-cyan-400">
            {fa ? "استودیوی چاپ فاکتور" : "Invoice Print Studio"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa ? `فاکتور شماره ${n(invoice.id)} را با قالب دلخواه چاپ یا قبل چاپ ویرایش کن.` : `Print invoice #${invoice.id} with a saved template.`}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link to="/invoices" className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2">
            <ArrowLeft size={18} />
            {fa ? "بازگشت" : "Back"}
          </Link>

          <button type="button" onClick={saveAsTemplate} className="px-4 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2">
            <Save size={18} />
            {fa ? "ذخیره به عنوان قالب" : "Save as template"}
          </button>

          <button type="button" onClick={handlePrint} className="px-4 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2">
            <Printer size={18} />
            {fa ? "چاپ / ذخیره PDF" : "Print / PDF"}
          </button>
        </div>
      </div>

      {message && (
        <div className="no-print mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-emerald-200 font-bold">
          {message}
        </div>
      )}

      <div className="no-print grid grid-cols-1 xl:grid-cols-[310px_1fr_320px] gap-5">
        <aside className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 space-y-4">
          <h2 className="text-cyan-300 font-black flex items-center gap-2">
            <FileText size={20} />
            {fa ? "قالب چاپ" : "Print Template"}
          </h2>

          <Field label={fa ? `انتخاب قالب (${templates.length})` : `Template (${templates.length})`}>
            <select value={selectedTemplateId} onChange={(e) => handleTemplateChange(e.target.value)} className="studio-input">
              <option value="default">{fa ? "قالب پیش‌فرض سریع" : "Default template"}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {asPlainText(template.name, fa ? "قالب چاپ" : "Print template")}
                </option>
              ))}
            </select>
          </Field>

          <Field label={fa ? "نام قالب / نسخه چاپ" : "Template name"}>
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="studio-input" />
          </Field>

          <Field label={fa ? "اندازه صفحه" : "Page size"}>
            <select value={config.page_size} onChange={(e) => updateConfig({ ...config, page_size: e.target.value })} className="studio-input">
              <option value="A4">A4</option>
              <option value="A5">A5</option>
              <option value="THERMAL80">Thermal 80</option>
              <option value="THERMAL58">Thermal 58</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={loadTemplates} className="studio-tool-button">
              <RefreshCw size={16} />
              {loadingTemplates ? "..." : fa ? "دریافت" : "Refresh"}
            </button>
            <button onClick={() => setEditMode((v) => !v)} className="studio-tool-button">
              <Edit3 size={16} />
              {editMode ? (fa ? "ویرایش روشن" : "Edit on") : fa ? "ویرایش خاموش" : "Edit off"}
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
            <Move size={16} />
            {showGrid ? (fa ? "Grid روشن" : "Grid on") : fa ? "Grid خاموش" : "Grid off"}
          </button>

          <button onClick={openBackendPrint} className="w-full px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex justify-center gap-2">
            <ExternalLink size={18} />
            {fa ? "باز کردن چاپ بک‌اند" : "Open backend print"}
          </button>
        </aside>

        <main
          className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 overflow-auto"
          onMouseMove={onCanvasMouseMove}
          onMouseUp={stopPointerActions}
          onMouseLeave={stopPointerActions}
        >
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-cyan-300 font-black flex items-center gap-2">
              <Move size={20} />
              {fa ? "پیش‌نمایش قابل ویرایش" : "Editable preview"}
            </div>
            <div className="text-slate-400 text-sm">
              {PAGE_SIZES[config.page_size]?.label || config.page_size} • {Math.round(zoom * 100)}%
            </div>
          </div>

          <InvoiceCanvas
            refObj={canvasRef}
            page={page}
            zoom={zoom}
            showGrid={showGrid}
            config={config}
            selectedElementId={selectedElementId}
            editMode={editMode}
            onElementMouseDown={onElementMouseDown}
            onResizeMouseDown={onResizeMouseDown}
            renderElement={renderElement}
          />
        </main>

        <aside className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 space-y-4">
          <h2 className="text-cyan-300 font-black flex items-center gap-2">
            <Settings2 size={20} />
            {fa ? "تنظیمات بخش انتخاب‌شده" : "Selected element"}
          </h2>

          {selectedElement ? (
            <>
              <div className="font-black text-white">{asPlainText(selectedElement.label, selectedElement.type)}</div>

              <div className="grid grid-cols-2 gap-2">
                <NumberProp label="X" value={selectedElement.x} onChange={(v) => updateElement(selectedElement.id, { x: Number(v) })} />
                <NumberProp label="Y" value={selectedElement.y} onChange={(v) => updateElement(selectedElement.id, { y: Number(v) })} />
                <NumberProp label="W" value={selectedElement.w} onChange={(v) => updateElement(selectedElement.id, { w: Number(v) })} />
                <NumberProp label="H" value={selectedElement.h} onChange={(v) => updateElement(selectedElement.id, { h: Number(v) })} />
              </div>

              <Field label={fa ? "متن" : "Text"}>
                <textarea value={asPlainText(selectedElement.text, "")} onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })} rows={4} className="studio-input" />
              </Field>

              <NumberProp label={fa ? "سایز فونت" : "Font size"} value={selectedElement.fontSize} onChange={(v) => updateElement(selectedElement.id, { fontSize: Number(v) })} />

              <ColorProp label={fa ? "رنگ متن" : "Text color"} value={selectedElement.color} onChange={(v) => updateElement(selectedElement.id, { color: v })} />
              <ColorProp label={fa ? "پس‌زمینه" : "Background"} value={selectedElement.bg} onChange={(v) => updateElement(selectedElement.id, { bg: v })} />
              <ColorProp label={fa ? "خط دور" : "Border"} value={selectedElement.border} onChange={(v) => updateElement(selectedElement.id, { border: v })} />

              <Field label={fa ? "چینش" : "Align"}>
                <select value={selectedElement.align || "center"} onChange={(e) => updateElement(selectedElement.id, { align: e.target.value })} className="studio-input">
                  <option value="right">{fa ? "راست" : "Right"}</option>
                  <option value="center">{fa ? "وسط" : "Center"}</option>
                  <option value="left">{fa ? "چپ" : "Left"}</option>
                </select>
              </Field>

              <label className="bg-slate-800 rounded-2xl p-3 flex justify-between">
                <span>Bold</span>
                <input type="checkbox" checked={!!selectedElement.bold} onChange={(e) => updateElement(selectedElement.id, { bold: e.target.checked })} />
              </label>

              <div className="grid grid-cols-1 gap-2">
                <button onClick={duplicateElement} className="studio-tool-button"><Copy size={16} /> {fa ? "کپی از بخش" : "Duplicate"}</button>
                <button onClick={bringToFront} className="studio-tool-button"><ArrowUp size={16} /> {fa ? "آوردن جلو" : "Bring front"}</button>
                <button onClick={sendToBack} className="studio-tool-button"><ArrowDown size={16} /> {fa ? "فرستادن عقب" : "Send back"}</button>
                <button onClick={deleteElement} className="px-4 py-3 rounded-2xl bg-red-500 text-white font-black flex justify-center gap-2"><Trash2 size={16} /> {fa ? "حذف بخش" : "Delete"}</button>
              </div>
            </>
          ) : (
            <div className="text-slate-400">{fa ? "یک بخش را انتخاب کن." : "Select an element."}</div>
          )}
        </aside>
      </div>

      <div className="print-only">
        <InvoiceCanvas
          page={page}
          zoom={1}
          showGrid={false}
          config={config}
          selectedElementId={null}
          editMode={false}
          onElementMouseDown={() => {}}
          onResizeMouseDown={() => {}}
          renderElement={renderElement}
        />
      </div>

      <style>{`
        .studio-input {
          width: 100%;
          background: #1e293b;
          color: white;
          border: 1px solid rgba(34,211,238,.18);
          border-radius: 16px;
          padding: 12px;
          outline: none;
        }
        .studio-tool-button {
          background: #1e293b;
          color: white;
          border-radius: 16px;
          padding: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .studio-tool-button:hover { background: #334155; }
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

function InvoiceCanvas({
  refObj,
  page,
  zoom,
  showGrid,
  config,
  selectedElementId,
  editMode,
  onElementMouseDown,
  onResizeMouseDown,
  renderElement,
}) {
  const scaledW = Math.ceil(page.w * zoom);
  const scaledH = Math.ceil(page.h * zoom);

  return (
    <div className="w-full overflow-auto pb-10">
      <div className="mx-auto relative" style={{ width: scaledW, height: scaledH, minWidth: scaledW }}>
        <div
          ref={refObj}
          className="print-canvas relative bg-white text-slate-950 shadow-2xl origin-top-left"
          style={{
            width: page.w,
            height: page.h,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            backgroundImage: showGrid
              ? "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)"
              : "none",
            backgroundSize: "20px 20px",
          }}
        >
        {(config.elements || []).map((element) => (
          <div
            key={element.id}
            onMouseDown={(e) => onElementMouseDown(e, element)}
            className={`absolute select-none overflow-hidden flex items-center justify-center ${
              editMode ? "cursor-move" : ""
            } ${selectedElementId === element.id ? "ring-2 ring-cyan-500" : ""}`}
            style={{
              left: toNumber(element.x),
              top: toNumber(element.y),
              width: toNumber(element.w),
              height: toNumber(element.h),
              color: asPlainText(element.color, "#0f172a"),
              background: asPlainText(element.bg, "#ffffff"),
              border: `1px solid ${asPlainText(element.border, "transparent")}`,
              borderRadius: toNumber(element.radius),
              fontSize: toNumber(element.fontSize),
              fontWeight: element.bold ? 900 : 500,
              textAlign: asPlainText(element.align, "center"),
              padding: 8,
              direction: "rtl",
            }}
          >
            {renderElement(element)}

            {editMode && selectedElementId === element.id && (
              <div
                data-resize="true"
                onMouseDown={(e) => onResizeMouseDown(e, element)}
                className="absolute -bottom-2 -right-2 w-4 h-4 bg-cyan-500 rounded-full cursor-se-resize border border-white"
              />
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function InvoiceItemsTable({ items, fa, n, money }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="bg-slate-900 text-white">
          <th className="border p-1">#</th>
          <th className="border p-1">{fa ? "شرح" : "Item"}</th>
          <th className="border p-1">{fa ? "تعداد" : "Qty"}</th>
          <th className="border p-1">{fa ? "واحد" : "Unit"}</th>
          <th className="border p-1">{fa ? "جمع" : "Total"}</th>
        </tr>
      </thead>
      <tbody>
        {items.length ? (
          items.map((item, index) => {
            const unit = item.unit_price ?? item.price ?? 0;
            const total = item.total ?? item.total_price ?? toNumber(item.quantity) * toNumber(unit);
            return (
              <tr key={`${item.product_id || item.id || index}-${index}`}>
                <td className="border p-1 text-center">{n(index + 1)}</td>
                <td className="border p-1">{item.product_name || item.name || item.product?.name || "-"}</td>
                <td className="border p-1 text-center">{n(item.quantity || 0)}</td>
                <td className="border p-1 text-center">{money(unit)}</td>
                <td className="border p-1 text-center">{money(total)}</td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td colSpan={5} className="border p-2 text-center">
              {fa ? "اقلامی ثبت نشده است." : "No items."}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function InvoiceTotals({ totals, fa, money }) {
  const rows = [
    [fa ? "جمع جزء" : "Subtotal", totals.subtotal],
    [fa ? "تخفیف" : "Discount", totals.discount],
    [fa ? "مالیات" : "Tax", totals.tax],
    [fa ? "حمل" : "Shipping", totals.shipping],
    [fa ? "پرداخت شده" : "Settled", totals.settled],
    [fa ? "باقی‌مانده" : "Remaining", totals.remaining],
  ];

  return (
    <div className="w-full text-[12px] space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between border-b border-slate-200 pb-1">
          <span>{label}</span>
          <b>{money(value)}</b>
        </div>
      ))}
      <div className="flex justify-between text-cyan-700 font-black text-sm pt-2">
        <span>{fa ? "مبلغ نهایی" : "Total"}</span>
        <b>{money(totals.total)}</b>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="text-cyan-200 text-sm font-bold block">{label}</label>
      {children}
    </div>
  );
}

function NumberProp({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input type="number" value={value ?? 0} onChange={(e) => onChange(e.target.value)} className="studio-input" />
    </Field>
  );
}

function ColorProp({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} className="w-full h-11 bg-slate-800 rounded-2xl p-1" />
    </Field>
  );
}
