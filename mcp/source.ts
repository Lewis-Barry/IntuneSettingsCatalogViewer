// Fetches repo data files from GitHub raw and keeps them in memory for the life of the
// process. ponytail: memory only, no disk cache — an opt-in disk cache is the upgrade
// path if offline use is ever needed.
export const REPO = process.env.INTUNE_MCP_REPO ?? 'Lewis-Barry/IntuneSettingsCatalogViewer';
export const REF = process.env.INTUNE_MCP_REF ?? 'main';
const MAX_AGE_MS = 6 * 3600e3;

interface Entry { data: unknown; etag: string | null; checkedAt: number }

export function createSource(fetchFn: typeof fetch = fetch, now: () => number = Date.now) {
  const memo = new Map<string, Entry>();
  const inflight = new Map<string, Promise<unknown>>();
  const stalePaths = new Set<string>();
  const url = (path: string) => `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`;

  async function load(path: string): Promise<unknown> {
    const hit = memo.get(path);
    if (hit && now() - hit.checkedAt < MAX_AGE_MS) return hit.data;
    try {
      const res = await fetchFn(url(path), { headers: hit?.etag ? { 'If-None-Match': hit.etag } : {} });
      if (res.status === 304 && hit) {
        hit.checkedAt = now();
        stalePaths.delete(path);
        return hit.data;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      memo.set(path, { data, etag: res.headers.get('etag'), checkedAt: now() });
      stalePaths.delete(path);
      return data;
    } catch (err) {
      if (hit) { stalePaths.add(path); return hit.data; }
      throw new Error(`failed to load ${path} from GitHub raw: ${(err as Error).message}`);
    }
  }

  return {
    stalePaths,
    json<T>(path: string): Promise<T> {
      let p = inflight.get(path);
      if (!p) { p = load(path).finally(() => inflight.delete(path)); inflight.set(path, p); }
      return p as Promise<T>;
    },
  };
}

export const source = createSource();
