/**
 * fetch-settings.ts
 *
 * Authenticates with Microsoft Graph via client credentials and pulls
 * the full Intune Settings Catalog (configurationSettings + configurationCategories).
 * Writes the results to data/settings.json and data/categories.json.
 *
 * Usage:
 *   AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=xxx AZURE_CLIENT_SECRET=xxx npx tsx scripts/fetch-settings.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───
const TENANT_ID = process.env.AZURE_TENANT_ID!;
const CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const LAST_UPDATED_FILE = path.join(DATA_DIR, 'last-updated.json');

// Select only the fields we need to reduce payload
const SETTINGS_SELECT = [
  'id',
  'name',
  'displayName',
  'description',
  'helpText',
  'version',
  'categoryId',
  'rootDefinitionId',
  'baseUri',
  'offsetUri',
  'settingUsage',
  'visibility',
  'uxBehavior',
  'accessTypes',
  'applicability',
  'occurrence',
  'keywords',
  'infoUrls',
  'referredSettingInformationList',
  'options',
  'defaultOptionId',
  'valueDefinition',
  'defaultValue',
  'childIds',
  'minimumCount',
  'maximumCount',
  'dependentOn',
  'dependedOnBy',
].join(',');

const CATEGORIES_SELECT = [
  'id',
  'name',
  'displayName',
  'description',
  'categoryDescription',
  'helpText',
  'platforms',
  'technologies',
  'settingUsage',
  'parentCategoryId',
  'rootCategoryId',
  'childCategoryIds',
].join(',');

// ─── Auth (client-credentials flow, plain fetch) ───

// Module-level so graphGet can refresh it when it expires mid-run — a full
// catalog fetch (plus throttle waits) can outlast the ~60min token lifetime.
let token: string | null = null;

async function getAccessToken(): Promise<string> {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('Error: AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET must be set.');
    process.exit(1);
  }

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.access_token) {
    throw new Error('Token response missing access_token');
  }
  token = json.access_token as string;
  return token;
}

// ─── Graph GET with retry (throttling, transient 5xx/network, token expiry) ───

const MAX_RETRIES = 8;

async function graphGet(url: string): Promise<Record<string, unknown>> {
  const fullUrl = url.startsWith('https://') ? url : `https://graph.microsoft.com/beta${url}`;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token ?? (await getAccessToken())}` } });
    } catch (err) {
      if (attempt > MAX_RETRIES) throw err;
      console.warn(`  Network error (${(err as Error).message}). Retrying in 5s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    if (res.status === 401 && attempt === 1) {
      // Token expired mid-run — refresh once and retry; a second 401 is a real auth error
      token = null;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
      // Retry-After may be delta-seconds or an HTTP-date; NaN/0 → default backoff
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
      const waitS = retryAfter > 0 ? retryAfter : 30;
      console.warn(`  HTTP ${res.status}. Waiting ${waitS}s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, waitS * 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Graph request failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
}

// ─── Paginated Fetch ───

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let nextLink: string | undefined = url;
  let page = 1;

  while (nextLink) {
    console.log(`  Page ${page}...`);
    const response = await graphGet(nextLink);
    results.push(...(response.value as T[]));
    nextLink = response['@odata.nextLink'] as string | undefined;
    page++;
  }

  return results;
}

// ─── Main ───

async function main() {
  console.log('Intune Settings Catalog Fetcher');
  console.log('================================');
  console.log(`Tenant: ${TENANT_ID}`);
  console.log();

  await getAccessToken(); // validate credentials up front

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load existing data for comparison (if available)
  let existingSettings = '';
  let existingCategories = '';
  if (fs.existsSync(SETTINGS_FILE)) {
    existingSettings = fs.readFileSync(SETTINGS_FILE, 'utf-8');
  }
  if (fs.existsSync(CATEGORIES_FILE)) {
    existingCategories = fs.readFileSync(CATEGORIES_FILE, 'utf-8');
  }

  // 1. Fetch categories
  console.log('Fetching configuration categories...');
  const categoriesUrl = `/deviceManagement/configurationCategories?$select=${CATEGORIES_SELECT}`;
  const categories = await fetchAllPages(categoriesUrl);
  console.log(`  Retrieved ${categories.length} categories.`);

  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf-8');
  console.log(`  Saved to ${CATEGORIES_FILE}`);

  // 2. Fetch setting definitions
  // Note: we omit $select because setting definitions are polymorphic —
  // sub-types (choice, simple, group, etc.) have different properties and
  // $select on the base type rejects sub-type-only fields like 'options'.
  console.log('Fetching configuration settings...');
  const settingsUrl = `/deviceManagement/configurationSettings`;
  const settings = await fetchAllPages(settingsUrl);
  console.log(`  Retrieved ${settings.length} settings.`);

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(`  Saved to ${SETTINGS_FILE}`);

  // 3. Fetch any orphan categories referenced by settings but not in the
  //    bulk categories response.  The Graph configurationCategories endpoint
  //    sometimes omits deeply-nested leaf categories that settings still
  //    reference.  We fetch these individually by ID.
  const knownCatIds = new Set(categories.map((c) => (c as Record<string, unknown>).id));
  const settingCatIds = new Set(
    (settings as Record<string, unknown>[]).map((s) => s.categoryId).filter(Boolean)
  );
  const orphanCatIds = [...settingCatIds].filter((id) => !knownCatIds.has(id));

  if (orphanCatIds.length > 0) {
    console.log(`\nFound ${orphanCatIds.length} category IDs referenced by settings but missing from bulk fetch.`);
    console.log('Fetching orphan categories individually...');
    let fetched = 0;
    for (const catId of orphanCatIds) {
      try {
        const cat = await graphGet(`/deviceManagement/configurationCategories/${catId}?$select=${CATEGORIES_SELECT}`);
        categories.push(cat);
        fetched++;
      } catch (err: unknown) {
        // Category may genuinely not exist; log and skip.
        console.warn(`  Could not fetch category ${catId} (${(err as Error).message}) — skipping`);
      }
    }
    console.log(`  Fetched ${fetched}/${orphanCatIds.length} orphan categories.`);

    // Re-write categories.json with the additions
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf-8');
    console.log(`  Updated ${CATEGORIES_FILE}`);
  }

  // 4. Write last-updated timestamp only if data actually changed
  const newSettings = fs.readFileSync(SETTINGS_FILE, 'utf-8');
  const newCategories = fs.readFileSync(CATEGORIES_FILE, 'utf-8');
  const hasChanges = newSettings !== existingSettings || newCategories !== existingCategories;

  if (hasChanges) {
    const now = new Date().toISOString();
    fs.writeFileSync(LAST_UPDATED_FILE, JSON.stringify({ date: now }, null, 2), 'utf-8');
    console.log(`  Data changed — updated timestamp: ${now}`);
  } else {
    console.log('  No data changes detected — last-updated timestamp unchanged.');
  }

  console.log();
  console.log('Done! Data saved to:');
  console.log(`  Categories: ${CATEGORIES_FILE}`);
  console.log(`  Settings:   ${SETTINGS_FILE}`);
  console.log();
  console.log('Next: run "npm run generate-changelog" and then "npm run build-search-index"');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
