/**
 * Data loading utilities.
 * At build time these read from the local data/ files.
 * The data is passed as props to pages via generateStaticParams / page props.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SettingDefinition, SettingCategory, CategoryTreeNode, ChangelogEntry } from './types';

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

export function loadCategoryTree(): CategoryTreeNode[] {
  return readJSON<CategoryTreeNode[]>('category-tree.json') || [];
}

export function loadChangelog(): ChangelogEntry[] {
  return readJSON<ChangelogEntry[]>('changelog.json') || [];
}

/** Get the last updated timestamp — prefers the metadata file written by fetch-settings, falls back to changelog */
export function getLastUpdated(): string | null {
  const meta = readJSON<{ date: string }>('last-updated.json');
  if (meta?.date) return meta.date;
  const changelog = loadChangelog();
  if (changelog.length === 0) return null;
  return changelog[0].date;
}
