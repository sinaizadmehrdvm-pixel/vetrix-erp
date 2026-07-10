import { API_URL, getAuthHeaders } from "./api";

async function request(path, options = {}) {
  const { headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: getAuthHeaders(headers),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}

const BASE = "/api/accounting/entries";

export const getAccountingChart = () => request(`${BASE}/chart`);
export const getAccountingTree = () => request(`${BASE}/chart/tree`);
export const getAccountingMeta = () => request(`${BASE}/meta`);
export const seedAccountingChart = () => request(`${BASE}/seed`, { method: "POST" });
export const createAccountingAccount = (data) => request(`${BASE}/chart`, { method: "POST", body: JSON.stringify(data) });
export const updateAccountingAccount = (id, data) => request(`${BASE}/chart/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const toggleAccountingAccount = (id) => request(`${BASE}/chart/${id}/toggle`, { method: "POST" });
export const deleteAccountingAccount = (id) => request(`${BASE}/chart/${id}`, { method: "DELETE" });
