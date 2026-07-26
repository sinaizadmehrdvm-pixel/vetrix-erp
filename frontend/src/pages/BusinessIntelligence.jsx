import { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CalendarClock,
  Crown,
  DollarSign,
  Download,
  Lightbulb,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { API_URL, getAuthHeaders, getReportsOverview } from "../services/api";


function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function fallbackMonths() {
  return Array.from({ length: 8 }, (_, i) => ({ label: `M${i + 1}`, sales: 0, purchases: 0, profit: 0 }));
}

function normalizeMonthly(data) {
  const rows = data?.monthly_sales || data?.sales_chart || data?.chart || data?.profit_loss?.monthly || fallbackMonths();
  return (Array.isArray(rows) ? rows : fallbackMonths()).map((row, index) => {
    const sales = toNumber(row.sales ?? row.revenue ?? row.total_sales ?? row.amount);
    const purchases = toNumber(row.purchases ?? row.total_purchases ?? row.cost ?? 0);
    const profit = toNumber(row.profit ?? row.net_profit ?? sales - purchases);
    return { label: row.label || row.month_name || row.date || `M${index + 1}`, sales, purchases, profit };
  });
}

function movingAverageForecast(rows) {
  const last = rows.slice(-3);
  if (!last.length) return 0;
  return last.reduce((s, x) => s + toNumber(x.sales), 0) / last.length;
}

function trendPercent(rows) {
  if (rows.length < 2) return 0;
  const prev = toNumber(rows[rows.length - 2].sales);
  const current = toNumber(rows[rows.length - 1].sales);
  if (!prev) return current ? 100 : 0;
  return ((current - prev) / prev) * 100;
}

function buildInsights({ reports, dashboard, monthly, language, money, n }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const profit = reports?.profit_loss || {};
  const inventory = reports?.inventory || {};
  const invoiceSummary = reports?.invoice_summary || {};
  const trend = trendPercent(monthly);
  const forecast = movingAverageForecast(monthly);
  const netProfit = toNumber(profit.net_profit ?? dashboard?.net_profit ?? 0);
  const salesMonth = toNumber(reports?.today_month?.sales_month ?? dashboard?.total_revenue ?? 0);
  const lowStock = toNumber(inventory.low_stock_count ?? dashboard?.low_stock ?? 0);
  const openInvoices = toNumber(invoiceSummary.open_count ?? dashboard?.open_invoices ?? 0);
  const list = [];

  if (trend > 15) {
    list.push({ tone: "emerald", icon: <TrendingUp />, title: tr("رشد فروش قابل توجه", "نمو ملحوظ في المبيعات", "Belirgin satış büyümesi", "Strong sales growth"), text: tr(`فروش نسبت به دوره قبل حدود ${n(Math.round(trend))}% رشد داشته است.`, `نمت المبيعات بنحو ${n(Math.round(trend))}% مقارنة بالفترة السابقة.`, `Satışlar önceki döneme göre yaklaşık %${n(Math.round(trend))} arttı.`, `Sales grew about ${Math.round(trend)}% vs previous period.`) });
  } else if (trend < -15) {
    list.push({ tone: "rose", icon: <TrendingDown />, title: tr("افت فروش", "انخفاض المبيعات", "Satış düşüşü", "Sales drop"), text: tr(`فروش نسبت به دوره قبل حدود ${n(Math.abs(Math.round(trend)))}% کاهش داشته است. کمپین فروش پیشنهاد می‌شود.`, `انخفضت المبيعات بنحو ${n(Math.abs(Math.round(trend)))}% مقارنة بالفترة السابقة. يُنصح بإطلاق حملة ترويجية.`, `Satışlar önceki döneme göre yaklaşık %${n(Math.abs(Math.round(trend)))} azaldı. Bir kampanya başlatılması önerilir.`, `Sales dropped about ${Math.abs(Math.round(trend))}%. A campaign is recommended.`) });
  }

  if (netProfit < 0) {
    list.push({ tone: "rose", icon: <AlertTriangle />, title: tr("هشدار سود منفی", "تحذير: الربح سلبي", "Negatif kâr uyarısı", "Negative profit warning"), text: tr("سود خالص منفی است. هزینه‌ها، قیمت فروش و تخفیف‌ها باید بررسی شوند.", "صافي الربح سلبي. يجب مراجعة التكاليف والأسعار والخصومات.", "Net kâr negatif. Maliyetler, fiyatlandırma ve indirimler gözden geçirilmeli.", "Net profit is negative. Review costs, pricing and discounts.") });
  } else if (netProfit > 0) {
    list.push({ tone: "emerald", icon: <DollarSign />, title: tr("وضعیت سود مثبت", "ربح إيجابي", "Pozitif kâr", "Positive profit"), text: tr(`سود خالص فعلی ${money(netProfit)} است.`, `صافي الربح الحالي هو ${money(netProfit)}.`, `Mevcut net kâr ${money(netProfit)}.`, `Current net profit is ${money(netProfit)}.`) });
  }

  if (lowStock > 0) {
    list.push({ tone: "amber", icon: <Package />, title: tr("نیاز به تامین موجودی", "الحاجة إلى تجديد المخزون", "Stok yenileme ihtiyacı", "Inventory replenishment"), text: tr(`${n(lowStock)} کالا کم‌موجود است. پیشنهاد خرید و تامین فعال شود.`, `يوجد ${n(lowStock)} صنف منخفض المخزون. يُنصح بتفعيل تخطيط الشراء.`, `${n(lowStock)} üründe stok azaldı. Satın alma planlaması önerilir.`, `${lowStock} item(s) are low-stock. Purchase planning is recommended.`) });
  }

  if (openInvoices > 0) {
    list.push({ tone: "cyan", icon: <Wallet />, title: tr("پیگیری فاکتورهای باز", "متابعة الفواتير المفتوحة", "Açık faturaların takibi", "Open invoices follow-up"), text: tr(`${n(openInvoices)} فاکتور باز وجود دارد. پیگیری وصول مطالبات پیشنهاد می‌شود.`, `يوجد ${n(openInvoices)} فاتورة مفتوحة. يُنصح بمتابعة تحصيل الذمم المدينة.`, `${n(openInvoices)} açık fatura var. Alacak takibi önerilir.`, `${openInvoices} open invoice(s). Receivable follow-up is recommended.`) });
  }

  if (forecast > salesMonth && salesMonth > 0) {
    list.push({ tone: "emerald", icon: <Brain />, title: tr("پیش‌بینی رشد فروش", "توقّع نمو المبيعات", "Satış büyüme tahmini", "Sales forecast growth"), text: tr(`بر اساس میانگین اخیر، فروش دوره بعد می‌تواند حدود ${money(forecast)} باشد.`, `استناداً إلى المتوسط الأخير، قد تبلغ مبيعات الفترة القادمة نحو ${money(forecast)}.`, `Son ortalamaya göre, gelecek dönem satışları yaklaşık ${money(forecast)} olabilir.`, `Based on recent average, next period sales may be around ${money(forecast)}.`) });
  }

  if (!list.length) {
    list.push({ tone: "cyan", icon: <Sparkles />, title: tr("وضعیت پایدار", "وضع مستقر", "Kararlı iş durumu", "Stable business status"), text: tr("اطلاعات فعلی نشانه بحران جدی ندارد. ادامه پایش روزانه پیشنهاد می‌شود.", "لا تشير البيانات الحالية إلى أي مشكلة جوهرية. يُنصح بمواصلة المتابعة اليومية.", "Mevcut veriler ciddi bir sorun göstermiyor. Günlük takibe devam edilmesi önerilir.", "Current data shows no major issue. Continue daily monitoring.") });
  }
  return list;
}

export default function BusinessIntelligence() {
  const { language, dir, money, n } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const [reports, setReports] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [crm, setCrm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadBI() {
    try {
      setLoading(true);
      setMessage("");
      const [reportsData, dashboardRes, crmRes] = await Promise.all([
        getReportsOverview().catch(() => null),
        fetch(`${API_URL}/dashboard-stats`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${API_URL}/api/crm/dashboard`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setReports(reportsData || {});
      setDashboard(dashboardRes || {});
      setCrm(crmRes || {});
    } catch (error) {
      console.error("BI loading error:", error);
      setMessage(tr("خطا در دریافت اطلاعات هوش تجاری", "خطأ في جلب بيانات الذكاء التجاري", "İş zekâsı verileri yüklenirken hata oluştu", "Business intelligence loading error"));
    } finally {
      setLoading(false);
    }
  }

  const stableLoadBI = useStableCallback(loadBI);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoadBI(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoadBI]);

  const monthly = useMemo(() => normalizeMonthly(reports), [reports]);
  const maxSales = Math.max(...monthly.map((x) => toNumber(x.sales)), 1);
  const maxProfit = Math.max(...monthly.map((x) => Math.abs(toNumber(x.profit))), 1);

  const metrics = useMemo(() => {
    const profit = reports?.profit_loss || {};
    const cash = reports?.cashflow || {};
    const inventory = reports?.inventory || {};
    const invoices = reports?.invoice_summary || {};
    const todayMonth = reports?.today_month || {};
    const salesMonth = toNumber(todayMonth.sales_month ?? dashboard?.total_revenue ?? 0);
    const purchasesMonth = toNumber(todayMonth.purchases_month ?? dashboard?.total_purchases ?? 0);
    const netProfit = toNumber(profit.net_profit ?? dashboard?.net_profit ?? salesMonth - purchasesMonth);
    const profitMargin = salesMonth ? (netProfit / salesMonth) * 100 : 0;
    return {
      salesToday: toNumber(todayMonth.sales_today ?? 0),
      salesMonth,
      purchasesMonth,
      netProfit,
      profitMargin,
      forecast: movingAverageForecast(monthly),
      trend: trendPercent(monthly),
      cashBalance: toNumber(cash.balance ?? cash.cash_balance ?? 0),
      receiptToday: toNumber(todayMonth.receipt_today ?? cash.receipt_today ?? 0),
      paymentToday: toNumber(todayMonth.payment_today ?? cash.payment_today ?? 0),
      openInvoices: toNumber(invoices.open_count ?? 0),
      openAmount: toNumber(invoices.open_amount ?? 0),
      inventoryValue: toNumber(inventory.inventory_value ?? 0),
      lowStock: toNumber(inventory.low_stock_count ?? 0),
      customersCount: toNumber(crm?.customers_count ?? dashboard?.customers_count ?? 0),
      vipCount: toNumber(crm?.vip_count ?? 0),
      riskCount: toNumber(crm?.risk_count ?? 0),
      receivablesTotal: toNumber(crm?.receivables_total ?? 0),
      scoreAvg: toNumber(crm?.customer_score_avg ?? 0),
    };
  }, [reports, dashboard, crm, monthly]);

  const insights = useMemo(() => buildInsights({ reports, dashboard, monthly, language, money, n }), [reports, dashboard, monthly, language, money, n]);

  const purchaseSuggestions = useMemo(() => {
    const inventory = reports?.inventory || {};
    const rows = Array.isArray(inventory.low_stock_items) ? inventory.low_stock_items : Array.isArray(dashboard?.alerts) ? dashboard.alerts : [];
    return rows.slice(0, 8).map((item, index) => ({
      id: item.id || index,
      name: item.name || item.product_name || item.title || item.message || (language === "fa" ? "کالای کم‌موجود" : language === "ar" ? "صنف منخفض المخزون" : language === "tr" ? "Az stoklu ürün" : "Low stock item"),
      stock: toNumber(item.stock ?? item.quantity ?? item.current_stock ?? 0),
      min: toNumber(item.min_stock ?? item.reorder_level ?? item.minimum_stock ?? 0),
      suggested: Math.max(1, toNumber(item.reorder_qty ?? item.suggested_qty ?? item.min_stock ?? 1)),
    }));
  }, [reports, dashboard, language]);

  function exportSnapshot() {
    const lines = [
      tr("گزارش هوش تجاری Vetrix ERP", "تقرير الذكاء التجاري لـ Vetrix ERP", "Vetrix ERP İş Zekâsı Anlık Görüntüsü", "Vetrix ERP BI Snapshot"),
      "--------------------------------",
      `${tr("فروش ماه", "مبيعات الشهر", "Aylık satış", "Sales month")}: ${money(metrics.salesMonth)}`,
      `${tr("سود خالص", "صافي الربح", "Net kâr", "Net profit")}: ${money(metrics.netProfit)}`,
      `${tr("حاشیه سود", "هامش الربح", "Kâr marjı", "Profit margin")}: ${n(Math.round(metrics.profitMargin))}%`,
      `${tr("پیش‌بینی فروش", "توقّع المبيعات", "Satış tahmini", "Sales forecast")}: ${money(metrics.forecast)}`,
      `${tr("کالاهای کم موجود", "المخزون المنخفض", "Düşük stok", "Low stock")}: ${n(metrics.lowStock)}`,
      `${tr("مطالبات", "الذمم المدينة", "Alacaklar", "Receivables")}: ${money(metrics.receivablesTotal)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vetrix-bi-snapshot.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir={dir} className="min-h-screen p-6 text-[var(--erp-text)]" style={{ direction: dir, background: "radial-gradient(circle at top left, var(--erp-glow), transparent 35%), radial-gradient(circle at top right, rgba(168,85,247,0.14), transparent 35%), var(--erp-bg)" }}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)] flex items-center gap-3"><Brain size={40} />{tr("هوش تجاری و مدیریت هوشمند", "الذكاء التجاري والإدارة الذكية", "İş Zekâsı ve Akıllı Yönetim", "Business Intelligence")}</h1>
          <p className="text-[var(--erp-muted)] mt-2">{tr("تحلیل فروش، سود، نقدینگی، مشتریان، موجودی، پیش‌بینی و پیشنهادهای مدیریتی", "تحليل المبيعات والأرباح والتدفق النقدي والعملاء والمخزون والتوقعات والمقترحات الإدارية", "Satış, kâr, nakit akışı, müşteriler, stok, tahmin ve yönetim önerileri analizi", "Sales, profit, cashflow, customers, inventory, forecasting and management suggestions")}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={exportSnapshot} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2"><Download size={18} />{tr("خروجی خلاصه", "تصدير", "Dışa aktar", "Export")}</button>
          <button onClick={loadBI} disabled={loading} className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2 disabled:opacity-60"><RefreshCw size={18} className={loading ? "animate-spin" : ""} />{tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}</button>
        </div>
      </div>

      {message && <div className="rounded-2xl bg-red-500/10 border border-red-400/20 text-red-200 p-4 mb-5">{message}</div>}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-5">
        <KpiCard icon={<DollarSign />} title={tr("فروش امروز", "مبيعات اليوم", "Bugünkü satış", "Sales today")} value={money(metrics.salesToday)} tone="cyan" />
        <KpiCard icon={<TrendingUp />} title={tr("فروش ماه", "مبيعات الشهر", "Aylık satış", "Sales month")} value={money(metrics.salesMonth)} tone="emerald" />
        <KpiCard icon={<Wallet />} title={tr("سود خالص", "صافي الربح", "Net kâr", "Net profit")} value={money(metrics.netProfit)} tone={metrics.netProfit >= 0 ? "emerald" : "rose"} />
        <KpiCard icon={<Target />} title={tr("حاشیه سود", "هامش الربح", "Kâr marjı", "Profit margin")} value={`${n(Math.round(metrics.profitMargin))}%`} tone={metrics.profitMargin >= 20 ? "emerald" : metrics.profitMargin >= 5 ? "amber" : "rose"} />
        <KpiCard icon={<Brain />} title={tr("پیش‌بینی فروش", "توقّع المبيعات", "Satış tahmini", "Sales forecast")} value={money(metrics.forecast)} hint={tr("میانگین سه دوره اخیر", "متوسط متحرك لثلاث فترات", "3 dönemlik hareketli ortalama", "3-period moving average")} tone="cyan" />
        <KpiCard icon={<Package />} title={tr("ارزش موجودی", "قيمة المخزون", "Stok değeri", "Inventory value")} value={money(metrics.inventoryValue)} tone="cyan" />
        <KpiCard icon={<AlertTriangle />} title={tr("کالاهای کم‌موجود", "المخزون المنخفض", "Düşük stok", "Low stock")} value={n(metrics.lowStock)} tone={metrics.lowStock > 0 ? "rose" : "emerald"} />
        <KpiCard icon={<Users />} title={tr("مشتریان پرریسک", "العملاء المعرّضون للخطر", "Riskli müşteriler", "Risk customers")} value={n(metrics.riskCount)} tone={metrics.riskCount > 0 ? "amber" : "emerald"} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.3fr_.7fr] gap-5 mb-5">
        <Panel title={tr("نمودار فروش، خرید و سود", "مخطط المبيعات والمشتريات والأرباح", "Satış, alış ve kâr grafiği", "Sales, purchases and profit chart")} icon={<BarChart3 />}>
          <div className="h-80 flex items-end gap-3 px-2 overflow-x-auto">
            {monthly.map((row, index) => (
              <div key={`${row.label}-${index}`} className="flex-1 flex flex-col items-center gap-2 min-w-[42px]">
                <div className="w-full h-64 flex items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t-xl bg-[var(--erp-accent)]/80" style={{ height: `${clamp((toNumber(row.sales) / maxSales) * 100, 3, 100)}%` }} title={`${row.label} - ${money(row.sales)}`} />
                  <div className="w-1/3 rounded-t-xl bg-amber-400/80" style={{ height: `${clamp((toNumber(row.purchases) / maxSales) * 100, 3, 100)}%` }} title={`${row.label} - ${money(row.purchases)}`} />
                  <div className={`w-1/3 rounded-t-xl ${row.profit >= 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`} style={{ height: `${clamp((Math.abs(toNumber(row.profit)) / maxProfit) * 100, 3, 100)}%` }} title={`${row.label} - ${money(row.profit)}`} />
                </div>
                <div className="text-[11px] text-[var(--erp-muted)] whitespace-nowrap">{row.label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-[var(--erp-muted)]">
            <Legend color="bg-cyan-400" label={tr("فروش", "المبيعات", "Satış", "Sales")} />
            <Legend color="bg-amber-400" label={tr("خرید", "المشتريات", "Alış", "Purchases")} />
            <Legend color="bg-emerald-400" label={tr("سود", "الربح", "Kâr", "Profit")} />
          </div>
        </Panel>

        <Panel title={tr("وضعیت مدیریتی سریع", "ملخص تنفيذي سريع", "Hızlı yönetici özeti", "Executive summary")} icon={<Crown />}>
          <div className="space-y-4">
            <ScoreGauge value={metrics.scoreAvg || 50} title={tr("میانگین امتیاز مشتریان", "متوسط تقييم العملاء", "Ortalama müşteri puanı", "Avg customer score")} n={n} />
            <ExecutiveRow label={tr("دریافت امروز", "المقبوضات اليوم", "Bugünkü tahsilat", "Receipts today")} value={money(metrics.receiptToday)} />
            <ExecutiveRow label={tr("پرداخت امروز", "المدفوعات اليوم", "Bugünkü ödeme", "Payments today")} value={money(metrics.paymentToday)} />
            <ExecutiveRow label={tr("فاکتورهای باز", "الفواتير المفتوحة", "Açık faturalar", "Open invoices")} value={n(metrics.openInvoices)} />
            <ExecutiveRow label={tr("مبلغ فاکتورهای باز", "مبلغ الفواتير المفتوحة", "Açık fatura tutarı", "Open amount")} value={money(metrics.openAmount)} />
            <ExecutiveRow label={tr("مطالبات CRM", "ذمم إدارة علاقات العملاء", "CRM alacakları", "CRM receivables")} value={money(metrics.receivablesTotal)} />
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5 mb-5">
        <Panel title={tr("پیشنهادهای هوشمند مدیریتی", "رؤى إدارية ذكية", "Akıllı yönetim önerileri", "Smart management insights")} icon={<Lightbulb />}>
          <div className="space-y-3">{insights.map((item, index) => <InsightCard key={index} item={item} />)}</div>
        </Panel>
        <Panel title={tr("پیشنهاد خرید و تامین موجودی", "مقترحات الشراء وتجديد المخزون", "Satın alma ve stok yenileme önerileri", "Purchase & replenishment suggestions")} icon={<ShoppingCart />}>
          <div className="space-y-3">
            {purchaseSuggestions.length ? purchaseSuggestions.map((item) => (
              <div key={item.id} className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4 flex items-center justify-between gap-3">
                <div><div className="font-black text-[var(--erp-text)]">{item.name}</div><div className="text-[var(--erp-muted)] text-sm mt-1">{tr("موجودی", "المخزون", "Stok", "Stock")}: {n(item.stock)} / {tr("حداقل", "الحد الأدنى", "Min", "Min")}: {n(item.min)}</div></div>
                <div className="text-[var(--erp-accent)] font-black">{tr("خرید پیشنهادی", "الكمية المقترحة", "Önerilen", "Suggested")}: {n(item.suggested)}</div>
              </div>
            )) : <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-8 text-center text-[var(--erp-muted)]">{tr("فعلاً پیشنهاد خریدی ثبت نشده است.", "لا توجد مقترحات شراء حتى الآن.", "Henüz satın alma önerisi yok.", "No purchase suggestions yet.")}</div>}
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <MiniPanel icon={<Users />} title={tr("مشتریان", "العملاء", "Müşteriler", "Customers")} main={n(metrics.customersCount)} sub={`${tr("VIP", "VIP", "VIP", "VIP")}: ${n(metrics.vipCount)}`} />
        <MiniPanel icon={<CalendarClock />} title={tr("روند فروش", "اتجاه المبيعات", "Satış trendi", "Sales trend")} main={`${n(Math.round(metrics.trend))}%`} sub={metrics.trend >= 0 ? tr("رو به رشد", "في نمو", "Yükseliyor", "Growing") : tr("کاهشی", "في انخفاض", "Düşüyor", "Declining")} />
        <MiniPanel icon={<Package />} title={tr("سلامت موجودی", "سلامة المخزون", "Stok sağlığı", "Inventory health")} main={metrics.lowStock > 0 ? tr("نیازمند بررسی", "بحاجة إلى مراجعة", "İnceleme gerekli", "Needs review") : tr("مناسب", "جيد", "İyi", "Good")} sub={`${tr("کم‌موجود", "المخزون المنخفض", "Düşük stok", "Low stock")}: ${n(metrics.lowStock)}`} />
      </section>
    </div>
  );
}

function KpiCard({ icon, title, value, hint, tone = "cyan" }) {
  const toneClass = { cyan: "text-[var(--erp-accent)] bg-[var(--erp-glow)] border-[var(--erp-border)]", emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", rose: "text-rose-300 bg-rose-400/10 border-rose-400/20", amber: "text-amber-300 bg-amber-400/10 border-amber-400/20" }[tone];
  return <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div><div className="text-2xl font-black text-[var(--erp-text)] mt-2">{value}</div>{hint && <div className="text-xs text-[var(--erp-muted)] mt-2">{hint}</div>}</div><div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${toneClass}`}>{icon}</div></div></div>;
}

function Panel({ title, icon, children }) {
  return <section className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5"><h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-5">{icon}{title}</h2>{children}</section>;
}

function Legend({ color, label }) {
  return <div className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${color}`} />{label}</div>;
}

function InsightCard({ item }) {
  const toneClass = { cyan: "bg-[var(--erp-glow)] text-[var(--erp-accent)] border-[var(--erp-border)]", emerald: "bg-emerald-400/10 text-emerald-200 border-emerald-400/20", rose: "bg-rose-400/10 text-rose-200 border-rose-400/20", amber: "bg-amber-400/10 text-amber-200 border-amber-400/20" }[item.tone] || "bg-[var(--erp-glow)] text-[var(--erp-accent)] border-[var(--erp-border)]";
  return <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4 flex gap-3"><div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${toneClass}`}>{item.icon}</div><div><div className="font-black text-[var(--erp-text)]">{item.title}</div><p className="text-[var(--erp-muted)] text-sm leading-7 mt-1">{item.text}</p></div></div>;
}

function ExecutiveRow({ label, value }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-3"><span className="text-[var(--erp-muted)] text-sm">{label}</span><b className="text-[var(--erp-accent)]">{value}</b></div>;
}

function ScoreGauge({ value, title, n }) {
  const score = clamp(toNumber(value));
  return <div className="text-center rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-5"><div className="text-[var(--erp-muted)] text-sm mb-3">{title}</div><div className="w-36 h-36 mx-auto rounded-full flex items-center justify-center" style={{ background: `conic-gradient(var(--erp-accent) ${score * 3.6}deg, var(--erp-panel-solid) 0deg)` }}><div className="w-28 h-28 rounded-full bg-[var(--erp-bg)] flex flex-col items-center justify-center"><div className="text-4xl font-black text-[var(--erp-accent)]">{n(Math.round(score))}</div><div className="text-xs text-[var(--erp-muted)]">/100</div></div></div></div>;
}

function MiniPanel({ icon, title, main, sub }) {
  return <div className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] border border-[var(--erp-border)] flex items-center justify-center">{icon}</div><div><div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div><div className="text-xl font-black text-[var(--erp-text)] mt-1">{main}</div><div className="text-xs text-[var(--erp-muted)] mt-1">{sub}</div></div></div></div>;
}
