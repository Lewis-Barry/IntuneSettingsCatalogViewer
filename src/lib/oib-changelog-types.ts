// ── OIB Changelog (version diff) types ──
// Produced by src/lib/oib-diff.ts, consumed by the /baseline/changelog page.

import type { OIBValue } from './oib-types';

/** Index shape written to public/oib-versions/index.json by fetch-oib-data.ts. */
export interface OIBVersionIndex {
  generatedAt: string;
  oibCommitSha: string;
  platforms: OIBPlatformVersions[];
}

export interface OIBPlatformVersions {
  folder: string;
  label: string;
  /** Newest first. */
  versions: OIBVersionMeta[];
}

export interface OIBVersionMeta {
  tag: string;
  version: string;
  date: string;
  policyCount: number;
}

/** Shape of each public/oib-versions/<tag>.json shard. */
export interface OIBVersionShard {
  tag: string;
  folder: string;
  version: string;
  date: string;
  policies: import('./oib-types').OIBPolicy[];
}

export type PolicyChangeKind = 'added' | 'removed' | 'renamed' | 'modified';
export type SettingChangeKind = 'added' | 'removed' | 'changed';

export interface SettingChange {
  kind: SettingChangeKind;
  definitionId: string;
  baseValue?: OIBValue;
  compareValue?: OIBValue;
  /** For settings inside a groupCollection instance (e.g. a firewall rule), the
   *  instance's identity — its rule name. Lets the viewer group changes per rule
   *  and label the group, even when the name itself didn't change. */
  instanceId?: string;
}

export interface PolicyDiff {
  kind: PolicyChangeKind;
  /** Display label (version-stripped) for grouping/headers. */
  label: string;
  category: string;
  /** Policy name in the base version (undefined for added). */
  baseName?: string;
  /** Policy name in the compare version (undefined for removed). */
  compareName?: string;
  githubUrl?: string;
  /** How the two sides were matched. */
  matchedBy?: 'oibId' | 'title' | 'fuzzy';
  /** Jaccard similarity over setting ids, present for fuzzy matches. */
  similarity?: number;
  settingChanges: SettingChange[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
}

export interface VersionDiff {
  baseTag: string;
  compareTag: string;
  counts: { added: number; removed: number; renamed: number; modified: number };
  policies: PolicyDiff[];
}
