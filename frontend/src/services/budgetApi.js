import { API_URL,getAuthHeaders } from "./api";
async function request(path,options={}){const {headers,...rest}=options;const r=await fetch(`${API_URL}/api/accounting/budgets${path}`,{...rest,headers:getAuthHeaders(headers)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.detail||d?.message||`API error ${r.status}`);return d}
export const getBudgetDimensions=()=>request("/dimensions");
export const createCostCenter=(data)=>request("/cost-centers",{method:"POST",body:JSON.stringify(data)});
export const createAccountingProject=(data)=>request("/projects",{method:"POST",body:JSON.stringify(data)});
export const saveBudgetLine=(data)=>request("/lines",{method:"POST",body:JSON.stringify(data)});
export const deleteBudgetLine=(id)=>request(`/lines/${id}`,{method:"DELETE"});
export const getBudgetVariance=(periodId,costCenterId="",projectId="")=>{const p=new URLSearchParams({fiscal_period_id:periodId});if(costCenterId)p.set("cost_center_id",costCenterId);if(projectId)p.set("project_id",projectId);return request(`/variance?${p}`)};
