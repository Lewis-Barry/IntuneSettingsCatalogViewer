/**
 * compliance-check.ts
 *
 * Self-check for the classic compliance catalog (src/lib/compliance-types.ts +
 * scripts/fetch-compliance-templates.ts).
 *
 * The catalog is scraped from two moving sources — Graph $metadata and
 * Microsoft's doc markdown — so the failure mode is silent: a changed layout
 * yields an empty or half-populated catalog that still renders fine. These
 * assertions fail loudly instead.
 *
 * Usage:
 *   npx tsx scripts/compliance-check.ts
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  allRows,
  humanise,
  matchesQuery,
  typeLabel,
  type ComplianceTemplatesFile,
} from '../src/lib/compliance-types';

// ── Labels ──
assert.strictEqual(humanise('storageRequireEncryption'), 'Storage require encryption');
assert.strictEqual(humanise('tpmRequired'), 'TPM required');
assert.strictEqual(humanise('osMinimumVersion'), 'OS minimum version');
assert.strictEqual(humanise('rtpEnabled'), 'RTP enabled');

// ── Type badges ──
assert.strictEqual(typeLabel('Boolean'), 'Boolean');
assert.strictEqual(typeLabel('Int32'), 'Number');
assert.strictEqual(typeLabel('String'), 'String');
assert.strictEqual(typeLabel('[]appListItem'), 'Collection');
assert.strictEqual(typeLabel('requiredPasswordType'), 'Choice');

console.log('Semantics: OK');

// ── The generated catalog ──
const templatesPath = path.resolve(__dirname, '..', 'data', 'compliance-templates.json');
if (!fs.existsSync(templatesPath)) {
  console.error('data/compliance-templates.json not found — run fetch-compliance-templates first.');
  process.exit(1);
}

const { templates }: ComplianceTemplatesFile = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
assert.ok(templates.length >= 10, `expected 10+ platforms, got ${templates.length}`);

const rows = allRows(templates);
const distinct = new Set(rows.map((r) => r.property.name));
assert.ok(rows.length > 200, `expected 200+ settings, got ${rows.length} — metadata parsing likely broke`);

// Descriptions come from Microsoft's doc markdown; a big drop means the table
// layout changed and the parse is silently returning nothing.
const described = rows.filter((r) => r.property.description).length;
assert.ok(
  described / rows.length > 0.9,
  `only ${described}/${rows.length} settings have a description — doc parsing likely broke`
);

// Possible values come from $metadata enum members + the Boolean toggle.
const withOptions = rows.filter((r) => r.property.options?.length);
assert.ok(
  withOptions.length / rows.length > 0.4,
  `only ${withOptions.length}/${rows.length} settings have possible values — enum parsing likely broke`
);
for (const row of withOptions) {
  assert.ok(row.property.kind === 'choice', `${row.property.name}: has options but kind is ${row.property.kind}`);
  assert.ok(row.property.options!.every((o) => o.value), `${row.property.name}: blank option value`);
}

// Booleans must render as the portal's toggle, not raw true/false.
const boolean = rows.find((r) => r.property.type === 'Boolean');
assert.deepStrictEqual(
  boolean!.property.options!.map((o) => o.value),
  ['Require', 'Not configured'],
  'Boolean settings should offer Require / Not configured'
);

// A known enum must carry its real members.
const passwordType = rows.find((r) => r.property.name === 'passwordRequiredType' && r.template.type === 'windows10CompliancePolicy');
assert.ok(passwordType, 'windows passwordRequiredType missing');
assert.deepStrictEqual(
  passwordType!.property.options!.map((o) => o.value),
  ['deviceDefault', 'alphanumeric', 'numeric'],
  'passwordRequiredType enum members wrong'
);

// The settings behind the portal's Windows compliance blade must all be present.
const windows = templates.find((t) => t.type === 'windows10CompliancePolicy');
for (const required of ['storageRequireEncryption', 'activeFirewallRequired', 'tpmRequired', 'defenderEnabled', 'rtpEnabled', 'antivirusRequired', 'antiSpywareRequired', 'signatureOutOfDate', 'bitLockerEnabled', 'secureBootEnabled']) {
  assert.ok(windows!.properties.some((p) => p.name === required), `windows template missing ${required}`);
}

// No tenant data may ever reach this catalog.
const serialised = JSON.stringify(templates);
for (const leak of ['displayName', 'roleScopeTagIds', 'lastModifiedDateTime', 'createdDateTime']) {
  assert.ok(!serialised.includes(`"${leak}"`), `catalog contains tenant/policy field ${leak}`);
}
assert.ok(
  !fs.existsSync(path.resolve(__dirname, '..', 'public', 'compliance-policies.json')),
  'public/compliance-policies.json exists — this tool must not publish tenant values'
);

// ── Search ──
const encryption = rows.filter((r) => matchesQuery(r, ['encryption']));
assert.ok(encryption.length > 0, 'search for "encryption" found nothing');
assert.ok(
  rows.filter((r) => matchesQuery(r, ['firewall'])).some((r) => r.property.name === 'activeFirewallRequired'),
  'search for "firewall" missed activeFirewallRequired'
);
assert.strictEqual(rows.filter((r) => matchesQuery(r, [])).length, rows.length, 'empty query should match everything');

console.log(`Catalog: ${templates.length} platforms, ${rows.length} settings (${distinct.size} distinct)`);
console.log(`  ${described} described, ${withOptions.length} with possible values`);
console.log('  no tenant data present');
console.log('\nDone!');
