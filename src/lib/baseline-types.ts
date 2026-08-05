// ── Microsoft Security Baseline types ──
// Mirrors the output of scripts/fetch-baselines.ts (public/baselines/*.json).
// Keep in sync if the fetch script shape changes.

/** Index shape written to public/baselines/index.json. */
export interface BaselineIndex {
  generatedAt: string;
  families: BaselineFamily[];
}

export interface BaselineFamily {
  /** Stable family GUID; version ids are `{baseId}_{n}`. */
  baseId: string;
  displayName: string;
  platforms: string;
  technologies: string;
  /** Newest first. */
  versions: BaselineVersionMeta[];
}

export interface BaselineVersionMeta {
  id: string;
  /** Friendly name from Graph ("Version 24H2") — always show this, never the numeric suffix. */
  displayVersion: string;
  lifecycleState: string;
  settingCount: number;
}

/** Shape of each public/baselines/{id}.json shard. */
export interface BaselineShard {
  id: string;
  baseId: string;
  displayName: string;
  displayVersion: string;
  lifecycleState: string;
  settings: BaselineSetting[];
}

/** One setting with its resolved default value. Template-reference noise
 *  (settingInstanceTemplateId / settingValueTemplateReference / …) is stripped
 *  at fetch time, so diffing these shards on settingDefinitionId is safe. */
export interface BaselineSetting {
  settingDefinitionId: string;
  /** Catalog displayName, or the raw definition id as fallback. */
  displayName: string;
  description?: string;
  /** Resolved default value as display text (option name / constant / joined list). */
  value?: string;
  /** Raw option id behind a choice default — lets SettingRow highlight the selection. */
  optionId?: string;
  /** Raw option ids behind a choiceCollection default. */
  optionIds?: string[];
  /** Settings-catalog category name (top-level settings only). */
  category?: string;
  /** Nested settings for choice children and group/collection types (recursive). */
  children?: BaselineSetting[];
}

/** Active version if present, else the newest. */
export function defaultVersion(family: BaselineFamily): BaselineVersionMeta | undefined {
  return family.versions.find((v) => v.lifecycleState === 'active') ?? family.versions[0];
}
