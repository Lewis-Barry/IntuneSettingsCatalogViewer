// Setting ids are the flattened CSP path, so comparing with all punctuation stripped lets a
// pasted path or property name find the setting. Shared by the search worker and the MCP.

export const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Compact form of a whitespace-free query worth matching against ids, else null. */
export function idQuery(term: string): string | null {
  const t = term.trim();
  if (!t || /\s/.test(t)) return null;
  const c = compact(t);
  // Bare words need 8+ chars, or "maps" matches hundreds of ids; paths ("config/maps") need 3.
  return c.length >= (/[/._]/.test(t) ? 3 : 8) ? c : null;
}
