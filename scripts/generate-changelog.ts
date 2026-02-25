/**
 * generate-changelog.ts
 *
 * Compares data/settings.json (current) against data/settings-previous.json (last run)
 * to detect additions, removals, and changes. Appends results to data/changelog.json.
 * Then copies settings.json → settings-previous.json for next run.
 *
 * Usage:
 *   npx tsx scripts/generate-changelog.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { SettingDefinition, SettingCategory, ChangelogEntry, ChangelogSettingRef, ChangelogChange, ChangelogCategoryRef, ChangelogCategoryChange } from '../src/lib/types';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PREVIOUS_FILE = path.join(DATA_DIR, 'settings-previous.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const CATEGORIES_PREVIOUS_FILE = path.join(DATA_DIR, 'categories-previous.json');
const CHANGELOG_FILE = path.join(DATA_DIR, 'changelog.json');

/** Hash a setting for quick change detection */
function hashSetting(s: SettingDefinition): string {
  const relevant = {
    displayName: s.displayName,
    description: s.description,
    helpText: s.helpText,
    categoryId: s.categoryId,
    baseUri: s.baseUri,
    offsetUri: s.offsetUri,
    options: s.options,
    valueDefinition: s.valueDefinition,
    applicability: s.applicability,
  };
  return crypto.createHash('md5').update(JSON.stringify(relevant)).digest('hex');
}

/** Hash a category for quick change detection */
function hashCategory(c: SettingCategory): string {
  const relevant = {
    displayName: c.displayName,
    description: c.description,
    platforms: c.platforms,
    technologies: c.technologies,
    parentCategoryId: c.parentCategoryId,
    settingUsage: c.settingUsage,
  };
  return crypto.createHash('md5').update(JSON.stringify(relevant)).digest('hex');
}

/** Identify which fields changed between two categories */
function diffCategoryFields(
  oldC: SettingCategory,
  newC: SettingCategory,
): Array<{ field: string; oldValue: string; newValue: string }> {
  const fields: Array<keyof SettingCategory> = [
    'displayName', 'description', 'platforms', 'technologies',
    'parentCategoryId', 'settingUsage',
  ];
  const diffs: Array<{ field: string; oldValue: string; newValue: string }> = [];
  for (const f of fields) {
    const oldVal = JSON.stringify(oldC[f] ?? '');
    const newVal = JSON.stringify(newC[f] ?? '');
    if (oldVal !== newVal) {
      diffs.push({ field: f, oldValue: oldVal, newValue: newVal });
    }
  }
  return diffs;
}

/** Identify which fields changed between two settings */
function diffFields(oldS: SettingDefinition, newS: SettingDefinition): Array<{ field: string; oldValue: string; newValue: string }> {
  const fields: Array<keyof SettingDefinition> = [
    'displayName', 'description', 'helpText',
    'categoryId', 'baseUri', 'offsetUri',
  ];
  const diffs: Array<{ field: string; oldValue: string; newValue: string }> = [];

  for (const f of fields) {
    const oldVal = JSON.stringify(oldS[f] ?? '');
    const newVal = JSON.stringify(newS[f] ?? '');
    if (oldVal !== newVal) {
      diffs.push({ field: f, oldValue: oldVal, newValue: newVal });
    }
  }

  // Check options changes (for choice settings)
  if (JSON.stringify(oldS.options) !== JSON.stringify(newS.options)) {
    diffs.push({
      field: 'options',
      oldValue: `${(oldS.options || []).length} options`,
      newValue: `${(newS.options || []).length} options`,
    });
  }

  // Check applicability (OS/platform) changes
  if (JSON.stringify(oldS.applicability) !== JSON.stringify(newS.applicability)) {
    diffs.push({
      field: 'applicability',
      oldValue: JSON.stringify(oldS.applicability ?? ''),
      newValue: JSON.stringify(newS.applicability ?? ''),
    });
  }

  return diffs;
}

