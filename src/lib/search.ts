import type { SearchIndexEntry } from './types';

type SearchWorkerResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'results'; results: SearchIndexEntry[] }
  | { id: number; type: 'error'; message: string };

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, {
  resolve: (value: SearchIndexEntry[]) => void;
  reject: (reason?: unknown) => void;
}>();

function getBasePath(): string {
  return process.env.__NEXT_ROUTER_BASEPATH || '';
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./search.worker.ts', import.meta.url));
  worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
    const response = event.data;
    const pending = pendingRequests.get(response.id);
    if (!pending) return;

    pendingRequests.delete(response.id);
    if (response.type === 'error') {
      pending.reject(new Error(response.message));
    } else if (response.type === 'results') {
      pending.resolve(response.results);
    } else {
      // 'ready' — index loaded, no results to return.
      pending.resolve([]);
    }
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || 'Search worker failed');
    for (const pending of pendingRequests.values()) {
      pending.reject(error);
    }
    pendingRequests.clear();
    worker?.terminate();
    worker = null;
  };

  return worker;
}

function postWorkerRequest(message: Record<string, unknown>): Promise<SearchIndexEntry[]> {
  const id = nextRequestId++;
  return new Promise<SearchIndexEntry[]>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    getWorker().postMessage({ ...message, id, basePath: getBasePath() });
  });
}

export async function ensureIndex(): Promise<void> {
  await postWorkerRequest({ type: 'ensureIndex' });
}

export async function search(
  query: string,
  limit: number = 50
): Promise<SearchIndexEntry[]> {
  if (!query.trim()) return [];
  return postWorkerRequest({ type: 'search', query, limit });
}


