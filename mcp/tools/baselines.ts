import assert from 'node:assert/strict';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { baselineIndex, baselineShard } from '../data.ts';
import { reply, errorReply, capped, moreNote, readOnly } from '../format.ts';
import { defaultVersion, type BaselineFamily, type BaselineSetting, type BaselineVersionMeta } from '../../src/lib/baseline-types.ts';
import { diffBaselineVersions, type BaselineSettingChange } from '../../src/lib/baseline-diff.ts';

type Resolved<T> = { ok: true; value: T } | { ok: false; error: string };

/** baseId exactly, else case-insensitive substring of displayName. */
export async function resolveFamily(q: string): Promise<Resolved<BaselineFamily>> {
  const { families } = await baselineIndex();
  const needle = q.trim().toLowerCase();
  const hits = families.filter((f) => f.baseId === q.trim());
  if (!hits.length) hits.push(...families.filter((f) => f.displayName.toLowerCase().includes(needle)));
  if (hits.length === 1) return { ok: true, value: hits[0] };
  const list = (hits.length ? hits : families).map((f) => `- ${f.displayName} (\`${f.baseId}\`)`).join('\n');
  return { ok: false, error: `${hits.length ? `"${q}" matches ${hits.length} baselines` : `No baseline matches "${q}"`} — use one of:\n${list}` };
}

/** Version id, or displayVersion ("Version 24H2" / "24H2"); default = active/newest. */
export function resolveVersion(f: BaselineFamily, v?: string): Resolved<BaselineVersionMeta> {
  const found = v
    ? f.versions.find((x) => x.id === v) ?? f.versions.find((x) => [x.displayVersion, x.displayVersion.replace(/^version\s+/i, '')].some((n) => n.toLowerCase() === v.trim().toLowerCase()))
    : defaultVersion(f);
  return found
    ? { ok: true, value: found }
    : { ok: false, error: `Version "${v}" not found for ${f.displayName}. Available: ${f.versions.map((x) => x.displayVersion).join(', ')}` };
}

export async function listBaselines(): Promise<string> {
  const { families } = await baselineIndex();
  return families
    .map((f) => `## ${f.displayName}\n\`${f.baseId}\` · ${f.platforms}\n${f.versions.map((v) => `- ${v.displayVersion} — ${v.lifecycleState}, ${v.settingCount} settings`).join('\n')}`)
    .join('\n\n');
}

const MAX_DEPTH = 3;
const hay = (s: BaselineSetting) => `${s.displayName} ${s.description ?? ''} ${s.settingDefinitionId}`.toLowerCase();
const matches = (s: BaselineSetting, q: string): boolean => hay(s).includes(q) || !!s.children?.some((c) => matches(c, q));

function row(s: BaselineSetting, depth = 0): string[] {
  const line = `${'  '.repeat(depth)}- **${s.displayName}** = ${s.value ?? '—'}`;
  return [line, ...(depth < MAX_DEPTH ? (s.children ?? []).flatMap((c) => row(c, depth + 1)) : [])];
}

export async function getBaseline(args: { family: string; version?: string; query?: string; limit?: number }): Promise<Resolved<string>> {
  const f = await resolveFamily(args.family);
  if (!f.ok) return f;
  const v = resolveVersion(f.value, args.version);
  if (!v.ok) return v;
  const shard = await baselineShard(v.value.id);
  const q = args.query?.trim().toLowerCase();
  const hits = q ? shard.settings.filter((s) => matches(s, q)) : shard.settings;
  if (!hits.length) return { ok: true, value: `No settings in ${shard.displayName} (${shard.displayVersion}) match "${args.query}".` };
  const { shown, more } = capped(hits, args.limit);
  const byCat = new Map<string, BaselineSetting[]>();
  for (const s of shown) byCat.set(s.category ?? 'Uncategorised', [...(byCat.get(s.category ?? 'Uncategorised') ?? []), s]);
  const body = [...byCat].map(([cat, list]) => `## ${cat}\n${list.flatMap((s) => row(s)).join('\n')}`).join('\n\n');
  return { ok: true, value: `# ${shard.displayName} — ${shard.displayVersion} (${shard.lifecycleState})\n${hits.length} of ${shard.settings.length} top-level settings${q ? ` match "${args.query}"` : ''}\n\n${body}${moreNote(more)}` };
}

