/** Highlight matching substrings with a subtle background.
 *  Supports comma-separated exact phrases AND individual words from each term.
 *  Exact multi-word phrases are matched first (longer patterns take priority),
 *  then individual words are highlighted wherever they appear separately.
 *
 *  `variant` controls the highlight color:
 *   - 'title'     → yellow (default) — used when the title itself matches
 *   - 'secondary' → light blue — used for description / CSP / contextual matches */
export default function HighlightText({
  text,
  query,
  variant = 'title',
}: {
  text: string;
  query?: string;
  variant?: 'title' | 'secondary';
}) {
  if (!query || !query.trim()) {
    return <>{text}</>;
  }

  // Split comma-separated terms, escape regex special chars
  const terms = query.split(',').map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) return <>{text}</>;

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Collect all patterns: exact phrases first, then individual words.
  // Use a Set to avoid duplicates (e.g. a single word term would appear twice).
  const patternSet = new Set<string>();

  // 1. Exact comma-separated phrases (may be multi-word)
  for (const term of terms) {
    patternSet.add(escapeRe(term));
  }

  // 2. Individual words from each term (split on whitespace)
  for (const term of terms) {
    const words = term.split(/\s+/).filter(w => w.length > 0);
    for (const word of words) {
      patternSet.add(escapeRe(word));
    }
  }

  // Sort patterns longest-first so multi-word phrases match before individual words
  const sorted = Array.from(patternSet).sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`(${sorted.join('|')})`, 'gi');
  const parts = text.split(pattern);

  const highlightClass = 'bg-yellow-100 dark:bg-yellow-800/50 text-inherit rounded-sm';

  // ponytail: single wrapper span so a flex/gap parent treats the whole
  // highlighted string as one item instead of spacing out every fragment
  return (
    <span>
      {parts.map((part, i) =>
        // split() with a single capture group alternates non-match / match parts
        i % 2 === 1 ? (
          <mark key={i} className={highlightClass}>{part}</mark>
        ) : (
          part
        )
      )}
    </span>
  );
}
