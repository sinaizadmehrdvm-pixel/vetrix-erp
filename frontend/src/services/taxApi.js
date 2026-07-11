import { API_URL, getAuthHeaders } from "./api";

export async function getVatReport(fiscalPeriodId = "") {
  const query = fiscalPeriodId ? `?fiscal_period_id=${encodeURIComponent(fiscalPeriodId)}` : "";
  const response = await fetch(`${API_URL}/api/accounting/tax${query}`, {
    headers: getAuthHeaders(),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}
