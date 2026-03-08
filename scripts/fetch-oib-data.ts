/**
 * fetch-oib-data.ts
 *
 * Fetches all Settings Catalog policies from the OpenIntuneBaseline GitHub repo
 * and bundles them into public/oib-data.json for use by the OIB browser page.
 *
 * No Azure credentials required — the OIB repo is public. Uses GITHUB_TOKEN
 * if available for higher API rate limits (5,000/hr vs 60/hr unauthenticated).
 *
 * Platforms covered:
 *   WINDOWS      → WINDOWS/IntuneManagement/SettingsCatalog  (59 files)
 *   MACOS        → MACOS/IntuneManagement/SettingsCatalog    (17 files)
 *   WINDOWS365   → WINDOWS365/IntuneManagement/SettingsCatalog (2 files)
 *
 * Note: BYOD only contains App Protection policies (not Settings Catalog)
 * and is intentionally excluded from this script.
 *
 * Usage:
 *   npx tsx scripts/fetch-oib-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const OIB_DATA_FILE = path.join(PUBLIC_DIR, 'oib-data.json');

const OIB_OWNER = 'SkipToTheEndpoint';
const OIB_REPO = 'OpenIntuneBaseline';
const OIB_BRANCH = 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const PLATFORM_PATHS: Array<{ folder: string; catalogPath: string }> = [
  { folder: 'WINDOWS',    catalogPath: 'WINDOWS/IntuneManagement/SettingsCatalog' },
  { folder: 'MACOS',      catalogPath: 'MACOS/IntuneManagement/SettingsCatalog' },
  { folder: 'WINDOWS365', catalogPath: 'WINDOWS365/IntuneManagement/SettingsCatalog' },
];

// ── Output types (mirrored in src/lib/oib-types.ts for the browser) ──

export interface OIBOutput {
  fetchedAt: string;
  oibCommitSha: string;
  policies: OIBPolicy[];
}

export interface OIBPolicy {
  name: string;
  platform: string;
  technologies: string;
  oibFolder: string;
  githubUrl: string;
  settings: OIBSetting[];
}

export interface OIBSetting {
  definitionId: string;
  value: OIBValue;
}

export type OIBValue =
  | { type: 'choice'; optionId: string; children?: OIBSetting[] }
  | { type: 'simple'; value: string | number | boolean | null }
  | { type: 'choiceCollection'; optionIds: string[] }
  | { type: 'simpleCollection'; values: (string | number | boolean | null)[] }
  | { type: 'group'; members: OIBSetting[] }
  | { type: 'groupCollection'; groups: OIBSetting[][] }
  | { type: 'unknown' };

// ── GitHub API helpers ──

type RawInstance = Record<string, unknown>;

function makeApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'IntuneSettingsCatalogViewer/OIB-Fetcher',
  };
  if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

async function githubApiGet(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: makeApiHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status} for: ${url}`);
  return res.json();
}

async function fetchRawJson(filePath: string): Promise<RawInstance> {
  const url = `https://raw.githubusercontent.com/${OIB_OWNER}/${OIB_REPO}/${OIB_BRANCH}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Raw fetch ${res.status} for: ${url}`);
  return res.json() as Promise<RawInstance>;
}

async function getLatestCommitSha(): Promise<string> {
  const data = await githubApiGet(
    `https://api.github.com/repos/${OIB_OWNER}/${OIB_REPO}/commits/${OIB_BRANCH}`
  ) as { sha?: string } | null;
  return data?.sha ?? 'unknown';
}

interface GithubFile {
  name: string;
  type: string;
  path: string;
}

async function listDirectory(dirPath: string): Promise<GithubFile[] | null> {
  const data = await githubApiGet(
    `https://api.github.com/repos/${OIB_OWNER}/${OIB_REPO}/contents/${dirPath}?ref=${OIB_BRANCH}`
  );
  if (!data || !Array.isArray(data)) return null;
  return data as GithubFile[];
}

// ── Setting value normalisation ──
// Recursively converts raw Intune Graph API settingInstance objects into a
// compact, typed structure. Option IDs are kept as-is so the browser can
// resolve them to display names using settings-browse.json at runtime.

function normaliseInstance(instance: RawInstance): OIBSetting | null {
  const odataType = (instance['@odata.type'] as string) ?? '';
  const definitionId = instance['settingDefinitionId'] as string;
  if (!definitionId) return null;

  let value: OIBValue;

  if (odataType.includes('GroupSettingCollection')) {
    const raw = (instance['groupSettingCollectionValue'] as RawInstance[]) ?? [];
    value = {
      type: 'groupCollection',
      groups: raw.map((g) => normaliseChildren((g['children'] as RawInstance[]) ?? [])),
    };
  } else if (odataType.includes('GroupSetting')) {
    const g = (instance['groupSettingValue'] as RawInstance) ?? {};
    value = {
      type: 'group',
      members: normaliseChildren((g['children'] as RawInstance[]) ?? []),
    };
  } else if (odataType.includes('ChoiceSettingCollection')) {
    const raw = (instance['choiceSettingCollectionValue'] as RawInstance[]) ?? [];
    value = { type: 'choiceCollection', optionIds: raw.map((v) => v['value'] as string) };
  } else if (odataType.includes('ChoiceSetting')) {
    const cv = (instance['choiceSettingValue'] as RawInstance) ?? {};
    const children = normaliseChildren((cv['children'] as RawInstance[]) ?? []);
    value = {
      type: 'choice',
      optionId: cv['value'] as string,
      ...(children.length > 0 ? { children } : {}),
    };
  } else if (odataType.includes('SimpleSettingCollection')) {
    const raw = (instance['simpleSettingCollectionValue'] as RawInstance[]) ?? [];
    value = {
      type: 'simpleCollection',
      values: raw.map((v) => v['value'] as string | number | boolean | null),
    };
  } else if (odataType.includes('SimpleSetting')) {
    const sv = (instance['simpleSettingValue'] as RawInstance) ?? {};
    value = { type: 'simple', value: sv['value'] as string | number | boolean | null };
  } else {
    value = { type: 'unknown' };
  }

  return { definitionId, value };
}

function normaliseChildren(instances: RawInstance[]): OIBSetting[] {
  return instances
    .map((i) => normaliseInstance(i))
    .filter((s): s is OIBSetting => s !== null);
}

function buildGithubUrl(filePath: string): string {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${OIB_OWNER}/${OIB_REPO}/blob/${OIB_BRANCH}/${encoded}`;
}

// ── Main ──

async function main() {
  if (GITHUB_TOKEN) {
    console.log('Using GITHUB_TOKEN (5,000 req/hr rate limit)');
  } else {
    console.log('No GITHUB_TOKEN found — using unauthenticated (60 req/hr rate limit)');
  }

  console.log('\nFetching latest OIB commit SHA...');
  const oibCommitSha = await getLatestCommitSha();
  console.log(`OIB @ ${oibCommitSha.slice(0, 7)}`);

  const policies: OIBPolicy[] = [];

  for (const { folder, catalogPath } of PLATFORM_PATHS) {
    console.log(`\n── ${folder} (${catalogPath})`);

    const files = await listDirectory(catalogPath);
    if (!files) {
      console.log('   No SettingsCatalog directory found, skipping.');
      continue;
    }

    const jsonFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
    console.log(`   ${jsonFiles.length} policy files`);

    for (const file of jsonFiles) {
      process.stdout.write(`   ${file.name} ... `);
      try {
        const raw = await fetchRawJson(file.path);

        const settings = ((raw['settings'] as RawInstance[]) ?? [])
          .map((s) => normaliseInstance((s['settingInstance'] as RawInstance) ?? {}))
          .filter((s): s is OIBSetting => s !== null);

        policies.push({
          name: (raw['name'] as string) ?? file.name.replace('.json', ''),
          platform: (raw['platforms'] as string) ?? '',
          technologies: (raw['technologies'] as string) ?? '',
          oibFolder: folder,
          githubUrl: buildGithubUrl(file.path),
          settings,
        });

        console.log(`${settings.length} settings`);
      } catch (err) {
        console.error(`FAILED — ${err}`);
      }
    }
  }

  const output: OIBOutput = {
    fetchedAt: new Date().toISOString(),
    oibCommitSha,
    policies,
  };

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(OIB_DATA_FILE, JSON.stringify(output), 'utf-8');

  console.log(`\n✓ ${policies.length} policies written to ${OIB_DATA_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
