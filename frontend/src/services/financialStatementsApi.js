import { API_URL, getAuthHeaders } from "./api";

async function request(path) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: getAuthHeaders(),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  }
  return data;
}

export function getFinancialStatements(fiscalPeriodId = "") {
  const query = fiscalPeriodId
    ? `?fiscal_period_id=${encodeURIComponent(fiscalPeriodId)}`
    : "";
  return request(`/api/accounting/statements${query}`);
}
