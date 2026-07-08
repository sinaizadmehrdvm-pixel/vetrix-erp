
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

export const getAccountingVouchers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/accounting/entries${qs ? `?${qs}` : ""}`);
};
export const createAccountingVoucher = (data) => request("/api/accounting/entries", { method: "POST", body: JSON.stringify(data) });
export const postAccountingVoucher = (id) => request(`/api/accounting/entries/${id}/post`, { method: "POST" });
export const cancelAccountingVoucher = (id) => request(`/api/accounting/entries/${id}/cancel`, { method: "POST" });
export const deleteAccountingVoucher = (id) => request(`/api/accounting/entries/${id}`, { method: "DELETE" });
export const getAccountingJournal = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/accounting/entries/reports/journal${qs ? `?${qs}` : ""}`);
};
