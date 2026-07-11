import { API_URL,getAuthHeaders } from "./api";
async function request(path,options={}){const {headers,...rest}=options;const r=await fetch(`${API_URL}${path}`,{...rest,headers:getAuthHeaders(headers)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.detail||d?.message||`API error ${r.status}`);return d}
export const getApprovalRequests=(status="pending")=>request(`/api/accounting/approvals?status=${status}`);
export const getApprovalDetail=(id)=>request(`/api/accounting/approvals/${id}`);
export const getDraftVouchers=()=>request("/api/accounting/entries?status=draft&limit=200");
export const submitVoucherForApproval=(id)=>request(`/api/accounting/approvals/vouchers/${id}/submit`,{method:"POST"});
export const approveVoucher=(id,note="")=>request(`/api/accounting/approvals/${id}/approve`,{method:"POST",body:JSON.stringify({note})});
export const rejectVoucher=(id,note)=>request(`/api/accounting/approvals/${id}/reject`,{method:"POST",body:JSON.stringify({note})});
export const withdrawApproval=(id)=>request(`/api/accounting/approvals/${id}/withdraw`,{method:"POST"});
