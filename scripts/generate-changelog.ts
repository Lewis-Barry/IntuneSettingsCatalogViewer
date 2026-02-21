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
import type { SettingDefinition, SettingCategory, ChangelogEntry, ChangelogSettingRef, ChangelogChange } from '../src/lib/types';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PREVIOUS_FILE = path.join(DATA_DIR, 'settings-previous.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const CHANGELOG_FILE = path.join(DATA_DIR, 'changelog.json');

/** Hash a setting for quick change detection */
function hashSetting(s: SettingDefinition): string {
  const relevant = {
    displayName: s.displayName,
    description: s.description,
    helpText: s.helpText,
    version: s.version,
    categoryId: s.categoryId,
    baseUri: s.baseUri,
    offsetUri: s.offsetUri,
    options: s.options,
    valueDefinition: s.valueDefinition,
    applicability: s.applicability,
    keywords: s.keywords,
  };
  return crypto.createHash('md5').update(JSON.stringify(relevant)).digest('hex');
}

/** Identify which fields changed between two settings */
function diffFields(oldS: SettingDefinition, newS: SettingDefinition): Array<{ field: string; oldValue: string; newValue: string }> {
  const fields: Array<keyof SettingDefinition> = [
    'displayName', 'description', 'helpText', 'version',
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

  // Check keywords changes
  if (JSON.stringify(oldS.keywords) !== JSON.stringify(newS.keywords)) {
    diffs.push({
      field: 'keywords',
      oldValue: (oldS.keywords || []).join(', '),
      newValue: (newS.keywords || []).join(', '),
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
          fields,
        });
      }
    }
  }

  console.log(`  Added:   ${added.length}`);
  console.log(`  Removed: ${removed.length}`);
  console.log(`  Changed: ${changed.length}`);

  // Only create entry if there are actual changes
  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.log('No changes detected. Changelog not updated.');
  } else {
    const entry: ChangelogEntry = {
      date: new Date().toISOString().split('T')[0],
      added,
      removed,
      changed,
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
  console.log('Snapshot updated for next comparison.');
}

main();
