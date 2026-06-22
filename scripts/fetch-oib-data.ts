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
const VERSIONS_DIR = path.join(PUBLIC_DIR, 'oib-versions');

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
  /** Stable GUID from PolicyManifest.json, where the version ships one. */
  oibId?: string;
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

// OIB files arrive in a few encodings: plain UTF-8, UTF-16 (BOM), and a handful
// that are double-encoded in the repo (original bytes read as UTF-16BE then
// re-saved as UTF-8, so each char holds two original bytes). Try clean parse,
// then repair the double-encoding before giving up.
function parseLoose(buf: Buffer): RawInstance {
  let text: string;
  if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le');
  else if (buf[0] === 0xfe && buf[1] === 0xff) text = buf.swap16().toString('utf16le');
  else text = buf.toString('utf8');
  text = text.replace(/^﻿/, '');

  try {
    return JSON.parse(text) as RawInstance;
  } catch (firstErr) {
    // Repair: each char ≥0x100 packs two original bytes (big-endian).
    const bytes: number[] = [];
    for (const ch of text) {
      const c = ch.codePointAt(0)!;
      if (c > 0xff) bytes.push((c >> 8) & 0xff, c & 0xff);
      else bytes.push(c);
    }
    const repaired = Buffer.from(bytes).toString('utf8').replace(/^﻿/, '');
    try {
      return JSON.parse(repaired) as RawInstance;
    } catch {
      throw firstErr; // not the corruption we know how to fix
    }
  }
}

async function fetchRawJson(filePath: string, ref = OIB_BRANCH): Promise<RawInstance> {
  // raw.githubusercontent.com serves any ref (branch or tag) and does NOT count
  // against the api.github.com rate limit, so bulk file fetches are cheap.
  const url = `https://raw.githubusercontent.com/${OIB_OWNER}/${OIB_REPO}/${ref}/${filePath}`;
  const res = await fetch(url);
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`Raw fetch ${res.status} for: ${url}`);
  return parseLoose(Buffer.from(await res.arrayBuffer()));
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

