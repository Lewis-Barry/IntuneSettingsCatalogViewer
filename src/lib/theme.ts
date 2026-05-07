export type SiteTheme = 'light' | 'dark' | 'cobalt2';

export const THEME_STORAGE_KEY = 'theme';

export function getStoredTheme(): SiteTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'cobalt2' ? raw : 'dark';
  } catch {
    return 'dark';
  }
}

export function applySiteTheme(theme: SiteTheme) {
  document.documentElement.classList.toggle('dark', theme !== 'light');
  document.documentElement.classList.toggle('cobalt2', theme === 'cobalt2');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The class changes still apply for this session if storage is unavailable.
  }
}

export function getNextTheme(theme: SiteTheme): SiteTheme {
  if (theme === 'dark') return 'cobalt2';
  if (theme === 'cobalt2') return 'light';
  return 'dark';
}
