import { useLanguage } from "../localization/useLanguage";

export default function TopProducts({ products = [] }) {
  const { t, n, money, dir } = useLanguage();

  const gridColumns =
    dir === "rtl" ? "110px 90px 1fr" : "1fr 90px 110px";

  return (
    <div
      style={{
        background: "var(--erp-panel)",
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
        {t("topProducts")}
      </h2>

      {products.length === 0 ? (
        <p style={{ color: "var(--erp-muted)" }}>{t("noProducts")}</p>
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
                }}
              >
                {dir === "rtl" ? (
                  <>
                    <span>{price}</span>
                    <span>{stock}</span>
                    <strong>{name}</strong>
                  </>
                ) : (
                  <>
                    <strong>{name}</strong>
                    <span>{stock}</span>
                    <span>{price}</span>
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
