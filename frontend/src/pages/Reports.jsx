import { useEffect, useMemo, useState } from "react";

import {
  BarChart3,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  AlertTriangle,
  Wallet,
  Receipt,
  Scale,
  Download,
  Printer,
  Search,
  Trophy,
  Boxes,
  Banknote,
  Activity,
  CalendarClock,
} from "lucide-react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";

import moment from "moment-jalaali";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, paymentStatusLabel } from "../localization/helpers";
import { toHijri, HIJRI_MONTHS_AR } from "../utils/hijri";
import ReportHeader from "../components/reports/ReportHeader";
import ReportFooter from "../components/reports/ReportFooter";
import { Table, Thead, Tbody, Tr, Th, Td, EmptyRow } from "../components/ui/Table";
import Select from "../components/ui/Select";

import {
  downloadAuthenticatedFile,
  getCustomers,
  getDashboardStats,
  getExpenses,
  getProducts,
  getTransactions,
  getReportsOverview,
  getProductProfitReport,
  getCustomerBalanceReport,
  getInventoryMovementReport,
  getReportSchedules,
  createReportSchedule,
  toggleReportSchedule,
  deleteReportSchedule,
} from "../services/api";
import toast from "react-hot-toast";

import {
  getReportsOffline,
  saveReportsOffline,
} from "../storage/reports.store";

const CHART_COLORS = ["#22d3ee", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#60a5fa"];

const SOURCE_TYPE_LABELS = {
  fa: { opening_balance: "مانده اول دوره", invoice: "فاکتور", receipt: "دریافت", payment: "پرداخت" },
  ar: { opening_balance: "الرصيد الافتتاحي", invoice: "فاتورة", receipt: "مقبوضات", payment: "مدفوعات" },
  tr: { opening_balance: "Açılış bakiyesi", invoice: "Fatura", receipt: "Tahsilat", payment: "Ödeme" },
  en: { opening_balance: "Opening balance", invoice: "Invoice", receipt: "Receipt", payment: "Payment" },
};

function sourceTypeLabel(value, language) {
  const map = SOURCE_TYPE_LABELS[language] || SOURCE_TYPE_LABELS.en;
  return map[value] || value || "-";
}

function inventoryStatus(status, tr) {
  if (status === "critical") {
    return { label: tr("بحرانی", "حرج", "Kritik", "Critical"), className: "text-red-300 bg-red-500/10" };
  }
  if (status === "warning") {
    return { label: tr("هشدار", "تحذير", "Uyarı", "Warning"), className: "text-amber-300 bg-amber-500/10" };
  }
  return { label: tr("نرمال", "طبيعي", "Normal", "Normal"), className: "text-green-300 bg-green-500/10" };
}

const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const GREGORIAN_MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GREGORIAN_MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The dataset buckets transactions by Gregorian calendar month ("2026-07"),
// so charts must translate each bucket into the calendar the active
// language actually uses (Jalali for fa, Hijri for ar) rather than just
// swapping the Gregorian digits to Persian glyphs - a bucket label is a
// month name, not a number, and staying on the Gregorian calendar while
// every other date in the app switches would be inconsistent.
function formatMonthLabel(monthKey, language) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey;
  const [, y, m] = match;
  const midMonth = new Date(Number(y), Number(m) - 1, 15);

  if (language === "fa") {
    const jm = moment(midMonth);
    return `${JALALI_MONTHS_FA[jm.jMonth()]} ${toPersianDigits(jm.jYear())}`;
  }
  if (language === "ar") {
    const h = toHijri(midMonth.getFullYear(), midMonth.getMonth() + 1, midMonth.getDate());
    return `${HIJRI_MONTHS_AR[h.month - 1]} ${h.year}`;
  }
  const names = language === "tr" ? GREGORIAN_MONTHS_TR : GREGORIAN_MONTHS_EN;
  return `${names[Number(m) - 1]} ${y}`;
}

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getBalance(item) {
  const balance = toNumber(item?.balance);
  if (balance !== 0) return balance;

  const debit = toNumber(item?.debit ?? item?.debtor);
  const credit = toNumber(item?.credit ?? item?.creditor);
  return debit - credit;
}

function getDebtor(item) {
  return Math.max(getBalance(item), 0);
}

function getCreditor(item) {
  return Math.max(-getBalance(item), 0);
}

function getProductSellPrice(product) {
  return toNumber(product?.sell_price ?? product?.price ?? product?.unit_price ?? 0);
}

