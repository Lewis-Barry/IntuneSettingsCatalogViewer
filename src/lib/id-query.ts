// Setting ids are the CSP path flattened (".../Maps/EnableOfflineMapsAutoUpdate" ->
// "device_vendor_msft_policy_config_maps_enableofflinemapsautoupdate"; Android:
// "com.android.devicerestrictionpolicy.networkescapehatchallowed"). Comparing with
// every non-alphanumeric stripped lets a pasted path, a partial path or a bare
// property name find the setting regardless of slashes, dots, underscores or case.
// Pure string helpers: shared by the browser search worker and the MCP server.

export const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Compact form of a whitespace-free query worth matching against ids, else null. */
export function idQuery(term: string): string | null {
  const t = term.trim();
  if (!t || /\s/.test(t)) return null;
  const c = compact(t);
  // A path/id separator marks an explicit path ("policy/maps"): always worth matching.
  // A bare word ("maps") must be 8+ chars, or it matches hundreds of ids by accident.
  return c.length >= (/[/._]/.test(t) ? 3 : 8) ? c : null;
}
