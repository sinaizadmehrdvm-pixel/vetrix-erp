import { API_URL,getAuthHeaders } from "./api";
async function request(path,options={}){const {headers,...rest}=options;const r=await fetch(`${API_URL}/api/accounting/treasury${path}`,{...rest,headers:getAuthHeaders(headers)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.detail||d?.message||`API error ${r.status}`);return d}
export const getCheques=(direction="all",status="all",upcomingDays=30)=>request(`/cheques?direction=${direction}&status=${status}&upcoming_days=${upcomingDays}`);
export const createCheque=(data)=>request("/cheques",{method:"POST",body:JSON.stringify(data)});
export const transitionCheque=(id,data)=>request(`/cheques/${id}/transition`,{method:"POST",body:JSON.stringify(data)});
export const deleteCheque=(id)=>request(`/cheques/${id}`,{method:"DELETE"});
