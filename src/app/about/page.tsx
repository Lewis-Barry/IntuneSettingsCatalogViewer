import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — Intune Settings Catalog Viewer',
  description:
    'Learn about the Intune Settings Catalog Viewer and its companion tools: the OIB Lookup, the Settings Catalog changelog, and the Windows Pro policy comparison.',
};

export const dynamic = 'force-static';

const tools = [
  {
    href: '/baseline/',
    title: 'OIB Lookup',
    description:
      'Browse every OpenIntuneBaseline policy and see exactly which settings are configured and how. Search across Windows, macOS, and Windows 365 baselines, and compare any two OIB releases side by side.',
    linkText: 'Open OIB Lookup',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    ),
  },
  {
    href: '/changelog/',
    title: 'Catalog Changelog',
    description:
      'Track what Microsoft changes over time. Daily snapshots are diffed automatically, so you can review additions, removals, and field-level updates to settings and categories as they happen.',
    linkText: 'Open the changelog',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    href: '/?platform=windows10&compatibility=enterprise-only',
    title: 'Windows Compatibility',
    description:
      'Filter the Settings Catalog for Enterprise-only policies or settings available on AVD multi-session, with category browsing, search, and CSV or HTML export.',
    linkText: 'Browse Windows settings',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5a1 1 0 011-1h4v6H4V5zm10-1h5a1 1 0 011 1v5h-6V4zM4 14h6v6H5a1 1 0 01-1-1v-5zm10 0h6v5a1 1 0 01-1 1h-5v-6z"
      />
    ),
  },
];

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
            Browse, search, and explore every Microsoft Intune Settings Catalog definition. Free, fast, and no Intune access required. Hosted on GitHub Pages and updated daily.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center px-8 py-3 bg-white text-[#0078d4] text-[15px] font-semibold rounded hover:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0078d4]"
            >
              Start browsing
            </Link>
            <Link
              href="/changelog/"
              className="inline-flex items-center px-8 py-3 border border-white/50 text-white text-[15px] font-semibold rounded hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0078d4]"
            >
              View changelog
            </Link>
          </div>
        </div>
      </section>

      {/* ── Core Capabilities ── */}
      <section aria-labelledby="capabilities-heading" className="bg-white dark:bg-[#1c1c1e]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-16 sm:py-20">
          <h2
            id="capabilities-heading"
            className="text-[28px] leading-[36px] font-semibold text-fluent-text text-center"
          >
            The full Settings Catalog in one place
          </h2>
          <p className="mt-3 text-[16px] leading-[24px] text-fluent-text-secondary text-center max-w-2xl mx-auto">
            A free reference for IT administrators, consultants, and anyone working with Microsoft Intune endpoint management.
          </p>

          <div className="mt-12 grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
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
                Search thousands of settings by name, description, or keyword. Everything runs client-side with zero server round-trips.
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
          </div>
        </div>
      </section>

      {/* ── Companion Tools ── */}
      <section aria-labelledby="tools-heading" className="bg-[#f5f5f5] dark:bg-[#2c2c2e]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-16 sm:py-20">
          <h2
            id="tools-heading"
            className="text-[28px] leading-[36px] font-semibold text-fluent-text text-center"
          >
            More than a catalog browser
          </h2>
          <p className="mt-3 text-[16px] leading-[24px] text-fluent-text-secondary text-center max-w-2xl mx-auto">
            Three companion tools built on the same data, each answering a question the raw catalog cannot.
          </p>

          <ul className="mt-12 grid md:grid-cols-3 gap-6">
            {tools.map((tool) => (
              <li key={tool.href}>
                <Link
                  href={tool.href}
                  className="group flex flex-col h-full bg-white dark:bg-[#1c1c1e] border border-fluent-border rounded-lg p-6 shadow-sm transition-all hover:shadow-md hover:border-fluent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue focus-visible:ring-offset-2"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-fluent-blue/10 text-fluent-blue"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      {tool.icon}
                    </svg>
                  </span>
                  <span className="mt-4 text-[17px] leading-[24px] font-semibold text-fluent-text group-hover:text-fluent-blue transition-colors">
                    {tool.title}
                  </span>
                  <span className="mt-2 text-[14px] leading-[22px] text-fluent-text-secondary flex-1">
                    {tool.description}
                  </span>
                  <span className="mt-4 inline-flex items-center text-[14px] font-semibold text-fluent-blue">
                    {tool.linkText}
                    <svg
                      aria-hidden="true"
                      className="w-4 h-4 ml-1.5 transition-transform group-hover:translate-x-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Entirely Vibe Coded ── */}
      <section className="bg-white dark:bg-[#1c1c1e]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-16 sm:py-20">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-[28px] leading-[36px] font-semibold text-fluent-text">
              Entirely vibe coded
            </h2>
            <p className="mt-4 text-[16px] leading-[26px] text-fluent-text-secondary">
              Every component, script, and line of CSS in this project was vibe coded with AI coding assistants. Claude, GPT, ZAI, DeepSeek, Qwen, and Kimi have all contributed code along the way. The data pipeline that pulls settings from Microsoft Graph, the search indexing, the changelog diffing, and the interface you are looking at right now were all generated through conversational prompting, without a single line of hand-written code.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-[#f5f5f5] dark:bg-[#2c2c2e]">
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
              className="inline-flex items-center px-8 py-3 bg-[#0078d4] text-white text-[15px] font-semibold rounded hover:bg-[#106ebe] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue focus-visible:ring-offset-2"
            >
              Browse settings
            </Link>
          </div>
        </div>
      </section>

      {/* ── Disclaimer ── */}
      <section className="bg-white dark:bg-[#1c1c1e] border-t border-fluent-border">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-6 text-center">
          <p className="text-[12px] leading-[18px] text-fluent-text-secondary">
            This tool is not affiliated with, endorsed by, or connected to Microsoft. All data is sourced from publicly available Microsoft Graph API endpoints.
          </p>
        </div>
      </section>
    </div>
  );
}
