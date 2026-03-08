'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/** Mobile navigation hamburger menu — rendered only below `md` breakpoint via CSS. */
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  };

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open}
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute top-14 left-0 right-0 bg-[#1b1b1f] border-t border-white/10 shadow-lg z-50">
          <nav className="flex flex-col py-2 px-4">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="px-3 py-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors text-[15px]"
            >
              Browse
            </Link>
            <Link
              href="/baseline/"
              onClick={() => setOpen(false)}
              className="px-3 py-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors text-[15px]"
            >
              Baseline
            </Link>
            <Link
              href="/changelog/"
              onClick={() => setOpen(false)}
              className="px-3 py-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors text-[15px]"
              prefetch={false}
            >
              Changelog
            </Link>
            <Link
              href="/about/"
              onClick={() => setOpen(false)}
              className="px-3 py-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors text-[15px]"
            >
              About
            </Link>
            <a
              href="https://github.com/Lewis-Barry/IntuneSettingsCatalogViewer"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors text-[15px] flex items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
            <button
              onClick={toggleTheme}
              className="px-3 py-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors text-[15px] flex items-center gap-2 w-full text-left"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
