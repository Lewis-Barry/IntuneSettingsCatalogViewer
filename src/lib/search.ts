/**
 * Client-side search using Flexsearch.
 *
 * The search index JSON (an array of SearchIndexEntry) is loaded lazily
 * from /search-index.json on first search interaction. Flexsearch indexes
 * it in-memory for sub-millisecond queries.
 */

import type { SearchIndexEntry } from './types';

// Flexsearch types are minimal; we use `any` for the Document index.
let index: any = null;
let documents: SearchIndexEntry[] = [];
let loadPromise: Promise<void> | null = null;

/** Lazily load and index the search data */
export async function ensureIndex(): Promise<void> {
  if (index) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Dynamic import of flexsearch — the module uses a default export
      const FlexSearchModule = await import('flexsearch');
      const FlexSearch = FlexSearchModule.default ?? FlexSearchModule;

      // Load the search index JSON
      const basePath = process.env.__NEXT_ROUTER_BASEPATH || '';
      const res = await fetch(`${basePath}/search-index.json`);
      if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);
      documents = (await res.json()) as SearchIndexEntry[];

      // Resolve the Document constructor (handle various export shapes)
      const DocumentCtor = FlexSearch.Document ?? FlexSearch;
      if (!DocumentCtor || typeof DocumentCtor !== 'function') {
        throw new Error('FlexSearch.Document constructor not found');
      }

      // Create a Document index with multiple fields
      index = new DocumentCtor({
        document: {
          id: 'id',
          index: [
            {
              field: 'displayName',
              tokenize: 'forward',
              optimize: true,
              resolution: 9,
            },
            {
              field: 'description',
              tokenize: 'forward',
              optimize: true,
              resolution: 5,
            },
            {
              field: 'keywords',
              tokenize: 'forward',
              optimize: true,
              resolution: 7,
            },
            {
              field: 'categoryName',
              tokenize: 'forward',
              optimize: true,
              resolution: 3,
            },
          ],
        },
        tokenize: 'forward',
        cache: 100,
      });

      // Add all documents to the index
      for (const doc of documents) {
        index.add(doc);
      }
    } catch (err) {
      // Reset so next call retries instead of returning a stale failed promise
      loadPromise = null;
      index = null;
      throw err;
    }
  })();

  return loadPromise;
}

/**
 * Pre-warm the search index in the background.
 * Called on page mount so the index is ready before the user interacts with search.
 */
export function preloadIndex(): void {
  ensureIndex().catch(() => {
    // Swallow — ensureIndex will retry on next call
  });
}

/** Search the index. Returns matching SearchIndexEntry items. */
export async function search(
  query: string,
  limit: number = 50
): Promise<SearchIndexEntry[]> {
  await ensureIndex();
  if (!query.trim()) return [];

  // Support comma-separated multi-term search (like Intune's UI)
  const terms = query.split(',').map((t) => t.trim()).filter(Boolean);

  // Track the best field score for each matched document id.
  // Higher score = more prominent field (displayName beats keywords beats description beats categoryName).
  const fieldPriority: Record<string, number> = {
    displayName: 4,
    keywords: 3,
    description: 2,
    categoryName: 1,
  };
  const fieldScores = new Map<string, number>();

  for (const term of terms) {
    // Search across all indexed fields
    const results = index.search(term, { limit, enrich: false });

    // Flexsearch Document returns an array of { field, result[] } objects
    for (const fieldResult of results) {
      const fieldScore = fieldPriority[fieldResult.field as string] ?? 1;
      for (const id of fieldResult.result) {
        const existing = fieldScores.get(id as string) ?? 0;
        if (fieldScore > existing) fieldScores.set(id as string, fieldScore);
      }
    }
  }

  // Map IDs back to full documents
  const docMap = new Map(documents.map((d) => [d.id, d]));
  const matched: SearchIndexEntry[] = [];
  for (const [id] of fieldScores) {
    const doc = docMap.get(id);
    if (doc) matched.push(doc);
  }

  // Score how well a displayName matches the search terms.
  // Checks both the full phrase and individual words so that a multi-word query
  // like "windows firewall" still awards a positive score to a displayName of
  // "Firewall", preventing description-only matches from outranking it.
  const lowerTerms = terms.map((t) => t.toLowerCase());
  const getNameScore = (name: string): number => {
    const lower = name.toLowerCase();
    let best = 0;
    for (const term of lowerTerms) {
      // Full-phrase match (highest tier)
      let score = 0;
      if (lower === term) score = 100;
      else if (lower.startsWith(term)) score = 80;
      else if (lower.includes(' ' + term) || lower.includes(term + ' ')) score = 60;
      else if (lower.includes(term)) score = 40;

      // If the phrase didn't match, try individual words of the term so
      // "windows firewall" still scores "Firewall" positively.
      if (score === 0) {
        const words = term.split(/\s+/).filter(Boolean);
        if (words.length > 1) {
          for (const word of words) {
            let ws = 0;
            if (lower === word) ws = 30;
            else if (lower.startsWith(word)) ws = 25;
            else if (lower.includes(' ' + word) || lower.includes(word + ' ')) ws = 20;
            else if (lower.includes(word)) ws = 15;
            if (ws > score) score = ws;
          }
        }
      }

      if (score > best) best = score;
    }
    return best;
  };

  matched.sort((a, b) => {
    const aNameScore = getNameScore(a.displayName);
    const bNameScore = getNameScore(b.displayName);

    // Any displayName match (score > 0) always ranks above a description/keyword-only match (score == 0)
    const aHasName = aNameScore > 0 ? 1 : 0;
    const bHasName = bNameScore > 0 ? 1 : 0;
    if (aHasName !== bHasName) return bHasName - aHasName;

    // Within the same bucket, prefer closer name matches
    if (aNameScore !== bNameScore) return bNameScore - aNameScore;

    // Tiebreak on which field FlexSearch matched (displayName > keywords > description > categoryName)
    const aFieldScore = fieldScores.get(a.id) ?? 0;
    const bFieldScore = fieldScores.get(b.id) ?? 0;
    if (aFieldScore !== bFieldScore) return bFieldScore - aFieldScore;

    // Final fallback: alphabetical
    return a.displayName.localeCompare(b.displayName);
  });

  return matched.slice(0, limit);
}


