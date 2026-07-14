const runtimeApiUrl = `${window.location.protocol}//${window.location.hostname}:8001`;
const API_URL = import.meta.env.VITE_API_URL || runtimeApiUrl;

export function getAuthHeaders(headers = {}, includeJsonContentType = true) {
  const token = localStorage.getItem("vetrix_access_token");
  return {
    ...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
}

function resolveApiResource(urlOrPath) {
  return /^https?:\/\//i.test(urlOrPath) ? urlOrPath : `${API_URL}${urlOrPath}`;
}

export async function fetchAuthenticatedResource(urlOrPath, options = {}) {
  const { headers, ...requestOptions } = options;
  const response = await fetch(resolveApiResource(urlOrPath), {
    ...requestOptions,
    headers: getAuthHeaders(headers, false),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  }
  return response;
}

export async function openAuthenticatedDocument(urlOrPath) {
  const popup = window.open("", "_blank");
  try {
    const response = await fetchAuthenticatedResource(urlOrPath);
    const objectUrl = URL.createObjectURL(await response.blob());

    if (popup) {
      popup.location.replace(objectUrl);
    } else {
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}

export async function downloadAuthenticatedFile(urlOrPath, filename) {
  const response = await fetchAuthenticatedResource(urlOrPath);
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function request(path, options = {}) {
  const { headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: getAuthHeaders(headers),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.detail || `API error ${response.status}`);
  }

  if (data?.status === "error") {
    throw new Error(data?.message || "Server error");
  }

  return data;
}

export async function getCustomers() { return await request("/customers"); }
export async function getCustomer(id) { return await request(`/customers/${id}`); }
export async function getCustomerLedger(id) { return await request(`/customers/${id}/ledger`); }
export async function createCustomer(data) { return await request("/customers", { method: "POST", body: JSON.stringify(data) }); }
export async function updateCustomer(id, data) { return await request(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteCustomer(id) { return await request(`/customers/${id}`, { method: "DELETE" }); }

export async function getProducts() { return await request("/products"); }
export async function createProduct(data) { return await request("/products", { method: "POST", body: JSON.stringify(data) }); }
export async function updateProduct(id, data) { return await request(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteProduct(id) { return await request(`/products/${id}`, { method: "DELETE" }); }

export async function getInvoices() { return await request("/invoices"); }
export async function getInvoice(id) { return await request(`/invoices/${id}`); }
export async function createInvoice(data) { return await request("/invoices", { method: "POST", body: JSON.stringify(data) }); }
export async function updateInvoice(id, data) { return await request(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteInvoice(id) { return await request(`/invoices/${id}`, { method: "DELETE" }); }
export async function getInvoicePrint(id) { return await request(`/print/invoice/${id}`); }
export async function convertProformaToInvoice(invoiceId) {
  return await request(`/invoices/${invoiceId}/convert`, { method: "POST" });
}

export async function getTransactions() { return await request("/transactions"); }
export async function createTransaction(data) { return await request("/transactions", { method: "POST", body: JSON.stringify(data) }); }
export async function updateTransaction(id, data) { return await request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteTransaction(id) { return await request(`/transactions/${id}`, { method: "DELETE" }); }
export async function getTransactionPrint(id) { return await request(`/print/transaction/${id}`); }
export async function getReceiptPrint(id) { return await request(`/print/receipt/${id}`); }

export async function getExpenses() { return await request("/expenses"); }
export async function createExpense(data) { return await request("/expenses", { method: "POST", body: JSON.stringify(data) }); }
export async function deleteExpense(id) { return await request(`/expenses/${id}`, { method: "DELETE" }); }

export async function getStockMovements() { return await request("/stock-movements"); }
export async function createStockMovement(data) { return await request("/stock-movements", { method: "POST", body: JSON.stringify(data) }); }

export async function getDashboardStats() { return await request("/dashboard-stats"); }
export async function resetAccountingData() { return await request("/admin/reset-accounting-data", { method: "DELETE" }); }

export async function getReportsOverview() { return await request("/reports/overview"); }
export async function getProfitLossReport() { return await request("/reports/profit-loss"); }
export async function getTrialBalanceReport() { return await request("/reports/trial-balance"); }
export async function getOpenInvoicesReport() { return await request("/reports/open-invoices"); }
export async function getCashflowReport() { return await request("/reports/cashflow"); }
export async function getTopCustomersReport() { return await request("/reports/top-customers"); }
export async function getInventoryReport() { return await request("/reports/inventory"); }
export async function getSalesReport() { return await request("/reports/sales"); }
export async function getPurchasesReport() { return await request("/reports/purchases"); }
export async function getReportsCharts() { return await request("/reports/charts"); }
export async function getProductProfitReport() { return await request("/reports/product-profit"); }
export async function getCustomerBalanceReport() { return await request("/reports/customer-balances"); }
export async function getInventoryMovementReport() { return await request("/reports/inventory-movements"); }

export async function getPdfTemplates() {
  const res = await fetch(`${API_URL}/designer/templates`, { headers: getAuthHeaders() });
  return await res.json();
}

export async function savePdfTemplate(payload) {
  const res = await fetch(`${API_URL}/designer/template`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return await res.json();
}

export async function deletePdfTemplate(id) {
  const res = await fetch(`${API_URL}/designer/template/${id}`, { method: "DELETE", headers: getAuthHeaders() });
  return await res.json();
}

// Vetrix CRM API - Enterprise Customer 360
export async function getCrmDashboard() { return await request(`/api/crm/dashboard`); }
export async function getCrmCustomer360(id) { return await request(`/api/crm/customers/${id}`); }
export async function getCrmCustomerProfile(id) { return await request(`/api/crm/customers/${id}/profile`); }
export async function getCrmCustomerTimeline(id) { return await request(`/api/crm/customers/${id}/timeline`); }
export async function getCrmCustomerAi(id) { return await request(`/api/crm/customers/${id}/ai`); }
export async function getCrmNotes(customerId) { return await request(`/api/crm/customers/${customerId}/notes`); }
export async function createCrmNote(customerId, data) { return await request(`/api/crm/customers/${customerId}/notes`, { method: "POST", body: JSON.stringify(data) }); }
export async function deleteCrmNote(noteId) { return await request(`/api/crm/notes/${noteId}`, { method: "DELETE" }); }
export async function getCrmTasks(customerId) { return await request(`/api/crm/customers/${customerId}/tasks`); }
export async function createCrmTask(customerId, data) { return await request(`/api/crm/customers/${customerId}/tasks`, { method: "POST", body: JSON.stringify(data) }); }
export async function updateCrmTask(taskId, data) { return await request(`/api/crm/tasks/${taskId}`, { method: "PUT" , body: JSON.stringify(data) }); }
export async function deleteCrmTask(taskId) { return await request(`/api/crm/tasks/${taskId}`, { method: "DELETE" }); }
export async function getCrmInteractions(customerId) { return await request(`/api/crm/customers/${customerId}/interactions`); }
export async function createCrmInteraction(customerId, data) { return await request(`/api/crm/customers/${customerId}/interactions`, { method: "POST", body: JSON.stringify(data) }); }

// Vetrix AI Business Intelligence API
export async function getAiBiSummary() { return await request(`/api/ai-bi/summary`); }
export async function getAiBiAlerts() { return await request(`/api/ai-bi/alerts`); }
export async function getAiBiRecommendations() { return await request(`/api/ai-bi/recommendations`); }

// Vetrix Smart Inventory API - Enterprise Phase 2
export async function getSmartInventoryOverview(params = {}) {
  const q = new URLSearchParams(params).toString();
  return await request(`/api/smart-inventory/overview${q ? `?${q}` : ""}`);
}

export async function getSmartInventoryReorderPlan(params = {}) {
  const q = new URLSearchParams(params).toString();
  return await request(`/api/smart-inventory/reorder-plan${q ? `?${q}` : ""}`);
}

export async function getSmartInventoryProductInsight(productId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return await request(`/api/smart-inventory/product/${productId}/insight${q ? `?${q}` : ""}`);
}

export async function getCrmCustomerLoyalty(id) { return await request(`/api/crm/customers/${id}/loyalty`); }
export async function redeemCrmCustomerPoints(id, data) { return await request(`/api/crm/customers/${id}/loyalty/redeem`, { method: "POST", body: JSON.stringify(data) }); }

export { API_URL };
