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

export const getTotpStatus = () => request("/api/auth/totp/status");
export const setupTotp = () => request("/api/auth/totp/setup", { method: "POST" });
export const verifyTotp = (code) =>
  request("/api/auth/totp/verify", { method: "POST", body: JSON.stringify({ code }) });
export const disableTotp = (password, code) =>
  request("/api/auth/totp/disable", { method: "POST", body: JSON.stringify({ password, code }) });
