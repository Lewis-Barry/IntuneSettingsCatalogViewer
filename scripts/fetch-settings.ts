/**
 * fetch-settings.ts
 *
 * Authenticates with Microsoft Graph via client credentials and pulls
 * the full Intune Settings Catalog (configuration + compliance).
 * Writes the results to data/settings.json and data/categories.json.
 *
 * Usage:
 *   AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=xxx AZURE_CLIENT_SECRET=xxx npx tsx scripts/fetch-settings.ts
 */

import * as fs from 'fs';
import * as path from 'path';

import { getAccessToken, graphGet, fetchAllPages } from './graph';

// ─── Config ───
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const LAST_UPDATED_FILE = path.join(DATA_DIR, 'last-updated.json');

// Select only the fields we need to reduce payload
const SETTINGS_SELECT = [
  'id',
  'name',
  'displayName',
  'description',
  'helpText',
  'version',
  'categoryId',
  'rootDefinitionId',
  'baseUri',
  'offsetUri',
  'settingUsage',
  'visibility',
  'uxBehavior',
  'accessTypes',
  'applicability',
  'occurrence',
  'keywords',
  'infoUrls',
  'referredSettingInformationList',
  'options',
  'defaultOptionId',
  'valueDefinition',
  'defaultValue',
  'childIds',
  'minimumCount',
  'maximumCount',
  'dependentOn',
  'dependedOnBy',
].join(',');

const CATEGORIES_SELECT = [
  'id',
  'name',
  'displayName',
  'description',
  'categoryDescription',
  'helpText',
  'platforms',
  'technologies',
  'settingUsage',
  'parentCategoryId',
  'rootCategoryId',
  'childCategoryIds',
].join(',');

// ─── Catalogs ───
// Compliance and configuration are the same Graph resource types on sibling
// endpoints, under the same permission scope — so one loop pulls both and every
// downstream consumer (shards, search index, setting pages) works unchanged.
// Each record already carries its own `settingUsage`, which the UI filters on.
const CATALOGS = [
  { usage: 'configuration', categories: 'configurationCategories', settings: 'configurationSettings' },
  { usage: 'compliance', categories: 'complianceCategories', settings: 'complianceSettings' },
] as const;

// ─── Main ───

