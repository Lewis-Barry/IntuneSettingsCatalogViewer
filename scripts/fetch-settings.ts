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

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
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

// ─── Auth & Client ───

function createGraphClient(): Client {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('Error: AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET must be set.');
    process.exit(1);
  }

  const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  return Client.initWithMiddleware({
    authProvider,
    defaultVersion: 'beta',
  });
}

// ─── Paginated Fetch ───

async function fetchAllPages<T>(client: Client, url: string): Promise<T[]> {
  const results: T[] = [];
  let nextLink: string | undefined = url;
  let page = 1;

  while (nextLink) {
    console.log(`  Page ${page}...`);
    try {
      const response = await client.api(nextLink).get();
      const items = response.value as T[];
      results.push(...items);
      nextLink = response['@odata.nextLink'];
      page++;
    } catch (err: unknown) {
      // Handle throttling
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 429) {
        const retryAfter = ((err as { headers?: Record<string, string> }).headers?.['Retry-After']) || '30';
        const waitMs = parseInt(retryAfter, 10) * 1000;
        console.warn(`  Throttled. Waiting ${retryAfter}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        // Retry the same page (don't increment nextLink)
        continue;
      }
      throw err;
    }
  }

  return results;
}

// ─── Main ───

async function main() {
  console.log('Intune Settings Catalog Fetcher');
  console.log('================================');
  console.log(`Tenant: ${TENANT_ID}`);
  console.log();

  const client = createGraphClient();

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Fetch categories
  console.log('Fetching configuration categories...');
  const categoriesUrl = `/deviceManagement/configurationCategories?$select=${CATEGORIES_SELECT}`;
  const categories = await fetchAllPages(client, categoriesUrl);
  console.log(`  Retrieved ${categories.length} categories.`);

  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf-8');
  console.log(`  Saved to ${CATEGORIES_FILE}`);

  // 2. Fetch setting definitions
  // Note: we omit $select because setting definitions are polymorphic —
  // sub-types (choice, simple, group, etc.) have different properties and
  // $select on the base type rejects sub-type-only fields like 'options'.
  console.log('Fetching configuration settings...');
  const settingsUrl = `/deviceManagement/configurationSettings`;
  const settings = await fetchAllPages(client, settingsUrl);
  console.log(`  Retrieved ${settings.length} settings.`);

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(`  Saved to ${SETTINGS_FILE}`);

  // 3. Write last-updated timestamp
  const now = new Date().toISOString();
  fs.writeFileSync(LAST_UPDATED_FILE, JSON.stringify({ date: now }, null, 2), 'utf-8');
  console.log(`  Updated timestamp: ${now}`);

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
