import {
  LayoutDashboard,
  UsersRound,
  Package,
  Receipt,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  ArrowRightLeft,
  Boxes,
  Warehouse as WarehouseIcon,
  BrainCircuit,
  BookOpenCheck,
  CalendarClock,
  History,
  UserCog,
  DatabaseBackup,
  HeartPulse,
  BadgePercent,
  CalendarRange,
  Landmark,
  Factory,
  Target,
  Coins,
  ShieldCheck,
} from "lucide-react";

import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";
import LanguageSwitcher from "./language/LanguageSwitcher";

const items = [
  { key: "dashboard", icon: LayoutDashboard, path: "/" },
  { key: "parties", fallbackKey: "customers", icon: UsersRound, path: "/customers" },
  { key: "products", icon: Package, path: "/products" },
  { key: "productCategories", icon: Boxes, path: "/product-categories" },
  { key: "invoices", icon: Receipt, path: "/invoices" },
  { key: "accountingEntries", icon: BookOpenCheck, path: "/accounting-entries", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "fiscalPeriods", icon: CalendarClock, path: "/fiscal-periods", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "auditTrail", icon: History, path: "/audit-trail", roles: ["admin"] },
  { key: "userManagement", icon: UserCog, path: "/user-management", roles: ["admin"] },
  { key: "backupRecovery", icon: DatabaseBackup, path: "/backup-recovery", roles: ["admin"] },
  { key: "systemHealth", icon: HeartPulse, path: "/system-health", roles: ["admin"] },
  { key: "transactions", icon: ArrowRightLeft, path: "/transactions", roles: ["admin", "accountant", "sales", "viewer", "user"] },
  { key: "warehouse", icon: WarehouseIcon, path: "/warehouse", roles: ["admin", "warehouse", "viewer", "user"] },
  { key: "expenses", icon: Wallet, path: "/expenses", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "reports", icon: BarChart3, path: "/reports" },
  { key: "financialStatements", icon: BarChart3, path: "/financial-statements", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "taxAccounting", icon: BadgePercent, path: "/tax-accounting", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "agingReport", icon: CalendarRange, path: "/aging-report", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "bankReconciliation", icon: Landmark, path: "/bank-reconciliation", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "fixedAssets", icon: Factory, path: "/fixed-assets", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "budgetControl", icon: Target, path: "/budget-control", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "currencyManagement", icon: Coins, path: "/currency-management", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "approvalCenter", icon: ShieldCheck, path: "/approval-center", roles: ["admin", "accountant"] },
  { key: "aiBusiness", icon: BrainCircuit, path: "/ai-bi", roles: ["admin", "accountant", "viewer", "user"] },
  { key: "settings", icon: Settings, path: "/settings", roles: ["admin"] },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { t, dir } = useLanguage();

  function label(item) {
    return t(item.key) || t(item.fallbackKey) || item.key;
  }

  return (
    <aside
      className="erp-sidebar"
      style={{
        width: 280,
        minWidth: 280,
        height: "100vh",
        position: "sticky",
        top: 0,
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: 20,
        background: "#0b1736",
        borderRight: dir === "ltr" ? "1px solid rgba(255,255,255,0.08)" : "none",
        borderLeft: dir === "rtl" ? "1px solid rgba(255,255,255,0.08)" : "none",
        padding: 20,
      }}
    >
      <h1
        style={{
          color: "#22d3ee",
          marginBottom: 20,
          fontSize: 30,
          fontWeight: 900,
          textAlign: dir === "rtl" ? "right" : "left",
        }}
      >
        {t("appName")}
      </h1>

      <div style={{ marginBottom: 20 }}>
        <LanguageSwitcher />
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.filter((item) => !item.roles || item.roles.includes(user?.role || "viewer")).map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className="sidebar-menu-item"
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 15px",
                borderRadius: 16,
                textDecoration: "none",
                color: "white",
                background: isActive
                  ? "linear-gradient(90deg,#06b6d4,#22c55e)"
                  : "#132347",
                fontWeight: 800,
                justifyContent: dir === "rtl" ? "flex-end" : "flex-start",
                flexDirection: dir === "rtl" ? "row-reverse" : "row",
                boxShadow: isActive ? "0 12px 26px rgba(34,211,238,0.25)" : "none",
                whiteSpace: "nowrap",
              })}
            >
              <Icon size={19} />
              <span>{label(item)}</span>
            </NavLink>
          );
        })}

        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 16,
            border: "none",
            background: "linear-gradient(90deg,#ef4444,#fb7185)",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexDirection: dir === "rtl" ? "row-reverse" : "row",
            }}
          >
            <LogOut size={18} />
            {t("logout")}
          </div>
        </button>
      </nav>
    </aside>
  );
}
