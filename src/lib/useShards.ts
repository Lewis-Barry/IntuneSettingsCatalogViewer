import { useCallback, useState } from 'react';
import { loadBrowserJson } from './browser-data';

/** Lazy per-version JSON files (`<dir>/<id>.json`) shared by the baseline and
 *  OIB version pages: fetch on demand, keep by id, remember which ones failed. */
export function useShards<T>(dir: string) {
  const [shards, setShards] = useState<Map<string, T>>(new Map());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const ensure = useCallback(
    (id: string | null | undefined) => {
      if (!id || shards.has(id)) return;
      loadBrowserJson<T>(`${dir}/${id}.json`)
        .then((shard) => setShards((prev) => (prev.has(id) ? prev : new Map(prev).set(id, shard))))
        .catch(() => setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id))));
    },
    [dir, shards]
  );

  /** The download failed and no later attempt has succeeded. */
  const hasFailed = (id: string | null | undefined) => !!id && failed.has(id) && !shards.has(id);

  return { shards, ensure, hasFailed };
}
