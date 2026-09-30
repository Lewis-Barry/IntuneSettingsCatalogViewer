'use client';

import { loadBrowserJson, loadSettingDefinitions } from '@/lib/browser-data';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { selectClass } from '@/lib/pill';
import { basePath } from '@/lib/basePath';
import SettingRow from './SettingRow';
import { downloadTextFile, SETTING_KIND } from './ExportMenu';
import VersionDiffView, { useDiffView, LoadStatus, ChangeBadge, CategorySection, ChangeCard } from './VersionDiffView';
import {
  defaultVersion,
  type BaselineIndex,
  type BaselineFamily,
  type BaselineSetting,
  type BaselineShard,
} from '@/lib/baseline-types';
import { diffBaselineVersions, type BaselineChangeKind } from '@/lib/baseline-diff';
import { valueText, generateBaselineChangelogCsv, generateBaselineChangelogHtml } from '@/lib/baseline-export';
import type { SettingDefinition } from '@/lib/types';

const KIND_ORDER: BaselineChangeKind[] = ['added', 'removed', 'changed'];

/** Map a baseline setting's default to SettingRow's active-value props. */
function activeFrom(s?: BaselineSetting): { activeOptionIds?: string[]; activeSimpleValue?: string } {
  if (!s) return {};
  if (s.optionId) return { activeOptionIds: [s.optionId] };
  if (s.optionIds) return { activeOptionIds: s.optionIds };
  if (s.value != null) return { activeSimpleValue: s.value };
  return {};
}

// ── Component ──

