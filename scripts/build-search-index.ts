/**
 * build-search-index.ts
 *
 * Reads data/settings.json and data/categories.json, builds:
 * 1. A Flexsearch-compatible search index exported to public/search-index.json
 * 2. A category tree structure saved to data/category-tree.json
 *
 * The search index is a simple JSON array of searchable documents that
 * the client-side Flexsearch instance indexes on load.
 *
 * Usage:
 *   npx tsx scripts/build-search-index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { hasUsage, type SettingDefinition, type SettingCategory, type CategoryTreeNode, type SearchIndexEntry } from '../src/lib/types';
import { getAsrRuleInfo } from '../src/lib/asr-rules';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SEARCH_INDEX_FILE = path.join(PUBLIC_DIR, 'search-index.json');
const CATEGORY_TREE_FILE = path.join(DATA_DIR, 'category-tree.json');
const CATALOG_STATS_FILE = path.join(DATA_DIR, 'catalog-stats.json');

/** Derive scope from baseUri */
function getScope(baseUri?: string): 'device' | 'user' | 'unknown' {
  if (!baseUri) return 'unknown';
  if (baseUri.toLowerCase().includes('/device/')) return 'device';
  if (baseUri.toLowerCase().includes('/user/')) return 'user';
  return 'unknown';
}

/**
 * Emit settingUsage only when it isn't the default. 'configuration' is ~95% of
 * the catalog, and spelling it out on every record would add ~600 KB to the
 * browse payload and search index for no information. Readers treat a missing
 *  value as 'configuration' (see `hasUsage` in src/lib/types.ts).
 */
function usageOrDefault(settingUsage: string | undefined): string | undefined {
  return settingUsage && settingUsage !== 'configuration' ? settingUsage : undefined;
}

/** Get friendly setting type from OData type */
function getSettingType(odataType: string): string {
  if (odataType.includes('Choice')) return 'choice';
  if (odataType.includes('Simple')) return 'simple';
  if (odataType.includes('Group')) return 'group';
  if (odataType.includes('Redirect')) return 'redirect';
  return 'unknown';
}

/** Format a human-friendly platform label for disambiguation */
function platformLabel(platforms: string[]): string {
  const map: Record<string, string> = {
    windows10: 'Windows',
    macOS: 'macOS',
    iOS: 'iOS/iPadOS',
    android: 'Android',
    androidEnterprise: 'Android Enterprise',
    aosp: 'AOSP',
    linux: 'Linux',
  };
  const labels = platforms.map((p) => map[p.trim()] || p.trim()).filter(Boolean);
  return labels.join(', ');
}

