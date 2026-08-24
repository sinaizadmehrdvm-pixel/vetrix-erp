import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, User, Settings2, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { useOnlineStatus } from "../pages/visitor/useOnlineStatus";
import UserAvatar from "./ui/UserAvatar";
import Tooltip from "./ui/Tooltip";
import ProfileSettingsModal from "./ProfileSettingsModal";

// Kept file-local (not shared with FieldSalesLayout.jsx's own role labels,
// which are worded for that module specifically) since this is the
// generic, app-wide identity badge - falls back to the raw role code for
// any custom role created via Settings > Custom Roles.
const ROLE_LABELS = {
  admin: { fa: "مدیر سیستم", ar: "مسؤول النظام", tr: "Yönetici", en: "Administrator" },
  accountant: { fa: "حسابدار", ar: "محاسب", tr: "Muhasebeci", en: "Accountant" },
  sales: { fa: "کارشناس فروش", ar: "مندوب مبيعات", tr: "Satış temsilcisi", en: "Sales" },
  warehouse: { fa: "انباردار", ar: "أمين المستودع", tr: "Depo sorumlusu", en: "Warehouse" },
  viewer: { fa: "مشاهده‌گر", ar: "مشاهدة فقط", tr: "Salt okunur", en: "Viewer" },
};

function roleLabel(role, language) {
  return ROLE_LABELS[role]?.[language] || ROLE_LABELS[role]?.en || role || "";
}

