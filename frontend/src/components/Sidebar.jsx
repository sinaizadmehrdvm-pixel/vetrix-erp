import { useMemo, useState } from "react";
import {
  LayoutDashboard, UsersRound, Package, Receipt, Wallet, BarChart3, Settings,
  LogOut, ArrowRightLeft, Boxes, Warehouse as WarehouseIcon, BrainCircuit,
  BookOpenCheck, CalendarClock, History, UserCog, DatabaseBackup, HeartPulse,
  BadgePercent, CalendarRange, Landmark, Factory, Target, Coins, ShieldCheck,
  WalletCards, ChevronDown, PanelLeftClose, PanelLeftOpen, BriefcaseBusiness, Globe2,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";
import LanguageSwitcher from "./language/LanguageSwitcher";

const groups = [
  {
    id: "daily", fa: "عملیات روزانه", en: "Daily operations", open: true,
    items: [
      { key: "dashboard", icon: LayoutDashboard, path: "/" },
      { key: "parties", fallbackKey: "customers", icon: UsersRound, path: "/customers" },
      { key: "products", icon: Package, path: "/products" },
      { key: "invoices", icon: Receipt, path: "/invoices" },
      { key: "transactions", icon: ArrowRightLeft, path: "/transactions", roles: ["admin", "accountant", "sales", "viewer", "user"] },
      { key: "expenses", icon: Wallet, path: "/expenses", roles: ["admin", "accountant", "viewer", "user"] },
    ],
  },
  {
    id: "inventory", fa: "کالا و انبار", en: "Products & inventory",
    items: [
      { key: "productCategories", icon: Boxes, path: "/product-categories" },
      { key: "warehouse", icon: WarehouseIcon, path: "/warehouse", roles: ["admin", "warehouse", "viewer", "user"] },
    ],
  },
  {
    id: "accounting", fa: "حسابداری و خزانه", en: "Accounting & treasury",
    items: [
      { key: "accountingEntries", icon: BookOpenCheck, path: "/accounting-entries", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "fiscalPeriods", icon: CalendarClock, path: "/fiscal-periods", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "taxAccounting", icon: BadgePercent, path: "/tax-accounting", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "bankReconciliation", icon: Landmark, path: "/bank-reconciliation", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "treasuryCheques", icon: WalletCards, path: "/treasury-cheques", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "currencyManagement", icon: Coins, path: "/currency-management", roles: ["admin", "accountant", "viewer", "user"] },
    ],
  },
  {
    id: "analysis", fa: "گزارش و تحلیل", en: "Reports & analysis",
    items: [
      { key: "reports", icon: BarChart3, path: "/reports" },
      { key: "onlineCommerce", fa: "فروش آنلاین و تبلیغات", en: "Online sales & ads", icon: Globe2, path: "/online-commerce", roles: ["admin", "accountant", "sales"] },
      { key: "changeRequests", fa: "درخواست تغییر با ویس", en: "Voice change requests", icon: BrainCircuit, path: "/change-requests", roles: ["admin", "accountant", "sales", "warehouse"] },
      { key: "financialStatements", icon: BarChart3, path: "/financial-statements", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "agingReport", icon: CalendarRange, path: "/aging-report", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "budgetControl", icon: Target, path: "/budget-control", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "aiBusiness", icon: BrainCircuit, path: "/ai-bi", roles: ["admin", "accountant", "viewer", "user"] },
    ],
  },
  {
    id: "assets", fa: "دارایی و کنترل", en: "Assets & control",
    items: [
      { key: "fixedAssets", icon: Factory, path: "/fixed-assets", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "approvalCenter", icon: ShieldCheck, path: "/approval-center", roles: ["admin", "accountant"] },
    ],
  },
  {
    id: "system", fa: "مدیریت سیستم", en: "System administration",
    items: [
      { key: "auditTrail", icon: History, path: "/audit-trail", roles: ["admin"] },
      { key: "userManagement", icon: UserCog, path: "/user-management", roles: ["admin"] },
      { key: "backupRecovery", icon: DatabaseBackup, path: "/backup-recovery", roles: ["admin"] },
      { key: "systemHealth", icon: HeartPulse, path: "/system-health", roles: ["admin"] },
      { key: "settings", icon: Settings, path: "/settings", roles: ["admin"] },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { t, dir, language } = useLanguage();
  const fa = language === "fa";
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState(() => ({ daily: true }));

  const visibleGroups = useMemo(
    () => groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(user?.role || "viewer")),
    })).filter((group) => group.items.length),
    [user?.role],
  );

  function label(item) {
    if (item.fa || item.en) return fa ? item.fa : item.en;
    return t(item.key) || t(item.fallbackKey) || item.key;
  }

  function toggleGroup(id) {
    if (compact) setCompact(false);
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <aside
      className="erp-sidebar"
      style={{
        width: compact ? 86 : 280,
        minWidth: compact ? 86 : 280,
        height: "100vh",
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: 20,
        borderRight: dir === "ltr" ? "1px solid var(--erp-border)" : "none",
        borderLeft: dir === "rtl" ? "1px solid var(--erp-border)" : "none",
        padding: compact ? "18px 12px" : 18,
        transition: "width .24s ease, min-width .24s ease",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        {!compact && <h1 className="erp-accent text-2xl font-black whitespace-nowrap">{t("appName")}</h1>}
        <button
          type="button"
          onClick={() => setCompact((value) => !value)}
          className="erp-surface erp-accent rounded-xl p-2 cursor-pointer"
          title={fa ? "جمع‌کردن منو" : "Toggle compact menu"}
          aria-label={fa ? "جمع‌کردن منو" : "Toggle compact menu"}
        >
          {compact ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      {!compact && <div className="mb-4"><LanguageSwitcher /></div>}

      <nav className="flex flex-col gap-2">
        {visibleGroups.map((group) => (
          <section key={group.id}>
            {!compact && (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-black"
                style={{ color: "var(--erp-muted)", background: expanded[group.id] ? "var(--erp-glow)" : "transparent" }}
                aria-expanded={Boolean(expanded[group.id])}
              >
                <span>{fa ? group.fa : group.en}</span>
                <ChevronDown size={16} style={{ transform: expanded[group.id] ? "rotate(180deg)" : "none" }} />
              </button>
            )}

            {(compact || expanded[group.id]) && (
              <div className="flex flex-col gap-1.5 mt-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/"}
                      title={compact ? label(item) : undefined}
                      className="sidebar-menu-item"
                      style={({ isActive }) => ({
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: compact ? "12px 0" : "11px 13px",
                        borderRadius: 14,
                        textDecoration: "none",
                        color: isActive ? "#071028" : "var(--erp-text)",
                        background: isActive
                          ? "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))"
                          : "var(--erp-panel-solid)",
                        fontWeight: 800,
                        justifyContent: compact ? "center" : (dir === "rtl" ? "flex-end" : "flex-start"),
                        flexDirection: dir === "rtl" && !compact ? "row-reverse" : "row",
                        boxShadow: isActive ? "0 10px 24px var(--erp-glow)" : "none",
                        whiteSpace: "nowrap",
                      })}
                    >
                      <Icon size={19} />
                      {!compact && <span>{label(item)}</span>}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </section>
        ))}

        {!compact && (
          <div className="mt-3 rounded-2xl p-3 text-xs erp-surface" style={{ color: "var(--erp-muted)" }}>
            <BriefcaseBusiness className="erp-accent mb-2" size={18} />
            {fa ? "گروه‌ها را فقط هنگام نیاز باز کن؛ همه امکانات همچنان در دسترس‌اند." : "Open groups only when needed; every feature remains available."}
          </div>
        )}

        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="mt-2 p-3 rounded-2xl border-0 text-white font-black cursor-pointer"
          style={{ background: "linear-gradient(90deg,#ef4444,#fb7185)" }}
          title={compact ? t("logout") : undefined}
        >
          <div className="flex items-center justify-center gap-2">
            <LogOut size={18} />
            {!compact && t("logout")}
          </div>
        </button>
      </nav>
    </aside>
  );
}
