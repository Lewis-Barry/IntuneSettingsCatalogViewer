/**
 * generate-changelog-settings.ts
 *
 * Reads data/changelog.json and data/settings.json, then writes one JSON file
 * per setting referenced in the changelog (added or changed) into
 * public/changelog-settings/{slug}.json.
 *
 * The changelog page lazy-fetches these on row expand so the initial page
 * payload doesn't have to carry the full settings array.
 *
 * Usage:
 *   npx tsx scripts/generate-changelog-settings.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SettingDefinition, ChangelogEntry } from '../src/lib/types';
import { settingSlug } from '../src/lib/slug';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CHANGELOG_FILE = path.join(DATA_DIR, 'changelog.json');
const OUT_DIR = path.join(PUBLIC_DIR, 'changelog-settings');

function readJSON<T>(file: string): T {
  const raw = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '');
  return JSON.parse(raw) as T;
}

function main() {
  if (!fs.existsSync(CHANGELOG_FILE)) {
    console.log('No changelog.json found; skipping changelog setting export.');
    return;
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    console.log('No settings.json found; skipping changelog setting export.');
    return;
  }

  const changelog = readJSON<ChangelogEntry[]>(CHANGELOG_FILE);
  const settings = readJSON<SettingDefinition[]>(SETTINGS_FILE);

  const referencedIds = new Set<string>();
  for (const entry of changelog) {
    entry.added?.forEach((s) => referencedIds.add(s.id));
    entry.changed?.forEach((s) => referencedIds.add(s.id));
  }

  const settingsById = new Map(settings.map((s) => [s.id, s]));

  // Reset output dir so stale entries don't accumulate
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  let missing = 0;
  for (const id of referencedIds) {
    const setting = settingsById.get(id);
    if (!setting) {
      missing += 1;
      continue;
    }
    const slug = settingSlug(id);
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(setting));
    written += 1;
  }

  console.log(
    `Wrote ${written} changelog setting JSON files to ${path.relative(process.cwd(), OUT_DIR)}` +
      (missing > 0 ? ` (${missing} referenced IDs no longer exist in settings.json)` : ''),
  );
}

main();
