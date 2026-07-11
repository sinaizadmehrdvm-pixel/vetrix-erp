import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Landmark, Plus, RefreshCw, Trash2, Unlink } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/LanguageContext";
import { addBankStatementLine, createBankAccount, deleteBankStatementLine, getBankAccounts, getBankCandidates, getBankReconciliationSummary, getBankStatement, matchBankStatementLine, unmatchBankStatementLine } from "../services/bankReconciliationApi";

export default function BankReconciliation() {
  const { language, dir, money, date, n } = useLanguage();
  const fa = language === "fa";
  const [accounts,setAccounts]=useState([]), [accountId,setAccountId]=useState("");
  const [lines,setLines]=useState([]), [summary,setSummary]=useState(null), [candidates,setCandidates]=useState({});
  const [loading,setLoading]=useState(true), [error,setError]=useState("");
  const [accountForm,setAccountForm]=useState({name:"",bank_name:"",account_number:"",iban:"",ledger_account_code:"1102",opening_balance:0});
  const [lineForm,setLineForm]=useState({transaction_date:new Date().toISOString().slice(0,10),description:"",reference:"",amount:""});
  const copy={
    title:fa?"مغایرت‌گیری بانکی":"Bank Reconciliation", subtitle:fa?"تطبیق صورتحساب بانک با اسناد قطعی دفتر کل":"Match bank statements against posted general-ledger entries",
    account:fa?"حساب بانکی":"Bank account",newAccount:fa?"تعریف حساب":"Add account",bank:fa?"نام بانک":"Bank",number:fa?"شماره حساب":"Account number",opening:fa?"مانده ابتدای صورتحساب":"Statement opening",save:fa?"ذخیره":"Save",
    addLine:fa?"افزودن گردش صورتحساب":"Add statement line",date:fa?"تاریخ":"Date",description:fa?"شرح":"Description",reference:fa?"مرجع":"Reference",amount:fa?"مبلغ (+واریز / -برداشت)":"Amount (+in / -out)",
    statement:fa?"صورتحساب":"Statement",ledger:fa?"دفتر کل":"Ledger",matched:fa?"تطبیق‌شده":"Matched",unmatched:fa?"تطبیق‌نشده":"Unmatched",difference:fa?"اختلاف":"Difference",reconciled:fa?"تطبیق کامل":"Reconciled",
    find:fa?"یافتن سند":"Find ledger entry",unmatch:fa?"لغو تطبیق":"Unmatch",delete:fa?"حذف":"Delete",voucher:fa?"سند":"Voucher",noData:fa?"گردشی ثبت نشده است.":"No statement lines yet.",refresh:fa?"به‌روزرسانی":"Refresh"
  };
  async function load(id=accountId){
    setLoading(true);setError("");
    try{
      const list=await getBankAccounts();setAccounts(list);
      const selected=id||list[0]?.id||"";setAccountId(String(selected));
      if(selected){const [statement,totals]=await Promise.all([getBankStatement(selected),getBankReconciliationSummary(selected)]);setLines(statement);setSummary(totals);}
      else{setLines([]);setSummary(null);}
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{load("");},[language]);
  async function submitAccount(e){e.preventDefault();try{const r=await createBankAccount(accountForm);setAccountForm({...accountForm,name:"",bank_name:"",account_number:"",iban:""});await load(r.id);toast.success(copy.save);}catch(e){toast.error(e.message);}}
  async function submitLine(e){e.preventDefault();if(!accountId)return;try{await addBankStatementLine(accountId,{...lineForm,amount:Number(lineForm.amount)});setLineForm({...lineForm,description:"",reference:"",amount:""});await load(accountId);}catch(e){toast.error(e.message);}}
  async function find(line){try{setCandidates({...candidates,[line.id]:await getBankCandidates(accountId,line.id)});}catch(e){toast.error(e.message);}}
  async function match(lineId,voucherLineId){try{await matchBankStatementLine(lineId,voucherLineId);setCandidates({...candidates,[lineId]:[]});await load(accountId);}catch(e){toast.error(e.message);}}
  async function unmatch(id){try{await unmatchBankStatementLine(id);await load(accountId);}catch(e){toast.error(e.message);}}
  async function remove(id){try{await deleteBankStatementLine(id);await load(accountId);}catch(e){toast.error(e.message);}}
  const card={background:"linear-gradient(145deg,rgba(15,23,42,.96),rgba(15,23,42,.74))",border:"1px solid rgba(34,211,238,.2)",borderRadius:22,boxShadow:"0 18px 55px rgba(2,6,23,.3)"};
  const input={background:"#1e293b",color:"white",border:"1px solid #334155",borderRadius:11,padding:"10px 12px",minWidth:0};
  const button={border:0,borderRadius:11,padding:"10px 13px",fontWeight:900,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6};
  return <div dir={dir} style={{color:"#f8fafc",maxWidth:1500,margin:"0 auto"}}>
    <header style={{display:"flex",justifyContent:"space-between",gap:14,flexWrap:"wrap",alignItems:"center",marginBottom:20}}><div style={{display:"flex",gap:13,alignItems:"center"}}><div style={{width:55,height:55,borderRadius:17,display:"grid",placeItems:"center",background:"linear-gradient(135deg,#06b6d4,#2563eb)"}}><Landmark size={30}/></div><div><h1 style={{margin:0,color:"#a5f3fc",fontSize:"clamp(28px,4vw,40px)"}}>{copy.title}</h1><p style={{margin:"6px 0 0",color:"#94a3b8"}}>{copy.subtitle}</p></div></div><button onClick={()=>load()} style={{...button,background:"#164e63",color:"#cffafe"}}><RefreshCw size={16}/>{loading?"...":copy.refresh}</button></header>
    {error&&<div style={{...card,padding:15,color:"#fecaca",marginBottom:15}}>{error}</div>}
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14,marginBottom:15}}>
      <form onSubmit={submitAccount} style={{...card,padding:17}}><h3 style={{marginTop:0,color:"#67e8f9"}}>{copy.newAccount}</h3><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><input required placeholder={copy.account} value={accountForm.name} onChange={e=>setAccountForm({...accountForm,name:e.target.value})} style={input}/><input placeholder={copy.bank} value={accountForm.bank_name} onChange={e=>setAccountForm({...accountForm,bank_name:e.target.value})} style={input}/><input placeholder={copy.number} value={accountForm.account_number} onChange={e=>setAccountForm({...accountForm,account_number:e.target.value})} style={input}/><input type="number" placeholder={copy.opening} value={accountForm.opening_balance} onChange={e=>setAccountForm({...accountForm,opening_balance:Number(e.target.value)})} style={input}/></div><button style={{...button,background:"#166534",color:"#dcfce7",marginTop:9}}><Plus size={16}/>{copy.save}</button></form>
      <form onSubmit={submitLine} style={{...card,padding:17}}><h3 style={{marginTop:0,color:"#c4b5fd"}}>{copy.addLine}</h3><select value={accountId} onChange={e=>load(e.target.value)} style={{...input,width:"100%",marginBottom:8}}><option value="">{copy.account}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} — {a.bank_name}</option>)}</select><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><input required type="date" value={lineForm.transaction_date} onChange={e=>setLineForm({...lineForm,transaction_date:e.target.value})} style={input}/><input required type="number" step="0.01" placeholder={copy.amount} value={lineForm.amount} onChange={e=>setLineForm({...lineForm,amount:e.target.value})} style={input}/><input placeholder={copy.description} value={lineForm.description} onChange={e=>setLineForm({...lineForm,description:e.target.value})} style={input}/><input placeholder={copy.reference} value={lineForm.reference} onChange={e=>setLineForm({...lineForm,reference:e.target.value})} style={input}/></div><button disabled={!accountId} style={{...button,background:"#6d28d9",color:"#ede9fe",marginTop:9}}><Plus size={16}/>{copy.addLine}</button></form>
    </section>
    {summary&&<section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:15}}>{[[copy.statement,summary.statement.amount,"#67e8f9"],[copy.ledger,summary.ledger.amount,"#c4b5fd"],[copy.matched,summary.statement.matched_count,"#86efac"],[copy.unmatched,summary.statement.unmatched_count,"#fbbf24"],[copy.difference,summary.difference,summary.reconciled?"#86efac":"#fda4af"]].map(([label,value,color],i)=><div key={label} style={{...card,padding:15}}><div style={{color:"#94a3b8"}}>{label}</div><strong style={{display:"block",fontSize:20,color,marginTop:6}}>{i===2||i===3?n(value):money(value)}</strong></div>)}</section>}
    <section style={{...card,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:850}}><thead><tr>{[copy.date,copy.description,copy.reference,copy.amount,copy.matched,""].map(x=><th key={x} style={{padding:12,textAlign:"start",color:"#67e8f9"}}>{x}</th>)}</tr></thead><tbody>{!lines.length&&<tr><td colSpan={6} style={{padding:24,textAlign:"center",color:"#64748b"}}>{copy.noData}</td></tr>}{lines.map(line=><><tr key={line.id}>{[date(line.transaction_date),line.description||"—",line.reference||"—"].map((v,i)=><td key={i} style={{padding:12,borderTop:"1px solid rgba(148,163,184,.1)"}}>{v}</td>)}<td style={{padding:12,color:line.amount>=0?"#86efac":"#fda4af",fontWeight:900}}>{money(line.amount)}</td><td style={{padding:12,color:line.matched?"#86efac":"#fbbf24"}}>{line.matched?<><CheckCircle2 size={16}/> {line.voucher_no}</>:copy.unmatched}</td><td style={{padding:12,whiteSpace:"nowrap"}}>{line.matched?<button onClick={()=>unmatch(line.id)} style={{...button,background:"#78350f",color:"#fef3c7"}}><Unlink size={15}/>{copy.unmatch}</button>:<button onClick={()=>find(line)} style={{...button,background:"#164e63",color:"#cffafe"}}><Link2 size={15}/>{copy.find}</button>} <button onClick={()=>remove(line.id)} style={{...button,background:"#7f1d1d",color:"#fee2e2"}}><Trash2 size={15}/></button></td></tr>{candidates[line.id]?.length>0&&<tr key={line.id+"-matches"}><td colSpan={6} style={{padding:12,background:"rgba(8,47,73,.45)"}}>{candidates[line.id].slice(0,8).map(c=><button key={c.voucher_line_id} onClick={()=>match(line.id,c.voucher_line_id)} disabled={!c.exact_amount} style={{...button,margin:4,background:c.exact_amount?"#166534":"#334155",color:"white",opacity:c.exact_amount?1:.55}}>{copy.voucher} {c.voucher_no} — {date(c.voucher_date)} — {money(c.amount)}</button>)}</td></tr>}</>)}</tbody></table></section>
  </div>;
}
