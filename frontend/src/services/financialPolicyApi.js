import { API_URL, getAuthHeaders } from "./api";

async function request(path = "", options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(`${API_URL}/api/financial-policy${path}`, {
    ...rest,
    headers: getAuthHeaders(headers),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}

export const getFinancialPolicies = () => request();
export const getActiveFinancialPolicy = () => request("/active");
export const createFinancialPolicy = (payload) =>
  request("", { method: "POST", body: JSON.stringify(payload) });
export const activateFinancialPolicy = (policyId, note) =>
  request(`/${policyId}/activate`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
export const getFinancialPolicyEvents = (policyId) =>
  request(`/${policyId}/events`);