const changeLine = (c: BaselineSettingChange) => {
  const s = c.compare ?? c.base!;
  const name = `${c.parent ? `${c.parent} › ` : ''}**${s.displayName}**`;
  return c.kind === 'changed' ? `- ${name}: ${c.base?.value ?? '—'} → ${c.compare?.value ?? '—'}` : `- ${name} = ${s.value ?? '—'}`;
};

export async function compareBaselineVersions(args: { family: string; from: string; to: string }): Promise<Resolved<string>> {
  const f = await resolveFamily(args.family);
  if (!f.ok) return f;
  const from = resolveVersion(f.value, args.from);
  if (!from.ok) return from;
  const to = resolveVersion(f.value, args.to);
  if (!to.ok) return to;
  const [a, b] = await Promise.all([baselineShard(from.value.id), baselineShard(to.value.id)]);
  const { counts, changes } = diffBaselineVersions(a.settings, b.settings);
  const out = [`# ${f.value.displayName}: ${from.value.displayVersion} → ${to.value.displayVersion}`, `${counts.added} added · ${counts.removed} removed · ${counts.changed} changed`];
  for (const kind of ['added', 'removed', 'changed'] as const) {
    const list = changes.filter((c) => c.kind === kind);
    if (!list.length) continue;
    const { shown, more } = capped(list, 30);
    out.push('', `## ${kind[0].toUpperCase()}${kind.slice(1)} (${list.length})`, ...shown.map(changeLine), moreNote(more));
  }
  return { ok: true, value: out.join('\n') };
}

export function register(server: McpServer): void {
  const annotations = readOnly;
  const out = (r: Resolved<string>) => (r.ok ? reply(r.value) : errorReply(r.error));
  const family = z.string().min(1).describe('Baseline family: baseId (GUID) or part of its name, e.g. "Windows 10", "Edge"');

  server.registerTool('list_baselines', {
    title: 'List Microsoft security baselines',
    description: 'List every Microsoft Intune security baseline family (Windows, Edge, Defender, Microsoft 365 Apps, …) with its versions, lifecycle state and setting counts. Use this first to discover valid family names and versions for get_baseline and compare_baseline_versions.',
    inputSchema: {},
    annotations,
  }, async () => reply(await listBaselines()));

  server.registerTool('get_baseline', {
    title: 'Get Microsoft security baseline settings',
    description: 'Show the settings a Microsoft security baseline configures and the value it sets, grouped by category. Use to answer "what does Microsoft recommend for X" or "what is in the Windows security baseline". Defaults to the newest active version; filter with query (name, description or setting id).',
    inputSchema: {
      family,
      version: z.string().optional().describe('Version, e.g. "24H2" or "Version 24H2" (default: newest active)'),
      query: z.string().optional().describe('Filter settings by keyword'),
      limit: z.number().int().min(1).max(100).optional().describe('Max top-level settings (default 20)'),
    },
    annotations,
  }, async (args) => out(await getBaseline(args)));

  server.registerTool('compare_baseline_versions', {
    title: 'Compare security baseline versions',
    description: 'Show what changed between two versions of one Microsoft security baseline: settings added, removed, and changed (old value → new value). Use for "what is new in the 25H2 baseline" or upgrade impact questions.',
    inputSchema: {
      family,
      from: z.string().min(1).describe('Older version, e.g. "24H2"'),
      to: z.string().min(1).describe('Newer version, e.g. "25H2"'),
    },
    annotations,
  }, async (args) => out(await compareBaselineVersions(args)));
}

export async function selfCheck(): Promise<void> {
  assert.match(await listBaselines(), /Security Baseline for Windows/);
  const g = await getBaseline({ family: 'Security Baseline for Windows 10 and later' });
  assert.ok(g.ok && g.value.includes(' = '));
  assert.ok(!(await resolveFamily('nonexistent-xyz')).ok);
  const famId = '66df8dce-0166-4b82-92f7-1f74e3ca17a3';
  const f = await resolveFamily(famId);
  assert.ok(f.ok && f.value.versions.length >= 2);
  const [newer, older] = f.value.versions;
  const c = await compareBaselineVersions({ family: famId, from: older.displayVersion, to: newer.displayVersion });
  assert.ok(c.ok);
  const m = c.value.match(/(\d+) added · (\d+) removed · (\d+) changed/);
  assert.ok(m && Number(m[1]) + Number(m[2]) + Number(m[3]) > 0, 'diff has changes');
}
