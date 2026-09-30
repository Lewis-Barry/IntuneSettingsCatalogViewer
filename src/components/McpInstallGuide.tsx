'use client';

import { useState, type ReactNode } from 'react';
import CopyCspButton from './CopyCspButton';
import { pillClass } from '@/lib/pill';

const NAME = 'intune-settings-catalog-viewer';
const PACKAGE = 'intune-settings-catalog-viewer-mcp';
const SERVER = { command: 'npx', args: ['-y', PACKAGE] };

const claudeDesktopJson = JSON.stringify({ mcpServers: { [NAME]: SERVER } }, null, 2);
const vscodeJson = JSON.stringify({ servers: { [NAME]: SERVER } }, null, 2);
const cursorJson = JSON.stringify({ mcpServers: { [NAME]: SERVER } }, null, 2);
const codexToml = `[mcp_servers.${NAME}]\ncommand = "npx"\nargs = ["-y", "${PACKAGE}"]`;

// One-click install links (formats from the VS Code and Cursor docs).
const vscodeInstallUrl = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: NAME, ...SERVER }))}`;
const cursorInstallUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${NAME}&config=${btoa(JSON.stringify(SERVER))}`;

const EXAMPLES = [
  'Which Intune settings were added last week?',
  "What is the default for 'Prevent enabling lock screen camera', and what do the Microsoft baseline and OpenIntuneBaseline recommend?",
  'What changed between the Windows security baseline 24H2 and 25H2?',
  'Is this setting Enterprise-only, and does it work on AVD multi-session?',
];

const code = 'px-1 py-0.5 rounded bg-fluent-bg-alt dark:bg-[#2c2c2e] font-mono text-fluent-sm text-fluent-text';
const kbd = 'px-1.5 py-0.5 rounded border border-fluent-border dark:border-[#636366] bg-fluent-bg-alt dark:bg-[#2c2c2e] font-mono text-fluent-xs text-fluent-text';

