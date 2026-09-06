import type { SearchIndexEntry } from './types';

export interface CachedSearchIndex {
  version: string;
  documents: SearchIndexEntry[];
  chunks: Array<[string, string]>;
}

const chunkKeys = new Set(['reg', ...['displayName', 'description', 'keywords', 'categoryName'].flatMap((field) => [`${field}.cfg`, `${field}.map`, `${field}.ctx`])]);
const documentFields = ['id', 'displayName', 'description', 'keywords', 'categoryId', 'categoryName', 'scope', 'platform', 'settingType'];

export function isSearchCache(value: unknown, version: string, documentCount: number): value is CachedSearchIndex {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CachedSearchIndex>;
  if (record.version !== version || !Array.isArray(record.documents) || record.documents.length !== documentCount) return false;
  if (!record.documents.every((document) => document && documentFields.every((field) => typeof (document as unknown as Record<string, unknown>)[field] === 'string'))) return false;
  if (!Array.isArray(record.chunks) || record.chunks.length !== chunkKeys.size) return false;
  if (!record.chunks.every((chunk) => Array.isArray(chunk) && chunk.length === 2 && chunkKeys.has(chunk[0]) && typeof chunk[1] === 'string')) return false;
  return new Set(record.chunks.map(([key]) => key)).size === chunkKeys.size;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(database);
    };
    const timer = setTimeout(() => finish(null), 1000);
    try {
      const request = indexedDB.open('intune-settings-search', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('indexes')) request.result.createObjectStore('indexes');
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        finish(database);
      };
    } catch {
      finish(null);
    }
  });
}

export async function readSearchCache(key: string, version: string, documentCount: number): Promise<CachedSearchIndex | null> {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const finish = (value: CachedSearchIndex | null) => {
      clearTimeout(timer);
      database.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 1000);
    try {
      const transaction = database.transaction('indexes', 'readonly');
      transaction.onabort = () => finish(null);
      transaction.onerror = () => finish(null);
      const request = transaction.objectStore('indexes').get(key);
      request.onsuccess = () => finish(isSearchCache(request.result, version, documentCount) ? request.result : null);
    } catch {
      finish(null);
    }
  });
}

export async function writeSearchCache(key: string, value: CachedSearchIndex): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  return new Promise((resolve) => {
    const finish = () => {
      database.close();
      resolve();
    };
    try {
      const transaction = database.transaction('indexes', 'readwrite');
      transaction.oncomplete = finish;
      transaction.onabort = finish;
      transaction.onerror = finish;
      transaction.objectStore('indexes').put(value, key);
    } catch {
      finish();
    }
  });
}