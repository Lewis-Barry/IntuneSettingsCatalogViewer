'use client';

import { useEffect, useState } from 'react';
import { applySiteTheme, getNextTheme, getStoredTheme, type SiteTheme } from '@/lib/theme';

/**
 * Theme toggle that persists the user's theme choice in localStorage.
 * Defaults to dark mode if no preference has been saved.
 * Rendered in the header next to the GitHub link.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<SiteTheme>('dark');

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  const toggle = () => {
    const nextTheme = getNextTheme(theme);
    setTheme(nextTheme);
    applySiteTheme(nextTheme);
  };

  const nextTheme = getNextTheme(theme);
  const label = `Switch to ${nextTheme === 'cobalt2' ? 'Cobalt2' : nextTheme} theme`;

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
        </svg>
      ) : theme === 'cobalt2' ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12.25h.01M12 8.25h.01M15.75 12.25h.01M10.25 15.5h3.5" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
