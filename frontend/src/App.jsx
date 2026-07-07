import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useEffect } from "react";

import MainLayout from "./layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetails from "./pages/CustomerDetails";
import Products from "./pages/Products";
import ProductCategories from "./pages/ProductCategories";
import Invoices from "./pages/Invoices";
import InvoicePrint from "./pages/InvoicePrint";
import Warehouse from "./pages/Warehouse";
import Transactions from "./pages/Transactions";
import Payments from "./pages/Payments";
import Receipts from "./pages/Receipts";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Login from "./pages/Login";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useLanguage } from "./localization/LanguageContext";
import InvoiceDesigner from "./designer/InvoiceDesigner";
import FinanceCenter from "./pages/FinanceCenter";
import Customer360 from "./pages/crm/Customer360";
import CrmDashboard from "./pages/CrmDashboard";
import SmartInventory from "./pages/SmartInventory";
import AiBusinessIntelligence from "./pages/AiBusinessIntelligence";
import AccountingCore from "./pages/AccountingCore";
import BusinessIntelligence from "./pages/BusinessIntelligence";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
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
      <Toaster position={dir === "rtl" ? "top-left" : "top-right"} toastOptions={{ style: { background: "#111827", color: "#fff", border: "1px solid #1f2937" } }} />
      <Routes>
  <Route path="/login" element={<Login />} />

  <Route path="/invoice-designer" element={<InvoiceDesigner />} />

  <Route path="/" element={<MainLayout />}>
    <Route index element={<Dashboard />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="customers" element={<Customers />} />
    <Route path="customers/:id" element={<CustomerDetails />} />
    <Route path="customers/:id/360" element={<Customer360 />} />
    <Route path="products" element={<Products />} />
    <Route path="product-categories" element={<ProductCategories />} />
    <Route path="invoices" element={<Invoices />} />
    <Route path="invoice-print/:id" element={<InvoicePrint />} />
    <Route path="warehouse" element={<Warehouse />} />
    <Route path="smart-inventory" element={<SmartInventory />} />
    <Route path="transactions" element={<Transactions />} />
    <Route path="payments" element={<Payments />} />
    <Route path="receipts" element={<Receipts />} />
    <Route path="expenses" element={<Expenses />} />
    <Route path="reports" element={<Reports />} />
    <Route path="ai-bi" element={<AiBusinessIntelligence />} />
    <Route path="finance" element={<FinanceCenter />} />
     <Route path="accounting" element={<AccountingCore />} />
    <Route path="settings" element={<Settings />} />
    <Route path="crm" element={<CrmDashboard />} />
    <Route path="*" element={<Navigate to="/" replace />} />
    <Route path="business-intelligence" element={<BusinessIntelligence />} />
  </Route>
</Routes>
    </>
  );
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
