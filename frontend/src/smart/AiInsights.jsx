import { useLanguage } from "../localization/LanguageContext";

function translateStatus(status, t, language) {
  const value = String(status || "").toLowerCase();

  if (language !== "fa") {
    if (value === "excellent") return "Excellent";
    if (value === "good") return "Good financial condition";
    if (value === "warning") return "Warning";
    if (value === "danger") return "Danger";
    return status || "Stable";
  }

  if (value === "excellent") return "عالی";
  if (value === "good") return t("goodFinancialCondition");
  if (value === "warning") return "هشدار";
  if (value === "danger") return "خطر";
  return "پایدار";
}

function translateRecommendation(recommendation, t, language) {
  if (language !== "fa") {
    return recommendation || t("improveSalesStrategy");
  }

  const value = String(recommendation || "").toLowerCase();

  if (
    value.includes("reduce unnecessary expenses") ||
    value.includes("improve sales strategy")
  ) {
    return t("improveSalesStrategy");
  }

  return recommendation || t("improveSalesStrategy");
}

export default function AiInsights({ insight }) {
  const { t, language, money, dir } = useLanguage();

  if (!insight) return null;

  const profit = Number(insight.profit || 0);
  const statusText = translateStatus(
    insight.status_fa || insight.status,
    t,
    language
  );
  const recommendationText = translateRecommendation(
    insight.recommendation_fa || insight.recommendation,
    t,
    language
  );

  return (
    <div
      style={{
        background: "linear-gradient(135deg,#0f172a,#1e293b)",
        borderRadius: 24,
        padding: 24,
        color: "white",
        direction: dir,
      }}
    >
      <h2
        style={{
          marginBottom: 20,
          fontSize: 24,
          fontWeight: 900,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("aiInsight")}
      </h2>

      <div
        style={{
          fontSize: 22,
          marginBottom: 12,
          fontWeight: 800,
          color: "#f8fafc",
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("profit")}: {money(profit)}
      </div>

      <div
        style={{
          color: "#22d3ee",
          marginBottom: 12,
          fontWeight: 800,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {statusText}
      </div>

      <div
        style={{
          color: "#94a3b8",
          lineHeight: 1.8,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {recommendationText}
      </div>
    </div>
  );
}
