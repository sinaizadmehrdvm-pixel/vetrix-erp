import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import OfflineStatusBanner from "../components/OfflineStatusBanner";
import { useLanguage } from "../localization/useLanguage";

export default function MainLayout() {
  const { dir, language } = useLanguage();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const menuLabel = language === "fa" ? "بازکردن منوی اصلی" : "Open main navigation";

  useEffect(() => {
    if (!navigationOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  function closeNavigation({ restoreFocus = false } = {}) {
    setNavigationOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  return (
    <div className="erp-layout" dir={dir}>
      <a className="erp-skip-link" href="#main-content">
        {language === "fa" ? "پرش به محتوای اصلی" : "Skip to main content"}
      </a>
      <button
        ref={menuButtonRef}
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
          onClick={() => closeNavigation({ restoreFocus: true })}
          aria-label={language === "fa" ? "بستن منو" : "Close navigation"}
        />
      )}

      <Sidebar mobileOpen={navigationOpen} onNavigate={() => closeNavigation()} />

      <main id="main-content" className="erp-main" tabIndex={-1}>
        <OfflineStatusBanner />
        <Outlet />
      </main>
    </div>
  );
}
