import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Download, Printer, ReceiptText, RefreshCw, Scale, ShoppingCart, TrendingUp } from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { getFiscalPeriods } from "../services/fiscalPeriodsApi";
import { getVatReport } from "../services/taxApi";

export default function TaxAccounting() {
  const { language, dir, money, date, n } = useLanguage();
  const fa = language === "fa";
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "حسابداری مالیات بر ارزش افزوده" : "VAT Accounting",
    subtitle: fa ? "گزارش مالیات فروش، اعتبار مالیاتی خرید و مانده قابل پرداخت از دفتر کل" : "Output VAT, input tax credit, and net position from the posted ledger",
    allTime: fa ? "همه دوره‌ها" : "All periods",
    output: fa ? "مالیات فروش" : "Output VAT",
    input: fa ? "اعتبار مالیاتی خرید" : "Input VAT",
    net: fa ? "مانده خالص" : "Net VAT",
    payable: fa ? "قابل پرداخت" : "Payable",
    credit: fa ? "اعتبار مالیاتی" : "Tax credit",
    settled: fa ? "تسویه‌شده" : "Settled",
    invoices: fa ? "تعداد فاکتور" : "Invoices",
    refresh: fa ? "به‌روزرسانی" : "Refresh",
    export: fa ? "خروجی CSV" : "CSV export",
    print: fa ? "چاپ" : "Print",
    voucher: fa ? "شماره سند" : "Voucher",
    invoice: fa ? "فاکتور" : "Invoice",
    type: fa ? "نوع مالیات" : "VAT type",
    taxable: fa ? "مبنای مشمول" : "Taxable base",
    tax: fa ? "مالیات" : "VAT",
    shipping: fa ? "حمل/خدمات" : "Shipping/service",
    total: fa ? "مبلغ کل" : "Total",
    noRows: fa ? "گردش مالیاتی ثبت‌شده‌ای وجود ندارد." : "No posted VAT activity.",
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

  const card = { background: "linear-gradient(145deg,rgba(15,23,42,.95),rgba(15,23,42,.72))", border: "1px solid rgba(34,211,238,.2)", borderRadius: 22, boxShadow: "0 18px 55px rgba(2,6,23,.3)" };
  const button = { border: 0, borderRadius: 13, padding: "11px 15px", fontWeight: 900, cursor: "pointer", display: "flex", gap: 7, alignItems: "center" };
  const position = data ? copy[data.position] : "";

  return (
    <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1500, margin: "0 auto" }}>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#22c55e)" }}><ReceiptText size={30} /></div>
          <div><h1 style={{ margin: 0, color: "#a5f3fc", fontSize: "clamp(27px,4vw,40px)" }}>{copy.title}</h1><p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={periodId} onChange={(event) => changePeriod(event.target.value)} style={{ background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.25)", borderRadius: 13, padding: "10px 13px" }}>
            <option value="">{copy.allTime}</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name} — {period.status}</option>)}
          </select>
          <button onClick={() => load()} disabled={loading} style={{ ...button, background: "#164e63", color: "#cffafe" }}><RefreshCw size={16} />{loading ? "..." : copy.refresh}</button>
          <button onClick={downloadCsv} disabled={!data} style={{ ...button, background: "#166534", color: "#dcfce7" }}><Download size={16} />{copy.export}</button>
          <button onClick={() => window.print()} style={{ ...button, background: "#334155", color: "#e2e8f0" }}><Printer size={16} />{copy.print}</button>
        </div>
      </header>

      {error && <div style={{ ...card, padding: 16, marginBottom: 17, color: "#fecaca" }}>{error}</div>}
      {data && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 16 }}>
          {[
            [copy.output, data.output_vat, TrendingUp, "#fda4af"],
            [copy.input, data.input_vat, ShoppingCart, "#86efac"],
            [copy.net, data.net_vat, Scale, data.net_vat > 0 ? "#fda4af" : "#86efac"],
          ].map(([label, value, Icon, color]) => <div key={label} style={{ ...card, padding: 18 }}><Icon size={21} color={color} /><div style={{ color: "#94a3b8", marginTop: 9 }}>{label}</div><strong style={{ display: "block", color, fontSize: 23, marginTop: 5 }}>{money(value)}</strong></div>)}
          <div style={{ ...card, padding: 18 }}><ReceiptText size={21} color="#67e8f9" /><div style={{ color: "#94a3b8", marginTop: 9 }}>{copy.invoices}</div><strong style={{ display: "block", color: "#e0f2fe", fontSize: 23, marginTop: 5 }}>{n(data.invoice_count)}</strong></div>
        </section>
        <section style={{ ...card, padding: 18, marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <strong style={{ color: data.position === "payable" ? "#fda4af" : "#86efac" }}>{position}</strong>
          <span style={{ color: "#94a3b8" }}>{data.period?.name || copy.allTime}</span>
        </section>
        <section style={{ ...card, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead><tr>{[copy.voucher, copy.invoice, copy.type, copy.taxable, copy.tax, copy.shipping, copy.total].map((label) => <th key={label} style={{ padding: 13, textAlign: "start", color: "#67e8f9", borderBottom: "1px solid rgba(148,163,184,.16)" }}>{label}</th>)}</tr></thead>
            <tbody>
              {!data.items.length && <tr><td colSpan={7} style={{ padding: 25, textAlign: "center", color: "#64748b" }}>{copy.noRows}</td></tr>}
              {data.items.map((item) => <tr key={`${item.voucher_id}-${item.vat_type}`}>
                <td style={{ padding: 13, borderTop: "1px solid rgba(148,163,184,.1)" }}><b>{item.voucher_no}</b><div style={{ color: "#64748b", fontSize: 12 }}>{date(item.voucher_date)}</div></td>
                <td style={{ padding: 13, borderTop: "1px solid rgba(148,163,184,.1)" }}>#{item.invoice_id}<div style={{ color: "#94a3b8", fontSize: 12 }}>{item.invoice_type}</div></td>
                <td style={{ padding: 13, borderTop: "1px solid rgba(148,163,184,.1)", color: item.vat_type === "output" ? "#fda4af" : "#86efac" }}>{item.vat_type === "output" ? copy.output : copy.input}</td>
                {[item.taxable_base, item.movement, item.shipping_cost, item.total_amount].map((value, index) => <td key={index} style={{ padding: 13, borderTop: "1px solid rgba(148,163,184,.1)", fontWeight: index === 1 ? 900 : 500 }}>{money(value)}</td>)}
              </tr>)}
            </tbody>
          </table>
        </section>
      </>}
    </div>
  );
}
