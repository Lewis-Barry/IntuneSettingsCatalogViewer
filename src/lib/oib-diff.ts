// ── OIB version diff engine ──
// Pure functions (no DOM, no fetch) so they run both in the browser and in the
// build-time self-check (scripts/oib-diff-check.ts).
//
// Matching is three-tier, cheapest-and-most-reliable first:
//   1. oibId      — stable GUID from PolicyManifest.json (recent versions)
//   2. title      — version-stripped identity tuple from parsePolicy()
//   3. fuzzy      — Jaccard over setting ids + shared title token (renames in
//                   legacy versions that predate the manifest)

import { parsePolicy, flattenOIBSettings } from './oib-types';
import type { OIBPolicy, OIBValue, FlatSetting } from './oib-types';
import type { PolicyDiff, SettingChange, VersionDiff } from './oib-changelog-types';

// ponytail: fuzzy threshold is a heuristic, not ground truth. One constant to
// retune against real data; upgrade path is a manual rename-map if it mismatches.
const FUZZY_MIN_JACCARD = 0.6;

// Minimum similarity for matching two collection instances (e.g. firewall rules)
// across versions when their names differ — below this they read as add + remove.
const INSTANCE_MIN_JACCARD = 0.4;

// Boilerplate tokens stripped before comparing titles for the fuzzy tier.
const STOP_TOKENS = new Set([
  'oib', 'win', 'win365', 'macos', 'es', 'sc', 'd', 'u', '-', '',
]);

// ── Identity keys ──

/** Version-stripped identity used by the title tier. */
function titleKey(p: OIBPolicy): string {
  const parsed = parsePolicy(p);
  if (parsed.version) {
    return `${p.oibFolder}|${parsed.tier ?? ''}|${parsed.category}|${parsed.scope}|${parsed.policyLabel}`.toLowerCase();
  }
  // Fallback: strip a trailing " - vX.Y" suffix from the raw name.
  return `${p.oibFolder}|${p.name.replace(/\s*-\s*v[\d.]+$/i, '')}`.toLowerCase();
}

function displayLabel(p: OIBPolicy): { label: string; category: string } {
  const parsed = parsePolicy(p);
  return { label: parsed.policyLabel || p.name, category: parsed.category || p.name };
}

function titleTokens(p: OIBPolicy): Set<string> {
  return new Set(
    p.name
      .toLowerCase()
      .replace(/v[\d.]+/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !STOP_TOKENS.has(t))
  );
}

// ── Setting comparison ──

/** Non-instance leaf settings keyed by definitionId. (Leaves inside a
 *  groupCollection instance carry an instanceId and are diffed separately.) */
function settingMap(leaves: FlatSetting[]): Map<string, OIBValue[]> {
  const map = new Map<string, OIBValue[]>();
  for (const f of leaves) {
    if (f.instanceId) continue;
    const arr = map.get(f.definitionId) ?? [];
    arr.push(f.value);
    map.set(f.definitionId, arr);
  }
  return map;
}

// ── Collection instances (e.g. firewall rules) ──

interface Instance {
  /** Rule name (from the `<root>_name` leaf) — also the cross-version match key. */
  name: string;
  leaves: FlatSetting[];
}

/** Group a policy's groupCollection leaves into instances, keyed by collection
 *  definitionId. Each instance keeps its own leaves (one `_name`, `_action`, …). */
function instancesByCollection(leaves: FlatSetting[]): Map<string, Instance[]> {
  const byInstance = new Map<string, FlatSetting[]>();
  const order: string[] = [];
  for (const f of leaves) {
    if (!f.instanceId) continue;
    let arr = byInstance.get(f.instanceId);
    if (!arr) { arr = []; byInstance.set(f.instanceId, arr); order.push(f.instanceId); }
    arr.push(f);
  }
  const byCollection = new Map<string, Instance[]>();
  for (const instanceId of order) {
    const instLeaves = byInstance.get(instanceId)!;
    const collectionId = instanceId.slice(0, instanceId.lastIndexOf('#'));
    const nameLeaf = instLeaves.find((l) => l.definitionId === `${collectionId}_name`);
    const name =
      nameLeaf && nameLeaf.value.type === 'simple' && nameLeaf.value.value != null
        ? String(nameLeaf.value.value)
        : instanceId;
    const arr = byCollection.get(collectionId) ?? [];
    arr.push({ name, leaves: instLeaves });
    byCollection.set(collectionId, arr);
  }
  return byCollection;
}

function fingerprint(inst: Instance): Set<string> {
  return new Set(inst.leaves.map((l) => `${l.definitionId}=${canonical(l.value)}`));
}

