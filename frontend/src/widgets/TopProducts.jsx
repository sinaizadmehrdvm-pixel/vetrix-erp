import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function TopProducts({ products = [], to = "/products" }) {
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
        <h2 style={{ margin: 0 }}>{t("topProducts")}</h2>
        <span style={{ fontSize: 13, color: "var(--erp-accent)", fontWeight: 700 }}>
          {fa ? "مشاهده همه ←" : "View all →"}
        </span>
      </Link>

      {products.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--erp-muted)", margin: 0 }}>{t("noProducts")}</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
          {products.map((p, index) => {
            const name = p.name || "-";
            const stock = n(p.stock || 0);
            const price = money(p.price || p.sell_price || 0);

            return (
              <div
                key={p.id || index}
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
                    <Package size={18} />
                  </div>
                  <div style={{ minWidth: 0, textAlign: dir === "rtl" ? "right" : "left" }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--erp-muted)", whiteSpace: "nowrap" }}>
                      {t("stock")}: {stock}
                    </div>
                  </div>
                </div>

                <div style={{ fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>{price}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
