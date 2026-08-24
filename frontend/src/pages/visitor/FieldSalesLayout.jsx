import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CalendarClock, Users, ClipboardList, Receipt, Wallet, TrendingUp, WifiOff, Clock, ShoppingCart } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useAuth } from "../../auth/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import { FieldSalesProvider } from "./FieldSalesContext";
import { useFieldSales } from "./useFieldSales";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import Tabs from "../../components/ui/Tabs";

const ROLE_LABELS = {
  admin: { fa: "مدیر سیستم", ar: "مسؤول النظام", tr: "Yönetici", en: "Administrator" },
  accountant: { fa: "حسابدار", ar: "محاسب", tr: "Muhasebeci", en: "Accountant" },
  sales: { fa: "نماینده فروش میدانی", ar: "مندوب مبيعات ميداني", tr: "Saha satış temsilcisi", en: "Field sales representative" },
  warehouse: { fa: "انباردار", ar: "أمين المستودع", tr: "Depo Sorumlusu", en: "Warehouse" },
  viewer: { fa: "مشاهده‌گر", ar: "مشاهدة فقط", tr: "Salt okunur", en: "Viewer" },
};

// Internal views live inside /visitor itself (switched via context, not
// routing) - only "visits" is a real separate route. Clicking Orders/
// Collections/Performance/Customers/Today never leaves the module; this is
// the direct fix for the "behaves like dashboard + links to other ERP
// pages" complaint.
const COMMAND_ITEMS = [
  { view: "today", icon: CalendarClock, label: { fa: "امروز", ar: "اليوم", tr: "Bugün", en: "Today" } },
  { view: "customers", icon: Users, label: { fa: "مشتریان", ar: "العملاء", tr: "Müşteriler", en: "Customers" } },
  { route: "/visitor/visits", icon: ClipboardList, label: { fa: "ویزیت‌ها", ar: "الزيارات", tr: "Ziyaretler", en: "Visits" } },
  { view: "orders", icon: Receipt, label: { fa: "سفارش‌ها", ar: "الطلبات", tr: "Siparişler", en: "Orders" } },
  { view: "collections", icon: Wallet, label: { fa: "دریافت و پرداخت", ar: "المقبوضات والمدفوعات", tr: "Tahsilat ve ödeme", en: "Collections" } },
  { view: "performance", icon: TrendingUp, label: { fa: "عملکرد", ar: "الأداء", tr: "Performans", en: "Performance" } },
];

