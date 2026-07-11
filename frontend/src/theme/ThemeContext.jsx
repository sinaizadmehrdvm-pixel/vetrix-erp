import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const THEMES = [
  { id: "midnight", fa: "نیمه‌شب آبی", en: "Midnight Blue", accent: "#22d3ee" },
  { id: "ocean", fa: "اقیانوسی", en: "Ocean", accent: "#38bdf8" },
  { id: "emerald", fa: "زمردی", en: "Emerald", accent: "#34d399" },
  { id: "violet", fa: "بنفش", en: "Violet", accent: "#a78bfa" },
  { id: "rose", fa: "رز", en: "Rose", accent: "#fb7185" },
  { id: "gold", fa: "طلایی", en: "Gold", accent: "#fbbf24" },
  { id: "light", fa: "روشن", en: "Light", accent: "#0284c7" },
];

const ThemeContext = createContext(null);
const STORAGE_KEY = "vetrix-theme";

function normalizeTheme(value) {
  if (value === "dark" || value === "neon") return "midnight";
  return THEMES.some((item) => item.id === value) ? value : "midnight";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => normalizeTheme(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme === "light" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      themes: THEMES,
      setTheme: (nextTheme) => setThemeState(normalizeTheme(nextTheme)),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
