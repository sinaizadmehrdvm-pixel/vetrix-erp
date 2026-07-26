import { Link } from "react-router-dom";
import { useLanguage } from "../localization/useLanguage";

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

export default function ActivityTimeline({ items = [], to = "/audit-trail" }) {
  const { t, language, n, dir } = useLanguage();
  const fa = language === "fa";

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <h2
          style={{
            fontSize: 24,
            fontWeight: 900,
            margin: 0,
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          {t("activityTimeline")}
        </h2>
        <span style={{ fontSize: 13, color: "var(--erp-accent)", fontWeight: 700 }}>
          {fa ? "مشاهده همه ←" : language === "ar" ? "عرض الكل ←" : language === "tr" ? "Tümünü gör →" : "View all →"}
        </span>
      </Link>

      {items.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p
            style={{
              color: "var(--erp-muted)",
              textAlign: dir === "rtl" ? "right" : "left",
              margin: 0,
            }}
          >
            {t("noActivity")}
          </p>
        </div>
      ) : (
        items.map((item, index) => (
          <div
            key={index}
            style={{
              padding: "14px 0",
              borderBottom: "1px solid var(--erp-border)",
              textAlign: dir === "rtl" ? "right" : "left",
            }}
          >
            <strong
              style={{
                color: "var(--erp-accent)",
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
                color: "var(--erp-muted)",
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