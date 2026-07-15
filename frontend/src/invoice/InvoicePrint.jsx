import { FileText, QrCode, Printer, ShieldCheck } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function InvoicePrint({ invoice }) {
  const { t, money, n, dir, language } = useLanguage();

  if (!invoice) return null;

  const paymentStatus =
    invoice.payment_status === "paid"
      ? language === "fa"
        ? "تسویه شده"
        : "Paid"
      : invoice.payment_status === "partial"
      ? language === "fa"
        ? "پرداخت جزئی"
        : "Partial"
      : language === "fa"
      ? "پرداخت نشده"
      : "Unpaid";

  const printPreview = () => {
    window.print();
  };

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.72)",
        border: "1px solid rgba(34,211,238,0.22)",
        borderRadius: 28,
        padding: 24,
        color: "white",
        direction: dir,
        boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div>
          <h2
            style={{
              color: "#22d3ee",
              fontSize: 26,
              fontWeight: 900,
              marginBottom: 6,
            }}
          >
            {language === "fa" ? "پیش‌نمایش فاکتور" : "Invoice Preview"}
          </h2>

          <p style={{ color: "#94a3b8" }}>
            {language === "fa"
              ? "نسخه آماده چاپ و بررسی نهایی فاکتور"
              : "Printable invoice preview and final review"}
          </p>
        </div>

        <button
          onClick={printPreview}
          style={{
            border: "none",
            borderRadius: 16,
            padding: "12px 18px",
            background: "#22d3ee",
            color: "#071028",
            fontWeight: 900,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Printer size={18} />
          {t("printInvoice")}
        </button>
      </div>

      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24,
          padding: 22,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 20,
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <FileText color="#22d3ee" />
              <strong style={{ fontSize: 22 }}>{t("invoiceSystem")}</strong>
            </div>

            <div style={{ color: "#94a3b8", lineHeight: 1.9 }}>
              <div>
                {language === "fa" ? "شماره فاکتور" : "Invoice ID"}: #
                {n(invoice.id)}
              </div>
              <div>
                {t("customer")}: {invoice.customerName || "-"}
              </div>
              <div>
                {t("status")}:{" "}
                <span style={{ color: "#22c55e", fontWeight: 900 }}>
                  {paymentStatus}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              justifySelf: dir === "rtl" ? "start" : "end",
              width: 120,
              height: 120,
              borderRadius: 20,
              border: "1px dashed rgba(34,211,238,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#22d3ee",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <QrCode size={38} />
            <span style={{ fontSize: 12 }}>
              {language === "fa" ? "QR فاکتور" : "Invoice QR"}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: 14,
            marginBottom: 22,
          }}
        >
          <Box label={t("subtotal")} value={money(invoice.subtotal || 0)} />
          <Box label={t("discount")} value={money(invoice.discount || 0)} />
          <Box label={t("tax")} value={money(invoice.tax || 0)} />
          <Box
            label={language === "fa" ? "هزینه حمل" : "Shipping"}
            value={money(invoice.shipping_cost || 0)}
          />
          <Box label={t("grandTotal")} value={money(invoice.total || 0)} strong />
        </div>

        {invoice.invoice_note && (
          <div
            style={{
              background: "rgba(15,23,42,0.7)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              padding: 16,
              color: "#cbd5e1",
              lineHeight: 1.8,
              marginBottom: 18,
            }}
          >
            <strong style={{ color: "#22d3ee" }}>{t("notes")}:</strong>{" "}
            {invoice.invoice_note}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#22c55e",
            fontWeight: 800,
          }}
        >
          <ShieldCheck size={18} />
          {language === "fa"
            ? "این فاکتور توسط Vetrix ERP ایجاد شده است."
            : "This invoice was generated by Vetrix ERP."}
        </div>
      </div>
    </div>
  );
}

function Box({ label, value, strong = false }) {
  return (
    <div
      style={{
        background: strong
          ? "linear-gradient(135deg, rgba(34,211,238,0.18), rgba(16,185,129,0.16))"
          : "rgba(15,23,42,0.65)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: 16,
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>
        {label}
      </div>

      <div
        style={{
          color: strong ? "#22d3ee" : "white",
          fontSize: strong ? 22 : 18,
          fontWeight: 900,
        }}
      >
        {value}
      </div>
    </div>
  );
}