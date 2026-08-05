/**
 * fetch-baselines.ts
 *
 * Fetches Microsoft's Intune security baseline templates (templateFamily eq
 * 'baseline') from Graph beta and writes:
 *   public/baselines/index.json   — families grouped by baseId (versions newest first)
 *   public/baselines/{id}.json    — one shard per template version, settings
 *                                   normalized with names/values resolved from
 *                                   the local catalog (data/settings.json)
 *
 * Templates are service-side catalog data — this works even in tenants with
 * zero baselines configured. Same auth pattern + env vars as fetch-settings.ts.
 *
 * Usage:
 *   AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=xxx AZURE_CLIENT_SECRET=xxx npx tsx scripts/fetch-baselines.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  BaselineIndex,
  BaselineFamily,
  BaselineSetting,
  BaselineShard,
} from '../src/lib/baseline-types';

const TENANT_ID = process.env.AZURE_TENANT_ID!;
const CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

const SETTINGS_FILE = path.resolve(__dirname, '..', 'data', 'settings.json');
const CATEGORIES_FILE = path.resolve(__dirname, '..', 'data', 'categories.json');
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'baselines');

// ─── Auth + Graph GET with retry (same pattern as fetch-settings.ts) ───

let token: string | null = null;

async function getAccessToken(): Promise<string> {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('Error: AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET must be set.');
    process.exit(1);
  }
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Token response missing access_token');
  token = json.access_token as string;
  return token;
}

const MAX_RETRIES = 8;

async function graphGet(url: string): Promise<Record<string, unknown>> {
  const fullUrl = url.startsWith('https://') ? url : `https://graph.microsoft.com/beta${url}`;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token ?? (await getAccessToken())}` } });
    } catch (err) {
      if (attempt > MAX_RETRIES) throw err;
      console.warn(`  Network error (${(err as Error).message}). Retrying in 5s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    if (res.status === 401 && attempt === 1) {
      token = null;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
      const waitS = retryAfter > 0 ? retryAfter : 30;
      console.warn(`  HTTP ${res.status}. Waiting ${waitS}s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, waitS * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Graph request failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let nextLink: string | undefined = url;
  while (nextLink) {
    const response = await graphGet(nextLink);
    results.push(...(response.value as T[]));
    nextLink = response['@odata.nextLink'] as string | undefined;
  }
  return results;
}

// ─── Local catalog (name + option resolution) ───

type Raw = Record<string, unknown>;

interface CatalogDef {
  displayName?: string;
  description?: string;
  helpText?: string;
  categoryId?: string;
  options?: Array<{ itemId: string; displayName: string }>;
}

function loadCatalog(): Map<string, CatalogDef> {
  const defs = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) as Array<Raw>;
  const map = new Map<string, CatalogDef>();
  for (const d of defs) map.set(d.id as string, d as unknown as CatalogDef);
  return map;
}

function loadCategoryNames(): Map<string, string> {
  const cats = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8')) as Array<Raw>;
  const map = new Map<string, string>();
  for (const c of cats) map.set(c.id as string, (c.displayName as string) ?? '');
  return map;
}

function optionName(def: CatalogDef | undefined, defId: string, optionId: string): string {
  const name = def?.options?.find((o) => o.itemId === optionId)?.displayName;
  if (name) return name;
  // Unresolvable option: show the option suffix instead of the full id.
  return optionId.startsWith(`${defId}_`) ? optionId.slice(defId.length + 1) : optionId;
}

// ─── Setting-template normalization ───
// Value shapes (verified against live Graph): defaults live in *ValueTemplate.defaultValue;
// collections are arrays of {defaultValue}; groupSettingCollection entries carry
// {children}. Only settingDefinitionId + resolved values survive — all
// TemplateId/settingValueTemplateReference noise is dropped here, which is what
// makes the version diff safe.

function normalizeInstance(inst: Raw, catalog: Map<string, CatalogDef>): BaselineSetting | null {
  const defId = inst['settingDefinitionId'] as string;
  if (!defId) return null;
  const def = catalog.get(defId);
  const odata = (inst['@odata.type'] as string) ?? '';
  const vtKey = Object.keys(inst).find((k) => k.endsWith('ValueTemplate'));
  const vt = vtKey ? (inst[vtKey] as Raw | Raw[]) : undefined;

  const out: BaselineSetting = {
    settingDefinitionId: defId,
    displayName: (def?.displayName || defId).trim(),
  };
  const description = def?.description || def?.helpText;
  if (description) out.description = description;

  const children: BaselineSetting[] = [];
  const walkChildren = (raw: unknown) => {
    for (const c of (raw as Raw[]) ?? []) {
      const child = normalizeInstance(c, catalog);
      if (child) children.push(child);
    }
  };

  if (odata.includes('GroupSettingCollection')) {
    const groups = (Array.isArray(vt) ? vt : []) as Raw[];
    if (groups.length === 1) {
      walkChildren(groups[0]['children'] ?? (groups[0]['defaultValue'] as Raw | undefined)?.['children']);
    } else {
      // ponytail: multi-instance collections (e.g. pre-populated firewall rules)
      // become one synthetic child per instance; the diff strips the #n suffix.
      groups.forEach((g, i) => {
        const memberRaw = (g['children'] ?? (g['defaultValue'] as Raw | undefined)?.['children']) as Raw[] | undefined;
        const members: BaselineSetting[] = [];
        for (const m of memberRaw ?? []) {
          const child = normalizeInstance(m, catalog);
          if (child) members.push(child);
        }
        const name = members.find((m) => m.settingDefinitionId === `${defId}_name`)?.value;
        children.push({
          settingDefinitionId: `${defId}#${i}`,
          displayName: name || `Instance ${i + 1}`,
          children: members,
        });
      });
    }
  } else if (odata.includes('ChoiceSettingCollection')) {
    const entries = (Array.isArray(vt) ? vt : []) as Raw[];
    const names: string[] = [];
    const optionIds: string[] = [];
    for (const e of entries) {
      const dv = e['defaultValue'] as Raw | undefined;
      if (dv?.['settingDefinitionOptionId']) {
        optionIds.push(dv['settingDefinitionOptionId'] as string);
        names.push(optionName(def, defId, dv['settingDefinitionOptionId'] as string));
      }
      walkChildren(dv?.['children']);
    }
    if (names.length) out.value = names.join(', ');
    if (optionIds.length) out.optionIds = optionIds;
  } else if (odata.includes('ChoiceSetting')) {
    const dv = ((vt as Raw)?.['defaultValue'] ?? {}) as Raw;
    if (dv['settingDefinitionOptionId']) {
      out.optionId = dv['settingDefinitionOptionId'] as string;
      out.value = optionName(def, defId, dv['settingDefinitionOptionId'] as string);
    }
    walkChildren(dv['children']);
  } else if (odata.includes('SimpleSettingCollection')) {
    const entries = (Array.isArray(vt) ? vt : []) as Raw[];
    const values = entries
      .map((e) => (e['defaultValue'] as Raw | undefined)?.['constantValue'])
      .filter((v) => v != null)
      .map(String);
    if (values.length) out.value = values.join(', ');
  } else if (odata.includes('SimpleSetting')) {
    const cv = ((vt as Raw)?.['defaultValue'] as Raw | undefined)?.['constantValue'];
    if (cv != null) out.value = String(cv);
  }

  if (children.length) out.children = children;
  return out;
}

function normalizeSettingTemplates(
  items: Raw[],
  catalog: Map<string, CatalogDef>,
  categoryNames: Map<string, string>
): BaselineSetting[] {
  const seen = new Set<string>();
  const settings: BaselineSetting[] = [];
  for (const item of items) {
    const inst = item['settingInstanceTemplate'] as Raw | undefined;
    if (!inst) continue;
    const setting = normalizeInstance(inst, catalog);
    if (!setting) continue;
    // Top-level settings carry their catalog category, so the UI can group
    // by category like the OIB pages do.
    const def = catalog.get(setting.settingDefinitionId);
    setting.category = (def?.categoryId && categoryNames.get(def.categoryId)) || 'Other';
    // Windows v4 ships a duplicate settingDefinitionId (identical values) — keep the first.
    if (seen.has(setting.settingDefinitionId)) {
      console.warn(`     duplicate settingDefinitionId skipped: ${setting.settingDefinitionId}`);
      continue;
    }
    seen.add(setting.settingDefinitionId);
    settings.push(setting);
  }
  return settings;
}

// ─── Main ───

export interface RawTemplate {
  id: string;
  baseId: string;
  displayName: string;
  displayVersion: string;
  lifecycleState: string;
  settingTemplateCount: number;
  platforms: string;
  technologies: string;
}

/** Normalize + write index/shards. Exported so pre-fetched raw pages can be
 *  replayed offline (itemsFor supplies each version's raw settingTemplates). */
