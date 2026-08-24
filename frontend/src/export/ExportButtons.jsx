import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { downloadAuthenticatedFile } from "../services/api";

export default function ExportButtons() {
  const { t, language } = useLanguage();
  const fa = language === "fa";
  const [busy, setBusy] = useState("");

  async function handleDownload(kind) {
    setBusy(kind);
    try {
      if (kind === "excel") {
        await downloadAuthenticatedFile(`/export/invoices-excel?language=${language}`, "vetrix_invoices.xlsx");
      } else {
        await downloadAuthenticatedFile(`/export/invoices-pdf?language=${language}`, "vetrix_invoices.pdf");
      }
    } catch (error) {
      toast.error(
        error.message ||
          (fa
            ? "دانلود انجام نشد."
            : language === "ar"
            ? "فشل التنزيل."
            : language === "tr"
            ? "İndirme başarısız oldu."
            : "Download failed.")
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        direction: language === "fa" ? "rtl" : "ltr",
      }}
    >
      <button type="button" onClick={() => handleDownload("excel")} disabled={busy !== ""} style={{ ...btn, opacity: busy && busy !== "excel" ? 0.6 : 1 }}>
        {busy === "excel" ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
        {t.exportExcel}
      </button>

      <button type="button" onClick={() => handleDownload("pdf")} disabled={busy !== ""} style={{ ...btn, opacity: busy && busy !== "pdf" ? 0.6 : 1 }}>
        {busy === "pdf" ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
        {t.exportPdf}
      </button>
    </div>
  );
}

const btn = {
  background: "var(--erp-accent)",
  color: "#071028",
  padding: "12px 18px",
  borderRadius: 16,
  border: "none",
  textDecoration: "none",
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  gap: 10,
  boxShadow: "0 10px 30px var(--erp-glow)",
  cursor: "pointer",
};
