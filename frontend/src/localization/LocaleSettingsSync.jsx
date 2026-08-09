import { useEffect } from "react";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "./useLanguage";
import { API_URL, getAuthHeaders } from "../services/api";

const COUNTRY_STORAGE_KEY = "vetrix_country";

export default function LocaleSettingsSync() {
  const { user, authReady } = useAuth();
  const { setCountry, setCompanyFormatting } = useLanguage();

  useEffect(() => {
    if (!authReady || !user) return undefined;
    let active = true;

    fetch(`${API_URL}/settings`, { headers: getAuthHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.status === "error") return;
        const serverCountry = String(data.country_code || "").toUpperCase();
        if (active && serverCountry) {
          setCountry(serverCountry);
        }
        if (active) setCompanyFormatting(data);
      })
      .catch(() => {
        // Offline desktop startup keeps the last verified local profile.
        const fallback = localStorage.getItem(COUNTRY_STORAGE_KEY);
        if (active && fallback) setCountry(fallback);
      });

    return () => { active = false; };
    // Deliberately runs once per login session (authReady/user only) - NOT
    // whenever `country`/companyFormatting change. Those are live, unsaved
    // edits the Settings page applies immediately as the user picks a new
    // country/currency/etc; re-running this effect on that change would
    // re-fetch the still-old saved value from the server and instantly snap
    // the live selection back (the exact "picking a country reverts to Iran"
    // bug this once-per-session sync avoids).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  return null;
}
