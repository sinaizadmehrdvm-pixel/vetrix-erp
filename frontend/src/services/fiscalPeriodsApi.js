import { API_URL, getAuthHeaders } from "./api";

async function request(path, options = {}) {
  const { headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: getAuthHeaders(headers),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  }
  return data;
}

export const getFiscalPeriods = () => request("/api/accounting/periods");

export const createFiscalPeriod = (data) =>
  request("/api/accounting/periods", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const closeFiscalPeriod = (id) =>
  request(`/api/accounting/periods/${id}/close`, { method: "POST" });

export const reopenFiscalPeriod = (id) =>
  request(`/api/accounting/periods/${id}/reopen`, { method: "POST" });

export const getFiscalClosingPreview = (id) =>
  request(`/api/accounting/periods/${id}/close-preview`);
