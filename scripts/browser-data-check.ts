import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SettingDefinition } from '../src/lib/types';
import { loadBrowserJson, loadSettingDefinitions } from '../src/lib/browser-data';
import { loadCategorySettings, planCategoryLoads } from '../src/lib/category-data';
import type { CategoryTreeNode } from '../src/lib/types';
import { defaultVersion, type BaselineIndex, type BaselineShard } from '../src/lib/baseline-types';

function readJson(filename: string) {
  return JSON.parse(readFileSync(filename, 'utf-8'));
}

const settings: SettingDefinition[] = readJson('public/settings-browse.json');
const byId = new Map(settings.map((setting) => [setting.id, setting]));
const manifest: Record<string, string> = readJson('data/setting-definitions-manifest.json');

function checkReferences(value: unknown, subset: Map<string, SettingDefinition>) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'definitionId' || key === 'settingDefinitionId') && typeof child === 'string') {
      if (byId.has(child)) assert.deepEqual(subset.get(child), byId.get(child), `Missing or changed definition: ${child}`);
    } else {
      checkReferences(child, subset);
    }
  }
}

for (const scope of ['oib', 'baselines']) {
  const filename = `public/${manifest[scope]}`;
  const raw = readFileSync(filename, 'utf-8');
  const subset: SettingDefinition[] = JSON.parse(raw);
  const subsetById = new Map(subset.map((setting) => [setting.id, setting]));
  assert.equal(subset.length, subsetById.size);
  assert.ok(subset.length > 0 && subset.length < settings.length);
  assert.ok(filename.includes(createHash('sha256').update(raw).digest('hex').slice(0, 16)));
  for (const setting of subset) {
    assert.deepEqual(setting, byId.get(setting.id));
    if (setting.rootDefinitionId && byId.has(setting.rootDefinitionId)) {
      assert.ok(subsetById.has(setting.rootDefinitionId), `Missing parent: ${setting.rootDefinitionId}`);
    }
  }
  const sourceDir = `public/${scope === 'oib' ? 'oib-versions' : 'baselines'}`;
  for (const file of readdirSync(sourceDir).filter((file) => file.endsWith('.json') && file !== 'index.json')) {
    checkReferences(readJson(`${sourceDir}/${file}`), subsetById);
  }
  if (scope === 'oib') checkReferences(readJson('public/oib-data.json'), subsetById);
  console.log(`${scope}: ${subset.length} definitions, ${(Buffer.byteLength(raw) / 1024 / 1024).toFixed(2)} MiB; references and parents preserved`);
}

const tree: CategoryTreeNode[] = readJson('data/category-tree.json');
const categoryManifest: { files: Record<string, string | null>; bundles: Record<string, { file: string; categoryIds: string[] }> } = readJson('data/category-load-manifest.json');
const byCategory = new Map<string, SettingDefinition[]>();
for (const setting of settings) {
  const list = byCategory.get(setting.categoryId) ?? [];
  list.push(setting);
  byCategory.set(setting.categoryId, list);
}
function checkCategory(node: CategoryTreeNode): string[] {
  const categoryIds = [node.id, ...node.children.flatMap(checkCategory)];
  const loads = planCategoryLoads(categoryIds, new Set());
  const actual = loads.flatMap((load) => readJson(`public/${decodeURIComponent(load.file.split('?')[0])}`) as SettingDefinition[]);
  const expected = categoryIds.flatMap((id) => byCategory.get(id) ?? []);
  const sortById = (list: SettingDefinition[]) => list.sort((first, second) => first.id.localeCompare(second.id));
  assert.deepEqual(sortById(actual), sortById(expected), `Category changed: ${node.displayName}`);
  assert.equal(planCategoryLoads(categoryIds, new Set(categoryIds)).length, 0);
  if (categoryManifest.bundles[node.id]) assert.equal(loads.length, 1, `Subtree not bundled: ${node.displayName}`);
  return categoryIds;
}
tree.forEach(checkCategory);
for (const [id, file] of Object.entries(categoryManifest.files)) {
  if (!file) assert.equal(planCategoryLoads([id], new Set()).length, 0);
}
for (const file of [...Object.values(categoryManifest.files), ...Object.values(categoryManifest.bundles).map((bundle) => bundle.file)]) {
  if (!file) continue;
  const raw = readFileSync(`public/${decodeURIComponent(file.split('?')[0])}`);
  assert.ok(file.includes(createHash('sha256').update(raw).digest('hex').slice(0, 16)), `Stale category version: ${file}`);
}
console.log('Category plans: all subtrees preserve exact settings; large subtrees use one bundle; empty and cached shards skipped');

