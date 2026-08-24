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

export function getFinancialStatements(fiscalPeriodId = "", startDate = "", endDate = "") {
  const params = new URLSearchParams();
  if (fiscalPeriodId) params.set("fiscal_period_id", fiscalPeriodId);
  if (!fiscalPeriodId && startDate) params.set("start_date", startDate);
  if (!fiscalPeriodId && endDate) params.set("end_date", endDate);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/api/accounting/statements${query}`);
}
