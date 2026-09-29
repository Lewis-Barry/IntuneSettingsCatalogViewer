import type { Metadata } from 'next';
import McpInstallGuide from '@/components/McpInstallGuide';

export const metadata: Metadata = {
  title: 'MCP Server — Intune Settings Catalog Viewer',
  description:
    'Ask Claude, Copilot, Cursor or Codex about any Intune setting. Step-by-step instructions to add the Intune Settings MCP server to your AI assistant.',
};

export const dynamic = 'force-static';

export default function McpPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-fluent-2xl font-semibold text-fluent-text">MCP Server</h1>
          <p className="text-fluent-base text-fluent-text-secondary mt-1">
            Ask your AI assistant about any Intune setting, its default, the changelog, Microsoft security baselines and OpenIntuneBaseline. Set up in about two minutes.
          </p>
        </div>
        <span
          className="inline-flex w-fit items-center gap-1.5 self-start rounded px-2.5 py-1 text-fluent-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-fluent-text-secondary"
          title="The MCP server only reads the same public data files as this site. It never connects to your tenant."
        >
          <svg className="w-3.5 h-3.5 text-fluent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Free · no sign-in · read-only, no tenant access
        </span>
      </div>

      <McpInstallGuide />
    </div>
  );
}
