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

/** Build a nested category tree from flat list */
function buildCategoryTree(
  categories: SettingCategory[],
  settingsCountMap: Map<string, number>
): CategoryTreeNode[] {
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

  return roots;
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

  // Count settings per category (only root-level settings, not children)
  const settingsCountMap = new Map<string, number>();
  for (const s of settings) {
    // Count settings that are either root or have no rootDefinitionId
    if (!s.rootDefinitionId || s.rootDefinitionId === s.id) {
      const count = settingsCountMap.get(s.categoryId) || 0;
      settingsCountMap.set(s.categoryId, count + 1);
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
      categoryName: categoryNameMap.get(s.categoryId) || '',
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
  const tree = buildCategoryTree(categories, settingsCountMap);
  fs.writeFileSync(CATEGORY_TREE_FILE, JSON.stringify(tree, null, 2), 'utf-8');
  console.log(`Category tree: ${tree.length} root categories → ${CATEGORY_TREE_FILE}`);

  console.log('\nDone!');
}

main();
