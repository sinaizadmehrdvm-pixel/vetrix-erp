import { API_URL, getAuthHeaders } from "./api";

async function request(path, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(`${API_URL}/api/accounting/bank-reconciliation${path}`, {
    ...rest, headers: getAuthHeaders(headers),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}
export const getBankAccounts = () => request("/accounts");
export const createBankAccount = (data) => request("/accounts", { method: "POST", body: JSON.stringify(data) });
export const deleteBankAccount = (id) => request(`/accounts/${id}`, { method: "DELETE" });
export const getBankStatement = (id) => request(`/accounts/${id}/statement`);
export const addBankStatementLine = (id, data) => request(`/accounts/${id}/statement`, { method: "POST", body: JSON.stringify(data) });
export const deleteBankStatementLine = (id) => request(`/statement/${id}`, { method: "DELETE" });
export const getBankCandidates = (accountId, statementId) => request(`/accounts/${accountId}/candidates?statement_line_id=${statementId}`);
export const matchBankStatementLine = (statementId, voucherLineId) => request(`/statement/${statementId}/match`, { method: "POST", body: JSON.stringify({ voucher_line_id: voucherLineId }) });
export const unmatchBankStatementLine = (statementId) => request(`/statement/${statementId}/match`, { method: "DELETE" });
export const getBankReconciliationSummary = (id) => request(`/accounts/${id}/summary`);
