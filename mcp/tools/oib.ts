// OpenIntuneBaseline tool: oib_lookup (browse a version, or compare two).
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { settingIndex, oibCurrent, oibVersionIndex, oibVersion } from '../data.ts';
import { reply, errorReply, capped, moreNote } from '../format.ts';
import { parsePolicy, flattenOIBSettings, type OIBPolicy } from '../../src/lib/oib-types.ts';
import { diffVersions } from '../../src/lib/oib-diff.ts';
import { fmtValue, kindWord } from '../../src/lib/oib-export-shared.ts';

const FOLDER: Record<string, string> = { windows: 'WINDOWS', macos: 'MACOS', win365: 'WINDOWS365', windows365: 'WINDOWS365' };
const folderOf = (platform: string) => FOLDER[platform.toLowerCase()] ?? platform.toUpperCase();

type Args = { query?: string; platform?: string; version?: string; compareTo?: string; limit?: number };

/** Resolve "windows-v3.8" or a bare "3.8" (+ platform) to a shard tag. Only tags listed in index.json are valid. */
async function resolveTag(v: string, platform?: string): Promise<{ tag: string; folder: string } | string> {
  const idx = await oibVersionIndex();
  const all = idx.platforms.flatMap((p) => p.versions.map((m) => ({ ...m, folder: p.folder })));
  const hit = all.find((m) => m.tag === v)
    ?? (platform ? all.find((m) => m.folder === folderOf(platform) && m.version === v.replace(/^v/i, '')) : undefined);
  if (hit) return hit;
  return `Unknown OIB version "${v}"${platform || v.includes('-') ? '' : ' (a bare version needs platform: windows, macos or win365)'}. Available tags: ${all.map((m) => m.tag).join(', ')}.`;
}

const rowLabel = (p: OIBPolicy) => {
  const parsed = parsePolicy(p);
  return `${p.name}${parsed.policyLabel !== p.name ? ` (${parsed.category} · ${parsed.policyLabel})` : ''}`;
};

async function listPolicies(policies: OIBPolicy[], title: string, args: Args) {
  const { byId } = await settingIndex();
  const q = args.query?.toLowerCase();
  const nameOf = (id: string) => byId.get(id)?.displayName || byId.get(id)?.name || id;
  const rows = policies.map((p) => {
    const flat = flattenOIBSettings(p.settings).map((f) => ({ f, name: nameOf(f.definitionId) }));
    const hits = q ? flat.filter((x) => `${x.name} ${x.f.definitionId}`.toLowerCase().includes(q)) : flat;
    return { p, flat, hits, byName: !q || p.name.toLowerCase().includes(q) };
  }).filter((r) => r.byName || r.hits.length);
  if (!rows.length) return reply(`${title}: no policies match.`);
  const { shown, more } = capped(rows, args.limit);
  const perPolicy = shown.length > 5 ? 3 : 10; // keep the default output small
  const body = shown.map(({ p, flat, hits, byName }) => {
    const list = byName && !hits.length ? flat : hits;
    const lines = list.slice(0, perPolicy).map((x) => `  - ${x.name}: ${fmtValue(x.f.value, byId.get(x.f.definitionId)) || '(configured)'}`);
    const extra = list.length > perPolicy ? `\n  - …${list.length - perPolicy} more of ${flat.length} settings` : '';
    return `- **${rowLabel(p)}** — ${p.technologies} · ${flat.length} settings\n${lines.join('\n')}${extra}\n  ${p.githubUrl}`;
  }).join('\n');
  return reply(`${title}: ${rows.length} policies\n${body}${moreNote(more)}`);
}

