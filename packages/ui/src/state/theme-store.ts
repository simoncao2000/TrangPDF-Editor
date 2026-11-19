/**
 * The colour theme the user picked. "system" follows the operating system through CSS
 * (`prefers-color-scheme`); "light" and "dark" set `data-theme` on <html>, which the palettes read.
 */
import { create } from "zustand";

export type ThemePreference = "system" | "light" | "dark";

/** Also read by the inline script in the app's index.html, so the first paint is already themed. */
export const THEME_STORAGE_KEY = "trangpdf-theme";

/**
 * Reads the saved choice. Storage can be blocked (private mode); then the system theme is used.
 * @returns The saved preference, or "system".
 */
function readSaved(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/**
 * Applies a preference to the page and remembers it.
 * @param preference The choice to apply.
 */
function apply(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked: the choice still applies until the page reloads.
  }
}

interface ThemeState {
  readonly preference: ThemePreference;
  setPreference(preference: ThemePreference): void;
}

export const useTheme = create<ThemeState>((set) => ({
  preference: readSaved(),
  setPreference: (preference) => {
    apply(preference);
    set({ preference });
  },
}));
