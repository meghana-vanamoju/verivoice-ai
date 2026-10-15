import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getInitialTheme,
  getStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "../theme";

function persist(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures; the in-memory theme still applies.
  }
}

export interface UseThemeResult {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Owns the active theme, persists an explicit user choice, and follows the
 * system preference for as long as the user has not chosen one.
 */
export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [hasExplicitPreference, setHasExplicitPreference] = useState<boolean>(
    () => getStoredTheme() !== null,
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (hasExplicitPreference) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setThemeState(event.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [hasExplicitPreference]);

  const setTheme = useCallback((next: Theme) => {
    setHasExplicitPreference(true);
    persist(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
