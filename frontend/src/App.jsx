import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { lazy, Suspense, useEffect } from "react";

import MainLayout from "./layout/MainLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useLanguage } from "./localization/useLanguage";
import LocaleSettingsSync from "./localization/LocaleSettingsSync";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetails = lazy(() => import("./pages/CustomerDetails"));
const Products = lazy(() => import("./pages/Products"));
const ProductCategories = lazy(() => import("./pages/ProductCategories"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoicePrint = lazy(() => import("./pages/InvoicePrint"));
const InvoicePrintChoose = lazy(() => import("./pages/InvoicePrintChoose"));
const Warehouse = lazy(() => import("./pages/Warehouse"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Payments = lazy(() => import("./pages/Payments"));
const Receipts = lazy(() => import("./pages/Receipts"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const InvoiceDesigner = lazy(() => import("./designer/InvoiceDesigner"));
const DocumentDesigner = lazy(() => import("./designer/DocumentDesigner"));
const Customer360 = lazy(() => import("./pages/crm/Customer360"));
const CrmDashboard = lazy(() => import("./pages/CrmDashboard"));
const SmartInventory = lazy(() => import("./pages/SmartInventory"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const SalesPipeline = lazy(() => import("./pages/SalesPipeline"));
const AiBusinessIntelligence = lazy(() => import("./pages/AiBusinessIntelligence"));
const ImprovementCenter = lazy(() => import("./pages/ImprovementCenter"));
const AccountingCore = lazy(() => import("./pages/AccountingCore"));
const AccountingEntries = lazy(() => import("./pages/AccountingEntries"));
const FiscalPeriods = lazy(() => import("./pages/FiscalPeriods"));
const AuditTrail = lazy(() => import("./pages/AuditTrail"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const CompanyManagement = lazy(() => import("./pages/CompanyManagement"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const ExecutiveAgent = lazy(() => import("./pages/ExecutiveAgent"));
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeProfile = lazy(() => import("./pages/EmployeeProfile"));
const BackupRecovery = lazy(() => import("./pages/BackupRecovery"));
const SystemHealth = lazy(() => import("./pages/SystemHealth"));
const FinancialStatements = lazy(() => import("./pages/FinancialStatements"));
const TaxAccounting = lazy(() => import("./pages/TaxAccounting"));
const AgingReport = lazy(() => import("./pages/AgingReport"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const FixedAssets = lazy(() => import("./pages/FixedAssets"));
const BudgetControl = lazy(() => import("./pages/BudgetControl"));
const CurrencyManagement = lazy(() => import("./pages/CurrencyManagement"));
const ApprovalCenter = lazy(() => import("./pages/ApprovalCenter"));
const TreasuryCheques = lazy(() => import("./pages/TreasuryCheques"));
const OnlineCommerce = lazy(() => import("./pages/OnlineCommerce"));
const ChangeRequestCenter = lazy(() => import("./pages/ChangeRequestCenter"));
const FinancialPolicy = lazy(() => import("./pages/FinancialPolicy"));
const DataImportCenter = lazy(() => import("./pages/DataImportCenter"));
const AccountSecurity = lazy(() => import("./pages/AccountSecurity"));
const CustomerPortalView = lazy(() => import("./pages/CustomerPortalView"));
const SupplierPortalView = lazy(() => import("./pages/SupplierPortalView"));
const PaymentGatewayView = lazy(() => import("./pages/PaymentGatewayView"));
const PaymentReminders = lazy(() => import("./pages/PaymentReminders"));
const MessageTemplates = lazy(() => import("./pages/MessageTemplates"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const DesignStudio = lazy(() => import("./pages/DesignStudio"));
const Warehouses = lazy(() => import("./pages/Warehouses"));
const Branches = lazy(() => import("./pages/Branches"));
const ExecutiveAlerts = lazy(() => import("./pages/ExecutiveAlerts"));
const CatalogManager = lazy(() => import("./pages/CatalogManager"));
const CatalogPublicView = lazy(() => import("./pages/CatalogPublicView"));
const InvoiceVerifyView = lazy(() => import("./pages/InvoiceVerifyView"));
const PricingTiers = lazy(() => import("./pages/PricingTiers"));
const RecurringInvoices = lazy(() => import("./pages/RecurringInvoices"));
const VisitorHome = lazy(() => import("./pages/visitor/VisitorHome"));
const VisitorOrder = lazy(() => import("./pages/visitor/VisitorOrder"));
const VisitorVisits = lazy(() => import("./pages/visitor/VisitorVisits"));

function ProtectedRoute({ children }) {
  const { user, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#071028] flex items-center justify-center text-cyan-300 font-bold">
        Vetrix ERP...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppContent() {
  const { dir, language } = useLanguage();

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    document.body.dir = dir;
    document.body.style.direction = dir;
    document.body.classList.remove("rtl", "ltr");
    document.body.classList.add(dir);
  }, [dir, language]);

  return (
    <>
      <LocaleSettingsSync />
      <Toaster
        position={dir === "rtl" ? "top-left" : "top-right"}
        toastOptions={{
          style: {
            background: "#111827",
            color: "#fff",
            border: "1px solid #1f2937",
          },
        }}
      />

      <Suspense
        fallback={
          <div className="min-h-screen bg-[#071028] flex items-center justify-center text-cyan-300 font-bold">
            Vetrix ERP...
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portal/:token" element={<CustomerPortalView />} />
          <Route path="/supplier-portal/:token" element={<SupplierPortalView />} />
          <Route path="/pay/:authority" element={<PaymentGatewayView />} />
          <Route path="/catalog/:token" element={<CatalogPublicView />} />
          <Route path="/verify-invoice/:id/:code" element={<InvoiceVerifyView />} />
        <Route
          path="/invoice-designer"
          element={
            <ProtectedRoute>
              <InvoiceDesigner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/business-card-designer"
          element={
            <ProtectedRoute>
              <DocumentDesigner kind="business_card" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/letterhead-designer"
          element={
            <ProtectedRoute>
              <DocumentDesigner kind="letterhead" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banner-designer"
          element={
            <ProtectedRoute>
              <DocumentDesigner kind="banner" />
            </ProtectedRoute>
          }
        />

        {/* Visitor (field sales rep) module: a separate, minimal,
            mobile-first shell outside the desktop Sidebar/MainLayout - see
            pages/visitor/VisitorLayout.jsx. */}
        <Route
          path="/visitor"
          element={
            <ProtectedRoute>
              <VisitorHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/visitor/order/:customerId"
          element={
            <ProtectedRoute>
              <VisitorOrder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/visitor/visits"
          element={
            <ProtectedRoute>
              <VisitorVisits />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetails />} />
          <Route path="customers/:id/360" element={<Customer360 />} />
          <Route path="products" element={<Products />} />
          <Route path="product-categories" element={<ProductCategories />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoice-print/:id" element={<InvoicePrintChoose />} />
          <Route path="invoice-print/:id/edit" element={<InvoicePrint />} />
          <Route path="warehouse" element={<Warehouse />} />
          <Route path="smart-inventory" element={<SmartInventory />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="sales-pipeline" element={<SalesPipeline />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="payments" element={<Payments />} />
          <Route path="receipts" element={<Receipts />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="ai-bi" element={<AiBusinessIntelligence />} />
          <Route path="improvement-center" element={<ImprovementCenter />} />
          <Route path="finance" element={<Navigate to="/transactions" replace />} />
          <Route path="accounting" element={<AccountingCore />} />
          <Route path="accounting-entries" element={<AccountingEntries />} />
          <Route path="fiscal-periods" element={<FiscalPeriods />} />
          <Route path="audit-trail" element={<AuditTrail />} />
          <Route path="user-management" element={<UserManagement />} />
          <Route path="company-management" element={<CompanyManagement />} />
          <Route path="company-profile" element={<CompanyProfile />} />
          <Route path="executive-agent" element={<ExecutiveAgent />} />
          <Route path="hr/employees" element={<Employees />} />
          <Route path="hr/employees/:id" element={<EmployeeProfile />} />
          <Route path="backup-recovery" element={<BackupRecovery />} />
          <Route path="system-health" element={<SystemHealth />} />
          <Route path="financial-statements" element={<FinancialStatements />} />
          <Route path="tax-accounting" element={<TaxAccounting />} />
          <Route path="aging-report" element={<AgingReport />} />
          <Route path="bank-reconciliation" element={<BankReconciliation />} />
          <Route path="fixed-assets" element={<FixedAssets />} />
          <Route path="budget-control" element={<BudgetControl />} />
          <Route path="currency-management" element={<CurrencyManagement />} />
          <Route path="approval-center" element={<ApprovalCenter />} />
          <Route path="treasury-cheques" element={<TreasuryCheques />} />
          <Route path="settings" element={<Settings />} />
          <Route path="crm" element={<CrmDashboard />} />
          {/* Task 07 Section 4/F: BusinessIntelligence.jsx duplicated AiBusinessIntelligence.jsx's
              KPIs with a weaker client-side-only forecast/scoring, while /ai-bi has the real
              backend-computed anomaly detection and cashflow forecast - redirected, not removed,
              so old bookmarks/links still land somewhere useful. */}
          <Route path="business-intelligence" element={<Navigate to="/ai-bi" replace />} />
          <Route path="online-commerce" element={<OnlineCommerce />} />
          <Route path="change-requests" element={<ChangeRequestCenter />} />
          <Route path="financial-policy" element={<FinancialPolicy />} />
          <Route path="data-import" element={<DataImportCenter />} />
          <Route path="account-security" element={<AccountSecurity />} />
          <Route path="catalog-manager" element={<CatalogManager />} />
          <Route path="pricing-tiers" element={<PricingTiers />} />
          <Route path="recurring-invoices" element={<RecurringInvoices />} />
          <Route path="payment-reminders" element={<PaymentReminders />} />
          <Route path="message-templates" element={<MessageTemplates />} />
          <Route path="help" element={<HelpCenter />} />
          <Route path="design-studio" element={<DesignStudio />} />
          <Route path="warehouses" element={<Warehouses />} />
          <Route path="branches" element={<Branches />} />
          <Route path="executive-alerts" element={<ExecutiveAlerts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}