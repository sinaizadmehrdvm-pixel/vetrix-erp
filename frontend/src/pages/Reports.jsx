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
  ArrowUpRight,
  ArrowDownRight,
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

import { useLanguage } from "../localization/LanguageContext";

import {
  API_URL,
  getCustomers,
  getDashboardStats,
  getExpenses,
  getProducts,
  getTransactions,
  getReportsOverview,
  getProductProfitReport,
  getCustomerBalanceReport,
  getInventoryMovementReport,
} from "../services/api";

import {
  getReportsOffline,
  saveReportsOffline,
} from "../storage/reports.store";

const CHART_COLORS = ["#22d3ee", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#60a5fa"];

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

  const blob = new Blob(["\uFEFF" + csv], {
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
  const fa = language === "fa";

  const [stats, setStats] = useState({});
  const [overview, setOverview] = useState({});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [productProfit, setProductProfit] = useState([]);
  const [customerBalanceReport, setCustomerBalanceReport] = useState({ all: [], debtors: [], creditors: [] });
  const [inventoryMovements, setInventoryMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState("summary");
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
            fa
              ? "اتصال به سرور برقرار نشد؛ گزارش‌ها از حافظه آفلاین نمایش داده شدند."
              : "Server unavailable; reports are loaded from offline cache."
          );
        } else {
          setError(
            err.message ||
              (fa
                ? "خطا در دریافت گزارش‌ها و کش آفلاین موجود نیست"
                : "Error loading reports and no offline cache found")
          );
        }
      } catch (cacheErr) {
        console.error("Offline reports cache error", cacheErr);
        setError(
          err.message || (fa ? "خطا در دریافت گزارش‌ها" : "Error loading reports")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const profit = overview?.profit_loss || {};
  const trial = overview?.trial_balance || {};
  const cashflow = overview?.cashflow || {};
  const invoiceSummary = overview?.invoice_summary || {};
  const inventory = overview?.inventory || {};
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
  }, [inventory?.products, products]);

  const lowStockProducts = useMemo(() => {
    return safeArray(inventory?.low_stock_products).length
      ? safeArray(inventory.low_stock_products)
      : inventoryProducts.filter((p) => p.low_stock);
  }, [inventory?.low_stock_products, inventoryProducts]);

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
      { name: fa ? "فروش" : "Sales", value: toNumber(profit.net_sales ?? stats?.total_revenue) },
      { name: fa ? "خرید" : "Purchases", value: toNumber(profit.net_purchases ?? stats?.total_purchases) },
      { name: fa ? "هزینه" : "Expenses", value: toNumber(profit.expenses ?? stats?.total_expenses ?? fallbackTotals.expensesTotal) },
      { name: fa ? "سود" : "Profit", value: toNumber(profit.net_profit ?? stats?.net_profit) },
    ];
  }, [fa, profit, stats, fallbackTotals.expensesTotal]);

  const cashflowChartData = useMemo(() => {
    return [
      { name: fa ? "دریافت امروز" : "Receipt today", value: toNumber(cashflow.receipt_today) },
      { name: fa ? "پرداخت امروز" : "Payment today", value: toNumber(cashflow.payment_today) },
      { name: fa ? "دریافت ماه" : "Receipt month", value: toNumber(cashflow.receipt_month) },
      { name: fa ? "پرداخت ماه" : "Payment month", value: toNumber(cashflow.payment_month) },
      { name: fa ? "خالص" : "Net", value: toNumber(cashflow.net_cashflow) },
    ];
  }, [fa, cashflow]);

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
      { name: fa ? "بدهکاران" : "Debtors", value: fallbackTotals.debtors },
      { name: fa ? "بستانکاران" : "Creditors", value: fallbackTotals.creditors },
    ];
  }, [fa, fallbackTotals.debtors, fallbackTotals.creditors]);

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
          unit: p.unit || (fa ? "عدد" : "pcs"),
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
  }, [productProfit, products, fa]);

  const productProfitChartData = useMemo(() => {
    return productProfitRows
      .filter((p) => toNumber(p.profit) !== 0 || toNumber(p.revenue) !== 0)
      .slice(0, 10)
      .map((p) => ({ name: p.name || "-", profit: toNumber(p.profit), revenue: toNumber(p.revenue), qty: toNumber(p.net_qty) }));
  }, [productProfitRows]);

  const tabs = [
    ["summary", fa ? "خلاصه مدیریتی" : "Summary"],
    ["charts", fa ? "نمودارهای مدیریتی" : "Executive charts"],
    ["profit", fa ? "سود و زیان" : "Profit & loss"],
    ["trial", fa ? "تراز آزمایشی" : "Trial balance"],
    ["customers", fa ? "مطالبات و بدهی‌ها" : "Receivables"],
    ["products", fa ? "سود کالا" : "Product profit"],
    ["invoices", fa ? "فاکتورهای باز" : "Open invoices"],
    ["cash", fa ? "دریافت و پرداخت" : "Cashflow"],
    ["inventory", fa ? "موجودی کالا" : "Inventory"],
    ["transactions", fa ? "تراکنش‌ها" : "Transactions"],
  ];

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

  return (
    <div dir={dir} style={{ direction: dir }} className="space-y-6 reports-page">
      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-4xl font-black text-cyan-400">
            {fa ? "گزارش‌های حرفه‌ای مدیریتی و حسابداری" : "Professional Management & Accounting Reports"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa
              ? "گزارشات کامل مشابه هلو و سپیدار: سود و زیان، تراز، مطالبات، بدهی‌ها، گردش نقدی، سود کالا و موجودی"
              : "Complete ERP reports: profit/loss, trial balance, receivables, payables, cashflow, product profit and inventory"}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button type="button" onClick={exportCurrentCsv} className="px-4 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2">
            <Download size={18} />
            {fa ? "خروجی CSV" : "CSV Export"}
          </button>

          <button type="button" onClick={() => window.print()} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20">
            <Printer size={18} />
            {fa ? "چاپ" : "Print"}
          </button>

          <button type="button" onClick={load} disabled={loading} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20 disabled:opacity-60">
            <RefreshCw size={18} />
            {loading ? (fa ? "در حال دریافت..." : "Loading...") : fa ? "به‌روزرسانی" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className={`rounded-2xl p-4 flex items-center gap-2 ${offlineMode ? "bg-amber-500/15 border border-amber-400/30 text-amber-100" : "bg-rose-500/15 border border-rose-400/30 text-rose-100"}`}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <ReportCard icon={<TrendingUp />} title={fa ? "فروش خالص" : "Net sales"} value={money(profit.net_sales ?? stats?.total_revenue ?? 0)} color="text-green-300" />
        <ReportCard icon={<TrendingDown />} title={fa ? "خرید خالص" : "Net purchases"} value={money(profit.net_purchases ?? stats?.total_purchases ?? 0)} color="text-red-300" />
        <ReportCard icon={<Wallet />} title={fa ? "هزینه‌ها" : "Expenses"} value={money(profit.expenses ?? stats?.total_expenses ?? fallbackTotals.expensesTotal)} color="text-amber-300" />
        <ReportCard icon={<BarChart3 />} title={fa ? "سود خالص" : "Net profit"} value={money(profit.net_profit ?? stats?.net_profit ?? 0)} color={toNumber(profit.net_profit ?? stats?.net_profit) >= 0 ? "text-cyan-300" : "text-red-300"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <ReportCard icon={<Users />} title={fa ? "جمع بدهکاران" : "Total debtors"} value={money(fallbackTotals.debtors)} color="text-red-300" />
        <ReportCard icon={<Users />} title={fa ? "جمع بستانکاران" : "Total creditors"} value={money(fallbackTotals.creditors)} color="text-green-300" />
        <ReportCard icon={<Package />} title={fa ? "ارزش موجودی فروش" : "Inventory sale value"} value={money(inventory.inventory_value ?? fallbackTotals.stockValue)} hint={fa ? `ارزش خرید: ${money(fallbackTotals.buyStockValue)}` : `Buy value: ${money(fallbackTotals.buyStockValue)}`} color="text-cyan-300" />
        <ReportCard icon={<Receipt />} title={fa ? "فاکتورهای باز" : "Open invoices"} value={n(invoiceSummary.open_count || openInvoices.length || 0)} hint={money(invoiceSummary.open_amount || 0)} color="text-amber-300" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <ReportCard icon={<Trophy />} title={fa ? "سود کالاها" : "Product profit"} value={money(productProfitRows.reduce((s, p) => s + toNumber(p.profit), 0))} hint={fa ? `${n(productProfitRows.length)} کالا` : `${n(productProfitRows.length)} products`} color="text-cyan-300" />
        <ReportCard icon={<Boxes />} title={fa ? "کالاهای کم‌موجودی" : "Low stock"} value={n(lowStockProducts.length)} color={lowStockProducts.length ? "text-amber-300" : "text-green-300"} />
        <ReportCard icon={<Banknote />} title={fa ? "خالص نقدی" : "Net cashflow"} value={money(cashflow.net_cashflow || 0)} color={toNumber(cashflow.net_cashflow) >= 0 ? "text-cyan-300" : "text-red-300"} />
        <ReportCard icon={<Activity />} title={fa ? "تراکنش‌ها" : "Transactions"} value={n(transactions.length)} hint={fa ? "دریافت و پرداخت" : "Receipts & payments"} color="text-cyan-300" />
      </div>

      <div className="flex gap-2 flex-wrap bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-3 no-print">
        {tabs.map(([key, tabLabel]) => (
          <button type="button" key={key} onClick={() => setActive(key)} className={`px-4 py-3 rounded-2xl font-black ${active === key ? "bg-cyan-400 text-slate-950" : "bg-slate-800 text-cyan-100"}`}>
            {tabLabel}
          </button>
        ))}
      </div>

      {(active === "cash" || active === "transactions" || active === "customers") && (
        <div className="flex items-center gap-2 bg-slate-900/60 border border-cyan-500/20 rounded-2xl px-4 py-3 no-print">
          <Search size={18} className="text-cyan-300" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={fa ? "جستجو..." : "Search..."} className="bg-transparent outline-none w-full text-white placeholder-slate-400" />
        </div>
      )}

      {active === "summary" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartPanel title={fa ? "تحلیل مالی کل" : "Financial analysis"}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={financialChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis stroke="#cbd5e1" />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Bar dataKey="value" fill="#22d3ee" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title={fa ? "بدهکاران و بستانکاران" : "Debtors & creditors"}>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={debtorCreditorData} dataKey="value" nameKey="name" outerRadius={110} label>
                    {debtorCreditorData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip money={money} />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title={fa ? "بدهکاران برتر" : "Top debtors"}>
              {topDebtors.slice(0, 10).map((c) => <Row key={c.id} title={c.name} subtitle={c.phone || "-"} value={money(getDebtor(c))} color="text-red-300" />)}
              {topDebtors.length === 0 && <Empty fa={fa} />}
            </Panel>

            <Panel title={fa ? "بستانکاران برتر" : "Top creditors"}>
              {topCreditors.slice(0, 10).map((c) => <Row key={c.id} title={c.name} subtitle={c.phone || "-"} value={money(getCreditor(c))} color="text-green-300" />)}
              {topCreditors.length === 0 && <Empty fa={fa} />}
            </Panel>

            <Panel title={fa ? "هشدار فاکتورهای باز" : "Open invoice alerts"}>
              {openInvoices.slice(0, 10).map((inv) => <Row key={inv.id} title={`${fa ? "فاکتور" : "Invoice"} #${n(inv.id)}`} subtitle={date(inv.created_at)} value={money(inv.remaining_amount ?? inv.total_amount ?? 0)} color="text-amber-300" />)}
              {openInvoices.length === 0 && <Empty fa={fa} />}
            </Panel>

            <Panel title={fa ? "کالاهای کم‌موجودی" : "Low stock products"}>
              {lowStockProducts.slice(0, 10).map((p) => <Row key={p.id} title={p.name} subtitle={`${p.barcode || p.code || "-"} • ${fa ? "حداقل" : "Min"}: ${n(p.min_stock || 0)}`} value={n(p.stock || 0)} color="text-amber-300" />)}
              {lowStockProducts.length === 0 && <Empty fa={fa} />}
            </Panel>
          </div>
        </div>
      )}

      {active === "charts" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartPanel title={fa ? "نمودار سود و زیان" : "Profit & loss chart"}>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={financialChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Bar dataKey="value" fill="#34d399" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={fa ? "نمودار دریافت و پرداخت" : "Cashflow chart"}>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={cashflowChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Area type="monotone" dataKey="value" stroke="#22d3ee" fill="#22d3ee55" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={fa ? "روند ماهانه دریافت و پرداخت" : "Monthly cash trend"}>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={monthlySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Line type="monotone" dataKey="receipts" stroke="#34d399" strokeWidth={3} />
                <Line type="monotone" dataKey="payments" stroke="#fb7185" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={fa ? "ارزش موجودی برتر" : "Top inventory value"}>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={inventoryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Bar dataKey="value" fill="#a78bfa" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      )}

      {active === "profit" && (
        <Panel title={fa ? "صورت سود و زیان" : "Profit and loss"}>
          <ReportLine label={fa ? "فروش" : "Sales"} value={money(profit.sales || 0)} />
          <ReportLine label={fa ? "کسر: مرجوعی فروش" : "Less: sales returns"} value={money(profit.sales_returns || 0)} negative />
          <ReportLine label={fa ? "فروش خالص" : "Net sales"} value={money(profit.net_sales || 0)} strong />
          <ReportLine label={fa ? "خرید" : "Purchases"} value={money(profit.purchases || 0)} />
          <ReportLine label={fa ? "کسر: مرجوعی خرید" : "Less: purchase returns"} value={money(profit.purchase_returns || 0)} negative />
          <ReportLine label={fa ? "خرید خالص" : "Net purchases"} value={money(profit.net_purchases || 0)} strong />
          <ReportLine label={fa ? "سود ناخالص" : "Gross profit"} value={money(profit.gross_profit || 0)} strong />
          <ReportLine label={fa ? "هزینه‌ها" : "Expenses"} value={money(profit.expenses ?? fallbackTotals.expensesTotal)} negative />
          <ReportLine label={fa ? "سود خالص" : "Net profit"} value={money(profit.net_profit || 0)} strong color={toNumber(profit.net_profit) >= 0 ? "text-cyan-300" : "text-red-300"} />
        </Panel>
      )}

      {active === "trial" && (
        <Panel title={fa ? "تراز آزمایشی" : "Trial balance"}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ReportCard icon={<Scale />} title={fa ? "جمع بدهکار" : "Total debit"} value={money(trial.total_debit || 0)} color="text-red-300" />
            <ReportCard icon={<Scale />} title={fa ? "جمع بستانکار" : "Total credit"} value={money(trial.total_credit || 0)} color="text-green-300" />
            <ReportCard icon={<Scale />} title={fa ? "اختلاف" : "Difference"} value={money(Math.abs(toNumber(trial.difference)))} color={trial.is_balanced ? "text-cyan-300" : "text-amber-300"} />
          </div>
          <div className={`mt-4 p-4 rounded-2xl ${trial.is_balanced ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`}>
            {trial.is_balanced ? (fa ? "تراز آزمایشی برابر است." : "Trial balance is balanced.") : (fa ? "تراز آزمایشی اختلاف دارد." : "Trial balance has a difference.")}
          </div>
        </Panel>
      )}

      {active === "customers" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Panel title={fa ? "مطالبات از مشتریان" : "Receivables from customers"}>
            {topDebtors.map((c) => <CustomerRow key={c.id} item={c} money={money} n={n} fa={fa} type="debtor" />)}
            {topDebtors.length === 0 && <Empty fa={fa} />}
          </Panel>
          <Panel title={fa ? "بدهی به تامین‌کنندگان / بستانکاران" : "Payables / Creditors"}>
            {topCreditors.map((c) => <CustomerRow key={c.id} item={c} money={money} n={n} fa={fa} type="creditor" />)}
            {topCreditors.length === 0 && <Empty fa={fa} />}
          </Panel>
        </div>
      )}

      {active === "products" && (
        <div className="space-y-6">
          <ChartPanel title={fa ? "سودآورترین کالاها" : "Most profitable products"}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={productProfitChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Bar dataKey="profit" fill="#22d3ee" radius={[12, 12, 0, 0]} />
                <Bar dataKey="revenue" fill="#34d399" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <Panel title={fa ? "گزارش سود هر کالا" : "Product profit report"}>
            {productProfitRows.map((p) => <ProductProfitRow key={p.product_id || p.id || p.name} item={p} money={money} n={n} fa={fa} />)}
            {productProfitRows.length === 0 && <Empty fa={fa} />}
          </Panel>
        </div>
      )}

      {active === "invoices" && (
        <Panel title={fa ? "فاکتورهای باز و تسویه نشده" : "Open and unsettled invoices"}>
          {openInvoices.map((inv) => <Row key={inv.id} title={`${fa ? "فاکتور" : "Invoice"} #${n(inv.id)}`} subtitle={`${date(inv.created_at)} • ${inv.settlement_status || inv.payment_status || "-"}`} value={money(inv.remaining_amount ?? inv.total_amount ?? 0)} color="text-amber-300" />)}
          {openInvoices.length === 0 && <Empty fa={fa} />}
        </Panel>
      )}

      {active === "cash" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Panel title={fa ? "جریان نقدی" : "Cashflow"}>
            <ReportLine label={fa ? "کل دریافت" : "Total receipts"} value={money(cashflow.receipt_total || 0)} strong />
            <ReportLine label={fa ? "کل پرداخت" : "Total payments"} value={money(cashflow.payment_total || 0)} negative />
            <ReportLine label={fa ? "خالص نقدی" : "Net cashflow"} value={money(cashflow.net_cashflow || 0)} strong color={toNumber(cashflow.net_cashflow) >= 0 ? "text-cyan-300" : "text-red-300"} />
            <ReportLine label={fa ? "دریافت امروز" : "Receipts today"} value={money(cashflow.receipt_today || 0)} />
            <ReportLine label={fa ? "پرداخت امروز" : "Payments today"} value={money(cashflow.payment_today || 0)} />
            <ReportLine label={fa ? "دریافت ماه" : "Receipts this month"} value={money(cashflow.receipt_month || 0)} />
            <ReportLine label={fa ? "پرداخت ماه" : "Payments this month"} value={money(cashflow.payment_month || 0)} />
          </Panel>

          <Panel title={fa ? "تراکنش‌های اخیر" : "Recent transactions"}>
            {filteredTransactions.slice(0, 12).map((x) => <TransactionRow key={x.id} item={x} money={money} date={date} fa={fa} />)}
            {filteredTransactions.length === 0 && <Empty fa={fa} />}
          </Panel>
        </div>
      )}

      {active === "inventory" && (
        <Panel title={fa ? "گزارش پیشرفته موجودی کالا" : "Advanced inventory report"}>
          {inventoryProducts.map((p) => <InventoryRow key={p.id || p.name} item={p} money={money} n={n} fa={fa} />)}
          {inventoryProducts.length === 0 && <Empty fa={fa} />}
        </Panel>
      )}

      {active === "transactions" && (
        <Panel title={fa ? "گزارش کامل تراکنش‌ها" : "Full transactions report"}>
          {filteredTransactions.map((x) => <TransactionRow key={x.id} item={x} money={money} date={date} fa={fa} />)}
          {filteredTransactions.length === 0 && <Empty fa={fa} />}
        </Panel>
      )}

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-6 no-print">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center">
            <BarChart3 className="text-cyan-300" />
          </div>
          <h2 className="text-2xl font-black text-cyan-300">{fa ? "خروجی فاکتورها" : "Invoice Exports"}</h2>
        </div>

        <div className="flex flex-wrap gap-4">
          <a href={`${API_URL}/export/invoices-pdf`} target="_blank" rel="noreferrer" className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2">
            <FileText size={18} />
            {fa ? "دانلود PDF" : "Download PDF"}
          </a>

          <a href={`${API_URL}/export/invoices-excel`} target="_blank" rel="noreferrer" className="px-5 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2">
            <FileSpreadsheet size={18} />
            {fa ? "دانلود Excel" : "Download Excel"}
          </a>
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

function ReportCard({ icon, title, value, hint, color }) {
  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5 shadow-xl">
      <div className="flex items-center gap-3 text-cyan-300 mb-3">
        {icon}
        <span className="text-slate-300 font-bold">{title}</span>
      </div>
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-2">{hint}</div>}
    </div>
  );
}

function ChartPanel({ title, children }) {
  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5 shadow-xl">
      <h2 className="text-xl font-black text-cyan-300 mb-4">{title}</h2>
      <div className="bg-slate-950/30 rounded-2xl p-3">{children}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5 shadow-xl">
      <h2 className="text-xl font-black text-cyan-300 mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ title, subtitle, value, color }) {
  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div>
        <div className="font-black text-white">{title}</div>
        <div className="text-xs text-slate-400 mt-1">{subtitle}</div>
      </div>
      <div className={`font-black text-end ${color}`}>{value}</div>
    </div>
  );
}

function ReportLine({ label, value, strong, negative, color }) {
  return (
    <div className={`bg-slate-800/60 rounded-2xl p-4 flex justify-between gap-3 ${strong ? "border border-cyan-400/20" : ""}`}>
      <span className="text-slate-300 font-bold">{label}</span>
      <span className={`font-black ${color || (negative ? "text-red-300" : "text-white")}`}>{value}</span>
    </div>
  );
}

function CustomerRow({ item, money, n, fa, type }) {
  const amount = type === "debtor" ? getDebtor(item) : getCreditor(item);
  return (
    <div className="bg-slate-800/60 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-black text-white">{item.name || "-"}</div>
          <div className="text-xs text-slate-400 mt-1">{item.phone || "-"}</div>
        </div>
        <div className={`font-black ${type === "debtor" ? "text-red-300" : "text-green-300"}`}>{money(amount)}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-slate-300">
        <div className="bg-slate-900/70 rounded-xl p-2">{fa ? "تعداد فاکتور" : "Invoices"}: {n(item.invoice_count || 0)}</div>
        <div className="bg-slate-900/70 rounded-xl p-2">{fa ? "آخرین تراکنش" : "Last"}: {item.last_transaction_date ? String(item.last_transaction_date).slice(0, 10) : "-"}</div>
      </div>
    </div>
  );
}

function ProductProfitRow({ item, money, n, fa }) {
  const profitPositive = toNumber(item.profit) >= 0;
  return (
    <div className="bg-slate-800/60 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-black text-white">{item.name || "-"}</div>
          <div className="text-xs text-slate-400 mt-1">{item.barcode || "-"} • {item.brand || "-"}</div>
        </div>
        <div className={`font-black ${profitPositive ? "text-cyan-300" : "text-red-300"}`}>{money(item.profit)}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs text-slate-300">
        <MiniStat label={fa ? "فروش" : "Sold"} value={n(item.sold_qty || 0)} />
        <MiniStat label={fa ? "مرجوعی" : "Return"} value={n(item.returned_qty || 0)} />
        <MiniStat label={fa ? "درآمد" : "Revenue"} value={money(item.revenue || 0)} />
        <MiniStat label={fa ? "هزینه" : "Cost"} value={money(item.cost || 0)} />
        <MiniStat label={fa ? "حاشیه" : "Margin"} value={`${n(Number(item.margin_percent || 0).toFixed(1))}%`} />
      </div>
    </div>
  );
}

function InventoryRow({ item, money, n, fa }) {
  const status = item.stock_status || "normal";
  const statusLabel = status === "critical" ? (fa ? "بحرانی" : "Critical") : status === "warning" ? (fa ? "هشدار" : "Warning") : (fa ? "نرمال" : "Normal");
  const statusClass = status === "critical" ? "text-red-300 bg-red-500/10" : status === "warning" ? "text-amber-300 bg-amber-500/10" : "text-green-300 bg-green-500/10";

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-black text-white">{item.name || "-"}</div>
          <div className="text-xs text-slate-400 mt-1">{item.barcode || item.code || "-"}</div>
        </div>
        <div className={`px-3 py-1 rounded-xl font-black ${statusClass}`}>{statusLabel}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs text-slate-300">
        <MiniStat label={fa ? "موجودی" : "Stock"} value={n(item.stock || 0)} />
        <MiniStat label={fa ? "حداقل" : "Min"} value={n(item.min_stock || 0)} />
        <MiniStat label={fa ? "ارزش فروش" : "Sale value"} value={money(item.value || 0)} />
        <MiniStat label={fa ? "ارزش خرید" : "Buy value"} value={money(item.buy_value || 0)} />
        <MiniStat label={fa ? "واحد" : "Unit"} value={item.unit || "-"} />
      </div>
    </div>
  );
}

function TransactionRow({ item, money, date, fa }) {
  const debit = toNumber(item.debit);
  const credit = toNumber(item.credit);
  const isDebit = debit > 0;
  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDebit ? "bg-red-500/10 text-red-300" : "bg-green-500/10 text-green-300"}`}>
          {isDebit ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
        </div>
        <div>
          <div className="font-black text-white">{item.description || item.source_type || "-"}</div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1"><CalendarClock size={13} />{date(item.created_at)} • {item.source_type || "-"}</div>
        </div>
      </div>
      <div className={`font-black ${isDebit ? "text-red-300" : "text-green-300"}`}>{money(isDebit ? debit : credit)}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-900/70 rounded-xl p-2">
      <div className="text-slate-500">{label}</div>
      <div className="font-black text-slate-100 mt-1">{value}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, money }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-950 border border-cyan-500/30 rounded-2xl p-3 text-sm shadow-2xl">
      <div className="text-cyan-300 font-black mb-2">{label}</div>
      {payload.map((item, index) => (
        <div key={index} className="text-slate-200 flex items-center justify-between gap-4">
          <span>{item.name}</span>
          <b>{typeof item.value === "number" ? money(item.value) : item.value}</b>
        </div>
      ))}
    </div>
  );
}

function Empty({ fa }) {
  return <div className="text-slate-400">{fa ? "داده‌ای وجود ندارد." : "No data."}</div>;
}
