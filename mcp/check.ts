// Self-check: `npm run check` (needs network — reads real data from GitHub raw).
import assert from 'node:assert/strict';
import { createSource } from './source.ts';
import * as data from './data.ts';
import * as settingsTools from './tools/settings.ts';
import * as changelogTools from './tools/changelog.ts';
import * as baselineTools from './tools/baselines.ts';
import * as oibTools from './tools/oib.ts';
import * as extrasTools from './tools/extras.ts';

async function checkSource() {
  let calls = 0; let t = 0; let mode: 'ok' | '304' | 'down' = 'ok';
  const fake = (async (_url: string, init?: RequestInit) => {
    calls++;
    if (mode === 'down') throw new Error('ENOTFOUND');
    if (mode === '304') {
      assert.equal((init?.headers as Record<string, string>)['If-None-Match'], '"v1"');
      return new Response(null, { status: 304 });
    }
    return new Response(JSON.stringify({ v: calls }), { status: 200, headers: { etag: '"v1"' } });
  }) as typeof fetch;
  const src = createSource(fake, () => t);

  assert.deepEqual(await src.json('a.json'), { v: 1 });                          // first fetch
  assert.deepEqual(await src.json('a.json'), { v: 1 }); assert.equal(calls, 1); // memo hit
  t = 7 * 3600e3; mode = '304';
  assert.deepEqual(await src.json('a.json'), { v: 1 }); assert.equal(calls, 2); // revalidated
  t = 14 * 3600e3; mode = 'down';
  assert.deepEqual(await src.json('a.json'), { v: 1 });                          // stale fallback
  assert.ok(src.stalePaths.has('a.json'));
  await assert.rejects(src.json('b.json'), /failed to load b\.json from GitHub raw/); // no copy → error
  console.log('✓ source');
}

async function checkData() {
  const { all, byId } = await data.settingIndex();
  assert.ok(all.length > 15000, `settings count ${all.length}`);
  assert.ok(byId.get(all[0].id));
  assert.ok((await data.baselineIndex()).families.length > 5);
  console.log('✓ data');
}

await checkSource();
await checkData();
for (const [name, m] of Object.entries({ settingsTools, changelogTools, baselineTools, oibTools, extrasTools })) {
  await m.selfCheck();
  console.log(`✓ ${name}`);
}
