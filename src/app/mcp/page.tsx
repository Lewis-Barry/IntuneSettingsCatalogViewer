import type { Metadata } from 'next';
import McpInstallGuide from '@/components/McpInstallGuide';

export const metadata: Metadata = {
  title: 'MCP — Intune Settings Catalog Viewer',
  description:
    'Ask Claude, Copilot, Cursor or Codex about any Intune setting. Step-by-step instructions to add the Intune Settings MCP server to your AI assistant.',
};

export const dynamic = 'force-static';

export default function McpPage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-[#0078d4] to-[#005a9e] text-white">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-14 sm:py-20 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/70">MCP server</p>
          <h1 className="mt-2 text-[34px] leading-[42px] sm:text-[44px] sm:leading-[54px] font-semibold tracking-tight">
            Ask your AI assistant about Intune settings
          </h1>
          <p className="mt-4 text-[17px] leading-[27px] sm:text-[19px] sm:leading-[29px] text-white/85 max-w-2xl mx-auto">
            Connect Claude, VS Code, Cursor or Codex to everything on this site: every setting, its default, the changelog, Microsoft security baselines and OpenIntuneBaseline. Set up in about two minutes.
          </p>
          <p className="mt-6 text-[13px] text-white/70">Free · no sign-in · no access to your tenant · reads the same public data as this site</p>
        </div>
      </section>

      <McpInstallGuide />

      {/* ── Disclaimer ── */}
      <section className="bg-white dark:bg-[#1c1c1e] border-t border-fluent-border">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-6 text-center">
          <p className="text-[12px] leading-[18px] text-fluent-text-secondary">
            The MCP server only reads the published data files of this project. It never connects to your Microsoft 365 tenant and needs no credentials.
          </p>
        </div>
      </section>
    </div>
  );
}
