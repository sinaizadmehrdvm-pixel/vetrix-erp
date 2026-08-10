import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { AlertTriangle, CalendarDays, Download, HandCoins, Landmark, Printer, RefreshCw, Scale } from "lucide-react";

import JalaliDateField from "../components/forms/JalaliDateField";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput, invoiceTypeLabel } from "../localization/helpers";
import { getAgingReport } from "../services/agingApi";
import ReportHeader from "../components/reports/ReportHeader";
import ReportFooter from "../components/reports/ReportFooter";

export default function AgingReport() {
  const { language, dir, money, date, n } = useLanguage();
  const [asOf, setAsOf] = useState("");
  const [termsDays, setTermsDays] = useState(30);
  const [data, setData] = useState(null);
  const [side, setSide] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: language === "fa" ? "سررسید مطالبات و بدهی‌ها" : language === "ar" ? "أعمار الذمم المدينة والدائنة" : language === "tr" ? "Alacak ve Borç Yaşlandırma" : "Receivables & Payables Aging",
    subtitle: language === "fa" ? "مانده باز فاکتورها، تأخیر وصول و کنترل سقف اعتبار طرف‌حساب‌ها" : language === "ar" ? "الفواتير المفتوحة، التأخر في التحصيل، ومراقبة حد الائتمان للأطراف" : language === "tr" ? "Açık faturalar, tahsilat gecikmesi ve cari kredi limiti kontrolü" : "Open invoices, overdue exposure, and party credit-limit control",
    asOf: language === "fa" ? "گزارش تا تاریخ" : language === "ar" ? "حتى تاريخ" : language === "tr" ? "Tarih itibarıyla" : "As of",
    terms: language === "fa" ? "مهلت پرداخت (روز)" : language === "ar" ? "مهلة السداد (أيام)" : language === "tr" ? "Ödeme Vadesi (gün)" : "Payment terms (days)",
    refresh: language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh",
    export: language === "fa" ? "خروجی CSV" : language === "ar" ? "تصدير CSV" : language === "tr" ? "CSV Dışa Aktar" : "CSV export",
    print: language === "fa" ? "چاپ" : language === "ar" ? "طباعة" : language === "tr" ? "Yazdır" : "Print",
    receivable: language === "fa" ? "مطالبات" : language === "ar" ? "الذمم المدينة" : language === "tr" ? "Alacaklar" : "Receivables",
    payable: language === "fa" ? "بدهی‌ها" : language === "ar" ? "الذمم الدائنة" : language === "tr" ? "Borçlar" : "Payables",
    net: language === "fa" ? "خالص وضعیت" : language === "ar" ? "صافي المركز" : language === "tr" ? "Net Pozisyon" : "Net position",
    overdue: language === "fa" ? "مطالبات سررسیدگذشته" : language === "ar" ? "الذمم المدينة المتأخرة" : language === "tr" ? "Vadesi Geçmiş Alacaklar" : "Overdue receivables",
    all: language === "fa" ? "همه" : language === "ar" ? "الكل" : language === "tr" ? "Tümü" : "All",
    current: language === "fa" ? "جاری" : language === "ar" ? "جارٍ" : language === "tr" ? "Güncel" : "Current",
    "1_30": language === "fa" ? "۱ تا ۳۰ روز" : language === "ar" ? "1–30 يومًا" : language === "tr" ? "1–30 gün" : "1–30 days",
    "31_60": language === "fa" ? "۳۱ تا ۶۰ روز" : language === "ar" ? "31–60 يومًا" : language === "tr" ? "31–60 gün" : "31–60 days",
    "61_90": language === "fa" ? "۶۱ تا ۹۰ روز" : language === "ar" ? "61–90 يومًا" : language === "tr" ? "61–90 gün" : "61–90 days",
    over_90: language === "fa" ? "بیش از ۹۰ روز" : language === "ar" ? "أكثر من 90 يومًا" : language === "tr" ? "90 günden fazla" : "Over 90 days",
    invoice: language === "fa" ? "فاکتور" : language === "ar" ? "الفاتورة" : language === "tr" ? "Fatura" : "Invoice",
    party: language === "fa" ? "طرف‌حساب" : language === "ar" ? "الطرف" : language === "tr" ? "Cari" : "Party",
    due: language === "fa" ? "سررسید" : language === "ar" ? "تاريخ الاستحقاق" : language === "tr" ? "Vade Tarihi" : "Due date",
    age: language === "fa" ? "روز تأخیر" : language === "ar" ? "أيام التأخير" : language === "tr" ? "Gecikme (gün)" : "Days overdue",
    total: language === "fa" ? "مبلغ فاکتور" : language === "ar" ? "إجمالي الفاتورة" : language === "tr" ? "Fatura Tutarı" : "Invoice total",
    settled: language === "fa" ? "تسویه‌شده" : language === "ar" ? "المسدد" : language === "tr" ? "Kapatılan" : "Settled",
    outstanding: language === "fa" ? "مانده باز" : language === "ar" ? "الرصيد المستحق" : language === "tr" ? "Açık Bakiye" : "Outstanding",
    noRows: language === "fa" ? "مانده بازی در این بخش وجود ندارد." : language === "ar" ? "لا يوجد رصيد مفتوح في هذا العرض." : language === "tr" ? "Bu görünümde açık bakiye yok." : "No open balance in this view.",
    creditWarning: language === "fa" ? "عبور از سقف اعتبار" : language === "ar" ? "تجاوز حد الائتمان" : language === "tr" ? "Kredi Limiti Aşıldı" : "Over credit limit",
  };

  async function load() {
    setLoading(true); setError("");
    try { setData(await getAgingReport({ asOf, termsDays })); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }
  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoad]);

  const items = data?.items?.filter((item) => side === "all" || item.side === side) || [];
  const card = { background: "var(--erp-panel)", border: "1px solid var(--erp-border)", borderRadius: 22, boxShadow: "0 18px 55px rgba(2,6,23,.3)" };
  const button = { border: 0, borderRadius: 13, padding: "11px 15px", fontWeight: 900, cursor: "pointer", display: "flex", gap: 7, alignItems: "center" };

  function downloadCsv() {
    if (!data) return;
    const rows = [["Invoice", "Party", "Side", "Invoice date", "Due date", "Days overdue", "Bucket", "Total", "Settled", "Outstanding"]];
    items.forEach((item) => rows.push([item.invoice_id, item.customer_name, item.side, item.invoice_date, item.due_date, item.days_overdue, item.bucket, item.total_amount, item.settled_amount, item.outstanding_amount]));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "vetrix-aging-report.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1500, margin: "0 auto" }}>
    <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)" }}><CalendarDays size={30} /></div>
        <div><h1 className="text-violet-300" style={{ margin: 0, fontSize: "clamp(27px,4vw,40px)" }}>{copy.title}</h1><p style={{ margin: "7px 0 0", color: "var(--erp-muted)" }}>{copy.subtitle}</p></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ color: "var(--erp-muted)", fontSize: 12 }}>{copy.asOf}<div style={{ marginTop: 4 }}><JalaliDateField value={asOf} onChange={setAsOf} fa={language === "fa"} language={language} className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] border border-[var(--erp-border)] rounded-[var(--erp-radius-sm)] p-2" /></div></label>
        <label style={{ color: "var(--erp-muted)", fontSize: 12 }}>{copy.terms}<input type="text" inputMode="numeric" value={language === "fa" ? toPersianDigits(termsDays) : termsDays} onChange={(e) => setTermsDays(Number(cleanNumberInput(e.target.value)) || 0)} style={{ display: "block", width: 105, marginTop: 4, background: "var(--erp-panel-solid)", color: "var(--erp-text)", border: "1px solid var(--erp-border)", borderRadius: 10, padding: 8 }} /></label>
        <button onClick={load} disabled={loading} style={{ ...button, background: "var(--erp-panel-solid)", color: "var(--erp-accent)", alignSelf: "end" }}><RefreshCw size={16} />{loading ? "..." : copy.refresh}</button>
        <button onClick={downloadCsv} style={{ ...button, background: "#166534", color: "#dcfce7", alignSelf: "end" }}><Download size={16} />{copy.export}</button>
        <button onClick={() => window.print()} style={{ ...button, background: "var(--erp-panel-solid)", color: "var(--erp-text)", alignSelf: "end" }}><Printer size={16} />{copy.print}</button>
      </div>
    </header>
    <ReportHeader
      title={copy.title}
      subtitle={copy.subtitle}
      period={asOf ? date(asOf) : undefined}
      filterSummary={side !== "all" ? copy[side] : undefined}
    />
    {error && <div className="text-red-200" style={{ ...card, padding: 16, marginBottom: 17 }}>{error}</div>}
    {data && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 12, marginBottom: 16 }}>
        {[[copy.receivable,data.summary.receivable,HandCoins,"#86efac"],[copy.payable,data.summary.payable,Landmark,"#fda4af"],[copy.net,data.summary.net_position,Scale,"var(--erp-accent)"],[copy.overdue,data.summary.overdue_receivable,AlertTriangle,"#fbbf24"]].map(([label,value,Icon,color]) => <div key={label} style={{ ...card, padding: 18 }}><Icon size={21} color={color}/><div style={{ color:"var(--erp-muted)", marginTop:8 }}>{label}</div><strong style={{ display:"block", color, fontSize:22, marginTop:5 }}>{money(value)}</strong></div>)}
      </section>
      <section style={{ ...card, padding: 15, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9 }}>
        {Object.entries(data.buckets).map(([key,bucket]) => <div key={key} style={{ background:"var(--erp-panel-solid)", borderRadius:15, padding:13 }}><strong className="text-violet-300">{copy[key]}</strong><div className="text-green-300" style={{ marginTop:8 }}>{money(bucket.receivable)}</div><div style={{ color:"#fda4af", marginTop:4 }}>{money(bucket.payable)}</div></div>)}
      </section>
      <nav className="no-print" style={{ display:"flex", gap:8, marginBottom:12 }}>{["all","receivable","payable"].map((value)=><button key={value} onClick={()=>setSide(value)} style={{ ...button, background:side===value?"var(--erp-accent)":"var(--erp-panel-solid)", color:side===value?"#05202a":"var(--erp-muted)" }}>{copy[value]}</button>)}</nav>
      {data.summary.over_credit_limit_count > 0 && <div style={{ ...card, padding:14, marginBottom:12, color:"#fbbf24" }}><AlertTriangle size={17} style={{ display:"inline", marginInlineEnd:8 }}/>{copy.creditWarning}: {n(data.summary.over_credit_limit_count)}</div>}
      <section style={{ ...card, overflowX:"auto" }}><table className="erp-report-table" style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
        <thead><tr><th style={{ padding:13,textAlign:"start",color:"var(--erp-accent)",borderBottom:"1px solid var(--erp-border)" }}>#</th>{[copy.invoice,copy.party,copy.due,copy.age,copy.total,copy.settled,copy.outstanding].map(label=><th key={label} style={{ padding:13,textAlign:"start",color:"var(--erp-accent)",borderBottom:"1px solid var(--erp-border)" }}>{label}</th>)}</tr></thead>
        <tbody>{!items.length && <tr><td colSpan={8} style={{ padding:25,textAlign:"center",color:"var(--erp-muted)" }}>{copy.noRows}</td></tr>}
        {items.map((item,rowIndex)=><tr key={item.invoice_id}><td style={{ padding:13,borderTop:"1px solid var(--erp-border)",color:"var(--erp-muted)",fontWeight:700 }}>{n(rowIndex+1)}</td><td style={{ padding:13,borderTop:"1px solid var(--erp-border)" }}>#{n(item.invoice_id)}<div style={{ color:"var(--erp-muted)",fontSize:12 }}>{invoiceTypeLabel(item.invoice_type, language)}</div></td><td style={{ padding:13,borderTop:"1px solid var(--erp-border)" }}>{item.customer_name}</td><td style={{ padding:13,borderTop:"1px solid var(--erp-border)" }}>{date(item.due_date)}</td><td style={{ padding:13,borderTop:"1px solid var(--erp-border)",color:item.days_overdue?"#fbbf24":"#86efac" }}>{n(item.days_overdue)}<div style={{ color:"var(--erp-muted)",fontSize:12 }}>{copy[item.bucket]}</div></td>{[item.total_amount,item.settled_amount,item.outstanding_amount].map((value,index)=><td key={index} style={{ padding:13,borderTop:"1px solid var(--erp-border)",fontWeight:index===2?900:500,color:index===2?(item.side==="receivable"?"#86efac":"#fda4af"):"inherit" }}>{money(value)}</td>)}</tr>)}</tbody>
      </table></section>
      <ReportFooter confidential />
    </>}
  </div>;
}
