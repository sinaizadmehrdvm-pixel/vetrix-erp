import { useLanguage } from "../localization/useLanguage";

export default function RecentInvoices({ invoices = [], compact = false }) {
  const { t, money, dir } = useLanguage();

  const gridColumns =
    dir === "rtl" ? "90px 120px 1fr 80px" : "80px 1fr 120px 90px";

  return (
    <div
      style={{
        background: "var(--erp-panel)",
        borderRadius: 16,
        padding: compact ? 12 : 20,
        color: "var(--erp-text)",
        direction: dir,
      }}
    >
      <h2
        style={{
          marginBottom: compact ? 8 : 18,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("recentInvoices")}
      </h2>

      {invoices.length === 0 ? (
        <p style={{ color: "var(--erp-muted)" }}>{t("noInvoices")}</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              gap: 12,
              paddingBottom: 10,
              color: "var(--erp-accent)",
              fontWeight: 900,
              borderBottom: "1px solid var(--erp-border)",
              textAlign: dir === "rtl" ? "right" : "left",
            }}
          >
            {dir === "rtl" ? (
              <>
                <span>{t("status")}</span>
                <span>{t("total")}</span>
                <span>{t("customer")}</span>
                <span>ID</span>
              </>
            ) : (
              <>
                <span>ID</span>
                <span>{t("customer")}</span>
                <span>{t("total")}</span>
                <span>{t("status")}</span>
              </>
            )}
          </div>

          {invoices.map((invoice) => {
            const id = `#${invoice.id}`;
            const customer = invoice.customer || invoice.customer_name || "-";
            const total = money(invoice.total || invoice.total_amount || 0);
            const status = invoice.status || "-";

            return (
              <div
                key={invoice.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridColumns,
                  gap: 12,
                  padding: compact ? "8px 0" : "12px 0",
                  borderBottom: "1px solid var(--erp-border)",
                  color: "var(--erp-text)",
                  textAlign: dir === "rtl" ? "right" : "left",
                }}
              >
                {dir === "rtl" ? (
                  <>
                    <span style={{ color: "var(--erp-accent-2)", fontWeight: 900 }}>
                      {status}
                    </span>
                    <span>{total}</span>
                    <span>{customer}</span>
                    <strong style={{ color: "var(--erp-accent)" }}>{id}</strong>
                  </>
                ) : (
                  <>
                    <strong style={{ color: "var(--erp-accent)" }}>{id}</strong>
                    <span>{customer}</span>
                    <span>{total}</span>
                    <span style={{ color: "var(--erp-accent-2)", fontWeight: 900 }}>
                      {status}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
