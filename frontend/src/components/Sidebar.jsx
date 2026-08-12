import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, UsersRound, Package, Receipt, Wallet, BarChart3, Settings,
  LogOut, ArrowRightLeft, Boxes, Warehouse as WarehouseIcon, BrainCircuit,
  BookOpenCheck, CalendarClock, History, UserCog, DatabaseBackup, HeartPulse,
  BadgePercent, CalendarRange, Landmark, Factory, Target, Coins, ShieldCheck, ShieldAlert,
  WalletCards, ChevronDown, PanelLeftClose, PanelLeftOpen, BriefcaseBusiness, Globe2, Scale, FileSpreadsheet, Search, X,
  BookOpen, Layers, BellRing, Sun, Moon, LayoutTemplate, Building2, Smartphone, MessageSquareText, LifeBuoy,
  TrendingUp, Users, MessagesSquare, ListTree,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { useTheme } from "../theme/useTheme";
import CompanySwitcher from "./CompanySwitcher";
import LanguageSwitcher from "./language/LanguageSwitcher";

const groups = [
  {
    id: "daily", labelKey: "groupDaily", open: true,
    items: [
      { key: "dashboard", icon: LayoutDashboard, path: "/" },
      { key: "parties", fallbackKey: "customers", icon: UsersRound, path: "/customers" },
      { key: "salesPipeline", icon: BriefcaseBusiness, path: "/sales-pipeline", roles: ["admin", "sales"] },
      { key: "visitorModule", icon: Smartphone, path: "/visitor", roles: ["admin", "sales"] },
      { key: "products", icon: Package, path: "/products" },
      { key: "invoices", icon: Receipt, path: "/invoices" },
      { key: "recurringInvoices", icon: CalendarClock, path: "/recurring-invoices", roles: ["admin", "accountant", "sales"] },
      { key: "paymentReminders", icon: BellRing, path: "/payment-reminders", roles: ["admin", "accountant", "sales"] },
      { key: "transactions", icon: ArrowRightLeft, path: "/transactions", roles: ["admin", "accountant", "sales", "viewer", "user"] },
      { key: "expenses", icon: Wallet, path: "/expenses", roles: ["admin", "accountant", "viewer", "user"] },
    ],
  },
  {
    id: "inventory", labelKey: "groupInventory",
    items: [
      { key: "productCategories", icon: Boxes, path: "/product-categories" },
      { key: "branches", icon: Building2, path: "/branches", roles: ["admin", "warehouse"] },
      { key: "warehouse", icon: WarehouseIcon, path: "/warehouse", roles: ["admin", "warehouse", "viewer", "user"] },
      { key: "multiWarehouse", icon: WarehouseIcon, path: "/warehouses", roles: ["admin", "warehouse"] },
      { key: "purchaseOrders", icon: Factory, path: "/purchase-orders", roles: ["admin", "warehouse", "accountant"] },
      { key: "pricingTiers", icon: Layers, path: "/pricing-tiers", roles: ["admin", "accountant", "warehouse"] },
    ],
  },
  {
    id: "accounting", labelKey: "groupAccounting",
    items: [
      { key: "executiveAlerts", icon: ShieldAlert, path: "/executive-alerts", roles: ["admin", "accountant"] },
      { key: "chartOfAccounts", icon: ListTree, path: "/accounting", roles: ["admin", "accountant"] },
      { key: "accountingEntries", icon: BookOpenCheck, path: "/accounting-entries", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "fiscalPeriods", icon: CalendarClock, path: "/fiscal-periods", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "taxAccounting", icon: BadgePercent, path: "/tax-accounting", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "bankReconciliation", icon: Landmark, path: "/bank-reconciliation", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "treasuryCheques", icon: WalletCards, path: "/treasury-cheques", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "currencyManagement", icon: Coins, path: "/currency-management", roles: ["admin", "accountant", "viewer", "user"] },
    ],
  },
  {
    id: "analysis", labelKey: "groupAnalysis",
    items: [
      { key: "reports", icon: BarChart3, path: "/reports" },
      { key: "onlineCommerce", icon: Globe2, path: "/online-commerce", roles: ["admin", "accountant", "sales"] },
      { key: "catalogManager", icon: BookOpen, path: "/catalog-manager", roles: ["admin", "accountant", "sales"] },
      { key: "changeRequests", icon: BrainCircuit, path: "/change-requests", roles: ["admin", "accountant", "sales", "warehouse"] },
      { key: "financialStatements", icon: BarChart3, path: "/financial-statements", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "agingReport", icon: CalendarRange, path: "/aging-report", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "budgetControl", icon: Target, path: "/budget-control", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "aiBusiness", icon: BrainCircuit, path: "/ai-bi", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "improvementCenter", icon: TrendingUp, path: "/improvement-center", roles: ["admin", "accountant"] },
    ],
  },
  {
    id: "assets", labelKey: "groupAssets",
    items: [
      { key: "fixedAssets", icon: Factory, path: "/fixed-assets", roles: ["admin", "accountant", "viewer", "user"] },
      { key: "approvalCenter", icon: ShieldCheck, path: "/approval-center", roles: ["admin", "accountant"] },
    ],
  },
  {
    id: "system", labelKey: "groupSystem",
    items: [
      { key: "auditTrail", icon: History, path: "/audit-trail", roles: ["admin"] },
      { key: "userManagement", icon: UserCog, path: "/user-management", roles: ["admin"] },
      { key: "employees", icon: Users, path: "/hr/employees" },
      { key: "companyManagement", icon: Building2, path: "/company-management", roles: ["admin"], superAdminOnly: true },
      { key: "companyProfile", icon: Building2, path: "/company-profile", roles: ["admin"] },
      { key: "executiveAgent", icon: MessagesSquare, path: "/executive-agent", roles: ["admin", "accountant"] },
      { key: "backupRecovery", icon: DatabaseBackup, path: "/backup-recovery", roles: ["admin"], superAdminOnly: true },
      { key: "dataImport", icon: FileSpreadsheet, path: "/data-import", roles: ["admin"] },
      { key: "systemHealth", icon: HeartPulse, path: "/system-health", roles: ["admin"] },
      { key: "financialPolicy", icon: Scale, path: "/financial-policy", roles: ["admin"] },
      { key: "designStudio", icon: LayoutTemplate, path: "/design-studio", roles: ["admin", "accountant", "sales"] },
      { key: "messageTemplates", icon: MessageSquareText, path: "/message-templates", roles: ["admin", "accountant", "sales"] },
      { key: "settings", icon: Settings, path: "/settings", roles: ["admin"] },
      { key: "accountSecurity", icon: ShieldCheck, path: "/account-security" },
      { key: "helpCenter", icon: LifeBuoy, path: "/help" },
    ],
  },
];

