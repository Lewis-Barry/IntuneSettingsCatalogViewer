import assert from 'node:assert/strict';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { complianceTemplates, settingIndex } from '../data.ts';
import { reply, errorReply, capped, moreNote, matchesPlatform, limitArg, readOnly, oneLine, label } from '../format.ts';
import { allRows, matchesQuery, humanise } from '../../src/lib/compliance-types.ts';
import { skuLabel, matchesWindowsCompatibility } from '../../src/lib/sku-labels.ts';
import { searchSettings } from './settings.ts';
import type { SettingDefinition } from '../../src/lib/types.ts';


export async function complianceSettings(args: { query?: string; platform?: string; limit?: number }) {
  const terms = (args.query ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const rows = allRows((await complianceTemplates()).templates)
    .filter((r) => matchesQuery(r, terms) && (matchesPlatform(r.template.platform, args.platform) || matchesPlatform(r.template.family, args.platform)));
  const { shown, more } = capped(rows, args.limit);
  return {
    total: rows.length,
    markdown: shown.map(({ template: t, property: p }) => {
      const opts = p.options?.length ? ` Options: ${p.options.map((o) => o.value + (o.isDefault ? ' (default)' : '')).join(', ')}.` : '';
      return `- ${t.platform} · **${humanise(p.name)}** (\`${p.name}\`, ${p.type})${opts}${p.description ? ` ${oneLine(p.description)}` : ''}`;
    }).join('\n') + moreNote(more),
  };
}

export async function skuAvailability(args: { id?: string; query?: string; limit?: number }): Promise<string | undefined> {
  let targets: SettingDefinition[];
  if (args.id) {
    const s = (await settingIndex()).byId.get(args.id);
    targets = s && s.applicability?.platform?.toLowerCase().includes('windows') ? [s] : [];
  } else {
    targets = (await searchSettings({ query: args.query!, platform: 'windows', limit: 100 })).items;
  }
  if (!targets.length) return undefined;
  const { shown, more } = capped(targets, args.limit);
  const yn = (b: boolean) => (b ? 'yes' : 'no');
  return shown.map((s) => {
    const skus = (s.applicability as { windowsSkus?: string[] } | undefined)?.windowsSkus ?? [];
    return `- **${label(s)}** (\`${s.id}\`)\n  ` + (skus.length
      ? `SKUs: ${skus.map(skuLabel).join(', ')}\n  Enterprise-only (not on Pro): ${yn(matchesWindowsCompatibility(skus, 'enterprise-only'))} · AVD multi-session: ${yn(matchesWindowsCompatibility(skus, 'avd-multisession'))}`
      : 'No SKU restriction listed');
  }).join('\n') + moreNote(more);
}

export function register(server: McpServer): void {
  const annotations = readOnly;

  server.registerTool('compliance_settings', {
    title: 'Classic compliance policy settings',
    description: 'Search the classic (non-Settings-Catalog) Intune device compliance policy properties per platform, with allowed values, defaults and Microsoft descriptions. Use it for "what can I require in a compliance policy" questions. Query is comma-separated terms, OR\'ed (e.g. "firewall, encryption"); case-insensitive.',
    inputSchema: {
      query: z.string().optional().describe('Comma-separated terms (any may match), e.g. "firewall, tpm"'),
      platform: z.string().optional().describe('Platform filter, e.g. windows, android, iOS, macOS'),
      limit: limitArg,
    },
    annotations,
  }, async (args) => {
    const r = await complianceSettings(args);
    return reply(r.total ? `${r.total} compliance settings:\n${r.markdown}` : 'No compliance settings match.');
  });

  server.registerTool('windows_sku_availability', {
    title: 'Windows SKU availability',
    description: 'Show which Windows editions (Pro, Enterprise, Education, AVD multi-session, IoT…) support a Settings Catalog setting, and flag Enterprise-only settings that will not apply on Pro. Use it for licensing/edition questions like "does this work on Windows Pro". Pass a setting id, or a query to check the best matches.',
    inputSchema: {
      id: z.string().optional().describe('Setting definition id (from search_settings)'),
      query: z.string().optional().describe('Keywords, if the id is unknown'),
      limit: limitArg,
    },
    annotations,
  }, async (args) => {
    if (!args.id && !args.query) return errorReply('Provide either id or query.');
    const md = await skuAvailability(args);
    return reply(md ?? 'No matching Windows setting found.');
  });
}

export async function selfCheck(): Promise<void> {
  const c = await complianceSettings({ query: 'Firewall' });
  assert.match(c.markdown, /activeFirewallRequired/);
  const id = 'device_vendor_msft_policy_config_applicationmanagement_removedefaultmicrosoftstorepackages_2_bingnews'; // first id in public/pro-exclusive.json
  assert.match((await skuAvailability({ id }))!, /Enterprise-only \(not on Pro\): yes/);
}