async function main() {
  console.log('Intune Settings Catalog Fetcher');
  console.log('================================');
  console.log();

  await getAccessToken(); // validate credentials up front

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load existing data for comparison (if available)
  let existingSettings = '';
  let existingCategories = '';
  if (fs.existsSync(SETTINGS_FILE)) {
    existingSettings = fs.readFileSync(SETTINGS_FILE, 'utf-8');
  }
  if (fs.existsSync(CATEGORIES_FILE)) {
    existingCategories = fs.readFileSync(CATEGORIES_FILE, 'utf-8');
  }

  // 1. Fetch each catalog (configuration, compliance) into one combined set
  const categories: Record<string, unknown>[] = [];
  const settings: Record<string, unknown>[] = [];

  for (const catalog of CATALOGS) {
    console.log(`\nFetching ${catalog.usage} categories...`);
    const catalogCategories = await fetchAllPages<Record<string, unknown>>(
      `/deviceManagement/${catalog.categories}?$select=${CATEGORIES_SELECT}`,
      true
    );
    console.log(`  Retrieved ${catalogCategories.length} categories.`);

    // Note: we omit $select because setting definitions are polymorphic —
    // sub-types (choice, simple, group, etc.) have different properties and
    // $select on the base type rejects sub-type-only fields like 'options'.
    console.log(`Fetching ${catalog.usage} settings...`);
    const catalogSettings = await fetchAllPages<Record<string, unknown>>(`/deviceManagement/${catalog.settings}`, true);
    console.log(`  Retrieved ${catalogSettings.length} settings.`);

    // Graph stamps settingUsage itself; fall back to the endpoint we asked, so
    // a missing value can never collapse a whole catalog into the wrong filter.
    for (const setting of catalogSettings) setting.settingUsage ??= catalog.usage;
    for (const category of catalogCategories) category.settingUsage ??= catalog.usage;

    // Fetch any orphan categories referenced by settings but not in the bulk
    // categories response.  The bulk endpoints sometimes omit deeply-nested
    // leaf categories that settings still reference.  Resolve them against the
    // same catalog the settings came from.
    const knownCatIds = new Set(catalogCategories.map((c) => c.id));
    const settingCatIds = new Set(catalogSettings.map((s) => s.categoryId).filter(Boolean));
    const orphanCatIds = [...settingCatIds].filter((id) => !knownCatIds.has(id));

    if (orphanCatIds.length > 0) {
      console.log(`  ${orphanCatIds.length} category IDs referenced by settings but missing from bulk fetch — fetching individually...`);
      let fetched = 0;
      for (const catId of orphanCatIds) {
        try {
          const cat = await graphGet(`/deviceManagement/${catalog.categories}/${catId}?$select=${CATEGORIES_SELECT}`);
          cat.settingUsage ??= catalog.usage;
          catalogCategories.push(cat);
          fetched++;
        } catch (err: unknown) {
          // Category may genuinely not exist; log and skip.
          console.warn(`  Could not fetch category ${catId} (${(err as Error).message}) — skipping`);
        }
      }
      console.log(`  Fetched ${fetched}/${orphanCatIds.length} orphan categories.`);
    }

    categories.push(...catalogCategories);
    settings.push(...catalogSettings);
  }

  // 2. Dedupe by id. The catalogs are separate trees, but an id shared across
  //    them would otherwise produce two entries fighting over the same URL slug.
  const dedupe = <T extends Record<string, unknown>>(items: T[], label: string): T[] => {
    const byId = new Map<unknown, T>();
    for (const item of items) byId.set(item.id, item);
    if (byId.size !== items.length) {
      console.warn(`\n  Dropped ${items.length - byId.size} duplicate ${label} sharing an id across catalogs.`);
    }
    return [...byId.values()];
  };

  const allCategories = dedupe(categories, 'categories');
  const allSettings = dedupe(settings, 'settings');

  console.log(`\nTotal: ${allSettings.length} settings across ${allCategories.length} categories.`);

  // A partial answer from Graph must not be saved: the changelog would log the
  // missing settings as "removed" and the site would deploy without them.
  const previousSettings: unknown[] = existingSettings ? JSON.parse(existingSettings) : [];
  if (allSettings.length < previousSettings.length * 0.9) {
    throw new Error(
      `Graph returned ${allSettings.length} settings, more than 10% fewer than the ${previousSettings.length} on disk — refusing to overwrite. ` +
        'If the drop is real, delete data/settings.json and run again.'
    );
  }

  // settings.json is written without indentation: it is ~69 MB pretty-printed
  // and GitHub rejects files over 100 MB.
  const newSettings = JSON.stringify(allSettings);
  const newCategories = JSON.stringify(allCategories, null, 2);
  fs.writeFileSync(CATEGORIES_FILE, newCategories, 'utf-8');
  fs.writeFileSync(SETTINGS_FILE, newSettings, 'utf-8');

  // 3. Write last-updated timestamp only if data actually changed
  // (compare content, not formatting, so an indented file on disk still matches)
  const hasChanges = newSettings !== JSON.stringify(previousSettings) || newCategories !== existingCategories;

  if (hasChanges) {
    const now = new Date().toISOString();
    fs.writeFileSync(LAST_UPDATED_FILE, JSON.stringify({ date: now }, null, 2), 'utf-8');
    console.log(`  Data changed — updated timestamp: ${now}`);
  } else {
    console.log('  No data changes detected — last-updated timestamp unchanged.');
  }

  console.log();
  console.log('Done! Data saved to:');
  console.log(`  Categories: ${CATEGORIES_FILE}`);
  console.log(`  Settings:   ${SETTINGS_FILE}`);
  console.log();
  console.log('Next: run "npm run generate-changelog" and then "npm run build-search-index"');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
