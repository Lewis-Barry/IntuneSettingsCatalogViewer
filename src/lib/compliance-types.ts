// Types for the CLASSIC compliance policies (deviceManagement/deviceCompliancePolicies).
//
// These are typed Graph resources with fixed properties — there is no definition
// endpoint, so the catalog is reconstructed by scripts/fetch-compliance-templates.ts
// from Graph $metadata (properties + enum members) and Microsoft's doc source
// (descriptions).
//
// This is a reference catalog of what CAN be set. It never contains tenant data.

export interface ComplianceOption {
  value: string;
  isDefault?: boolean;
}

export interface ComplianceProperty {
  name: string;
  /** Graph EDM type, e.g. 'Boolean', 'Int32', 'String', 'requiredPasswordType'. */
  type: string;
  /** Microsoft's own description; absent for the handful they leave blank. */
  description?: string;
  /** Allowed values, for Boolean and enum-typed settings. */
  options?: ComplianceOption[];
  kind: 'choice' | 'simple';
}

export interface ComplianceTemplate {
  /** Graph type name, e.g. 'windows10CompliancePolicy'. */
  type: string;
  /** Human platform label, e.g. 'Windows 10/11'. */
  platform: string;
  /** Broad OS family, matching the main browser's platform filter values. */
  family: string;
  properties: ComplianceProperty[];
}

export interface ComplianceTemplatesFile {
  templates: ComplianceTemplate[];
}

/** A row in the browser: a property plus the platform it belongs to. */
export interface ComplianceRow {
  template: ComplianceTemplate;
  property: ComplianceProperty;
}

/** Friendly label for a Graph EDM type, for the Type badge. */
export function typeLabel(type: string): string {
  if (type === 'Boolean') return 'Boolean';
  if (type.startsWith('Int') || type === 'Double') return 'Number';
  if (type === 'String') return 'String';
  if (type === 'DateTimeOffset') return 'Date';
  if (type.startsWith('[]')) return 'Collection';
  return 'Choice';
}

const ACRONYMS: Record<string, string> = {
  tpm: 'TPM', os: 'OS', usb: 'USB', dma: 'DMA', ios: 'iOS', sccm: 'SCCM', rtp: 'RTP',
};

/**
 * camelCase → sentence case, e.g. `storageRequireEncryption` →
 * "Storage require encryption". A label, not a translation — the real meaning is
 * Microsoft's description shown alongside it.
 */
export function humanise(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.toLowerCase());
  const [first, ...rest] = words;
  const lead = ACRONYMS[first.toLowerCase()] ?? first.charAt(0).toUpperCase() + first.slice(1);
  return [lead, ...rest].join(' ');
}

/** Every setting across every platform, flattened for search and "All" browsing. */
export function allRows(templates: ComplianceTemplate[]): ComplianceRow[] {
  return templates.flatMap((template) => template.properties.map((property) => ({ template, property })));
}

/** Case-insensitive, comma-separated multi-term match over a row's text. */
export function matchesQuery(row: ComplianceRow, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = [
    row.property.name,
    humanise(row.property.name),
    row.property.description,
    row.template.platform,
    ...(row.property.options?.map((o) => o.value) ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.some((t) => haystack.includes(t));
}
