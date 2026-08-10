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

export async function request(path, options = {}) {
  const { headers, ...requestOptions } = options;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      headers: getAuthHeaders(headers),
    });
  } catch (networkError) {
    // fetch() itself threw before any response arrived (offline, DNS
    // failure, server not running). This is the only case a caller should
    // treat as "queue for offline retry" - see isNetworkError below. Once a
    // response comes back at all (403, 400, 404, a soft {status:"error"}
    // body, ...) the server was reached and rejected the request for a
    // reason that will not change on blind retry, so it must surface as a
    // real error instead of silently vanishing into an offline queue that
    // keeps failing forever.
    const error = new Error(networkError?.message || "Network error");
    error.isNetworkError = true;
    throw error;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || data?.detail || `API error ${response.status}`);
    error.status = response.status;
    throw error;
  }

  if (data?.status === "error") {
    const error = new Error(data?.message || "Server error");
    error.status = response.status;
    throw error;
  }

  return data;
}

// True only when the request never reached the server at all (see request()
// above) - the one case where offline-queueing a create/update for later
// retry is actually correct. Any error with an HTTP status (403, 400, a
// soft {status:"error"} body, ...) means the server rejected the request
// for a reason retrying won't fix, and must be shown to the user instead.
export function isNetworkError(error) {
  return Boolean(error?.isNetworkError);
}

