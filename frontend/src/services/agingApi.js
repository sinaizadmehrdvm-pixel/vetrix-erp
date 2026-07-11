import { API_URL, getAuthHeaders } from "./api";

export async function getAgingReport({ asOf = "", termsDays = 30, includeSettled = false } = {}) {
  const params = new URLSearchParams({ terms_days: String(termsDays), include_settled: String(includeSettled) });
  if (asOf) params.set("as_of", asOf);
  const response = await fetch(`${API_URL}/api/accounting/aging?${params}`, { headers: getAuthHeaders() });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}