/** Build a nested category tree from flat list */
function buildCategoryTree(
  categories: SettingCategory[],
  settingsCountMap: Map<string, number>
): { roots: CategoryTreeNode[]; mergeMap: Record<string, string> } {
  const nodeMap = new Map<string, CategoryTreeNode>();

  // Create nodes
  for (const cat of categories) {
    nodeMap.set(cat.id, {
      ...cat,
      children: [],
      settingCount: settingsCountMap.get(cat.id) || 0,
    });
  }

  // Build tree
  const roots: CategoryTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentCategoryId === node.id || !node.parentCategoryId) {
      // Root category
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentCategoryId);
      if (parent) {
        parent.children.push(node);
        // Accumulate child counts to parent
      } else {
        // Orphan — treat as root
        roots.push(node);
      }
    }
  }

  // Sort children alphabetically
  function sortTree(nodes: CategoryTreeNode[]) {
    nodes.sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const n of nodes) {
      sortTree(n.children);
    }
  }
  sortTree(roots);

  // ── Merge & disambiguate sibling categories with identical displayNames ──
  // The Graph API sometimes returns multiple category entries with the same
  // display name under the same parent.  When their key metadata (platforms,
  // technologies, settingUsage) is identical they are true duplicates and we
  // merge them.  When metadata differs they are distinct variants and we
  // append a platform label to disambiguate (e.g. "Microsoft Edge (macOS)").
  const mergeMap: Record<string, string> = {}; // secondaryId → primaryId

  function deduplicateSiblings(siblings: CategoryTreeNode[]) {
    // Group by displayName
    const byName = new Map<string, CategoryTreeNode[]>();
    for (const node of siblings) {
      const list = byName.get(node.displayName) || [];
      list.push(node);
      byName.set(node.displayName, list);
    }

    const toRemove = new Set<string>();
    for (const [, group] of byName) {
      if (group.length <= 1) continue;

      // Check whether all members have identical key metadata
      const metaKey = (n: CategoryTreeNode) =>
        `${n.platforms || ''}|${n.technologies || ''}|${n.settingUsage || ''}`;
      const allSameMeta = group.every((n) => metaKey(n) === metaKey(group[0]));

      if (allSameMeta) {
        // True duplicates — merge into the one with the most settings
        group.sort((a, b) => b.settingCount - a.settingCount);
        const primary = group[0];
        for (let i = 1; i < group.length; i++) {
          const secondary = group[i];
          // Absorb settings count
          primary.settingCount += secondary.settingCount;
          // Absorb child categories
          primary.children.push(...secondary.children);
          // Record merge so page.tsx can consolidate settingsByCategory
          mergeMap[secondary.id] = primary.id;
          toRemove.add(secondary.id);
        }
      } else {
        // Different metadata — disambiguate with a platform label.
        // Leave the variant with the most settings unlabeled (it's the "main"
        // one) and only add platform labels to the smaller variants.
        group.sort((a, b) => b.settingCount - a.settingCount);
        for (let i = 1; i < group.length; i++) {
          const node = group[i];
          const platforms = (node.platforms || 'unknown').split(',');
          const label = platformLabel(platforms);
          if (label) {
            node.displayName = `${node.displayName} (${label})`;
          }
        }
      }
    }

    // Remove merged-away nodes
    if (toRemove.size > 0) {
      for (let i = siblings.length - 1; i >= 0; i--) {
        if (toRemove.has(siblings[i].id)) siblings.splice(i, 1);
      }
    }

    // Recurse into children
    for (const node of siblings) {
      deduplicateSiblings(node.children);
    }
  }

  deduplicateSiblings(roots);
  // Re-sort after possible displayName changes
  sortTree(roots);

  // Roll up setting counts from children to parents
  function rollUpCounts(node: CategoryTreeNode): number {
    let total = node.settingCount;
    for (const child of node.children) {
      total += rollUpCounts(child);
    }
    node.settingCount = total;
    return total;
  }
  for (const root of roots) {
    rollUpCounts(root);
  }

  return { roots, mergeMap };
}

/**
 * Raw windowsSkus array from a setting's applicability (untyped upstream).
 * The two Windows SKU reports below only make sense for the configuration
 * catalog, so compliance-only settings never contribute rows.
 */
function windowsSkus(s: SettingDefinition): string[] {
  if (!hasUsage(s.settingUsage, 'configuration')) return [];
  return ((s.applicability as Record<string, unknown> | undefined)?.windowsSkus as string[] | undefined) || [];
}

/**
 * Slim setting shape used by the SKU report payloads (pro-exclusive.json,
 * avd-multisession.json). Includes both root and child settings so the
 * groupSettings rendering logic can nest them correctly at runtime.
 */