/** Bordered panel with a grey header row, matching the browser/changelog sections. */
function Panel({ step, title, children }: { step?: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-fluent-border bg-white dark:bg-[#1c1c1e] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-fluent-border bg-fluent-bg-alt">
        {step !== undefined && (
          <span aria-hidden="true" className="flex-none w-5 h-5 rounded-full bg-fluent-blue text-white dark:text-[#1c1c1e] text-fluent-xs font-semibold flex items-center justify-center">
            {step}
          </span>
        )}
        <h2 className="text-fluent-base font-semibold text-fluent-text">{title}</h2>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Code({ children, label = 'command' }: { children: string; label?: string }) {
  return (
    <div className="relative mt-2">
      <pre className="rounded border border-fluent-border dark:border-[#636366] bg-fluent-bg-alt dark:bg-[#2c2c2e] px-3 py-2 pr-9 font-mono text-fluent-sm text-fluent-text overflow-x-auto whitespace-pre">
        {children}
      </pre>
      <div className="absolute top-1.5 right-1.5">
        <CopyCspButton text={children} label={label} />
      </div>
    </div>
  );
}

function InstallButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-fluent-blue bg-fluent-blue text-white dark:text-[#1c1c1e] text-fluent-sm font-semibold hover:bg-fluent-blue-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue focus-visible:ring-offset-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {children}
    </a>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-4">{children}</ol>;
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="flex-none w-5 h-5 mt-0.5 rounded-full border border-fluent-blue text-fluent-blue text-fluent-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fluent-base font-semibold text-fluent-text">{title}</p>
        {children && <div className="mt-0.5 text-fluent-base text-fluent-text-secondary">{children}</div>}
      </div>
    </li>
  );
}

const CLIENTS: Array<{ id: string; label: string; body: ReactNode }> = [
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    body: (
      <Steps>
        <Step n={1} title="Open the config file">
          In Claude Desktop, go to <b>Settings → Developer → Edit Config</b>. This opens <code className={code}>claude_desktop_config.json</code>.
        </Step>
        <Step n={2} title="Paste this and save">
          Replace the contents with the block below. Already have other servers? Add only the <code className={code}>&quot;{NAME}&quot;</code> entry inside <code className={code}>mcpServers</code>.
          <Code label="config">{claudeDesktopJson}</Code>
        </Step>
        <Step n={3} title="Restart Claude Desktop">
          Fully quit (<span className={kbd}>⌘Q</span> on Mac, or right-click the tray icon → Quit on Windows) and open it again.
        </Step>
        <Step n={4} title="Done — ask a question">
          Click the <b>tools</b> icon in the chat box: <b>Intune Settings Catalog Viewer</b> is listed. Try one of the example questions.
        </Step>
      </Steps>
    ),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    body: (
      <Steps>
        <Step n={1} title="Run this in your terminal">
          <Code>{`claude mcp add ${NAME} -- npx -y ${PACKAGE}`}</Code>
        </Step>
        <Step n={2} title="Start Claude Code and check">
          Run <code className={code}>claude</code>, then type <span className={kbd}>/mcp</span> — <b>{NAME}</b> shows as connected.
        </Step>
        <Step n={3} title="Done — ask a question">Try one of the example questions.</Step>
      </Steps>
    ),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    body: (
      <Steps>
        <Step n={1} title="Click to install">
          Your browser asks to open VS Code — allow it, then click <b>Install</b> in VS Code.
          <div><InstallButton href={vscodeInstallUrl}>Install in VS Code</InstallButton></div>
        </Step>
        <Step n={2} title="Open Copilot Chat in Agent mode">
          Open the Chat view (<span className={kbd}>Ctrl+Alt+I</span> / <span className={kbd}>⌃⌘I</span>), pick <b>Agent</b>, and check that <b>{NAME}</b> is ticked under <b>Configure Tools</b>.
        </Step>
        <Step n={3} title="Done — ask a question">Try one of the example questions.</Step>
      </Steps>
    ),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    body: (
      <Steps>
        <Step n={1} title="Click to install">
          Your browser asks to open Cursor — allow it, then confirm <b>Install</b>.
          <div><InstallButton href={cursorInstallUrl}>Add to Cursor</InstallButton></div>
        </Step>
        <Step n={2} title="Done — ask a question">Open the chat in Agent mode and try one of the example questions.</Step>
      </Steps>
    ),
  },
  {
    id: 'codex',
    label: 'Codex',
    body: (
      <Steps>
        <Step n={1} title="Run this in your terminal">
          <Code>{`codex mcp add ${NAME} -- npx -y ${PACKAGE}`}</Code>
        </Step>
        <Step n={2} title="Done — ask a question">Start <code className={code}>codex</code> and try one of the example questions.</Step>
      </Steps>
    ),
  },
];

const MANUAL: Array<{ label: string; where: string; code: string }> = [
  { label: 'VS Code', where: '.vscode/mcp.json (or run “MCP: Add Server”)', code: vscodeJson },
  { label: 'Cursor', where: '~/.cursor/mcp.json', code: cursorJson },
  { label: 'Codex', where: '~/.codex/config.toml', code: codexToml },
];

export default function McpInstallGuide() {
  const [active, setActive] = useState(CLIENTS[0].id);
  const client = CLIENTS.find((c) => c.id === active) ?? CLIENTS[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <div className="space-y-6 min-w-0">
        <Panel step={1} title="Install Node.js (once)">
          <p className="text-fluent-base text-fluent-text-secondary">
            The MCP server runs with Node.js 22 or newer. Download the <b>LTS</b> installer from{' '}
            <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-fluent-blue hover:underline">nodejs.org</a>{' '}
            and click through it. Already installed? Check with:
          </p>
          <Code>node --version</Code>
        </Panel>

        <Panel step={2} title="Add it to your AI assistant">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-fluent-sm text-fluent-text-secondary font-medium">App:</span>
            <div role="group" aria-label="AI assistant" className="flex items-center gap-2 flex-wrap">
              {CLIENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === active}
                  onClick={() => setActive(c.id)}
                  className={`platform-filter-btn ${pillClass(c.id === active)}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div aria-live="polite" className="mt-4 pt-4 border-t border-fluent-border">
            {client.body}
          </div>
        </Panel>

        <details className="rounded border border-fluent-border bg-white dark:bg-[#1c1c1e] overflow-hidden group">
          <summary className="cursor-pointer px-4 py-2.5 bg-fluent-bg-alt text-fluent-base font-semibold text-fluent-text">
            Manual configuration (other apps)
          </summary>
          <div className="px-4 py-4 border-t border-fluent-border">
            <p className="text-fluent-base text-fluent-text-secondary">
              Any app that supports local (stdio) MCP servers works. The command is <code className={code}>npx -y {PACKAGE}</code>.
            </p>
            {MANUAL.map((m) => (
              <div key={m.label} className="mt-4">
                <p className="text-fluent-sm font-semibold text-fluent-text">
                  {m.label} <span className="font-normal text-fluent-text-secondary">— {m.where}</span>
                </p>
                <Code label="config">{m.code}</Code>
              </div>
            ))}
          </div>
        </details>
      </div>

      <aside className="space-y-6 min-w-0">
        <Panel title="What can it answer?">
          <p className="text-fluent-sm text-fluent-text-secondary">
            Setting details and defaults, CSP paths, Windows edition support, the daily changelog and its summaries, Microsoft security baselines and version comparisons, OpenIntuneBaseline policies, and classic compliance settings. Settings, changelog and baselines are refreshed daily.
          </p>
        </Panel>
        <Panel step={3} title="Try asking">
          <p className="text-fluent-sm text-fluent-text-secondary">
            The first question in a session takes a few seconds while the data loads. After that, answers are instant.
          </p>
          <ul className="mt-3 space-y-2">
            {EXAMPLES.map((q) => (
              <li key={q} className="flex items-start gap-2 rounded border border-fluent-border bg-fluent-bg-alt/60 dark:bg-[#2c2c2e] px-3 py-2">
                <span className="flex-1 text-fluent-sm text-fluent-text">“{q}”</span>
                <CopyCspButton text={q} label="question" />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Not working?">
          <ul className="space-y-2 text-fluent-sm text-fluent-text-secondary list-disc pl-4">
            <li><b className="text-fluent-text">“npx not found”</b> — Node.js isn&apos;t installed, or the app was open during the install. Install Node.js, then fully restart the app.</li>
            <li><b className="text-fluent-text">Tools don&apos;t show up</b> — quit the app completely (not just close the window) and reopen it.</li>
            <li><b className="text-fluent-text">Install button does nothing</b> — use the manual configuration.</li>
          </ul>
        </Panel>

      </aside>
    </div>
  );
}
