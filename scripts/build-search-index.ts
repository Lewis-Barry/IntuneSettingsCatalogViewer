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
import type { SettingDefinition, SettingCategory, CategoryTreeNode, SearchIndexEntry } from '../src/lib/types';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SEARCH_INDEX_FILE = path.join(PUBLIC_DIR, 'search-index.json');
const CATEGORY_TREE_FILE = path.join(DATA_DIR, 'category-tree.json');
const MERGE_MAP_FILE = path.join(DATA_DIR, 'category-merge-map.json');

/** Derive scope from baseUri */
function getScope(baseUri?: string): 'device' | 'user' | 'unknown' {
  if (!baseUri) return 'unknown';
  if (baseUri.toLowerCase().includes('/device/')) return 'device';
  if (baseUri.toLowerCase().includes('/user/')) return 'user';
  return 'unknown';
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

function main() {
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
  for (const s of settings) {
    const isRoot = !s.rootDefinitionId || s.rootDefinitionId === s.id;
    if (isRoot) {
      // Always count root settings (except synthetic group containers which
      // are promoted through their children — but these are rare enough to
      // keep in the count for simplicity).
      const count = settingsCountMap.get(s.categoryId) || 0;
      settingsCountMap.set(s.categoryId, count + 1);
    } else {
      // Child setting — only count if its CSP path differs from the parent's
      const parent = settingById.get(s.rootDefinitionId!);
      if (!parent || getCspPath(s) !== getCspPath(parent)) {
        const count = settingsCountMap.get(s.categoryId) || 0;
        settingsCountMap.set(s.categoryId, count + 1);
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
      keywords: (s.keywords || []).join(' '),
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
  const sizeMB = (fs.statSync(SEARCH_INDEX_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`Search index: ${searchEntries.length} entries (${sizeMB} MB) → ${SEARCH_INDEX_FILE}`);

  // Build category tree
  console.log('Building category tree...');
  const { roots: tree, mergeMap } = buildCategoryTree(categories, settingsCountMap);
  fs.writeFileSync(CATEGORY_TREE_FILE, JSON.stringify(tree, null, 2), 'utf-8');
  console.log(`Category tree: ${tree.length} root categories → ${CATEGORY_TREE_FILE}`);

  // Write merge map (secondary category ID → primary category ID)
  fs.writeFileSync(MERGE_MAP_FILE, JSON.stringify(mergeMap, null, 2), 'utf-8');
  const mergeCount = Object.keys(mergeMap).length;
  if (mergeCount > 0) {
    console.log(`Merged ${mergeCount} duplicate categories → ${MERGE_MAP_FILE}`);
  }

  console.log('\nDone!');
}

main();
