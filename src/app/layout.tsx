import type { Metadata } from 'next';
import Link from 'next/link';
import { getLastUpdated } from '@/lib/data';
import MobileNav from '@/components/MobileNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Intune Settings Catalog Viewer',
  description:
    'Browse, search, and explore all Microsoft Intune Settings Catalog definitions — fast, offline, and without needing Intune access.',
  keywords: [
    'Intune',
    'Settings Catalog',
    'Microsoft Endpoint Manager',
    'MDM',
    'Configuration',
    'Windows',
    'macOS',
    'iOS',
    'Android',
    'Linux',
  ],
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Detect mobile UA before first paint so CSS can apply larger touch targets */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){document.documentElement.classList.add('mobile-device')}}catch(e){}})()` }} />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* ── Header ── */}
        <header className="bg-[#1b1b1f] text-white shadow-md relative">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-14">
              <Link href="/" className="flex items-center gap-2.5 font-semibold text-[15px] tracking-[-0.01em] text-white hover:text-white/90 transition-colors">
                <svg className="w-5 h-5 text-[#60cdff]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94c0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.04 7.04 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
                </svg>
                <span className="hidden sm:inline">Intune Settings Catalog Viewer</span>
                <span className="sm:hidden">Intune Settings</span>
              </Link>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1 text-[14px]">
                <Link href="/" className="px-3 py-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                  Browse
                </Link>
                <Link href="/changelog/" className="px-3 py-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors" prefetch={false}>
                  Changelog
                </Link>
                <Link href="/about/" className="px-3 py-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                  About
                </Link>
                <div className="w-px h-5 bg-white/20 mx-1.5" aria-hidden="true" />
                <a
                  href="https://github.com/Lewis-Barry/IntuneSettingsCatalogViewer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="View on GitHub"
                  title="View on GitHub"
                >
                  <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                </a>
              </nav>

              {/* Mobile hamburger */}
              <MobileNav />
            </div>
          </div>
        </header>

        {/* ── Main Content ── */}
        <main className="flex-1">
          {children}
        </main>

        {/* ── Footer ── */}
        <footer className="border-t border-fluent-border bg-fluent-bg py-4">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-fluent-sm text-fluent-text-secondary">
            <p>
              Data sourced from Microsoft Graph API. Not affiliated with Microsoft.
            </p>
            <p>
              Last updated: <span className="font-medium">{(() => { const d = getLastUpdated(); return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'; })()}</span>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
