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

function qs(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  return new URLSearchParams(clean).toString();
}

export const getAccountingVouchers = (params = {}) => {
  const query = qs(params);
  return request(`/api/accounting/entries${query ? `?${query}` : ""}`);
};

export const createAccountingVoucher = (data) => request("/api/accounting/entries", { method: "POST", body: JSON.stringify(data) });
export const postAccountingVoucher = (id) => request(`/api/accounting/entries/${id}/post`, { method: "POST" });
export const cancelAccountingVoucher = (id) => request(`/api/accounting/entries/${id}/cancel`, { method: "POST" });
export const deleteAccountingVoucher = (id) => request(`/api/accounting/entries/${id}`, { method: "DELETE" });

export const getAccountingSummary = (params = {}) => {
  const query = qs(params);
  return request(`/api/accounting/entries/reports/summary${query ? `?${query}` : ""}`);
};

export const getAccountingJournal = (params = {}) => {
  const query = qs(params);
  return request(`/api/accounting/entries/reports/journal${query ? `?${query}` : ""}`);
};

export const getAccountingLedger = (params = {}) => {
  const query = qs(params);
  return request(`/api/accounting/entries/reports/ledger${query ? `?${query}` : ""}`);
};

export const getAccountingTrialBalance = (params = {}) => {
  const query = qs(params);
  return request(`/api/accounting/entries/reports/trial-balance${query ? `?${query}` : ""}`);
};
