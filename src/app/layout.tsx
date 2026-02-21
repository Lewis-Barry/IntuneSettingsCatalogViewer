import type { Metadata } from 'next';
import Link from 'next/link';
import { getLastUpdated } from '@/lib/data';
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* ── Header ── */}
        <header className="bg-fluent-blue text-white">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-12">
              <Link href="/" className="flex items-center gap-2 font-semibold text-fluent-base hover:opacity-90">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94c0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.04 7.04 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
                </svg>
                Intune Settings Catalog Viewer
              </Link>
              <nav className="flex items-center gap-4 text-fluent-sm">
                <Link href="/" className="hover:underline underline-offset-4">
                  Browse
                </Link>
                <Link href="/changelog/" className="hover:underline underline-offset-4" prefetch={false}>
                  Changelog
                </Link>
                <Link href="/about/" className="hover:underline underline-offset-4">
                  About
                </Link>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline underline-offset-4"
                >
                  GitHub
                </a>
              </nav>
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
