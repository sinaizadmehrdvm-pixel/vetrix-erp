import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, CheckCircle2, HelpCircle, ListChecks, Sparkles, X } from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { getPageHelp, hasPageHelp } from "../help/pageHelp";
import { helpKeyForPath } from "../help/routeHelpKeys";
import Modal from "./ui/Modal";

// Single injection point (mounted once in layout/MainLayout.jsx) rather
// than a help button pasted into every page - reads the current route,
// looks up frontend/src/help/pageHelp.js, and reuses Modal.jsx's existing
// focus-trap/Escape/aria pattern for the panel. Renders nothing on routes
// without a help entry rather than showing an empty panel.
export default function ContextualHelp() {
  const { pathname } = useLocation();
  const { dir, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const helpKey = helpKeyForPath(pathname);
  if (!helpKey || !hasPageHelp(helpKey)) return null;

  const content = getPageHelp(helpKey, language);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="erp-focus"
        aria-label={tr("راهنمای این صفحه", "مساعدة هذه الصفحة", "Bu sayfa için yardım", "Help for this page")}
        title={tr("راهنما", "مساعدة", "Yardım", "Help")}
        style={{
          position: "fixed",
          bottom: 20,
          insetInlineEnd: 20,
          zIndex: 40,
          width: 46,
          height: 46,
          borderRadius: "999px",
          display: "grid",
          placeItems: "center",
          background: "var(--erp-accent)",
          color: "#071028",
          border: "none",
          boxShadow: "var(--erp-shadow)",
          cursor: "pointer",
        }}
      >
        <HelpCircle size={22} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-md" labelledBy="contextual-help-title" className="ms-auto">
        <div dir={dir} className="p-5 space-y-4" style={{ maxHeight: "80vh", overflowY: "auto" }}>
          <div className="flex items-start justify-between gap-3">
            <h2 id="contextual-help-title" className="text-lg font-black flex items-center gap-2">
              <Sparkles size={18} className="text-[var(--erp-accent)]" />
              {content.title}
            </h2>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg" aria-label={tr("بستن", "إغلاق", "Kapat", "Close")}>
              <X size={18} />
            </button>
          </div>

          {content.purpose && <p className="text-sm" style={{ color: "var(--erp-muted)" }}>{content.purpose}</p>}

          {content.mainActions.length > 0 && (
            <HelpBlock icon={<ListChecks size={16} />} title={tr("اقدامات اصلی", "الإجراءات الرئيسية", "Ana işlemler", "Main actions")} items={content.mainActions} />
          )}
          {content.keyFields.length > 0 && (
            <HelpBlock icon={<CheckCircle2 size={16} />} title={tr("فیلدهای کلیدی", "الحقول الرئيسية", "Anahtar alanlar", "Key fields")} items={content.keyFields} />
          )}
          {content.workflow.length > 0 && (
            <HelpBlock icon={<ListChecks size={16} />} title={tr("روال کار", "سير العمل", "İş akışı", "Common workflow")} items={content.workflow} ordered />
          )}
          {content.warnings.length > 0 && (
            <HelpBlock icon={<AlertTriangle size={16} className="text-amber-400" />} title={tr("نکات مهم", "تنبيهات", "Uyarılar", "Warnings")} items={content.warnings} tone="warning" />
          )}
        </div>
      </Modal>
    </>
  );
}

function HelpBlock({ icon, title, items, ordered = false, tone }) {
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-bold mb-1.5" style={{ color: tone === "warning" ? "#fbbf24" : "var(--erp-text)" }}>
        {icon}
        {title}
      </div>
      <ListTag className={ordered ? "list-decimal ps-5 space-y-1" : "list-disc ps-5 space-y-1"} style={{ fontSize: 13, color: "var(--erp-muted)" }}>
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ListTag>
    </div>
  );
}
