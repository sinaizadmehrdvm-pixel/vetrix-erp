import { NavLink, useNavigate } from "react-router-dom";
import { Users, ClipboardList, ShoppingCart, LogOut, WifiOff, LayoutDashboard } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useAuth } from "../../auth/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";

// Deliberately NOT the desktop Sidebar/MainLayout - this is a separate,
// minimal, bottom-tab shell for the Visitor (field sales rep) module, sized
// and laid out for a phone screen used one-handed in the field.
export default function VisitorLayout({ children, title }) {
  const { language, dir } = useLanguage();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const tabs = [
    { to: "/visitor", icon: Users, label: tr("مشتریان", "العملاء", "Müşteriler", "Customers"), end: true },
    { to: "/visitor/visits", icon: ClipboardList, label: tr("ویزیت‌ها", "الزيارات", "Ziyaretler", "Visits") },
  ];

  return (
    <div
      dir={dir}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--erp-bg)",
        color: "var(--erp-text)",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          position: "sticky", top: 0, zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", background: "var(--erp-panel-solid)",
          borderBottom: "1px solid var(--erp-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShoppingCart size={22} color="var(--erp-accent)" />
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{title || tr("ویزیتور", "المندوب", "Saha Satış", "Visitor")}</div>
            {!online && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#fbbf24", marginTop: 2 }}>
                <WifiOff size={12} />
                {tr("آفلاین — ذخیره محلی می‌شود", "غير متصل — يُحفظ محليًا", "Çevrimdışı — yerel olarak kaydedilir", "Offline — saving locally")}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label={tr("بازگشت به پنل اصلی", "العودة إلى اللوحة الرئيسية", "Ana panele dön", "Back to main dashboard")}
            title={tr("بازگشت به پنل اصلی", "العودة إلى اللوحة الرئيسية", "Ana panele dön", "Back to main dashboard")}
            style={{ background: "transparent", border: 0, color: "var(--erp-muted)", padding: 8 }}
          >
            <LayoutDashboard size={20} />
          </button>
          <button
            type="button"
            onClick={() => { logout(); navigate("/login"); }}
            aria-label={tr("خروج", "خروج", "Çıkış", "Log out")}
            style={{ background: "transparent", border: 0, color: "var(--erp-muted)", padding: 8 }}
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: 14, paddingBottom: 90, overflowY: "auto" }}>{children}</main>

      <nav
        style={{
          position: "fixed", bottom: 0, insetInlineStart: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 560, display: "flex",
          background: "var(--erp-panel-solid)", borderTop: "1px solid var(--erp-border)",
          boxShadow: "0 -8px 24px rgba(0,0,0,.15)",
        }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            style={({ isActive }) => ({
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              padding: "10px 0 12px", textDecoration: "none",
              color: isActive ? "var(--erp-accent)" : "var(--erp-muted)",
              fontWeight: isActive ? 900 : 700, fontSize: 12,
            })}
          >
            <tab.icon size={20} />
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
