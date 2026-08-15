// Self-check for src/lib/changelog-export.ts (CSV + HTML changelog reports).
// Run: npm run check-changelog-export

import assert from 'node:assert';
import {
  generateChangelogCsv,
  generateChangelogHtml,
  type ChangelogExportItem,
} from '../src/lib/changelog-export';

const items: ChangelogExportItem[] = [
  {
    date: '2026-03-01',
    action: 'added',
    entity: 'setting',
    title: 'New setting',
    categoryName: 'BitLocker',
    platform: 'windows10',
  },
  {
    date: '2026-03-01',
    action: 'changed',
    entity: 'setting',
    title: 'Existing setting',
    categoryName: 'Wi-Fi',
    platform: 'iOS',
    fields: [
      { field: 'description', oldValue: 'say "hi", ok', newValue: 'say "bye", ok' },
      { field: 'helpText', oldValue: '<old>', newValue: 'x > y' },
    ],
  },
  {
    date: '2026-02-21',
    action: 'removed',
    entity: 'category',
    title: 'Old category',
  },
];

// ── CSV ──
const csv = generateChangelogCsv({ items, scopeLabel: 'All updates' });
const lines = csv.split('\r\n');
// 1 header + 1 added + 2 changed-field rows + 1 removed.
assert.strictEqual(lines.length, 5, `expected 5 CSV lines, got ${lines.length}`);
assert.ok(lines[0].includes('Date,Change,Entity,Name,Category,Platform,Field,'), 'header columns');
assert.ok(csv.includes('"say ""hi"", ok"'), 'comma+quote cell is quoted and escaped');
assert.ok(csv.includes('2026-03-01,Changed,Setting,Existing setting,Wi-Fi,iOS,description'), 'changed row expands per field');
assert.ok(csv.includes('2026-02-21,Removed,Category,Old category,,'), 'removed category row');
assert.ok(csv.charCodeAt(0) === 0xfeff, 'UTF-8 BOM for Excel');

// ── HTML ──
const html = generateChangelogHtml({
  items,
  scopeLabel: 'Feb 21 – Mar 1, 2026',
  generatedAt: new Date('2026-03-02T12:00:00'),
});
assert.ok(html.includes('&lt;old&gt;'), 'HTML escapes old values');
assert.ok(html.includes('x &gt; y'), 'HTML escapes new values');
assert.ok(html.includes('<h2 id="date-2026-03-01"'), 'newest date section first');
assert.ok(html.indexOf('date-2026-03-01') < html.indexOf('date-2026-02-21'), 'dates sorted desc');
assert.ok(html.includes('kind-badge kind-added'), 'added badge');
assert.ok(html.includes('kind-badge kind-removed'), 'removed badge');
assert.ok(html.includes('kind-badge kind-modified'), 'changed badge');
assert.ok(html.includes('Scope: Feb 21 – Mar 1, 2026'), 'scope label in header');
assert.ok(html.includes('Changes: 3'), 'change count in header');

console.log('changelog-export self-check passed');
