import { request } from "./api";

export const listFieldVisits = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ).toString();
  return request(query ? `/api/field-visits?${query}` : "/api/field-visits");
};

export const createFieldVisit = (data) =>
  request("/api/field-visits", { method: "POST", body: JSON.stringify(data) });
