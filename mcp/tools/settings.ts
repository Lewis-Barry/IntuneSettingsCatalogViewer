import assert from 'node:assert/strict';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { settingIndex, categoryById, categoryTree, allBaselineShards, baselineIndex, oibCurrent } from '../data.ts';
import { reply, errorReply, capped, moreNote, matchesPlatform, siteUrl, fmtDefault, limitArg, readOnly, oneLine, label } from '../format.ts';
import { getSettingScope, type SettingDefinition, type CategoryTreeNode } from '../../src/lib/types.ts';
import { getCspPath } from '../../src/lib/settings-grouping.ts';
import { skuLabel, matchesWindowsCompatibility } from '../../src/lib/sku-labels.ts';
import { flattenOIBSettings } from '../../src/lib/oib-types.ts';
import { fmtValue } from '../../src/lib/oib-export-shared.ts';
import { compact, idQuery } from '../../src/lib/id-query.ts';
import type { BaselineSetting } from '../../src/lib/baseline-types.ts';

// getCspPath joins baseUri + '/' + offsetUri, and offsetUri already starts with '/'.
const cspPath = (s: SettingDefinition) => getCspPath(s).replace(/(?<!^\.)\/{2,}/g, '/');

export async function searchSettings(args: { query: string; platform?: string; scope?: 'device' | 'user'; limit?: number }) {
  const { all } = await settingIndex();
  // Collapse repeated slashes like cspPath does, so pasted OMA-URIs still match.
  const terms = args.query.toLowerCase().replace(/(?<!^\.)\/{2,}/g, '/').split(/\s+/).filter(Boolean);
  const scored: Array<{ s: SettingDefinition; score: number }> = [];
  for (const s of all) {
    if (!matchesPlatform(s.applicability?.platform, args.platform)) continue;
    if (args.scope && getSettingScope(s.baseUri) !== args.scope) continue;
    const display = label(s).toLowerCase();
    const mid = `${s.name ?? ''} ${(s.keywords ?? []).join(' ')} ${cspPath(s)} ${s.id}`.toLowerCase();
    const desc = (s.description ?? '').toLowerCase();
    const cid = compact(s.id);
    if (!terms.every((t) => display.includes(t) || mid.includes(t) || desc.includes(t) || (idQuery(t) !== null && cid.includes(idQuery(t)!)))) continue;
    const score = display === terms.join(' ') ? 4 : terms.every((t) => display.includes(t)) ? 3 : terms.every((t) => display.includes(t) || mid.includes(t)) ? 2 : 1;
    scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score || label(a.s).localeCompare(label(b.s)));
  const { shown, more } = capped(scored.map((x) => x.s), args.limit);
  return { items: shown, more, total: scored.length };
}

async function searchMarkdown(items: SettingDefinition[]) {
  const cats = await categoryById();
  return items
    .map((s) => {
      const def = fmtDefault(s);
      return `- **${label(s)}** — ${s.applicability?.platform ?? '?'} · ${getSettingScope(s.baseUri)} · ${cats.get(s.categoryId)?.displayName ?? s.categoryId}\n  \`${s.id}\`${s.description ? ` — ${oneLine(s.description)}` : ''}${def ? `\n  Default: ${oneLine(def, 120)}` : ''}`;
    })
    .join('\n');
}

function findInBaseline(list: BaselineSetting[] | undefined, id: string): BaselineSetting | undefined {
  for (const b of list ?? []) {
    if (b.settingDefinitionId === id) return b;
    const hit = findInBaseline(b.children, id);
    if (hit) return hit;
  }
  return undefined;
}

async function recommendedBy(s: SettingDefinition): Promise<string[]> {
  const [shards, idx, oib] = await Promise.all([allBaselineShards(), baselineIndex(), oibCurrent()]);
  const familyName = new Map(idx.families.map((f) => [f.baseId, f.displayName]));
  const rows: string[] = [];
  for (const shard of shards) {
    const hit = findInBaseline(shard.settings, s.id);
    if (hit) rows.push(`- MS baseline **${familyName.get(shard.baseId) ?? shard.displayName} — ${shard.displayVersion}**: ${hit.value ?? '(configured)'}`);
  }
  for (const p of oib.policies) {
    const hit = flattenOIBSettings(p.settings).find((f) => f.definitionId === s.id);
    if (hit) rows.push(`- OIB **${p.name}**: ${fmtValue(hit.value, s) || '(configured)'}`);
  }
  return rows;
}

