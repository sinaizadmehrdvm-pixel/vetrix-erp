import { Link } from "react-router-dom";
import { useLanguage } from "../localization/useLanguage";

const STATUS_LABELS = {
  fa: { paid: "تسویه شده", unpaid: "تسویه نشده", partial: "تسویه ناقص", draft: "پیش‌نویس", final: "نهایی" },
  en: { paid: "Paid", unpaid: "Unpaid", partial: "Partially paid", draft: "Draft", final: "Final" },
};

function statusLabel(value, fa) {
  const raw = String(value || "").toLowerCase();
  return (fa ? STATUS_LABELS.fa : STATUS_LABELS.en)[raw] || value || "-";
}

export default function RecentInvoices({ invoices = [], to = "/invoices" }) {
  const { t, money, dir, language } = useLanguage();
  const fa = language === "fa";

  const gridColumns =
    dir === "rtl" ? "64px 84px 1fr 96px" : "96px 1fr 84px 64px";

  return (
    <div
      className="erp-surface"
      style={{
        borderRadius: 24,
        padding: 20,
        color: "var(--erp-text)",
        direction: dir,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Link
        to={to}
        style={{
          marginBottom: 18,
          textAlign: dir === "rtl" ? "right" : "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <h2 style={{ margin: 0 }}>{t("recentInvoices")}</h2>
        <span style={{ fontSize: 13, color: "var(--erp-accent)", fontWeight: 700 }}>
          {fa ? "مشاهده همه ←" : "View all →"}
        </span>
      </Link>

      {invoices.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--erp-muted)", margin: 0 }}>{t("noInvoices")}</p>
        </div>
      ) : (
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              gap: 10,
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
            const ellipsisStyle = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

            return (
              <div
                key={invoice.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridColumns,
                  gap: 10,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--erp-border)",
                  color: "var(--erp-text)",
                  textAlign: dir === "rtl" ? "right" : "left",
                  minWidth: 0,
                }}
              >
                {dir === "rtl" ? (
                  <>
                    <span style={{ color: "#22c55e", fontWeight: 900, ...ellipsisStyle }}>
                      {status}
                    </span>
                    <span style={{ fontWeight: 700 }}>{total}</span>
                    <span style={ellipsisStyle}>{customer}</span>
                    <strong style={{ color: "var(--erp-accent)" }}>{id}</strong>
                  </>
                ) : (
                  <>
                    <strong style={{ color: "var(--erp-accent)" }}>{id}</strong>
                    <span style={ellipsisStyle}>{customer}</span>
                    <span style={{ fontWeight: 700 }}>{total}</span>
                    <span style={{ color: "#22c55e", fontWeight: 900, ...ellipsisStyle }}>
                      {status}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