/** Match base↔compare instances: exact name first, then best similarity. */
function matchInstances(
  base: Instance[],
  compare: Instance[]
): { pairs: Array<[Instance, Instance]>; added: Instance[]; removed: Instance[] } {
  const left = new Set(base);
  const right = new Set(compare);
  const pairs: Array<[Instance, Instance]> = [];

  // Tier 1: exact name.
  const byName = new Map<string, Instance>();
  for (const c of right) byName.set(c.name, c);
  for (const b of [...left]) {
    const c = byName.get(b.name);
    if (c && right.has(c)) {
      pairs.push([b, c]);
      left.delete(b);
      right.delete(c);
    }
  }

  // Tier 2: best Jaccard over setting fingerprints (catches name-only changes).
  for (const b of [...left]) {
    const fb = fingerprint(b);
    let best: { c: Instance; sim: number } | null = null;
    for (const c of right) {
      const sim = jaccard(fb, fingerprint(c));
      if (sim >= INSTANCE_MIN_JACCARD && (!best || sim > best.sim)) best = { c, sim };
    }
    if (best) {
      pairs.push([b, best.c]);
      left.delete(b);
      right.delete(best.c);
    }
  }

  return { pairs, added: [...right], removed: [...left] };
}

/** Diff one matched instance pair; changes tagged with the (compare) rule name. */
function diffInstancePair(base: Instance, compare: Instance): SettingChange[] {
  const instanceId = compare.name || base.name;
  const bm = new Map<string, OIBValue>();
  for (const l of base.leaves) bm.set(l.definitionId, l.value);
  const cm = new Map<string, OIBValue>();
  for (const l of compare.leaves) cm.set(l.definitionId, l.value);

  const changes: SettingChange[] = [];
  for (const [id, cv] of cm) {
    if (!bm.has(id)) changes.push({ kind: 'added', definitionId: id, compareValue: cv, instanceId });
    else if (canonical(bm.get(id)!) !== canonical(cv))
      changes.push({ kind: 'changed', definitionId: id, baseValue: bm.get(id)!, compareValue: cv, instanceId });
  }
  for (const [id, bv] of bm) {
    if (!cm.has(id)) changes.push({ kind: 'removed', definitionId: id, baseValue: bv, instanceId });
  }
  return changes;
}

/** Every leaf of an added/removed instance, as change records. */
function instanceAllAs(inst: Instance, kind: 'added' | 'removed'): SettingChange[] {
  return inst.leaves.map((l) =>
    kind === 'added'
      ? { kind, definitionId: l.definitionId, compareValue: l.value, instanceId: inst.name }
      : { kind, definitionId: l.definitionId, baseValue: l.value, instanceId: inst.name }
  );
}

/** Instance-aware diff of all groupCollections shared by two policies. */
function diffInstances(baseLeaves: FlatSetting[], compareLeaves: FlatSetting[]): SettingChange[] {
  const baseColl = instancesByCollection(baseLeaves);
  const compColl = instancesByCollection(compareLeaves);
  const changes: SettingChange[] = [];
  for (const collectionId of new Set([...baseColl.keys(), ...compColl.keys()])) {
    const { pairs, added, removed } = matchInstances(
      baseColl.get(collectionId) ?? [],
      compColl.get(collectionId) ?? []
    );
    for (const [b, c] of pairs) changes.push(...diffInstancePair(b, c));
    for (const c of added) changes.push(...instanceAllAs(c, 'added'));
    for (const b of removed) changes.push(...instanceAllAs(b, 'removed'));
  }
  return changes;
}

/** Order-independent canonical form so collection reordering isn't a "change". */
function canonical(v: OIBValue): string {
  switch (v.type) {
    case 'choice':
      return `choice:${v.optionId}` + (v.children ? `[${v.children.map((c) => c.definitionId + '=' + canonical(c.value)).sort().join(',')}]` : '');
    case 'simple':
      return `simple:${String(v.value)}`;
    case 'choiceCollection':
      return `choiceC:${[...v.optionIds].sort().join(',')}`;
    case 'simpleCollection':
      return `simpleC:${v.values.map(String).sort().join(',')}`;
    default:
      return v.type;
  }
}

function valuesEqual(a: OIBValue[], b: OIBValue[]): boolean {
  const ca = a.map(canonical).sort();
  const cb = b.map(canonical).sort();
  return ca.length === cb.length && ca.every((x, i) => x === cb[i]);
}

