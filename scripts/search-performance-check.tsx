import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { performance } from 'node:perf_hooks';
import { matchesCompatibilitySearch, createMatchSourceMatcher } from '../src/lib/setting-search';
import { getCspPath, groupSettings } from '../src/lib/settings-grouping';
import { detectMatchSources, type SettingDefinition } from '../src/lib/types';
import SettingsList from '../src/components/SettingsList';

const settings: SettingDefinition[] = JSON.parse(readFileSync('public/avd-multisession.json', 'utf-8')).settings;
const queries = ['a', 'device', 'windows defender, antivirus', 'password length', 'DEVICE', ' , ', '', 'no-match-273481', './device/vendor', '  windows  defender  '];

function referenceMatch(setting: SettingDefinition, terms: string[]) {
  // Uncached reference for the rule in setting-search.ts: every word of some
  // comma-separated term must appear somewhere in the setting.
  const hay = [setting.displayName, setting.name, setting.description, setting.helpText, getCspPath(setting), ...(setting.keywords || [])]
    .map((field) => field?.toLowerCase() || '')
    .join(' ');
  return terms.some((term) => {
    const words = term.split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every((word) => hay.includes(word));
  });
}

for (const query of queries) {
  const terms = query.toLowerCase().split(',').map((term) => term.trim()).filter(Boolean);
  assert.deepEqual(settings.filter((setting) => matchesCompatibilitySearch(setting, terms)), settings.filter((setting) => referenceMatch(setting, terms)));
}

let fieldReads = 0;
const probe = { ...settings[0], get description() { fieldReads++; return 'cached description'; } };
matchesCompatibilitySearch(probe, ['cached']);
matchesCompatibilitySearch(probe, ['description']);
assert.equal(fieldReads, 1);
assert.ok(matchesCompatibilitySearch({ ...probe, description: 'replacement' }, ['replacement']));

let nameReads = 0;
const lazyProbe = { ...settings[0], get displayName() { nameReads++; return 'lazy match'; } };
const matcher = createMatchSourceMatcher('lazy');
assert.equal(nameReads, 0);
const matched = matcher(lazyProbe);
assert.ok(matched?.includes('title'));
assert.equal(matcher(lazyProbe), matched);
assert.equal(nameReads, 1);
assert.deepEqual(createMatchSourceMatcher('other')(lazyProbe), detectMatchSources(lazyProbe, 'other'));

const rows = settings.slice(0, 25);
const grouped = groupSettings(rows);
const render = (prepared?: typeof grouped) => renderToStaticMarkup(createElement(SettingsList, {
  settings: rows, categoryName: 'Check', isSearchResult: true, highlightQuery: 'device', groupedSettings: prepared,
}));
assert.equal(render(grouped), render());

function medianTime(callback: () => unknown) {
  const samples: number[] = [];
  for (let iteration = 0; iteration < 50; iteration++) {
    const start = performance.now();
    callback();
    if (iteration >= 10) samples.push(performance.now() - start);
  }
  return samples.sort((first, second) => first - second)[Math.floor(samples.length / 2)].toFixed(3);
}

const terms = ['windows defender', 'antivirus'];
console.log(`Compatibility parity: ${queries.length} queries across ${settings.length} settings; field normalization and visible-row matching cached`);
console.log('Prepared and standalone grouping render identically');
console.log(`Warm filter median: ${medianTime(() => settings.filter((setting) => referenceMatch(setting, terms)))} ms original, ${medianTime(() => settings.filter((setting) => matchesCompatibilitySearch(setting, terms)))} ms cached`);