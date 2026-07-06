import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CreditCard,
  FileText,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function formatDate(value, fa) {
  if (!value) return "-";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return String(value);
  }
}

function invoiceTypeLabel(type, fa) {
  const key = String(type || "").toLowerCase();
  const faMap = {
    sale: "فروش",
    buy: "خرید",
    proforma: "پیش‌فاکتور",
    return_sale: "مرجوعی فروش",
    return_buy: "مرجوعی خرید",
  };
  const enMap = {
    sale: "Sale",
    buy: "Buy",
    proforma: "Proforma",
    return_sale: "Sale return",
    return_buy: "Buy return",
  };
  return (fa ? faMap : enMap)[key] || type || "-";
}

function statusLabel(status, fa) {
  const key = String(status || "").toLowerCase();
  const faMap = {
    paid: "تسویه شده",
    unpaid: "تسویه نشده",
    partial: "تسویه ناقص",
    draft: "پیش‌نویس",
    final: "نهایی",
  };
  const enMap = {
    paid: "Paid",
    unpaid: "Unpaid",
    partial: "Partial",
    draft: "Draft",
    final: "Final",
  };
  return (fa ? faMap : enMap)[key] || status || "-";
}

function normalizeInvoices(invoices) {
  return (Array.isArray(invoices) ? invoices : []).map((inv) => ({
    id: inv.id,
    invoice_type: inv.invoice_type || inv.type || "sale",
    total_amount: toNumber(inv.total_amount ?? inv.total ?? 0),
    subtotal: toNumber(inv.subtotal ?? 0),
    discount_amount: toNumber(inv.discount_amount ?? inv.discount ?? 0),
    tax_amount: toNumber(inv.tax_amount ?? inv.tax ?? 0),
    shipping_cost: toNumber(inv.shipping_cost ?? 0),
    remaining_amount: toNumber(inv.remaining_amount ?? 0),
    payment_status: inv.payment_status || inv.status || "unpaid",
    created_at: inv.created_at || inv.date || "",
    invoice_note: inv.invoice_note || inv.note || "",
  }));
}

function normalizeLedger(ledger) {
  return (Array.isArray(ledger) ? ledger : []).map((row, index) => ({
    id: row.id || `${row.source_type || "row"}-${index}`,
    description: row.description || row.title || row.source_type || "-",
    source_type: row.source_type || row.type || "accounting",
    debit: toNumber(row.debit),
    credit: toNumber(row.credit),
    amount: toNumber(row.amount || row.total_amount || row.debit || row.credit),
    balance: toNumber(row.balance ?? row.balance_after ?? 0),
    created_at: row.created_at || row.date || "",
  }));
}

