import { FileText, QrCode, Printer, ShieldCheck } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function InvoicePrint({ invoice }) {
  const { t, money, n, dir, language } = useLanguage();

  if (!invoice) return null;

  const statusColor =
    invoice.payment_status === "paid" || invoice.payment_status === "final"
      ? "#22c55e"
      : invoice.payment_status === "partial"
        ? "#fbbf24"
        : "#fb7185";

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
        background: "var(--erp-panel)",
        border: "1px solid var(--erp-border)",
        borderRadius: 28,
        padding: 24,
        color: "var(--erp-text)",
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
              color: "var(--erp-accent)",
              fontSize: 26,
              fontWeight: 900,
              marginBottom: 6,
            }}
          >
            {language === "fa" ? "پیش‌نمایش فاکتور" : "Invoice Preview"}
          </h2>

          <p style={{ color: "var(--erp-muted)" }}>
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
            background: "var(--erp-accent)",
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
          background: "var(--erp-panel-solid)",
          border: "1px solid var(--erp-border)",
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
              <FileText color="var(--erp-accent)" />
              <strong style={{ fontSize: 22 }}>{t("invoiceSystem")}</strong>
            </div>

            <div style={{ color: "var(--erp-muted)", lineHeight: 1.9 }}>
              <div>
                {language === "fa" ? "شماره فاکتور" : "Invoice ID"}: #
                {n(invoice.id)}
              </div>
              <div>
                {t("customer")}: {invoice.customerName || "-"}
              </div>
              <div>
                {t("status")}:{" "}
                <span style={{ color: statusColor, fontWeight: 900 }}>
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
              border: "1px dashed var(--erp-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--erp-accent)",
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

        {Array.isArray(invoice.items) && invoice.items.length > 0 && (
          <div
            style={{
              border: "1px solid var(--erp-border)",
              borderRadius: 18,
              overflow: "hidden",
              marginBottom: 22,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--erp-panel)" }}>
                  <th style={{ textAlign: "start", padding: "10px 12px", color: "var(--erp-accent)" }}>
                    {language === "fa" ? "کالا" : "Item"}
                  </th>
                  <th style={{ textAlign: "start", padding: "10px 12px", color: "var(--erp-accent)" }}>
                    {language === "fa" ? "تعداد" : "Qty"}
                  </th>
                  <th style={{ textAlign: "start", padding: "10px 12px", color: "var(--erp-accent)" }}>
                    {language === "fa" ? "قیمت واحد" : "Unit price"}
                  </th>
                  <th style={{ textAlign: "start", padding: "10px 12px", color: "var(--erp-accent)" }}>
                    {language === "fa" ? "جمع" : "Line total"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={item.id ?? index} style={{ borderTop: "1px solid var(--erp-border)" }}>
                    <td style={{ padding: "10px 12px" }}>{item.product_name || item.name || "-"}</td>
                    <td style={{ padding: "10px 12px" }}>{n(item.quantity ?? 0)}</td>
                    <td style={{ padding: "10px 12px" }}>{money(item.unit_price ?? 0)}</td>
                    <td style={{ padding: "10px 12px" }}>{money((item.quantity ?? 0) * (item.unit_price ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
              background: "var(--erp-panel)",
              border: "1px solid var(--erp-border)",
              borderRadius: 18,
              padding: 16,
              color: "var(--erp-muted)",
              lineHeight: 1.8,
              marginBottom: 18,
            }}
          >
            <strong style={{ color: "var(--erp-accent)" }}>{t("notes")}:</strong>{" "}
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
            ? "این فاکتور توسط VITALIX ایجاد شده است."
            : "This invoice was generated by VITALIX."}
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
          : "var(--erp-panel)",
        border: "1px solid var(--erp-border)",
        borderRadius: 18,
        padding: 16,
      }}
    >
      <div style={{ color: "var(--erp-muted)", fontSize: 13, marginBottom: 8 }}>
        {label}
      </div>

      <div
        style={{
          color: strong ? "var(--erp-accent)" : "var(--erp-text)",
          fontSize: strong ? 22 : 18,
          fontWeight: 900,
        }}
      >
        {value}
      </div>
    </div>
  );
}
