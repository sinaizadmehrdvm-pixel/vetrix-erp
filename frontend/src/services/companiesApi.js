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

export const getCompanies = () => request("/api/companies");
export const createCompany = (name) =>
  request("/api/companies", { method: "POST", body: JSON.stringify({ name }) });
export const updateCompany = (companyId, data) =>
  request(`/api/companies/${companyId}`, { method: "PUT", body: JSON.stringify(data) });
export const switchCompany = (companyId) =>
  request("/api/companies/switch", { method: "POST", body: JSON.stringify({ company_id: companyId }) });