export default function Sidebar({ mobileOpen = false, onNavigate = () => {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t, dir, language } = useLanguage();
  const { theme, setTheme } = useTheme();
  const fa = language === "fa";
  const isLight = theme === "light";
  const [compact, setCompact] = useState(() => localStorage.getItem("vetrix_sidebar_compact") === "true");
  const [expanded, setExpanded] = useState(() => ({ daily: true }));
  const [query, setQuery] = useState("");

  useEffect(() => {
    localStorage.setItem("vetrix_sidebar_compact", String(compact));
  }, [compact]);

  useEffect(() => {
    const activeGroup = groups.find((group) =>
      group.items.some((item) => item.path === location.pathname)
    );
    if (activeGroup) {
      const timer = setTimeout(() => setExpanded((current) => ({ ...current, [activeGroup.id]: true })), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [location.pathname]);

  const label = useCallback((item) => {
    return t(item.key) || t(item.fallbackKey) || item.key;
  }, [t]);

  const groupLabel = useCallback((group) => t(group.labelKey) || group.id, [t]);

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(language);
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const permitted =
          (!item.roles || item.roles.includes(user?.role || "viewer")) &&
          (!item.superAdminOnly || user?.is_super_admin);
        const searchable = `${label(item)} ${item.key} ${groupLabel(group)}`.toLocaleLowerCase(language);
        return permitted && (!normalizedQuery || searchable.includes(normalizedQuery));
      }),
    })).filter((group) => group.items.length);
  }, [user?.role, user?.is_super_admin, query, language, label, groupLabel]);

  function toggleGroup(id) {
    if (compact) setCompact(false);
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <aside
      id="erp-primary-navigation"
      aria-label={
        fa
          ? "منوی اصلی"
          : language === "ar"
          ? "التنقل الرئيسي"
          : language === "tr"
          ? "Ana gezinme"
          : "Primary navigation"
      }
      className={`erp-sidebar ${mobileOpen ? "is-open" : ""}`}
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(isLight ? "midnight" : "light")}
            className="erp-surface erp-accent rounded-xl p-2 cursor-pointer"
            title={
              fa
                ? (isLight ? "حالت شب" : "حالت روز")
                : language === "ar"
                ? (isLight ? "التبديل إلى الوضع الداكن" : "التبديل إلى الوضع الفاتح")
                : language === "tr"
                ? (isLight ? "Karanlık moda geç" : "Aydınlık moda geç")
                : (isLight ? "Switch to dark mode" : "Switch to light mode")
            }
            aria-label={
              fa
                ? (isLight ? "تغییر به حالت شب" : "تغییر به حالت روز")
                : language === "ar"
                ? (isLight ? "التبديل إلى الوضع الداكن" : "التبديل إلى الوضع الفاتح")
                : language === "tr"
                ? (isLight ? "Karanlık moda geç" : "Aydınlık moda geç")
                : (isLight ? "Switch to dark mode" : "Switch to light mode")
            }
          >
            {isLight ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            type="button"
            onClick={() => setCompact((value) => !value)}
            className="erp-surface erp-accent rounded-xl p-2 cursor-pointer"
            title={
              fa
                ? "جمع‌کردن منو"
                : language === "ar"
                ? "تبديل القائمة المدمجة"
                : language === "tr"
                ? "Kompakt menüyü aç/kapat"
                : "Toggle compact menu"
            }
            aria-label={
              fa
                ? "جمع‌کردن منو"
                : language === "ar"
                ? "تبديل القائمة المدمجة"
                : language === "tr"
                ? "Kompakt menüyü aç/kapat"
                : "Toggle compact menu"
            }
          >
            {compact ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>
      </div>

      {!compact && (
        <div className="mb-4 flex flex-col gap-2">
          <LanguageSwitcher />
          <CompanySwitcher />
        </div>
      )}

      {!compact && (
        <label className="erp-surface mb-4 flex items-center gap-2 rounded-2xl px-3 py-2">
          <Search size={18} aria-hidden="true" style={{ color: "var(--erp-accent)" }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              fa
                ? "جستجو در امکانات…"
                : language === "ar"
                ? "البحث في الميزات…"
                : language === "tr"
                ? "Özelliklerde ara…"
                : "Search features…"
            }
            aria-label={
              fa
                ? "جستجو در منوی برنامه"
                : language === "ar"
                ? "البحث في قائمة التطبيق"
                : language === "tr"
                ? "Uygulama menüsünde ara"
                : "Search application menu"
            }
            className="min-w-0 flex-1 border-0 bg-transparent outline-none"
            style={{ color: "var(--erp-text)" }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={
                fa
                  ? "پاک‌کردن جستجو"
                  : language === "ar"
                  ? "مسح البحث"
                  : language === "tr"
                  ? "Aramayı temizle"
                  : "Clear search"
              }
              className="p-1"
            >
              <X size={16} />
            </button>
          )}
        </label>
      )}

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
                <span>{groupLabel(group)}</span>
                <ChevronDown size={16} style={{ transform: expanded[group.id] ? "rotate(180deg)" : "none" }} />
              </button>
            )}

            {(compact || query || expanded[group.id]) && (
              <div className="flex flex-col gap-1.5 mt-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/"}
                      title={compact ? label(item) : undefined}
                      onClick={onNavigate}
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
            {fa
              ? "گروه‌ها را فقط هنگام نیاز باز کن؛ همه امکانات همچنان در دسترس‌اند."
              : language === "ar"
              ? "افتح المجموعات فقط عند الحاجة؛ تبقى جميع الميزات متاحة دائمًا."
              : language === "tr"
              ? "Grupları yalnızca gerektiğinde açın; tüm özellikler her zaman kullanılabilir kalır."
              : "Open groups only when needed; every feature remains available."}
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
