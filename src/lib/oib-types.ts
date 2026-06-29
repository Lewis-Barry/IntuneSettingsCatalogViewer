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
  /** Identifies which groupCollection instance (e.g. one firewall rule) a leaf
   *  came from — `<collectionDefId>#<index>`. Undefined for non-collection leaves. */
  instanceId?: string;
}

/**
 * Recursively flatten OIB settings to leaf (choice / simple / collection) entries.
 * Group and GroupCollection containers are traversed but not emitted as rows.
 * Choice children (dependent settings) are emitted after their parent.
 * Leaves inside a groupCollection carry an `instanceId` so callers can regroup
 * them per instance — the flatten otherwise loses that boundary.
 */
export function flattenOIBSettings(settings: OIBSetting[]): FlatSetting[] {
  const result: FlatSetting[] = [];

  function walk(s: OIBSetting, instanceId?: string) {
    const v = s.value;
    if (v.type === 'groupCollection') {
      v.groups.forEach((group, i) => {
        const iid = `${s.definitionId}#${i}`;
        for (const child of group) walk(child, iid);
      });
    } else if (v.type === 'group') {
      for (const member of v.members) walk(member, instanceId);
    } else {
      result.push({ definitionId: s.definitionId, value: v, instanceId });
      if (v.type === 'choice' && v.children) {
        for (const child of v.children) walk(child, instanceId);
      }
    }
  }

  for (const s of settings) walk(s);
  return result;
}

// ── Group leaves by their parent collection/group ──

import type { SettingDefinition } from './types';

export interface RootGroup<T> {
  /** Real rootDefinitionId (parent group/collection) — use for `<root>_name` lookups. */
  rootId: string;
  /** Unique grouping key: rootId, plus an instance discriminator when the items
   *  carry one. Use this for React keys / toggle state, not rootId (which repeats
   *  across instances of the same collection). */
  key: string;
  /** Display label for the parent group, set ONLY when the group has >1 member
   *  and the root definition is known. null → render members flat (ungrouped). */
  label: string | null;
  members: T[];
}

/**
 * Group leaf items by their setting's `rootDefinitionId` — the parent
 * SettingGroup/GroupCollection definition. Collection-instance fields (e.g. one
 * firewall rule's fields) collapse under a single labelled group; when items
 * carry an `instanceId`, each instance becomes its own group so distinct rules
 * stay separate. Standalone settings (rootDefinitionId === id) stay as
 * groups-of-one (label null). First-appearance order is preserved.
 */
export function groupByRoot<T extends { definitionId: string; instanceId?: string }>(
  items: T[],
  defsMap: Map<string, SettingDefinition>,
): RootGroup<T>[] {
  const order: string[] = [];
  const groups = new Map<string, { rootId: string; members: T[] }>();
  for (const it of items) {
    const rootId = defsMap.get(it.definitionId)?.rootDefinitionId ?? it.definitionId;
    const key = it.instanceId ? `${rootId}::${it.instanceId}` : rootId;
    let g = groups.get(key);
    if (!g) {
      g = { rootId, members: [] };
      groups.set(key, g);
      order.push(key);
    }
    g.members.push(it);
  }
  return order.map((key) => {
    const { rootId, members } = groups.get(key)!;
    const rootDef = defsMap.get(rootId);
    const label = members.length > 1 && rootDef ? rootDef.displayName.trim() : null;
    return { rootId, key, label, members };
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
