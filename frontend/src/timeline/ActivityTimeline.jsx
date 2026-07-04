import { useLanguage } from "../localization/LanguageContext";

function translateTitle(title, t, language) {
  if (language !== "fa") {
    return title;
  }

  const value = String(title || "").toLowerCase();

  if (value.includes("new invoice")) {
    return t("newInvoiceCreated");
  }

  if (value.includes("stock updated")) {
    return t("stockUpdated");
  }

  if (value.includes("customer added")) {
    return t("customerAdded");
  }

  return title;
}

export default function ActivityTimeline({ items = [] }) {
  const { t, language, n, dir } = useLanguage();

  function localizeTime(value) {
    if (!value) return "-";

    let text = String(value);

    if (language === "fa") {
      text = text
        .replace(/ago/gi, "پیش")
        .replace(/minutes/gi, "دقیقه")
        .replace(/minute/gi, "دقیقه")
        .replace(/hours/gi, "ساعت")
        .replace(/hour/gi, "ساعت")
        .replace(/days/gi, "روز")
        .replace(/day/gi, "روز");

      return text.replace(/[0-9]/g, (digit) => n(digit));
    }

    return text;
  }

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
          fontSize: 24,
          fontWeight: 900,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("activityTimeline")}
      </h2>

      {items.length === 0 ? (
        <p
          style={{
            color: "#94a3b8",
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          {t("noActivity")}
        </p>
      ) : (
        items.map((item, index) => (
          <div
            key={index}
            style={{
              padding: "14px 0",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              textAlign: dir === "rtl" ? "right" : "left",
            }}
          >
            <strong
              style={{
                color: "#22d3ee",
                display: "block",
                marginBottom: 6,
                fontSize: 16,
              }}
            >
              {language === "fa"
                ? item.title_fa || translateTitle(item.title, t, language)
                : item.title}
            </strong>

            <div
              style={{
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              {localizeTime(item.time)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}