export async function getSettingDetail(args: { id?: string; name?: string }): Promise<{ kind: 'found' | 'ambiguous' | 'notFound'; markdown: string }> {
  const { all, byId, children } = await settingIndex();
  let s = args.id ? byId.get(args.id) : undefined;
  if (!s) {
    const needle = (args.name ?? args.id ?? '').toLowerCase();
    const exact = all.filter((x) => x.displayName?.toLowerCase() === needle || x.name?.toLowerCase() === needle);
    if (exact.length > 1) {
      const { shown, more } = capped(exact, 20);
      return { kind: 'ambiguous', markdown: `"${args.name ?? args.id}" matches ${exact.length} settings — call get_setting with one of these ids:\n${await searchMarkdown(shown)}${moreNote(more)}` };
    }
    s = exact[0];
    if (!s) {
      const { items } = await searchSettings({ query: needle, limit: 10 });
      return { kind: 'notFound', markdown: `No setting with that id or exact name.${items.length ? `\nDid you mean:\n${await searchMarkdown(items)}` : ''}` };
    }
  }

  const cats = await categoryById();
  const app = (s.applicability ?? {}) as Record<string, unknown> & { windowsSkus?: string[] };
  const vd = (s.valueDefinition ?? {}) as Record<string, unknown>;
  const out: string[] = [`# ${label(s)}`, `\`${s.id}\` · ${siteUrl(s.id)}`, `Category: ${cats.get(s.categoryId)?.displayName ?? s.categoryId} · Scope: ${getSettingScope(s.baseUri)}`];

  if (s.description) out.push('', '## Description', s.description.trim());
  if (s.helpText && s.helpText.trim() !== s.description?.trim()) out.push('', s.helpText.trim());

  out.push('', '## Default', fmtDefault(s) ?? 'No default defined in the catalog.');
  if (s.options?.length) {
    const { shown, more } = capped(s.options, 50);
    out.push('', `## Options (${s.options.length})`, ...shown.map((o) => `- ${oneLine(o.displayName, 200)}${o.itemId === s.defaultOptionId ? ' ✓ default' : ''} — \`${o.itemId}\``), moreNote(more));
  }
  const constraints = [
    vd.minimumValue !== undefined && `min value ${vd.minimumValue}`,
    vd.maximumValue !== undefined && `max value ${vd.maximumValue}`,
    vd.minimumLength !== undefined && `min length ${vd.minimumLength}`,
    vd.maximumLength !== undefined && `max length ${vd.maximumLength}`,
    vd.format && vd.format !== 'none' && `format ${vd.format}`,
    vd.isSecret && 'secret',
  ].filter(Boolean);
  if (constraints.length) out.push('', '## Value constraints', constraints.join(' · '));

  const csp = cspPath(s);
  if (csp) out.push('', '## CSP / OMA-URI path', `\`${csp}\``);

  const skus = app.windowsSkus ?? [];
  out.push('', '## Applicability',
    `Platform: ${app.platform ?? '?'} · Technologies: ${app.technologies ?? '?'}`,
    ...(app.minimumSupportedVersion || app.maximumSupportedVersion ? [`OS version: ${app.minimumSupportedVersion ?? 'any'} – ${app.maximumSupportedVersion ?? 'any'}`] : []),
    ...(skus.length ? [
      `Windows SKUs: ${skus.map(skuLabel).join(', ')}`,
      `Enterprise-only (not on Pro): ${matchesWindowsCompatibility(skus, 'enterprise-only') ? 'yes' : 'no'} · AVD multi-session: ${matchesWindowsCompatibility(skus, 'avd-multisession') ? 'yes' : 'no'}`,
    ] : []),
  );

  const parents = (s.dependentOn ?? []).map((d) => byId.get(d.parentSettingId)).filter((p): p is SettingDefinition => !!p);
  if (parents.length) out.push('', '## Parent', ...parents.map((p) => `- ${label(p)} — \`${p.id}\``));
  const kids = children.get(s.id) ?? [];
  if (kids.length) {
    const { shown, more } = capped(kids, 30);
    out.push('', '## Child settings', ...shown.map((k) => `- ${label(k)} — \`${k.id}\``), moreNote(more));
  }
  if (s.infoUrls?.length) out.push('', '## Learn more', ...s.infoUrls.map((u) => `- ${u}`));

  const rec = await recommendedBy(s);
  out.push('', '## Recommended by', ...(rec.length ? rec : ['Not configured by any MS security baseline or OpenIntuneBaseline policy.']));
  return { kind: 'found', markdown: out.join('\n') };
}

export async function listCategories(args: { parentId?: string; platform?: string }): Promise<CategoryTreeNode[]> {
  const tree = await categoryTree();
  let nodes = tree;
  if (args.parentId) {
    const find = (list: CategoryTreeNode[]): CategoryTreeNode | undefined => {
      for (const n of list) { if (n.id === args.parentId) return n; const hit = find(n.children); if (hit) return hit; }
      return undefined;
    };
    nodes = find(tree)?.children ?? [];
  }
  return nodes.filter((n) => matchesPlatform(n.platforms, args.platform));
}

