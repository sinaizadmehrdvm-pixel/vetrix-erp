import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Download, HandCoins, Landmark, Printer, RefreshCw, Scale } from "lucide-react";

import { useLanguage } from "../localization/LanguageContext";
import { getAgingReport } from "../services/agingApi";

export default function AgingReport() {
  const { language, dir, money, date, n } = useLanguage();
  const fa = language === "fa";
  const [asOf, setAsOf] = useState("");
  const [termsDays, setTermsDays] = useState(30);
  const [data, setData] = useState(null);
  const [side, setSide] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "سررسید مطالبات و بدهی‌ها" : "Receivables & Payables Aging",
    subtitle: fa ? "مانده باز فاکتورها، تأخیر وصول و کنترل سقف اعتبار طرف‌حساب‌ها" : "Open invoices, overdue exposure, and party credit-limit control",
    asOf: fa ? "گزارش تا تاریخ" : "As of",
    terms: fa ? "مهلت پرداخت (روز)" : "Payment terms (days)",
    refresh: fa ? "به‌روزرسانی" : "Refresh",
    export: fa ? "خروجی CSV" : "CSV export",
    print: fa ? "چاپ" : "Print",
    receivable: fa ? "مطالبات" : "Receivables",
    payable: fa ? "بدهی‌ها" : "Payables",
    net: fa ? "خالص وضعیت" : "Net position",
    overdue: fa ? "مطالبات سررسیدگذشته" : "Overdue receivables",
    all: fa ? "همه" : "All",
    current: fa ? "جاری" : "Current",
    "1_30": fa ? "۱ تا ۳۰ روز" : "1–30 days",
    "31_60": fa ? "۳۱ تا ۶۰ روز" : "31–60 days",
    "61_90": fa ? "۶۱ تا ۹۰ روز" : "61–90 days",
    over_90: fa ? "بیش از ۹۰ روز" : "Over 90 days",
    invoice: fa ? "فاکتور" : "Invoice",
    party: fa ? "طرف‌حساب" : "Party",
    due: fa ? "سررسید" : "Due date",
    age: fa ? "روز تأخیر" : "Days overdue",
    total: fa ? "مبلغ فاکتور" : "Invoice total",
    settled: fa ? "تسویه‌شده" : "Settled",
    outstanding: fa ? "مانده باز" : "Outstanding",
    noRows: fa ? "مانده بازی در این بخش وجود ندارد." : "No open balance in this view.",
    creditWarning: fa ? "عبور از سقف اعتبار" : "Over credit limit",
  };

  async function load() {
    setLoading(true); setError("");
    try { setData(await getAgingReport({ asOf, termsDays })); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [language]);

  const items = data?.items?.filter((item) => side === "all" || item.side === side) || [];
  const card = { background: "linear-gradient(145deg,rgba(15,23,42,.95),rgba(15,23,42,.72))", border: "1px solid rgba(34,211,238,.2)", borderRadius: 22, boxShadow: "0 18px 55px rgba(2,6,23,.3)" };
  const button = { border: 0, borderRadius: 13, padding: "11px 15px", fontWeight: 900, cursor: "pointer", display: "flex", gap: 7, alignItems: "center" };

  function downloadCsv() {
    if (!data) return;
    const rows = [["Invoice", "Party", "Side", "Invoice date", "Due date", "Days overdue", "Bucket", "Total", "Settled", "Outstanding"]];
    items.forEach((item) => rows.push([item.invoice_id, item.customer_name, item.side, item.invoice_date, item.due_date, item.days_overdue, item.bucket, item.total_amount, item.settled_amount, item.outstanding_amount]));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "vetrix-aging-report.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1500, margin: "0 auto" }}>
    <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)" }}><CalendarDays size={30} /></div>
        <div><h1 style={{ margin: 0, color: "#c4b5fd", fontSize: "clamp(27px,4vw,40px)" }}>{copy.title}</h1><p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ color: "#94a3b8", fontSize: 12 }}>{copy.asOf}<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ display: "block", marginTop: 4, background: "#1e293b", color: "white", border: "1px solid #334155", borderRadius: 10, padding: 8 }} /></label>
        <label style={{ color: "#94a3b8", fontSize: 12 }}>{copy.terms}<input type="number" min="0" max="365" value={termsDays} onChange={(e) => setTermsDays(Number(e.target.value))} style={{ display: "block", width: 105, marginTop: 4, background: "#1e293b", color: "white", border: "1px solid #334155", borderRadius: 10, padding: 8 }} /></label>
        <button onClick={load} disabled={loading} style={{ ...button, background: "#164e63", color: "#cffafe", alignSelf: "end" }}><RefreshCw size={16} />{loading ? "..." : copy.refresh}</button>
        <button onClick={downloadCsv} style={{ ...button, background: "#166534", color: "#dcfce7", alignSelf: "end" }}><Download size={16} />{copy.export}</button>
        <button onClick={() => window.print()} style={{ ...button, background: "#334155", color: "#e2e8f0", alignSelf: "end" }}><Printer size={16} />{copy.print}</button>
      </div>
    </header>
    {error && <div style={{ ...card, padding: 16, marginBottom: 17, color: "#fecaca" }}>{error}</div>}
    {data && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 12, marginBottom: 16 }}>
        {[[copy.receivable,data.summary.receivable,HandCoins,"#86efac"],[copy.payable,data.summary.payable,Landmark,"#fda4af"],[copy.net,data.summary.net_position,Scale,"#67e8f9"],[copy.overdue,data.summary.overdue_receivable,AlertTriangle,"#fbbf24"]].map(([label,value,Icon,color]) => <div key={label} style={{ ...card, padding: 18 }}><Icon size={21} color={color}/><div style={{ color:"#94a3b8", marginTop:8 }}>{label}</div><strong style={{ display:"block", color, fontSize:22, marginTop:5 }}>{money(value)}</strong></div>)}
      </section>
      <section style={{ ...card, padding: 15, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9 }}>
        {Object.entries(data.buckets).map(([key,bucket]) => <div key={key} style={{ background:"rgba(30,41,59,.7)", borderRadius:15, padding:13 }}><strong style={{ color:"#c4b5fd" }}>{copy[key]}</strong><div style={{ color:"#86efac", marginTop:8 }}>{money(bucket.receivable)}</div><div style={{ color:"#fda4af", marginTop:4 }}>{money(bucket.payable)}</div></div>)}
      </section>
      <nav className="no-print" style={{ display:"flex", gap:8, marginBottom:12 }}>{["all","receivable","payable"].map((value)=><button key={value} onClick={()=>setSide(value)} style={{ ...button, background:side===value?"#22d3ee":"#1e293b", color:side===value?"#05202a":"#cbd5e1" }}>{copy[value]}</button>)}</nav>
      {data.summary.over_credit_limit_count > 0 && <div style={{ ...card, padding:14, marginBottom:12, color:"#fbbf24" }}><AlertTriangle size={17} style={{ display:"inline", marginInlineEnd:8 }}/>{copy.creditWarning}: {n(data.summary.over_credit_limit_count)}</div>}
      <section style={{ ...card, overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
        <thead><tr>{[copy.invoice,copy.party,copy.due,copy.age,copy.total,copy.settled,copy.outstanding].map(label=><th key={label} style={{ padding:13,textAlign:"start",color:"#67e8f9",borderBottom:"1px solid rgba(148,163,184,.16)" }}>{label}</th>)}</tr></thead>
        <tbody>{!items.length && <tr><td colSpan={7} style={{ padding:25,textAlign:"center",color:"#64748b" }}>{copy.noRows}</td></tr>}
        {items.map(item=><tr key={item.invoice_id}><td style={{ padding:13,borderTop:"1px solid rgba(148,163,184,.1)" }}>#{item.invoice_id}<div style={{ color:"#64748b",fontSize:12 }}>{item.invoice_type}</div></td><td style={{ padding:13,borderTop:"1px solid rgba(148,163,184,.1)" }}>{item.customer_name}</td><td style={{ padding:13,borderTop:"1px solid rgba(148,163,184,.1)" }}>{date(item.due_date)}</td><td style={{ padding:13,borderTop:"1px solid rgba(148,163,184,.1)",color:item.days_overdue?"#fbbf24":"#86efac" }}>{n(item.days_overdue)}<div style={{ color:"#64748b",fontSize:12 }}>{copy[item.bucket]}</div></td>{[item.total_amount,item.settled_amount,item.outstanding_amount].map((value,index)=><td key={index} style={{ padding:13,borderTop:"1px solid rgba(148,163,184,.1)",fontWeight:index===2?900:500,color:index===2?(item.side==="receivable"?"#86efac":"#fda4af"):"inherit" }}>{money(value)}</td>)}</tr>)}</tbody>
      </table></section>
    </>}
  </div>;
}
