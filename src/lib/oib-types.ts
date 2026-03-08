// ── OIB Types ──
// Mirrors the output types in scripts/fetch-oib-data.ts.
// Keep in sync if the fetch script shape changes.

export interface OIBOutput {
  fetchedAt: string;
  oibCommitSha: string;
  policies: OIBPolicy[];
}

export interface OIBPolicy {
  name: string;
  platform: string;
  technologies: string;
  oibFolder: string;
  githubUrl: string;
  settings: OIBSetting[];
}

export interface OIBSetting {
  definitionId: string;
  value: OIBValue;
}

export type OIBValue =
  | { type: 'choice'; optionId: string; children?: OIBSetting[] }
  | { type: 'simple'; value: string | number | boolean | null }
  | { type: 'choiceCollection'; optionIds: string[] }
  | { type: 'simpleCollection'; values: (string | number | boolean | null)[] }
  | { type: 'group'; members: OIBSetting[] }
  | { type: 'groupCollection'; groups: OIBSetting[][] }
  | { type: 'unknown' };

// ── Parsed policy metadata (derived from name + folder) ──

export interface ParsedPolicy {
  /** ES = Essential Security, SC = Security Configuration; null for non-Windows */
  tier: 'ES' | 'SC' | null;
  category: string;
  /** D = Device scope, U = User scope */
  scope: 'D' | 'U';
  /** Short human-readable policy name from the filename */
  policyLabel: string;
  version: string;
}

export function parsePolicy(policy: OIBPolicy): ParsedPolicy {
  const { name, oibFolder } = policy;

  if (oibFolder === 'WINDOWS') {
    const m = name.match(/^Win - OIB - (ES|SC) - (.+?) - (D|U) - (.+?) - v([\d.]+)$/);
    if (m) return { tier: m[1] as 'ES' | 'SC', category: m[2], scope: m[3] as 'D' | 'U', policyLabel: m[4], version: m[5] };
    // Update/Ring policies (no D/U scope): e.g. "Win - OIB - ES - Defender Antivirus Updates - Ring 1 - Pilot - v3.4"
    const m2 = name.match(/^Win - OIB - (ES|SC) - (.+?) Updates - (Ring \d+ - .+?) - v([\d.]+)$/);
    if (m2) return { tier: m2[1] as 'ES' | 'SC', category: m2[2], scope: 'D', policyLabel: `Updates - ${m2[3]}`, version: m2[4] };
  }

  if (oibFolder === 'MACOS') {
    const m = name.match(/^MacOS - OIB - (.+?) - (D|U) - (.+?) - v([\d.]+)$/);
    if (m) return { tier: null, category: m[1], scope: m[2] as 'D' | 'U', policyLabel: m[3], version: m[4] };
  }

  if (oibFolder === 'WINDOWS365') {
    const m = name.match(/^Win365 - OIB - (.+?) - (D|U) - (.+?) - v([\d.]+)$/);
    if (m) return { tier: null, category: m[1], scope: m[2] as 'D' | 'U', policyLabel: m[3], version: m[4] };
  }

  return { tier: null, category: name, scope: 'D', policyLabel: name, version: '' };
}

// ── Flattened setting for display ──

export interface FlatSetting {
  definitionId: string;
  value: OIBValue;
}

/**
 * Recursively flatten OIB settings to leaf (choice / simple / collection) entries.
 * Group and GroupCollection containers are traversed but not emitted as rows.
 * Choice children (dependent settings) are emitted after their parent.
 */
export function flattenOIBSettings(settings: OIBSetting[]): FlatSetting[] {
  const result: FlatSetting[] = [];

  function walk(s: OIBSetting) {
    const v = s.value;
    if (v.type === 'groupCollection') {
      for (const group of v.groups) for (const child of group) walk(child);
    } else if (v.type === 'group') {
      for (const member of v.members) walk(member);
    } else {
      result.push({ definitionId: s.definitionId, value: v });
      if (v.type === 'choice' && v.children) {
        for (const child of v.children) walk(child);
      }
    }
  }

  for (const s of settings) walk(s);
  return result;
}

// ── Sidebar tree ──

export interface OIBFolderNode {
  folder: string;
  label: string;
  categories: OIBCategoryNode[];
}

export interface OIBCategoryNode {
  folder: string;
  category: string;
  policyCount: number;
}

const FOLDER_LABELS: Record<string, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  WINDOWS365: 'Windows 365',
};

const FOLDER_ORDER = ['WINDOWS', 'MACOS', 'WINDOWS365'];

export function buildSidebarTree(policies: OIBPolicy[]): OIBFolderNode[] {
  const map = new Map<string, Map<string, number>>();

  for (const policy of policies) {
    const { folder, category } = { folder: policy.oibFolder, category: parsePolicy(policy).category };
    if (!map.has(folder)) map.set(folder, new Map());
    const cats = map.get(folder)!;
    cats.set(category, (cats.get(category) ?? 0) + 1);
  }

  return FOLDER_ORDER
    .filter((f) => map.has(f))
    .map((folder) => {
      const cats = map.get(folder)!;
      const categories: OIBCategoryNode[] = Array.from(cats.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, policyCount]) => ({ folder, category, policyCount }));
      return { folder, label: FOLDER_LABELS[folder] ?? folder, categories };
    });
}
