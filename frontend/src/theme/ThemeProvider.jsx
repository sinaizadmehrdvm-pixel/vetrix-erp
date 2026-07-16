import { useEffect, useMemo, useState } from "react";
import { ThemeContext } from "./themeContext";
import { THEMES } from "./themes";

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

