/**
 * Deterministic slug generation for setting IDs.
 *
 * Some Intune setting IDs exceed 255 characters, which breaks the Linux
 * filesystem limit when Next.js generates static pages (ENAMETOOLONG).
 *
 * Short IDs pass through unchanged. Long IDs are truncated and suffixed
 * with a deterministic hash to guarantee uniqueness.
 *
 * Works in both Node.js and browser environments (no Node-specific APIs).
 */

const MAX_SLUG_LENGTH = 200;

/**
 * cyrb53 – a fast, high-quality 53-bit hash.
 * Returns a base-36 string (≤ 11 chars).
 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Derive a filesystem-safe URL slug from a setting ID.
 *
 * - IDs ≤ MAX_SLUG_LENGTH characters pass through unchanged.
 * - Longer IDs are truncated and suffixed with `_<hash>` to stay unique.
 */
export function settingSlug(id: string): string {
  if (id.length <= MAX_SLUG_LENGTH) return id;
  const hash = cyrb53(id);
  return id.slice(0, MAX_SLUG_LENGTH - hash.length - 1) + '_' + hash;
}