function getProductBuyPrice(product) {
  return toNumber(product?.buy_price ?? 0);
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function normalizeMonthKey(value) {
  if (!value) return "-";
  const text = String(value);
  if (text.includes("T")) return text.slice(0, 7);
  if (text.length >= 7) return text.slice(0, 7);
  return text;
}

export default function Reports() {
  const { language, money, n, dir, date } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [stats, setStats] = useState({});
  const [overview, setOverview] = useState({});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [productProfit, setProductProfit] = useState([]);
  const [customerBalanceReport, setCustomerBalanceReport] = useState({ all: [], debtors: [], creditors: [] });
  const [, setInventoryMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState("summary");
  const [showSchedules, setShowSchedules] = useState(false);
  const [error, setError] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [query, setQuery] = useState("");

  function applyReportData(payload) {
    setStats(payload?.stats || {});
    setOverview(payload?.overview || {});
    setCustomers(safeArray(payload?.customers));
    setProducts(safeArray(payload?.products));
    setTransactions(safeArray(payload?.transactions));
    setExpenses(safeArray(payload?.expenses));
    setProductProfit(safeArray(payload?.productProfit?.items || payload?.productProfit));
    setCustomerBalanceReport(payload?.customerBalances || { all: [], debtors: [], creditors: [] });
    setInventoryMovements(safeArray(payload?.inventoryMovements?.items || payload?.inventoryMovements));
  }

  async function load() {
    setLoading(true);
    setError("");
    setOfflineMode(false);

    try {
      const [s, r, c, p, t, e, pp, cb, im] = await Promise.all([
        getDashboardStats(),
        getReportsOverview(),
        getCustomers(),
        getProducts(),
        getTransactions(),
        getExpenses(),
        getProductProfitReport().catch(() => ({ items: [] })),
        getCustomerBalanceReport().catch(() => ({ all: [], debtors: [], creditors: [] })),
        getInventoryMovementReport().catch(() => ({ items: [] })),
      ]);

      const payload = {
        stats: s || {},
        overview: r || {},
        customers: safeArray(c),
        products: safeArray(p),
        transactions: safeArray(t),
        expenses: safeArray(e),
        productProfit: pp || { items: [] },
        customerBalances: cb || { all: [], debtors: [], creditors: [] },
        inventoryMovements: im || { items: [] },
      };

      applyReportData(payload);
      await saveReportsOffline(payload);
    } catch (err) {
      console.error("Reports loading error", err);

      try {
        const cached = await getReportsOffline();

        if (cached?.data) {
          applyReportData(cached.data);
          setOfflineMode(true);
          setError(
            tr(
              "اتصال به سرور برقرار نشد؛ گزارش‌ها از حافظه آفلاین نمایش داده شدند.",
              "تعذّر الاتصال بالخادم؛ يتم عرض التقارير من الذاكرة المؤقتة دون اتصال.",
              "Sunucuya bağlanılamadı; raporlar çevrimdışı önbellekten gösteriliyor.",
              "Server unavailable; reports are loaded from offline cache."
            )
          );
        } else {
          setError(
            err.message ||
              tr(
                "خطا در دریافت گزارش‌ها و کش آفلاین موجود نیست",
                "خطأ في تحميل التقارير ولا توجد نسخة مؤقتة غير متصلة",
                "Raporlar alınamadı ve çevrimdışı önbellek yok",
                "Error loading reports and no offline cache found"
              )
          );
        }
      } catch (cacheErr) {
        console.error("Offline reports cache error", cacheErr);
        setError(
          err.message || tr("خطا در دریافت گزارش‌ها", "خطأ في تحميل التقارير", "Raporlar yüklenirken hata oluştu", "Error loading reports")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const profit = useMemo(() => overview?.profit_loss || {}, [overview]);
  const trial = overview?.trial_balance || {};
  const cashflow = useMemo(() => overview?.cashflow || {}, [overview]);
  const invoiceSummary = overview?.invoice_summary || {};
  const inventory = useMemo(() => overview?.inventory || {}, [overview]);
  const openInvoices = safeArray(overview?.open_invoices);

  const fallbackTotals = useMemo(() => {
    const debtors = customers.reduce((sum, c) => sum + getDebtor(c), 0);
    const creditors = customers.reduce((sum, c) => sum + getCreditor(c), 0);

    const stockValue = products.reduce(
      (sum, p) => sum + toNumber(p.stock) * getProductSellPrice(p),
      0
    );

    const buyStockValue = products.reduce(
      (sum, p) => sum + toNumber(p.stock) * getProductBuyPrice(p),
      0
    );

    const expensesTotal = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);

    return { debtors, creditors, stockValue, buyStockValue, expensesTotal };
  }, [customers, products, expenses]);

  const inventoryProducts = useMemo(() => {
    const source = inventory?.products || products;
    return safeArray(source).map((p) => {
      const stock = toNumber(p.stock);
      const minStock = toNumber(p.min_stock);
      const sell = getProductSellPrice(p);
      const buy = getProductBuyPrice(p);
      const status = minStock > 0 && stock <= minStock / 2 ? "critical" : minStock > 0 && stock <= minStock ? "warning" : "normal";

      return {
        ...p,
        stock,
        min_stock: minStock,
        value: p.value ?? stock * sell,
        buy_value: p.buy_value ?? stock * buy,
        low_stock: minStock > 0 && stock <= minStock,
        stock_status: status,
      };
    });
  }, [inventory, products]);

  const lowStockProducts = useMemo(() => {
    return safeArray(inventory?.low_stock_products).length
      ? safeArray(inventory.low_stock_products)
      : inventoryProducts.filter((p) => p.low_stock);
  }, [inventory, inventoryProducts]);

  const normalizedCustomerReport = useMemo(() => {
    const source = safeArray(customerBalanceReport?.all).length ? safeArray(customerBalanceReport.all) : customers;
    return source.map((c) => ({
      ...c,
      debit: toNumber(c.debit ?? c.debtor ?? getDebtor(c)),
      credit: toNumber(c.credit ?? c.creditor ?? getCreditor(c)),
      balance: getBalance(c),
      invoice_count: toNumber(c.invoice_count),
    }));
  }, [customerBalanceReport, customers]);

  const topDebtors = useMemo(() => {
    const source = safeArray(customerBalanceReport?.debtors).length
      ? safeArray(customerBalanceReport.debtors)
      : normalizedCustomerReport.filter((c) => getDebtor(c) > 0);

    return source.sort((a, b) => getDebtor(b) - getDebtor(a)).slice(0, 20);
  }, [customerBalanceReport, normalizedCustomerReport]);

  const topCreditors = useMemo(() => {
    const source = safeArray(customerBalanceReport?.creditors).length
      ? safeArray(customerBalanceReport.creditors)
      : normalizedCustomerReport.filter((c) => getCreditor(c) > 0);

    return source.sort((a, b) => getCreditor(b) - getCreditor(a)).slice(0, 20);
  }, [customerBalanceReport, normalizedCustomerReport]);

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return transactions;

    return transactions.filter((x) =>
      [x.description, x.source_type, x.customer_name, x.created_at, x.debit, x.credit]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [transactions, query]);

  const financialChartData = useMemo(() => {
    return [
      { name: tr("فروش", "المبيعات", "Satış", "Sales"), value: toNumber(profit.net_sales ?? stats?.total_revenue) },
      { name: tr("خرید", "المشتريات", "Alış", "Purchases"), value: toNumber(profit.net_purchases ?? stats?.total_purchases) },
      { name: tr("هزینه", "المصروفات", "Gider", "Expenses"), value: toNumber(profit.expenses ?? stats?.total_expenses ?? fallbackTotals.expensesTotal) },
      { name: tr("سود", "الربح", "Kâr", "Profit"), value: toNumber(profit.net_profit ?? stats?.net_profit) },
    ];
  }, [tr, profit, stats, fallbackTotals.expensesTotal]);

  const cashflowChartData = useMemo(() => {
    return [
      { name: tr("دریافت امروز", "المقبوضات اليوم", "Bugünkü tahsilat", "Receipt today"), value: toNumber(cashflow.receipt_today) },
      { name: tr("پرداخت امروز", "المدفوعات اليوم", "Bugünkü ödeme", "Payment today"), value: toNumber(cashflow.payment_today) },
      { name: tr("دریافت ماه", "مقبوضات الشهر", "Aylık tahsilat", "Receipt month"), value: toNumber(cashflow.receipt_month) },
      { name: tr("پرداخت ماه", "مدفوعات الشهر", "Aylık ödeme", "Payment month"), value: toNumber(cashflow.payment_month) },
      { name: tr("خالص", "الصافي", "Net", "Net"), value: toNumber(cashflow.net_cashflow) },
    ];
  }, [tr, cashflow]);

  const monthlySalesData = useMemo(() => {
    const map = new Map();

    transactions.forEach((x) => {
      const month = normalizeMonthKey(x.created_at);
      const current = map.get(month) || { month, receipts: 0, payments: 0, debit: 0, credit: 0 };
      current.debit += toNumber(x.debit);
      current.credit += toNumber(x.credit);
      if (toNumber(x.credit) > 0) current.receipts += toNumber(x.credit);
      if (toNumber(x.debit) > 0) current.payments += toNumber(x.debit);
      map.set(month, current);
    });

    return Array.from(map.values()).sort((a, b) => String(a.month).localeCompare(String(b.month))).slice(-12);
  }, [transactions]);

  const debtorCreditorData = useMemo(() => {
    return [
      { name: tr("بدهکاران", "المدينون", "Borçlular", "Debtors"), value: fallbackTotals.debtors },
      { name: tr("بستانکاران", "الدائنون", "Alacaklılar", "Creditors"), value: fallbackTotals.creditors },
    ];
  }, [tr, fallbackTotals.debtors, fallbackTotals.creditors]);

  const inventoryChartData = useMemo(() => {
    return inventoryProducts
      .map((p) => ({
        name: p.name || "-",
        value: toNumber(p.value),
        stock: toNumber(p.stock),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [inventoryProducts]);

  const productProfitRows = useMemo(() => {
    const source = safeArray(productProfit).length
      ? productProfit
      : products.map((p) => ({
          product_id: p.id,
          name: p.name,
          barcode: p.barcode || p.code || "",
          brand: p.brand || "",
          unit: p.unit || tr("عدد", "قطعة", "adet", "pcs"),
          stock: toNumber(p.stock),
          buy_price: getProductBuyPrice(p),
          sell_price: getProductSellPrice(p),
          sold_qty: 0,
          returned_qty: 0,
          net_qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          margin_percent: 0,
        }));

    return source
      .map((p) => ({
        ...p,
        sold_qty: toNumber(p.sold_qty),
        returned_qty: toNumber(p.returned_qty),
        net_qty: toNumber(p.net_qty ?? toNumber(p.sold_qty) - toNumber(p.returned_qty)),
        revenue: toNumber(p.revenue),
        cost: toNumber(p.cost),
        profit: toNumber(p.profit),
        margin_percent: toNumber(p.margin_percent),
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [productProfit, products, tr]);

  const productProfitChartData = useMemo(() => {
    return productProfitRows
      .filter((p) => toNumber(p.profit) !== 0 || toNumber(p.revenue) !== 0)
      .slice(0, 10)
      .map((p) => ({ name: p.name || "-", profit: toNumber(p.profit), revenue: toNumber(p.revenue), qty: toNumber(p.net_qty) }));
  }, [productProfitRows]);

  const tabs = [
    ["summary", tr("خلاصه مدیریتی", "الملخص الإداري", "Yönetici özeti", "Summary")],
    ["charts", tr("نمودارهای مدیریتی", "الرسوم البيانية الإدارية", "Yönetici grafikleri", "Executive charts")],
    ["profit", tr("سود و زیان", "الأرباح والخسائر", "Kâr ve zarar", "Profit & loss")],
    ["trial", tr("تراز آزمایشی", "ميزان المراجعة", "Mizan", "Trial balance")],
    ["customers", tr("مطالبات و بدهی‌ها", "المستحقات والديون", "Alacaklar ve borçlar", "Receivables")],
    ["products", tr("سود کالا", "ربح المنتج", "Ürün kârı", "Product profit")],
    ["invoices", tr("فاکتورهای باز", "الفواتير المفتوحة", "Açık faturalar", "Open invoices")],
    ["cash", tr("دریافت و پرداخت", "المقبوضات والمدفوعات", "Tahsilat ve ödeme", "Cashflow")],
    ["inventory", tr("موجودی کالا", "المخزون", "Envanter", "Inventory")],
    ["transactions", tr("تراکنش‌ها", "المعاملات", "İşlemler", "Transactions")],
  ];

  const activeTabLabel = tabs.find(([key]) => key === active)?.[1] || "";
  const pageSubtitle = tr(
    "گزارشات کامل مشابه هلو و سپیدار: سود و زیان، تراز، مطالبات، بدهی‌ها، گردش نقدی، سود کالا و موجودی",
    "تقارير متكاملة: الأرباح والخسائر، ميزان المراجعة، المستحقات، الديون، التدفق النقدي، ربح المنتج والمخزون",
    "Eksiksiz ERP raporları: kâr/zarar, mizan, alacaklar, borçlar, nakit akışı, ürün kârı ve envanter",
    "Complete ERP reports: profit/loss, trial balance, receivables, payables, cashflow, product profit and inventory"
  );

  function exportCurrentCsv() {
    if (active === "inventory") {
      downloadCsv("inventory-report.csv", [
        ["Product", "Barcode", "Stock", "Min stock", "Buy price", "Sell price", "Sale value", "Buy value", "Status"],
        ...inventoryProducts.map((p) => [
          p.name,
          p.barcode || p.code || "",
          p.stock || 0,
          p.min_stock || 0,
          p.buy_price || 0,
          p.sell_price ?? p.price ?? 0,
          p.value || 0,
          p.buy_value || 0,
          p.stock_status || "",
        ]),
      ]);
      return;
    }

    if (active === "products") {
      downloadCsv("product-profit-report.csv", [
        ["Product", "Barcode", "Sold qty", "Returned qty", "Net qty", "Revenue", "Cost", "Profit", "Margin %"],
        ...productProfitRows.map((p) => [p.name, p.barcode, p.sold_qty, p.returned_qty, p.net_qty, p.revenue, p.cost, p.profit, p.margin_percent]),
      ]);
      return;
    }

    if (active === "customers") {
      downloadCsv("customer-balances-report.csv", [
        ["Customer", "Phone", "Debit", "Credit", "Balance", "Invoices", "Last transaction"],
        ...normalizedCustomerReport.map((c) => [c.name, c.phone, getDebtor(c), getCreditor(c), getBalance(c), c.invoice_count, c.last_transaction_date]),
      ]);
      return;
    }

    if (active === "cash" || active === "transactions") {
      downloadCsv("transactions-report.csv", [
        ["Date", "Description", "Debit", "Credit", "Source"],
        ...filteredTransactions.map((x) => [x.created_at || "", x.description || "", x.debit || 0, x.credit || 0, x.source_type || ""]),
      ]);
      return;
    }

    downloadCsv("management-summary-report.csv", [
      ["Title", "Value"],
      ["Net sales", profit.net_sales ?? stats?.total_revenue ?? 0],
      ["Net purchases", profit.net_purchases ?? stats?.total_purchases ?? 0],
      ["Expenses", profit.expenses ?? fallbackTotals.expensesTotal],
      ["Net profit", profit.net_profit ?? stats?.net_profit ?? 0],
      ["Debtors", fallbackTotals.debtors],
      ["Creditors", fallbackTotals.creditors],
      ["Inventory sale value", inventory.inventory_value ?? fallbackTotals.stockValue],
      ["Inventory buy value", fallbackTotals.buyStockValue],
    ]);
  }

  async function downloadInvoiceExport(format) {
    try {
      setError("");
      const isPdf = format === "pdf";
      await downloadAuthenticatedFile(
        isPdf ? "/export/invoices-pdf" : "/export/invoices-excel",
        isPdf ? "vetrix_invoices.pdf" : "vetrix_invoices.xlsx"
      );
    } catch (downloadError) {
      setError(downloadError.message || tr("خطا در دریافت خروجی", "خطأ في تنزيل التصدير", "Dışa aktarma indirme hatası", "Export download error"));
    }
  }

  return (
    <div dir={dir} style={{ direction: dir }} className="space-y-6 reports-page">
      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">
            {tr("گزارش‌های حرفه‌ای مدیریتی و حسابداری", "تقارير إدارية ومحاسبية احترافية", "Profesyonel yönetim ve muhasebe raporları", "Professional Management & Accounting Reports")}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">{pageSubtitle}</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button type="button" onClick={exportCurrentCsv} className="px-4 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2">
            <Download size={18} />
            {tr("خروجی CSV", "تصدير CSV", "CSV dışa aktar", "CSV Export")}
          </button>

          <button type="button" onClick={() => window.print()} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)]">
            <Printer size={18} />
            {tr("چاپ", "طباعة", "Yazdır", "Print")}
          </button>

          <button type="button" onClick={load} disabled={loading} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)] disabled:opacity-60">
            <RefreshCw size={18} />
            {loading ? tr("در حال دریافت...", "جارٍ التحميل...", "Yükleniyor...", "Loading...") : tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
          </button>

          <button type="button" onClick={() => setShowSchedules((v) => !v)} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)]">
            <CalendarClock size={18} />
            {tr("زمان‌بندی ارسال ایمیل", "جدولة الإرسال بالبريد", "E-posta zamanlaması", "Schedule email delivery")}
          </button>
        </div>
      </div>

      {showSchedules && <ScheduledReportsPanel tr={tr} language={language} />}

      {error && (
        <div className={`rounded-2xl p-4 flex items-center gap-2 ${offlineMode ? "bg-amber-500/15 border border-amber-400/30 text-amber-100" : "bg-rose-500/15 border border-rose-400/30 text-rose-100"}`}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <ReportHeader
        title={activeTabLabel}
        subtitle={pageSubtitle}
        filterSummary={query.trim() ? `${tr("جستجو", "بحث", "Arama", "Search")}: ${query}` : undefined}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <ReportCard icon={<TrendingUp />} title={tr("فروش خالص", "صافي المبيعات", "Net satış", "Net sales")} value={money(profit.net_sales ?? stats?.total_revenue ?? 0)} color="text-green-300" />
        <ReportCard icon={<TrendingDown />} title={tr("خرید خالص", "صافي المشتريات", "Net alış", "Net purchases")} value={money(profit.net_purchases ?? stats?.total_purchases ?? 0)} color="text-red-300" />
        <ReportCard icon={<Wallet />} title={tr("هزینه‌ها", "المصروفات", "Giderler", "Expenses")} value={money(profit.expenses ?? stats?.total_expenses ?? fallbackTotals.expensesTotal)} color="text-amber-300" />
        <ReportCard icon={<BarChart3 />} title={tr("سود خالص", "صافي الربح", "Net kâr", "Net profit")} value={money(profit.net_profit ?? stats?.net_profit ?? 0)} color={toNumber(profit.net_profit ?? stats?.net_profit) >= 0 ? "text-[var(--erp-accent)]" : "text-red-300"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <ReportCard icon={<Users />} title={tr("جمع بدهکاران", "إجمالي المدينين", "Toplam borçlular", "Total debtors")} value={money(fallbackTotals.debtors)} color="text-red-300" />
        <ReportCard icon={<Users />} title={tr("جمع بستانکاران", "إجمالي الدائنين", "Toplam alacaklılar", "Total creditors")} value={money(fallbackTotals.creditors)} color="text-green-300" />
        <ReportCard icon={<Package />} title={tr("ارزش موجودی فروش", "قيمة المخزون البيعية", "Envanter satış değeri", "Inventory sale value")} value={money(inventory.inventory_value ?? fallbackTotals.stockValue)} hint={`${tr("ارزش خرید", "قيمة الشراء", "Alış değeri", "Buy value")}: ${money(fallbackTotals.buyStockValue)}`} color="text-[var(--erp-accent)]" />
        <ReportCard icon={<Receipt />} title={tr("فاکتورهای باز", "الفواتير المفتوحة", "Açık faturalar", "Open invoices")} value={n(invoiceSummary.open_count || openInvoices.length || 0)} hint={money(invoiceSummary.open_amount || 0)} color="text-amber-300" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <ReportCard icon={<Trophy />} title={tr("سود کالاها", "ربح المنتجات", "Ürün kârı", "Product profit")} value={money(productProfitRows.reduce((s, p) => s + toNumber(p.profit), 0))} hint={`${n(productProfitRows.length)} ${tr("کالا", "منتج", "ürün", "products")}`} color="text-[var(--erp-accent)]" />
        <ReportCard icon={<Boxes />} title={tr("کالاهای کم‌موجودی", "منتجات منخفضة المخزون", "Düşük stoklu ürünler", "Low stock")} value={n(lowStockProducts.length)} color={lowStockProducts.length ? "text-amber-300" : "text-green-300"} />
        <ReportCard icon={<Banknote />} title={tr("خالص نقدی", "صافي النقد", "Net nakit akışı", "Net cashflow")} value={money(cashflow.net_cashflow || 0)} color={toNumber(cashflow.net_cashflow) >= 0 ? "text-[var(--erp-accent)]" : "text-red-300"} />
        <ReportCard icon={<Activity />} title={tr("تراکنش‌ها", "المعاملات", "İşlemler", "Transactions")} value={n(transactions.length)} hint={tr("دریافت و پرداخت", "المقبوضات والمدفوعات", "Tahsilat ve ödeme", "Receipts & payments")} color="text-[var(--erp-accent)]" />
      </div>

      <div className="flex gap-2 flex-wrap bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-3 no-print">
        {tabs.map(([key, tabLabel]) => (
          <button type="button" key={key} onClick={() => setActive(key)} className={`px-4 py-3 rounded-2xl font-black ${active === key ? "bg-[var(--erp-accent)] text-slate-950" : "bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]"}`}>
            {tabLabel}
          </button>
        ))}
      </div>

      {(active === "cash" || active === "transactions" || active === "customers") && (
        <div className="vitalix-input-group !rounded-2xl !bg-[var(--erp-bg-soft)] flex items-center gap-2 px-4 py-3 no-print">
          <Search size={18} className="text-[var(--erp-accent)]" />
          <input value={query} onChange={(e) => setQuery(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)} placeholder={tr("جستجو...", "بحث...", "Ara...", "Search...")} className="min-w-0 flex-1 text-[var(--erp-text)] placeholder-[var(--erp-muted)]" />
        </div>
      )}

      {active === "summary" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartPanel title={tr("تحلیل مالی کل", "التحليل المالي الشامل", "Genel finansal analiz", "Financial analysis")}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={financialChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis stroke="#cbd5e1" tickFormatter={n} width={80} />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Bar dataKey="value" name={tr("مقدار", "القيمة", "Değer", "Value")} fill="#22d3ee" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title={tr("بدهکاران و بستانکاران", "المدينون والدائنون", "Borçlular ve alacaklılar", "Debtors & creditors")}>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={debtorCreditorData} dataKey="value" nameKey="name" outerRadius={110} label={(entry) => n(entry.value)}>
                    {debtorCreditorData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip money={money} />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title={tr("بدهکاران برتر", "أكبر المدينين", "En büyük borçlular", "Top debtors")}>
              {topDebtors.slice(0, 10).map((c) => <Row key={c.id} title={c.name} subtitle={c.phone || "-"} value={money(getDebtor(c))} color="text-red-300" />)}
              {topDebtors.length === 0 && <Empty tr={tr} />}
            </Panel>

            <Panel title={tr("بستانکاران برتر", "أكبر الدائنين", "En büyük alacaklılar", "Top creditors")}>
              {topCreditors.slice(0, 10).map((c) => <Row key={c.id} title={c.name} subtitle={c.phone || "-"} value={money(getCreditor(c))} color="text-green-300" />)}
              {topCreditors.length === 0 && <Empty tr={tr} />}
            </Panel>

            <Panel title={tr("هشدار فاکتورهای باز", "تنبيهات الفواتير المفتوحة", "Açık fatura uyarıları", "Open invoice alerts")}>
              {openInvoices.slice(0, 10).map((inv) => <Row key={inv.id} title={`${tr("فاکتور", "فاتورة", "Fatura", "Invoice")} #${n(inv.id)}`} subtitle={date(inv.created_at)} value={money(inv.remaining_amount ?? inv.total_amount ?? 0)} color="text-amber-300" />)}
              {openInvoices.length === 0 && <Empty tr={tr} />}
            </Panel>

            <Panel title={tr("کالاهای کم‌موجودی", "منتجات منخفضة المخزون", "Düşük stoklu ürünler", "Low stock products")}>
              {lowStockProducts.slice(0, 10).map((p) => <Row key={p.id} title={p.name} subtitle={`${p.barcode || p.code || "-"} • ${tr("حداقل", "الحد الأدنى", "Min", "Min")}: ${n(p.min_stock || 0)}`} value={n(p.stock || 0)} color="text-amber-300" />)}
              {lowStockProducts.length === 0 && <Empty tr={tr} />}
            </Panel>
          </div>
        </div>
      )}

      {active === "charts" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartPanel title={tr("نمودار سود و زیان", "مخطط الأرباح والخسائر", "Kâr ve zarar grafiği", "Profit & loss chart")}>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={financialChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" tickFormatter={n} width={80} />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Bar dataKey="value" name={tr("مقدار", "القيمة", "Değer", "Value")} fill="#34d399" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={tr("نمودار دریافت و پرداخت", "مخطط المقبوضات والمدفوعات", "Tahsilat ve ödeme grafiği", "Cashflow chart")}>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={cashflowChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" tickFormatter={n} width={80} />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Area type="monotone" dataKey="value" name={tr("مقدار", "القيمة", "Değer", "Value")} stroke="#22d3ee" fill="#22d3ee55" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={tr("روند ماهانه دریافت و پرداخت", "الاتجاه الشهري للمقبوضات والمدفوعات", "Aylık nakit trendi", "Monthly cash trend")}>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={monthlySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#cbd5e1" tickFormatter={(m) => formatMonthLabel(m, language)} />
                <YAxis stroke="#cbd5e1" tickFormatter={n} width={80} />
                <Tooltip content={<ChartTooltip money={money} labelFormatter={(m) => formatMonthLabel(m, language)} />} />
                <Line type="monotone" dataKey="receipts" name={tr("دریافت", "المقبوضات", "Tahsilat", "Receipts")} stroke="#34d399" strokeWidth={3} />
                <Line type="monotone" dataKey="payments" name={tr("پرداخت", "المدفوعات", "Ödemeler", "Payments")} stroke="#fb7185" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={tr("ارزش موجودی برتر", "أعلى قيمة مخزون", "En yüksek envanter değeri", "Top inventory value")}>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={inventoryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" tickFormatter={n} width={80} />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Bar dataKey="value" name={tr("مقدار", "القيمة", "Değer", "Value")} fill="#a78bfa" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      )}

      {active === "profit" && (
        <Panel title={tr("صورت سود و زیان", "بيان الأرباح والخسائر", "Kâr ve zarar tablosu", "Profit and loss")}>
          <ReportLine label={tr("فروش", "المبيعات", "Satış", "Sales")} value={money(profit.sales || 0)} />
          <ReportLine label={tr("کسر: مرجوعی فروش", "ناقص: مرتجعات المبيعات", "Eksi: satış iadeleri", "Less: sales returns")} value={money(profit.sales_returns || 0)} negative />
          <ReportLine label={tr("فروش خالص", "صافي المبيعات", "Net satış", "Net sales")} value={money(profit.net_sales || 0)} strong />
          <ReportLine label={tr("خرید", "المشتريات", "Alış", "Purchases")} value={money(profit.purchases || 0)} />
          <ReportLine label={tr("کسر: مرجوعی خرید", "ناقص: مرتجعات المشتريات", "Eksi: alış iadeleri", "Less: purchase returns")} value={money(profit.purchase_returns || 0)} negative />
          <ReportLine label={tr("خرید خالص", "صافي المشتريات", "Net alış", "Net purchases")} value={money(profit.net_purchases || 0)} strong />
          <ReportLine label={tr("سود ناخالص", "إجمالي الربح", "Brüt kâr", "Gross profit")} value={money(profit.gross_profit || 0)} strong />
          <ReportLine label={tr("هزینه‌ها", "المصروفات", "Giderler", "Expenses")} value={money(profit.expenses ?? fallbackTotals.expensesTotal)} negative />
          <ReportLine label={tr("سود خالص", "صافي الربح", "Net kâr", "Net profit")} value={money(profit.net_profit || 0)} strong color={toNumber(profit.net_profit) >= 0 ? "text-[var(--erp-accent)]" : "text-red-300"} />
        </Panel>
      )}

      {active === "trial" && (
        <Panel title={tr("تراز آزمایشی", "ميزان المراجعة", "Mizan", "Trial balance")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ReportCard icon={<Scale />} title={tr("جمع بدهکار", "إجمالي المدين", "Toplam borç", "Total debit")} value={money(trial.total_debit || 0)} color="text-red-300" />
            <ReportCard icon={<Scale />} title={tr("جمع بستانکار", "إجمالي الدائن", "Toplam alacak", "Total credit")} value={money(trial.total_credit || 0)} color="text-green-300" />
            <ReportCard icon={<Scale />} title={tr("اختلاف", "الفرق", "Fark", "Difference")} value={money(Math.abs(toNumber(trial.difference)))} color={trial.is_balanced ? "text-[var(--erp-accent)]" : "text-amber-300"} />
          </div>
          <div className={`mt-4 p-4 rounded-2xl ${trial.is_balanced ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`}>
            {trial.is_balanced
              ? tr("تراز آزمایشی برابر است.", "ميزان المراجعة متوازن.", "Mizan dengeli.", "Trial balance is balanced.")
              : tr("تراز آزمایشی اختلاف دارد.", "يوجد فرق في ميزان المراجعة.", "Mizanda fark var.", "Trial balance has a difference.")}
          </div>
        </Panel>
      )}

      {active === "customers" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Panel title={tr("مطالبات از مشتریان", "المستحقات من العملاء", "Müşterilerden alacaklar", "Receivables from customers")}>
            <Table dir={dir} className="erp-report-table">
              <Thead>
                <Th className="w-12">{tr("ردیف", "#", "#", "#")}</Th>
                <Th>{tr("نام", "الاسم", "Ad", "Name")}</Th>
                <Th>{tr("تلفن", "الهاتف", "Telefon", "Phone")}</Th>
                <Th align="end">{tr("تعداد فاکتور", "عدد الفواتير", "Fatura sayısı", "Invoices")}</Th>
                <Th>{tr("آخرین تراکنش", "آخر معاملة", "Son işlem", "Last transaction")}</Th>
                <Th align="end">{tr("مانده بدهکار", "الرصيد المدين", "Borç bakiyesi", "Debit balance")}</Th>
              </Thead>
              <Tbody>
                {topDebtors.map((c, index) => (
                  <Tr key={c.id}>
                    <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                    <Td className="font-black">{c.name || "-"}</Td>
                    <Td>{c.phone ? (language === "fa" ? toPersianDigits(c.phone) : c.phone) : "-"}</Td>
                    <Td align="end">{n(c.invoice_count || 0)}</Td>
                    <Td>{c.last_transaction_date ? date(c.last_transaction_date) : "-"}</Td>
                    <Td align="end" className="font-black text-red-300">{money(getDebtor(c))}</Td>
                  </Tr>
                ))}
                {topDebtors.length === 0 && <EmptyRow colSpan={6}><Empty tr={tr} /></EmptyRow>}
              </Tbody>
            </Table>
          </Panel>
          <Panel title={tr("بدهی به تامین‌کنندگان / بستانکاران", "الديون للموردين / الدائنين", "Tedarikçi borçları / Alacaklılar", "Payables / Creditors")}>
            <Table dir={dir} className="erp-report-table">
              <Thead>
                <Th className="w-12">{tr("ردیف", "#", "#", "#")}</Th>
                <Th>{tr("نام", "الاسم", "Ad", "Name")}</Th>
                <Th>{tr("تلفن", "الهاتف", "Telefon", "Phone")}</Th>
                <Th align="end">{tr("تعداد فاکتور", "عدد الفواتير", "Fatura sayısı", "Invoices")}</Th>
                <Th>{tr("آخرین تراکنش", "آخر معاملة", "Son işlem", "Last transaction")}</Th>
                <Th align="end">{tr("مانده بستانکار", "الرصيد الدائن", "Alacak bakiyesi", "Credit balance")}</Th>
              </Thead>
              <Tbody>
                {topCreditors.map((c, index) => (
                  <Tr key={c.id}>
                    <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                    <Td className="font-black">{c.name || "-"}</Td>
                    <Td>{c.phone ? (language === "fa" ? toPersianDigits(c.phone) : c.phone) : "-"}</Td>
                    <Td align="end">{n(c.invoice_count || 0)}</Td>
                    <Td>{c.last_transaction_date ? date(c.last_transaction_date) : "-"}</Td>
                    <Td align="end" className="font-black text-green-300">{money(getCreditor(c))}</Td>
                  </Tr>
                ))}
                {topCreditors.length === 0 && <EmptyRow colSpan={6}><Empty tr={tr} /></EmptyRow>}
              </Tbody>
            </Table>
          </Panel>
        </div>
      )}

      {active === "products" && (
        <div className="space-y-6">
          <ChartPanel title={tr("سودآورترین کالاها", "أكثر المنتجات ربحية", "En kârlı ürünler", "Most profitable products")}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={productProfitChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" tickFormatter={n} width={80} />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Bar dataKey="profit" name={tr("سود", "الربح", "Kâr", "Profit")} fill="#22d3ee" radius={[12, 12, 0, 0]} />
                <Bar dataKey="revenue" name={tr("درآمد", "الإيراد", "Gelir", "Revenue")} fill="#34d399" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <Panel title={tr("گزارش سود هر کالا", "تقرير ربح كل منتج", "Ürün kârı raporu", "Product profit report")}>
            <Table dir={dir} className="erp-report-table">
              <Thead>
                <Th className="w-12">{tr("ردیف", "#", "#", "#")}</Th>
                <Th>{tr("کالا", "المنتج", "Ürün", "Product")}</Th>
                <Th>{tr("بارکد", "الباركود", "Barkod", "Barcode")}</Th>
                <Th>{tr("برند", "العلامة التجارية", "Marka", "Brand")}</Th>
                <Th align="end">{tr("فروش", "المباع", "Satılan", "Sold")}</Th>
                <Th align="end">{tr("مرجوعی", "المرتجع", "İade", "Returned")}</Th>
                <Th align="end">{tr("درآمد", "الإيراد", "Gelir", "Revenue")}</Th>
                <Th align="end">{tr("هزینه", "التكلفة", "Maliyet", "Cost")}</Th>
                <Th align="end">{tr("حاشیه", "الهامش", "Marj", "Margin")}</Th>
                <Th align="end">{tr("سود", "الربح", "Kâr", "Profit")}</Th>
              </Thead>
              <Tbody>
                {productProfitRows.map((p, index) => (
                  <Tr key={p.product_id || p.id || p.name}>
                    <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                    <Td className="font-black">{p.name || "-"}</Td>
                    <Td>{p.barcode || "-"}</Td>
                    <Td>{p.brand || "-"}</Td>
                    <Td align="end">{n(p.sold_qty || 0)}</Td>
                    <Td align="end">{n(p.returned_qty || 0)}</Td>
                    <Td align="end">{money(p.revenue || 0)}</Td>
                    <Td align="end">{money(p.cost || 0)}</Td>
                    <Td align="end">{n(Number(p.margin_percent || 0).toFixed(1))}%</Td>
                    <Td align="end" className={`font-black ${toNumber(p.profit) >= 0 ? "text-[var(--erp-accent)]" : "text-red-300"}`}>{money(p.profit)}</Td>
                  </Tr>
                ))}
                {productProfitRows.length === 0 && <EmptyRow colSpan={10}><Empty tr={tr} /></EmptyRow>}
              </Tbody>
            </Table>
          </Panel>
        </div>
      )}

      {active === "invoices" && (
        <Panel title={tr("فاکتورهای باز و تسویه نشده", "الفواتير المفتوحة وغير المسواة", "Açık ve ödenmemiş faturalar", "Open and unsettled invoices")}>
          <Table dir={dir} className="erp-report-table">
            <Thead>
              <Th className="w-12">{tr("ردیف", "#", "#", "#")}</Th>
              <Th>{tr("فاکتور", "فاتورة", "Fatura", "Invoice")}</Th>
              <Th>{tr("تاریخ", "التاريخ", "Tarih", "Date")}</Th>
              <Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
              <Th align="end">{tr("مبلغ", "المبلغ", "Tutar", "Amount")}</Th>
            </Thead>
            <Tbody>
              {openInvoices.map((inv, index) => (
                <Tr key={inv.id}>
                  <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                  <Td className="font-black">#{n(inv.id)}</Td>
                  <Td>{date(inv.created_at)}</Td>
                  <Td>{paymentStatusLabel(inv.settlement_status || inv.payment_status, language)}</Td>
                  <Td align="end" className="font-black text-amber-300">{money(inv.remaining_amount ?? inv.total_amount ?? 0)}</Td>
                </Tr>
              ))}
              {openInvoices.length === 0 && <EmptyRow colSpan={5}><Empty tr={tr} /></EmptyRow>}
            </Tbody>
          </Table>
        </Panel>
      )}

      {active === "cash" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Panel title={tr("جریان نقدی", "التدفق النقدي", "Nakit akışı", "Cashflow")}>
            <ReportLine label={tr("کل دریافت", "إجمالي المقبوضات", "Toplam tahsilat", "Total receipts")} value={money(cashflow.receipt_total || 0)} strong />
            <ReportLine label={tr("کل پرداخت", "إجمالي المدفوعات", "Toplam ödeme", "Total payments")} value={money(cashflow.payment_total || 0)} negative />
            <ReportLine label={tr("خالص نقدی", "صافي النقد", "Net nakit akışı", "Net cashflow")} value={money(cashflow.net_cashflow || 0)} strong color={toNumber(cashflow.net_cashflow) >= 0 ? "text-[var(--erp-accent)]" : "text-red-300"} />
            <ReportLine label={tr("دریافت امروز", "المقبوضات اليوم", "Bugünkü tahsilat", "Receipts today")} value={money(cashflow.receipt_today || 0)} />
            <ReportLine label={tr("پرداخت امروز", "المدفوعات اليوم", "Bugünkü ödeme", "Payments today")} value={money(cashflow.payment_today || 0)} />
            <ReportLine label={tr("دریافت ماه", "مقبوضات هذا الشهر", "Bu ayki tahsilat", "Receipts this month")} value={money(cashflow.receipt_month || 0)} />
            <ReportLine label={tr("پرداخت ماه", "مدفوعات هذا الشهر", "Bu ayki ödeme", "Payments this month")} value={money(cashflow.payment_month || 0)} />
          </Panel>

          <Panel title={tr("تراکنش‌های اخیر", "المعاملات الأخيرة", "Son işlemler", "Recent transactions")}>
            <TransactionsTable items={filteredTransactions.slice(0, 12)} money={money} n={n} date={date} tr={tr} language={language} dir={dir} />
          </Panel>
        </div>
      )}

      {active === "inventory" && (
        <Panel title={tr("گزارش پیشرفته موجودی کالا", "تقرير مخزون متقدم", "Gelişmiş envanter raporu", "Advanced inventory report")}>
          <Table dir={dir} className="erp-report-table">
            <Thead>
              <Th className="w-12">{tr("ردیف", "#", "#", "#")}</Th>
              <Th>{tr("کالا", "المنتج", "Ürün", "Product")}</Th>
              <Th>{tr("بارکد", "الباركود", "Barkod", "Barcode")}</Th>
              <Th align="end">{tr("موجودی", "المخزون", "Stok", "Stock")}</Th>
              <Th align="end">{tr("حداقل", "الحد الأدنى", "Min", "Min")}</Th>
              <Th align="end">{tr("ارزش فروش", "قيمة البيع", "Satış değeri", "Sale value")}</Th>
              <Th align="end">{tr("ارزش خرید", "قيمة الشراء", "Alış değeri", "Buy value")}</Th>
              <Th>{tr("واحد", "الوحدة", "Birim", "Unit")}</Th>
              <Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
            </Thead>
            <Tbody>
              {inventoryProducts.map((p, index) => {
                const { label: statusLabel, className: statusClass } = inventoryStatus(p.stock_status, tr);
                return (
                  <Tr key={p.id || p.name}>
                    <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                    <Td className="font-black">{p.name || "-"}</Td>
                    <Td>{p.barcode || p.code || "-"}</Td>
                    <Td align="end">{n(p.stock || 0)}</Td>
                    <Td align="end">{n(p.min_stock || 0)}</Td>
                    <Td align="end">{money(p.value || 0)}</Td>
                    <Td align="end">{money(p.buy_value || 0)}</Td>
                    <Td>{p.unit || "-"}</Td>
                    <Td><span className={`px-3 py-1 rounded-xl font-black ${statusClass}`}>{statusLabel}</span></Td>
                  </Tr>
                );
              })}
              {inventoryProducts.length === 0 && <EmptyRow colSpan={9}><Empty tr={tr} /></EmptyRow>}
            </Tbody>
          </Table>
        </Panel>
      )}

      {active === "transactions" && (
        <Panel title={tr("گزارش کامل تراکنش‌ها", "تقرير كامل بالمعاملات", "Tam işlem raporu", "Full transactions report")}>
          <TransactionsTable items={filteredTransactions} money={money} n={n} date={date} tr={tr} language={language} dir={dir} />
        </Panel>
      )}

      <ReportFooter confidential />

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-6 no-print">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[var(--erp-glow)] flex items-center justify-center">
            <BarChart3 className="text-[var(--erp-accent)]" />
          </div>
          <h2 className="text-2xl font-black text-[var(--erp-accent)]">{tr("خروجی فاکتورها", "تصدير الفواتير", "Fatura dışa aktarma", "Invoice Exports")}</h2>
        </div>

        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={() => downloadInvoiceExport("pdf")} className="px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2">
            <FileText size={18} />
            {tr("دانلود PDF", "تنزيل PDF", "PDF indir", "Download PDF")}
          </button>

          <button type="button" onClick={() => downloadInvoiceExport("excel")} className="px-5 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2">
            <FileSpreadsheet size={18} />
            {tr("دانلود Excel", "تنزيل Excel", "Excel indir", "Download Excel")}
          </button>
        </div>
      </div>

      <style>
        {`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            .reports-page { color: #0f172a !important; background: white !important; }
            .reports-page * { box-shadow: none !important; }
          }
        `}
      </style>
    </div>
  );
}

const SCHEDULE_REPORT_TYPES = [
  ["sales", "Sales Invoices"],
  ["purchases", "Purchase Invoices"],
  ["inventory", "Inventory"],
  ["customer_balances", "Customer Balances"],
  ["product_profit", "Product Profitability"],
  ["open_invoices", "Open (Unsettled) Invoices"],
  ["inventory_movements", "Stock Movements"],
];

const WEEKDAY_LABELS = {
  fa: ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"],
  ar: ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
  tr: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

function ScheduledReportsPanel({ tr, language }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    report_type: "sales",
    report_format: "pdf",
    destination_email: "",
    frequency: "weekly",
    hour: 8,
    day_of_week: 0,
    day_of_month: 1,
  });

  async function load() {
    setLoading(true);
    try {
      const rows = await getReportSchedules();
      setSchedules(Array.isArray(rows) ? rows : []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.destination_email.trim()) {
      toast.error(tr("ایمیل مقصد لازم است", "البريد الإلكتروني للمستلم مطلوب", "Alıcı e-postası gereklidir", "Destination email is required"));
      return;
    }
    try {
      const result = await createReportSchedule({ ...form, hour: Number(form.hour) || 0, day_of_week: Number(form.day_of_week) || 0, day_of_month: Number(form.day_of_month) || 1 });
      if (result?.status === "error") throw new Error(result.message);
      toast.success(tr("زمان‌بندی ایجاد شد.", "تم إنشاء الجدولة.", "Zamanlama oluşturuldu.", "Schedule created."));
      setForm({ ...form, destination_email: "" });
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleToggle(id) {
    try { await toggleReportSchedule(id); await load(); } catch (err) { toast.error(err.message); }
  }
  async function handleDelete(id) {
    try { await deleteReportSchedule(id); await load(); } catch (err) { toast.error(err.message); }
  }

  const weekdays = WEEKDAY_LABELS[language] || WEEKDAY_LABELS.en;

  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 no-print space-y-4">
      <h2 className="text-xl font-black text-[var(--erp-accent)]">
        {tr("زمان‌بندی ارسال ایمیل گزارش‌ها", "جدولة إرسال التقارير بالبريد", "Rapor e-posta zamanlaması", "Scheduled report email delivery")}
      </h2>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <Select
          value={form.report_type}
          onChange={(value) => setForm({ ...form, report_type: value })}
          options={SCHEDULE_REPORT_TYPES.map(([key, label]) => ({ value: key, label }))}
        />
        <Select
          value={form.report_format}
          onChange={(value) => setForm({ ...form, report_format: value })}
          options={[
            { value: "pdf", label: "PDF" },
            { value: "csv", label: "CSV" },
          ]}
        />
        <input type="email" required placeholder={tr("ایمیل مقصد", "البريد الإلكتروني", "E-posta adresi", "Destination email")} value={form.destination_email} onChange={(e) => setForm({ ...form, destination_email: e.target.value })} className="bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl p-3 outline-none" style={{ direction: "ltr" }} />
        <Select
          value={form.frequency}
          onChange={(value) => setForm({ ...form, frequency: value })}
          options={[
            { value: "daily", label: tr("روزانه", "يوميًا", "Günlük", "Daily") },
            { value: "weekly", label: tr("هفتگی", "أسبوعيًا", "Haftalık", "Weekly") },
            { value: "monthly", label: tr("ماهانه", "شهريًا", "Aylık", "Monthly") },
          ]}
        />
        {form.frequency === "weekly" && (
          <Select
            value={form.day_of_week}
            onChange={(value) => setForm({ ...form, day_of_week: value })}
            options={weekdays.map((day, index) => ({ value: index, label: day }))}
          />
        )}
        {form.frequency === "monthly" && (
          <input type="number" min="1" max="28" value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: e.target.value })} className="bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl p-3 outline-none" placeholder={tr("روز ماه", "يوم الشهر", "Ayın günü", "Day of month")} />
        )}
        <input type="number" min="0" max="23" value={form.hour} onChange={(e) => setForm({ ...form, hour: e.target.value })} className="bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl p-3 outline-none" placeholder={tr("ساعت (UTC)", "الساعة (UTC)", "Saat (UTC)", "Hour (UTC)")} />
        <button type="submit" className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black xl:col-span-6 md:col-span-2">
          {tr("افزودن زمان‌بندی", "إضافة جدولة", "Zamanlama ekle", "Add schedule")}
        </button>
      </form>

      {!loading && schedules.length === 0 && (
        <p className="text-[var(--erp-muted)] text-sm">{tr("زمان‌بندی‌ای ثبت نشده است.", "لا توجد جدولات مسجلة.", "Kayıtlı zamanlama yok.", "No schedules yet.")}</p>
      )}

      {schedules.length > 0 && (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3 text-sm">
              <div>
                <span className="font-bold">{SCHEDULE_REPORT_TYPES.find(([k]) => k === s.report_type)?.[1] || s.report_type}</span>
                <span className="text-[var(--erp-muted)]"> ({s.report_format.toUpperCase()}) → {s.destination_email}</span>
                <div className="text-xs text-[var(--erp-muted)] mt-1">
                  {s.frequency === "daily" && tr(`روزانه ساعت ${s.hour}`, `يوميًا الساعة ${s.hour}`, `Her gün saat ${s.hour}`, `Daily at ${s.hour}:00 UTC`)}
                  {s.frequency === "weekly" && tr(`هفتگی، ${weekdays[s.day_of_week] || ""} ساعت ${s.hour}`, `أسبوعيًا، ${weekdays[s.day_of_week] || ""} الساعة ${s.hour}`, `Haftalık, ${weekdays[s.day_of_week] || ""} saat ${s.hour}`, `Weekly on ${weekdays[s.day_of_week] || ""} at ${s.hour}:00 UTC`)}
                  {s.frequency === "monthly" && tr(`ماهانه، روز ${s.day_of_month} ساعت ${s.hour}`, `شهريًا، اليوم ${s.day_of_month} الساعة ${s.hour}`, `Aylık, ayın ${s.day_of_month}. günü saat ${s.hour}`, `Monthly on day ${s.day_of_month} at ${s.hour}:00 UTC`)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(s.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${s.active ? "bg-emerald-500/20 text-emerald-200" : "bg-[var(--erp-panel)] text-[var(--erp-muted)]"}`}>
                  {s.active ? tr("فعال", "نشط", "Aktif", "Active") : tr("متوقف", "متوقف", "Duraklatıldı", "Paused")}
                </button>
                <button onClick={() => handleDelete(s.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-300">
                  {tr("حذف", "حذف", "Sil", "Delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ icon, title, value, hint, color }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 shadow-xl">
      <div className="flex items-center gap-3 text-[var(--erp-accent)] mb-3">
        {icon}
        <span className="text-[var(--erp-muted)] font-bold">{title}</span>
      </div>
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      {hint && <div className="text-xs text-[var(--erp-muted)] mt-2">{hint}</div>}
    </div>
  );
}

function ChartPanel({ title, children }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 shadow-xl">
      <h2 className="text-xl font-black text-[var(--erp-accent)] mb-4">{title}</h2>
      <div className="bg-[var(--erp-panel)] rounded-2xl p-3">{children}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 shadow-xl">
      <h2 className="text-xl font-black text-[var(--erp-accent)] mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ title, subtitle, value, color }) {
  return (
    <div className="bg-[var(--erp-panel-solid)] rounded-2xl p-4 flex items-center justify-between gap-3">
      <div>
        <div className="font-black text-[var(--erp-text)]">{title}</div>
        <div className="text-xs text-[var(--erp-muted)] mt-1">{subtitle}</div>
      </div>
      <div className={`font-black text-end ${color}`}>{value}</div>
    </div>
  );
}

function ReportLine({ label, value, strong, negative, color }) {
  return (
    <div className={`bg-[var(--erp-panel-solid)] rounded-2xl p-4 flex justify-between gap-3 ${strong ? "border border-[var(--erp-border)]" : ""}`}>
      <span className="text-[var(--erp-muted)] font-bold">{label}</span>
      <span className={`font-black ${color || (negative ? "text-red-300" : "text-[var(--erp-text)]")}`}>{value}</span>
    </div>
  );
}

// Shared by the "cash" and "transactions" tabs - both list the same
// transaction shape (date, description, source, debit/credit), so the
// table markup is centralized here instead of duplicated per tab.
function TransactionsTable({ items, money, n, date, tr, language, dir }) {
  return (
    <Table dir={dir} className="erp-report-table">
      <Thead>
        <Th className="w-12">{tr("ردیف", "#", "#", "#")}</Th>
        <Th>{tr("تاریخ", "التاريخ", "Tarih", "Date")}</Th>
        <Th>{tr("شرح", "الوصف", "Açıklama", "Description")}</Th>
        <Th>{tr("نوع", "النوع", "Tür", "Type")}</Th>
        <Th align="end">{tr("بدهکار", "مدين", "Borç", "Debit")}</Th>
        <Th align="end">{tr("بستانکار", "دائن", "Alacak", "Credit")}</Th>
      </Thead>
      <Tbody>
        {items.map((x, index) => {
          const debit = toNumber(x.debit);
          const credit = toNumber(x.credit);
          const typeLabel = sourceTypeLabel(x.source_type, language);
          return (
            <Tr key={x.id}>
              <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
              <Td>{date(x.created_at)}</Td>
              <Td>{x.description || typeLabel}</Td>
              <Td>{typeLabel}</Td>
              <Td align="end" className="font-black text-red-300">{debit > 0 ? money(debit) : "-"}</Td>
              <Td align="end" className="font-black text-green-300">{credit > 0 ? money(credit) : "-"}</Td>
            </Tr>
          );
        })}
        {items.length === 0 && <EmptyRow colSpan={6}><Empty tr={tr} /></EmptyRow>}
      </Tbody>
    </Table>
  );
}

function ChartTooltip({ active, payload, label, money, labelFormatter }) {
  if (!active || !payload?.length) return null;
  // recharts does not call the <Tooltip labelFormatter> prop when a custom
  // `content` component is supplied - it hands off all rendering, so this
  // component must apply its own label formatting.
  const displayLabel = labelFormatter ? labelFormatter(label) : label;
  return (
    <div className="bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl p-3 text-sm shadow-2xl">
      <div className="text-[var(--erp-accent)] font-black mb-2">{displayLabel}</div>
      {payload.map((item, index) => (
        <div key={index} className="text-[var(--erp-text)] flex items-center justify-between gap-4">
          <span>{item.name}</span>
          <b>{typeof item.value === "number" ? money(item.value) : item.value}</b>
        </div>
      ))}
    </div>
  );
}

function Empty({ tr }) {
  return <div className="text-[var(--erp-muted)]">{tr("داده‌ای وجود ندارد.", "لا توجد بيانات.", "Veri yok.", "No data.")}</div>;
}
