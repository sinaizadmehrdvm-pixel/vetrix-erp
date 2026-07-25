import { Link } from "react-router-dom";
import { Receipt } from "lucide-react";
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
  const { t, n, money, dir } = useLanguage();
  const fa = dir === "rtl";

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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {invoices.map((invoice) => {
            const customer = invoice.customer || invoice.customer_name || "-";
            const total = money(invoice.total || invoice.total_amount || 0);
            const status = statusLabel(invoice.status, fa);

            return (
              <div
                key={invoice.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 16,
                  background: "var(--erp-panel-solid)",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      minWidth: 40,
                      borderRadius: 12,
                      background: "var(--erp-glow)",
                      color: "var(--erp-accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Receipt size={18} />
                  </div>
                  <div style={{ minWidth: 0, textAlign: dir === "rtl" ? "right" : "left" }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fa ? `فاکتور شماره ${n(invoice.id)}` : `Invoice #${n(invoice.id)}`}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--erp-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {customer}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: dir === "rtl" ? "left" : "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{total}</div>
                  <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, whiteSpace: "nowrap" }}>{status}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
