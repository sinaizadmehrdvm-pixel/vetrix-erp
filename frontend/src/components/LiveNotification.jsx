import { useLanguage } from "../localization/useLanguage";

export default function LiveNotification({ notifications = [] }) {
  const { t, language, n, dir } = useLanguage();

  function localizeTitle(item) {
    if (language !== "fa") return item.title;

    if (item.title_fa) return item.title_fa;

    const value = String(item.title || "").toLowerCase();

    if (value.includes("low stock")) {
      return t("lowStockAlert");
    }

    if (value.includes("profit")) {
      return t("profitWarning");
    }

    if (value.includes("system")) {
      return t("systemHealthy");
    }

    return item.title;
  }

  function localizeMessage(item) {
    if (language !== "fa") return item.message;

    if (item.message_fa) return item.message_fa;

    let text = String(item.message || "");

    text = text
      .replace(
        "products need stock review.",
        "کالاها نیاز به بررسی موجودی دارند."
      )
      .replace(
        "Net profit is negative.",
        "سود خالص منفی است."
      )
      .replace(
        "No critical alerts detected.",
        "هشدار مهمی شناسایی نشده است."
      );

    return text.replace(/[0-9]/g, (digit) => n(digit));
  }

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
      <h2
        style={{
          marginBottom: 18,
          fontSize: 24,
          fontWeight: 900,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("liveNotifications")}
      </h2>

      {notifications.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p
            style={{
              color: "var(--erp-muted)",
              textAlign: dir === "rtl" ? "right" : "left",
              margin: 0,
            }}
          >
            {t("noNotifications")}
          </p>
        </div>
      ) : (
        notifications.map((item, index) => (
          <div
            key={index}
            style={{
              padding: 14,
              marginBottom: 10,
              borderRadius: 16,
              background:
                item.type === "danger"
                  ? "rgba(239,68,68,0.18)"
                  : item.type === "warning"
                  ? "rgba(245,158,11,0.18)"
                  : "rgba(16,185,129,0.18)",
              border: "1px solid var(--erp-border)",
              textAlign: dir === "rtl" ? "right" : "left",
            }}
          >
            <strong>{localizeTitle(item)}</strong>

            <div
              style={{
                color: "var(--erp-muted)",
                marginTop: 4,
                lineHeight: 1.8,
              }}
            >
              {localizeMessage(item)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}