import { useEffect,useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { CheckCircle2,Clock3,FileCheck2,RefreshCw,Send,ShieldCheck,Wallet,XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits } from "../localization/helpers";
import { approveVoucher,getApprovalRequests,getDraftVouchers,rejectVoucher,submitVoucherForApproval,withdrawApproval } from "../services/approvalApi";
import { listPendingApprovals, approveApprovalRequest, rejectApprovalRequest, withdrawApprovalRequest } from "../services/api";

// Phase 1 payment-workflow generic approval engine (app/approvals/engine.py)
// - a separate, resource_type-agnostic system from the voucher maker-checker
// flow above (app/accounting/approvals.py). Today's only registered
// resource_types are invoice payment voids/refunds; the engine is designed
// to be reused later by other ERP actions without redesign.
const RESOURCE_TYPE_LABELS = {
  invoice_payment_void: { fa: "ابطال پرداخت فاکتور", ar: "إبطال دفعة فاتورة", tr: "Fatura ödemesi iptali", en: "Invoice payment void" },
  invoice_payment_refund: { fa: "استرداد پرداخت فاکتور", ar: "استرداد دفعة فاتورة", tr: "Fatura ödemesi iadesi", en: "Invoice payment refund" },
};

function GenericApprovalsSection({ language, money, n, card, button, input }) {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) => (fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText);

  async function load(next = status) {
    setLoading(true);
    try {
      setRequests(await listPendingApprovals(next));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  const stableLoad = useStableCallback(load);
  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoad]);

  async function changeStatus(next) {
    setStatus(next);
    await load(next);
  }
  async function decide(id, kind) {
    try {
      const note = notes[id] || "";
      if (kind === "approve") await approveApprovalRequest(id, note);
      else await rejectApprovalRequest(id, note);
      setNotes({ ...notes, [id]: "" });
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }
  async function withdraw(id) {
    try {
      await withdrawApprovalRequest(id);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  const statusLabel = {
    pending: tr("در انتظار", "قيد الانتظار", "Beklemede", "Pending"),
    approved: tr("تأییدشده", "معتمد", "Onaylandı", "Approved"),
    rejected: tr("ردشده", "مرفوض", "Reddedildi", "Rejected"),
    all: tr("همه", "الكل", "Tümü", "All"),
  };

  return (
    <section style={{ ...card, overflowX: "auto", marginTop: 20 }}>
      <h3 style={{ margin: "16px 0 0 16px", color: "var(--erp-accent)", display: "flex", alignItems: "center", gap: 7 }}>
        <Wallet size={18} /> {tr("درخواست‌های تایید عمومی (پرداخت فاکتور)", "طلبات الموافقة العامة (دفعات الفواتير)", "Genel onay talepleri (fatura ödemeleri)", "General approval requests (invoice payments)")}
      </h3>
      <nav style={{ display: "flex", gap: 7, margin: 12, flexWrap: "wrap" }}>
        {["pending", "approved", "rejected", "all"].map((x) => (
          <button key={x} onClick={() => changeStatus(x)} style={{ ...button, background: status === x ? "var(--erp-accent)" : "var(--erp-panel-solid)", color: status === x ? "#05202a" : "var(--erp-muted)" }}>
            {statusLabel[x]}
          </button>
        ))}
      </nav>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
        <thead>
          <tr>
            <th style={{ padding: 12, textAlign: "start", color: "var(--erp-accent)" }}>#</th>
            {[tr("نوع", "النوع", "Tür", "Type"), tr("درخواست‌کننده", "مقدّم الطلب", "Talep eden", "Requester"), tr("مبلغ", "المبلغ", "Tutar", "Amount"), tr("دلیل", "السبب", "Neden", "Reason"), tr("وضعیت", "الحالة", "Durum", "Status"), tr("یادداشت تصمیم", "ملاحظة القرار", "Karar notu", "Decision note"), ""].map((h) => (
              <th key={h} style={{ padding: 12, textAlign: "start", color: "var(--erp-accent)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!loading && requests.length === 0 && (
            <tr><td colSpan={8} style={{ padding: 25, textAlign: "center", color: "var(--erp-muted)" }}>{tr("موردی وجود ندارد.", "لا توجد عناصر.", "Kayıt yok.", "No items.")}</td></tr>
          )}
          {requests.map((r, index) => {
            const typeLabel = RESOURCE_TYPE_LABELS[r.resource_type];
            return (
              <tr key={r.id}>
                <td style={{ padding: 12, borderTop: "1px solid var(--erp-border)", color: "var(--erp-muted)", fontWeight: 700 }}>{n(index + 1)}</td>
                <td style={{ padding: 12, borderTop: "1px solid var(--erp-border)", fontWeight: 900 }}>
                  {typeLabel ? (typeLabel[language] || typeLabel.en) : r.resource_type}
                  <div style={{ color: "var(--erp-muted)", fontSize: 12 }}>#{r.resource_id}</div>
                </td>
                <td style={{ padding: 12 }}>{r.requested_by_name || r.requested_by}</td>
                <td style={{ padding: 12 }}>{money(r.amount)}</td>
                <td style={{ padding: 12 }}>{r.reason}</td>
                <td style={{ padding: 12, color: r.status === "approved" ? "#86efac" : r.status === "rejected" ? "#fda4af" : "#fbbf24" }}>
                  {r.status === "pending" ? <Clock3 size={15} style={{ display: "inline" }} /> : r.status === "approved" ? <CheckCircle2 size={15} style={{ display: "inline" }} /> : <XCircle size={15} style={{ display: "inline" }} />}
                  {" "}{statusLabel[r.status] || r.status}
                </td>
                <td style={{ padding: 12 }}>
                  {r.status === "pending" ? (
                    <input
                      placeholder={tr("یادداشت تصمیم", "ملاحظة القرار", "Karar notu", "Decision note")}
                      value={notes[r.id] || ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: fa ? toPersianDigits(e.target.value) : e.target.value })}
                      style={input}
                    />
                  ) : "—"}
                </td>
                <td style={{ padding: 12, whiteSpace: "nowrap" }}>
                  {r.status === "pending" && (
                    <>
                      <button onClick={() => decide(r.id, "approve")} style={{ ...button, background: "var(--erp-success-solid)", color: "var(--erp-success-solid-text)" }}>
                        <CheckCircle2 size={15} />{tr("تأیید", "اعتماد", "Onayla", "Approve")}
                      </button>{" "}
                      <button onClick={() => decide(r.id, "reject")} style={{ ...button, background: "var(--erp-danger-solid)", color: "var(--erp-danger-solid-text)" }}>
                        <XCircle size={15} />{tr("رد", "رفض", "Reddet", "Reject")}
                      </button>{" "}
                      <button onClick={() => withdraw(r.id)} style={{ ...button, background: "var(--erp-warning-solid)", color: "var(--erp-warning-solid-text)" }}>
                        {tr("انصراف", "سحب", "Geri çek", "Withdraw")}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function ApprovalCenter(){
 const {language,dir,money,date,n}=useLanguage();
 const [status,setStatus]=useState("pending"),[approvals,setApprovals]=useState([]),[drafts,setDrafts]=useState([]),[notes,setNotes]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const c={title:language==="fa"?"مرکز تأیید اسناد":language==="ar"?"مركز اعتماد المستندات":language==="tr"?"Fiş Onay Merkezi":"Voucher Approval Center",sub:language==="fa"?"کنترل دو مرحله‌ای ثبت‌کننده و تأییدکننده با سابقه تصمیمات":language==="ar"?"ضوابط رقابة من مرحلتين (مُعِدّ ومدقق) مع سجل قابل للتدقيق للقرارات":language==="tr"?"Hazırlayan-onaylayan iki aşamalı kontrol ve denetlenebilir karar geçmişi":"Maker-checker control with an auditable decision history",pending:language==="fa"?"در انتظار":language==="ar"?"قيد الانتظار":language==="tr"?"Beklemede":"Pending",approved:language==="fa"?"تأییدشده":language==="ar"?"معتمد":language==="tr"?"Onaylandı":"Approved",rejected:language==="fa"?"ردشده":language==="ar"?"مرفوض":language==="tr"?"Reddedildi":"Rejected",all:language==="fa"?"همه":language==="ar"?"الكل":language==="tr"?"Tümü":"All",drafts:language==="fa"?"اسناد آماده ارسال":language==="ar"?"المستندات الجاهزة للإرسال":language==="tr"?"Gönderime hazır fişler":"Draft vouchers",voucher:language==="fa"?"سند":language==="ar"?"المستند":language==="tr"?"Fiş":"Voucher",requester:language==="fa"?"درخواست‌کننده":language==="ar"?"مقدّم الطلب":language==="tr"?"Talep Eden":"Requester",date:language==="fa"?"تاریخ":language==="ar"?"التاريخ":language==="tr"?"Tarih":"Date",amount:language==="fa"?"مبلغ":language==="ar"?"المبلغ":language==="tr"?"Tutar":"Amount",note:language==="fa"?"یادداشت تصمیم":language==="ar"?"ملاحظة القرار":language==="tr"?"Karar Notu":"Decision note",submit:language==="fa"?"ارسال برای تأیید":language==="ar"?"إرسال للاعتماد":language==="tr"?"Onaya Gönder":"Submit",approve:language==="fa"?"تأیید":language==="ar"?"اعتماد":language==="tr"?"Onayla":"Approve",reject:language==="fa"?"رد":language==="ar"?"رفض":language==="tr"?"Reddet":"Reject",withdraw:language==="fa"?"انصراف":language==="ar"?"سحب":language==="tr"?"Geri Çek":"Withdraw",refresh:language==="fa"?"به‌روزرسانی":language==="ar"?"تحديث":language==="tr"?"Yenile":"Refresh",none:language==="fa"?"موردی وجود ندارد.":language==="ar"?"لا توجد عناصر.":language==="tr"?"Kayıt yok.":"No items.",maker:language==="fa"?"ثبت‌کننده":language==="ar"?"المُعِدّ":language==="tr"?"Hazırlayan":"Maker",checker:language==="fa"?"تأییدکننده":language==="ar"?"المدقق":language==="tr"?"Onaylayan":"Checker",status:language==="fa"?"وضعیت":language==="ar"?"الحالة":language==="tr"?"Durum":"Status"};
 async function load(next=status){setLoading(true);setError("");try{const [a,d]=await Promise.all([getApprovalRequests(next),getDraftVouchers()]);setApprovals(a);setDrafts(d.filter(x=>x.source_type==="manual"))}catch(e){setError(e.message)}finally{setLoading(false)}}
 const stableLoad = useStableCallback(load);

 useEffect(()=>{
  const timer = setTimeout(() => { void stableLoad(); }, 0);
  return () => clearTimeout(timer);
 },[language, stableLoad]);
 async function changeStatus(v){setStatus(v);await load(v)}
 async function submit(id){try{await submitVoucherForApproval(id);toast.success(c.submit);await load()}catch(e){toast.error(e.message)}}
 async function decide(id,kind){try{const note=notes[id]||"";if(kind==="approve")await approveVoucher(id,note);else await rejectVoucher(id,note);setNotes({...notes,[id]:""});await load()}catch(e){toast.error(e.message)}}
 async function withdraw(id){try{await withdrawApproval(id);await load()}catch(e){toast.error(e.message)}}
 const card={background:"var(--erp-panel)",border:"1px solid var(--erp-border)",borderRadius:22,boxShadow:"0 18px 55px rgba(2,6,23,.3)"},button={border:0,borderRadius:11,padding:"10px 13px",fontWeight:900,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6},input={background:"var(--erp-panel-solid)",color:"var(--erp-text)",border:"1px solid var(--erp-border)",borderRadius:11,padding:"9px 11px"};
 return <div dir={dir} style={{color:"var(--erp-text)",maxWidth:1500,margin:"0 auto"}}>
  <header style={{display:"flex",justifyContent:"space-between",gap:14,flexWrap:"wrap",alignItems:"center",marginBottom:20}}><div style={{display:"flex",gap:13,alignItems:"center"}}><div style={{width:55,height:55,borderRadius:17,display:"grid",placeItems:"center",background:"linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))"}}><ShieldCheck size={30}/></div><div><h1 style={{margin:0,color:"var(--erp-accent)",fontSize:"clamp(28px,4vw,40px)"}}>{c.title}</h1><p style={{margin:"6px 0 0",color:"var(--erp-muted)"}}>{c.sub}</p></div></div><button onClick={()=>load()} style={{...button,background:"var(--erp-glow)",color:"var(--erp-accent)"}}><RefreshCw size={16}/>{loading?"...":c.refresh}</button></header>
  {error&&<div className="text-red-200" style={{...card,padding:15,marginBottom:15}}>{error}</div>}
  <section style={{...card,padding:16,marginBottom:15}}><h3 style={{marginTop:0,color:"var(--erp-accent)"}}><FileCheck2 size={18} style={{display:"inline",marginInlineEnd:7}}/>{c.drafts}</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:9}}>{!drafts.length&&<span style={{color:"var(--erp-muted)"}}>{c.none}</span>}{drafts.map(v=><div key={v.id} style={{background:"var(--erp-panel-solid)",borderRadius:15,padding:13}}><strong>#{v.voucher_no} — {v.description||"—"}</strong><div style={{color:"var(--erp-muted)",margin:"6px 0"}}>{date(v.voucher_date)} · {money(v.total_debit)}</div><button onClick={()=>submit(v.id)} style={{...button,background:"var(--erp-success-solid)",color:"var(--erp-success-solid-text)"}}><Send size={15}/>{c.submit}</button></div>)}</div></section>
  <nav style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap"}}>{["pending","approved","rejected","all"].map(x=><button key={x} onClick={()=>changeStatus(x)} style={{...button,background:status===x?"var(--erp-accent)":"var(--erp-panel-solid)",color:status===x?"#05202a":"var(--erp-muted)"}}>{c[x]}</button>)}</nav>
  <section style={{...card,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:950}}><thead><tr><th style={{padding:12,textAlign:"start",color:"var(--erp-accent)"}}>#</th>{[c.voucher,c.requester,c.date,c.amount,c.status,c.note,""].map(x=><th key={x} style={{padding:12,textAlign:"start",color:"var(--erp-accent)"}}>{x}</th>)}</tr></thead><tbody>{!approvals.length&&<tr><td colSpan={8} style={{padding:25,textAlign:"center",color:"var(--erp-muted)"}}>{c.none}</td></tr>}{approvals.map((a,index)=><tr key={a.id}><td style={{padding:12,borderTop:"1px solid var(--erp-border)",color:"var(--erp-muted)",fontWeight:700}}>{n(index+1)}</td><td style={{padding:12,borderTop:"1px solid var(--erp-border)",fontWeight:900}}>#{a.voucher_no}<div style={{color:"var(--erp-muted)",fontSize:12}}>{a.description}</div></td><td style={{padding:12}}>{a.requested_by_name||a.requested_by}</td><td style={{padding:12}}>{date(a.voucher_date)}</td><td style={{padding:12}}>{money(a.total_debit)}</td><td style={{padding:12,color:a.status==="approved"?"#86efac":a.status==="rejected"?"#fda4af":"#fbbf24"}}>{a.status==="pending"?<Clock3 size={15} style={{display:"inline"}}/>:a.status==="approved"?<CheckCircle2 size={15} style={{display:"inline"}}/>:<XCircle size={15} style={{display:"inline"}}/>} {c[a.status]||a.status}</td><td style={{padding:12}}>{a.status==="pending"?<input placeholder={c.note} value={notes[a.id]||""} onChange={e=>setNotes({...notes,[a.id]:language==="fa"?toPersianDigits(e.target.value):e.target.value})} style={input}/>:a.decision_note||"—"}</td><td style={{padding:12,whiteSpace:"nowrap"}}>{a.status==="pending"&&<><button onClick={()=>decide(a.id,"approve")} style={{...button,background:"var(--erp-success-solid)",color:"var(--erp-success-solid-text)"}}><CheckCircle2 size={15}/>{c.approve}</button> <button onClick={()=>decide(a.id,"reject")} style={{...button,background:"var(--erp-danger-solid)",color:"var(--erp-danger-solid-text)"}}><XCircle size={15}/>{c.reject}</button> <button onClick={()=>withdraw(a.id)} style={{...button,background:"var(--erp-warning-solid)",color:"var(--erp-warning-solid-text)"}}>{c.withdraw}</button></>}</td></tr>)}</tbody></table></section>
  <GenericApprovalsSection language={language} money={money} n={n} card={card} button={button} input={input} />
 </div>
}
