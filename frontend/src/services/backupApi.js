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

// Automated Backup Delivery (Task 04, Section 19)
export const getBackupDeliveryPolicies = () => request("/api/backup-delivery/policies");
export const createBackupDeliveryPolicy = (data) =>
  request("/api/backup-delivery/policies", { method: "POST", body: JSON.stringify(data) });
export const updateBackupDeliveryPolicy = (id, data) =>
  request(`/api/backup-delivery/policies/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteBackupDeliveryPolicy = (id) =>
  request(`/api/backup-delivery/policies/${id}`, { method: "DELETE" });
export const runBackupDeliveryPolicyNow = (id) =>
  request(`/api/backup-delivery/policies/${id}/run-now`, { method: "POST" });
export const getBackupDeliveryLog = () => request("/api/backup-delivery/log");
