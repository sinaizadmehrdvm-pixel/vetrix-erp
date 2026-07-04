import { useLanguage } from "../localization/LanguageContext";

export default function RecentInvoices({ invoices = [] }) {
  const { t, money, dir } = useLanguage();

  const gridColumns =
    dir === "rtl" ? "90px 120px 1fr 80px" : "80px 1fr 120px 90px";

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.9)",
        borderRadius: 24,
        padding: 20,
        color: "white",
        direction: dir,
      }}
    >
      <h2
        style={{
          marginBottom: 18,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("recentInvoices")}
      </h2>

      {invoices.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>{t("noInvoices")}</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              gap: 12,
              paddingBottom: 10,
              color: "#22d3ee",
              fontWeight: 900,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
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
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  color: "#e2e8f0",
                  textAlign: dir === "rtl" ? "right" : "left",
                }}
              >
                {dir === "rtl" ? (
                  <>
                    <span style={{ color: "#22c55e", fontWeight: 900 }}>
                      {status}
                    </span>
                    <span>{total}</span>
                    <span>{customer}</span>
                    <strong style={{ color: "#22d3ee" }}>{id}</strong>
                  </>
                ) : (
                  <>
                    <strong style={{ color: "#22d3ee" }}>{id}</strong>
                    <span>{customer}</span>
                    <span>{total}</span>
                    <span style={{ color: "#22c55e", fontWeight: 900 }}>
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