export default function BaselineChangelogViewer() {
  const [index, setIndex] = useState<BaselineIndex | null>(null);
  const [defsMap, setDefsMap] = useState<Map<string, SettingDefinition>>(new Map());
  const [shards, setShards] = useState<Map<string, BaselineShard>>(new Map());
  const [baseId, setBaseId] = useState<string | null>(null);
  const [baseVersionId, setBaseVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = useDiffView<BaselineChangeKind>(`${baseId}|${baseVersionId}|${compareVersionId}`);
  const { expanded, kindFilter, query } = view;

  // Load index + setting definitions.
  useEffect(() => {
    fetch(`${basePath}/baselines/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`index.json: ${r.status}`);
        return r.json() as Promise<BaselineIndex>;
      })
      .then((idx) => {
        setIndex(idx);
        // Default to the first family with something to compare.
        const first = idx.families.find((f) => f.versions.length >= 2) ?? idx.families[0];
        if (first) setBaseId(first.baseId);
      })
      .catch((e) => setError(String(e)));

    loadSettingDefinitions('baselines')
      .then(setDefsMap)
      .catch(() => {/* names degrade to the shard's own displayName */});
  }, []);

  const family: BaselineFamily | null = useMemo(
    () => index?.families.find((f) => f.baseId === baseId) ?? null,
    [index, baseId]
  );

  // Default the two versions when the family changes: previous → active/newest.
  useEffect(() => {
    if (!family) return;
    const v = family.versions; // newest first
    const compare = defaultVersion(family) ?? v[0];
    const base = v.find((x) => x !== compare) ?? compare;
    setCompareVersionId(compare?.id ?? null);
    setBaseVersionId(base?.id ?? null);
  }, [family]);


  // Lazily fetch the two selected shards.
  const ensureShard = useCallback(
    (id: string | null) => {
      if (!id || shards.has(id)) return;
      loadBrowserJson<BaselineShard>(`baselines/${id}.json`)
        .then((shard) => setShards((prev) => prev.has(id) ? prev : new Map(prev).set(id, shard)))
        .catch((e) => setError(String(e)));
    },
    [shards]
  );

  useEffect(() => {
    ensureShard(baseVersionId);
    ensureShard(compareVersionId);
  }, [baseVersionId, compareVersionId, ensureShard]);

  const baseShard = baseVersionId ? shards.get(baseVersionId) : undefined;
  const compareShard = compareVersionId ? shards.get(compareVersionId) : undefined;

  const diff = useMemo(() => {
    if (!baseShard || !compareShard) return null;
    return diffBaselineVersions(baseShard.settings, compareShard.settings);
  }, [baseShard, compareShard]);

  const visibleChanges = useMemo(() => {
    if (!diff) return [];
    const q = query.trim().toLowerCase();
    return diff.changes.filter((c) => {
      if (kindFilter.size > 0 && !kindFilter.has(c.kind)) return false;
      if (q) {
        const s = c.compare ?? c.base;
        const hay = `${s?.displayName ?? ''} ${c.settingDefinitionId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [diff, kindFilter, query]);

  // Group visible changes by settings-catalog category (kinds first within
  // each category) — same section shape as the OIB changelog.
  const grouped = useMemo(
    () =>
      [...Map.groupBy(visibleChanges, (c) => c.category ?? 'Other')]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, changes]) => ({
          category,
          changes: changes.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
        })),
    [visibleChanges]
  );

  const expandAll = () => {
    const next = new Set<string>();
    for (const { category, changes } of grouped) {
      for (const c of changes) {
        const s = c.compare ?? c.base;
        if (defsMap.has(c.settingDefinitionId) || s?.description) {
          next.add(`${category}|${c.settingDefinitionId}|${c.kind}`);
        }
      }
    }
    view.setExpanded(next);
  };

  const versionLabel = (id: string | null) =>
    family?.versions.find((v) => v.id === id)?.displayVersion ?? '';

  const downloadExport = (format: 'html' | 'csv') => {
    if (!diff || !family) return;
    const opts = {
      diff,
      familyName: family.displayName,
      baseVersionLabel: versionLabel(baseVersionId),
      compareVersionLabel: versionLabel(compareVersionId),
    };
    const content = format === 'html' ? generateBaselineChangelogHtml(opts) : generateBaselineChangelogCsv(opts);
    const safe = `${family.displayName}-${opts.baseVersionLabel}-to-${opts.compareVersionLabel}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    downloadTextFile(`ms-baseline-changelog-${safe}.${format}`, content, format);
  };

  if (error || !index) return <LoadStatus error={error} />;

  return (
    <VersionDiffView
      title="Security Baseline Changelog"
      intro="Compare any two versions of a Microsoft security baseline — see which setting defaults were added, removed, or changed."
      pickerLabel="Baseline"
      picker={
        <>
          <label htmlFor="baseline-changelog-family" className="sr-only">Baseline family</label>
          <select
            id="baseline-changelog-family"
            value={baseId ?? ''}
            onChange={(e) => setBaseId(e.target.value)}
            className={selectClass}
          >
            {index.families.map((f) => (
              <option key={f.baseId} value={f.baseId}>
                {f.displayName} ({f.versions.length})
              </option>
            ))}
          </select>
        </>
      }
      idPrefix="baseline"
      versions={family?.versions.map((v) => ({ id: v.id, label: v.displayVersion })) ?? []}
      baseId={baseVersionId}
      compareId={compareVersionId}
      onBaseChange={setBaseVersionId}
      onCompareChange={setCompareVersionId}
      onExport={downloadExport}
      subject={family?.displayName}
      summary={
        diff && family && {
          heading: `${versionLabel(baseVersionId)} → ${versionLabel(compareVersionId)}`,
          detail: `${family.displayName} · ${diff.changes.length} changed ${diff.changes.length === 1 ? 'setting' : 'settings'}`,
          counts: diff.counts,
          total: diff.changes.length,
        }
      }
      kinds={KIND_ORDER}
      noun={['setting', 'settings']}
      view={view}
      visibleCount={visibleChanges.length}
      categoryCount={grouped.length}
      onExpandAll={expandAll}
    >
      {grouped.map(({ category, changes }) => (
        <CategorySection key={category} category={category} kinds={KIND_ORDER} items={changes} noun={['setting', 'settings']}>
          {changes.map((c) => {
            const key = `${category}|${c.settingDefinitionId}|${c.kind}`;
            const def = defsMap.get(c.settingDefinitionId);
            const s = (c.compare ?? c.base)!;
            const src = c.kind === 'removed' ? c.base : c.compare;
            const srcVersion = c.kind === 'removed' ? versionLabel(baseVersionId) : versionLabel(compareVersionId);
            return (
              <ChangeCard
                key={key}
                kind={c.kind}
                expandable={!!def || !!s.description}
                open={expanded.has(key)}
                onToggle={() => view.toggle(key)}
                title={s.displayName}
                body={() =>
                  def ? (
                    <div className={`border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
                      <SettingRow
                        setting={def}
                        valueBadge={<ChangeBadge kind={c.kind} base={valueText(c.base)} compare={valueText(c.compare)} />}
                        {...activeFrom(src)}
                        activeLabel={`Baseline ${srcVersion}`}
                        disambiguationLabel={c.parent}
                        hideScope
                      />
                    </div>
                  ) : (
                    <div className="px-4 py-3 pl-12">
                      {s.description && (
                        <p className="text-fluent-sm text-fluent-text-secondary whitespace-pre-line mb-2">{s.description}</p>
                      )}
                      <p className="font-mono text-[12px] text-fluent-text-secondary break-all">{c.settingDefinitionId}</p>
                    </div>
                  )
                }
              >
                {c.parent && (
                  <span className="hidden md:inline text-fluent-xs text-fluent-text-secondary truncate max-w-[40%]">
                    {c.parent}
                  </span>
                )}
                <span className="hidden md:inline text-fluent-xs text-fluent-text-secondary truncate max-w-[40%]">
                  {c.kind === 'changed' ? (
                    <><span className="line-through">{valueText(c.base)}</span> → {valueText(c.compare)}</>
                  ) : c.kind === 'removed' ? (
                    valueText(c.base)
                  ) : (
                    valueText(c.compare)
                  )}
                </span>
              </ChangeCard>
            );
          })}
        </CategorySection>
      ))}
    </VersionDiffView>
  );
}
