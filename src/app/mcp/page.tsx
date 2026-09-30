import type { Metadata } from 'next';
import McpInstallGuide from '@/components/McpInstallGuide';

export const metadata: Metadata = {
  title: 'MCP Server — Intune Settings Catalog Viewer',
  description:
    'Ask Claude, Copilot, Cursor or Codex about any Intune setting. Step-by-step instructions to add the Intune Settings Catalog Viewer MCP server to your AI assistant.',
};

export const dynamic = 'force-static';

export default function McpPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-fluent-2xl font-semibold text-fluent-text">MCP Server</h1>
        <p className="text-fluent-base text-fluent-text-secondary mt-1">
          Ask your AI assistant about any Intune setting, its default, the changelog, Microsoft security baselines and OpenIntuneBaseline. Set up in about two minutes.
        </p>
      </div>

      <McpInstallGuide />
    </div>
  );
}
