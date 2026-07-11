import { API_URL, getAuthHeaders } from "./api";
async function request(path, options={}) {
  const {headers,...rest}=options;
  const response=await fetch(`${API_URL}/api/accounting/fixed-assets${path}`,{...rest,headers:getAuthHeaders(headers)});
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data?.detail||data?.message||`API error ${response.status}`);
  return data;
}
export const getFixedAssets=()=>request("");
export const getFixedAsset=(id)=>request(`/${id}`);
export const createFixedAsset=(data)=>request("",{method:"POST",body:JSON.stringify(data)});
export const deleteFixedAsset=(id)=>request(`/${id}`,{method:"DELETE"});
export const runAssetDepreciation=(data)=>request("/depreciation/run",{method:"POST",body:JSON.stringify(data)});