function slimSkuReportSetting(s: SettingDefinition, mergeMap: Record<string, string>) {
  // Apply category merge map
  const effectiveCatId = mergeMap[s.categoryId] || s.categoryId;
  const slim: Record<string, unknown> = {
    '@odata.type': s['@odata.type'],
    id: s.id,
    name: s.name,
    displayName: s.displayName,
    description: s.description || undefined,
    helpText: s.helpText || undefined,
    categoryId: effectiveCatId,
    baseUri: s.baseUri || undefined,
    offsetUri: s.offsetUri || undefined,
    rootDefinitionId: s.rootDefinitionId || undefined,
    uxBehavior: s.uxBehavior || undefined,
    settingUsage: s.settingUsage || undefined,
    infoUrls: s.infoUrls?.length ? s.infoUrls : undefined,
    keywords: s.keywords?.length ? s.keywords : undefined,
    applicability: s.applicability || undefined,
    dependedOnBy: s.dependedOnBy || undefined,
    dependentOn: s.dependentOn || undefined,
    defaultOptionId: s.defaultOptionId || undefined,
    defaultValue: s.defaultValue !== undefined ? s.defaultValue : undefined,
    valueDefinition: s.valueDefinition || undefined,
    options: s.options || undefined,
    childIds: s.childIds || undefined,
  };
  // Strip undefined values to shrink JSON
  return JSON.parse(JSON.stringify(slim));
}

function buildDefinitionSubsets(settings: SettingDefinition[]) {
  const outputDir = path.join(PUBLIC_DIR, 'setting-definitions');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const byId = new Map(settings.map((setting) => [setting.id, setting]));
  const manifest: Record<string, string> = {};

  function collectIds(value: unknown, ids: Set<string>) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'definitionId' || key === 'settingDefinitionId') && typeof child === 'string') ids.add(child);
      else collectIds(child, ids);
    }
  }

  for (const scope of ['oib', 'baselines']) {
    const sourceDir = path.join(PUBLIC_DIR, scope === 'oib' ? 'oib-versions' : 'baselines');
    const files = fs.existsSync(sourceDir)
      ? fs.readdirSync(sourceDir).filter((file) => file.endsWith('.json') && file !== 'index.json').map((file) => path.join(sourceDir, file))
      : [];
    const currentOib = path.join(PUBLIC_DIR, 'oib-data.json');
    if (scope === 'oib' && fs.existsSync(currentOib)) files.push(currentOib);
    const ids = new Set<string>();
    for (const file of files) collectIds(JSON.parse(fs.readFileSync(file, 'utf-8')), ids);
    for (const id of ids) {
      const parentId = byId.get(id)?.rootDefinitionId;
      if (parentId) ids.add(parentId);
    }
    const subset = settings.filter((setting) => ids.has(setting.id));
    const json = JSON.stringify(subset);
    const version = createHash('sha256').update(json).digest('hex').slice(0, 16);
    const filename = `${scope}-${version}.json`;
    fs.writeFileSync(path.join(outputDir, filename), json, 'utf-8');
    manifest[scope] = `setting-definitions/${filename}`;
    console.log(`${scope} definitions: ${subset.length} settings (${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB)`);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'setting-definitions-manifest.json'), JSON.stringify(manifest), 'utf-8');
}

function buildCategoryBundles(settings: SettingDefinition[], tree: CategoryTreeNode[]) {
  const browseByCategory = new Map<string, SettingDefinition[]>();
  for (const setting of settings) {
    const list = browseByCategory.get(setting.categoryId) ?? [];
    list.push(setting);
    browseByCategory.set(setting.categoryId, list);
  }
  const categoryFiles: Record<string, string | null> = {};
  for (const categoryId of browseByCategory.keys()) {
    const json = fs.readFileSync(path.join(PUBLIC_DIR, 'settings-by-category', `${categoryId}.json`));
    const version = createHash('sha256').update(json).digest('hex').slice(0, 16);
    categoryFiles[categoryId] = `settings-by-category/${encodeURIComponent(categoryId)}.json?v=${version}`;
  }
  const bundleDir = path.join(PUBLIC_DIR, 'settings-bundles');
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });
  const bundles: Record<string, { file: string; categoryIds: string[] }> = {};
  function buildBundles(node: CategoryTreeNode): string[] {
    const categoryIds = [node.id, ...node.children.flatMap(buildBundles)];
    if (!browseByCategory.has(node.id)) categoryFiles[node.id] = null;
    const populatedIds = categoryIds.filter((id) => browseByCategory.has(id));
    if (populatedIds.length >= 16) {
      const json = JSON.stringify(populatedIds.flatMap((id) => browseByCategory.get(id)!));
      const version = createHash('sha256').update(json).digest('hex').slice(0, 16);
      const filename = `${node.id}-${version}.json`;
      fs.writeFileSync(path.join(bundleDir, filename), json, 'utf-8');
      bundles[node.id] = { file: `settings-bundles/${encodeURIComponent(filename)}`, categoryIds };
    }
    return categoryIds;
  }
  tree.forEach(buildBundles);
  fs.writeFileSync(path.join(DATA_DIR, 'category-load-manifest.json'), JSON.stringify({ files: categoryFiles, bundles }), 'utf-8');
  console.log(`Browse subtree bundles: ${Object.keys(bundles).length} files`);
}