function main() {
  console.log('Changelog Generator');
  console.log('====================');

  // Load current settings
  if (!fs.existsSync(SETTINGS_FILE)) {
    console.error('Error: data/settings.json not found. Run fetch-settings first.');
    process.exit(1);
  }
  const current: SettingDefinition[] = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  console.log(`Current settings: ${current.length}`);

  // Load categories for display names
  const categories: SettingCategory[] = fs.existsSync(CATEGORIES_FILE)
    ? JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'))
    : [];
  const categoryMap = new Map(categories.map((c) => [c.id, c.displayName]));

  // Load previous settings (if exists)
  if (!fs.existsSync(PREVIOUS_FILE)) {
    console.log('No previous snapshot found. This is the first run.');
    console.log('Creating initial baseline snapshot (not logged to changelog)...');
    // Also baseline categories
    if (fs.existsSync(CATEGORIES_FILE)) {
      fs.copyFileSync(CATEGORIES_FILE, CATEGORIES_PREVIOUS_FILE);
    }

    // Save current as previous for next time — future runs will diff against this.
    fs.copyFileSync(SETTINGS_FILE, PREVIOUS_FILE);

    // Initialize an empty changelog; the initial bulk load is not a "change".
    if (!fs.existsSync(CHANGELOG_FILE)) {
      fs.writeFileSync(CHANGELOG_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
    console.log(`Baseline established with ${current.length} settings. Only future changes will appear in the changelog.`);
    return;
  }

  const previous: SettingDefinition[] = JSON.parse(fs.readFileSync(PREVIOUS_FILE, 'utf-8'));
  console.log(`Previous settings: ${previous.length}`);

  // Build lookup maps
  const prevMap = new Map<string, SettingDefinition>();
  const prevHashMap = new Map<string, string>();
  for (const s of previous) {
    prevMap.set(s.id, s);
    prevHashMap.set(s.id, hashSetting(s));
  }

  const currMap = new Map<string, SettingDefinition>();
  const currHashMap = new Map<string, string>();
  for (const s of current) {
    currMap.set(s.id, s);
    currHashMap.set(s.id, hashSetting(s));
  }

  // Detect additions
  const added: ChangelogSettingRef[] = [];
  for (const s of current) {
    if (!prevMap.has(s.id)) {
      added.push({
        id: s.id,
        displayName: s.displayName,
        categoryId: s.categoryId,
        categoryName: categoryMap.get(s.categoryId),
        platform: s.applicability?.platform ?? undefined,
      });
    }
  }

  // Detect removals
  const removed: ChangelogSettingRef[] = [];
  for (const s of previous) {
    if (!currMap.has(s.id)) {
      removed.push({
        id: s.id,
        displayName: s.displayName,
        categoryId: s.categoryId,
        categoryName: categoryMap.get(s.categoryId),
        platform: s.applicability?.platform ?? undefined,
      });
    }
  }

  // Detect changes
  const changed: ChangelogChange[] = [];
  for (const s of current) {
    if (prevMap.has(s.id) && prevHashMap.get(s.id) !== currHashMap.get(s.id)) {
      const fields = diffFields(prevMap.get(s.id)!, s);
      if (fields.length > 0) {
        changed.push({
          id: s.id,
          displayName: s.displayName,
          categoryId: s.categoryId,
          categoryName: categoryMap.get(s.categoryId),
          platform: s.applicability?.platform ?? undefined,
          fields,
        });
      }
    }
  }

  // ── Category diffing ──────────────────────────────────────────
  // If no category baseline exists yet, skip diffing and just create the baseline.
  // This mirrors the settings first-run guard and prevents every existing category
  // from being reported as "added" when category tracking is enabled for the first time.
  const hasCategoryBaseline = fs.existsSync(CATEGORIES_PREVIOUS_FILE);
  const previousCategories: SettingCategory[] = hasCategoryBaseline
    ? JSON.parse(fs.readFileSync(CATEGORIES_PREVIOUS_FILE, 'utf-8'))
    : [];

  let categoriesAdded: ChangelogCategoryRef[] = [];
  let categoriesRemoved: ChangelogCategoryRef[] = [];
  let categoriesChanged: ChangelogCategoryChange[] = [];

  if (!hasCategoryBaseline) {
    console.log('No category baseline found — establishing baseline (not logged to changelog).');
  } else {
    const prevCatMap = new Map<string, SettingCategory>();
    const prevCatHashMap = new Map<string, string>();
    for (const c of previousCategories) {
      prevCatMap.set(c.id, c);
      prevCatHashMap.set(c.id, hashCategory(c));
    }
    const currCatHashMap = new Map<string, string>();
    for (const c of categories) currCatHashMap.set(c.id, hashCategory(c));

    for (const c of categories) {
      if (!prevCatMap.has(c.id)) {
        categoriesAdded.push({ id: c.id, displayName: c.displayName, parentCategoryId: c.parentCategoryId });
      }
    }

    const currCatMap = new Map<string, SettingCategory>(categories.map((cc) => [cc.id, cc]));
    for (const c of previousCategories) {
      if (!currCatMap.has(c.id)) {
        categoriesRemoved.push({ id: c.id, displayName: c.displayName, parentCategoryId: c.parentCategoryId });
      }
    }

    for (const c of categories) {
      if (prevCatMap.has(c.id) && prevCatHashMap.get(c.id) !== currCatHashMap.get(c.id)) {
        const fields = diffCategoryFields(prevCatMap.get(c.id)!, c);
        if (fields.length > 0) {
          categoriesChanged.push({ id: c.id, displayName: c.displayName, fields });
        }
      }
    }
  }

  console.log(`  Added:   ${added.length}`);
  console.log(`  Removed: ${removed.length}`);
  console.log(`  Changed: ${changed.length}`);
  console.log(`  Categories added:   ${categoriesAdded.length}`);
  console.log(`  Categories removed: ${categoriesRemoved.length}`);
  console.log(`  Categories changed: ${categoriesChanged.length}`);

  // Only create entry if there are actual changes
  if (
    added.length === 0 && removed.length === 0 && changed.length === 0 &&
    categoriesAdded.length === 0 && categoriesRemoved.length === 0 && categoriesChanged.length === 0
  ) {
    console.log('No changes detected. Changelog not updated.');
  } else {
    const entry: ChangelogEntry = {
      date: new Date().toISOString().split('T')[0],
      added,
      removed,
      changed,
      ...(categoriesAdded.length > 0 && { categoriesAdded }),
      ...(categoriesRemoved.length > 0 && { categoriesRemoved }),
      ...(categoriesChanged.length > 0 && { categoriesChanged }),
    };

    // Load existing changelog and prepend new entry
    const changelog: ChangelogEntry[] = fs.existsSync(CHANGELOG_FILE)
      ? JSON.parse(fs.readFileSync(CHANGELOG_FILE, 'utf-8'))
      : [];

    // Remove existing entry for today if re-running
    const filtered = changelog.filter((e) => e.date !== entry.date);
    filtered.unshift(entry);

    fs.writeFileSync(CHANGELOG_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    console.log(`Changelog updated: ${CHANGELOG_FILE}`);
  }

  // Copy current → previous for next run
  fs.copyFileSync(SETTINGS_FILE, PREVIOUS_FILE);
  if (fs.existsSync(CATEGORIES_FILE)) {
    fs.copyFileSync(CATEGORIES_FILE, CATEGORIES_PREVIOUS_FILE);
  }
  console.log('Snapshot updated for next comparison.');
}

main();
