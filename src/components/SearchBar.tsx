'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { search as flexSearch, ensureIndex } from '@/lib/search';
import type { SearchIndexEntry } from '@/lib/types';

interface SearchBarProps {
  onSearchResults?: (results: SearchIndexEntry[]) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  localSearch?: boolean;
}

export default function SearchBar({
  onSearchResults,
  onQueryChange,
  placeholder = 'Search for a setting',
  localSearch = false,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (localSearch || !query.trim()) return;
    const sequence = ++searchSeqRef.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await flexSearch(query, 200);
        if (!cancelled && sequence === searchSeqRef.current) onSearchResults?.(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        if (!cancelled && sequence === searchSeqRef.current) setIsLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, localSearch, onSearchResults]);

  const handleFocus = useCallback(() => {
    if (localSearch) return;
    ensureIndex().catch(() => {});
  }, [localSearch]);

  // Debounced search — fires results to parent, no dropdown
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      onQueryChange?.(value);
      ++searchSeqRef.current;

      if (localSearch) {
        setIsLoading(false);
        return;
      }

      if (!value.trim()) {
        setIsLoading(false);
        onSearchResults?.([]);
        return;
      }
    },
    [onSearchResults, onQueryChange, localSearch]
  );

  return (
    <div>
      {/* Search instruction */}
      <p className="text-fluent-sm text-fluent-text-secondary mb-2">
        Search by policy name, description, keywords, or CSP path; separate multiple terms with commas
      </p>

      {/* Search input */}
      <div className="flex">
        <div className="relative flex-1">
          {isLoading && !localSearch ? (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              aria-hidden="true"
            >
              <span className="block w-4 h-4 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
            </span>
          ) : (
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fluent-text-secondary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            placeholder={placeholder}
            className="w-full pl-10 pr-8 py-2 text-fluent-base bg-white dark:bg-[#2c2c2e] border border-fluent-border-strong rounded
                       focus:outline-none focus:border-fluent-blue focus:ring-1 focus:ring-fluent-blue
                       placeholder:text-fluent-text-disabled"
            aria-label="Search settings"
          />

          {/* Clear button */}
          {query && (
            <button
              onClick={() => {
                setQuery('');
                ++searchSeqRef.current;
                setIsLoading(false);
                onQueryChange?.('');
                onSearchResults?.([]);
                inputRef.current?.focus();
              }}
              className="search-clear-btn absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                         text-fluent-text-secondary hover:text-fluent-text rounded-full"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
