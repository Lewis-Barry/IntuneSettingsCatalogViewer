/**
 * Data loading utilities.
 * At build time these read from the local data/ files.
 * The data is passed as props to pages via generateStaticParams / page props.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SettingDefinition, SettingCategory, CategoryTreeNode, ChangelogEntry, ChangelogSettingSummary } from './types';
import { settingSlug } from './slug';

const DATA_DIR = path.join(process.cwd(), 'data');

// Module-level cache to avoid re-reading/parsing large JSON files thousands of
// times during static generation (settings.json alone is ~62 MB).
const cache = new Map<string, unknown>();

function readJSON<T>(filename: string): T | null {
  if (cache.has(filename)) return cache.get(filename) as T;
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw) as T;
  cache.set(filename, parsed);
  return parsed;
}

export function loadSettings(): SettingDefinition[] {
  return readJSON<SettingDefinition[]>('settings.json') || [];
}

export function loadCategories(): SettingCategory[] {
  return readJSON<SettingCategory[]>('categories.json') || [];
}

// ── Indexed lookups (built once, reused across all static pages) ──
// Without these, each of ~17.7k setting pages re-scanned the full settings
// array (find + filter) and recomputed every slug — an O(n²) blowup.
let slugIndex: Map<string, SettingDefinition> | null = null;
let childIndex: Map<string, SettingDefinition[]> | null = null;
let categoryIndex: Map<string, SettingCategory> | null = null;

/** Look up a setting by its URL slug. O(1) after the first call. */
export function getSettingBySlug(slug: string): SettingDefinition | undefined {
  if (!slugIndex) {
    slugIndex = new Map();
    for (const s of loadSettings()) slugIndex.set(settingSlug(s.id), s);
  }
  return slugIndex.get(slug);
}

/** Child settings of a setting (those rooted at it, excluding itself). O(1) lookup. */
export function getChildSettings(parentId: string): SettingDefinition[] {
  if (!childIndex) {
    childIndex = new Map();
    for (const s of loadSettings()) {
      if (!s.rootDefinitionId || s.rootDefinitionId === s.id) continue;
      const arr = childIndex.get(s.rootDefinitionId);
      if (arr) arr.push(s);
      else childIndex.set(s.rootDefinitionId, [s]);
    }
  }
  return childIndex.get(parentId) ?? [];
}

/** Look up a category by id. O(1) after the first call. */
export function getCategoryById(id: string): SettingCategory | undefined {
  if (!categoryIndex) {
    categoryIndex = new Map(loadCategories().map((c) => [c.id, c]));
  }
  return categoryIndex.get(id);
}

export function loadCategoryTree(): CategoryTreeNode[] {
  return readJSON<CategoryTreeNode[]>('category-tree.json') || [];
}

export function loadCatalogStats(): { totalSettings: number } {
  return readJSON<{ totalSettings: number }>('catalog-stats.json') || { totalSettings: 0 };
}

export function loadChangelog(): ChangelogEntry[] {
  const raw = readJSON<ChangelogEntry[]>('changelog.json') || [];
  // Exclude the initial baseline entry (2026-02-21) which contains the bulk
  // import of all settings and makes the page very slow.
  const BASELINE_DATE = '2026-02-21';
  return raw.filter((e) => e.date !== BASELINE_DATE);
}

/** Get the last updated timestamp — prefers the metadata file written by fetch-settings, falls back to changelog */
export function getLastUpdated(): string | null {
  const meta = readJSON<{ date: string }>('last-updated.json');
  if (meta?.date) return meta.date;
  const changelog = loadChangelog();
  if (changelog.length === 0) return null;
  return changelog[0].date;
}

/** Load the category merge map (secondary ID → primary ID) produced by build-search-index */
export function loadCategoryMergeMap(): Record<string, string> {
  return readJSON<Record<string, string>>('category-merge-map.json') || {};
}

/**
 * Return only the settings referenced by the changelog (added or changed),
 * stripped to the fields needed for the changelog row display + search.
 *
 * The full setting (with `options`, `keywords`, dependency arrays etc.) is
 * lazy-fetched per row from /changelog-settings/{slug}.json on expand.
 */
export function loadChangelogSettingSummaries(): ChangelogSettingSummary[] {
  const settings = loadSettings();
  const changelog = loadChangelog();

  const referencedIds = new Set<string>();
  for (const entry of changelog) {
    entry.added.forEach((s) => referencedIds.add(s.id));
    entry.changed.forEach((s) => referencedIds.add(s.id));
  }

  const summaries: ChangelogSettingSummary[] = [];
  for (const setting of settings) {
    if (!referencedIds.has(setting.id)) continue;
    summaries.push({
      id: setting.id,
      rootDefinitionId: setting.rootDefinitionId,
      displayName: setting.displayName,
      name: setting.name,
      description: setting.description,
      helpText: setting.helpText,
      applicability: setting.applicability
        ? {
            platform: setting.applicability.platform,
            technologies: setting.applicability.technologies,
          }
        : undefined,
      defaultValue: setting.defaultValue,
      baseUri: setting.baseUri,
      offsetUri: setting.offsetUri,
    });
  }
  return summaries;
}
