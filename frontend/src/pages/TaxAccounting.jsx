import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Download, Printer, ReceiptText, RefreshCw, Scale, ShoppingCart, TrendingUp } from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { getFiscalPeriods } from "../services/fiscalPeriodsApi";
import { getVatReport } from "../services/taxApi";

export default function TaxAccounting() {
  const { language, dir, money, date, n } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: tr("حسابداری مالیات بر ارزش افزوده", "محاسبة ضريبة القيمة المضافة", "KDV Muhasebesi", "VAT Accounting"),
    subtitle: tr(
      "گزارش مالیات فروش، اعتبار مالیاتی خرید و مانده قابل پرداخت از دفتر کل",
      "تقرير ضريبة المبيعات وائتمان ضريبة المشتريات والرصيد المستحق من دفتر الأستاذ",
      "Satış KDV'si, alış vergi kredisi ve genel muhasebeden net durum",
      "Output VAT, input tax credit, and net position from the posted ledger"
    ),
    allTime: tr("همه دوره‌ها", "جميع الفترات", "Tüm dönemler", "All periods"),
    output: tr("مالیات فروش", "ضريبة المبيعات", "Satış KDV'si", "Output VAT"),
    input: tr("اعتبار مالیاتی خرید", "ائتمان ضريبة المشتريات", "Alış vergi kredisi", "Input VAT"),
    net: tr("مانده خالص", "الرصيد الصافي", "Net bakiye", "Net VAT"),
    payable: tr("قابل پرداخت", "مستحق الدفع", "Ödenecek", "Payable"),
    credit: tr("اعتبار مالیاتی", "ائتمان ضريبي", "Vergi kredisi", "Tax credit"),
    settled: tr("تسویه‌شده", "مسوّى", "Ödendi", "Settled"),
    invoices: tr("تعداد فاکتور", "عدد الفواتير", "Fatura sayısı", "Invoices"),
    refresh: tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh"),
    export: tr("خروجی CSV", "تصدير CSV", "CSV dışa aktar", "CSV export"),
    print: tr("چاپ", "طباعة", "Yazdır", "Print"),
    voucher: tr("شماره سند", "رقم المستند", "Belge no", "Voucher"),
    invoice: tr("فاکتور", "الفاتورة", "Fatura", "Invoice"),
    type: tr("نوع مالیات", "نوع الضريبة", "KDV türü", "VAT type"),
    taxable: tr("مبنای مشمول", "الوعاء الخاضع للضريبة", "Vergiye tabi taban", "Taxable base"),
    tax: tr("مالیات", "الضريبة", "KDV", "VAT"),
    shipping: tr("حمل/خدمات", "الشحن/الخدمات", "Nakliye/hizmet", "Shipping/service"),
    total: tr("مبلغ کل", "المبلغ الإجمالي", "Toplam tutar", "Total"),
    noRows: tr("گردش مالیاتی ثبت‌شده‌ای وجود ندارد.", "لا يوجد نشاط ضريبي مسجل.", "Kaydedilmiş KDV hareketi yok.", "No posted VAT activity."),
  };

  async function load(nextPeriodId = periodId) {
    setLoading(true);
    setError("");
    try {
      if (!periods.length) {
        const available = await getFiscalPeriods();
        setPeriods(Array.isArray(available) ? available : []);
      }
      setData(await getVatReport(nextPeriodId));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => { const initialTimer = setTimeout(() => { void stableLoad(""); }, 0); return () => clearTimeout(initialTimer); }, [language, stableLoad]);

  async function changePeriod(value) {
    setPeriodId(value);
    await load(value);
  }

  function downloadCsv() {
    if (!data) return;
    const rows = [["Voucher", "Date", "Invoice", "Invoice type", "VAT type", "Taxable base", "VAT movement", "Shipping/service", "Total"]];
    data.items.forEach((item) => rows.push([
      item.voucher_no, item.voucher_date, item.invoice_id, item.invoice_type, item.vat_type,
      item.taxable_base, item.movement, item.shipping_cost, item.total_amount,
    ]));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "vetrix-vat-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const card = { background: "var(--erp-panel)", border: "1px solid var(--erp-border)", borderRadius: 22, boxShadow: "0 18px 55px rgba(2,6,23,.3)" };
  const button = { border: 0, borderRadius: 13, padding: "11px 15px", fontWeight: 900, cursor: "pointer", display: "flex", gap: 7, alignItems: "center" };
  const position = data ? copy[data.position] : "";

  return (
    <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1500, margin: "0 auto" }}>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#22c55e)" }}><ReceiptText size={30} /></div>
          <div><h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(27px,4vw,40px)" }}>{copy.title}</h1><p style={{ margin: "7px 0 0", color: "var(--erp-muted)" }}>{copy.subtitle}</p></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={periodId} onChange={(event) => changePeriod(event.target.value)} style={{ background: "var(--erp-panel-solid)", color: "var(--erp-text)", border: "1px solid var(--erp-border)", borderRadius: 13, padding: "10px 13px" }}>
            <option value="">{copy.allTime}</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name} — {period.status}</option>)}
          </select>
          <button onClick={() => load()} disabled={loading} style={{ ...button, background: "var(--erp-panel-solid)", color: "var(--erp-accent)" }}><RefreshCw size={16} />{loading ? "..." : copy.refresh}</button>
          <button onClick={downloadCsv} disabled={!data} style={{ ...button, background: "#166534", color: "#dcfce7" }}><Download size={16} />{copy.export}</button>
          <button onClick={() => window.print()} style={{ ...button, background: "var(--erp-panel-solid)", color: "var(--erp-text)" }}><Printer size={16} />{copy.print}</button>
        </div>
      </header>

      {error && <div className="text-red-200" style={{ ...card, padding: 16, marginBottom: 17 }}>{error}</div>}
      {data && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 16 }}>
          {[
            [copy.output, data.output_vat, TrendingUp, "#fda4af"],
            [copy.input, data.input_vat, ShoppingCart, "#86efac"],
            [copy.net, data.net_vat, Scale, data.net_vat > 0 ? "#fda4af" : "#86efac"],
          ].map(([label, value, Icon, color]) => <div key={label} style={{ ...card, padding: 18 }}><Icon size={21} color={color} /><div style={{ color: "var(--erp-muted)", marginTop: 9 }}>{label}</div><strong style={{ display: "block", color, fontSize: 23, marginTop: 5 }}>{money(value)}</strong></div>)}
          <div style={{ ...card, padding: 18 }}><ReceiptText size={21} color="var(--erp-accent)" /><div style={{ color: "var(--erp-muted)", marginTop: 9 }}>{copy.invoices}</div><strong style={{ display: "block", color: "var(--erp-text)", fontSize: 23, marginTop: 5 }}>{n(data.invoice_count)}</strong></div>
        </section>
        <section style={{ ...card, padding: 18, marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <strong style={{ color: data.position === "payable" ? "#fda4af" : "#86efac" }}>{position}</strong>
          <span style={{ color: "var(--erp-muted)" }}>{data.period?.name || copy.allTime}</span>
        </section>
        <section style={{ ...card, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead><tr>{[copy.voucher, copy.invoice, copy.type, copy.taxable, copy.tax, copy.shipping, copy.total].map((label) => <th key={label} style={{ padding: 13, textAlign: "start", color: "var(--erp-accent)", borderBottom: "1px solid var(--erp-border)" }}>{label}</th>)}</tr></thead>
            <tbody>
              {!data.items.length && <tr><td colSpan={7} style={{ padding: 25, textAlign: "center", color: "var(--erp-muted)" }}>{copy.noRows}</td></tr>}
              {data.items.map((item) => <tr key={`${item.voucher_id}-${item.vat_type}`}>
                <td style={{ padding: 13, borderTop: "1px solid var(--erp-border)" }}><b>{item.voucher_no}</b><div style={{ color: "var(--erp-muted)", fontSize: 12 }}>{date(item.voucher_date)}</div></td>
                <td style={{ padding: 13, borderTop: "1px solid var(--erp-border)" }}>#{item.invoice_id}<div style={{ color: "var(--erp-muted)", fontSize: 12 }}>{item.invoice_type}</div></td>
                <td style={{ padding: 13, borderTop: "1px solid var(--erp-border)", color: item.vat_type === "output" ? "#fda4af" : "#86efac" }}>{item.vat_type === "output" ? copy.output : copy.input}</td>
                {[item.taxable_base, item.movement, item.shipping_cost, item.total_amount].map((value, index) => <td key={index} style={{ padding: 13, borderTop: "1px solid var(--erp-border)", fontWeight: index === 1 ? 900 : 500 }}>{money(value)}</td>)}
              </tr>)}
            </tbody>
          </table>
        </section>
      </>}
    </div>
  );
}
