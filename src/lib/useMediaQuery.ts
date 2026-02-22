'use client';

import { useState, useEffect } from 'react';

/**
 * SSR-safe hook that tracks whether a CSS media query matches.
 * Returns `defaultValue` during SSR / first render, then updates to the real value.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    const mql = window.matchMedia(query);
    // Set the initial value immediately
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** True when viewport is >= 768px (Tailwind `md` breakpoint) */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)', true);
}
