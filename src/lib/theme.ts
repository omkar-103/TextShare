/**
 * Theme management: light-first, persisted across refreshes.
 * New visitors get light mode regardless of OS preference.
 * Explicit choices are persisted in localStorage.
 */

const THEME_KEY = 'textshare_theme_v1';

export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
    return null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

/**
 * Returns the effective theme to apply:
 * - explicit stored choice wins
 * - else: light (we intentionally ignore OS preference for new visitors)
 */
export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? 'light';
}

/**
 * Apply the theme class to <html> element and prevent FOUC.
 * Call synchronously before React hydrates.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
