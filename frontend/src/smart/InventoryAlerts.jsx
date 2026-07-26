import { Link } from "react-router-dom";
import { useLanguage } from "../localization/useLanguage";

function translateAlert(message, t, language) {
  if (language !== "fa") {
    return message;
  }

  const text = String(message || "").toLowerCase();

  if (
    text.includes("stock is low") ||
    text.includes("low stock")
  ) {
    return t("stockIsLow");
  }

  if (
    text.includes("inventory alert") ||
    text.includes("inventory")
  ) {
    return t("lowStockAlert");
  }

  return message;
}

export default function InventoryAlerts({ alerts = [], to = "/products" }) {
  const { t, language, n, dir } = useLanguage();
  const fa = language === "fa";

  return (
    <div
      className="erp-surface"
      style={{
        borderRadius: 24,
        padding: 20,
        direction: dir,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Link
        to={to}
        style={{
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <h2
          style={{
            color: "var(--erp-text)",
            fontSize: 24,
            fontWeight: 900,
            margin: 0,
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          {t("inventoryAlerts")}
        </h2>
        <span style={{ fontSize: 13, color: "var(--erp-accent)", fontWeight: 700 }}>
          {fa ? "مشاهده همه ←" : language === "ar" ? "عرض الكل ←" : language === "tr" ? "Tümünü gör →" : "View all →"}
        </span>
      </Link>

      {alerts.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p
            style={{
              color: "var(--erp-muted)",
              textAlign: dir === "rtl" ? "right" : "left",
              margin: 0,
            }}
          >
            {t("noAlerts")}
          </p>
        </div>
      ) : (
        alerts.map((alert, index) => {
          const message = translateAlert(
            alert.message,
            t,
            language
          );

          return (
            <Link
              key={alert.id || index}
              to={to}
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.4)",
                color: "#fca5a5",
                padding: 14,
                borderRadius: 16,
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexDirection:
                    dir === "rtl"
                      ? "row-reverse"
                      : "row",
                }}
              >
                <span style={{ fontSize: 20 }}>
                  ⚠
                </span>

                <span>{message}</span>
              </div>

              <strong
                style={{
                  color: "#fef2f2",
                  minWidth: 40,
                  textAlign: "center",
                }}
              >
                {n(alert.stock || 0)}
              </strong>
            </Link>
          );
        })
      )}
    </div>
  );
}