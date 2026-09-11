/**
 * fetch-compliance-templates.ts
 *
 * The CLASSIC compliance policies (`deviceManagement/deviceCompliancePolicies`)
 * are typed Graph resources with fixed properties — unlike the settings catalog
 * there is no definition endpoint, so nothing about them can be discovered the
 * way configuration/compliance settings are.
 *
 * This reconstructs that missing catalog from two authoritative sources:
 *   1. Graph $metadata           → types, their properties, and enum members
 *                                  (the "possible values" for each setting)
 *   2. Microsoft's doc source    → the human description of each property
 *
 * Nothing here is hand-written except the type→platform label map, so it
 * regenerates cleanly as Microsoft adds settings.
 *
 * Reads no tenant data and needs no credentials — this is a reference catalog of
 * what CAN be set, never what any tenant HAS set.
 *
 * Writes: data/compliance-templates.json
 *
 * Usage:
 *   npm run fetch-compliance-templates
 */

import * as fs from 'fs';
import * as path from 'path';

// Written to data/ (not public/) so the page can load it at build time as a
// server component prop — same as the main browser's category tree, which is
// what keeps both pages server-rendering identically.
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'compliance-templates.json');

const METADATA_URL = 'https://graph.microsoft.com/beta/$metadata';
const DOCS_BASE =
  'https://raw.githubusercontent.com/microsoftgraph/microsoft-graph-docs-contrib/main/api-reference/beta/resources';

/** Platform label per policy type — the only hand-maintained mapping here. */
const PLATFORMS: Record<string, string> = {
  windows10CompliancePolicy: 'Windows 10/11',
  windows10MobileCompliancePolicy: 'Windows 10 Mobile',
  windows81CompliancePolicy: 'Windows 8.1',
  windowsPhone81CompliancePolicy: 'Windows Phone 8.1',
  macOSCompliancePolicy: 'macOS',
  iosCompliancePolicy: 'iOS/iPadOS',
  androidCompliancePolicy: 'Android device administrator',
  androidWorkProfileCompliancePolicy: 'Android Enterprise work profile',
  androidForWorkCompliancePolicy: 'Android for Work',
  androidDeviceOwnerCompliancePolicy: 'Android Enterprise fully managed',
  aospDeviceOwnerCompliancePolicy: 'AOSP device owner',
};

/** Broad OS family, for the platform filter pills. */
const FAMILIES: Record<string, string> = {
  windows10CompliancePolicy: 'windows10',
  windows10MobileCompliancePolicy: 'windows10',
  windows81CompliancePolicy: 'windows10',
  windowsPhone81CompliancePolicy: 'windows10',
  macOSCompliancePolicy: 'macOS',
  iosCompliancePolicy: 'iOS',
  androidCompliancePolicy: 'android',
  androidWorkProfileCompliancePolicy: 'android',
  androidForWorkCompliancePolicy: 'android',
  androidDeviceOwnerCompliancePolicy: 'android',
  aospDeviceOwnerCompliancePolicy: 'android',
};

/** Structural fields on every policy — not compliance settings. */
const INHERITED = new Set([
  'id', 'displayName', 'description', 'createdDateTime', 'lastModifiedDateTime', 'version', 'roleScopeTagIds',
]);

interface PropertyOption {
  value: string;
  isDefault?: boolean;
}

interface TemplateProperty {
  name: string;
  /** Graph EDM type, e.g. 'Boolean', 'Int32', 'String', 'requiredPasswordType'. */
  type: string;
  description?: string;
  /** Allowed values, for Boolean and enum-typed settings. */
  options?: PropertyOption[];
  /** 'choice' | 'simple' — mirrors the settings catalog's type badge. */
  kind: 'choice' | 'simple';
}

interface ComplianceTemplate {
  type: string;
  platform: string;
  family: string;
  properties: TemplateProperty[];
}

// ─── Graph $metadata ───

interface ParsedMetadata {
  types: Map<string, { base?: string; props: Array<{ name: string; type: string }> }>;
  enums: Map<string, string[]>;
}

/**
 * Parse EntityType and EnumType blocks.
 *
 * ~240 EntityTypes are self-closing (`<EntityType ... />`), so a non-greedy
 * `<EntityType ...>([\s\S]*?)</EntityType>` silently spans across them and
 * swallows real types (windows10CompliancePolicy included). Split on the open
 * tag instead.
 */
