/**
 * Data loading utilities.
 * At build time these read from the local data/ files.
 * The data is passed as props to pages via generateStaticParams / page props.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SettingDefinition, SettingCategory, CategoryTreeNode, ChangelogDay, ChangelogEntry, ChangelogSettingSummary, ChangelogSummary } from './types';
import type { ComplianceTemplate, ComplianceTemplatesFile } from './compliance-types';
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

/** Classic compliance catalog — small enough to pass as a build-time prop. */
export function loadComplianceTemplates(): ComplianceTemplate[] {
  return readJSON<ComplianceTemplatesFile>('compliance-templates.json')?.templates ?? [];
}

export function loadChangelog(): ChangelogEntry[] {
  return readJSON<ChangelogEntry[]>('changelog.json') || [];
}

/** AI summaries keyed by changelog entry date (empty until generate-summaries runs). */
export function loadChangelogSummaries(): Record<string, ChangelogSummary> {
  return readJSON<Record<string, ChangelogSummary>>('changelog-summaries.json') ?? {};
}

/** Get the last updated timestamp — prefers the metadata file written by fetch-settings, falls back to changelog */
export function getLastUpdated(): string | null {
  const meta = readJSON<{ date: string }>('last-updated.json');
  if (meta?.date) return meta.date;
  const changelog = loadChangelog();
  if (changelog.length === 0) return null;
  return changelog[0].date;
}

/**
 * One `ChangelogDay` per changelog date that has visible changes, newest first.
 * Each carries only the settings that date references (added or changed, plus
 * their root definitions), stripped to the fields the row display + search need.
 *
 * The page inlines the newest day; the rest are written to
 * public/changelog-days/{date}.json (generate-changelog-settings.ts) and
 * fetched on demand. The full setting (with `options` etc.) is lazy-fetched
 * per row from /changelog-settings/{slug}.json on expand.
 */
export function loadChangelogDays(): ChangelogDay[] {
  const settingsById = new Map(loadSettings().map((setting) => [setting.id, setting]));

  return loadChangelog()
    // Version-only changes are hidden by the viewer, so they don't make a day.
    .filter((entry) =>
      entry.added.length > 0 || entry.removed.length > 0 ||
      entry.changed.some((c) => c.fields.some((f) => f.field !== 'version')) ||
      (entry.categoriesAdded?.length ?? 0) > 0 ||
      (entry.categoriesRemoved?.length ?? 0) > 0 ||
      (entry.categoriesChanged?.length ?? 0) > 0)
    .map((entry) => {
      const ids = new Set<string>();
      // Removed refs too: one that was re-added later still resolves its root.
      for (const ref of [...entry.added, ...entry.changed, ...entry.removed]) {
        ids.add(ref.id);
        // Root group/collection definitions label a set of related child changes.
        const rootDefinitionId = settingsById.get(ref.id)?.rootDefinitionId;
        if (rootDefinitionId) ids.add(rootDefinitionId);
      }
      const settings: ChangelogSettingSummary[] = [];
      for (const id of ids) {
        const setting = settingsById.get(id);
        if (!setting) continue;
        settings.push({
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
      return { entry, settings };
    });
}
