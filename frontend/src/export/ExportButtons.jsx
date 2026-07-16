import { FileSpreadsheet, FileText } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function ExportButtons() {
  const API = "http://127.0.0.1:8001";

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
        href={`${API}/export/invoices-excel`}
        target="_blank"
        style={btn}
      >
        <FileSpreadsheet size={18} />
        {t.exportExcel}
      </a>

      <a
        href={`${API}/export/invoices-pdf`}
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
  background: "#22d3ee",
  color: "#071028",
  padding: "12px 18px",
  borderRadius: 16,
  textDecoration: "none",
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  gap: 10,
  boxShadow: "0 10px 30px rgba(34,211,238,0.25)",
};