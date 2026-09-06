import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { isSearchCache, readSearchCache, writeSearchCache, type CachedSearchIndex } from '../src/lib/search-cache';
import type { SearchIndexEntry } from '../src/lib/types';

const source = readFileSync('src/lib/search.worker.ts', 'utf-8');
const requireWorker = createRequire(resolve('src/lib/search.worker.ts'));
const manifest = JSON.parse(readFileSync('data/search-index-manifest.json', 'utf-8'));
const documents: SearchIndexEntry[] = JSON.parse(readFileSync('public/search-index.json', 'utf-8'));
const code = transpileModule(`${source}\nglobalThis.api = { ensureIndex, runSearch };`, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function createWorker(cached?: CachedSearchIndex, unavailable = false, data = documents) {
  let fetches = 0;
  let cacheReads = 0;
  let completeWrite!: (value: CachedSearchIndex) => void;
  const written = new Promise<CachedSearchIndex>((resolveWrite) => { completeWrite = resolveWrite; });
  const context = createContext({
    exports: {}, self: {},
    require: (name: string) => {
      if (name === './search-cache') return {
        readSearchCache: async (_key: string, version: string, count: number) => {
          cacheReads++;
          if (unavailable) throw new Error('Storage unavailable');
          return isSearchCache(cached, version, count) ? cached : null;
        },
        writeSearchCache: async (_key: string, value: CachedSearchIndex) => {
          completeWrite(value);
          if (unavailable) throw new Error('Quota exceeded');
        },
      };
      if (name.endsWith('/search-index-manifest.json')) return { ...manifest, documentCount: data.length };
      return requireWorker(name);
    },
    fetch: async () => {
      fetches++;
      return { ok: true, json: async () => data };
    },
  });
  runInContext(code, context);
  return {
    ensure: () => context.api.ensureIndex(''),
    search: (query: string, limit = 200): SearchIndexEntry[] => context.api.runSearch(query, limit),
    fetches: () => fetches,
    cacheReads: () => cacheReads,
    written,
  };
}

async function main() {
  const cold = createWorker();
  await Promise.all([cold.ensure(), cold.ensure(), cold.ensure()]);
  assert.equal(cold.fetches(), 1);
  assert.equal(cold.cacheReads(), 1);
  const saved = await cold.written;
  assert.ok(isSearchCache(saved, saved.version, documents.length));
  assert.equal(saved.chunks.length, 13);

  const warm = createWorker(saved);
  await Promise.all([warm.ensure(), warm.ensure()]);
  assert.equal(warm.fetches(), 0);
  const queries = ['defender', 'device', 'allow', 'password length', 'windows defender, antivirus', 'DEVICE', '  windows  defender  ', ' , , ', 'unlikely-no-match-398475', 'allow,allow', 'a', 'Wi-Fi', 'block usb', './Device/Vendor/MSFT'];
  for (const query of queries) {
    for (const limit of [1, 50, 200]) assert.equal(JSON.stringify(warm.search(query, limit)), JSON.stringify(cold.search(query, limit)));
  }
  console.log('Cold/warm ranking parity: 42 query/limit combinations; one cold download, zero warm downloads');

  const badCaches = [
    { ...saved, version: 'old-version' },
    { ...saved, documents: saved.documents.slice(1) },
    { ...saved, chunks: saved.chunks.slice(1) },
    { ...saved, chunks: saved.chunks.map(([key, value]): [string, string] => [key, key === 'displayName.map' ? '{invalid' : value]) },
    { ...saved, chunks: saved.chunks.map(([key, value]): [string, string] => [key, key === 'displayName.map' ? 'null' : value]) },
    { ...saved, chunks: saved.chunks.map(([key, value]): [string, string] => [key, key === 'reg' ? '{}' : value]) },
  ];
  for (const badCache of badCaches) {
    const recovered = createWorker(badCache);
    await recovered.ensure();
    assert.equal(recovered.fetches(), 1);
    assert.equal(JSON.stringify(recovered.search('defender')), JSON.stringify(cold.search('defender')));
    await recovered.written;
  }
  const unavailable = createWorker(undefined, true);
  await unavailable.ensure();
  assert.equal(JSON.stringify(unavailable.search('defender')), JSON.stringify(cold.search('defender')));
  await unavailable.written;
  assert.equal(await readSearchCache('', saved.version, documents.length), null);
  await writeSearchCache('', saved);
  console.log('Stale, incomplete, corrupt and unavailable caches rebuild successfully; failed storage does not break search');

  const names = ['Other setting', 'MyPasswordValue', 'Require password', 'Password length', 'Password'];
  const small = names.map((displayName, position) => ({ ...documents[0], id: `check-${position}`, displayName, description: 'password', keywords: 'password', categoryName: 'Check' }));
  const ranking = createWorker(undefined, false, small);
  await ranking.ensure();
  assert.equal(JSON.stringify(ranking.search('password').map((setting) => setting.id)), JSON.stringify(['check-4', 'check-3', 'check-2', 'check-1', 'check-0']));
  assert.equal(ranking.search(' , ').length, 0);
  await ranking.written;
  console.log('Relevance order: exact, prefix, word, substring, then non-title matches');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});