export async function getCustomers(assignedRepId) {
  return await request(assignedRepId ? `/customers?assigned_rep_id=${encodeURIComponent(assignedRepId)}` : "/customers");
}
export async function getCustomer(id) { return await request(`/customers/${id}`); }
export async function getCustomerLedger(id) { return await request(`/customers/${id}/ledger`); }
export async function createCustomer(data) { return await request("/customers", { method: "POST", body: JSON.stringify(data) }); }
export async function getCustomerLoyalty(customerId) { return await request(`/customers/${customerId}/loyalty`); }
export async function updateCustomer(id, data) { return await request(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteCustomer(id) { return await request(`/customers/${id}`, { method: "DELETE" }); }

async function requestBlob(path, options = {}) {
  const { headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: getAuthHeaders(headers, true),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  }
  return response.blob();
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportCustomersListPdf(payload, filename) {
  const blob = await requestBlob("/export/customers/list-pdf", { method: "POST", body: JSON.stringify(payload) });
  triggerBlobDownload(blob, filename || "vetrix-customers.pdf");
}
export async function exportCustomersListExcel(payload, filename) {
  const blob = await requestBlob("/export/customers/list-excel", { method: "POST", body: JSON.stringify(payload) });
  triggerBlobDownload(blob, filename || "vetrix-customers.xlsx");
}
export async function exportCustomerProfilePdf(payload, filename) {
  const blob = await requestBlob("/export/customers/profile-pdf", { method: "POST", body: JSON.stringify(payload) });
  triggerBlobDownload(blob, filename || "vetrix-customer-profile.pdf");
}

export async function getProducts(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ).toString();
  return await request(query ? `/products?${query}` : "/products");
}
export async function lookupProductByCode(code) {
  return await request(`/products/lookup?code=${encodeURIComponent(code)}`);
}
export async function createProduct(data) { return await request("/products", { method: "POST", body: JSON.stringify(data) }); }
export async function updateProduct(id, data) { return await request(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteProduct(id) { return await request(`/products/${id}`, { method: "DELETE" }); }

export async function getSettings() { return await request("/settings"); }

export async function getMessageTemplates() { return await request("/api/message-templates"); }
export async function updateMessageTemplate(key, channel, language, data) {
  return await request(`/api/message-templates/${key}/${channel}/${language}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function resetMessageTemplate(key, channel, language) {
  return await request(`/api/message-templates/${key}/${channel}/${language}/reset`, { method: "POST" });
}
export async function getMessageTemplateEditors() { return await request("/api/message-templates/editors"); }
export async function grantMessageTemplateEditor(userId) {
  return await request("/api/message-templates/editors", { method: "POST", body: JSON.stringify({ user_id: userId }) });
}
export async function revokeMessageTemplateEditor(userId) {
  return await request(`/api/message-templates/editors/${userId}`, { method: "DELETE" });
}
export async function getProductCategories() { return await request("/product-categories"); }
export async function createProductCategory(data) { return await request("/product-categories", { method: "POST", body: JSON.stringify(data) }); }
export async function deleteProductCategory(id) { return await request(`/product-categories/${id}`, { method: "DELETE" }); }
export async function updateProductCategory(id, data) { return await request(`/product-categories/${id}`, { method: "PUT", body: JSON.stringify(data) }); }

export async function getInvoices() { return await request("/invoices"); }
export async function getInvoice(id) { return await request(`/invoices/${id}`); }
export async function createInvoice(data, idempotencyKey) {
  return await request("/invoices", {
    method: "POST",
    body: JSON.stringify(data),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  });
}
export async function updateInvoice(id, data) { return await request(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteInvoice(id) { return await request(`/invoices/${id}`, { method: "DELETE" }); }
export async function voidInvoicePaymentAllocation(allocationId, reason) {
  return await request(`/api/invoice-payments/${allocationId}/void`, { method: "POST", body: JSON.stringify({ reason }) });
}
export async function refundInvoicePaymentAllocation(allocationId, payload) {
  return await request(`/api/invoice-payments/${allocationId}/refund`, { method: "POST", body: JSON.stringify(payload) });
}
export async function listPendingApprovals(status = "pending") {
  return await request(`/api/approvals?status=${encodeURIComponent(status)}`);
}
export async function getApprovalDetail(id) { return await request(`/api/approvals/${id}`); }
export async function approveApprovalRequest(id, note = "") {
  return await request(`/api/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
}
export async function rejectApprovalRequest(id, note) {
  return await request(`/api/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
}
export async function withdrawApprovalRequest(id) {
  return await request(`/api/approvals/${id}/withdraw`, { method: "POST" });
}
export async function getApprovalsDashboardSummary() { return await request("/api/approvals/dashboard-summary"); }
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

export async function getPdfTemplates(kind = "invoice") {
  const res = await fetch(`${API_URL}/designer/templates?kind=${encodeURIComponent(kind)}`, { headers: getAuthHeaders() });
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

export async function renamePdfTemplate(id, name) {
  const res = await fetch(`${API_URL}/designer/template/${id}/rename`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });
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

// Executive Alerts / Daily Situation Review
export async function getExecutiveAlertsSummary() { return await request("/api/executive-alerts/summary"); }
export async function getExecutiveAlertSettings() { return await request("/api/executive-alerts/settings"); }
export async function updateExecutiveAlertSettings(data) {
  return await request("/api/executive-alerts/settings", { method: "PUT", body: JSON.stringify(data) });
}

// Vetrix AI Business Intelligence API
export async function getAiBiSummary() { return await request(`/api/ai-bi/summary`); }
export async function getAiBiAlerts() { return await request(`/api/ai-bi/alerts`); }
export async function getAiBiRecommendations() { return await request(`/api/ai-bi/recommendations`); }
export async function getAiBiAnomalies() { return await request(`/api/ai-bi/anomalies`); }
export async function getAiBiCashflowForecast(days = 30) {
  return await request(`/api/ai-bi/cashflow-forecast?days=${days}`);
}

// Customer self-service portal (staff-side management)
export async function getCustomerPortalStatus(customerId) {
  return await request(`/api/customer-portal/${customerId}/status`);
}
export async function createCustomerPortalLink(customerId) {
  return await request(`/api/customer-portal/${customerId}/access-link`, { method: "POST" });
}
export async function revokeCustomerPortalAccess(customerId) {
  return await request(`/api/customer-portal/${customerId}/revoke`, { method: "POST" });
}

// Supplier self-service portal (staff-side management)
export async function getSupplierPortalStatus(customerId) {
  return await request(`/api/supplier-portal/${customerId}/status`);
}
export async function createSupplierPortalLink(customerId) {
  return await request(`/api/supplier-portal/${customerId}/access-link`, { method: "POST" });
}
export async function revokeSupplierPortalAccess(customerId) {
  return await request(`/api/supplier-portal/${customerId}/revoke`, { method: "POST" });
}

// Recurring / subscription invoices
export async function getRecurringInvoices() { return await request("/api/recurring-invoices"); }
export async function createRecurringInvoice(data) {
  return await request("/api/recurring-invoices", { method: "POST", body: JSON.stringify(data) });
}
export async function pauseRecurringInvoice(id) {
  return await request(`/api/recurring-invoices/${id}/pause`, { method: "POST" });
}
export async function resumeRecurringInvoice(id) {
  return await request(`/api/recurring-invoices/${id}/resume`, { method: "POST" });
}
export async function deleteRecurringInvoice(id) {
  return await request(`/api/recurring-invoices/${id}`, { method: "DELETE" });
}

// Online payment gateway (staff-triggered; the customer-portal's own
// self-service payment call uses a portal token, not the staff auth
// header this helper attaches, so it's made directly in CustomerPortalView.jsx)
export async function requestInvoicePaymentLink(invoiceId) {
  return await request(`/api/payments/invoices/${invoiceId}/request`, { method: "POST" });
}
export async function getInvoicePaymentShareLink(invoiceId) {
  return await request(`/api/payments/invoices/${invoiceId}/share`);
}
export async function sendInvoicePaymentLinkSms(invoiceId) {
  return await request(`/api/payments/invoices/${invoiceId}/send-sms`, { method: "POST" });
}
export async function sendInvoicePaymentLinkTelegram(invoiceId) {
  return await request(`/api/payments/invoices/${invoiceId}/send-telegram`, { method: "POST" });
}
export async function sendInvoicePaymentLinkWhatsappAuto(invoiceId) {
  return await request(`/api/payments/invoices/${invoiceId}/send-whatsapp-auto`, { method: "POST" });
}

// Payment provider/adapter configuration (Settings > Payment Integrations)
export async function getPaymentProviders() {
  return await request(`/api/payment-providers`);
}
export async function savePaymentProvider(data) {
  return await request(`/api/payment-providers`, { method: "POST", body: JSON.stringify(data) });
}
export async function resetPaymentProvider(providerKey) {
  return await request(`/api/payment-providers/${encodeURIComponent(providerKey)}`, { method: "DELETE" });
}

// Modular per-industry invoice fields (Phase 2)
export async function getIndustryFieldDefinitions() {
  return await request(`/api/industry-fields/definitions`);
}

// Iran e-invoice (INTA/Modian) submission
export async function submitInvoiceEinvoice(invoiceId) {
  return await request(`/api/einvoice/invoices/${invoiceId}/submit`, { method: "POST" });
}
export async function getEinvoiceStatus(invoiceId) {
  return await request(`/api/einvoice/invoices/${invoiceId}/status`);
}

// Automated overdue payment reminders
export async function getPaymentReminderStatus() { return await request("/api/payment-reminders/status"); }
export async function getOverdueInvoices() { return await request("/api/payment-reminders/overdue"); }
export async function getPaymentReminderLog() { return await request("/api/payment-reminders/log"); }
export async function sendPaymentReminderNow(invoiceId) {
  return await request(`/api/payment-reminders/send/${invoiceId}`, { method: "POST" });
}
export async function getWhatsappReminderLink(invoiceId) {
  return await request(`/api/payment-reminders/whatsapp-link/${invoiceId}`);
}

// Scheduled report delivery
export async function getReportSchedules() { return await request("/api/report-delivery/schedules"); }
export async function createReportSchedule(data) {
  return await request("/api/report-delivery/schedules", { method: "POST", body: JSON.stringify(data) });
}
export async function toggleReportSchedule(id) {
  return await request(`/api/report-delivery/schedules/${id}/toggle`, { method: "POST" });
}
export async function deleteReportSchedule(id) {
  return await request(`/api/report-delivery/schedules/${id}`, { method: "DELETE" });
}

// Sales reps (non-admin-gated, minimal fields - for customer assignment dropdowns)
export async function getSalesReps() { return await request("/api/sales-reps"); }

// Serial/batch/expiry tracking
export async function getProductBatches(productId) { return await request(`/api/product-batches/product/${productId}`); }
export async function createProductBatch(productId, data) {
  return await request(`/api/product-batches/product/${productId}`, { method: "POST", body: JSON.stringify(data) });
}
export async function consumeProductBatch(id, quantity) {
  return await request(`/api/product-batches/${id}/consume`, { method: "POST", body: JSON.stringify({ quantity }) });
}
export async function deleteProductBatch(id) { return await request(`/api/product-batches/${id}`, { method: "DELETE" }); }
export async function getExpiringBatches(days) { return await request(`/api/product-batches/expiring?days=${days || 30}`); }
export async function lookupProductBatch(batchNumber) { return await request(`/api/product-batches/lookup/${encodeURIComponent(batchNumber)}`); }

// Multi-branch / multi-warehouse inventory
export async function getWarehouses() { return await request("/api/warehouses"); }
export async function createWarehouse(data) {
  return await request("/api/warehouses", { method: "POST", body: JSON.stringify(data) });
}
export async function deactivateWarehouse(id) {
  return await request(`/api/warehouses/${id}/deactivate`, { method: "POST" });
}
export async function getWarehouseStockBreakdown(productId) {
  return await request(`/api/warehouses/stock?product_id=${productId}`);
}
export async function getWarehouseProducts(warehouseId) {
  return await request(`/api/warehouses/${warehouseId}/products`);
}
export async function transferWarehouseStock(data) {
  return await request("/api/warehouses/transfer", { method: "POST", body: JSON.stringify(data) });
}
export async function updateWarehouse(id, data) {
  return await request(`/api/warehouses/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function activateWarehouse(id) {
  return await request(`/api/warehouses/${id}/activate`, { method: "POST" });
}

// Branches
export async function getBranches(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await request(`/api/branches${qs ? `?${qs}` : ""}`);
}
export async function getBranch(id) { return await request(`/api/branches/${id}`); }
export async function createBranch(data) {
  return await request("/api/branches", { method: "POST", body: JSON.stringify(data) });
}
export async function updateBranch(id, data) {
  return await request(`/api/branches/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function deactivateBranch(id) {
  return await request(`/api/branches/${id}/deactivate`, { method: "POST" });
}
export async function activateBranch(id) {
  return await request(`/api/branches/${id}/activate`, { method: "POST" });
}

// Purchase orders
export async function getPurchaseOrders() { return await request("/api/purchase-orders"); }
export async function getPurchaseOrder(id) { return await request(`/api/purchase-orders/${id}`); }
export async function createPurchaseOrder(data) {
  return await request("/api/purchase-orders", { method: "POST", body: JSON.stringify(data) });
}
export async function dispatchPurchaseOrder(id, data) {
  return await request(`/api/purchase-orders/${id}/dispatch`, { method: "POST", body: JSON.stringify(data) });
}
export async function getPurchaseOrderDispatchLog(id) { return await request(`/api/purchase-orders/${id}/dispatch-log`); }
export async function cancelPurchaseOrder(id) { return await request(`/api/purchase-orders/${id}/cancel`, { method: "POST" }); }
export async function receivePurchaseOrder(id) { return await request(`/api/purchase-orders/${id}/receive`, { method: "POST" }); }

// Sales pipeline
export async function getPipelineDeals() { return await request("/crm/pipeline/deals"); }
export async function createPipelineDeal(data) {
  return await request("/crm/pipeline/deals", { method: "POST", body: JSON.stringify(data) });
}
export async function updatePipelineDeal(id, data) {
  return await request(`/crm/pipeline/deals/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function deletePipelineDeal(id) {
  return await request(`/crm/pipeline/deals/${id}`, { method: "DELETE" });
}

// Accounting attachments (vouchers / expenses / cheques / fixed assets)
export async function getAccountingAttachments(entityType, entityId) {
  return await request(`/api/accounting/attachments/${entityType}/${entityId}`);
}
export async function uploadAccountingAttachment(entityType, entityId, file, title = "") {
  const body = new FormData();
  body.append("file", file);
  if (title) body.append("title", title);
  const response = await fetch(`${API_URL}/api/accounting/attachments/${entityType}/${entityId}`, {
    method: "POST",
    headers: getAuthHeaders({}, false),
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `API error ${response.status}`);
  return data;
}
export async function deleteAccountingAttachment(id) {
  return await request(`/api/accounting/attachments/file/${id}`, { method: "DELETE" });
}
export function accountingAttachmentDownloadUrl(id) {
  return `${API_URL}/api/accounting/attachments/file/${id}/download`;
}

// Digital & print product catalog
export async function getCatalogLinks(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await request(`/api/catalog/links${qs ? `?${qs}` : ""}`);
}
export async function createCatalogLink(data) {
  return await request(`/api/catalog/links`, { method: "POST", body: JSON.stringify(data) });
}
export async function updateCatalogLink(id, data) {
  return await request(`/api/catalog/links/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function duplicateCatalogLink(id) {
  return await request(`/api/catalog/links/${id}/duplicate`, { method: "POST" });
}
export async function archiveCatalogLink(id) {
  return await request(`/api/catalog/links/${id}/archive`, { method: "POST" });
}
export async function unarchiveCatalogLink(id) {
  return await request(`/api/catalog/links/${id}/unarchive`, { method: "POST" });
}
export async function revokeCatalogLink(id) {
  return await request(`/api/catalog/links/${id}/revoke`, { method: "POST" });
}
export async function reactivateCatalogLink(id) {
  return await request(`/api/catalog/links/${id}/reactivate`, { method: "POST" });
}
export async function getCatalogOrders() { return await request(`/api/catalog/orders`); }
export async function rejectCatalogOrder(id) {
  return await request(`/api/catalog/orders/${id}/reject`, { method: "POST" });
}
export async function markCatalogOrderConverted(id) {
  return await request(`/api/catalog/orders/${id}/mark-converted`, { method: "POST" });
}
export async function getCatalogMessages() { return await request(`/api/catalog/messages`); }

// Tiered / wholesale pricing
export async function getPriceTiers(productId) {
  const q = productId ? `?product_id=${productId}` : "";
  return await request(`/api/pricing/tiers${q}`);
}
export async function createPriceTier(data) {
  return await request(`/api/pricing/tiers`, { method: "POST", body: JSON.stringify(data) });
}
export async function deletePriceTier(id) {
  return await request(`/api/pricing/tiers/${id}`, { method: "DELETE" });
}
export async function getPriceQuote(productId, quantity, customerId, extra = {}) {
  const params = new URLSearchParams({ product_id: productId, quantity: quantity || 1 });
  if (customerId) params.set("customer_id", customerId);
  Object.entries(extra).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") params.set(k, v); });
  return await request(`/api/pricing/quote?${params.toString()}`);
}
export async function getPricingRules() { return await request("/api/pricing/rules"); }
export async function createPricingRule(data) {
  return await request("/api/pricing/rules", { method: "POST", body: JSON.stringify(data) });
}
export async function updatePricingRule(id, data) {
  return await request(`/api/pricing/rules/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function deletePricingRule(id) {
  return await request(`/api/pricing/rules/${id}`, { method: "DELETE" });
}

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