function parseMetadata(xml: string): ParsedMetadata {
  const types = new Map<string, { base?: string; props: Array<{ name: string; type: string }> }>();
  for (const chunk of xml.split('<EntityType ').slice(1)) {
    const head = chunk.slice(0, chunk.indexOf('>') + 1);
    const name = /Name="([^"]+)"/.exec(head)?.[1];
    if (!name) continue;
    const base = /BaseType="graph\.([^"]+)"/.exec(head)?.[1];
    const body = head.endsWith('/>') ? '' : chunk.slice(head.length, chunk.indexOf('</EntityType>'));
    const props = [...body.matchAll(/<Property Name="([^"]+)"\s+Type="([^"]+)"/g)]
      .map((m) => ({
        name: m[1],
        type: m[2].replace('Collection(', '[]').replace(')', '').replace(/graph\.|Edm\./, ''),
      }))
      .filter((p) => !INHERITED.has(p.name));
    types.set(name, { base, props });
  }

  const enums = new Map<string, string[]>();
  for (const chunk of xml.split('<EnumType ').slice(1)) {
    const head = chunk.slice(0, chunk.indexOf('>') + 1);
    const name = /Name="([^"]+)"/.exec(head)?.[1];
    if (!name) continue;
    const body = head.endsWith('/>') ? '' : chunk.slice(head.length, chunk.indexOf('</EnumType>'));
    const members = [...body.matchAll(/<Member Name="([^"]+)"/g)].map((m) => m[1]);
    if (members.length) enums.set(name, members);
  }

  return { types, enums };
}

/** Allowed values for a property, where Graph defines a closed set. */
function optionsFor(type: string, enums: Map<string, string[]>): PropertyOption[] | undefined {
  if (type === 'Boolean') {
    // The portal renders these as a Require / Not configured toggle.
    return [{ value: 'Require' }, { value: 'Not configured', isDefault: true }];
  }
  const members = enums.get(type.replace('[]', ''));
  if (!members) return undefined;
  // `notConfigured` / `unavailable` are Graph's spelling of the unset default.
  return members.map((value) => ({
    value,
    isDefault: value === 'notConfigured' || value === 'unavailable' || value === 'deviceDefault',
  }));
}

// ─── Microsoft doc source ───

/** Pull `|name|Type|Description|` rows out of the doc's Properties table. */
async function fetchDescriptions(type: string): Promise<Map<string, string>> {
  const res = await fetch(`${DOCS_BASE}/intune-deviceconfig-${type.toLowerCase()}.md`);
  if (!res.ok) {
    console.warn(`  ! ${type}: docs ${res.status} — properties will have no description`);
    return new Map();
  }
  const descriptions = new Map<string, string>();
  for (const line of (await res.text()).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const [, name, , description] = cells;
    if (!name || name === 'Property' || name.startsWith('-') || !description) continue;
    const clean = description
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\s*Inherited from .*$/, '')
      .trim();
    if (clean) descriptions.set(name, clean);
  }
  return descriptions;
}

// ─── Main ───

async function main() {
  console.log('Classic Compliance Catalog Builder');
  console.log('==================================\n');

  console.log('Fetching Graph $metadata...');
  const res = await fetch(METADATA_URL);
  if (!res.ok) throw new Error(`$metadata failed: ${res.status}`);
  const { types, enums } = parseMetadata(await res.text());
  console.log(`  ${types.size} entity types, ${enums.size} enum types.\n`);

  const templates: ComplianceTemplate[] = [];
  for (const [type, platform] of Object.entries(PLATFORMS)) {
    const entity = types.get(type);
    if (!entity) {
      console.warn(`  ! ${type} not found in $metadata — skipping`);
      continue;
    }
    const descriptions = await fetchDescriptions(type);
    const properties: TemplateProperty[] = entity.props
      .map((p) => {
        const options = optionsFor(p.type, enums);
        return {
          name: p.name,
          type: p.type,
          description: descriptions.get(p.name),
          options,
          kind: (options ? 'choice' : 'simple') as 'choice' | 'simple',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const described = properties.filter((p) => p.description).length;
    const withOptions = properties.filter((p) => p.options).length;
    console.log(
      `  ${platform.padEnd(32)} ${String(properties.length).padStart(3)} settings, ${described} described, ${withOptions} with values`
    );
    templates.push({ type, platform, family: FAMILIES[type] ?? 'none', properties });
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify({ templates }, null, 2), 'utf-8');

  const all = templates.flatMap((t) => t.properties);
  const distinct = new Set(all.map((p) => p.name));
  const undescribed = new Set(all.filter((p) => !p.description).map((p) => p.name));
  const sizeKb = (fs.statSync(TEMPLATES_FILE).size / 1024).toFixed(0);
  console.log(
    `\nCatalog: ${templates.length} platforms, ${all.length} settings (${distinct.size} distinct), ${sizeKb} KB → ${TEMPLATES_FILE}`
  );
  if (undescribed.size > 0) {
    console.log(`  ${undescribed.size} without a description: ${[...undescribed].join(', ')}`);
  }
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
