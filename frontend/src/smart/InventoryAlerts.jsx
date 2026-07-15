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

export default function InventoryAlerts({ alerts = [] }) {
  const { t, language, n, dir } = useLanguage();

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.9)",
        borderRadius: 24,
        padding: 20,
        direction: dir,
      }}
    >
      <h2
        style={{
          color: "white",
          marginBottom: 20,
          fontSize: 24,
          fontWeight: 900,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("inventoryAlerts")}
      </h2>

      {alerts.length === 0 ? (
        <p
          style={{
            color: "#94a3b8",
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          {t("noAlerts")}
        </p>
      ) : (
        alerts.map((alert, index) => {
          const message = translateAlert(
            alert.message,
            t,
            language
          );

          return (
            <div
              key={alert.id || index}
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
            </div>
          );
        })
      )}
    </div>
  );
}