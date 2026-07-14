import { useState } from "react";
import { Menu } from "lucide-react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { useLanguage } from "../localization/LanguageContext";

export default function MainLayout() {
  const { dir, language } = useLanguage();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuLabel = language === "fa" ? "بازکردن منوی اصلی" : "Open main navigation";

  return (
    <div className="erp-layout" dir={dir}>
      <button
        type="button"
        className="erp-mobile-menu"
        onClick={() => setNavigationOpen(true)}
        aria-label={menuLabel}
        aria-expanded={navigationOpen}
        aria-controls="erp-primary-navigation"
      >
        <Menu size={22} aria-hidden="true" />
        <span>{language === "fa" ? "منو" : "Menu"}</span>
      </button>

      {navigationOpen && (
        <button
          type="button"
          className="erp-sidebar-backdrop"
          onClick={() => setNavigationOpen(false)}
          aria-label={language === "fa" ? "بستن منو" : "Close navigation"}
        />
      )}

      <Sidebar mobileOpen={navigationOpen} onNavigate={() => setNavigationOpen(false)} />

      <main id="main-content" className="erp-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