async function listDirectory(dirPath: string, ref = OIB_BRANCH): Promise<GithubFile[] | null> {
  const data = await githubApiGet(
    `https://api.github.com/repos/${OIB_OWNER}/${OIB_REPO}/contents/${dirPath}?ref=${ref}`
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

function buildGithubUrl(filePath: string, ref = OIB_BRANCH): string {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${OIB_OWNER}/${OIB_REPO}/blob/${ref}/${encoded}`;
}

// ── Per-platform policy fetch (shared by main snapshot + version shards) ──

/** name → oibId, read from a version's PolicyManifest.json (empty if absent). */
async function fetchManifestIds(folder: string, ref: string): Promise<Map<string, string>> {
  const raw = await fetchRawJson(`${folder}/PolicyManifest.json`, ref);
  const map = new Map<string, string>();
  for (const p of (raw['policies'] as RawInstance[]) ?? []) {
    const name = p['name'] as string;
    const oibId = p['oibId'] as string;
    if (name && oibId) map.set(name, oibId);
  }
  return map;
}

async function fetchPlatformPolicies(
  folder: string,
  catalogPath: string,
  ref: string,
  manifest: Map<string, string>
): Promise<OIBPolicy[]> {
  const files = await listDirectory(catalogPath, ref);
  if (!files) return [];

  const jsonFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  const policies: OIBPolicy[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await fetchRawJson(file.path, ref);
      const settings = ((raw['settings'] as RawInstance[]) ?? [])
        .map((s) => normaliseInstance((s['settingInstance'] as RawInstance) ?? {}))
        .filter((s): s is OIBSetting => s !== null);

      const name = (raw['name'] as string) ?? file.name.replace('.json', '');
      policies.push({
        name,
        platform: (raw['platforms'] as string) ?? '',
        technologies: (raw['technologies'] as string) ?? '',
        oibFolder: folder,
        githubUrl: buildGithubUrl(file.path, ref),
        ...(manifest.get(name) ? { oibId: manifest.get(name) } : {}),
        settings,
      });
    } catch (err) {
      console.error(`   FAILED ${file.name} — ${err}`);
    }
  }
  return policies;
}

// ── Version (release tag) enumeration ──

interface VersionShard {
  tag: string;
  folder: string;
  version: string;
  date: string;
  policies: OIBPolicy[];
}

const TAG_FOLDER: Array<{ re: RegExp; folder: string }> = [
  { re: /^windows-v([\d.]+)$/, folder: 'WINDOWS' },
  { re: /^macos-v([\d.]+)$/, folder: 'MACOS' },
  { re: /^win365-v([\d.]+)$/, folder: 'WINDOWS365' },
  { re: /^v([\d.]+)$/, folder: 'WINDOWS' }, // legacy untagged-platform Windows releases (e.g. v3.2)
];

function parseTag(tag: string): { folder: string; version: string } | null {
  for (const { re, folder } of TAG_FOLDER) {
    const m = tag.match(re);
    if (m) return { folder, version: m[1] };
  }
  return null;
}

async function fetchAllTags(): Promise<Array<{ name: string }>> {
  const out: Array<{ name: string }> = [];
  for (let page = 1; page <= 5; page++) {
    const data = (await githubApiGet(
      `https://api.github.com/repos/${OIB_OWNER}/${OIB_REPO}/tags?per_page=100&page=${page}`
    )) as Array<{ name: string }> | null;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

async function fetchReleaseDates(): Promise<Map<string, string>> {
  const data = (await githubApiGet(
    `https://api.github.com/repos/${OIB_OWNER}/${OIB_REPO}/releases?per_page=100`
  )) as Array<{ tag_name: string; published_at: string }> | null;
  const map = new Map<string, string>();
  for (const r of data ?? []) map.set(r.tag_name, r.published_at);
  return map;
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

  // ── 1. Current snapshot from main (powers the existing /baseline browser) ──
  const mainManifests = new Map<string, Map<string, string>>();
  const policies: OIBPolicy[] = [];

  for (const { folder, catalogPath } of PLATFORM_PATHS) {
    console.log(`\n── ${folder} (main)`);
    const manifest = await fetchManifestIds(folder, OIB_BRANCH);
    mainManifests.set(folder, manifest);
    const p = await fetchPlatformPolicies(folder, catalogPath, OIB_BRANCH, manifest);
    console.log(`   ${p.length} policies`);
    policies.push(...p);
  }

  const output: OIBOutput = { fetchedAt: new Date().toISOString(), oibCommitSha, policies };
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(OIB_DATA_FILE, JSON.stringify(output), 'utf-8');
  console.log(`\n✓ ${policies.length} policies written to ${OIB_DATA_FILE}`);

  // ── 2. Per-version shards from release tags (powers /baseline/changelog) ──
  console.log('\nEnumerating release tags...');
  const [tags, releaseDates] = await Promise.all([fetchAllTags(), fetchReleaseDates()]);

  const versionTags = tags
    .map((t) => ({ tag: t.name, ...parseTag(t.name) }))
    .filter((t): t is { tag: string; folder: string; version: string } => !!t.folder);
  console.log(`   ${versionTags.length} version tags: ${versionTags.map((t) => t.tag).join(', ')}`);

  const catalogFor = new Map(PLATFORM_PATHS.map((p) => [p.folder, p.catalogPath]));
  const shards: VersionShard[] = [];

  for (const { tag, folder, version } of versionTags) {
    const catalogPath = catalogFor.get(folder);
    if (!catalogPath) continue;
    process.stdout.write(`   ${tag} (${folder} v${version}) ... `);
    const manifest = await fetchManifestIds(folder, tag);
    const tagPolicies = await fetchPlatformPolicies(folder, catalogPath, tag, manifest);
    const date = (releaseDates.get(tag) ?? '').slice(0, 10);
    console.log(`${tagPolicies.length} policies`);
    if (tagPolicies.length === 0) {
      console.log(`     ↳ skipping ${tag}: no Settings Catalog policies at this tag (older repo layout)`);
      continue;
    }
    shards.push({ tag, folder, version, date, policies: tagPolicies });
  }

  fs.mkdirSync(VERSIONS_DIR, { recursive: true });
  for (const shard of shards) {
    fs.writeFileSync(path.join(VERSIONS_DIR, `${shard.tag}.json`), JSON.stringify(shard), 'utf-8');
  }

  // Index: platforms → their versions (newest first), for the picker.
  const byFolder = new Map<string, VersionShard[]>();
  for (const s of shards) (byFolder.get(s.folder) ?? byFolder.set(s.folder, []).get(s.folder)!).push(s);

  const index = {
    generatedAt: new Date().toISOString(),
    oibCommitSha,
    platforms: FOLDER_ORDER.filter((f) => byFolder.has(f)).map((folder) => ({
      folder,
      label: FOLDER_LABELS[folder] ?? folder,
      versions: byFolder
        .get(folder)!
        .sort((a, b) => compareVersions(b.version, a.version))
        .map((s) => ({ tag: s.tag, version: s.version, date: s.date, policyCount: s.policies.length })),
    })),
  };
  fs.writeFileSync(path.join(VERSIONS_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');

  console.log(`\n✓ ${shards.length} version shards + index written to ${VERSIONS_DIR}`);
}

// Numeric version compare: "3.10" > "3.9".
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const FOLDER_LABELS: Record<string, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  WINDOWS365: 'Windows 365',
};
const FOLDER_ORDER = ['WINDOWS', 'MACOS', 'WINDOWS365'];

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