export default function CustomerFinancial({
  customer,
  summary = {},
  invoices = [],
  ledger = [],
  fa = true,
  money = (v) => String(v ?? 0),
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
}) {
  const [query, setQuery] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all");

  const invoiceRows = useMemo(() => normalizeInvoices(invoices), [invoices]);
  const ledgerRows = useMemo(() => normalizeLedger(ledger), [ledger]);

  const financial = useMemo(() => {
    const totalInvoices = invoiceRows.reduce((s, x) => s + toNumber(x.total_amount), 0);
    const sales = invoiceRows
      .filter((x) => x.invoice_type === "sale")
      .reduce((s, x) => s + toNumber(x.total_amount), 0);
    const purchases = invoiceRows
      .filter((x) => x.invoice_type === "buy")
      .reduce((s, x) => s + toNumber(x.total_amount), 0);
    const openAmount = invoiceRows
      .filter((x) => x.payment_status !== "paid")
      .reduce((s, x) => s + toNumber(x.remaining_amount || x.total_amount), 0);

    const debit = ledgerRows.reduce((s, x) => s + toNumber(x.debit), 0);
    const credit = ledgerRows.reduce((s, x) => s + toNumber(x.credit), 0);
    const balance = summary.balance ?? customer?.balance ?? debit - credit;

    return {
      totalInvoices,
      sales,
      purchases,
      openAmount,
      invoiceCount: invoiceRows.length,
      paidCount: invoiceRows.filter((x) => x.payment_status === "paid").length,
      openCount: invoiceRows.filter((x) => x.payment_status !== "paid").length,
      debit,
      credit,
      balance: toNumber(balance),
      avgInvoice: invoiceRows.length ? totalInvoices / invoiceRows.length : 0,
    };
  }, [invoiceRows, ledgerRows, summary, customer]);

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoiceRows.filter((inv) => {
      const matchQuery =
        !q ||
        String(inv.id).includes(q) ||
        String(inv.invoice_type).toLowerCase().includes(q) ||
        String(inv.payment_status).toLowerCase().includes(q) ||
        String(inv.invoice_note).toLowerCase().includes(q);

      const matchFilter =
        invoiceFilter === "all" ||
        inv.invoice_type === invoiceFilter ||
        inv.payment_status === invoiceFilter;

      return matchQuery && matchFilter;
    });
  }, [invoiceRows, query, invoiceFilter]);

  const chartBars = useMemo(() => {
    const last = invoiceRows
      .slice()
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
      .slice(-8);

    const max = Math.max(...last.map((x) => toNumber(x.total_amount)), 1);

    return last.map((x) => ({
      id: x.id,
      label: `#${x.id}`,
      value: toNumber(x.total_amount),
      height: Math.max(8, (toNumber(x.total_amount) / max) * 100),
    }));
  }, [invoiceRows]);

  return (
    <section className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-cyan-300 flex items-center gap-2">
            <Wallet />
            {fa ? "پرونده مالی مشتری" : "Customer Financial Profile"}
          </h2>
          <p className="text-slate-400 text-sm mt-2">
            {fa
              ? "خلاصه مالی، فاکتورها، مانده حساب، بدهی/بستانکاری و نمودار خرید مشتری"
              : "Financial summary, invoices, balance, debit/credit and customer purchase chart"}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <FinancialCard icon={<Wallet />} title={fa ? "مانده حساب" : "Balance"} value={money(Math.abs(financial.balance))} hint={financial.balance > 0 ? (fa ? "بدهکار" : "Debtor") : financial.balance < 0 ? (fa ? "بستانکار" : "Creditor") : (fa ? "تسویه" : "Settled")} tone={financial.balance > 0 ? "rose" : financial.balance < 0 ? "emerald" : "cyan"} />
        <FinancialCard icon={<ArrowUpRight />} title={fa ? "جمع فروش" : "Total sales"} value={money(financial.sales)} hint={fa ? "ارزش خرید مشتری" : "Customer purchase value"} tone="cyan" />
        <FinancialCard icon={<FileText />} title={fa ? "تعداد فاکتور" : "Invoices"} value={n(financial.invoiceCount)} hint={`${fa ? "باز" : "Open"}: ${n(financial.openCount)}`} tone="amber" />
        <FinancialCard icon={<CreditCard />} title={fa ? "فاکتورهای باز" : "Open amount"} value={money(financial.openAmount)} hint={fa ? "نیازمند پیگیری" : "Needs follow-up"} tone="rose" />
        <FinancialCard icon={<ArrowDownRight />} title={fa ? "جمع بدهکار" : "Total debit"} value={money(financial.debit)} tone="rose" />
        <FinancialCard icon={<ArrowUpRight />} title={fa ? "جمع بستانکار" : "Total credit"} value={money(financial.credit)} tone="emerald" />
        <FinancialCard icon={<BarChart3 />} title={fa ? "میانگین فاکتور" : "Avg invoice"} value={money(financial.avgInvoice)} tone="cyan" />
        <FinancialCard icon={<FileText />} title={fa ? "فاکتورهای تسویه" : "Paid invoices"} value={n(financial.paidCount)} tone="emerald" />
      </div>

      <div className="rounded-3xl bg-slate-800/60 border border-white/5 p-5 mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="font-black text-cyan-300 flex items-center gap-2">
            <BarChart3 size={20} />
            {fa ? "نمودار آخرین فاکتورها" : "Recent invoices chart"}
          </h3>
          <span className="text-slate-400 text-sm">{fa ? "۸ فاکتور آخر" : "Last 8 invoices"}</span>
        </div>

        <div className="h-52 flex items-end gap-3">
          {chartBars.length ? (
            chartBars.map((bar) => (
              <div key={bar.id} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-2xl bg-cyan-400/70 hover:bg-cyan-300 transition" style={{ height: `${bar.height}%` }} title={money(bar.value)} />
                <div className="text-[10px] text-slate-400">{bar.label}</div>
              </div>
            ))
          ) : (
            <div className="w-full text-center text-slate-400">{fa ? "داده‌ای برای نمودار وجود ندارد." : "No chart data."}</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-slate-800/60 border border-white/5 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="font-black text-cyan-300 flex items-center gap-2">
            <FileText size={20} />
            {fa ? "فاکتورهای مشتری" : "Customer invoices"}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-[240px_180px] gap-3">
            <div className="relative">
              <Search size={17} className="absolute top-3.5 right-4 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={fa ? "جستجوی فاکتور..." : "Search invoices..."}
                className="w-full bg-slate-900 text-white rounded-2xl pr-10 pl-4 py-3 outline-none border border-cyan-400/10"
              />
            </div>

            <select
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value)}
              className="w-full bg-slate-900 text-white rounded-2xl px-4 py-3 outline-none border border-cyan-400/10"
            >
              <option value="all">{fa ? "همه" : "All"}</option>
              <option value="sale">{fa ? "فروش" : "Sale"}</option>
              <option value="buy">{fa ? "خرید" : "Buy"}</option>
              <option value="proforma">{fa ? "پیش‌فاکتور" : "Proforma"}</option>
              <option value="paid">{fa ? "تسویه شده" : "Paid"}</option>
              <option value="unpaid">{fa ? "تسویه نشده" : "Unpaid"}</option>
              <option value="partial">{fa ? "ناقص" : "Partial"}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="text-cyan-300 border-b border-cyan-500/20">
                <th className="p-3 text-right">{fa ? "شماره" : "ID"}</th>
                <th className="p-3 text-right">{fa ? "تاریخ" : "Date"}</th>
                <th className="p-3 text-right">{fa ? "نوع" : "Type"}</th>
                <th className="p-3 text-right">{fa ? "مبلغ" : "Amount"}</th>
                <th className="p-3 text-right">{fa ? "باقی‌مانده" : "Remaining"}</th>
                <th className="p-3 text-right">{fa ? "وضعیت" : "Status"}</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-700/60 hover:bg-cyan-400/5">
                  <td className="p-3 font-black text-white">#{n(inv.id)}</td>
                  <td className="p-3 text-slate-300">{formatDate(inv.created_at, fa)}</td>
                  <td className="p-3 text-slate-300">{invoiceTypeLabel(inv.invoice_type, fa)}</td>
                  <td className="p-3 text-cyan-300 font-black">{money(inv.total_amount)}</td>
                  <td className="p-3 text-amber-300 font-black">{money(inv.remaining_amount || 0)}</td>
                  <td className="p-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${
                      inv.payment_status === "paid"
                        ? "bg-emerald-400/10 text-emerald-300"
                        : inv.payment_status === "partial"
                        ? "bg-amber-400/10 text-amber-300"
                        : "bg-rose-400/10 text-rose-300"
                    }`}>
                      {statusLabel(inv.payment_status, fa)}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    {fa ? "فاکتوری برای نمایش وجود ندارد." : "No invoices to show."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FinancialCard({ icon, title, value, hint, tone = "cyan" }) {
  const toneClass = {
    cyan: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20",
    emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
    rose: "text-rose-300 bg-rose-400/10 border-rose-400/20",
    amber: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  }[tone] || "text-cyan-300 bg-cyan-400/10 border-cyan-400/20";

  return (
    <div className="rounded-3xl bg-slate-800/70 border border-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-slate-400 text-sm font-bold">{title}</div>
          <div className="text-2xl font-black text-white mt-2">{value}</div>
          {hint && <div className="text-xs text-slate-500 mt-2">{hint}</div>}
        </div>
        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${toneClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
