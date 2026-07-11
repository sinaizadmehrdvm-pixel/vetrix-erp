import { API_URL, getAuthHeaders } from "./api";

async function request(path) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: getAuthHeaders(),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok && response.status !== 503) {
    throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  }
  return data;
}

export const getSystemHealth = () => request("/api/system/health");
export const getSystemReadiness = () => request("/api/system/readiness");
