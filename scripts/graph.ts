/**
 * Microsoft Graph client shared by fetch-settings.ts and fetch-baselines.ts:
 * client-credentials auth plus GET with retry and paging.
 *
 * Env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (also read from
 * .env.local, which is gitignored, so a local run needs no exports).
 */

import * as path from 'path';

try {
  process.loadEnvFile(path.resolve(__dirname, '..', '.env.local'));
} catch {
  // no .env.local; rely on the process environment
}

const TENANT_ID = process.env.AZURE_TENANT_ID!;
const CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

// Module-level so graphGet can refresh it when it expires mid-run — a full
// catalog fetch (plus throttle waits) can outlast the ~60min token lifetime.
let token: string | null = null;

export async function getAccessToken(): Promise<string> {
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

const MAX_RETRIES = 8;

/** GET with retry on throttling, transient 5xx/network errors and token expiry. */
export async function graphGet(url: string): Promise<Record<string, unknown>> {
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

export async function fetchAllPages<T>(url: string, logPages = false): Promise<T[]> {
  const results: T[] = [];
  let nextLink: string | undefined = url;
  let page = 1;

  while (nextLink) {
    if (logPages) console.log(`  Page ${page}...`);
    const response = await graphGet(nextLink);
    results.push(...(response.value as T[]));
    nextLink = response['@odata.nextLink'] as string | undefined;
    page++;
  }

  return results;
}
