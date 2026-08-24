import { API_URL, getAuthHeaders } from "./api";

export async function getDocumentOcrStatus() {
  const response = await fetch(`${API_URL}/api/document-ocr/status`, {
    headers: getAuthHeaders(),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || `API error ${response.status}`);
  return data;
}

export async function extractDocumentOcr(file) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_URL}/api/document-ocr/extract`, {
    method: "POST",
    headers: getAuthHeaders({}, false),
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || `API error ${response.status}`);
  return data;
}
