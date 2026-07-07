import { API_URL } from "./api";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}

export const getAccountingChart = () => request("/api/accounting/chart");
export const getAccountingTree = () => request("/api/accounting/chart/tree");
export const getAccountingMeta = () => request("/api/accounting/meta");
export const seedAccountingChart = () => request("/api/accounting/seed", { method: "POST" });
export const createAccountingAccount = (data) => request("/api/accounting/chart", { method: "POST", body: JSON.stringify(data) });
export const updateAccountingAccount = (id, data) => request(`/api/accounting/chart/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const toggleAccountingAccount = (id) => request(`/api/accounting/chart/${id}/toggle`, { method: "POST" });
export const deleteAccountingAccount = (id) =>
  request(`/api/accounting/chart/${id}`, { method: "DELETE" });