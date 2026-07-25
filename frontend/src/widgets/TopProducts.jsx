import { Link } from "react-router-dom";
import { useLanguage } from "../localization/useLanguage";

export default function TopProducts({ products = [], to = "/products" }) {
  const { t, n, money, dir } = useLanguage();
  const fa = dir === "rtl";

  const gridColumns =
    dir === "rtl" ? "110px 90px 1fr" : "1fr 90px 110px";

  const nameCellStyle = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

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
        <div style={{ flex: 1 }}>
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
                <span>{t("sell")}</span>
                <span>{t("stock")}</span>
                <span>{t("product")}</span>
              </>
            ) : (
              <>
                <span>{t("product")}</span>
                <span>{t("stock")}</span>
                <span>{t("sell")}</span>
              </>
            )}
          </div>

          {products.map((p, index) => {
            const name = p.name || "-";
            const stock = n(p.stock || 0);
            const price = money(p.price || p.sell_price || 0);

            return (
              <div
                key={p.id || index}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridColumns,
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--erp-border)",
                  textAlign: dir === "rtl" ? "right" : "left",
                  alignItems: "center",
                  minWidth: 0,
                }}
              >
                {dir === "rtl" ? (
                  <>
                    <span style={{ fontWeight: 700 }}>{price}</span>
                    <span>{stock}</span>
                    <strong style={nameCellStyle}>{name}</strong>
                  </>
                ) : (
                  <>
                    <strong style={nameCellStyle}>{name}</strong>
                    <span>{stock}</span>
                    <span style={{ fontWeight: 700 }}>{price}</span>
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
