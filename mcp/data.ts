// Typed loaders for every dataset the tools read, plus memoised indexes.
// Indexes are memoised per loaded data object, so an ETag refresh that swaps the data
// in source.ts drops the stale indexes automatically.
import { source } from './source.ts';
import type { SettingDefinition, SettingCategory, CategoryTreeNode, ChangelogEntry, ChangelogSummary } from '../src/lib/types.ts';
import type { BaselineIndex, BaselineShard } from '../src/lib/baseline-types.ts';
import type { OIBOutput } from '../src/lib/oib-types.ts';
import type { OIBVersionIndex, OIBVersionShard } from '../src/lib/oib-changelog-types.ts';
import type { ComplianceTemplatesFile } from '../src/lib/compliance-types.ts';

const derived = new WeakMap<object, Map<string, unknown>>();
function memoOn<T>(obj: object, key: string, build: () => T): T {
  let m = derived.get(obj);
  if (!m) derived.set(obj, (m = new Map()));
  if (!m.has(key)) m.set(key, build());
  return m.get(key) as T;
}

// ponytail: full settings.json kept in memory (a few hundred MB); a CI-built slim bundle is the upgrade path.
export const settings = () => source.json<SettingDefinition[]>('data/settings.json');

export async function settingIndex() {
  const all = await settings();
  return memoOn(all, 'index', () => {
    const byId = new Map(all.map((s) => [s.id, s]));
    const children = new Map<string, SettingDefinition[]>();
    for (const s of all) {
      for (const d of s.dependentOn ?? []) {
        const list = children.get(d.parentSettingId) ?? [];
        list.push(s);
        children.set(d.parentSettingId, list);
      }
    }
    return { all, byId, children };
  });
}

export const categories = () => source.json<SettingCategory[]>('data/categories.json');
export const categoryTree = () => source.json<CategoryTreeNode[]>('data/category-tree.json');
export async function categoryById() {
  const cats = await categories();
  return memoOn(cats, 'byId', () => new Map(cats.map((c) => [c.id, c])));
}
export const lastUpdated = () => source.json<{ date: string }>('data/last-updated.json');
export const changelog = () => source.json<ChangelogEntry[]>('data/changelog.json');
export const changelogSummaries = () => source.json<Record<string, ChangelogSummary>>('data/changelog-summaries.json');
export const complianceTemplates = () => source.json<ComplianceTemplatesFile>('data/compliance-templates.json');
export const baselineIndex = () => source.json<BaselineIndex>('public/baselines/index.json');
export const baselineShard = (versionId: string) => source.json<BaselineShard>(`public/baselines/${versionId}.json`);
export const oibCurrent = () => source.json<OIBOutput>('public/oib-data.json');
export const oibVersionIndex = () => source.json<OIBVersionIndex>('public/oib-versions/index.json');
export const oibVersion = (tag: string) => source.json<OIBVersionShard>(`public/oib-versions/${tag}.json`);

/** Every baseline shard (all families, all versions). Deliberately eager — get_setting's
 *  cross-reference needs them all. A shard that fails to load is skipped, not fatal. */
export async function allBaselineShards(): Promise<BaselineShard[]> {
  const idx = await baselineIndex();
  const results = await Promise.allSettled(idx.families.flatMap((f) => f.versions.map((v) => baselineShard(v.id))));
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}
