/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { API_URL } from "../services/api";
import { useLanguage } from "../localization/useLanguage";

// The backend's global auth middleware (main.py) returns these two exact
// detail strings whenever a request's bearer token is missing, malformed,
// or expired - as opposed to other 401s (wrong password, bad MFA code)
// that carry their own specific detail text and must NOT force a logout.
const SESSION_EXPIRED_DETAILS = new Set(["Invalid or expired token", "Authentication required"]);

const AuthContext = createContext(null);
const USER_STORAGE_KEY = "vetrix_user";
const TOKEN_STORAGE_KEY = "vetrix_access_token";
// Milestone 4: the company context currently active on this token - only
// ever differs from user.company_id for a super-admin who has switched
// (see CompanySwitcher.jsx / switchCompanyContext below).
const ACTIVE_COMPANY_STORAGE_KEY = "vetrix_active_company";

function readStoredUser() {
  try {
    const value = localStorage.getItem(USER_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

function readStoredActiveCompany() {
  try {
    const value = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [activeCompany, setActiveCompany] = useState(readStoredActiveCompany);
  const [authReady, setAuthReady] = useState(false);
  const { language } = useLanguage();
  const expiredHandledRef = useRef(false);

  // Every page makes its own authenticated fetch() calls (several through
  // ad hoc local helpers rather than the shared api.js), so a per-page 401
  // handler can't offer full coverage. Patching the global fetch here once
  // gives every call in the app the same behavior: if the session token
  // has gone stale (expired, or simply never sent), clear it and drop the
  // user back to /login with a message in their language instead of
  // leaving a raw English "Invalid or expired token" toast on whatever
  // page they happened to be on.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401 && !expiredHandledRef.current) {
        try {
          const data = await response.clone().json();
          if (SESSION_EXPIRED_DETAILS.has(data?.detail)) {
            expiredHandledRef.current = true;
            localStorage.removeItem(USER_STORAGE_KEY);
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            setUser(null);
            setToken(null);
            toast.error(
              language === "fa"
                ? "نشست شما منقضی شده است؛ دوباره وارد شوید."
                : language === "ar"
                ? "انتهت صلاحية جلستك؛ يرجى تسجيل الدخول مرة أخرى."
                : language === "tr"
                ? "Oturumunuzun süresi doldu; lütfen tekrar giriş yapın."
                : "Your session has expired; please sign in again."
            );
          }
        } catch {
          // Non-JSON or already-consumed body - nothing to detect here.
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [language]);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!token || !readStoredUser()) {
        if (active) setAuthReady(true);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);

        if (response.ok && data?.status === "success" && data.user) {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
          localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, JSON.stringify(data.active_company || null));
          if (active) {
            setUser(data.user);
            setActiveCompany(data.active_company || null);
          }
        } else {
          localStorage.removeItem(USER_STORAGE_KEY);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
          if (active) {
            setUser(null);
            setToken(null);
            setActiveCompany(null);
          }
        }
      } catch {
        // Keep the locally restored session when the backend is temporarily offline.
      } finally {
        if (active) setAuthReady(true);
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, [token]);

  async function refreshCurrentUser() {
    const response = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_STORAGE_KEY)}` },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.status !== "success" || !data?.user) {
      throw new Error(data?.detail || data?.message || "Unable to refresh session");
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function changePassword(currentPassword, newPassword) {
    const response = await fetch(`${API_URL}/users/me/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem(TOKEN_STORAGE_KEY)}`,
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.status !== "updated" || !data?.user) {
      throw new Error(data?.detail || data?.message || "Unable to change password");
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
    setUser(data.user);
    // Changing your own password revokes the token that made this request;
    // the backend hands back a fresh one so this session keeps working.
    if (data.access_token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
      setToken(data.access_token);
    }
    return data.user;
  }

  function applyRefreshedToken(newToken) {
    if (!newToken) return;
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    expiredHandledRef.current = false;
  }

  function applySignedInSession(data) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
    localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
    localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, JSON.stringify(data.active_company || null));
    setUser(data.user);
    setToken(data.access_token);
    setActiveCompany(data.active_company || null);
    setAuthReady(true);
    expiredHandledRef.current = false;
    return data.user;
  }

  // Milestone 4: a super-admin entering a different company's context.
  // `result` is companiesApi.switchCompany()'s response
  // ({ access_token, active_company }) - identity/role stay the same,
  // only the JWT's company_id claim (and therefore every company-scoped
  // query in the app) changes.
  async function switchCompanyContext(result) {
    applyRefreshedToken(result.access_token);
    localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, JSON.stringify(result.active_company || null));
    setActiveCompany(result.active_company || null);
  }

  async function login(username, password) {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message || data?.detail || "Unable to sign in");
    }
    if (data?.status === "mfa_required" && data?.mfa_token) {
      return { mfaRequired: true, mfaToken: data.mfa_token };
    }
    if (data?.status !== "success" || !data?.access_token || !data?.user) {
      throw new Error(data?.message || data?.detail || "Unable to sign in");
    }

    return applySignedInSession(data);
  }

  async function completeTotpLogin(mfaToken, code) {
    const response = await fetch(`${API_URL}/login/totp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfa_token: mfaToken, code }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.status !== "success" || !data?.access_token || !data?.user) {
      throw new Error(data?.message || data?.detail || "Invalid code");
    }

    return applySignedInSession(data);
  }

  function logout() {
    const activeToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (activeToken) {
      // Best-effort server-side revocation; local sign-out proceeds regardless.
      fetch(`${API_URL}/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${activeToken}` },
      }).catch(() => {});
    }
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    setUser(null);
    setToken(null);
    setActiveCompany(null);
    setAuthReady(true);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeCompany,
        authReady,
        login,
        logout,
        changePassword,
        refreshCurrentUser,
        applyRefreshedToken,
        switchCompanyContext,
        completeTotpLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
