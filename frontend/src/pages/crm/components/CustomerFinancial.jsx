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
import { formatCalendarDate } from "../../../utils/date";
import { toPersianDigits } from "../../../localization/helpers";

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function invoiceTypeLabel(type, language) {
  const key = String(type || "").toLowerCase();
  const maps = {
    fa: { sale: "فروش", buy: "خرید", proforma: "پیش‌فاکتور", return_sale: "مرجوعی فروش", return_buy: "مرجوعی خرید" },
    ar: { sale: "بيع", buy: "شراء", proforma: "فاتورة أولية", return_sale: "مرتجع بيع", return_buy: "مرتجع شراء" },
    tr: { sale: "Satış", buy: "Alış", proforma: "Proforma", return_sale: "Satış iadesi", return_buy: "Alış iadesi" },
    en: { sale: "Sale", buy: "Buy", proforma: "Proforma", return_sale: "Sale return", return_buy: "Buy return" },
  };
  return (maps[language] || maps.en)[key] || type || "-";
}

function statusLabel(status, language) {
  const key = String(status || "").toLowerCase();
  const maps = {
    fa: { paid: "تسویه شده", unpaid: "تسویه نشده", partial: "تسویه ناقص", draft: "پیش‌نویس", final: "نهایی" },
    ar: { paid: "مدفوع", unpaid: "غير مدفوع", partial: "مدفوع جزئياً", draft: "مسودة", final: "نهائي" },
    tr: { paid: "Ödendi", unpaid: "Ödenmedi", partial: "Kısmi ödendi", draft: "Taslak", final: "Nihai" },
    en: { paid: "Paid", unpaid: "Unpaid", partial: "Partial", draft: "Draft", final: "Final" },
  };
  return (maps[language] || maps.en)[key] || status || "-";
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
  language,
  money = (v) => String(v ?? 0),
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
}) {
  const lang = language || (fa ? "fa" : "en");
  const tr = (faText, arText, trText, enText) =>
    lang === "fa" ? faText : lang === "ar" ? arText : lang === "tr" ? trText : enText;

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
    <section className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5 text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2">
            <Wallet />
            {tr("پرونده مالی مشتری", "الملف المالي للعميل", "Müşteri finansal profili", "Customer Financial Profile")}
          </h2>
          <p className="text-[var(--erp-muted)] text-sm mt-2">
            {tr(
              "خلاصه مالی، فاکتورها، مانده حساب، بدهی/بستانکاری و نمودار خرید مشتری",
              "ملخص مالي والفواتير والرصيد والمدين/الدائن ومخطط مشتريات العميل",
              "Finansal özet, faturalar, bakiye, borç/alacak ve müşteri satın alma grafiği",
              "Financial summary, invoices, balance, debit/credit and customer purchase chart"
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <FinancialCard icon={<Wallet />} title={tr("مانده حساب", "الرصيد", "Bakiye", "Balance")} value={money(Math.abs(financial.balance))} hint={financial.balance > 0 ? tr("بدهکار", "مدين", "Borçlu", "Debtor") : financial.balance < 0 ? tr("بستانکار", "دائن", "Alacaklı", "Creditor") : tr("تسویه", "مُسوّى", "Kapandı", "Settled")} tone={financial.balance > 0 ? "rose" : financial.balance < 0 ? "emerald" : "cyan"} />
        <FinancialCard icon={<ArrowUpRight />} title={tr("جمع فروش", "إجمالي المبيعات", "Toplam satış", "Total sales")} value={money(financial.sales)} hint={tr("ارزش خرید مشتری", "قيمة مشتريات العميل", "Müşteri satın alma değeri", "Customer purchase value")} tone="cyan" />
        <FinancialCard icon={<FileText />} title={tr("تعداد فاکتور", "عدد الفواتير", "Fatura sayısı", "Invoices")} value={n(financial.invoiceCount)} hint={`${tr("باز", "مفتوح", "Açık", "Open")}: ${n(financial.openCount)}`} tone="amber" />
        <FinancialCard icon={<CreditCard />} title={tr("فاکتورهای باز", "المبلغ المفتوح", "Açık tutar", "Open amount")} value={money(financial.openAmount)} hint={tr("نیازمند پیگیری", "يتطلب متابعة", "Takip gerektirir", "Needs follow-up")} tone="rose" />
        <FinancialCard icon={<ArrowDownRight />} title={tr("جمع بدهکار", "إجمالي المدين", "Toplam borç", "Total debit")} value={money(financial.debit)} tone="rose" />
        <FinancialCard icon={<ArrowUpRight />} title={tr("جمع بستانکار", "إجمالي الدائن", "Toplam alacak", "Total credit")} value={money(financial.credit)} tone="emerald" />
        <FinancialCard icon={<BarChart3 />} title={tr("میانگین فاکتور", "متوسط الفاتورة", "Ortalama fatura", "Avg invoice")} value={money(financial.avgInvoice)} tone="cyan" />
        <FinancialCard icon={<FileText />} title={tr("فاکتورهای تسویه", "الفواتير المدفوعة", "Ödenen faturalar", "Paid invoices")} value={n(financial.paidCount)} tone="emerald" />
      </div>

      <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5 mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="font-black text-[var(--erp-accent)] flex items-center gap-2">
            <BarChart3 size={20} />
            {tr("نمودار آخرین فاکتورها", "مخطط آخر الفواتير", "Son faturalar grafiği", "Recent invoices chart")}
          </h3>
          <span className="text-[var(--erp-muted)] text-sm">{tr("۸ فاکتور آخر", "آخر 8 فواتير", "Son 8 fatura", "Last 8 invoices")}</span>
        </div>

        <div className="h-52 flex items-end gap-3">
          {chartBars.length ? (
            chartBars.map((bar) => (
              <div key={bar.id} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-2xl bg-[var(--erp-accent)]/70 hover:bg-[var(--erp-accent-2)] transition" style={{ height: `${bar.height}%` }} title={money(bar.value)} />
                <div className="text-[10px] text-[var(--erp-muted)]">{bar.label}</div>
              </div>
            ))
          ) : (
            <div className="w-full text-center text-[var(--erp-muted)]">{tr("داده‌ای برای نمودار وجود ندارد.", "لا توجد بيانات للمخطط.", "Grafik verisi yok.", "No chart data.")}</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="font-black text-[var(--erp-accent)] flex items-center gap-2">
            <FileText size={20} />
            {tr("فاکتورهای مشتری", "فواتير العميل", "Müşteri faturaları", "Customer invoices")}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-[240px_180px] gap-3">
            <div className="relative">
              <Search size={17} className="absolute top-3.5 right-4 text-[var(--erp-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(lang === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
                placeholder={tr("جستجوی فاکتور...", "بحث في الفواتير...", "Fatura ara...", "Search invoices...")}
                className="w-full bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl pr-10 pl-4 py-3 outline-none border border-[var(--erp-border)]"
              />
            </div>

            <select
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value)}
              className="w-full bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl px-4 py-3 outline-none border border-[var(--erp-border)]"
            >
              <option value="all">{tr("همه", "الكل", "Tümü", "All")}</option>
              <option value="sale">{tr("فروش", "بيع", "Satış", "Sale")}</option>
              <option value="buy">{tr("خرید", "شراء", "Alış", "Buy")}</option>
              <option value="proforma">{tr("پیش‌فاکتور", "فاتورة أولية", "Proforma", "Proforma")}</option>
              <option value="paid">{tr("تسویه شده", "مدفوع", "Ödendi", "Paid")}</option>
              <option value="unpaid">{tr("تسویه نشده", "غير مدفوع", "Ödenmedi", "Unpaid")}</option>
              <option value="partial">{tr("ناقص", "جزئي", "Kısmi", "Partial")}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="text-[var(--erp-accent)] border-b border-[var(--erp-border)]">
                <th className="p-3 text-right">{tr("شماره", "الرقم", "No", "ID")}</th>
                <th className="p-3 text-right">{tr("تاریخ", "التاريخ", "Tarih", "Date")}</th>
                <th className="p-3 text-right">{tr("نوع", "النوع", "Tür", "Type")}</th>
                <th className="p-3 text-right">{tr("مبلغ", "المبلغ", "Tutar", "Amount")}</th>
                <th className="p-3 text-right">{tr("باقی‌مانده", "المتبقي", "Kalan", "Remaining")}</th>
                <th className="p-3 text-right">{tr("وضعیت", "الحالة", "Durum", "Status")}</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--erp-border)] hover:bg-[var(--erp-glow)]">
                  <td className="p-3 font-black text-[var(--erp-text)]">#{n(inv.id)}</td>
                  <td className="p-3 text-[var(--erp-muted)]">{formatCalendarDate(inv.created_at, lang)}</td>
                  <td className="p-3 text-[var(--erp-muted)]">{invoiceTypeLabel(inv.invoice_type, lang)}</td>
                  <td className="p-3 text-[var(--erp-accent)] font-black">{money(inv.total_amount)}</td>
                  <td className="p-3 text-amber-300 font-black">{money(inv.remaining_amount || 0)}</td>
                  <td className="p-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${
                      inv.payment_status === "paid"
                        ? "bg-emerald-400/10 text-emerald-300"
                        : inv.payment_status === "partial"
                        ? "bg-amber-400/10 text-amber-300"
                        : "bg-rose-400/10 text-rose-300"
                    }`}>
                      {statusLabel(inv.payment_status, lang)}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--erp-muted)]">
                    {tr("فاکتوری برای نمایش وجود ندارد.", "لا توجد فواتير لعرضها.", "Gösterilecek fatura yok.", "No invoices to show.")}
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
    cyan: "text-[var(--erp-accent)] bg-[var(--erp-glow)] border-[var(--erp-border)]",
    emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
    rose: "text-rose-300 bg-rose-400/10 border-rose-400/20",
    amber: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  }[tone] || "text-[var(--erp-accent)] bg-[var(--erp-glow)] border-[var(--erp-border)]";

  return (
    <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div>
          <div className="text-2xl font-black text-[var(--erp-text)] mt-2">{value}</div>
          {hint && <div className="text-xs text-[var(--erp-muted)] mt-2">{hint}</div>}
        </div>
        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${toneClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
