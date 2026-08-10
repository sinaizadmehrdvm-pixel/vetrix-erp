import { useLanguage } from "../../localization/useLanguage";

// Standard report footer (Task 02 Section 9): generation metadata,
// optional confidentiality label, and a page-number hook for print (see
// .erp-report-page-number / .erp-report-footer in index.css's @media
// print block). Screen-visible too, at low emphasis, so what prints
// matches what was reviewed on screen.
export default function ReportFooter({ confidential = false }) {
  const { dir, language, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  return (
    <footer
      dir={dir}
      className="erp-report-footer"
      style={{ marginTop: 24, paddingTop: 10, borderTop: "1px solid var(--erp-border)", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 11, color: "var(--erp-muted)" }}
    >
      <span>Vetrix ERP · {date(new Date())}</span>
      {confidential && <span>{tr("محرمانه - فقط برای استفاده داخلی", "سري - للاستخدام الداخلي فقط", "Gizli - yalnızca dahili kullanım için", "Confidential - internal use only")}</span>}
      <span className="erp-report-page-number" />
    </footer>
  );
}
