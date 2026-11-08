// Self-check for src/lib/changelog-summary.ts.
// Run: npm run check-changelog-summary

import assert from 'node:assert';
import { parseSummaryHighlight } from '../src/lib/changelog-summary';

assert.deepStrictEqual(
  parseSummaryHighlight('Windows: 24 new settings'),
  { body: '24 new settings', platforms: ['windows10'] },
);
assert.deepStrictEqual(
  parseSummaryHighlight('iOS/macOS: new DNS Settings category'),
  { body: 'new DNS Settings category', platforms: ['iOS', 'macOS'] },
);
assert.deepStrictEqual(
  parseSummaryHighlight('Windows Privacy: 4 new settings'),
  { body: 'Privacy: 4 new settings', platforms: ['windows10'] },
);
assert.deepStrictEqual(
  parseSummaryHighlight('Windows, Microsoft Edge: 8 new settings'),
  { body: 'Microsoft Edge: 8 new settings', platforms: ['windows10'] },
);
assert.deepStrictEqual(
  parseSummaryHighlight('Windows and macOS: shared Edge setting'),
  { body: 'shared Edge setting', platforms: ['windows10', 'macOS'] },
);
assert.deepStrictEqual(
  parseSummaryHighlight('Android Enterprise: new eSIM control'),
  { body: 'new eSIM control', platforms: ['android'] },
);
assert.deepStrictEqual(
  parseSummaryHighlight('Microsoft Edge: description updated'),
  { body: 'Microsoft Edge: description updated', platforms: [] },
);
assert.deepStrictEqual(
  parseSummaryHighlight('No settings removed'),
  { body: 'No settings removed', platforms: [] },
);

console.log('changelog-summary self-check passed');