function diffSettings(base: OIBPolicy, compare: OIBPolicy): SettingChange[] {
  const baseLeaves = flattenOIBSettings(base.settings);
  const compareLeaves = flattenOIBSettings(compare.settings);
  const bm = settingMap(baseLeaves);
  const cm = settingMap(compareLeaves);
  const changes: SettingChange[] = [];

  // Non-collection settings: compare by definitionId.
  for (const [id, cVals] of cm) {
    if (!bm.has(id)) {
      changes.push({ kind: 'added', definitionId: id, compareValue: cVals[0] });
    } else if (!valuesEqual(bm.get(id)!, cVals)) {
      changes.push({ kind: 'changed', definitionId: id, baseValue: bm.get(id)![0], compareValue: cVals[0] });
    }
  }
  for (const [id, bVals] of bm) {
    if (!cm.has(id)) changes.push({ kind: 'removed', definitionId: id, baseValue: bVals[0] });
  }

  // Collection instances (firewall rules, …): matched and diffed per instance.
  changes.push(...diffInstances(baseLeaves, compareLeaves));
  return changes;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function settingIds(p: OIBPolicy): Set<string> {
  return new Set(flattenOIBSettings(p.settings).map((f) => f.definitionId));
}

/** Every setting of a wholly added/removed policy, as change records. Non-instance
 *  leaves are deduped by id; collection instances are emitted per rule (tagged). */
function allSettingsAs(p: OIBPolicy, kind: 'added' | 'removed'): SettingChange[] {
  const leaves = flattenOIBSettings(p.settings);
  const seen = new Set<string>();
  const out: SettingChange[] = [];
  for (const f of leaves) {
    if (f.instanceId) continue;
    if (seen.has(f.definitionId)) continue;
    seen.add(f.definitionId);
    out.push(
      kind === 'added'
        ? { kind, definitionId: f.definitionId, compareValue: f.value }
        : { kind, definitionId: f.definitionId, baseValue: f.value }
    );
  }
  for (const insts of instancesByCollection(leaves).values()) {
    for (const inst of insts) out.push(...instanceAllAs(inst, kind));
  }
  return out;
}

// ── Main diff ──

export function diffVersions(
  baseTag: string,
  basePolicies: OIBPolicy[],
  compareTag: string,
  comparePolicies: OIBPolicy[]
): VersionDiff {
  const baseLeft = new Set(basePolicies);
  const compareLeft = new Set(comparePolicies);
  const pairs: Array<{ base: OIBPolicy; compare: OIBPolicy; matchedBy: 'oibId' | 'title' | 'fuzzy'; similarity?: number }> = [];

  // Tier 1: oibId
  const byId = new Map<string, OIBPolicy>();
  for (const c of compareLeft) if (c.oibId) byId.set(c.oibId, c);
  for (const b of [...baseLeft]) {
    if (b.oibId && byId.has(b.oibId)) {
      const c = byId.get(b.oibId)!;
      pairs.push({ base: b, compare: c, matchedBy: 'oibId' });
      baseLeft.delete(b);
      compareLeft.delete(c);
    }
  }

  // Tier 2: version-stripped title
  const byTitle = new Map<string, OIBPolicy>();
  for (const c of compareLeft) byTitle.set(titleKey(c), c);
  for (const b of [...baseLeft]) {
    const c = byTitle.get(titleKey(b));
    if (c && compareLeft.has(c)) {
      pairs.push({ base: b, compare: c, matchedBy: 'title' });
      baseLeft.delete(b);
      compareLeft.delete(c);
    }
  }

  // Tier 3: fuzzy — greedy best Jaccard with a shared title token.
  for (const b of [...baseLeft]) {
    const bIds = settingIds(b);
    const bTokens = titleTokens(b);
    let best: { c: OIBPolicy; sim: number } | null = null;
    for (const c of compareLeft) {
      const shareToken = [...bTokens].some((t) => titleTokens(c).has(t));
      if (!shareToken) continue;
      const sim = jaccard(bIds, settingIds(c));
      if (sim >= FUZZY_MIN_JACCARD && (!best || sim > best.sim)) best = { c, sim };
    }
    if (best) {
      pairs.push({ base: b, compare: best.c, matchedBy: 'fuzzy', similarity: best.sim });
      baseLeft.delete(b);
      compareLeft.delete(best.c);
    }
  }

  const policies: PolicyDiff[] = [];

  for (const { base, compare, matchedBy, similarity } of pairs) {
    const changes = diffSettings(base, compare);
    const renamed = base.name !== compare.name && titleKey(base) !== titleKey(compare);
    if (changes.length === 0 && !renamed) continue; // unchanged — omit
    const { label, category } = displayLabel(compare);
    policies.push({
      kind: renamed ? 'renamed' : 'modified',
      label,
      category,
      baseName: base.name,
      compareName: compare.name,
      githubUrl: compare.githubUrl,
      matchedBy,
      similarity,
      settingChanges: changes,
      addedCount: changes.filter((c) => c.kind === 'added').length,
      removedCount: changes.filter((c) => c.kind === 'removed').length,
      changedCount: changes.filter((c) => c.kind === 'changed').length,
    });
  }

  for (const c of compareLeft) {
    const { label, category } = displayLabel(c);
    const changes = allSettingsAs(c, 'added');
    policies.push({ kind: 'added', label, category, compareName: c.name, githubUrl: c.githubUrl, settingChanges: changes, addedCount: changes.length, removedCount: 0, changedCount: 0 });
  }
  for (const b of baseLeft) {
    const { label, category } = displayLabel(b);
    const changes = allSettingsAs(b, 'removed');
    policies.push({ kind: 'removed', label, category, baseName: b.name, githubUrl: b.githubUrl, settingChanges: changes, addedCount: 0, removedCount: changes.length, changedCount: 0 });
  }

  return {
    baseTag,
    compareTag,
    counts: {
      added: policies.filter((p) => p.kind === 'added').length,
      removed: policies.filter((p) => p.kind === 'removed').length,
      renamed: policies.filter((p) => p.kind === 'renamed').length,
      modified: policies.filter((p) => p.kind === 'modified').length,
    },
    policies,
  };
}
