import { useLanguage } from "../localization/useLanguage";

const STATUS_LABELS = {
  fa: { paid: "تسویه شده", unpaid: "تسویه نشده", partial: "تسویه ناقص", draft: "پیش‌نویس", final: "نهایی" },
  en: { paid: "Paid", unpaid: "Unpaid", partial: "Partially paid", draft: "Draft", final: "Final" },
};

function statusLabel(value, fa) {
  const raw = String(value || "").toLowerCase();
  return (fa ? STATUS_LABELS.fa : STATUS_LABELS.en)[raw] || value || "-";
}

export default function RecentInvoices({ invoices = [] }) {
  const { t, money, dir, language } = useLanguage();
  const fa = language === "fa";

  const gridColumns =
    dir === "rtl" ? "70px 90px 1fr 80px" : "80px 1fr 90px 70px";

  return (
    <div
      className="erp-surface"
      style={{
        borderRadius: 24,
        padding: 20,
        color: "var(--erp-text)",
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
            const status = statusLabel(invoice.status, fa);

            return (
              <div
                key={invoice.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridColumns,
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--erp-border)",
                  color: "var(--erp-text)",
                  textAlign: dir === "rtl" ? "right" : "left",
                  minWidth: 0,
                }}
              >
                {dir === "rtl" ? (
                  <>
                    <span style={{ color: "#22c55e", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {status}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{total}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer}</span>
                    <strong style={{ color: "var(--erp-accent)" }}>{id}</strong>
                  </>
                ) : (
                  <>
                    <strong style={{ color: "var(--erp-accent)" }}>{id}</strong>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{total}</span>
                    <span style={{ color: "#22c55e", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