async function checkRequests() {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let fail = false;
  let invalidJson = false;
  globalThis.fetch = async (input) => {
    fetchCount++;
    if (fail) return new Response('', { status: 503 });
    const data = String(input).includes('setting-definitions/') ? [settings[0]] : { url: String(input) };
    return new Response(invalidJson ? '{' : JSON.stringify(data));
  };
  try {
    const first = loadBrowserJson('check-concurrent.json');
    assert.equal(loadBrowserJson('check-concurrent.json'), first);
    const parsed = await first;
    assert.equal(await loadBrowserJson('check-concurrent.json'), parsed);
    assert.equal(fetchCount, 1);

    const definitions = loadSettingDefinitions('baselines');
    assert.equal(loadSettingDefinitions('baselines'), definitions);
    const definitionMap = await definitions;
    assert.equal(await loadSettingDefinitions('baselines'), definitionMap);
    assert.deepEqual(definitionMap.get(settings[0].id), settings[0]);
    assert.equal(fetchCount, 2);

    fail = true;
    await assert.rejects(loadSettingDefinitions('oib'), /503/);
    fail = false;
    assert.ok((await loadSettingDefinitions('oib')).has(settings[0].id));
    assert.equal(fetchCount, 4);

    invalidJson = true;
    await assert.rejects(loadBrowserJson('check-json-retry.json'));
    invalidJson = false;
    await loadBrowserJson('check-json-retry.json');
    assert.equal(fetchCount, 6);

    await loadBrowserJson('check-version-1.json');
    await loadBrowserJson('check-version-2.json');
    assert.equal(fetchCount, 8);
    console.log('Browser cache: concurrent and completed requests shared; failed requests retry; versions remain separate');

    const index: BaselineIndex = readJson('public/baselines/index.json');
    const ids = index.families.map((family) => defaultVersion(family)!.id);
    const pending = new Map<string, (response: Response) => void>();
    const loaded = new Map<string, BaselineShard>();
    let shardFetches = 0;
    globalThis.fetch = (input) => {
      shardFetches++;
      const id = String(input).split('/').pop()!.replace('.json', '');
      return new Promise<Response>((resolve) => pending.set(id, resolve));
    };
    function ensureShard(id: string) {
      if (loaded.has(id)) return;
      void loadBrowserJson<BaselineShard>(`baselines/${id}.json`).then((shard) => {
        if (loaded.has(id)) return;
        loaded.set(id, shard);
        ids.forEach(ensureShard);
      });
    }
    ids.forEach(ensureShard);
    for (const id of ids) {
      pending.get(id)!(new Response(readFileSync(`public/baselines/${id}.json`)));
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.equal(loaded.size, ids.length);
    assert.equal(shardFetches, ids.length);
    console.log(`Staggered shard completion: ${ids.length} families, ${shardFetches} requests despite repeated load attempts`);

    const bundle = Object.values(categoryManifest.bundles)[0];
    assert.ok(bundle);
    const partial = new Set(bundle.categoryIds.filter((id) => categoryManifest.files[id]).slice(0, -1));
    const partialPlan = planCategoryLoads(bundle.categoryIds, partial);
    assert.equal(partialPlan.length, 1);
    assert.ok(partialPlan[0].file.startsWith('settings-by-category/'));
    let categoryFetches = 0;
    globalThis.fetch = async (input) => {
      categoryFetches++;
      const url = new URL(String(input), 'http://localhost');
      const file = url.pathname.slice(url.pathname.indexOf('/settings-') + 1);
      return new Response(readFileSync(`public/${decodeURIComponent(file)}`));
    };
    const [firstCategories, secondCategories] = await Promise.all([
      loadCategorySettings(bundle.categoryIds, new Set()),
      loadCategorySettings(bundle.categoryIds, new Set()),
    ]);
    assert.deepEqual(firstCategories, secondCategories);
    assert.equal(categoryFetches, 1);
    for (const id of bundle.categoryIds) assert.deepEqual(firstCategories[id], byCategory.get(id) ?? []);
    console.log('Category loading: concurrent bundles share one fetch; warm selections avoid downloading the whole bundle');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

checkRequests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});