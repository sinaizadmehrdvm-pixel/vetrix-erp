import {
  API_URL,
  downloadAuthenticatedFile,
  getAuthHeaders,
} from "./api";

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

export const getBackups = (verify = false) =>
  request(`/api/backups${verify ? "?verify=true" : ""}`);
export const createBackup = () =>
  request("/api/backups", { method: "POST" });
export const verifyBackup = (filename) =>
  request(`/api/backups/${encodeURIComponent(filename)}/verify`);
export const testRestoreBackup = (filename) =>
  request(`/api/backups/${encodeURIComponent(filename)}/restore-test`, {
    method: "POST",
  });
export const restoreBackup = (filename, confirmation) =>
  request(`/api/backups/${encodeURIComponent(filename)}/restore`, {
    method: "POST",
    body: JSON.stringify({ confirmation }),
  });
export const deleteBackup = (filename) =>
  request(`/api/backups/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
export const downloadBackup = (filename) =>
  downloadAuthenticatedFile(
    `/api/backups/${encodeURIComponent(filename)}/download`,
    filename,
  );
