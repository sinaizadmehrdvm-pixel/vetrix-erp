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

function queryString(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value != null),
  );
  return new URLSearchParams(clean).toString();
}

export function getAuditEvents(params = {}) {
  const query = queryString(params);
  return request(`/api/audit/events${query ? `?${query}` : ""}`);
}

export function getAuditIntegrity() {
  return request("/api/audit/integrity");
}