// The "shown on every page" identity widget Sidebar mounts directly below
// the brand zone (own section, deliberately not sharing the theme/collapse
// toolbar pill) - avatar + name + role + a real online/offline dot (from
// navigator.onLine via useOnlineStatus, not a fabricated presence system).
// Clicking it opens a small menu (My Profile / Account settings & security
// / Logout) instead of jumping straight to the edit modal.
export default function ProfileMenu({ compact = false }) {
  const { user, logout } = useAuth();
  const { language, dir } = useLanguage();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const reduceMotion = useReducedMotion();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Bumped on every "My Profile" click so ProfileSettingsModal (which stays
  // mounted between opens) remounts with fresh useState initializers from
  // the latest `user`, instead of needing an effect to resync stale state.
  const [modalKey, setModalKey] = useState(0);

  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuBox, setMenuBox] = useState(null);

  useEffect(() => {
    function handleOutside(event) {
      if (triggerRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 10;
      const menuEl = menuRef.current;
      const menuWidth = menuEl ? menuEl.getBoundingClientRect().width : 232;
      const menuHeight = menuEl ? menuEl.getBoundingClientRect().height : 176;
      let left = dir === "rtl" ? rect.right - menuWidth : rect.left;
      if (left < margin) left = margin;
      if (left + menuWidth > window.innerWidth - margin) left = window.innerWidth - margin - menuWidth;
      const spaceBelow = window.innerHeight - rect.bottom;
      const upward = spaceBelow < menuHeight + 16 && rect.top > spaceBelow;
      setMenuBox(
        upward
          ? { left, bottom: window.innerHeight - rect.top + 8 }
          : { left, top: rect.bottom + 8 }
      );
    }

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    let rafId = null;
    function onScrollOrResize() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(raf);
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, dir]);

  if (!user) return null;

  const displayName = user.full_name || user.username;
  const roleText = roleLabel(user.role, language);
  const onlineLabel = online ? tr("آنلاین", "متصل", "Çevrimiçi", "Online") : tr("آفلاین", "غير متصل", "Çevrimdışı", "Offline");
  const menuLabel = tr("منوی پروفایل", "قائمة الملف الشخصي", "Profil menüsü", "Profile menu");

  function openProfileModal() {
    setModalKey((k) => k + 1);
    setModalOpen(true);
    setOpen(false);
  }
  function goToAccountSecurity() {
    setOpen(false);
    navigate("/account-security");
  }
  function handleLogout() {
    setOpen(false);
    logout();
    navigate("/login");
  }

  const statusDot = (size) => (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        bottom: -1,
        insetInlineEnd: -1,
        width: size,
        height: size,
        borderRadius: "50%",
        background: online ? "var(--erp-success)" : "var(--erp-muted)",
        border: "2px solid var(--erp-panel-solid)",
      }}
    />
  );

  return (
    <>
      {compact ? (
        <Tooltip side="end" label={`${displayName} · ${roleText} · ${onlineLabel}`}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="vitalix-toolbar-btn"
            style={{ display: "flex", justifyContent: "center" }}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={menuLabel}
          >
            <span className="relative inline-flex">
              <UserAvatar name={displayName} avatarData={user.avatar_data} size={34} />
              {statusDot(9)}
            </span>
          </button>
        </Tooltip>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full hover:bg-[var(--erp-glow)]"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 11px",
            borderRadius: "var(--erp-radius-lg)",
            border: "1px solid var(--erp-border)",
            background: "var(--erp-panel-solid)",
            // Deliberately plain "row", not dir-based row-reverse: flexbox
            // already mirrors `row` on its own once `direction` (inherited
            // from MainLayout's dir="rtl"/"ltr" root) is rtl - explicitly
            // reversing it on top of that undid the mirroring and made the
            // card render avatar-left/chevron-right even in fa/ar, i.e.
            // it looked LTR regardless of language. Avatar (first DOM
            // child) lands on the reading-start edge either way: right in
            // rtl, left in ltr - exactly what's wanted here.
            flexDirection: "row",
            textAlign: "start",
            transition: `background-color var(--erp-duration-fast) var(--erp-ease)`,
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={menuLabel}
        >
          <span className="relative inline-flex shrink-0">
            <UserAvatar name={displayName} avatarData={user.avatar_data} size={44} />
            {statusDot(11)}
          </span>
          <Tooltip side="top" label={displayName}>
            <span className="min-w-0 flex-1">
              <span className="block truncate" style={{ fontSize: 14, fontWeight: 800, color: "var(--erp-text)" }}>
                {displayName}
              </span>
              <span className="block truncate" style={{ fontSize: 11.5, color: "var(--erp-muted)" }}>{roleText}</span>
            </span>
          </Tooltip>
          <ChevronDown
            size={16}
            style={{
              color: "var(--erp-muted)",
              flexShrink: 0,
              transform: open ? "rotate(180deg)" : "none",
              transition: `transform var(--erp-duration-fast) var(--erp-ease)`,
            }}
          />
        </button>
      )}

      {createPortal(
        <AnimatePresence>
          {open && menuBox && (
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label={menuLabel}
              dir={dir}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.4, 0, 0.2, 1] }}
              style={{
                position: "fixed",
                left: menuBox.left,
                top: menuBox.top,
                bottom: menuBox.bottom,
                width: 232,
                zIndex: 1000,
                borderRadius: "var(--erp-radius-lg)",
                border: "1px solid var(--erp-border)",
                background: "var(--erp-panel-solid)",
                boxShadow: "var(--erp-elevation-3)",
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <MenuRow icon={User} label={tr("پروفایل من", "ملفي الشخصي", "Profilim", "My Profile")} onClick={openProfileModal} />
              <MenuRow
                icon={Settings2}
                label={tr("تنظیمات و امنیت حساب", "إعدادات وأمان الحساب", "Hesap ayarları ve güvenliği", "Account settings & security")}
                onClick={goToAccountSecurity}
              />
              <div style={{ height: 1, background: "var(--erp-border)", margin: "4px 2px" }} />
              <MenuRow icon={LogOut} label={tr("خروج", "تسجيل الخروج", "Çıkış yap", "Logout")} onClick={handleLogout} tone="danger" />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <ProfileSettingsModal key={modalKey} open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function MenuRow({ icon: Icon, label, onClick, tone }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 hover:bg-[var(--erp-glow)]"
      style={{
        padding: "9px 10px",
        borderRadius: "var(--erp-radius-md)",
        color: tone === "danger" ? "var(--erp-danger)" : "var(--erp-text)",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "start",
        transition: `background-color var(--erp-duration-fast) var(--erp-ease)`,
      }}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      {label}
    </button>
  );
}
