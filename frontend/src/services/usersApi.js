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

export const getUsers = () => request("/users");
export const getRoles = () => request("/api/auth/roles");
export const getPermissions = () => request("/api/auth/permissions");
export const createUser = (data) =>
  request("/users", { method: "POST", body: JSON.stringify(data) });
export const updateUserRole = (id, role) =>
  request(`/users/${id}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });

export const resetUserPassword = (id, data) =>
  request(`/users/${id}/password`, { method: "PUT", body: JSON.stringify(data) });
export const changeOwnPassword = (data) =>
  request("/users/me/password", { method: "PUT", body: JSON.stringify(data) });
