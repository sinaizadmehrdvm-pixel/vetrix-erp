import { buildSalesChartData, localizedMonthLabel } from "../src/charts/salesChartLabels.js";

const apiPayload = [
  { key: "2026-05", month: "مرداد/May 2026", sales: 0 },
  { key: "2026-06", month: "تیر/Jun 2026", sales: "1250" },
  { key: "2026-07", month: "تیر/Jul 2026", sales: Number.NaN },
];

const faLabels = buildSalesChartData(apiPayload, "fa").map((item) => item.monthLabel);
const enLabels = buildSalesChartData(apiPayload, "en").map((item) => item.monthLabel);
const expectedFa = ["اردیبهشت ۱۴۰۵", "خرداد ۱۴۰۵", "تیر ۱۴۰۵"];
const expectedEn = ["May 2026", "Jun 2026", "Jul 2026"];

function assertEqual(actual, expected, label) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${label} labels mismatch: expected ${expectedText}, got ${actualText}`);
  }
}

function assertSingleLanguage(labels, label) {
  if (labels.some((monthLabel) => monthLabel.includes("/"))) {
    throw new Error(`${label} labels include mixed-language separator: ${labels.join(" | ")}`);
  }
}

assertEqual(faLabels, expectedFa, "Persian");
assertEqual(enLabels, expectedEn, "English");
assertSingleLanguage(faLabels, "Persian");
assertSingleLanguage(enLabels, "English");

const fallbackFa = localizedMonthLabel({ month: "تیر/Jul 2026" }, "fa");
const fallbackEn = localizedMonthLabel({ month: "تیر/Jul 2026" }, "en");
if (fallbackFa !== "تیر" || fallbackEn !== "Jul 2026") {
  throw new Error(`Fallback split failed: fa=${fallbackFa}; en=${fallbackEn}`);
}

console.table({ Persian: faLabels, English: enLabels, fallbackFa, fallbackEn });
