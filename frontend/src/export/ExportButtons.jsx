import { FileSpreadsheet, FileText } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { API_URL } from "../services/api";

export default function ExportButtons() {
  const { t, language } = useLanguage();

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        direction: language === "fa" ? "rtl" : "ltr",
      }}
    >
      <a
        href={`${API_URL}/export/invoices-excel`}
        target="_blank"
        style={btn}
      >
        <FileSpreadsheet size={18} />
        {t.exportExcel}
      </a>

      <a
        href={`${API_URL}/export/invoices-pdf`}
        target="_blank"
        style={btn}
      >
        <FileText size={18} />
        {t.exportPdf}
      </a>
    </div>
  );
}

const btn = {
  background: "var(--erp-accent)",
  color: "#071028",
  padding: "12px 18px",
  borderRadius: 16,
  textDecoration: "none",
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  gap: 10,
  boxShadow: "0 10px 30px var(--erp-glow)",
};