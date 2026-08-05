/**
 * Self-check for src/lib/baseline-diff.ts — run: npx tsx scripts/baseline-diff-check.ts
 * No test framework; throws on first failed assertion.
 *
 * Asserts a sanity check verified against the raw Graph payloads: the Windows
 * security baseline v4 (24H2) → v5 (25H2) diff yields exactly 3 added,
 * 3 removed, 1 changed at leaf level. Requires `npm run fetch-baselines`.
 *
 * The third added row is a container child: v5's ASR groupCollection gains a
 * 12th rule (Block process creations from PSExec/WMI = Audit). The engine
 * diffs containers per child (like the OIB diff), so that surfaces as an
 * ADDED row tagged with its ASR parent rather than one giant "changed" row.
 */
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { diffBaselineVersions } from '../src/lib/baseline-diff';
import type { BaselineShard } from '../src/lib/baseline-types';

const WINDOWS_BASE_ID = '66df8dce-0166-4b82-92f7-1f74e3ca17a3';
const DIR = path.resolve(__dirname, '..', 'public', 'baselines');

function load(version: number): BaselineShard {
  const file = path.join(DIR, `${WINDOWS_BASE_ID}_${version}.json`);
  assert.ok(fs.existsSync(file), `missing ${file} — run "npm run fetch-baselines" first`);
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as BaselineShard;
}

const v4 = load(4);
const v5 = load(5);
const d = diffBaselineVersions(v4.settings, v5.settings);

assert.equal(d.counts.added, 3, `expected 3 added, got ${d.counts.added}`);
assert.equal(d.counts.removed, 3, `expected 3 removed, got ${d.counts.removed}`);
assert.equal(d.counts.changed, 1, `expected 1 changed, got ${d.counts.changed}`);

const names = (kind: string) =>
  d.changes
    .filter((c) => c.kind === kind)
    .map((c) => ((c.compare ?? c.base)?.displayName ?? '').toLowerCase());

const expectName = (kind: string, needle: string) =>
  assert.ok(
    names(kind).some((n) => n.includes(needle)),
    `expected a ${kind} setting matching "${needle}", got: ${names(kind).join(' | ')}`
  );

expectName('added', 'command line in process creation');
expectName('added', 'internet explorer 11');
expectName('removed', 'exclusions');
expectName('removed', 'packed executables');
expectName('removed', 'wdigest');
expectName('changed', 'impersonate');
expectName('added', 'psexec');

// The third added row must be the PSExec/WMI rule inside the ASR group.
const psexec = d.changes.find((c) =>
  c.settingDefinitionId.endsWith('_blockprocesscreationsfrompsexecandwmicommands')
);
assert.ok(psexec, 'PSExec ASR child change missing');
assert.equal(psexec!.kind, 'added', `PSExec ASR rule should be added, got ${psexec!.kind}`);
assert.ok(
  (psexec!.parent ?? '').toLowerCase().includes('attack surface reduction'),
  `PSExec ASR rule should carry its ASR parent, got "${psexec!.parent}"`
);

console.log('✓ baseline-diff self-check passed');
console.log(`  ${v4.displayVersion} → ${v5.displayVersion}: +${d.counts.added} −${d.counts.removed} ~${d.counts.changed}`);
