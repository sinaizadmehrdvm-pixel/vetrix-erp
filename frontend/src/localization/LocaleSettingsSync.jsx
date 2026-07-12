import { useEffect } from "react";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "./LanguageContext";
import { API_URL, getAuthHeaders } from "../services/api";

const COUNTRY_STORAGE_KEY = "vetrix_country";

export default function LocaleSettingsSync() {
  const { user, authReady } = useAuth();
  const { country, setCountry } = useLanguage();

  useEffect(() => {
    if (!authReady || !user) return undefined;
    let active = true;

    fetch(`${API_URL}/settings`, { headers: getAuthHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.status === "error") return;
        const serverCountry = String(data.country_code || "").toUpperCase();
        if (active && serverCountry && serverCountry !== country) {
          setCountry(serverCountry);
        }
      })
      .catch(() => {
        // Offline desktop startup keeps the last verified local profile.
        const fallback = localStorage.getItem(COUNTRY_STORAGE_KEY);
        if (active && fallback && fallback !== country) setCountry(fallback);
      });

    return () => { active = false; };
  }, [authReady, user, country, setCountry]);

  return null;
}