export function register(server: McpServer): void {
  const annotations = readOnly;

  server.registerTool('search_settings', {
    title: 'Search Intune settings',
    description: 'Search the Microsoft Intune Settings Catalog (all ~18k configuration and compliance settings, every platform) by keyword. Matches display name, name, keywords, CSP path and description; every word must match. Use this to find a setting id, then call get_setting for its default value, options and recommendations.',
    inputSchema: {
      query: z.string().trim().min(1).describe('Keywords, e.g. "bitlocker startup pin"'),
      platform: z.string().optional().describe('Platform filter, e.g. windows10, macOS, iOS, android, linux'),
      scope: z.enum(['device', 'user']).optional(),
      limit: limitArg,
    },
    annotations,
  }, async (args) => {
    const { items, more, total } = await searchSettings(args);
    if (!total) return reply(`No settings match "${args.query}".`);
    return reply(`${total} settings match "${args.query}":\n${await searchMarkdown(items)}${moreNote(more)}`);
  });

  server.registerTool('get_setting', {
    title: 'Get Intune setting details',
    description: 'Full details for one Intune Settings Catalog setting: description, default value/option, all options, value constraints, CSP/OMA-URI path, platform, Windows SKUs, OS versions, parent/child settings, and which Microsoft security baselines and OpenIntuneBaseline (OIB) policies configure it and to what value. Pass the setting id (from search_settings) or its exact display name.',
    inputSchema: {
      id: z.string().trim().optional().describe('Setting definition id'),
      name: z.string().trim().optional().describe('Exact display name, if the id is unknown'),
    },
    annotations,
  }, async (args) => {
    if (!args.id && !args.name) return errorReply('Provide either id or name.');
    const d = await getSettingDetail(args);
    return d.kind === 'notFound' ? errorReply(d.markdown) : reply(d.markdown);
  });

  server.registerTool('list_categories', {
    title: 'List Intune setting categories',
    description: 'Browse the Settings Catalog category tree. Without parentId returns the top-level categories; with parentId returns that category\'s subcategories. Each row shows its setting count.',
    inputSchema: {
      parentId: z.string().optional().describe('Category id to list the children of'),
      platform: z.string().optional().describe('Platform filter, e.g. windows10, macOS'),
    },
    annotations,
  }, async (args) => {
    const nodes = await listCategories(args);
    if (!nodes.length) return reply('No categories found.');
    return reply(nodes.map((n) => `- ${n.displayName} — \`${n.id}\` · ${n.settingCount} settings${n.children.length ? `, ${n.children.length} sub` : ''}`).join('\n'));
  });
}

export async function selfCheck(): Promise<void> {
  const id = 'device_vendor_msft_policy_config_devicelock_preventenablinglockscreencamera';
  const hits = await searchSettings({ query: 'lock screen camera' });
  assert.ok(hits.items.some((s) => s.id === id), 'search finds lock screen camera');
  const d = await getSettingDetail({ id });
  assert.equal(d.kind, 'found');
  assert.match(d.markdown, /## Default\n\S/);
  assert.match(d.markdown, /MS baseline \*\*Security Baseline for Windows/);
  assert.match(d.markdown, /`\.\/Device\/Vendor\/MSFT\/Policy\/Config\/DeviceLock\/PreventEnablingLockScreenCamera`/);
  const sloppy = await searchSettings({ query: './Device/Vendor/MSFT/Policy//Config/DeviceLock/PreventEnablingLockScreenCamera' });
  assert.ok(sloppy.items.some((s) => s.id === id), 'search tolerates double slashes in a pasted path');
  for (const [q, want] of [
    ['./Device/Vendor/MSFT/Policy//Config/Maps/EnableOfflineMapsAutoUpdate', 'device_vendor_msft_policy_config_maps_enableofflinemapsautoupdate'],
    ['EnableOfflineMapsAutoUpdate', 'device_vendor_msft_policy_config_maps_enableofflinemapsautoupdate'],
    ['/com.android.deviceRestrictionPolicy///networkEscapeHatchAllowed/', 'com.android.devicerestrictionpolicy.networkescapehatchallowed'],
    ['config/maps/enableoffline', 'device_vendor_msft_policy_config_maps_enableofflinemapsautoupdate'],
  ] as const) {
    assert.ok((await searchSettings({ query: q })).items.some((s) => s.id === want), `search finds ${want} from "${q}"`);
  }
  const maps = await searchSettings({ query: 'EnableOfflineMapsAutoUpdate' });
  assert.match(await searchMarkdown(maps.items), /Default: Not configured\. User's choice\. \(65535\)/, 'search lists the numeric default');
  assert.equal((await getSettingDetail({ name: 'Value' })).kind, 'ambiguous');
  assert.ok((await listCategories({})).length > 5);
}
