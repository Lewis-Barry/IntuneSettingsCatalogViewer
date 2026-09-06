import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesWindowsCompatibility, type WindowsCompatibility } from '../src/lib/sku-labels';
import type { SettingDefinition } from '../src/lib/types';

const settings: SettingDefinition[] = JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url), 'utf8'));
const reports: [WindowsCompatibility, string][] = [
  ['enterprise-only', 'pro-exclusive'],
  ['avd-multisession', 'avd-multisession'],
];

for (const [filter, file] of reports) {
  const report: { settings: SettingDefinition[] } = JSON.parse(readFileSync(new URL(`../public/${file}.json`, import.meta.url), 'utf8'));
  const matches = settings.filter((setting) => matchesWindowsCompatibility(setting.applicability?.windowsSkus, filter));
  assert.deepEqual(matches.map((setting) => setting.id).sort(), report.settings.map((setting) => setting.id).sort());
  assert.ok(matches.every((setting) => setting.applicability?.platform?.split(',').includes('windows10')));
  console.log(`${filter}: ${matches.length} definitions match the existing report`);
}

assert.equal(matchesWindowsCompatibility(undefined, ''), true);
assert.equal(matchesWindowsCompatibility(undefined, 'enterprise-only'), false);
assert.equal(matchesWindowsCompatibility(undefined, 'avd-multisession'), false);
assert.equal(matchesWindowsCompatibility(['windowsEnterprise', 'windowsProfessional'], 'enterprise-only'), false);
assert.equal(matchesWindowsCompatibility(['windowsEnterprise', 'windowsMultiSession'], 'enterprise-only'), true);
assert.equal(matchesWindowsCompatibility(['windowsMultiSession'], 'avd-multisession'), true);