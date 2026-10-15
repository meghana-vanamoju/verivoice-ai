/**
 * Colour-theme helpers.
 *
 * A single explicit preference is stored in localStorage. When the user has
 * not chosen a theme we fall back to the operating-system preference. The
 * early inline script in index.html applies the same decision before first
 * paint, so this module and that script must agree on the storage key and the
 * `data-theme` attribute.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "verivoice-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    // Storage can be unavailable (private mode, disabled cookies).
    return null;
  }
}

export function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function getInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
