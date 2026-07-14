import { API_URL, getAuthHeaders } from "./api";

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${API_URL}/api/data-import${path}`, {
    ...options,
    headers: getAuthHeaders(options.headers),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}

export async function previewImport(entity, file) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_URL}/api/data-import/preview/${entity}`, {
    method: "POST",
    headers: getAuthHeaders({}, false),
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || `API error ${response.status}`);
  return data;
}
export const applyImport = (batchId) => jsonRequest(`/apply/${batchId}`, { method: "POST" });
export const getImportBatches = () => jsonRequest("/batches");
export async function downloadImportTemplate(entity, language) {
  const response = await fetch(`${API_URL}/api/data-import/template/${entity}?language=${language}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || "Template download failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vetrix_${entity}_import_${language}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
