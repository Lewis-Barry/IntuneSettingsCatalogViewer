'use client';

import { useState, type ReactNode } from 'react';
import CopyCspButton from './CopyCspButton';

// ponytail: the command/config is written out per client on purpose — each block is
// exactly what the user pastes, so it must read as-is rather than be assembled.
const NAME = 'intune-settings';
const PACKAGE = 'intune-settings-mcp';
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

function Code({ children, label = 'command' }: { children: string; label?: string }) {
  return (
    <div className="relative mt-3 group">
      <pre className="bg-fluent-bg-alt border border-fluent-border rounded-md px-4 py-3 pr-10 text-[13px] leading-[20px] font-mono text-fluent-text overflow-x-auto whitespace-pre">
        {children}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyCspButton text={children} label={label} />
      </div>
    </div>
  );
}

function InstallButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-[#0078d4] text-white text-[14px] font-semibold rounded hover:bg-[#106ebe] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue focus-visible:ring-offset-2"
    >
      {children}
    </a>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-6 space-y-6">{children}</ol>;
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden="true" className="flex-none w-8 h-8 rounded-full bg-fluent-blue/10 text-fluent-blue text-[14px] font-semibold flex items-center justify-center">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-[15px] leading-[22px] font-semibold text-fluent-text">{title}</p>
        {children && <div className="mt-1 text-[14px] leading-[22px] text-fluent-text-secondary">{children}</div>}
      </div>
    </li>
  );
}

const kbd = 'px-1.5 py-0.5 rounded border border-fluent-border bg-fluent-bg-alt text-[12px] font-mono text-fluent-text';

