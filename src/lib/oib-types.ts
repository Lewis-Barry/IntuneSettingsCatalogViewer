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
  /** Stable GUID from PolicyManifest.json, where the version ships one. */
  oibId?: string;
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

// ── Group leaves by their parent collection/group ──

import type { SettingDefinition } from './types';

export interface RootGroup<T> {
  rootId: string;
  /** Display label for the parent group, set ONLY when the group has >1 member
   *  and the root definition is known. null → render members flat (ungrouped). */
  label: string | null;
  members: T[];
}

/**
 * Group leaf items (anything carrying a `definitionId`) by their setting's
 * `rootDefinitionId` — the parent SettingGroup/GroupCollection definition.
 * Collection instances (e.g. firewall rule fields) all share one root, so they
 * collapse under a single labelled group. Standalone settings have
 * rootDefinitionId === id and stay as groups-of-one (label null).
 * First-appearance order is preserved.
 */
export function groupByRoot<T extends { definitionId: string }>(
  items: T[],
  defsMap: Map<string, SettingDefinition>,
): RootGroup<T>[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const rootId = defsMap.get(it.definitionId)?.rootDefinitionId ?? it.definitionId;
    if (!groups.has(rootId)) {
      groups.set(rootId, []);
      order.push(rootId);
    }
    groups.get(rootId)!.push(it);
  }
  return order.map((rootId) => {
    const members = groups.get(rootId)!;
    const rootDef = defsMap.get(rootId);
    const label = members.length > 1 && rootDef ? rootDef.displayName.trim() : null;
    return { rootId, label, members };
  });
}

/**
 * Pull a collection instance's own name from its `<root>_name` member (e.g. a
 * firewall rule's "LOLBIN Security - Block 32-bit calc.exe"). Returns null when
 * there's no name field or the group merges multiple instances with different
 * names (the templated-id ceiling — caller falls back to the generic label).
 */
export function instanceName<T extends { definitionId: string }>(
  rootId: string,
  members: T[],
  getValue: (m: T) => OIBValue | undefined,
): string | null {
  const names = new Set<string>();
  for (const m of members) {
    if (m.definitionId !== `${rootId}_name`) continue;
    const v = getValue(m);
    if (v?.type === 'simple' && v.value != null && String(v.value).trim()) {
      names.add(String(v.value).trim());
    }
  }
  return names.size === 1 ? [...names][0] : null;
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