function IdentityAndCommandBar() {
  const { language, n } = useLanguage();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeView, setActiveView, summary, activeVisit, activeCustomer, salesToday, paymentsToday, remainingToday } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const roleLabel = ROLE_LABELS[user?.role]?.[language] || ROLE_LABELS[user?.role]?.en || user?.role || "";
  const initial = (user?.full_name || user?.username || "?").trim().charAt(0).toLocaleUpperCase(language);
  const onVisitsRoute = location.pathname === "/visitor/visits";

  function goto(item) {
    if (item.route) {
      navigate(item.route);
      return;
    }
    setActiveView(item.view);
    if (onVisitsRoute) navigate("/visitor");
  }

  return (
    <div className="mb-4">
      {/* Visitor Command Strip - real fields only (auth user + today's own
          field-visit summary), no invented branch/territory/quota. Given
          its own bordered surface (instead of floating bare text at the
          page top) so it reads as "this is the logged-in rep's workspace"
          at a glance, while staying a single compact row on desktop. */}
      <div
        className="flex items-center justify-between gap-4 flex-wrap mb-3"
        style={{ padding: "10px 14px", background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-lg)" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative inline-flex shrink-0">
            <span
              className="inline-flex items-center justify-center"
              style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "var(--erp-on-accent)", fontWeight: 900, fontSize: 15 }}
              aria-hidden="true"
            >
              {initial}
            </span>
            <span
              className="absolute"
              style={{ bottom: -1, insetInlineEnd: -1, width: 10, height: 10, borderRadius: "50%", background: online ? "var(--erp-success)" : "var(--erp-muted)", border: "2px solid var(--erp-panel-solid)" }}
              title={online ? tr("آنلاین", "متصل", "Çevrimiçi", "Online") : tr("آفلاین", "غير متصل", "Çevrimdışı", "Offline")}
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="truncate" style={{ fontWeight: 900, fontSize: 15 }}>{user?.full_name || user?.username}</span>
              <span style={{ fontSize: 11.5, color: "var(--erp-muted)" }}>· {roleLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeVisit ? (
                <span className="inline-flex items-center gap-1" style={{ fontSize: 10.5, fontWeight: 800, color: "var(--erp-accent)", background: "var(--erp-glow)", borderRadius: "var(--erp-radius-sm)", padding: "1px 7px" }}>
                  <Clock size={10} className="animate-pulse" /> {tr("در حال ویزیت", "زيارة جارية", "Ziyarette", "On a visit")}{activeCustomer ? ` · ${activeCustomer.name}` : ""}
                </span>
              ) : (
                <span style={{ fontSize: 10.5, color: "var(--erp-muted)" }}>{tr("بدون ویزیت فعال", "لا زيارة نشطة", "Aktif ziyaret yok", "No active visit")}</span>
              )}
              {!online && (
                <span className="inline-flex items-center gap-1" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--erp-warning)", background: "var(--erp-warning-soft)", borderRadius: "var(--erp-radius-sm)", padding: "1px 7px" }}>
                  <WifiOff size={10} /> {tr("آفلاین", "غير متصل", "Çevrimdışı", "Offline")}
                </span>
              )}
            </div>
          </div>
        </div>

        {summary && (
          <div className="flex items-center gap-3.5 flex-wrap" style={{ fontSize: 12 }}>
            <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>
              <ClipboardList size={13} color="var(--erp-accent)" />
              {tr(`${n(summary.today.visits)}/${n(summary.today.visits + remainingToday)} ویزیت`, `${n(summary.today.visits)}/${n(summary.today.visits + remainingToday)} زيارة`, `${n(summary.today.visits)}/${n(summary.today.visits + remainingToday)} ziyaret`, `${n(summary.today.visits)}/${n(summary.today.visits + remainingToday)} visits`)}
            </span>
            <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>
              <ShoppingCart size={13} color="var(--erp-accent)" /> {n(summary.today.orders)} {tr("سفارش", "طلب", "sipariş", "orders")}
            </span>
            <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>
              {tr("فروش", "المبيعات", "Satış", "Sales")}: <MoneyDisplay value={salesToday} compact fontSize={12} />
            </span>
            <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>
              {tr("وصول", "التحصيل", "Tahsilat", "Collections")}: <MoneyDisplay value={paymentsToday} compact fontSize={12} />
            </span>
            <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>
              <TrendingUp size={13} color="var(--erp-success)" /> {n(summary.today.conversion_rate)}%
            </span>
          </div>
        )}
      </div>

      <Tabs
        tabs={COMMAND_ITEMS.map((item) => ({ id: item.route || item.view, label: item.label[language] || item.label.en, icon: item.icon }))}
        activeId={onVisitsRoute ? "/visitor/visits" : activeView}
        onChange={(id) => goto(COMMAND_ITEMS.find((item) => (item.route || item.view) === id))}
      />
    </div>
  );
}

function FieldSalesShellInner() {
  const { dir } = useLanguage();
  return (
    // maxWidth+overflowX contain any stray wide child (a long untranslated
    // string, a not-yet-audited third-party control) to this module instead
    // of it leaking into a page-level horizontal scrollbar - the same
    // containment Modal.jsx already applies to its own panel. Select's and
    // JalaliDateField's popups are unaffected: both portal to
    // document.body with position:fixed, so neither is a descendant of
    // this element for overflow-clipping purposes.
    <div dir={dir} style={{ maxWidth: "100%", overflowX: "hidden" }}>
      <IdentityAndCommandBar />
      <Outlet />
    </div>
  );
}

export default function FieldSalesLayout() {
  return (
    <FieldSalesProvider>
      <FieldSalesShellInner />
    </FieldSalesProvider>
  );
}