const CLIENTS: Array<{ id: string; label: string; body: ReactNode }> = [
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    body: (
      <Steps>
        <Step n={1} title="Open the config file">
          In Claude Desktop, go to <b>Settings → Developer → Edit Config</b>. This opens <code>claude_desktop_config.json</code>.
        </Step>
        <Step n={2} title="Paste this and save">
          Replace the contents with the block below. Already have other servers? Add only the <code>&quot;{NAME}&quot;</code> entry inside <code>mcpServers</code>.
          <Code label="config">{claudeDesktopJson}</Code>
        </Step>
        <Step n={3} title="Restart Claude Desktop">
          Fully quit (<span className={kbd}>⌘Q</span> on Mac, or right-click the tray icon → Quit on Windows) and open it again.
        </Step>
        <Step n={4} title="Done — ask a question">
          Click the <b>tools</b> icon in the chat box: <b>{NAME}</b> is listed. Try one of the questions below.
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
          Run <code>claude</code>, then type <span className={kbd}>/mcp</span> — <b>{NAME}</b> shows as connected.
        </Step>
        <Step n={3} title="Done — ask a question">Try one of the questions below.</Step>
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
        <Step n={3} title="Done — ask a question">Try one of the questions below.</Step>
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
        <Step n={2} title="Done — ask a question">
          Open the chat in Agent mode and try one of the questions below.
        </Step>
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
        <Step n={2} title="Done — ask a question">Start <code>codex</code> and try one of the questions below.</Step>
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
    <>
      <section className="bg-white dark:bg-[#1c1c1e]">
        <div className="max-w-[860px] mx-auto px-6 sm:px-10 py-14 sm:py-16">
          {/* Step A: Node */}
          <div className="flex items-baseline gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fluent-blue">Before you start</span>
          </div>
          <h2 className="mt-1 text-[24px] leading-[32px] font-semibold text-fluent-text">Install Node.js (once)</h2>
          <p className="mt-2 text-[15px] leading-[24px] text-fluent-text-secondary">
            The MCP server runs with Node.js 20 or newer. Download the <b>LTS</b> installer from{' '}
            <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-fluent-blue hover:underline">nodejs.org</a>{' '}
            and click through it. Already have it? Check with:
          </p>
          <Code>node --version</Code>

          {/* Step B: client */}
          <div className="mt-14 flex items-baseline gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fluent-blue">Then</span>
          </div>
          <h2 className="mt-1 text-[24px] leading-[32px] font-semibold text-fluent-text">Pick your app</h2>

          <div role="tablist" aria-label="AI assistant" className="mt-5 flex flex-wrap gap-2">
            {CLIENTS.map((c) => (
              <button
                key={c.id}
                role="tab"
                id={`tab-${c.id}`}
                aria-selected={c.id === active}
                aria-controls={`panel-${c.id}`}
                onClick={() => setActive(c.id)}
                className={`px-4 py-2 rounded-full text-[14px] font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue ${
                  c.id === active
                    ? 'bg-[#0078d4] border-[#0078d4] text-white'
                    : 'bg-transparent border-fluent-border text-fluent-text hover:border-fluent-blue hover:text-fluent-blue'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${client.id}`} aria-labelledby={`tab-${client.id}`} className="mt-2 border border-fluent-border rounded-lg p-6 sm:p-8">
            {client.body}
          </div>
        </div>
      </section>

      {/* Step C: try it */}
      <section className="bg-[#f5f5f5] dark:bg-[#2c2c2e]">
        <div className="max-w-[860px] mx-auto px-6 sm:px-10 py-14 sm:py-16">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fluent-blue">Finally</span>
          <h2 className="mt-1 text-[24px] leading-[32px] font-semibold text-fluent-text">Try asking</h2>
          <p className="mt-2 text-[15px] leading-[24px] text-fluent-text-secondary">
            The first question in a session takes a few seconds while the data loads. After that, answers are instant.
          </p>
          <ul className="mt-6 space-y-3">
            {EXAMPLES.map((q) => (
              <li key={q} className="flex items-start gap-3 bg-white dark:bg-[#1c1c1e] border border-fluent-border rounded-md px-4 py-3">
                <span className="flex-1 text-[14px] leading-[22px] text-fluent-text">“{q}”</span>
                <CopyCspButton text={q} label="question" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Help */}
      <section className="bg-white dark:bg-[#1c1c1e]">
        <div className="max-w-[860px] mx-auto px-6 sm:px-10 py-14 sm:py-16 space-y-8">
          <div>
            <h2 className="text-[20px] leading-[28px] font-semibold text-fluent-text">Not working?</h2>
            <ul className="mt-3 space-y-2 text-[14px] leading-[22px] text-fluent-text-secondary list-disc pl-5">
              <li><b>“npx not found”</b> — Node.js isn&apos;t installed, or your app was open during the install. Install Node.js, then fully restart the app.</li>
              <li><b>Tools don&apos;t show up</b> — restart the app completely (quit, not just close the window).</li>
              <li><b>Install button does nothing</b> — use the manual config below.</li>
            </ul>
          </div>
          <details className="border border-fluent-border rounded-lg p-5">
            <summary className="cursor-pointer text-[15px] font-semibold text-fluent-text">Manual configuration (other apps)</summary>
            <p className="mt-3 text-[14px] leading-[22px] text-fluent-text-secondary">
              Any app that supports local (stdio) MCP servers works. The command is <code>npx -y {PACKAGE}</code>.
            </p>
            {MANUAL.map((m) => (
              <div key={m.label} className="mt-5">
                <p className="text-[14px] font-semibold text-fluent-text">{m.label} <span className="font-normal text-fluent-text-secondary">— {m.where}</span></p>
                <Code label="config">{m.code}</Code>
              </div>
            ))}
          </details>
          <div>
            <h2 className="text-[20px] leading-[28px] font-semibold text-fluent-text">What can it answer?</h2>
            <p className="mt-2 text-[14px] leading-[22px] text-fluent-text-secondary">
              Setting details and defaults, CSP paths, Windows edition support, the daily changelog and its summaries, Microsoft security baselines and version comparisons, OpenIntuneBaseline policies, and classic compliance settings. The data is refreshed daily, just like this site.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
