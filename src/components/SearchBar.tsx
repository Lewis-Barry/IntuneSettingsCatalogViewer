'use client';

import { useState, useCallback, useRef } from 'react';
import { search as flexSearch, ensureIndex } from '@/lib/search';
import type { SearchIndexEntry } from '@/lib/types';

interface SearchBarProps {
  onSearchResults?: (results: SearchIndexEntry[]) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({
  onSearchResults,
  onQueryChange,
  placeholder = 'Search for a setting',
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [indexReady, setIndexReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Pre-load index on focus
  const handleFocus = useCallback(async () => {
    if (!indexReady) {
      setIsLoading(true);
      try {
        await ensureIndex();
        setIndexReady(true);
      } catch (err) {
        console.error('Failed to load search index:', err);
      }
      setIsLoading(false);
    }
  }, [indexReady]);

  // Debounced search — fires results to parent, no dropdown
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      onQueryChange?.(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        onSearchResults?.([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const res = await flexSearch(value, 200);
          onSearchResults?.(res);
        } catch (err) {
          console.error('Search failed:', err);
        }
        setIsLoading(false);
      }, 200);
    },
    [onSearchResults, onQueryChange]
  );

  // Handle search button / Enter key
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    try {
      const res = await flexSearch(query, 200);
      onSearchResults?.(res);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setIsLoading(false);
  }, [query, onSearchResults]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <div>
      {/* Search instruction */}
      <p className="text-fluent-sm text-fluent-text-secondary mb-2">
        Use commas &ldquo;,&rdquo; among search terms to lookup settings by their keywords
      </p>

      {/* Search input */}
      <div className="flex">
        <div className="relative flex-1">
          {/* Search icon */}
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fluent-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-10 pr-8 py-2 text-fluent-base border border-fluent-border-strong rounded
                       focus:outline-none focus:border-fluent-blue focus:ring-1 focus:ring-fluent-blue
                       placeholder:text-fluent-text-disabled"
            aria-label="Search settings"
          />

          {/* Clear button */}
          {query && (
            <button
              onClick={() => {
                setQuery('');
                onQueryChange?.('');
                onSearchResults?.([]);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                         text-fluent-text-secondary hover:text-fluent-text rounded-full"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
