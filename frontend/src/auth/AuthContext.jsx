import { createContext, useContext, useEffect, useState } from "react";
import { API_URL } from "../services/api";

const AuthContext = createContext(null);
const USER_STORAGE_KEY = "vetrix_user";
const TOKEN_STORAGE_KEY = "vetrix_access_token";

function readStoredUser() {
  try {
    const value = localStorage.getItem(USER_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [authReady, setAuthReady] = useState(false);

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
          if (active) setUser(data.user);
        } else {
          localStorage.removeItem(USER_STORAGE_KEY);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          if (active) {
            setUser(null);
            setToken(null);
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

  async function login(username, password) {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.status !== "success" || !data?.access_token || !data?.user) {
      throw new Error(data?.message || data?.detail || "Unable to sign in");
    }

    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
    localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
    setUser(data.user);
    setToken(data.access_token);
    setAuthReady(true);
    return data.user;
  }

  function logout() {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setToken(null);
    setAuthReady(true);
  }

  return (
    <AuthContext.Provider value={{ user, token, authReady, login, logout }}>
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
