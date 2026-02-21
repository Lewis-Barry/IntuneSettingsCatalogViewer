import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — Intune Settings Catalog Viewer',
  description: 'Learn about the Intune Settings Catalog Viewer, how it works, and how data is sourced.',
};

export default function AboutPage() {
  return (
    <div>
      {/* ── Hero Banner ── */}
      <section className="bg-gradient-to-br from-[#0078d4] to-[#005a9e] text-white">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-16 sm:py-24 text-center">
          <h1 className="text-[36px] leading-[44px] sm:text-[46px] sm:leading-[56px] font-semibold tracking-tight">
            Intune Settings Catalog Viewer
          </h1>
          <p className="mt-4 text-[18px] leading-[28px] sm:text-[20px] sm:leading-[30px] text-white/85 max-w-2xl mx-auto">
            Browse, search, and explore every Microsoft Intune Settings Catalog definition — fast, free, and without needing Intune access. Hosted on GitHub Pages and updated daily.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center px-8 py-3 bg-white text-[#0078d4] text-[15px] font-semibold rounded hover:bg-white/90 transition-colors"
            >
              Start browsing
            </Link>
            <Link
              href="/changelog/"
              className="inline-flex items-center px-8 py-3 border border-white/50 text-white text-[15px] font-semibold rounded hover:bg-white/10 transition-colors"
            >
              View changelog
            </Link>
          </div>
        </div>
      </section>

      {/* ── What This Tool Does ── */}
      <section className="bg-white">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-16 sm:py-20">
          <h2 className="text-[28px] leading-[36px] font-semibold text-fluent-text text-center">
            Explore the full Settings Catalog in one place
          </h2>
          <p className="mt-3 text-[16px] leading-[24px] text-fluent-text-secondary text-center max-w-2xl mx-auto">
            A free reference tool for IT administrators, consultants, and anyone working with Microsoft Intune endpoint management.
          </p>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <h3 className="text-[16px] leading-[22px] font-semibold text-fluent-text">
                Browse categories
              </h3>
              <p className="mt-2 text-[14px] leading-[22px] text-fluent-text-secondary">
                Navigate the full hierarchy of Intune Settings Catalog categories and settings across Windows, macOS, iOS, Android, and Linux.
              </p>
            </div>
            <div>
              <h3 className="text-[16px] leading-[22px] font-semibold text-fluent-text">
                Instant search
              </h3>
              <p className="mt-2 text-[14px] leading-[22px] text-fluent-text-secondary">
                Search across thousands of settings by name, description, or keywords. All client-side with zero server round-trips.
              </p>
            </div>
            <div>
              <h3 className="text-[16px] leading-[22px] font-semibold text-fluent-text">
                Detailed metadata
              </h3>
              <p className="mt-2 text-[14px] leading-[22px] text-fluent-text-secondary">
                View allowed values, default options, applicability, OMA-URI paths, and parent/child relationships for every setting.
              </p>
            </div>
            <div>
              <h3 className="text-[16px] leading-[22px] font-semibold text-fluent-text">
                Track changes
              </h3>
              <p className="mt-2 text-[14px] leading-[22px] text-fluent-text-secondary">
                A built-in changelog detects additions, removals, and modifications to settings over time so you always stay current.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works (FAQ-style dropdown) ── */}
      <section className="bg-[#f5f5f5]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-16 sm:py-20">
          <h2 className="text-[28px] leading-[36px] font-semibold text-fluent-text text-center">
            How it works
          </h2>
          <p className="mt-3 text-[16px] leading-[24px] text-fluent-text-secondary text-center max-w-2xl mx-auto">
            An overview of the data pipeline, Graph API permissions, and update process.
          </p>

          <div className="mt-10 max-w-3xl mx-auto space-y-3">
            {/* Graph API & Permissions */}
            <details className="bg-white rounded shadow-sm border border-fluent-border group">
              <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-[15px] font-semibold text-fluent-text select-none hover:bg-fluent-bg-alt transition-colors">
                <span>Microsoft Graph API and permissions</span>
                <svg className="w-4 h-4 text-fluent-text-secondary transition-transform duration-200 group-open:rotate-180 flex-shrink-0 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-5 pt-1 border-t border-fluent-border space-y-3">
                <p className="text-[14px] leading-[22px] text-fluent-text-secondary">
                  Settings data is pulled from the Microsoft Graph API using an Azure AD app registration with application-level (client credentials) authentication. The only permission required is:
                </p>
                <div className="bg-[#f5f5f5] rounded px-4 py-3 border border-fluent-border">
                  <code className="text-[13px] font-mono text-fluent-blue">DeviceManagementConfiguration.Read.All</code>
                  <p className="text-[12px] leading-[18px] text-fluent-text-secondary mt-1">
                    A read-only permission. This app never writes to or modifies your Intune environment.
                  </p>
                </div>
                <p className="text-[14px] leading-[22px] text-fluent-text-secondary">
                  Two Graph Beta endpoints are queried:
                </p>
                <ul className="space-y-1 text-[14px] leading-[22px] text-fluent-text-secondary list-disc list-inside">
                  <li><code className="font-mono text-[12px]">/deviceManagement/configurationSettings</code> — all setting definitions</li>
                  <li><code className="font-mono text-[12px]">/deviceManagement/configurationCategories</code> — the category hierarchy</li>
                </ul>
              </div>
            </details>

            {/* Update Process */}
            <details className="bg-white rounded shadow-sm border border-fluent-border group">
              <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-[15px] font-semibold text-fluent-text select-none hover:bg-fluent-bg-alt transition-colors">
                <span>Update process</span>
                <svg className="w-4 h-4 text-fluent-text-secondary transition-transform duration-200 group-open:rotate-180 flex-shrink-0 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-5 pt-1 border-t border-fluent-border space-y-3">
                <p className="text-[14px] leading-[22px] text-fluent-text-secondary">
                  A GitHub Actions workflow runs daily at 06:00 UTC and follows these steps:
                </p>
                <ol className="space-y-3 text-[14px] leading-[22px] text-fluent-text-secondary list-decimal list-inside">
                  <li>
                    <strong className="text-fluent-text">Fetch</strong> — Authenticates via client credentials and pages through all settings and categories from Graph, saving them as JSON snapshots.
                  </li>
                  <li>
                    <strong className="text-fluent-text">Diff and changelog</strong> — Compares the new snapshot against the previous one, detecting additions, removals, and modifications, then appends an entry to the changelog.
                  </li>
                  <li>
                    <strong className="text-fluent-text">Search index</strong> — Generates a pre-built search index so that full-text search works instantly in the browser with zero server calls.
                  </li>
                  <li>
                    <strong className="text-fluent-text">Build and deploy</strong> — The site is statically generated via Next.js and deployed to GitHub Pages. All settings data is embedded directly into the pages — the site makes zero runtime API calls.
                  </li>
                </ol>
              </div>
            </details>

            {/* Architecture */}
            <details className="bg-white rounded shadow-sm border border-fluent-border group">
              <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-[15px] font-semibold text-fluent-text select-none hover:bg-fluent-bg-alt transition-colors">
                <span>Architecture</span>
                <svg className="w-4 h-4 text-fluent-text-secondary transition-transform duration-200 group-open:rotate-180 flex-shrink-0 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-5 pt-3 border-t border-fluent-border">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="bg-[#f5f5f5] rounded px-4 py-4 border border-fluent-border text-center">
                    <p className="font-semibold text-[14px] text-fluent-text">Data layer</p>
                    <p className="text-[13px] leading-[20px] text-fluent-text-secondary mt-1">JSON snapshots from Graph API, diffed daily</p>
                  </div>
                  <div className="bg-[#f5f5f5] rounded px-4 py-4 border border-fluent-border text-center">
                    <p className="font-semibold text-[14px] text-fluent-text">Build</p>
                    <p className="text-[13px] leading-[20px] text-fluent-text-secondary mt-1">Next.js static generation, pre-built search index</p>
                  </div>
                  <div className="bg-[#f5f5f5] rounded px-4 py-4 border border-fluent-border text-center">
                    <p className="font-semibold text-[14px] text-fluent-text">Hosting</p>
                    <p className="text-[13px] leading-[20px] text-fluent-text-secondary mt-1">GitHub Pages static site, client-side search, no backend required</p>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* ── Entirely Vibe Coded ── */}
      <section className="bg-white">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-16 sm:py-20">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-[28px] leading-[36px] font-semibold text-fluent-text">
              Entirely vibe coded
            </h2>
            <p className="mt-4 text-[16px] leading-[26px] text-fluent-text-secondary">
              This entire project — every component, every script, every line of CSS — was entirely vibe coded by Claude, Anthropic&apos;s AI assistant. From the data pipeline that pulls settings from Microsoft Graph, to the search indexing, changelog diffing, and the interface you&apos;re looking at right now, it was all generated through conversational AI prompting without a single line of hand-written code.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-[#f5f5f5]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-14 sm:py-16 text-center">
          <h2 className="text-[24px] leading-[32px] font-semibold text-fluent-text">
            Start exploring the catalog
          </h2>
          <p className="mt-2 text-[15px] leading-[24px] text-fluent-text-secondary">
            Search, browse, and discover Intune Settings Catalog definitions.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center px-8 py-3 bg-[#0078d4] text-white text-[15px] font-semibold rounded hover:bg-[#106ebe] transition-colors"
            >
              Browse settings
            </Link>
          </div>
        </div>
      </section>

      {/* ── Disclaimer ── */}
      <section className="bg-white border-t border-fluent-border">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-6 text-center">
          <p className="text-[12px] leading-[18px] text-fluent-text-secondary">
            This tool is not affiliated with, endorsed by, or connected to Microsoft. All data is sourced from publicly available Microsoft Graph API endpoints.
          </p>
        </div>
      </section>
    </div>
  );
}
