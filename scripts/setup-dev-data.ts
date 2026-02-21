/**
 * setup-dev-data.ts
 *
 * Copies sample data files to the working data files for local development.
 * Run this when you don't have access to a real Intune tenant.
 *
 * Usage:
 *   npx tsx scripts/setup-dev-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(__dirname, '..', 'data');

const copies: [string, string][] = [
  ['sample-categories.json', 'categories.json'],
  ['sample-settings.json', 'settings.json'],
];

for (const [src, dest] of copies) {
  const srcPath = path.join(DATA_DIR, src);
  const destPath = path.join(DATA_DIR, dest);

  if (!fs.existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    continue;
  }

  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied ${src} → ${dest}`);
}

console.log('\nSample data ready. Now run:');
console.log('  npx tsx scripts/build-search-index.ts');
console.log('  npm run dev');
