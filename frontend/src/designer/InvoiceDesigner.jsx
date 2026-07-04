import { useEffect, useState } from "react";
import {
  Save,
  RefreshCw,
  FileText,
  Move,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Grid3X3,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  getPdfTemplates,
  savePdfTemplate,
  deletePdfTemplate,
} from "../services/api";
import { useLanguage } from "../localization/LanguageContext";

const defaultConfig = {
  page_size: "A4",
  theme: { primary: "#0f172a", accent: "#06b6d4" },
  elements: [
    { id: "logo", type: "logo", label: "لوگو", text: "LOGO", x: 40, y: 35, w: 90, h: 45, fontSize: 12, color: "#0f172a", bg: "#ecfeff", border: "#bae6fd", radius: 12, align: "center", bold: false },
    { id: "title", type: "text", label: "عنوان فاکتور", text: "فاکتور فروش", x: 330, y: 40, w: 180, h: 40, fontSize: 20, color: "#0f172a", bg: "#ffffff", border: "#e2e8f0", radius: 10, align: "center", bold: true },
    { id: "company", type: "text", label: "نام شرکت", text: "Vetrix ERP", x: 60, y: 95, w: 180, h: 35, fontSize: 14, color: "#0891b2", bg: "#ffffff", border: "#e2e8f0", radius: 10, align: "center", bold: true },
    { id: "customer", type: "box", label: "اطلاعات طرف حساب", text: "اطلاعات طرف حساب", x: 310, y: 160, w: 230, h: 80, fontSize: 13, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 14, align: "center", bold: false },
    { id: "table", type: "table", label: "جدول اقلام", text: "جدول اقلام فاکتور", x: 55, y: 270, w: 490, h: 130, fontSize: 13, color: "#0f172a", bg: "#ffffff", border: "#94a3b8", radius: 10, align: "center", bold: true },
    { id: "totals", type: "box", label: "جمع فاکتور", text: "جمع فاکتور", x: 55, y: 430, w: 240, h: 120, fontSize: 14, color: "#0891b2", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "center", bold: true },
    { id: "qr", type: "qr", label: "QR Code", text: "QR", x: 390, y: 470, w: 90, h: 90, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
    { id: "footer", type: "text", label: "متن پایین", text: "سلام و عرض ادب", x: 220, y: 650, w: 180, h: 35, fontSize: 13, color: "#334155", bg: "#ffffff", border: "#e2e8f0", radius: 10, align: "center", bold: false },
  ],
};

function pageSize(size) {
  if (size === "A5") return { w: 420, h: 600 };
  if (size === "THERMAL80") return { w: 280, h: 760 };
  if (size === "THERMAL58") return { w: 220, h: 760 };
  return { w: 620, h: 820 };
}

export default function InvoiceDesigner() {
  const { language, dir } = useLanguage();
  const fa = language === "fa";

  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState("قالب طراحی فاکتور");
  const [config, setConfig] = useState(defaultConfig);
  const [selectedId, setSelectedId] = useState("logo");
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  const selected = config.elements.find((x) => x.id === selectedId);
  const size = pageSize(config.page_size);

  async function loadTemplates() {
    const data = await getPdfTemplates();
    setTemplates(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  function updateElement(id, patch) {
    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id === id ? { ...el, ...patch } : el
      ),
    }));
  }

  function addElement(type) {
    const id = `${type}_${Date.now()}`;
    const el = {
      id,
      type,
      label: type,
      text: type === "text" ? "متن جدید" : type === "qr" ? "QR" : "بخش جدید",
      x: 80,
      y: 80,
      w: type === "qr" ? 80 : 160,
      h: type === "qr" ? 80 : 50,
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

    const nextElements = config.elements.filter((x) => x.id !== selected.id);

    setConfig((prev) => ({
      ...prev,
      elements: nextElements,
    }));

    setSelectedId(nextElements[0]?.id || "");
  }

  function duplicateSelected() {
    if (!selected) return;

    const copy = {
      ...selected,
      id: `${selected.id}_copy_${Date.now()}`,
      label: `${selected.label} کپی`,
      x: selected.x + 20,
      y: selected.y + 20,
    };

    setConfig((prev) => ({
      ...prev,
      elements: [...prev.elements, copy],
    }));

    setSelectedId(copy.id);
  }

  function bringToFront() {
    if (!selected) return;

    setConfig((prev) => ({
      ...prev,
      elements: [
        ...prev.elements.filter((x) => x.id !== selected.id),
        selected,
      ],
    }));
  }

  function sendToBack() {
    if (!selected) return;

    setConfig((prev) => ({
      ...prev,
      elements: [
        selected,
        ...prev.elements.filter((x) => x.id !== selected.id),
      ],
    }));
  }

  function onMouseDown(e, el) {
    if (e.target.dataset.resize === "true") return;

    setSelectedId(el.id);
    setDrag({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      originalX: el.x,
      originalY: el.y,
    });
  }

  function onResizeDown(e, el) {
    e.stopPropagation();
    setSelectedId(el.id);
    setResize({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      originalW: el.w,
      originalH: el.h,
    });
  }

  function onMouseMove(e) {
    if (drag) {
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;

      updateElement(drag.id, {
        x: Math.max(0, Math.min(size.w - 20, drag.originalX + dx)),
        y: Math.max(0, Math.min(size.h - 20, drag.originalY + dy)),
      });
    }

    if (resize) {
      const dx = (e.clientX - resize.startX) / zoom;
      const dy = (e.clientY - resize.startY) / zoom;

      updateElement(resize.id, {
        w: Math.max(30, resize.originalW + dx),
        h: Math.max(25, resize.originalH + dy),
      });
    }
  }

  function stopActions() {
    setDrag(null);
    setResize(null);
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

  async function deleteTemplate(id) {
    if (!window.confirm(fa ? "این قالب حذف شود؟" : "Delete this template?")) return;

    await deletePdfTemplate(id);
    setMessage(fa ? "قالب حذف شد." : "Template deleted.");
    await loadTemplates();
  }

  function loadTemplate(tpl) {
    setName(tpl.name || "قالب طراحی فاکتور");
    setConfig(tpl.config || defaultConfig);
    setSelectedId((tpl.config?.elements || [])[0]?.id || "logo");
  }

  return (
    <div dir={dir} className="min-h-screen p-5 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-4xl font-black text-cyan-400">
            {fa ? "طراح حرفه‌ای فاکتور" : "Invoice Designer"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa
              ? "Drag، Resize، رنگ، فونت، لایه‌ها، زوم و ذخیره قالب PDF"
              : "Drag, resize, style, layers, zoom and save PDF templates"}
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={loadTemplates} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex gap-2">
            <RefreshCw size={18} /> {fa ? "دریافت" : "Refresh"}
          </button>

          <button onClick={saveTemplate} className="px-4 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex gap-2">
            <Save size={18} /> {fa ? "ذخیره قالب" : "Save"}
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-2xl p-4 font-bold">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[290px_1fr_310px] gap-5">
        <Panel title={fa ? "قالب‌ها و ابزار" : "Templates"}>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />

          <select value={config.page_size} onChange={(e) => setConfig({ ...config, page_size: e.target.value })} className="input">
            <option value="A4">A4</option>
            <option value="A5">A5</option>
            <option value="THERMAL80">Thermal 80</option>
            <option value="THERMAL58">Thermal 58</option>
          </select>

          <div className="grid grid-cols-2 gap-2">
            <ToolButton onClick={() => addElement("text")} label={fa ? "متن" : "Text"} />
            <ToolButton onClick={() => addElement("box")} label={fa ? "کادر" : "Box"} />
            <ToolButton onClick={() => addElement("table")} label={fa ? "جدول" : "Table"} />
            <ToolButton onClick={() => addElement("qr")} label="QR" />
          </div>

          <div className="space-y-2 pt-3">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-2">
                <button
                  onClick={() => loadTemplate(tpl)}
                  className="flex-1 text-right bg-slate-800 hover:bg-slate-700 rounded-2xl p-3 text-white"
                >
                  {tpl.name}
                </button>

                <button
                  onClick={() => deleteTemplate(tpl.id)}
                  className="bg-red-600 hover:bg-red-700 rounded-2xl px-3 py-3 text-white font-bold"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <div
          className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 overflow-auto"
          onMouseMove={onMouseMove}
          onMouseUp={stopActions}
          onMouseLeave={stopActions}
        >
          <div className="mb-3 text-cyan-300 font-black flex gap-2">
            <Move /> {fa ? "صفحه طراحی" : "Canvas"}
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className="bg-slate-800 rounded-xl px-3 py-2">
              <ZoomOut size={16} />
            </button>

            <div className="bg-slate-800 rounded-xl px-3 py-2 text-cyan-200 font-bold">
              {Math.round(zoom * 100)}%
            </div>

            <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="bg-slate-800 rounded-xl px-3 py-2">
              <ZoomIn size={16} />
            </button>

            <button onClick={() => setShowGrid((v) => !v)} className="bg-slate-800 rounded-xl px-3 py-2 flex gap-2">
              <Grid3X3 size={16} />
              Grid
            </button>
          </div>

          <div
            className="relative mx-auto bg-white shadow-2xl origin-top"
            style={{
              width: size.w,
              height: size.h,
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
                className={`absolute cursor-move select-none flex items-center justify-center ${
                  selectedId === el.id ? "ring-2 ring-cyan-500" : ""
                }`}
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  color: el.color,
                  background: el.bg,
                  border: `1px solid ${el.border}`,
                  borderRadius: el.radius,
                  fontSize: el.fontSize,
                  fontWeight: el.bold ? 900 : 500,
                  textAlign: el.align,
                  padding: 6,
                }}
              >
                {el.text || el.label}

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

        <Panel title={fa ? "تنظیمات جزء" : "Properties"}>
          {selected ? (
            <>
              <div className="font-black text-cyan-300">{selected.label}</div>

              <Prop label="X" value={selected.x} onChange={(v) => updateElement(selected.id, { x: Number(v) })} />
              <Prop label="Y" value={selected.y} onChange={(v) => updateElement(selected.id, { y: Number(v) })} />
              <Prop label="W" value={selected.w} onChange={(v) => updateElement(selected.id, { w: Number(v) })} />
              <Prop label="H" value={selected.h} onChange={(v) => updateElement(selected.id, { h: Number(v) })} />

              <Prop label={fa ? "متن" : "Text"} value={selected.text || ""} onChange={(v) => updateElement(selected.id, { text: v })} />
              <Prop label={fa ? "سایز فونت" : "Font size"} value={selected.fontSize} onChange={(v) => updateElement(selected.id, { fontSize: Number(v) })} />

              <Color label={fa ? "رنگ متن" : "Color"} value={selected.color} onChange={(v) => updateElement(selected.id, { color: v })} />
              <Color label={fa ? "پس‌زمینه" : "Background"} value={selected.bg} onChange={(v) => updateElement(selected.id, { bg: v })} />
              <Color label={fa ? "رنگ خط دور" : "Border"} value={selected.border} onChange={(v) => updateElement(selected.id, { border: v })} />

              <Prop label={fa ? "گردی گوشه" : "Radius"} value={selected.radius} onChange={(v) => updateElement(selected.id, { radius: Number(v) })} />

              <select value={selected.align} onChange={(e) => updateElement(selected.id, { align: e.target.value })} className="input">
                <option value="right">راست</option>
                <option value="center">وسط</option>
                <option value="left">چپ</option>
              </select>

              <label className="bg-slate-800 rounded-2xl p-3 flex justify-between">
                <span>Bold</span>
                <input type="checkbox" checked={!!selected.bold} onChange={(e) => updateElement(selected.id, { bold: e.target.checked })} />
              </label>

              <div className="grid grid-cols-1 gap-2">
                <button onClick={duplicateSelected} className="w-full px-4 py-3 rounded-2xl bg-slate-800 text-white font-bold flex justify-center gap-2">
                  <Copy size={18} /> {fa ? "کپی از جزء" : "Duplicate"}
                </button>

                <button onClick={bringToFront} className="w-full px-4 py-3 rounded-2xl bg-slate-800 text-white font-bold flex justify-center gap-2">
                  <ArrowUp size={18} /> {fa ? "آوردن به جلو" : "Bring front"}
                </button>

                <button onClick={sendToBack} className="w-full px-4 py-3 rounded-2xl bg-slate-800 text-white font-bold flex justify-center gap-2">
                  <ArrowDown size={18} /> {fa ? "فرستادن به عقب" : "Send back"}
                </button>
              </div>

              <button onClick={deleteSelected} className="w-full px-4 py-3 rounded-2xl bg-red-500 text-white font-black flex justify-center gap-2">
                <Trash2 size={18} /> {fa ? "حذف جزء" : "Delete"}
              </button>
            </>
          ) : (
            <div className="text-slate-400">یک جزء را انتخاب کن.</div>
          )}
        </Panel>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: #1e293b;
          color: white;
          border: 1px solid rgba(34,211,238,.16);
          border-radius: 16px;
          padding: 12px;
          outline: none;
          margin-bottom: 10px;
        }
      `}</style>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-slate-900/70 border border-cyan-500/20 rounded-3xl p-5 space-y-4">
      <h2 className="text-cyan-300 font-black flex gap-2">
        <FileText size={20} /> {title}
      </h2>
      {children}
    </div>
  );
}

function ToolButton({ label, onClick }) {
  return (
    <button onClick={onClick} className="bg-slate-800 hover:bg-slate-700 rounded-2xl p-3 font-bold flex justify-center gap-2">
      <Plus size={16} /> {label}
    </button>
  );
}

function Prop({ label, value, onChange }) {
  return (
    <div>
      <label className="text-cyan-200 text-sm">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </div>
  );
}

function Color({ label, value, onChange }) {
  return (
    <div>
      <label className="text-cyan-200 text-sm">{label}</label>
      <input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} className="w-full h-11 bg-slate-800 rounded-2xl p-1 mt-1 mb-2" />
    </div>
  );
}