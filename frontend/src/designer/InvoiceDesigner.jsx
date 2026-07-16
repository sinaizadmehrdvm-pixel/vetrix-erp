import { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  ArrowDown,
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

const PAGE_SIZES = {
  A4: { w: 620, h: 820, label: "A4" },
  A5: { w: 440, h: 620, label: "A5" },
  THERMAL80: { w: 300, h: 850, label: "Thermal 80" },
  THERMAL58: { w: 230, h: 850, label: "Thermal 58" },
};

const DEFAULT_CONFIG = {
  page_size: "A4",
  theme: { primary: "#0f172a", accent: "#06b6d4" },
  elements: [
    { id: "logo", type: "logo", label: "لوگو", text: "LOGO", x: 40, y: 35, w: 90, h: 45, fontSize: 12, color: "#0f172a", bg: "#ecfeff", border: "#bae6fd", radius: 12, align: "center", bold: true },
    { id: "title", type: "text", label: "عنوان فاکتور", text: "فاکتور فروش", x: 340, y: 40, w: 190, h: 45, fontSize: 22, color: "#0f172a", bg: "#ffffff", border: "#ffffff", radius: 10, align: "center", bold: true },
    { id: "company", type: "text", label: "نام شرکت", text: "Vetrix ERP\nسیستم حسابداری و مدیریت فروش", x: 60, y: 95, w: 250, h: 60, fontSize: 14, color: "#0891b2", bg: "#ffffff", border: "#e2e8f0", radius: 10, align: "center", bold: true },
    { id: "invoiceInfo", type: "box", label: "اطلاعات فاکتور", text: "شماره: {{invoice_id}}\nتاریخ: {{invoice_date}}\nوضعیت: {{payment_status}}", x: 370, y: 120, w: 180, h: 90, fontSize: 13, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
    { id: "customer", type: "box", label: "طرف حساب", text: "طرف حساب\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}", x: 55, y: 170, w: 280, h: 95, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 14, align: "right", bold: false },
    { id: "table", type: "table", label: "جدول اقلام", text: "جدول اقلام فاکتور", x: 55, y: 300, w: 505, h: 150, fontSize: 13, color: "#0f172a", bg: "#ffffff", border: "#94a3b8", radius: 10, align: "center", bold: true },
    { id: "totals", type: "totals", label: "جمع فاکتور", text: "جمع جزء: {{subtotal}}\nتخفیف: {{discount}}\nمالیات: {{tax}}\nمبلغ نهایی: {{total}}", x: 55, y: 480, w: 250, h: 130, fontSize: 14, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
    { id: "qr", type: "qr", label: "QR Code", text: "QR", x: 420, y: 500, w: 90, h: 90, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
    { id: "signature", type: "box", label: "امضا", text: "امضاء فروشنده / حسابدار", x: 55, y: 650, w: 210, h: 70, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
    { id: "stamp", type: "box", label: "مهر", text: "مهر شرکت / امضاء طرف حساب", x: 350, y: 650, w: 210, h: 70, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
    { id: "footer", type: "text", label: "متن پایین", text: "با تشکر از اعتماد شما", x: 210, y: 765, w: 200, h: 35, fontSize: 13, color: "#334155", bg: "transparent", border: "transparent", radius: 0, align: "center", bold: true },
  ],
};

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

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...source,
    theme: { ...DEFAULT_CONFIG.theme, ...(source.theme || {}) },
    elements: Array.isArray(source.elements) && source.elements.length ? source.elements : DEFAULT_CONFIG.elements,
  };
}

export default function InvoiceDesigner() {
  const { language, dir } = useLanguage();
  const fa = language === "fa";

  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState(fa ? "قالب رسمی فاکتور" : "Official invoice template");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [selectedId, setSelectedId] = useState("title");
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [zoom, setZoom] = useState(0.95);
  const [showGrid, setShowGrid] = useState(true);
  const [snapGrid, setSnapGrid] = useState(true);
  const [message, setMessage] = useState("");

  const page = pageSize(config.page_size);
  const selected = useMemo(() => config.elements.find((x) => x.id === selectedId) || null, [config, selectedId]);

  async function loadTemplates() {
    try {
      const data = await getPdfTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTemplates([]);
      setMessage(fa ? "خطا در دریافت قالب‌ها" : "Template loading error");
    }
  }

  const stableLoadTemplates = useStableCallback(loadTemplates);

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
      text: fa ? "متن جدید" : "Text",
      box: fa ? "کادر جدید" : "Box",
      table: fa ? "جدول اقلام" : "Items table",
      totals: fa ? "جمع فاکتور" : "Totals",
      qr: "QR",
      barcode: "Barcode",
      logo: fa ? "لوگو" : "Logo",
    };

    const el = {
      id,
      type,
      label: labels[type] || type,
      text: type === "text" ? (fa ? "متن جدید" : "New text") : labels[type] || type,
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
    const copy = { ...clone(selected), id: `${selected.id}_copy_${Date.now()}`, label: `${selected.label} کپی`, x: selected.x + 20, y: selected.y + 20 };
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
    const cfg = normalizeConfig(tpl.config);
    setName(tpl.name || name);
    setConfig(cfg);
    setSelectedId(cfg.elements[0]?.id || "");
    setMessage(fa ? "قالب بارگذاری شد." : "Template loaded.");
  }

  async function saveTemplate() {
    await savePdfTemplate({
      name,
      page_size: config.page_size,
      config,
    });
    setMessage(fa ? "قالب با موفقیت ذخیره شد." : "Template saved.");
    await loadTemplates();
  }

  async function removeTemplate(id) {
    if (!window.confirm(fa ? "قالب حذف شود؟" : "Delete template?")) return;
    await deletePdfTemplate(id);
    setMessage(fa ? "قالب حذف شد." : "Template deleted.");
    await loadTemplates();
  }

  function resetTemplate() {
    if (!window.confirm(fa ? "قالب به حالت پیش‌فرض برگردد؟" : "Reset template?")) return;
    const cfg = clone(DEFAULT_CONFIG);
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
              <th className="border p-1">{fa ? "شرح" : "Item"}</th>
              <th className="border p-1">{fa ? "تعداد" : "Qty"}</th>
              <th className="border p-1">{fa ? "قیمت" : "Price"}</th>
              <th className="border p-1">{fa ? "جمع" : "Total"}</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i}>
                <td className="border p-1">{i}</td>
                <td className="border p-1">{fa ? "نمونه کالا" : "Sample item"}</td>
                <td className="border p-1">1</td>
                <td className="border p-1">100,000</td>
                <td className="border p-1">100,000</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (el.type === "totals") {
      return (
        <div className="w-full text-[12px] leading-7">
          <div className="flex justify-between"><span>{fa ? "جمع جزء" : "Subtotal"}</span><b>300,000</b></div>
          <div className="flex justify-between"><span>{fa ? "تخفیف" : "Discount"}</span><b>0</b></div>
          <div className="flex justify-between text-cyan-700 font-black"><span>{fa ? "نهایی" : "Total"}</span><b>300,000</b></div>
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
          <small>VETRIX</small>
        </div>
      );
    }

    return <div className="whitespace-pre-line w-full">{el.text || el.label}</div>;
  }

  return (
    <div dir={dir} className="min-h-screen p-5 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-4xl font-black text-cyan-400">
            {fa ? "استودیوی حرفه‌ای طراحی فاکتور" : "Professional Invoice Studio"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa ? "طراحی قالب چاپ با Drag، Resize، لایه‌ها، سایزهای مختلف و ذخیره قالب" : "Drag, resize, layers, multiple page sizes and saved templates"}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button onClick={loadTemplates} className="studio-btn bg-slate-800 text-cyan-200"><RefreshCw size={18} /> {fa ? "دریافت" : "Refresh"}</button>
          <button onClick={resetTemplate} className="studio-btn bg-slate-800 text-white"><Trash2 size={18} /> {fa ? "پیش‌فرض" : "Reset"}</button>
          <button onClick={saveTemplate} className="studio-btn bg-cyan-400 text-slate-950"><Save size={18} /> {fa ? "ذخیره قالب" : "Save"}</button>
        </div>
      </div>

      {message && <div className="mb-4 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-2xl p-4 font-bold">{message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[310px_1fr_320px] gap-5">
        <Panel title={fa ? "قالب‌ها و ابزار" : "Templates & Tools"}>
          <input value={name} onChange={(e) => setName(e.target.value)} className="studio-input" />

          <select value={config.page_size} onChange={(e) => setConfig((p) => ({ ...p, page_size: e.target.value }))} className="studio-input">
            {Object.entries(PAGE_SIZES).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <ToolButton onClick={() => addElement("text")} label={fa ? "متن" : "Text"} />
            <ToolButton onClick={() => addElement("box")} label={fa ? "کادر" : "Box"} />
            <ToolButton onClick={() => addElement("table")} label={fa ? "جدول" : "Table"} />
            <ToolButton onClick={() => addElement("totals")} label={fa ? "جمع" : "Totals"} />
            <ToolButton onClick={() => addElement("qr")} label="QR" />
            <ToolButton onClick={() => addElement("barcode")} label="Barcode" />
            <ToolButton onClick={() => addElement("logo")} label={fa ? "لوگو" : "Logo"} />
          </div>

          <div className="pt-4 border-t border-cyan-400/10">
            <div className="text-cyan-300 font-black mb-2">{fa ? "قالب‌های ذخیره‌شده" : "Saved templates"}</div>
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {templates.map((tpl) => (
                <div key={tpl.id} className="flex gap-2">
                  <button onClick={() => loadTemplate(tpl)} className="flex-1 text-right bg-slate-800 hover:bg-slate-700 rounded-2xl p-3">
                    {tpl.name}
                  </button>
                  <button onClick={() => removeTemplate(tpl.id)} className="px-3 rounded-2xl bg-red-500/80 text-white font-black">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {templates.length === 0 && <div className="text-slate-500 text-sm">{fa ? "قالبی ذخیره نشده است." : "No templates yet."}</div>}
            </div>
          </div>
        </Panel>

        <div
          className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 overflow-auto"
          onMouseMove={onMouseMove}
          onMouseUp={stopActions}
          onMouseLeave={stopActions}
        >
          <div className="flex justify-between items-center gap-3 flex-wrap mb-4">
            <div className="text-cyan-300 font-black flex gap-2 items-center"><Move /> {fa ? "صفحه طراحی" : "Canvas"}</div>
            <div className="flex gap-2">
              <button onClick={() => setZoom((z) => Math.max(0.45, z - 0.1))} className="mini-btn"><Maximize2 size={15} /> -</button>
              <div className="mini-btn text-cyan-200">{Math.round(zoom * 100)}%</div>
              <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} className="mini-btn"><Maximize2 size={15} /> +</button>
              <button onClick={() => setShowGrid((v) => !v)} className="mini-btn"><Grid3X3 size={15} /> Grid</button>
              <button onClick={() => setSnapGrid((v) => !v)} className={`mini-btn ${snapGrid ? "text-cyan-300" : "text-slate-400"}`}>Snap</button>
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
                  className={`absolute select-none overflow-hidden flex items-center justify-center cursor-move ${selectedId === el.id ? "ring-2 ring-cyan-500" : ""}`}
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
                    direction: fa ? "rtl" : "ltr",
                  }}
                >
                  {renderElement(el)}

                  {selectedId === el.id && (
                    <div
                      data-resize="true"
                      onMouseDown={(e) => onResizeDown(e, el)}
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-cyan-500 rounded-full cursor-se-resize border border-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Panel title={fa ? "تنظیمات بخش" : "Properties"}>
          {selected ? (
            <>
              <div className="font-black text-cyan-300">{selected.label || selected.type}</div>

              <div className="grid grid-cols-2 gap-2">
                <Prop label="X" value={selected.x} onChange={(v) => updateElement(selected.id, { x: Number(v) })} />
                <Prop label="Y" value={selected.y} onChange={(v) => updateElement(selected.id, { y: Number(v) })} />
                <Prop label="W" value={selected.w} onChange={(v) => updateElement(selected.id, { w: Number(v) })} />
                <Prop label="H" value={selected.h} onChange={(v) => updateElement(selected.id, { h: Number(v) })} />
              </div>

              <label className="text-cyan-200 text-sm font-bold">{fa ? "متن" : "Text"}</label>
              <textarea value={selected.text || ""} onChange={(e) => updateElement(selected.id, { text: e.target.value })} rows={4} className="studio-input" />

              <Prop label={fa ? "سایز فونت" : "Font size"} value={selected.fontSize} onChange={(v) => updateElement(selected.id, { fontSize: Number(v) })} />
              <Prop label={fa ? "گردی گوشه" : "Radius"} value={selected.radius} onChange={(v) => updateElement(selected.id, { radius: Number(v) })} />

              <Color label={fa ? "رنگ متن" : "Color"} value={selected.color} onChange={(v) => updateElement(selected.id, { color: v })} />
              <Color label={fa ? "پس‌زمینه" : "Background"} value={selected.bg} onChange={(v) => updateElement(selected.id, { bg: v })} />
              <Color label={fa ? "خط دور" : "Border"} value={selected.border} onChange={(v) => updateElement(selected.id, { border: v })} />

              <select value={selected.align || "center"} onChange={(e) => updateElement(selected.id, { align: e.target.value })} className="studio-input">
                <option value="right">{fa ? "راست" : "Right"}</option>
                <option value="center">{fa ? "وسط" : "Center"}</option>
                <option value="left">{fa ? "چپ" : "Left"}</option>
              </select>

              <label className="bg-slate-800 rounded-2xl p-3 flex justify-between">
                <span>Bold</span>
                <input type="checkbox" checked={!!selected.bold} onChange={(e) => updateElement(selected.id, { bold: e.target.checked })} />
              </label>

              <div className="grid grid-cols-1 gap-2">
                <button onClick={duplicateSelected} className="tool-wide"><Copy size={16} /> {fa ? "کپی" : "Duplicate"}</button>
                <button onClick={bringToFront} className="tool-wide"><ArrowUp size={16} /> {fa ? "آوردن جلو" : "Bring front"}</button>
                <button onClick={sendToBack} className="tool-wide"><ArrowDown size={16} /> {fa ? "فرستادن عقب" : "Send back"}</button>
                <button onClick={deleteSelected} className="tool-wide bg-red-500 text-white"><Trash2 size={16} /> {fa ? "حذف بخش" : "Delete"}</button>
              </div>
            </>
          ) : (
            <div className="text-slate-400">{fa ? "یک بخش را انتخاب کن." : "Select an element."}</div>
          )}
        </Panel>
      </div>

      <style>{`
        .studio-input {
          width: 100%;
          background: #1e293b;
          color: white;
          border: 1px solid rgba(34,211,238,.16);
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
          background: #1e293b;
          padding: 8px 10px;
          border-radius: 12px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .tool-wide {
          width: 100%;
          background: #1e293b;
          color: white;
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
    <div className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 space-y-4">
      <h2 className="text-cyan-300 font-black flex gap-2 items-center">
        <FileText size={20} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function ToolButton({ label, onClick }) {
  return (
    <button onClick={onClick} className="bg-slate-800 hover:bg-slate-700 rounded-2xl p-3 font-bold flex justify-center gap-2 items-center">
      <Plus size={16} />
      {label}
    </button>
  );
}

function Prop({ label, value, onChange }) {
  return (
    <div>
      <label className="text-cyan-200 text-sm font-bold">{label}</label>
      <input type="number" value={value ?? 0} onChange={(e) => onChange(e.target.value)} className="studio-input" />
    </div>
  );
}

function Color({ label, value, onChange }) {
  return (
    <div>
      <label className="text-cyan-200 text-sm font-bold">{label}</label>
      <input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} className="w-full h-11 bg-slate-800 rounded-2xl p-1 mt-1 mb-2" />
    </div>
  );
}
