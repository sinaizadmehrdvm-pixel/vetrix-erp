import { API_URL,getAuthHeaders } from "./api";
async function request(path,options={}){const {headers,...rest}=options;const r=await fetch(`${API_URL}/api/accounting/currencies${path}`,{...rest,headers:getAuthHeaders(headers)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.detail||d?.message||`API error ${r.status}`);return d}
export const getCurrencies=(asOf="")=>request(asOf?`?as_of=${asOf}`:"");
export const createCurrency=(data)=>request("",{method:"POST",body:JSON.stringify(data)});
export const setExchangeRate=(data)=>request("/rates",{method:"POST",body:JSON.stringify(data)});
export const getCurrencyRates=(code)=>request(`/${code}/rates`);
export const getForeignCurrencyBalances=(periodId="",asOf="")=>{const p=new URLSearchParams();if(periodId)p.set("fiscal_period_id",periodId);if(asOf)p.set("as_of",asOf);return request(`/reports/balances?${p}`)};
