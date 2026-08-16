import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Download,
  FileText,
  Grid3X3,
  Maximize2,
  Move,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { getPdfTemplates, savePdfTemplate, deletePdfTemplate, downloadAuthenticatedFile } from "../services/api";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import Select from "../components/ui/Select";

// Physical page size in PDF points, matching backend/app/designer/canvas_render.py's
// KIND_PAGE_SIZES exactly - canvas pixel coordinates map 1:1 onto the
// exported PDF with no scale-factor guessing.
const KIND_PAGE_SIZES = {
  business_card: { w: 252, h: 144, label: "3.5 x 2 in" },
  letterhead: { w: 595, h: 842, label: "A4" },
  banner: { w: 600, h: 315, label: "1.9:1" },
};

function pick(language, fa, ar, tr, en) {
  return language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? tr : en;
}

function defaultConfigFor(kind, language) {
  const p = (fa, ar, tr, en) => pick(language, fa, ar, tr, en);
  const size = KIND_PAGE_SIZES[kind];

  if (kind === "business_card") {
    return {
      page_size: kind,
      theme: { primary: "#0f172a", accent: "#06b6d4" },
      elements: [
        { id: "bg", type: "box", label: p("پس‌زمینه", "الخلفية", "Arka plan", "Background"), text: "", x: 0, y: 0, w: size.w, h: size.h, fontSize: 12, color: "#0f172a", bg: "#0f172a", border: "transparent", radius: 0, align: "center", bold: false },
        { id: "company", type: "text", label: p("نام شرکت", "اسم الشركة", "Şirket adı", "Company name"), text: "Vetrix ERP", x: 18, y: 18, w: 170, h: 26, fontSize: 15, color: "#22d3ee", bg: "transparent", border: "transparent", radius: 0, align: "right", bold: true },
        { id: "person", type: "text", label: p("نام و سمت", "الاسم والمنصب", "Ad ve unvan", "Name & title"), text: p("نام و نام‌خانوادگی\nسمت شغلی", "الاسم\nالمنصب", "Ad Soyad\nUnvan", "Full name\nJob title"), x: 18, y: 48, w: 170, h: 40, fontSize: 11, color: "#e2e8f0", bg: "transparent", border: "transparent", radius: 0, align: "right", bold: false },
        { id: "contact", type: "text", label: p("اطلاعات تماس", "معلومات الاتصال", "İletişim bilgileri", "Contact info"), text: p("۰۹۱۲۱۲۳۴۵۶۷\nwww.example.com", "0912-1234567\nwww.example.com", "0912-1234567\nwww.example.com", "+98 912 123 4567\nwww.example.com"), x: 18, y: 92, w: 170, h: 40, fontSize: 9, color: "#94a3b8", bg: "transparent", border: "transparent", radius: 0, align: "right", bold: false },
        { id: "qr", type: "qr", label: "QR", text: "QR", x: 196, y: 18, w: 40, h: 40, fontSize: 12, color: "#0f172a", bg: "#ffffff", border: "transparent", radius: 6, align: "center", bold: false },
      ],
    };
  }

  if (kind === "banner") {
    return {
      page_size: kind,
      theme: { primary: "#0f172a", accent: "#06b6d4" },
      elements: [
        { id: "bg", type: "box", label: p("پس‌زمینه", "الخلفية", "Arka plan", "Background"), text: "", x: 0, y: 0, w: size.w, h: size.h, fontSize: 12, color: "#0f172a", bg: "#0891b2", border: "transparent", radius: 0, align: "center", bold: false },
        { id: "headline", type: "text", label: p("عنوان اصلی", "العنوان الرئيسي", "Ana başlık", "Headline"), text: p("جشنواره فروش ویژه", "عرض بيع خاص", "Özel satış kampanyası", "Special sale campaign"), x: 40, y: 90, w: 520, h: 60, fontSize: 30, color: "#ffffff", bg: "transparent", border: "transparent", radius: 0, align: "center", bold: true },
        { id: "subtext", type: "text", label: p("توضیح", "وصف", "Açıklama", "Subtext"), text: p("تا پایان هفته، تخفیف ویژه روی تمام کالاها", "خصم خاص على جميع المنتجات حتى نهاية الأسبوع", "Hafta sonuna kadar tüm ürünlerde özel indirim", "Special discount on all products until end of week"), x: 40, y: 160, w: 520, h: 40, fontSize: 14, color: "#e0f2fe", bg: "transparent", border: "transparent", radius: 0, align: "center", bold: false },
        { id: "logo", type: "logo", label: p("لوگو", "الشعار", "Logo", "Logo"), text: "", x: 20, y: 20, w: 60, h: 40, fontSize: 12, color: "#0f172a", bg: "#ffffff", border: "transparent", radius: 8, align: "center", bold: false },
      ],
    };
  }

  // letterhead
  return {
    page_size: kind,
    theme: { primary: "#0f172a", accent: "#06b6d4" },
    elements: [
      { id: "logo", type: "logo", label: p("لوگو", "الشعار", "Logo", "Logo"), text: "", x: 40, y: 30, w: 90, h: 50, fontSize: 12, color: "#0f172a", bg: "#f1f5f9", border: "transparent", radius: 8, align: "center", bold: false },
      { id: "company", type: "text", label: p("نام شرکت", "اسم الشركة", "Şirket adı", "Company name"), text: "Vetrix ERP", x: 300, y: 35, w: 255, h: 30, fontSize: 18, color: "#0891b2", bg: "transparent", border: "transparent", radius: 0, align: "left", bold: true },
      { id: "address", type: "text", label: p("آدرس", "العنوان", "Adres", "Address"), text: p("آدرس شرکت، تلفن و ایمیل", "عنوان الشركة، الهاتف والبريد", "Şirket adresi, telefon ve e-posta", "Company address, phone and email"), x: 300, y: 68, w: 255, h: 30, fontSize: 10, color: "#64748b", bg: "transparent", border: "transparent", radius: 0, align: "left", bold: false },
      { id: "rule", type: "box", label: p("خط جداکننده", "خط فاصل", "Ayırıcı çizgi", "Divider"), text: "", x: 40, y: 105, w: 515, h: 2, fontSize: 12, color: "#0f172a", bg: "#0891b2", border: "transparent", radius: 0, align: "center", bold: false },
      { id: "footer", type: "text", label: p("پاورقی", "تذييل", "Alt bilgi", "Footer"), text: p("شماره ثبت | شناسه ملی | کد اقتصادی", "رقم التسجيل | الرقم الوطني | الرمز الاقتصادي", "Sicil no | Ulusal kimlik | Ekonomik kod", "Registration no | National ID | Economic code"), x: 40, y: 800, w: 515, h: 25, fontSize: 9, color: "#94a3b8", bg: "transparent", border: "transparent", radius: 0, align: "center", bold: false },
    ],
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snap(value, enabled) {
  if (!enabled) return Math.round(value);
  return Math.round(value / 10) * 10;
}

function normalizeConfig(config, kind, language) {
  const fallback = defaultConfigFor(kind, language);
  const source = config && typeof config === "object" ? config : fallback;
  return {
    ...fallback,
    ...source,
    theme: { ...fallback.theme, ...(source.theme || {}) },
    elements: Array.isArray(source.elements) && source.elements.length ? source.elements : fallback.elements,
  };
}

const KIND_LABELS = {
  business_card: { fa: "کارت ویزیت", ar: "بطاقة عمل", tr: "Kartvizit", en: "Business card" },
  letterhead: { fa: "سربرگ", ar: "ترويسة", tr: "Antetli kağıt", en: "Letterhead" },
  banner: { fa: "بنر تبلیغاتی", ar: "لافتة إعلانية", tr: "Reklam banner'ı", en: "Promotional banner" },
};

export default function DocumentDesigner({ kind }) {
  const { language, dir, n } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const kindLabel = KIND_LABELS[kind]?.[language] || KIND_LABELS[kind]?.en || kind;

  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState(tr(`${kindLabel} جدید`, `${kindLabel} جديد`, `Yeni ${kindLabel}`, `New ${kindLabel}`));
  const [config, setConfig] = useState(() => defaultConfigFor(kind, language));
  const [selectedId, setSelectedId] = useState(config.elements[0]?.id || "");
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [zoom, setZoom] = useState(kind === "letterhead" ? 0.8 : 1.6);
  const [showGrid, setShowGrid] = useState(true);
  const [snapGrid, setSnapGrid] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("templateId");
  const [autoLoadedFor, setAutoLoadedFor] = useState(null);

  const page = KIND_PAGE_SIZES[kind];
  const selected = useMemo(() => config.elements.find((x) => x.id === selectedId) || null, [config, selectedId]);

  async function loadTemplates() {
    try {
      const data = await getPdfTemplates(kind);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTemplates([]);
    }
  }

  const stableLoadTemplates = useStableCallback(loadTemplates);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoadTemplates(); }, 0);
    return () => clearTimeout(timer);
  }, [stableLoadTemplates]);

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
      qr: "QR",
      logo: tr("لوگو", "الشعار", "Logo", "Logo"),
    };
    const el = {
      id, type, label: labels[type] || type,
      text: type === "text" ? tr("متن جدید", "نص جديد", "Yeni metin", "New text") : "",
      x: 40, y: 40,
      w: type === "qr" ? 45 : type === "logo" ? 70 : 150,
      h: type === "qr" ? 45 : type === "logo" ? 45 : 40,
      fontSize: 13, color: "#0f172a", bg: type === "box" ? "#ffffff" : "transparent", border: "#cbd5e1", radius: 8, align: "center", bold: false,
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
    const copy = { ...clone(selected), id: `${selected.id}_copy_${Date.now()}`, x: selected.x + 10, y: selected.y + 10 };
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
    setDrag({ id: el.id, startX: e.clientX, startY: e.clientY, x: el.x, y: el.y });
  }

  function onResizeDown(e, el) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    setResize({ id: el.id, startX: e.clientX, startY: e.clientY, w: el.w, h: el.h });
  }

  function onMouseMove(e) {
    if (drag) {
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;
      updateElement(drag.id, {
        x: clamp(snap(drag.x + dx, snapGrid), 0, page.w - 10),
        y: clamp(snap(drag.y + dy, snapGrid), 0, page.h - 10),
      });
    }
    if (resize) {
      const dx = (e.clientX - resize.startX) / zoom;
      const dy = (e.clientY - resize.startY) / zoom;
      updateElement(resize.id, {
        w: Math.max(15, snap(resize.w + dx, snapGrid)),
        h: Math.max(12, snap(resize.h + dy, snapGrid)),
      });
    }
  }

  function stopActions() {
    setDrag(null);
    setResize(null);
  }

  function loadTemplate(tpl) {
    const cfg = normalizeConfig(tpl.config, kind, language);
    setTemplateId(tpl.id);
    setName(tpl.name || name);
    setConfig(cfg);
    setSelectedId(cfg.elements[0]?.id || "");
    setMessage(tr("قالب بارگذاری شد.", "تم تحميل القالب.", "Şablon yüklendi.", "Template loaded."));
  }

  async function saveTemplate() {
    setSaving(true);
    try {
      const result = await savePdfTemplate({ name, page_size: kind, kind, config });
      setTemplateId(result?.id ?? templateId);
      setMessage(tr("ذخیره شد.", "تم الحفظ.", "Kaydedildi.", "Saved."));
      await loadTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(id) {
    if (!window.confirm(tr("حذف شود؟", "هل تريد الحذف؟", "Silinsin mi?", "Delete?"))) return;
    await deletePdfTemplate(id);
    if (id === templateId) setTemplateId(null);
    await loadTemplates();
  }

  async function exportPdf() {
    if (!templateId) {
      setMessage(tr("ابتدا قالب را ذخیره کن.", "احفظ القالب أولاً.", "Önce şablonu kaydedin.", "Save the template first."));
      return;
    }
    try {
      await downloadAuthenticatedFile(`/designer/template/${templateId}/pdf`, `${kind}-${templateId}.pdf`);
    } catch (e) {
      setMessage(e.message);
    }
  }

  function resetTemplate() {
    if (!window.confirm(tr("به حالت پیش‌فرض برگردد؟", "إعادة التعيين؟", "Sıfırlansın mı?", "Reset?"))) return;
    setConfig(clone(defaultConfigFor(kind, language)));
    setTemplateId(null);
  }

  function renderElement(el) {
    if (el.type === "qr") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
          <div className="w-8 h-8 border-2 border-slate-900 grid grid-cols-3 grid-rows-3 gap-0.5 p-0.5">
            <span className="bg-slate-900" /><span /><span className="bg-slate-900" />
            <span /><span className="bg-slate-900" /><span />
            <span className="bg-slate-900" /><span /><span className="bg-slate-900" />
          </div>
        </div>
      );
    }
    if (el.type === "logo") {
      return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-500">LOGO</div>;
    }
    return <div className="whitespace-pre-line w-full">{el.text || el.label}</div>;
  }

  return (
    <div dir={dir} className="min-h-screen p-5 bg-[var(--erp-bg)] text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-3xl font-black text-[var(--erp-accent)]">
            {tr(`استودیوی طراحی ${kindLabel}`, `استوديو تصميم ${kindLabel}`, `${kindLabel} Tasarım Stüdyosu`, `${kindLabel} Studio`)}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {tr("طراحی با کشیدن، تغییر اندازه، لایه‌ها و خروجی PDF آماده چاپ", "التصميم بالسحب، تغيير الحجم، الطبقات، وتصدير PDF جاهز للطباعة", "Sürükleyerek, boyutlandırarak, katmanlarla tasarlayın; baskıya hazır PDF olarak dışa aktarın", "Design by dragging, resizing, layering - export a print-ready PDF")}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link to="/" className="studio-btn bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]"><ArrowLeft size={18} /> {tr("بازگشت به داشبورد", "العودة إلى لوحة التحكم", "Panele dön", "Back to dashboard")}</Link>
          <button onClick={loadTemplates} className="studio-btn bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]"><RefreshCw size={18} /> {tr("دریافت", "تحديث", "Yenile", "Refresh")}</button>
          <button onClick={resetTemplate} className="studio-btn bg-[var(--erp-panel-solid)] text-[var(--erp-text)]"><Trash2 size={18} /> {tr("پیش‌فرض", "إعادة تعيين", "Sıfırla", "Reset")}</button>
          <button onClick={saveTemplate} disabled={saving} className="studio-btn bg-[var(--erp-accent)] text-slate-950"><Save size={18} /> {saving ? "..." : tr("ذخیره", "حفظ", "Kaydet", "Save")}</button>
          <button onClick={exportPdf} className="studio-btn bg-emerald-500 text-emerald-950"><Download size={18} /> PDF</button>
        </div>
      </div>

      {message && <div className="mb-4 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-2xl p-4 font-bold">{message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_320px] gap-5">
        <Panel title={tr("قالب‌ها و ابزار", "القوالب والأدوات", "Şablonlar ve araçlar", "Templates & Tools")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className="studio-input" />
          <div className="text-xs text-[var(--erp-muted)] mb-3">{page.label} ({n(page.w)}x{n(page.h)}pt)</div>

          <div className="grid grid-cols-2 gap-2">
            <ToolButton onClick={() => addElement("text")} label={tr("متن", "نص", "Metin", "Text")} />
            <ToolButton onClick={() => addElement("box")} label={tr("کادر", "مربع", "Kutu", "Box")} />
            <ToolButton onClick={() => addElement("qr")} label="QR" />
            <ToolButton onClick={() => addElement("logo")} label={tr("لوگو", "الشعار", "Logo", "Logo")} />
          </div>

          <div className="pt-4 border-t border-[var(--erp-border)]">
            <div className="text-[var(--erp-accent)] font-black mb-2">{tr("قالب‌های ذخیره‌شده", "القوالب المحفوظة", "Kayıtlı şablonlar", "Saved templates")}</div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
              <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="mini-btn"><Maximize2 size={15} /> -</button>
              <div className="mini-btn text-[var(--erp-accent)]">{language === "fa" ? toPersianDigits(Math.round(zoom * 100)) : Math.round(zoom * 100)}%</div>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="mini-btn"><Maximize2 size={15} /> +</button>
              <button onClick={() => setShowGrid((v) => !v)} className="mini-btn"><Grid3X3 size={15} /> {tr("شبکه", "الشبكة", "Izgara", "Grid")}</button>
              <button onClick={() => setSnapGrid((v) => !v)} className={`mini-btn ${snapGrid ? "text-[var(--erp-accent)]" : "text-[var(--erp-muted)]"}`}>{tr("چفت", "الالتصاق", "Yapışma", "Snap")}</button>
            </div>
          </div>

          <div className="min-w-max flex justify-center pb-20">
            <div
              className="relative bg-white text-slate-950 shadow-2xl origin-top"
              style={{
                width: page.w, height: page.h,
                transform: `scale(${zoom})`,
                backgroundImage: showGrid ? "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)" : "none",
                backgroundSize: "10px 10px",
              }}
            >
              {config.elements.map((el) => (
                <div
                  key={el.id}
                  onMouseDown={(e) => onMouseDown(e, el)}
                  className={`absolute select-none overflow-hidden flex items-center justify-center cursor-move ${selectedId === el.id ? "ring-2 ring-[var(--erp-accent)]" : ""}`}
                  style={{
                    left: el.x, top: el.y, width: el.w, height: el.h,
                    color: el.color, background: el.bg,
                    border: `1px solid ${el.border || "transparent"}`,
                    borderRadius: el.radius, fontSize: el.fontSize,
                    fontWeight: el.bold ? 900 : 500,
                    textAlign: el.align || "center",
                    padding: 4, direction: dir,
                  }}
                >
                  {renderElement(el)}
                  {selectedId === el.id && (
                    <div data-resize="true" onMouseDown={(e) => onResizeDown(e, el)} className="absolute -bottom-1 -right-1 w-3 h-3 bg-[var(--erp-accent)] rounded-full cursor-se-resize border border-white" />
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
              {(selected.type === "text" || selected.type === "box") && (
                <>
                  <label className="text-[var(--erp-accent)] text-sm font-bold">{tr("متن", "النص", "Metin", "Text")}</label>
                  <textarea value={selected.text || ""} onChange={(e) => updateElement(selected.id, { text: e.target.value })} rows={4} className="studio-input" />
                </>
              )}
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
        .studio-input { width: 100%; background: var(--erp-panel-solid); color: var(--erp-text); border: 1px solid var(--erp-border); border-radius: 16px; padding: 12px; outline: none; margin-bottom: 10px; }
        .studio-btn { padding: 12px 16px; border-radius: 16px; font-weight: 900; display: inline-flex; align-items: center; gap: 8px; }
        .mini-btn { background: var(--erp-panel-solid); color: var(--erp-text); padding: 8px 10px; border-radius: 12px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; }
        .tool-wide { width: 100%; background: var(--erp-panel-solid); color: var(--erp-text); border-radius: 16px; padding: 12px; font-weight: 900; display: inline-flex; justify-content: center; align-items: center; gap: 8px; }
      `}</style>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-[var(--erp-panel)] border border-[var(--erp-border)] rounded-3xl p-5 space-y-4">
      <h2 className="text-[var(--erp-accent)] font-black flex gap-2 items-center"><FileText size={20} />{title}</h2>
      {children}
    </div>
  );
}

function ToolButton({ label, onClick }) {
  return (
    <button onClick={onClick} className="bg-[var(--erp-panel-solid)] hover:bg-[var(--erp-glow)] rounded-2xl p-3 font-bold flex justify-center gap-2 items-center">
      <Plus size={16} />{label}
    </button>
  );
}

function Prop({ label, value, onChange }) {
  const { language } = useLanguage();
  const display = value ?? 0;
  return (
    <div>
      <label className="text-[var(--erp-accent)] text-sm font-bold">{label}</label>
      <input type="text" inputMode="numeric" value={language === "fa" ? toPersianDigits(display) : display} onChange={(e) => onChange(cleanNumberInput(e.target.value))} className="studio-input" />
    </div>
  );
}

function Color({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[var(--erp-accent)] text-sm font-bold">{label}</label>
      <input type="color" value={value && value !== "transparent" ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} className="w-full h-11 bg-[var(--erp-panel-solid)] rounded-2xl p-1 mt-1 mb-2" />
    </div>
  );
}
