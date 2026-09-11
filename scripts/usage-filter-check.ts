/**
 * usage-filter-check.ts
 *
 * Self-check for the catalog (configuration/compliance) filter.
 *
 * settingUsage is a comma-separated flag set, not a single value — the real
 * catalog contains "configuration", "compliance" and "configuration,compliance".
 * Treating it as a single value silently drops dual-usage settings from one
 * filter, which is exactly the bug this guards.
 *
 * Usage:
 *   npx tsx scripts/usage-filter-check.ts
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { hasUsage, type SettingDefinition } from '../src/lib/types';

// ── Flag semantics ──
assert.ok(hasUsage('configuration', 'configuration'));
assert.ok(!hasUsage('configuration', 'compliance'));
assert.ok(hasUsage('compliance', 'compliance'));
assert.ok(!hasUsage('compliance', 'configuration'));

// Dual-usage settings belong to BOTH catalogs.
assert.ok(hasUsage('configuration,compliance', 'configuration'));
assert.ok(hasUsage('configuration,compliance', 'compliance'));

// Unrelated flags must not leak into either catalog.
assert.ok(hasUsage('configuration,reusableSetting', 'configuration'));
assert.ok(!hasUsage('configuration,reusableSetting', 'compliance'));

// A missing value means configuration — that's why the build scripts omit it.
assert.ok(hasUsage(undefined, 'configuration'));
assert.ok(!hasUsage(undefined, 'compliance'));

// Substring matches must not count ("compliance" is not a prefix flag match).
assert.ok(!hasUsage('noncompliance', 'compliance'));
assert.ok(hasUsage(' configuration , compliance ', 'compliance'));

console.log('Flag semantics: OK');

// ── Against real data, when it has been fetched ──
const SETTINGS_FILE = path.resolve(__dirname, '..', 'data', 'settings.json');
if (!fs.existsSync(SETTINGS_FILE)) {
  console.log('data/settings.json not found — skipping the real-data check. Run fetch-settings first.');
  process.exit(0);
}

const settings: SettingDefinition[] = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
const configuration = settings.filter((s) => hasUsage(s.settingUsage, 'configuration'));
const compliance = settings.filter((s) => hasUsage(s.settingUsage, 'compliance'));

// Every setting must land in at least one catalog, or the UI can't reach it.
const orphans = settings.filter((s) => !hasUsage(s.settingUsage, 'configuration') && !hasUsage(s.settingUsage, 'compliance'));
assert.strictEqual(orphans.length, 0, `${orphans.length} settings match no catalog filter (first: ${orphans[0]?.id} usage=${orphans[0]?.settingUsage})`);

console.log(`Real data: ${configuration.length} configuration, ${compliance.length} compliance (of ${settings.length} total)`);
console.log('Done!');
