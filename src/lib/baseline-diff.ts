// ── Microsoft Security Baseline version diff engine ──
// Pure functions (no DOM, no fetch) so they run both in the browser and in the
// build-time self-check (scripts/baseline-diff-check.ts).
//
// Settings are keyed on settingDefinitionId. Template-version noise
// (settingInstanceTemplateId / settingValueTemplateReference — which differ
// between versions by design) never reaches the shards: fetch-baselines.ts
// keeps only settingDefinitionId + resolved values, so comparing the
// normalized value trees is free of template-id noise by construction.
//
// Changed group/collection containers are split into per-child changes (like
// the OIB diff, which works at leaf level) — a 12-rule ASR group that gained
// one rule yields one small "added" row, not one giant "changed" row.

import type { BaselineSetting } from './baseline-types';

export type BaselineChangeKind = 'added' | 'removed' | 'changed';

export interface BaselineSettingChange {
  kind: BaselineChangeKind;
  settingDefinitionId: string;
  /** Base-side setting (undefined for added). */
  base?: BaselineSetting;
  /** Compare-side setting (undefined for removed). */
  compare?: BaselineSetting;
  /** Display name of the enclosing group when this is a container child. */
  parent?: string;
  /** Settings-catalog category (inherited from the top-level setting). */
  category?: string;
}

export interface BaselineDiff {
  counts: Record<BaselineChangeKind, number>;
  changes: BaselineSettingChange[];
}

/** Order-independent canonical default-value form. Display names are excluded
 *  (a renamed catalog entry isn't a changed default); synthetic collection
 *  instance indices (`#n`) are stripped so reordering isn't a change. */
function canonical(s: BaselineSetting): string {
  const id = s.settingDefinitionId.replace(/#\d+$/, '');
  const kids = (s.children ?? []).map(canonical).sort().join(',');
  return `${id}=${s.value ?? ''}[${kids}]`;
}

/** Group/groupCollection containers carry children but no value of their own. */
const isContainer = (s: BaselineSetting) =>
  !!s.children?.length && s.value === undefined && !s.optionId && !s.optionIds;

/** Multi-instance collections (pre-populated firewall rules) have synthetic
 *  `#n` children — instance identity is positional, so they diff whole. */
const hasSyntheticChildren = (s: BaselineSetting) =>
  !!s.children?.some((c) => c.settingDefinitionId.includes('#'));

function diffLists(
  base: BaselineSetting[],
  compare: BaselineSetting[],
  out: BaselineSettingChange[],
  parent: string | undefined,
  category: string | undefined
) {
  const bm = new Map(base.map((s) => [s.settingDefinitionId, s]));
  const cm = new Map(compare.map((s) => [s.settingDefinitionId, s]));

  for (const [id, c] of cm) {
    const cat = c.category ?? category;
    const b = bm.get(id);
    if (!b) {
      out.push({ kind: 'added', settingDefinitionId: id, compare: c, parent, category: cat });
    } else if (canonical(b) !== canonical(c)) {
      if (isContainer(b) && isContainer(c) && !hasSyntheticChildren(b) && !hasSyntheticChildren(c)) {
        diffLists(b.children!, c.children!, out, c.displayName, cat);
      } else {
        out.push({ kind: 'changed', settingDefinitionId: id, base: b, compare: c, parent, category: cat });
      }
    }
  }
  for (const [id, b] of bm) {
    if (!cm.has(id)) {
      out.push({ kind: 'removed', settingDefinitionId: id, base: b, parent, category: b.category ?? category });
    }
  }
}

export function diffBaselineVersions(
  base: BaselineSetting[],
  compare: BaselineSetting[]
): BaselineDiff {
  const changes: BaselineSettingChange[] = [];
  diffLists(base, compare, changes, undefined, undefined);

  const name = (c: BaselineSettingChange) => (c.compare ?? c.base)?.displayName ?? c.settingDefinitionId;
  changes.sort((a, b) => name(a).localeCompare(name(b)));

  return {
    counts: {
      added: changes.filter((c) => c.kind === 'added').length,
      removed: changes.filter((c) => c.kind === 'removed').length,
      changed: changes.filter((c) => c.kind === 'changed').length,
    },
    changes,
  };
}
