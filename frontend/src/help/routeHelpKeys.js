// Maps a URL pathname to its pageHelp.js registry key. Kept separate from
// Sidebar.jsx's own route list (not exported there) so this file is the
// single, App.jsx-route-table-derived source of truth for "which page is
// this," rather than duplicating Sidebar's nav-only subset.
const ROUTE_KEYS = [
  ["/dashboard", "dashboard"],
  ["/", "dashboard"],
  ["/customers", "customers"],
  ["/products", "products"],
  ["/product-categories", "productCategories"],
  ["/invoices", "invoices"],
  ["/warehouse", "warehouse"],
  ["/warehouses", "multiWarehouse"],
  ["/branches", "branches"],
  ["/purchase-orders", "purchaseOrders"],
  ["/sales-pipeline", "salesPipeline"],
  ["/visitor", "visitorModule"],
  ["/transactions", "transactions"],
  ["/payments", "transactions"],
  ["/receipts", "transactions"],
  ["/expenses", "expenses"],
  ["/reports", "reports"],
  ["/ai-bi", "aiBusiness"],
  ["/improvement-center", "improvementCenter"],
  ["/business-intelligence", "aiBusiness"],
  ["/accounting-entries", "accountingEntries"],
  ["/fiscal-periods", "fiscalPeriods"],
  ["/audit-trail", "auditTrail"],
  ["/user-management", "userManagement"],
  ["/company-management", "companyManagement"],
  ["/hr/employees", "employees"],
  ["/company-profile", "companyProfile"],
  ["/executive-agent", "executiveAgent"],
  ["/backup-recovery", "backupRecovery"],
  ["/system-health", "systemHealth"],
  ["/financial-statements", "financialStatements"],
  ["/tax-accounting", "taxAccounting"],
  ["/aging-report", "agingReport"],
  ["/bank-reconciliation", "bankReconciliation"],
  ["/fixed-assets", "fixedAssets"],
  ["/budget-control", "budgetControl"],
  ["/currency-management", "currencyManagement"],
  ["/approval-center", "approvalCenter"],
  ["/treasury-cheques", "treasuryCheques"],
  ["/settings", "settings"],
  ["/crm", "customers"],
  ["/online-commerce", "onlineCommerce"],
  ["/change-requests", "changeRequests"],
  ["/financial-policy", "financialPolicy"],
  ["/data-import", "dataImport"],
  ["/account-security", "accountSecurity"],
  ["/catalog-manager", "catalogManager"],
  ["/pricing-tiers", "pricingTiers"],
  ["/recurring-invoices", "recurringInvoices"],
  ["/payment-reminders", "paymentReminders"],
  ["/message-templates", "messageTemplates"],
  ["/design-studio", "designStudio"],
  ["/executive-alerts", "executiveAlerts"],
];

export function helpKeyForPath(pathname) {
  const exact = ROUTE_KEYS.find(([path]) => path === pathname);
  if (exact) return exact[1];
  // Sub-routes (e.g. /customers/123, /invoice-print/5/edit) fall back to
  // their parent page's help - a detail view is still "the customers page"
  // from a help-content standpoint.
  const prefixed = ROUTE_KEYS
    .filter(([path]) => path !== "/" && pathname.startsWith(path + "/"))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return prefixed?.[1] ?? null;
}