function buildSearchManifest() {
  const json = fs.readFileSync(SEARCH_INDEX_FILE);
  const libraryVersion: string = JSON.parse(fs.readFileSync(require.resolve('flexsearch/package.json'), 'utf-8')).version;
  const version = `${libraryVersion}-${createHash('sha256').update(json).digest('hex').slice(0, 16)}`;
  const documentCount = JSON.parse(json.toString('utf-8')).length;
  fs.writeFileSync(path.join(DATA_DIR, 'search-index-manifest.json'), JSON.stringify({ version, documentCount }), 'utf-8');
}

function main() {
  if (process.argv.includes('--browser-data-only')) {
    const settings: SettingDefinition[] = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'settings-browse.json'), 'utf-8'));
    const tree: CategoryTreeNode[] = JSON.parse(fs.readFileSync(CATEGORY_TREE_FILE, 'utf-8'));
    buildDefinitionSubsets(settings);
    buildCategoryBundles(settings, tree);
    buildSearchManifest();
    return;
  }
  console.log('Search Index & Category Tree Builder');
  console.log('=====================================');

  if (!fs.existsSync(SETTINGS_FILE)) {
    console.error('Error: data/settings.json not found. Run fetch-settings first.');
    process.exit(1);
  }
  if (!fs.existsSync(CATEGORIES_FILE)) {
    console.error('Error: data/categories.json not found. Run fetch-settings first.');
    process.exit(1);
  }

  const settings: SettingDefinition[] = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  const categories: SettingCategory[] = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));

  console.log(`Settings: ${settings.length}`);
  console.log(`Categories: ${categories.length}`);

  // Build category name map
  const categoryNameMap = new Map<string, string>();
  for (const c of categories) {
    categoryNameMap.set(c.id, c.displayName);
  }

  // Count visible settings per category.
  // A setting is "visible" if it is either:
  //   - A root setting (no rootDefinitionId, or rootDefinitionId === id), OR
  //   - A child whose CSP path differs from its parent's (non-duplicate child).
  // Children with the same CSP path as their parent are hidden in the UI and
  // should not inflate the count.
  const settingById = new Map<string, SettingDefinition>();
  for (const s of settings) settingById.set(s.id, s);

  const getCspPath = (s: SettingDefinition) =>
    s.baseUri && s.offsetUri
      ? `${s.baseUri}/${s.offsetUri}`
      : s.baseUri || s.offsetUri || '';

  const settingsCountMap = new Map<string, number>();
  const countSetting = (s: SettingDefinition) => {
    settingsCountMap.set(s.categoryId, (settingsCountMap.get(s.categoryId) || 0) + 1);
  };

  for (const s of settings) {
    const isRoot = !s.rootDefinitionId || s.rootDefinitionId === s.id;
    if (isRoot) {
      // Always count root settings (except synthetic group containers which
      // are promoted through their children — but these are rare enough to
      // keep in the count for simplicity).
      countSetting(s);
    } else {
      // Child setting — only count if its CSP path differs from the parent's
      const parent = settingById.get(s.rootDefinitionId!);
      if (!parent || getCspPath(s) !== getCspPath(parent)) {
        countSetting(s);
      }
    }
  }

  // Build search index entries (only visible settings, exclude groups)
  console.log('Building search index...');
  const searchEntries: SearchIndexEntry[] = [];
  for (const s of settings) {
    // Skip setting groups (they're structural, not searchable)
    if (s['@odata.type']?.includes('SettingGroup')) continue;

    searchEntries.push({
      id: s.id,
      displayName: s.displayName || s.name || '',
      description: (s.description || '').slice(0, 300), // Truncate for index size
      keywords: (() => {
        const kw = (s.keywords || []).join(' ');
        // Append ASR rule GUID so users can search by GUID
        const asrInfo = getAsrRuleInfo(s.id);
        return asrInfo ? `${kw} ${asrInfo.guid}` : kw;
      })(),
      categoryId: s.categoryId,
      categoryName: categoryNameMap.get(s.categoryId) || 'Unknown Category',
      scope: getScope(s.baseUri),
      platform: s.applicability?.platform || '',
      settingType: getSettingType(s['@odata.type'] || ''),
    });
  }

  // Ensure public dir exists
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  fs.writeFileSync(SEARCH_INDEX_FILE, JSON.stringify(searchEntries), 'utf-8');
  buildSearchManifest();
  const sizeMB = (fs.statSync(SEARCH_INDEX_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`Search index: ${searchEntries.length} entries (${sizeMB} MB) → ${SEARCH_INDEX_FILE}`);

  // Build category tree
  console.log('Building category tree...');
  const { roots: tree, mergeMap } = buildCategoryTree(categories, settingsCountMap);
  fs.writeFileSync(CATEGORY_TREE_FILE, JSON.stringify(tree, null, 2), 'utf-8');
  console.log(`Category tree: ${tree.length} root categories → ${CATEGORY_TREE_FILE}`);

  const mergeCount = Object.keys(mergeMap).length;
  if (mergeCount > 0) {
    console.log(`Merged ${mergeCount} duplicate categories`);
  }

  // Per-usage counts so the browser header can report the catalog it's showing.
  // settingUsage is a flag set, so a dual-usage setting counts in both catalogs
  // — exactly as it appears in both filters.
  const byUsage: Record<string, number> = {};
  for (const s of settings) {
    for (const flag of (s.settingUsage || 'configuration').split(',')) {
      const usage = flag.trim();
      if (usage) byUsage[usage] = (byUsage[usage] || 0) + 1;
    }
  }
  fs.writeFileSync(CATALOG_STATS_FILE, JSON.stringify({ totalSettings: settings.length, byUsage }, null, 2), 'utf-8');
  console.log(`Catalog stats: ${Object.entries(byUsage).map(([usage, n]) => `${n} ${usage}`).join(', ')} → ${CATALOG_STATS_FILE}`);

  // ── Generate settings-browse.json ──
  // A slim version of settings.json containing only the fields needed for the
  // browse UI (list display, inline expansion, platform filtering, search
  // match-source detection).  This is fetched client-side instead of being
  // embedded in the page HTML, reducing the initial payload from ~55 MB to <1 MB.
  console.log('Building settings-browse.json...');
  const BROWSE_FILE = path.join(PUBLIC_DIR, 'settings-browse.json');
  const BROWSE_BY_CATEGORY_DIR = path.join(PUBLIC_DIR, 'settings-by-category');
  const browseSettings = settings.map((s) => {
    // Apply category merge map so client doesn't need to re-map
    const effectiveCatId = mergeMap[s.categoryId] || s.categoryId;
    const slim: Record<string, unknown> = {
      '@odata.type': s['@odata.type'],
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      description: s.description || undefined,
      categoryId: effectiveCatId,
      baseUri: s.baseUri || undefined,
      offsetUri: s.offsetUri || undefined,
      rootDefinitionId: s.rootDefinitionId || undefined,
      uxBehavior: s.uxBehavior || undefined,
      settingUsage: usageOrDefault(s.settingUsage),
      infoUrls: s.infoUrls?.length ? s.infoUrls : undefined,
      applicability: s.applicability
        ? { platform: s.applicability.platform, technologies: s.applicability.technologies }
        : undefined,
      dependedOnBy: s.dependedOnBy || undefined,
      defaultOptionId: s.defaultOptionId || undefined,
      // Minimal options: keep displayName + dependedOnBy for toggle detection + inline expansion
      options: s.options
        ? s.options.map((o) => ({
            itemId: o.itemId,
            displayName: o.displayName,
            dependedOnBy: o.dependedOnBy || undefined,
          }))
        : undefined,
    };
    // Strip undefined values to shrink JSON
    return JSON.parse(JSON.stringify(slim));
  });
  fs.writeFileSync(BROWSE_FILE, JSON.stringify(browseSettings), 'utf-8');
  const browseSizeMB = (fs.statSync(BROWSE_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`Browse data: ${browseSettings.length} settings (${browseSizeMB} MB) → ${BROWSE_FILE}`);
  buildDefinitionSubsets(browseSettings);

  // Also write per-category browse payloads so the main browser can fetch only
  // the selected category subtree instead of parsing the full catalog on first load.
  fs.rmSync(BROWSE_BY_CATEGORY_DIR, { recursive: true, force: true });
  fs.mkdirSync(BROWSE_BY_CATEGORY_DIR, { recursive: true });
  const browseByCategory = new Map<string, Record<string, unknown>[]>();
  for (const s of browseSettings) {
    const categoryId = s.categoryId as string;
    const list = browseByCategory.get(categoryId) || [];
    list.push(s);
    browseByCategory.set(categoryId, list);
  }

  for (const [categoryId, categorySettings] of browseByCategory) {
    fs.writeFileSync(
      path.join(BROWSE_BY_CATEGORY_DIR, `${categoryId}.json`),
      JSON.stringify(categorySettings),
      'utf-8'
    );
  }
  console.log(`Browse category shards: ${browseByCategory.size} files → ${BROWSE_BY_CATEGORY_DIR}`);
  buildCategoryBundles(browseSettings, tree);

  // ── Generate pro-exclusive.json ──
  // Settings that include windowsEnterprise in windowsSkus but NOT windowsProfessional.
  console.log('Building pro-exclusive.json...');
  const PRO_EXCLUSIVE_FILE = path.join(PUBLIC_DIR, 'pro-exclusive.json');

  const proExclusiveSettings = settings
    .filter((s) => {
      const skus = windowsSkus(s);
      return skus.includes('windowsEnterprise') && !skus.includes('windowsProfessional');
    })
    .map((s) => slimSkuReportSetting(s, mergeMap));

  fs.writeFileSync(PRO_EXCLUSIVE_FILE, JSON.stringify({ settings: proExclusiveSettings }), 'utf-8');
  const proSizeMB = (fs.statSync(PRO_EXCLUSIVE_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`Pro-exclusive: ${proExclusiveSettings.length} settings (${proSizeMB} MB) → ${PRO_EXCLUSIVE_FILE}`);

  // ── Generate avd-multisession.json ──
  // Settings that include windowsMultiSession in windowsSkus — Windows 10/11
  // Enterprise multi-session, the Azure Virtual Desktop (AVD) host-pool SKU.
  console.log('Building avd-multisession.json...');
  const AVD_MULTISESSION_FILE = path.join(PUBLIC_DIR, 'avd-multisession.json');

  const avdMultiSessionSettings = settings
    .filter((s) => windowsSkus(s).includes('windowsMultiSession'))
    .map((s) => slimSkuReportSetting(s, mergeMap));

  fs.writeFileSync(AVD_MULTISESSION_FILE, JSON.stringify({ settings: avdMultiSessionSettings }), 'utf-8');
  const avdSizeMB = (fs.statSync(AVD_MULTISESSION_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`AVD multi-session: ${avdMultiSessionSettings.length} settings (${avdSizeMB} MB) → ${AVD_MULTISESSION_FILE}`);

  console.log('\nDone!');
}

main();
