function dateFromMonthKey(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function localizedMonthLabel(item, language) {
  const date = dateFromMonthKey(item.key);
  if (date) {
    return new Intl.DateTimeFormat(language === "fa" ? "fa-IR-u-ca-persian" : "en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  const fallback = String(item.month || "");
  if (fallback.includes("/")) {
    const [faLabel, enLabel] = fallback.split("/");
    return language === "fa" ? faLabel.trim() : enLabel.trim();
  }

  return fallback;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function buildSalesChartData(data = [], language = "en") {
  return data.map((item) => ({
    ...item,
    monthLabel: localizedMonthLabel(item, language),
    sales: toFiniteNumber(item.sales),
  }));
}
