import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  FileText,
  Grid3X3,
  Maximize2,
  Move,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { getPdfTemplates, savePdfTemplate, deletePdfTemplate } from "../services/api";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import { confirmAction } from "../components/ui/confirmService";
import Select from "../components/ui/Select";

const PAGE_SIZES = {
  A4: { w: 620, h: 820, label: "A4" },
  A5: { w: 440, h: 620, label: "A5" },
  THERMAL80: { w: 300, h: 850, label: "Thermal 80" },
  THERMAL58: { w: 230, h: 850, label: "Thermal 58" },
};

function pick(language, fa, ar, tr, en) {
  return language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? tr : en;
}

function buildDefaultConfig(language) {
  const p = (fa, ar, tr, en) => pick(language, fa, ar, tr, en);
  return {
    page_size: "A4",
    theme: { primary: "#0f172a", accent: "#06b6d4" },
    elements: [
      { id: "logo", type: "logo", label: p("لوگو", "الشعار", "Logo", "Logo"), text: p("لوگو", "الشعار", "Logo", "LOGO"), x: 40, y: 35, w: 90, h: 45, fontSize: 12, color: "#0f172a", bg: "#ecfeff", border: "#bae6fd", radius: 12, align: "center", bold: true },
      { id: "title", type: "text", label: p("عنوان فاکتور", "عنوان الفاتورة", "Fatura başlığı", "Invoice title"), text: p("فاکتور فروش", "فاتورة مبيعات", "Satış Faturası", "Sales Invoice"), x: 340, y: 40, w: 190, h: 45, fontSize: 22, color: "#0f172a", bg: "#ffffff", border: "#ffffff", radius: 10, align: "center", bold: true },
      { id: "company", type: "text", label: p("نام شرکت", "اسم الشركة", "Şirket adı", "Company name"), text: `VITALIX ERP\n${p("سیستم حسابداری و مدیریت فروش", "نظام محاسبي وإدارة مبيعات", "Muhasebe ve Satış Yönetim Sistemi", "Accounting & Sales Management System")}`, x: 60, y: 95, w: 250, h: 60, fontSize: 14, color: "#0891b2", bg: "#ffffff", border: "#e2e8f0", radius: 10, align: "center", bold: true },
      { id: "invoiceInfo", type: "box", label: p("اطلاعات فاکتور", "معلومات الفاتورة", "Fatura bilgileri", "Invoice info"), text: p("شماره: {{invoice_id}}\nتاریخ: {{invoice_date}}\nوضعیت: {{payment_status}}", "الرقم: {{invoice_id}}\nالتاريخ: {{invoice_date}}\nالحالة: {{payment_status}}", "No: {{invoice_id}}\nTarih: {{invoice_date}}\nDurum: {{payment_status}}", "No: {{invoice_id}}\nDate: {{invoice_date}}\nStatus: {{payment_status}}"), x: 370, y: 120, w: 180, h: 90, fontSize: 13, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
      { id: "customer", type: "box", label: p("طرف حساب", "العميل", "Cari", "Customer"), text: p("طرف حساب\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}", "العميل\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}", "Cari\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}", "Customer\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}"), x: 55, y: 170, w: 280, h: 95, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 14, align: "right", bold: false },
      { id: "table", type: "table", label: p("جدول اقلام", "جدول البنود", "Kalem tablosu", "Items table"), text: p("جدول اقلام فاکتور", "جدول بنود الفاتورة", "Fatura kalemleri tablosu", "Invoice items table"), x: 55, y: 300, w: 505, h: 150, fontSize: 13, color: "#0f172a", bg: "#ffffff", border: "#94a3b8", radius: 10, align: "center", bold: true },
      { id: "totals", type: "totals", label: p("جمع فاکتور", "إجمالي الفاتورة", "Fatura toplamı", "Invoice totals"), text: p("جمع جزء: {{subtotal}}\nتخفیف: {{discount}}\nمالیات: {{tax}}\nمبلغ نهایی: {{total}}", "المجموع الفرعي: {{subtotal}}\nالخصم: {{discount}}\nالضريبة: {{tax}}\nالإجمالي النهائي: {{total}}", "Ara toplam: {{subtotal}}\nİndirim: {{discount}}\nVergi: {{tax}}\nGenel toplam: {{total}}", "Subtotal: {{subtotal}}\nDiscount: {{discount}}\nTax: {{tax}}\nGrand total: {{total}}"), x: 55, y: 480, w: 250, h: 130, fontSize: 14, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
      { id: "qr", type: "qr", label: p("کد QR", "رمز QR", "QR Kodu", "QR Code"), text: "QR", x: 420, y: 500, w: 90, h: 90, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
      { id: "signature", type: "box", label: p("امضا", "التوقيع", "İmza", "Signature"), text: p("امضاء فروشنده / حسابدار", "توقيع البائع / المحاسب", "Satıcı / Muhasebeci İmzası", "Seller / Accountant signature"), x: 55, y: 650, w: 210, h: 70, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
      { id: "stamp", type: "box", label: p("مهر", "الختم", "Kaşe", "Stamp"), text: p("مهر شرکت / امضاء طرف حساب", "ختم الشركة / توقيع العميل", "Şirket Kaşesi / Müşteri İmzası", "Company stamp / Customer signature"), x: 350, y: 650, w: 210, h: 70, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
      { id: "footer", type: "text", label: p("متن پایین", "النص السفلي", "Alt metin", "Footer text"), text: p("با تشکر از اعتماد شما", "شكراً لثقتكم", "Güveniniz için teşekkür ederiz", "Thank you for your trust"), x: 210, y: 765, w: 200, h: 35, fontSize: 13, color: "#334155", bg: "transparent", border: "transparent", radius: 0, align: "center", bold: true },
    ],
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pageSize(key) {
  return PAGE_SIZES[key] || PAGE_SIZES.A4;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snap(value, enabled) {
  if (!enabled) return Math.round(value);
  return Math.round(value / 10) * 10;
}

function normalizeConfig(config, language) {
  const fallback = buildDefaultConfig(language);
  const source = config && typeof config === "object" ? config : fallback;
  return {
    ...fallback,
    ...source,
    theme: { ...fallback.theme, ...(source.theme || {}) },
    elements: Array.isArray(source.elements) && source.elements.length ? source.elements : fallback.elements,
  };
}

export default function InvoiceDesigner() {
  const { language, dir, n } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState(tr("قالب رسمی فاکتور", "قالب فاتورة رسمي", "Resmi fatura şablonu", "Official invoice template"));
  const [config, setConfig] = useState(() => buildDefaultConfig(language));
  const [selectedId, setSelectedId] = useState("title");
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [zoom, setZoom] = useState(0.95);
  const [showGrid, setShowGrid] = useState(true);
  const [snapGrid, setSnapGrid] = useState(true);
  const [message, setMessage] = useState("");
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("templateId");
  const [autoLoadedFor, setAutoLoadedFor] = useState(null);

  const page = pageSize(config.page_size);
  const selected = useMemo(() => config.elements.find((x) => x.id === selectedId) || null, [config, selectedId]);

  async function loadTemplates() {
    try {
      const data = await getPdfTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTemplates([]);
      setMessage(tr("خطا در دریافت قالب‌ها", "خطأ في تحميل القوالب", "Şablonlar yüklenirken hata oluştu", "Template loading error"));
    }
  }

  const stableLoadTemplates = useStableCallback(loadTemplates);

  // Arriving from the Design Studio hub with ?templateId= loads that
  // template straight into the canvas instead of a blank one.
  useEffect(() => {
    if (!requestedTemplateId || autoLoadedFor === requestedTemplateId || templates.length === 0) return;
    const match = templates.find((t) => String(t.id) === String(requestedTemplateId));
    if (!match) return;
    const timer = setTimeout(() => {
      loadTemplate(match);
      setAutoLoadedFor(requestedTemplateId);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTemplateId, templates, autoLoadedFor]);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoadTemplates(); }, 0);
    return () => clearTimeout(timer);
  }, [stableLoadTemplates]);

  function updateElement(id, patch) {
    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));
  }

  function addElement(type) {
    const id = `${type}_${Date.now()}`;
    const labels = {
      text: tr("متن جدید", "نص جديد", "Yeni metin", "Text"),
      box: tr("کادر جدید", "مربع جديد", "Yeni kutu", "Box"),
      table: tr("جدول اقلام", "جدول البنود", "Kalem tablosu", "Items table"),
      totals: tr("جمع فاکتور", "إجمالي الفاتورة", "Fatura toplamı", "Totals"),
      qr: "QR",
      barcode: tr("بارکد", "الباركود", "Barkod", "Barcode"),
      logo: tr("لوگو", "الشعار", "Logo", "Logo"),
    };

    const el = {
      id,
      type,
      label: labels[type] || type,
      text: type === "text" ? tr("متن جدید", "نص جديد", "Yeni metin", "New text") : labels[type] || type,
      x: 80,
      y: 80,
      w: type === "qr" ? 85 : type === "barcode" ? 180 : 170,
      h: type === "qr" ? 85 : type === "barcode" ? 55 : 55,
      fontSize: 13,
      color: "#0f172a",
      bg: "#ffffff",
      border: "#cbd5e1",
      radius: 12,
      align: "center",
      bold: false,
    };

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(id);
  }

  function deleteSelected() {
    if (!selected) return;
    const next = config.elements.filter((x) => x.id !== selected.id);
    setConfig((prev) => ({ ...prev, elements: next }));
    setSelectedId(next[0]?.id || "");
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = { ...clone(selected), id: `${selected.id}_copy_${Date.now()}`, label: `${selected.label} ${tr("کپی", "نسخة", "kopya", "copy")}`, x: selected.x + 20, y: selected.y + 20 };
    setConfig((prev) => ({ ...prev, elements: [...prev.elements, copy] }));
    setSelectedId(copy.id);
  }

  function bringToFront() {
    if (!selected) return;
    setConfig((prev) => ({ ...prev, elements: [...prev.elements.filter((x) => x.id !== selected.id), selected] }));
  }

  function sendToBack() {
    if (!selected) return;
    setConfig((prev) => ({ ...prev, elements: [selected, ...prev.elements.filter((x) => x.id !== selected.id)] }));
  }

  function onMouseDown(e, el) {
    if (e.target?.dataset?.resize === "true") return;
    e.preventDefault();
    setSelectedId(el.id);
    setDrag({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      x: el.x,
      y: el.y,
    });
  }

  function onResizeDown(e, el) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    setResize({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      w: el.w,
      h: el.h,
    });
  }

  function onMouseMove(e) {
    if (drag) {
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;
      updateElement(drag.id, {
        x: clamp(snap(drag.x + dx, snapGrid), 0, page.w - 20),
        y: clamp(snap(drag.y + dy, snapGrid), 0, page.h - 20),
      });
    }

    if (resize) {
      const dx = (e.clientX - resize.startX) / zoom;
      const dy = (e.clientY - resize.startY) / zoom;
      updateElement(resize.id, {
        w: Math.max(30, snap(resize.w + dx, snapGrid)),
        h: Math.max(25, snap(resize.h + dy, snapGrid)),
      });
    }
  }

  function stopActions() {
    setDrag(null);
    setResize(null);
  }

  function loadTemplate(tpl) {
    const cfg = normalizeConfig(tpl.config, language);
    setName(tpl.name || name);
    setConfig(cfg);
    setSelectedId(cfg.elements[0]?.id || "");
    setMessage(tr("قالب بارگذاری شد.", "تم تحميل القالب.", "Şablon yüklendi.", "Template loaded."));
  }

  async function saveTemplate() {
    await savePdfTemplate({
      name,
      page_size: config.page_size,
      config,
    });
    setMessage(tr("قالب با موفقیت ذخیره شد.", "تم حفظ القالب بنجاح.", "Şablon başarıyla kaydedildi.", "Template saved."));
    await loadTemplates();
  }

  async function removeTemplate(id) {
    if (!(await confirmAction(tr("قالب حذف شود؟", "هل تريد حذف القالب؟", "Şablon silinsin mi?", "Delete template?"), { danger: true }))) return;
    await deletePdfTemplate(id);
    setMessage(tr("قالب حذف شد.", "تم حذف القالب.", "Şablon silindi.", "Template deleted."));
    await loadTemplates();
  }

  async function resetTemplate() {
    if (!(await confirmAction(tr("قالب به حالت پیش‌فرض برگردد؟", "هل تريد إعادة تعيين القالب؟", "Şablon sıfırlansın mı?", "Reset template?")))) return;
    const cfg = clone(buildDefaultConfig(language));
    setConfig(cfg);
    setSelectedId("title");
  }

  function renderElement(el) {
    if (el.type === "table") {
      return (
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="border p-1">#</th>
              <th className="border p-1">{tr("شرح", "الوصف", "Açıklama", "Item")}</th>
              <th className="border p-1">{tr("تعداد", "الكمية", "Adet", "Qty")}</th>
              <th className="border p-1">{tr("قیمت", "السعر", "Fiyat", "Price")}</th>
              <th className="border p-1">{tr("جمع", "الإجمالي", "Toplam", "Total")}</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i}>
                <td className="border p-1">{n(i)}</td>
                <td className="border p-1">{tr("نمونه کالا", "منتج نموذجي", "Örnek ürün", "Sample item")}</td>
                <td className="border p-1">{n(1)}</td>
                <td className="border p-1">{n(100000)}</td>
                <td className="border p-1">{n(100000)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (el.type === "totals") {
      return (
        <div className="w-full text-[12px] leading-7">
          <div className="flex justify-between"><span>{tr("جمع جزء", "المجموع الفرعي", "Ara toplam", "Subtotal")}</span><b>{n(300000)}</b></div>
          <div className="flex justify-between"><span>{tr("تخفیف", "الخصم", "İndirim", "Discount")}</span><b>{n(0)}</b></div>
          <div className="flex justify-between text-cyan-700 font-black"><span>{tr("نهایی", "الإجمالي النهائي", "Nihai toplam", "Total")}</span><b>{n(300000)}</b></div>
        </div>
      );
    }

    if (el.type === "qr") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
          <div className="w-12 h-12 border-4 border-slate-900 grid grid-cols-3 grid-rows-3 gap-1 p-1">
            <span className="bg-slate-900" /><span /><span className="bg-slate-900" />
            <span /><span className="bg-slate-900" /><span />
            <span className="bg-slate-900" /><span /><span className="bg-slate-900" />
          </div>
          <small>QR</small>
        </div>
      );
    }

    if (el.type === "barcode") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <div className="tracking-[4px] text-2xl">|||| ||| || ||||</div>
          <small>VITALIX</small>
        </div>
      );
    }

    return <div className="whitespace-pre-line w-full">{el.text || el.label}</div>;
  }

  return (
    <div dir={dir} className="min-h-screen p-5 bg-[var(--erp-bg)] text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">
            {tr("استودیوی حرفه‌ای طراحی فاکتور", "استوديو تصميم الفواتير الاحترافي", "Profesyonel Fatura Tasarım Stüdyosu", "Professional Invoice Studio")}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {tr("طراحی قالب چاپ با Drag، Resize، لایه‌ها، سایزهای مختلف و ذخیره قالب", "تصميم قالب الطباعة بالسحب وتغيير الحجم والطبقات وأحجام مختلفة وحفظ القالب", "Sürükle, boyutlandır, katmanlar, farklı boyutlar ve kayıtlı şablonlarla yazdırma şablonu tasarlayın", "Drag, resize, layers, multiple page sizes and saved templates")}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link to="/design-studio" className="studio-btn bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]"><ArrowLeft size={18} /> {tr("بازگشت به استودیوی طراحی", "العودة إلى استوديو التصميم", "Tasarım stüdyosuna dön", "Back to Design Studio")}</Link>
          <button onClick={loadTemplates} className="studio-btn bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]"><RefreshCw size={18} /> {tr("دریافت", "تحديث", "Yenile", "Refresh")}</button>
          <button onClick={resetTemplate} className="studio-btn bg-[var(--erp-panel-solid)] text-[var(--erp-text)]"><Trash2 size={18} /> {tr("پیش‌فرض", "إعادة تعيين", "Sıfırla", "Reset")}</button>
          <button onClick={saveTemplate} className="studio-btn bg-[var(--erp-accent)] text-slate-950"><Save size={18} /> {tr("ذخیره قالب", "حفظ القالب", "Şablonu kaydet", "Save")}</button>
        </div>
      </div>

      {message && <div className="mb-4 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-2xl p-4 font-bold">{message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[310px_1fr_320px] gap-5">
        <Panel title={tr("قالب‌ها و ابزار", "القوالب والأدوات", "Şablonlar ve araçlar", "Templates & Tools")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className="studio-input" />

          <Select
            value={config.page_size}
            onChange={(value) => setConfig((p) => ({ ...p, page_size: value }))}
            className="studio-input"
            options={Object.entries(PAGE_SIZES).map(([key, val]) => ({ value: key, label: val.label }))}
          />

          <div className="grid grid-cols-2 gap-2">
            <ToolButton onClick={() => addElement("text")} label={tr("متن", "نص", "Metin", "Text")} />
            <ToolButton onClick={() => addElement("box")} label={tr("کادر", "مربع", "Kutu", "Box")} />
            <ToolButton onClick={() => addElement("table")} label={tr("جدول", "جدول", "Tablo", "Table")} />
            <ToolButton onClick={() => addElement("totals")} label={tr("جمع", "الإجمالي", "Toplam", "Totals")} />
            <ToolButton onClick={() => addElement("qr")} label="QR" />
            <ToolButton onClick={() => addElement("barcode")} label={tr("بارکد", "الباركود", "Barkod", "Barcode")} />
            <ToolButton onClick={() => addElement("logo")} label={tr("لوگو", "الشعار", "Logo", "Logo")} />
          </div>

          <div className="pt-4 border-t border-[var(--erp-border)]">
            <div className="text-[var(--erp-accent)] font-black mb-2">{tr("قالب‌های ذخیره‌شده", "القوالب المحفوظة", "Kayıtlı şablonlar", "Saved templates")}</div>
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {templates.map((tpl) => (
                <div key={tpl.id} className="flex gap-2">
                  <button onClick={() => loadTemplate(tpl)} className="flex-1 text-right bg-[var(--erp-panel-solid)] hover:bg-[var(--erp-glow)] rounded-2xl p-3">
                    {language === "fa" ? toPersianDigits(tpl.name) : tpl.name}
                  </button>
                  <button onClick={() => removeTemplate(tpl.id)} className="px-3 rounded-2xl bg-red-500/80 text-white font-black">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {templates.length === 0 && <div className="text-[var(--erp-muted)] text-sm">{tr("قالبی ذخیره نشده است.", "لا يوجد قالب محفوظ.", "Kayıtlı şablon yok.", "No templates yet.")}</div>}
            </div>
          </div>
        </Panel>

        <div
          className="bg-[var(--erp-panel)] border border-[var(--erp-border)] rounded-3xl p-5 overflow-auto"
          onMouseMove={onMouseMove}
          onMouseUp={stopActions}
          onMouseLeave={stopActions}
        >
          <div className="flex justify-between items-center gap-3 flex-wrap mb-4">
            <div className="text-[var(--erp-accent)] font-black flex gap-2 items-center"><Move /> {tr("صفحه طراحی", "لوحة التصميم", "Tasarım tuvali", "Canvas")}</div>
            <div className="flex gap-2">
              <button onClick={() => setZoom((z) => Math.max(0.45, z - 0.1))} className="mini-btn"><Maximize2 size={15} /> -</button>
              <div className="mini-btn text-[var(--erp-accent)]">{language === "fa" ? toPersianDigits(Math.round(zoom * 100)) : Math.round(zoom * 100)}%</div>
              <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} className="mini-btn"><Maximize2 size={15} /> +</button>
              <button onClick={() => setShowGrid((v) => !v)} className="mini-btn"><Grid3X3 size={15} /> {tr("شبکه", "الشبكة", "Izgara", "Grid")}</button>
              <button onClick={() => setSnapGrid((v) => !v)} className={`mini-btn ${snapGrid ? "text-[var(--erp-accent)]" : "text-[var(--erp-muted)]"}`}>{tr("چفت", "الالتصاق", "Yapışma", "Snap")}</button>
            </div>
          </div>

          <div className="min-w-max flex justify-center pb-20">
            <div
              className="relative bg-white text-slate-950 shadow-2xl origin-top"
              style={{
                width: page.w,
                height: page.h,
                transform: `scale(${zoom})`,
                backgroundImage: showGrid
                  ? "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)"
                  : "none",
                backgroundSize: "20px 20px",
              }}
            >
              {config.elements.map((el) => (
                <div
                  key={el.id}
                  onMouseDown={(e) => onMouseDown(e, el)}
                  className={`absolute select-none overflow-hidden flex items-center justify-center cursor-move ${selectedId === el.id ? "ring-2 ring-[var(--erp-accent)]" : ""}`}
                  style={{
                    left: el.x,
                    top: el.y,
                    width: el.w,
                    height: el.h,
                    color: el.color,
                    background: el.bg,
                    border: `1px solid ${el.border || "transparent"}`,
                    borderRadius: el.radius,
                    fontSize: el.fontSize,
                    fontWeight: el.bold ? 900 : 500,
                    textAlign: el.align || "center",
                    padding: 8,
                    direction: dir,
                  }}
                >
                  {renderElement(el)}

                  {selectedId === el.id && (
                    <div
                      data-resize="true"
                      onMouseDown={(e) => onResizeDown(e, el)}
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-[var(--erp-accent)] rounded-full cursor-se-resize border border-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Panel title={tr("تنظیمات بخش", "إعدادات العنصر", "Öğe ayarları", "Properties")}>
          {selected ? (
            <>
              <div className="font-black text-[var(--erp-accent)]">{selected.label || selected.type}</div>

              <div className="grid grid-cols-2 gap-2">
                <Prop label="X" value={selected.x} onChange={(v) => updateElement(selected.id, { x: Number(v) })} />
                <Prop label="Y" value={selected.y} onChange={(v) => updateElement(selected.id, { y: Number(v) })} />
                <Prop label="W" value={selected.w} onChange={(v) => updateElement(selected.id, { w: Number(v) })} />
                <Prop label="H" value={selected.h} onChange={(v) => updateElement(selected.id, { h: Number(v) })} />
              </div>

              <label className="text-[var(--erp-accent)] text-sm font-bold">{tr("متن", "النص", "Metin", "Text")}</label>
              <textarea value={selected.text || ""} onChange={(e) => updateElement(selected.id, { text: e.target.value })} rows={4} className="studio-input" />

              <Prop label={tr("سایز فونت", "حجم الخط", "Yazı boyutu", "Font size")} value={selected.fontSize} onChange={(v) => updateElement(selected.id, { fontSize: Number(v) })} />
              <Prop label={tr("گردی گوشه", "استدارة الحواف", "Köşe yarıçapı", "Radius")} value={selected.radius} onChange={(v) => updateElement(selected.id, { radius: Number(v) })} />

              <Color label={tr("رنگ متن", "لون النص", "Metin rengi", "Color")} value={selected.color} onChange={(v) => updateElement(selected.id, { color: v })} />
              <Color label={tr("پس‌زمینه", "الخلفية", "Arka plan", "Background")} value={selected.bg} onChange={(v) => updateElement(selected.id, { bg: v })} />
              <Color label={tr("خط دور", "الحدود", "Kenarlık", "Border")} value={selected.border} onChange={(v) => updateElement(selected.id, { border: v })} />

              <Select
                value={selected.align || "center"}
                onChange={(value) => updateElement(selected.id, { align: value })}
                className="studio-input"
                options={[
                  { value: "right", label: tr("راست", "يمين", "Sağ", "Right") },
                  { value: "center", label: tr("وسط", "وسط", "Orta", "Center") },
                  { value: "left", label: tr("چپ", "يسار", "Sol", "Left") },
                ]}
              />

              <label className="bg-[var(--erp-panel-solid)] rounded-2xl p-3 flex justify-between">
                <span>{tr("درشت", "غامق", "Kalın", "Bold")}</span>
                <input type="checkbox" checked={!!selected.bold} onChange={(e) => updateElement(selected.id, { bold: e.target.checked })} />
              </label>

              <div className="grid grid-cols-1 gap-2">
                <button onClick={duplicateSelected} className="tool-wide"><Copy size={16} /> {tr("کپی", "نسخ", "Kopyala", "Duplicate")}</button>
                <button onClick={bringToFront} className="tool-wide"><ArrowUp size={16} /> {tr("آوردن جلو", "إحضار للأمام", "Öne getir", "Bring front")}</button>
                <button onClick={sendToBack} className="tool-wide"><ArrowDown size={16} /> {tr("فرستادن عقب", "إرسال للخلف", "Arkaya gönder", "Send back")}</button>
                <button onClick={deleteSelected} className="tool-wide bg-red-500 text-white"><Trash2 size={16} /> {tr("حذف بخش", "حذف العنصر", "Öğeyi sil", "Delete")}</button>
              </div>
            </>
          ) : (
            <div className="text-[var(--erp-muted)]">{tr("یک بخش را انتخاب کن.", "اختر عنصراً.", "Bir öğe seçin.", "Select an element.")}</div>
          )}
        </Panel>
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
          margin-bottom: 10px;
        }
        .studio-btn {
          padding: 12px 16px;
          border-radius: 16px;
          font-weight: 900;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .mini-btn {
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          padding: 8px 10px;
          border-radius: 12px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .tool-wide {
          width: 100%;
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border-radius: 16px;
          padding: 12px;
          font-weight: 900;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-[var(--erp-panel)] border border-[var(--erp-border)] rounded-3xl p-5 space-y-4">
      <h2 className="text-[var(--erp-accent)] font-black flex gap-2 items-center">
        <FileText size={20} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function ToolButton({ label, onClick }) {
  return (
    <button onClick={onClick} className="bg-[var(--erp-panel-solid)] hover:bg-[var(--erp-glow)] rounded-2xl p-3 font-bold flex justify-center gap-2 items-center">
      <Plus size={16} />
      {label}
    </button>
  );
}

function Prop({ label, value, onChange }) {
  const { language } = useLanguage();
  const display = value ?? 0;
  return (
    <div>
      <label className="text-[var(--erp-accent)] text-sm font-bold">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={language === "fa" ? toPersianDigits(display) : display}
        onChange={(e) => onChange(cleanNumberInput(e.target.value))}
        className="studio-input"
      />
    </div>
  );
}

function Color({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[var(--erp-accent)] text-sm font-bold">{label}</label>
      <input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} className="w-full h-11 bg-[var(--erp-panel-solid)] rounded-2xl p-1 mt-1 mb-2" />
    </div>
  );
}