export async function buildFromRaw(
  templates: RawTemplate[],
  itemsFor: (t: RawTemplate) => Promise<Raw[]>
): Promise<void> {
  // STIG audit-only templates (technologies=extensibility) are excluded:
  // they aren't shown in the Intune portal, and their settings don't resolve
  // against the settings catalog.
  templates = templates.filter((t) => t.technologies !== 'extensibility');

  console.log('Loading local settings catalog for name resolution...');
  const catalog = loadCatalog();
  const categoryNames = loadCategoryNames();
  console.log(`  ${catalog.size} definitions, ${categoryNames.size} categories loaded.`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const byBase = new Map<string, RawTemplate[]>();
  for (const t of templates) {
    const arr = byBase.get(t.baseId) ?? [];
    arr.push(t);
    byBase.set(t.baseId, arr);
  }

  const versionNum = (t: RawTemplate) => parseInt(t.id.slice(t.baseId.length + 1), 10) || 0;
  const families: BaselineFamily[] = [];
  let changed = false;

  // Write only when content differs, so the nightly refresh doesn't commit
  // unchanged data every run (same pattern as fetch-settings' last-updated).
  const writeIfChanged = (file: string, json: string) => {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf-8') === json) return;
    fs.writeFileSync(file, json, 'utf-8');
    changed = true;
  };

  for (const [baseId, versions] of byBase) {
    // Newest first by displayVersion chronology — Graph's own template version
    // numbers are not chronological (e.g. Windows "November 2021" is v3 but
    // "23H2" is v1; Defender "Version 6" is v3 but the newer "24H1" is v1).
    versions.sort(
      (a, b) =>
        versionSortKey(b.displayVersion) - versionSortKey(a.displayVersion) ||
        versionNum(b) - versionNum(a)
    );
    const newest = versions[0];
    console.log(`\n── ${newest.displayName} (${versions.length} versions)`);
    const metas = [];

    for (const t of versions) {
      process.stdout.write(`   ${t.displayVersion} (${t.lifecycleState}) ... `);
      const items = await itemsFor(t);
      const settings = normalizeSettingTemplates(items, catalog, categoryNames);
      console.log(`${settings.length} settings`);

      const shard: BaselineShard = {
        id: t.id,
        baseId,
        displayName: t.displayName,
        displayVersion: t.displayVersion,
        lifecycleState: t.lifecycleState,
        settings,
      };
      writeIfChanged(path.join(OUT_DIR, `${t.id}.json`), JSON.stringify(shard));
      metas.push({
        id: t.id,
        displayVersion: t.displayVersion,
        lifecycleState: t.lifecycleState,
        settingCount: settings.length,
      });
    }

    families.push({
      baseId,
      displayName: newest.displayName,
      platforms: newest.platforms,
      technologies: newest.technologies,
      versions: metas,
    });
  }

  families.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const indexFile = path.join(OUT_DIR, 'index.json');
  const index: BaselineIndex = { generatedAt: new Date().toISOString(), families };
  // Keep the previous timestamp when nothing changed, so index.json stays
  // byte-identical and the nightly run produces no commit.
  if (!changed && fs.existsSync(indexFile)) {
    const prev = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as BaselineIndex;
    if (JSON.stringify({ ...index, generatedAt: prev.generatedAt }) === JSON.stringify(prev)) {
      index.generatedAt = prev.generatedAt;
    }
  }
  writeIfChanged(indexFile, JSON.stringify(index, null, 2));

  console.log(
    changed
      ? `\n✓ ${families.length} families, ${templates.length} version shards written to ${OUT_DIR}`
      : `\n✓ No baseline changes detected — files unchanged.`
  );
}

/** Chronological key for the mixed displayVersion formats: "Version 24H2",
 *  "November 2021", "Version 2512" (YYMM), "Version 139". Scale is
 *  year*12+month; bare release numbers sort below any dated form, which is
 *  correct wherever the formats mix (e.g. Defender). */
function versionSortKey(v: string): number {
  const h = v.match(/(\d{2})H([12])/i);
  if (h) return (2000 + Number(h[1])) * 12 + (h[2] === '1' ? 6 : 12);
  const t = Date.parse(v);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    if (d.getFullYear() > 2010 && d.getFullYear() < 2100) return d.getFullYear() * 12 + d.getMonth() + 1;
  }
  const yymm = v.match(/\b(\d{2})(\d{2})\b/);
  if (yymm && Number(yymm[2]) >= 1 && Number(yymm[2]) <= 12) {
    return (2000 + Number(yymm[1])) * 12 + Number(yymm[2]);
  }
  const n = v.match(/\d+/);
  return n ? Number(n[0]) : 0;
}

async function main() {
  console.log('Microsoft Security Baselines Fetcher');
  console.log('====================================');
  await getAccessToken();

  console.log('Fetching baseline template list...');
  const filter = encodeURIComponent("templateFamily eq 'baseline'");
  const templates = await fetchAllPages<RawTemplate>(`/deviceManagement/configurationPolicyTemplates?$filter=${filter}`);
  console.log(`  ${templates.length} template versions.`);

  await buildFromRaw(templates, (t) =>
    fetchAllPages<Raw>(`/deviceManagement/configurationPolicyTemplates('${t.id}')/settingTemplates?$top=50`)
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