async function compare(args: Args) {
  const a = await resolveTag(args.version!, args.platform);
  const b = await resolveTag(args.compareTo!, args.platform);
  if (typeof a === 'string') return errorReply(a);
  if (typeof b === 'string') return errorReply(b);
  if (a.folder !== b.folder) return errorReply(`Cannot compare ${a.tag} (${a.folder}) with ${b.tag} (${b.folder}) — versions must be of the same platform.`);
  const [sa, sb, { byId }] = await Promise.all([oibVersion(a.tag), oibVersion(b.tag), settingIndex()]);
  const diff = diffVersions(a.tag, sa.policies, b.tag, sb.policies);
  const c = diff.counts;
  const changed = diff.policies.filter((p) => p.kind !== 'modified' || p.settingChanges.length);
  const { shown, more } = capped(changed, args.limit);
  const perPolicy = 10;
  const body = shown.map((p) => {
    const lines = p.settingChanges.slice(0, perPolicy).map((s) => {
      const def = byId.get(s.definitionId);
      const name = def?.displayName || def?.name || s.definitionId;
      const v = s.kind === 'changed' ? `${fmtValue(s.baseValue, def)} → ${fmtValue(s.compareValue, def)}` : fmtValue(s.kind === 'added' ? s.compareValue : s.baseValue, def);
      return `  - ${kindWord(s.kind)}: ${name}${s.instanceId ? ` [${s.instanceId.split('#')[0].split('_').pop()}]` : ''}${v ? ` — ${v}` : ''}`;
    });
    const extra = p.settingChanges.length > perPolicy ? `\n  - …${p.settingChanges.length - perPolicy} more setting changes` : '';
    return `- **${kindWord(p.kind)}: ${p.label}** (${p.category}) +${p.addedCount} −${p.removedCount} ~${p.changedCount}${lines.length ? `\n${lines.join('\n')}` : ''}${extra}`;
  }).join('\n');
  return reply(`# OIB ${a.tag} → ${b.tag}\n${c.added} policies added, ${c.removed} removed, ${c.renamed} renamed, ${c.modified} modified.\n\n${body}${moreNote(more)}`);
}

export async function oibLookup(args: Args) {
  if (args.compareTo) {
    if (!args.version) return errorReply('compareTo needs version (the base) too.');
    return compare(args);
  }
  if (args.version) {
    const r = await resolveTag(args.version, args.platform);
    if (typeof r === 'string') return errorReply(r);
    // platform only picked the folder here — win365 policies say platform 'windows10', so never filter on it again.
    return listPolicies((await oibVersion(r.tag)).policies, `OIB ${r.tag}`, args);
  }
  const policies = (await oibCurrent()).policies.filter((p) => !args.platform || p.oibFolder === folderOf(args.platform));
  return listPolicies(policies, 'OIB current snapshot', args);
}

export function register(server: McpServer): void {
  server.registerTool('oib_lookup', {
    title: 'OpenIntuneBaseline lookup',
    description: 'Browse OpenIntuneBaseline (OIB) policies and the setting values they configure, or compare two OIB versions. Use it to answer "what does OIB configure for X", "what does OIB recommend", or "what changed between OIB v3.7 and v3.8". Without version it reads the current snapshot; query matches policy names or setting names. Set version (tag like windows-v3.8, or bare 3.8 plus platform) to read an older release, and add compareTo (same platform) to get the diff.',
    inputSchema: {
      query: z.string().optional().describe('Text to match in policy or setting names, e.g. "bitlocker"'),
      platform: z.enum(['windows', 'macos', 'win365']).optional().describe('Filter current-snapshot policies; with a bare version it selects the release folder'),
      version: z.string().optional().describe('OIB tag ("windows-v3.8") or bare version ("3.8", needs platform); base of a comparison'),
      compareTo: z.string().optional().describe('Version to compare against version (same platform)'),
      limit: z.number().int().min(1).max(100).optional().describe('Max policies (default 20)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, oibLookup);
}

export async function selfCheck(): Promise<void> {
  const r = await oibLookup({ version: '3.8', platform: 'windows' });
  assert.ok(!('isError' in r), 'windows 3.8 resolves');
  assert.match(r.content[0].text, /OIB windows-v3\.8: \d+ policies/);
  const d = await oibLookup({ version: 'windows-v3.7', compareTo: 'windows-v3.8' });
  assert.match(d.content[0].text, /\d+ policies added, \d+ removed/);
  const x = await oibLookup({ version: 'windows-v3.8', compareTo: 'macos-v1.0' });
  assert.ok('isError' in x && x.isError, 'cross-folder compare errors');
  const w = await oibLookup({ version: '1.0', platform: 'win365' });
  assert.match(w.content[0].text, /OIB win365-v1\.0: [1-9]\d* policies/);
}
