import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, UsersRound, Package, Receipt, Wallet, BarChart3, Settings,
  ArrowRightLeft, Boxes, BrainCircuit,
  BookOpenCheck, CalendarClock, History, UserCog, DatabaseBackup, HeartPulse,
  BadgePercent, CalendarRange, Landmark, Factory, Target, Coins, ShieldCheck, ShieldAlert,
  WalletCards, ChevronDown, PanelLeftClose, PanelLeftOpen, BriefcaseBusiness, Globe2, Scale, FileSpreadsheet, Search, X,
  BookOpen, Layers, BellRing, Sun, Moon, LayoutTemplate, Building2, Smartphone, MessageSquareText, LifeBuoy,
  TrendingUp, Users, MessagesSquare, ListTree, Brain, HeartHandshake,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { useTheme } from "../theme/useTheme";
import CompanySwitcher from "./CompanySwitcher";
import LanguageSwitcher from "./language/LanguageSwitcher";
import BrandLogo from "./brand/BrandLogo";
import Tooltip from "./ui/Tooltip";
import ProfileMenu from "./ProfileMenu";

const groups = [
  {
    id: "daily", labelKey: "groupDaily", open: true,
    items: [
      { key: "dashboard", icon: LayoutDashboard, path: "/" },
      { key: "parties", fallbackKey: "customers", icon: UsersRound, path: "/customers" },
      { key: "crmDashboard", icon: HeartHandshake, path: "/crm", roles: ["admin", "sales", "accountant"] },
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
      // Branches (admin/warehouse), single-warehouse stock movement
      // (admin/warehouse/viewer/user) and multi-warehouse management
      // (admin/warehouse) used to be three separate entries/routes - now
      // one entry pointing at the unified tabbed page. Its `roles` is the
      // union of the three so viewer/user can still reach the Stock
      // Movement tab (matching the old /warehouse entry's broader access);
      // the page itself hides the Branches/Warehouses/Transfers tabs from
      // roles that couldn't reach those routes before, so the narrower
      // per-tab access is preserved, not just moved to a single gate.
      { key: "branchesWarehouses", icon: Building2, path: "/branches-warehouses", roles: ["admin", "warehouse", "viewer", "user"] },
      { key: "smartInventory", icon: Brain, path: "/smart-inventory", roles: ["admin", "warehouse", "accountant"] },
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

export default function Sidebar({ mobileOpen = false, onNavigate = () => {}, onCloseDrawer = () => {} }) {
  const location = useLocation();
  const { user } = useAuth();
  const { t, dir, language } = useLanguage();
  const { theme, setTheme } = useTheme();
  const fa = language === "fa";
  const isLight = theme === "light";
  const [compact, setCompact] = useState(() => localStorage.getItem("vetrix_sidebar_compact") === "true");
  const [width, setWidth] = useState(() => Number(localStorage.getItem("vetrix_sidebar_width")) || 280);
  const [resizing, setResizing] = useState(false);
  const [expanded, setExpanded] = useState(() => ({ daily: true }));
  const [query, setQuery] = useState("");
  const closeButtonRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("vetrix_sidebar_compact", String(compact));
  }, [compact]);

  useEffect(() => {
    localStorage.setItem("vetrix_sidebar_width", String(width));
  }, [width]);

  // MainLayout's hamburger trigger unmounts while the drawer is open (so
  // it can never visually stack on top of it) - move focus onto this
  // drawer's own close control when it opens, or a keyboard/AT user's
  // focus position is simply lost to <body>.
  useEffect(() => {
    if (mobileOpen) closeButtonRef.current?.focus();
  }, [mobileOpen]);

  // Mouse-drag resize (RTL-aware: the handle sits on the sidebar's inline-
  // end edge, so a drag toward the main content area always widens it,
  // regardless of text direction). Long nav labels (e.g. "سررسید مطالبات و
  // بدهی‌ها") still wrap at narrow widths rather than clip - dragging wider
  // is what lets them read on one line.
  const activeDragCleanupRef = useRef(null);

  function startResize(event) {
    event.preventDefault();
    setResizing(true);
    const startX = event.clientX;
    const startWidth = width;
    function onMove(moveEvent) {
      const delta = (moveEvent.clientX - startX) * (dir === "rtl" ? -1 : 1);
      setWidth(Math.min(420, Math.max(220, startWidth + delta)));
    }
    function onUp() {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      activeDragCleanupRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    activeDragCleanupRef.current = onUp;
  }

  // Belt-and-suspenders for the listeners above: `onUp` already removes
  // them on a normal mouseup, but if the sidebar itself were ever
  // unmounted mid-drag (e.g. during a logout), nothing would fire that
  // mouseup - this drops the same pair of listeners on unmount instead of
  // leaving them attached to `window` indefinitely.
  useEffect(() => {
    return () => activeDragCleanupRef.current?.();
  }, []);

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
        position: "relative",
        width: compact ? 86 : width,
        minWidth: compact ? 86 : width,
        height: "100vh",
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: 20,
        borderRight: dir === "ltr" ? "1px solid var(--erp-border)" : "none",
        borderLeft: dir === "rtl" ? "1px solid var(--erp-border)" : "none",
        padding: compact ? "18px 12px" : 18,
        transition: resizing ? "none" : "width .24s ease, min-width .24s ease",
      }}
    >
      {!compact && (
        <div
          onMouseDown={startResize}
          className="vitalix-sidebar-resize-handle"
          style={{ position: "absolute", top: 0, bottom: 0, insetInlineEnd: 0, width: 5, cursor: "ew-resize", zIndex: 21 }}
          aria-hidden="true"
        />
      )}
      {/* Mobile-drawer-only close control (CSS-hidden at desktop widths,
          same media query that turns .erp-sidebar into the off-canvas
          drawer) - calls MainLayout's restoreFocus-aware close path (see
          onCloseDrawer), same as the backdrop click and Escape key.
          Deliberately its own row, not merged into the brand row below:
          the Tooltip wrapper around the button is itself inline-flex
          (sizes to its single child only), so a margin-auto push on the
          button had no full-width context to push against - a dedicated
          block-level row with justify-content solves that reliably. */}
      <div className="erp-sidebar-mobile-close-row">
        <Tooltip
          side="end"
          label={fa ? "بستن منو" : language === "ar" ? "إغلاق القائمة" : language === "tr" ? "Menüyü kapat" : "Close menu"}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onCloseDrawer}
            className="erp-sidebar-mobile-close"
            aria-label={
              fa ? "بستن منو" : language === "ar" ? "إغلاق القائمة" : language === "tr" ? "Menüyü kapat" : "Close menu"
            }
          >
            <X size={18} />
          </button>
        </Tooltip>
      </div>
      {/* BRAND ZONE - logo gets its own full-width row on a lit "stage"
          (vignette + ambient cyan/gold halo, shared with Login's hero via
          .vitalix-brand-halo) instead of sharing horizontal space with the
          toolbar. The toolbar is a dedicated end-aligned row underneath -
          it never sits beside the logo, so it can't crowd or overlap it. */}
      <div
        className="vitalix-brand-halo flex flex-col items-center gap-2 mb-3"
        style={{
          paddingBlock: 10,
          paddingInline: 6,
          marginInline: -6,
          // A fading (not full-width solid) rule so the brand zone reads as
          // continuous with the context zone below it rather than two
          // stacked cards separated by a hard line.
          borderBottom: "1px solid transparent",
          borderImage: "linear-gradient(90deg, transparent, var(--erp-border) 25%, var(--erp-border) 75%, transparent) 1",
        }}
      >
        {compact ? (
          <BrandLogo variant="icon" size={38} />
        ) : (
          // "100%" (not a fixed px composite width) so this never
          // overflows the sidebar's own resizable range (220-420px) -
          // a fixed width sized for the default 280px would clip at the
          // narrow end of that range.
          <BrandLogo
            variant="compact"
            size="100%"
            subtitle={
              fa
                ? "نسخه سازمانی"
                : language === "ar"
                ? "الإصدار المؤسسي"
                : language === "tr"
                ? "Kurumsal Sürüm"
                : "Enterprise Suite"
            }
            productLabel={fa ? "حسابداری" : language === "ar" ? "المحاسبة" : language === "tr" ? "Muhasebe" : "Accounting"}
          />
        )}
        {/* Toolbar - its own bordered/filled pill so the theme+collapse
            toggles read as one grouped control, never sharing a row with
            the logo. Profile identity lives in its own section below (see
            ProfileMenu), deliberately not mixed into this utility pill. */}
        <div
          className={compact ? "vitalix-brand-toolbar flex flex-col items-center gap-1 p-1" : "vitalix-brand-toolbar flex items-center gap-1 p-1 self-end"}
          style={{
            borderRadius: "var(--erp-radius-lg)",
            border: "1px solid var(--erp-border)",
            background: "var(--erp-panel-solid)",
          }}
        >
          <Tooltip
            side="end"
            label={
              fa
                ? (isLight ? "حالت شب" : "حالت روز")
                : language === "ar"
                ? (isLight ? "التبديل إلى الوضع الداكن" : "التبديل إلى الوضع الفاتح")
                : language === "tr"
                ? (isLight ? "Karanlık moda geç" : "Aydınlık moda geç")
                : (isLight ? "Switch to dark mode" : "Switch to light mode")
            }
          >
            <button
              type="button"
              onClick={() => setTheme(isLight ? "midnight" : "light")}
              className="erp-accent rounded-[var(--erp-radius-sm)] p-2 cursor-pointer vitalix-toolbar-btn"
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
          </Tooltip>
          <Tooltip
            side="end"
            label={
              fa
                ? "جمع‌کردن منو"
                : language === "ar"
                ? "تبديل القائمة المدمجة"
                : language === "tr"
                ? "Kompakt menüyü aç/kapat"
                : "Toggle compact menu"
            }
          >
            <button
              type="button"
              onClick={() => setCompact((value) => !value)}
              className="erp-accent rounded-[var(--erp-radius-sm)] p-2 cursor-pointer vitalix-toolbar-btn vitalix-toolbar-collapse-btn"
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
          </Tooltip>
        </div>
      </div>

      {/* PROFILE - its own section directly below brand, deliberately
          separate from the theme/collapse toolbar above. Full identity
          card when expanded, avatar-only rail icon when compact. */}
      <div className={compact ? "flex justify-center mb-3" : "mb-3"}>
        <ProfileMenu compact={compact} />
      </div>

      {/* CONTEXT/UTILITY ZONE - search, language and company are rows of
          ONE bordered panel (hairline dividers between them via
          .vitalix-context-zone) instead of three separately-carded
          controls, and each row is compact (~36px) rather than a full
          44px control, since these are secondary/occasional actions. */}
      {!compact && (
        <div
          className="mb-3 flex flex-col vitalix-context-zone"
          style={{
            borderRadius: "var(--erp-radius-lg)",
            border: "1px solid var(--erp-border)",
            overflow: "hidden",
          }}
        >
          <label
            className="vitalix-input-group vitalix-input-group--flush flex items-center gap-2.5"
            style={{
              padding: "8px 12px",
              color: "var(--erp-text)",
            }}
          >
            <Search size={16} aria-hidden="true" style={{ color: "var(--erp-accent)", flexShrink: 0 }} />
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
              className="min-w-0 flex-1"
              style={{ color: "var(--erp-text)" }}
            />
            {query && (
              <Tooltip
                side="end"
                label={
                  fa
                    ? "پاک‌کردن جستجو"
                    : language === "ar"
                    ? "مسح البحث"
                    : language === "tr"
                    ? "Aramayı temizle"
                    : "Clear search"
                }
              >
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
              </Tooltip>
            )}
          </label>

          <LanguageSwitcher />
          <CompanySwitcher />
        </div>
      )}

      <nav className="flex flex-col gap-2">
        {visibleGroups.map((group) => (
          <section key={group.id}>
            {!compact && (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between sidebar-group-toggle"
                style={{
                  padding: "8px 13px",
                  borderRadius: "var(--erp-radius-md)",
                  color: expanded[group.id] ? "var(--erp-text)" : "var(--erp-muted)",
                  background: "transparent",
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
                aria-expanded={Boolean(expanded[group.id])}
              >
                <span>{groupLabel(group)}</span>
                <ChevronDown size={14} style={{ transform: expanded[group.id] ? "rotate(180deg)" : "none", transition: `transform var(--erp-duration-base) var(--erp-ease)` }} />
              </button>
            )}

            {(compact || query || expanded[group.id]) && (
              <div className="flex flex-col gap-0.5 mt-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Tooltip key={item.path} side="end" label={compact ? label(item) : null}>
                      <NavLink
                        to={item.path}
                        end={item.path === "/"}
                        onClick={onNavigate}
                        className={({ isActive }) => `sidebar-menu-item${isActive ? " is-active" : ""}`}
                        style={({ isActive }) => ({
                          display: "flex",
                          alignItems: "center",
                          gap: 11,
                          padding: compact ? "12px 0" : "10px 13px",
                          borderRadius: "var(--erp-radius-md)",
                          textDecoration: "none",
                          color: isActive ? "var(--erp-accent)" : "var(--erp-text)",
                          background: isActive ? "var(--erp-glow)" : "transparent",
                          borderInlineStart: isActive ? "3px solid var(--erp-accent)" : "3px solid transparent",
                          fontWeight: isActive ? 800 : 600,
                          justifyContent: compact ? "center" : (dir === "rtl" ? "flex-end" : "flex-start"),
                          flexDirection: dir === "rtl" && !compact ? "row-reverse" : "row",
                          whiteSpace: "nowrap",
                          width: "100%",
                        })}
                      >
                        <Icon size={19} className="sidebar-menu-icon" style={{ flexShrink: 0 }} />
                        <span
                          style={{
                            opacity: compact ? 0 : 1,
                            maxWidth: compact ? 0 : 200,
                            overflow: "hidden",
                            // Long labels (e.g. "سررسید مطالبات و بدهی‌ها")
                            // were getting hard-clipped mid-word instead of
                            // fully readable, because `white-space: nowrap`
                            // on the parent NavLink was inherited down here
                            // too. Wrapping to a second line - same fix
                            // already used for the top tab bar's own
                            // overflow complaint - keeps the label fully
                            // visible instead of cut off.
                            whiteSpace: compact ? "nowrap" : "normal",
                            wordBreak: "break-word",
                            lineHeight: 1.35,
                            transition: `opacity var(--erp-duration-base) var(--erp-ease), max-width var(--erp-duration-base) var(--erp-ease)`,
                          }}
                        >
                          {label(item)}
                        </span>
                      </NavLink>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </nav>
    </aside>
  );
}
