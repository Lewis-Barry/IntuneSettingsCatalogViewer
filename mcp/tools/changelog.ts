import assert from 'node:assert/strict';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { changelog, changelogSummaries } from '../data.ts';
import type { ChangelogSettingRef, ChangelogChange } from '../../src/lib/types.ts';
import { reply, errorReply, capped, moreNote, matchesPlatform, limitArg, readOnly, oneLine } from '../format.ts';

const KINDS = ['added', 'removed', 'changed'] as const;
type Kind = (typeof KINDS)[number];

export async function listChanges(args: { since?: string; until?: string; kind?: Kind; platform?: string; query?: string; limit?: number }) {
  const entries = [...(await changelog())].sort((a, b) => b.date.localeCompare(a.date));
  const dates = entries.map((e) => e.date);
  const bounded = !!(args.since || args.until);
  const inRange = bounded
    ? entries.filter((e) => (!args.since || e.date >= args.since) && (!args.until || e.date <= args.until))
    : entries.slice(0, 1);
  const q = args.query?.toLowerCase();
  const wanted = (r: { id: string; displayName: string; categoryName?: string; platform?: string }) =>
    matchesPlatform(r.platform, args.platform) &&
    (!q || [r.displayName, r.categoryName, r.id].some((x) => x?.toLowerCase().includes(q)));

  // One flat row per setting so the cap applies across all dates and kinds.
  const rows: Array<{ date: string; kind: Kind; text: string }> = [];
  const totals: Record<Kind, number> = { added: 0, removed: 0, changed: 0 };
  const newCats: Array<{ date: string; names: string[] }> = [];
  for (const e of inRange) {
    for (const kind of KINDS) {
      if (args.kind && args.kind !== kind) continue;
      for (const r of (e[kind] as Array<ChangelogSettingRef & Partial<ChangelogChange>>).filter(wanted)) {
        totals[kind]++;
        const where = `${r.platform ?? '?'} · ${r.categoryName ?? r.categoryId}`;
        const fields = r.fields ? r.fields.map((f) => `\n  - ${f.field}: ${oneLine(f.oldValue, 80)} → ${oneLine(f.newValue, 80)}`).join('') : '';
        rows.push({ date: e.date, kind, text: `- **${r.displayName}** — ${where}\n  \`${r.id}\`${fields}` });
      }
    }
    if (!args.kind && e.categoriesAdded?.length) newCats.push({ date: e.date, names: e.categoriesAdded.map((c) => c.displayName) });
  }

  if (!rows.length) {
    const window = dates.length ? `${dates[dates.length - 1]} … ${dates[0]}` : 'none';
    return `No changes found${bounded ? ` between ${args.since ?? 'start'} and ${args.until ?? 'now'}` : ''} for these filters.\n\nChangelog coverage: ${window} (${dates.length} dates).\nAvailable dates: ${dates.join(', ')}`;
  }

  const { shown, more } = capped(rows, args.limit);
  const out = [`# Intune Settings Catalog changes`, `${totals.added} added · ${totals.removed} removed · ${totals.changed} changed (${inRange.length} date${inRange.length === 1 ? '' : 's'})`];
  for (const date of [...new Set(shown.map((r) => r.date))]) {
    out.push('', `## ${date}`);
    const cats = newCats.find((c) => c.date === date);
    if (cats) out.push(`New categories: ${cats.names.join(', ')}`);
    for (const kind of KINDS) {
      const mine = shown.filter((r) => r.date === date && r.kind === kind);
      if (mine.length) out.push('', `### ${kind[0].toUpperCase()}${kind.slice(1)}`, ...mine.map((r) => r.text));
    }
  }
  return out.join('\n') + moreNote(more);
}

export async function changelogSummary(args: { date?: string; month?: string }): Promise<{ ok: boolean; markdown: string }> {
  const all = await changelogSummaries();
  const keys = Object.keys(all).sort().reverse();
  const key = args.date ?? args.month ?? keys.find((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const s = key ? all[key] : undefined;
  if (!key || !s) {
    const near = key ? [...keys].sort((a, b) => Math.abs(Date.parse(a) - Date.parse(key)) - Math.abs(Date.parse(b) - Date.parse(key))).slice(0, 8) : keys.slice(0, 8);
    return { ok: false, markdown: `No summary for "${key ?? ''}". Nearest available: ${near.join(', ')}` };
  }
  const out = [`# ${key}: ${s.headline}`];
  if (s.overview) out.push('', s.overview);
  if (s.highlights.length) out.push('', '## Highlights', ...s.highlights.map((h) => `- ${h}`));
  for (const sec of s.sections ?? []) out.push('', `## ${sec.os}`, sec.body);
  if (s.watchOut) out.push('', '## Watch out', s.watchOut);
  return { ok: true, markdown: out.join('\n') };
}

export function register(server: McpServer): void {
  const ro = readOnly;
  server.registerTool('list_changes', {
    title: 'List Settings Catalog changes',
    description: 'Use for "what was added/removed/changed in Intune Settings Catalog" over a period, e.g. "what was released last week": convert to ISO since/until (inclusive). No dates = latest entry only. Filters: kind, platform, query (setting/category name or id).',
    inputSchema: {
      since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('ISO date YYYY-MM-DD, inclusive'),
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('ISO date YYYY-MM-DD, inclusive'),
      kind: z.enum(KINDS).optional(),
      platform: z.string().optional().describe('e.g. windows10, macOS, iOS, android, linux (substring match)'),
      query: z.string().optional().describe('Substring of setting name, category name or id'),
      limit: limitArg,
    },
    annotations: ro,
  }, async (args) => reply(await listChanges(args)));

  server.registerTool('changelog_summary', {
    title: 'Changelog summary',
    description: 'AI-written headline and highlights for one changelog date (YYYY-MM-DD) or a monthly recap (YYYY-MM). Use for "summarise what changed in August". Default: most recent date.',
    inputSchema: {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    },
    annotations: ro,
  }, async (args) => {
    const r = await changelogSummary(args);
    return r.ok ? reply(r.markdown) : errorReply(r.markdown);
  });
}

export async function selfCheck(): Promise<void> {
  const r = await listChanges({ since: '2026-09-22', until: '2026-09-22', limit: 100 });
  assert.match(r, /Agent execution/);
  const none = await listChanges({ since: '1999-01-01', until: '1999-01-02' });
  assert.match(none, /Available dates/);
  const day = await changelogSummary({ date: '2026-09-22' });
  assert.ok(day.ok && day.markdown.includes((await changelogSummaries())['2026-09-22'].headline));
  const month = await changelogSummary({ month: '2026-08' });
  assert.ok(month.ok && month.markdown.includes((await changelogSummaries())['2026-08'].overview!));
}
