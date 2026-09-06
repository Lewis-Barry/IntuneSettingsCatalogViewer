import type { SearchIndexEntry } from './types';
import { readSearchCache, writeSearchCache, type CachedSearchIndex } from './search-cache';
import manifest from '../../data/search-index-manifest.json';

type SearchWorkerRequest =
  | { id: number; type: 'ensureIndex'; basePath: string }
  | { id: number; type: 'search'; basePath: string; query: string; limit: number };

type SearchWorkerResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'results'; results: SearchIndexEntry[] }
  | { id: number; type: 'error'; message: string };

let index: any = null;
let documents: SearchIndexEntry[] = [];
let documentMap = new Map<string, SearchIndexEntry>();
let loadPromise: Promise<void> | null = null;
const CACHE_VERSION = `numeric-v1:${manifest.version}`;

async function ensureIndex(basePath: string): Promise<void> {
  if (index) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [FlexSearchModule, cached] = await Promise.all([
      import('flexsearch'),
      readSearchCache(basePath, CACHE_VERSION, manifest.documentCount).catch(() => null),
    ]);
    const FlexSearch = FlexSearchModule.default ?? FlexSearchModule;

    const DocumentCtor = FlexSearch.Document ?? FlexSearch;
    if (!DocumentCtor || typeof DocumentCtor !== 'function') {
      throw new Error('FlexSearch.Document constructor not found');
    }

    const createIndex = () => new DocumentCtor({
      document: {
        id: 'id',
        index: [
          { field: 'displayName', tokenize: 'forward', optimize: true, resolution: 9 },
          { field: 'description', tokenize: 'forward', optimize: true, resolution: 5 },
          { field: 'keywords', tokenize: 'forward', optimize: true, resolution: 7 },
          { field: 'categoryName', tokenize: 'forward', optimize: true, resolution: 3 },
        ],
      },
      tokenize: 'forward',
      cache: 100,
    });

    let preparedIndex = createIndex();
    let restored = false;
    if (cached) {
      try {
        const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
        for (const [key, data] of cached.chunks) {
          const parsed: unknown = JSON.parse(data);
          const valid = key === 'reg'
            ? isObject(parsed) && Object.keys(parsed).length === cached.documents.length && Object.keys(parsed).every((id, position) => Number(id) === position && parsed[id] === 1)
            : key.endsWith('.cfg')
              ? isObject(parsed) && parsed.opt === 1 && parsed.doc === 0
              : Array.isArray(parsed) && parsed.every(isObject);
          if (!valid) throw new Error(`Invalid cached search chunk: ${key}`);
          await preparedIndex.import(key, parsed);
        }
        documents = cached.documents;
        restored = true;
      } catch {
        preparedIndex = createIndex();
      }
    }
    if (!restored) {
      const res = await fetch(`${basePath}/search-index.json?v=${manifest.version}`);
      if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);
      documents = (await res.json()) as SearchIndexEntry[];
      for (const [documentId, doc] of documents.entries()) preparedIndex.add({ ...doc, id: documentId });
    }
    documentMap = new Map(documents.map((doc) => [doc.id, doc]));
    index = preparedIndex;
    if (!restored) {
      const indexedDocuments = documents;
      void (async () => {
        const chunks: CachedSearchIndex['chunks'] = [];
        await preparedIndex.export((key, data) => {
          if (typeof key === 'string' && typeof data === 'string') chunks.push([key, data]);
        });
        await writeSearchCache(basePath, { version: CACHE_VERSION, documents: indexedDocuments, chunks });
      })().catch(() => {});
    }
  })().catch((err) => {
    loadPromise = null;
    index = null;
    documents = [];
    documentMap = new Map();
    throw err;
  });

  return loadPromise;
}

function runSearch(query: string, limit: number): SearchIndexEntry[] {
  if (!index || !query.trim()) return [];

  const terms = query.split(',').map((term) => term.trim()).filter(Boolean);
  const fieldPriority: Record<string, number> = {
    displayName: 4,
    keywords: 3,
    description: 2,
    categoryName: 1,
  };
  const fieldScores = new Map<string, number>();

  for (const term of terms) {
    const results = index.search(term, { limit, enrich: false });
    for (const fieldResult of results) {
      const fieldScore = fieldPriority[fieldResult.field as string] ?? 1;
      for (const documentId of fieldResult.result) {
        const id = documents[documentId as number]?.id;
        if (!id) continue;
        const existing = fieldScores.get(id) ?? 0;
        if (fieldScore > existing) fieldScores.set(id, fieldScore);
      }
    }
  }

  const matched: SearchIndexEntry[] = [];
  for (const [id] of fieldScores) {
    const doc = documentMap.get(id);
    if (doc) matched.push(doc);
  }

  const lowerTerms = terms.map((term) => {
    const lower = term.toLowerCase();
    return { term: lower, words: lower.split(/\s+/).filter(Boolean) };
  });
  const nameScores = new Map<string, number>();
  const getNameScore = (name: string): number => {
    const cached = nameScores.get(name);
    if (cached !== undefined) return cached;
    const lower = name.toLowerCase();
    let best = 0;
    for (const { term, words } of lowerTerms) {
      let score = 0;
      if (lower === term) score = 100;
      else if (lower.startsWith(term)) score = 80;
      else if (lower.includes(' ' + term) || lower.includes(term + ' ')) score = 60;
      else if (lower.includes(term)) score = 40;

      if (score === 0) {
        if (words.length > 1) {
          for (const word of words) {
            let wordScore = 0;
            if (lower === word) wordScore = 30;
            else if (lower.startsWith(word)) wordScore = 25;
            else if (lower.includes(' ' + word) || lower.includes(word + ' ')) wordScore = 20;
            else if (lower.includes(word)) wordScore = 15;
            if (wordScore > score) score = wordScore;
          }
        }
      }

      if (score > best) best = score;
    }
    nameScores.set(name, best);
    return best;
  };

  matched.sort((a, b) => {
    const aNameScore = getNameScore(a.displayName);
    const bNameScore = getNameScore(b.displayName);

    const aHasName = aNameScore > 0 ? 1 : 0;
    const bHasName = bNameScore > 0 ? 1 : 0;
    if (aHasName !== bHasName) return bHasName - aHasName;

    if (aNameScore !== bNameScore) return bNameScore - aNameScore;

    const aFieldScore = fieldScores.get(a.id) ?? 0;
    const bFieldScore = fieldScores.get(b.id) ?? 0;
    if (aFieldScore !== bFieldScore) return bFieldScore - aFieldScore;

    return a.displayName.localeCompare(b.displayName);
  });

  return matched.slice(0, limit);
}

const ctx = self as unknown as Worker;

ctx.onmessage = async (event: MessageEvent<SearchWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'ensureIndex') {
      await ensureIndex(request.basePath);
      ctx.postMessage({ id: request.id, type: 'ready' } satisfies SearchWorkerResponse);
      return;
    }

    await ensureIndex(request.basePath);
    ctx.postMessage({
      id: request.id,
      type: 'results',
      results: runSearch(request.query, request.limit),
    } satisfies SearchWorkerResponse);
  } catch (err) {
    ctx.postMessage({
      id: request.id,
      type: 'error',
      message: err instanceof Error ? err.message : 'Search worker failed',
    } satisfies SearchWorkerResponse);
  }
};

export {};