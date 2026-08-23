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

export const getUsers = (companyId) =>
  request(companyId ? `/users?company_id=${companyId}` : "/users");
export const getRoles = () => request("/api/auth/roles");
export const getPermissions = () => request("/api/auth/permissions");
export const createUser = (data) =>
  request("/users", { method: "POST", body: JSON.stringify(data) });
export const updateUserRole = (id, role) =>
  request(`/users/${id}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
export const updateUserCompany = (id, companyId) =>
  request(`/users/${id}/company`, {
    method: "PUT",
    body: JSON.stringify({ company_id: companyId }),
  });
export const updateUserSuperAdmin = (id, isSuperAdmin) =>
  request(`/users/${id}/super-admin`, {
    method: "PUT",
    body: JSON.stringify({ is_super_admin: isSuperAdmin }),
  });

export const resetUserPassword = (id, data) =>
  request(`/users/${id}/password`, { method: "PUT", body: JSON.stringify(data) });
export const changeOwnPassword = (data) =>
  request("/users/me/password", { method: "PUT", body: JSON.stringify(data) });
export const updateMyProfile = (data) =>
  request("/users/me", { method: "PUT", body: JSON.stringify(data) });

export const getCustomRoles = () => request("/api/auth/custom-roles");
export const createCustomRole = (data) =>
  request("/api/auth/custom-roles", { method: "POST", body: JSON.stringify(data) });
export const deleteCustomRole = (id) =>
  request(`/api/auth/custom-roles/${id}`, { method: "DELETE" });
