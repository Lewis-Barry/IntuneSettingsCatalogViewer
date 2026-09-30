'use client';

import { loadBrowserJson, loadSettingDefinitions } from '@/lib/browser-data';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { pillClass } from '@/lib/pill';
import { basePath } from '@/lib/basePath';
import { PLATFORM_ICONS } from './PlatformIcons';
import SettingRow from './SettingRow';
import { downloadTextFile, Chevron, SETTING_KIND } from './ExportMenu';
import VersionDiffView, { useDiffView, LoadStatus, ChangeBadge, CategorySection, ChangeCard } from './VersionDiffView';
import { diffVersions } from '@/lib/oib-diff';
import { generateOIBChangelogHtml } from '@/lib/oib-html-export';
import { generateOIBChangelogCsv } from '@/lib/oib-csv-export';
import { fmtValue } from '@/lib/oib-export-shared';
import { groupByRoot, instanceName } from '@/lib/oib-types';
import type { OIBValue } from '@/lib/oib-types';
import type {
  OIBVersionIndex,
  OIBVersionShard,
  PolicyChangeKind,
  PolicyDiff,
  SettingChange,
} from '@/lib/oib-changelog-types';
import type { SettingDefinition } from '@/lib/types';

// OIB folder → home-page platform-icon key.
const FOLDER_ICON: Record<string, string> = {
  WINDOWS: 'windows10',
  MACOS: 'macOS',
  WINDOWS365: 'windows10',
};

const KIND_ORDER: PolicyChangeKind[] = ['added', 'removed', 'modified', 'renamed'];

/** Display value with option ids resolved to names; '—' when empty. */
const fmt = (value: OIBValue | undefined, def?: SettingDefinition) => fmtValue(value, def) || '—';

/** Map an OIB value to SettingRow's active-value props (highlights the selection). */
function activeFrom(value?: OIBValue): { activeOptionIds?: string[]; activeSimpleValue?: string } {
  if (!value) return {};
  switch (value.type) {
    case 'choice':
      return { activeOptionIds: [value.optionId] };
    case 'choiceCollection':
      return { activeOptionIds: value.optionIds };
    case 'simple':
      return { activeSimpleValue: value.value == null ? undefined : String(value.value) };
    case 'simpleCollection':
      return { activeSimpleValue: value.values.map((v) => (v == null ? '' : String(v))).join(', ') };
    default:
      return {};
  }
}

/** Group policies by category (alphabetical), kinds first within each category. */
function groupByCategory(policies: PolicyDiff[]): { category: string; policies: PolicyDiff[] }[] {
  return [...Map.groupBy(policies, (p) => p.category)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, ps]) => ({
      category,
      policies: ps.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label)),
    }));
}

// ── Component ──

export default function OIBChangelogViewer() {
  const [index, setIndex] = useState<OIBVersionIndex | null>(null);
  const [defsMap, setDefsMap] = useState<Map<string, SettingDefinition>>(new Map());
  const [shards, setShards] = useState<Map<string, OIBVersionShard>>(new Map());
  const [folder, setFolder] = useState<string | null>(null);
  const [baseTag, setBaseTag] = useState<string | null>(null);
  const [compareTag, setCompareTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = useDiffView<PolicyChangeKind>(`${folder}|${baseTag}|${compareTag}`);
  const { expanded, kindFilter, query, toggle } = view;

  // Load index + setting definitions.
  useEffect(() => {
    fetch(`${basePath}/oib-versions/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`index.json: ${r.status}`);
        return r.json() as Promise<OIBVersionIndex>;
      })
      .then((idx) => {
        setIndex(idx);
        const first = idx.platforms[0];
        if (first) setFolder(first.folder);
      })
      .catch((e) => setError(String(e)));

    loadSettingDefinitions('oib')
      .then(setDefsMap)
      .catch(() => {/* names degrade to ids */});
  }, []);

  const platform = useMemo(
    () => index?.platforms.find((p) => p.folder === folder) ?? null,
    [index, folder]
  );

  // Default the two versions when the platform changes: newest vs previous.
  useEffect(() => {
    if (!platform) return;
    const v = platform.versions; // newest first
    setCompareTag(v[0]?.tag ?? null);
    setBaseTag(v[1]?.tag ?? v[0]?.tag ?? null);
  }, [platform]);

  // Lazily fetch the two selected shards.
  const ensureShard = useCallback(
    (tag: string | null) => {
      if (!tag || shards.has(tag)) return;
      loadBrowserJson<OIBVersionShard>(`oib-versions/${tag}.json`)
        .then((shard) => setShards((prev) => prev.has(tag) ? prev : new Map(prev).set(tag, shard)))
        .catch((e) => setError(String(e)));
    },
    [shards]
  );

  useEffect(() => {
    ensureShard(baseTag);
    ensureShard(compareTag);
  }, [baseTag, compareTag, ensureShard]);

  const baseShard = baseTag ? shards.get(baseTag) : undefined;
  const compareShard = compareTag ? shards.get(compareTag) : undefined;

  const diff = useMemo(() => {
    if (!baseShard || !compareShard || !baseTag || !compareTag) return null;
    return diffVersions(baseTag, baseShard.policies, compareTag, compareShard.policies);
  }, [baseShard, compareShard, baseTag, compareTag]);

  // Full grouping (unfiltered) — used by export so downloads always cover the
  // whole comparison, regardless of the on-screen filters.
  const groupedAll = useMemo(() => {
    if (!diff) return [];
    return groupByCategory(diff.policies);
  }, [diff]);

  // Group result policies by category, applying kind + text filters.
  const grouped = useMemo(() => {
    if (!diff) return [];
    const q = query.trim().toLowerCase();
    return groupByCategory(diff.policies.filter((p) => {
      if (kindFilter.size > 0 && !kindFilter.has(p.kind)) return false;
      if (q) {
        const hay = `${p.label} ${p.baseName ?? ''} ${p.compareName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }));
  }, [diff, kindFilter, query]);

  const visibleCount = useMemo(
    () => grouped.reduce((n, g) => n + g.policies.length, 0),
    [grouped]
  );

  const expandAll = () => {
    const next = new Set<string>();
    for (const { category, policies } of grouped) {
      for (const p of policies) {
        if (p.settingChanges.length > 0) next.add(`${category}|${p.compareName ?? p.baseName}`);
      }
    }
    view.setExpanded(next);
  };

  const versionLabel = (tag: string | null) =>
    platform?.versions.find((v) => v.tag === tag)?.version ?? '';

  const versionDate = (tag: string | null) =>
    platform?.versions.find((v) => v.tag === tag)?.date ?? '';

  const downloadExport = (format: 'html' | 'csv') => {
    if (!diff || !platform || !baseTag || !compareTag) return;

    const baseVersionLabel = versionLabel(baseTag);
    const compareVersionLabel = versionLabel(compareTag);
    const content =
      format === 'html'
        ? generateOIBChangelogHtml({ diff, grouped: groupedAll, defsMap, platformLabel: platform.label, baseVersionLabel, compareVersionLabel })
        : generateOIBChangelogCsv({ grouped: groupedAll, defsMap, baseVersionLabel, compareVersionLabel });

    const safePlatform = platform.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadTextFile(`oib-changelog-${safePlatform}-v${baseVersionLabel}-to-v${compareVersionLabel}.${format}`, content, format);
  };

  if (error || !index) return <LoadStatus error={error} />;

  // Render a single setting change row (reused for grouped + ungrouped).
  const renderChange = (c: SettingChange) => {
    const def = defsMap.get(c.definitionId);
    const src = c.kind === 'removed' ? c.baseValue : c.compareValue;
    if (!def) {
      return (
        <div key={c.definitionId + c.kind} className={`flex items-center gap-3 px-4 py-2.5 border-b border-fluent-border border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
          <span className="flex-1 font-mono text-[12px] text-fluent-text-secondary truncate">{c.definitionId}</span>
          <ChangeBadge kind={c.kind} base={fmt(c.baseValue, def)} compare={fmt(c.compareValue, def)} />
        </div>
      );
    }
    const { activeOptionIds, activeSimpleValue } = activeFrom(src);
    const srcVersion = c.kind === 'removed' ? versionLabel(baseTag) : versionLabel(compareTag);
    return (
      <div key={c.definitionId + c.kind} className={`border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
        <SettingRow
          setting={def}
          valueBadge={<ChangeBadge kind={c.kind} base={fmt(c.baseValue, def)} compare={fmt(c.compareValue, def)} />}
          activeOptionIds={activeOptionIds}
          activeSimpleValue={activeSimpleValue}
          activeLabel={`OIB ${srcVersion}`}
          hideScope
        />
      </div>
    );
  };


  return (
    <VersionDiffView
      title="OIB Changelog"
      intro="Compare any two OpenIntuneBaseline versions — see which policies and settings changed."
      pickerLabel="Platform"
      picker={
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Platform">
          {index.platforms.map((p) => {
            const Icon = PLATFORM_ICONS[FOLDER_ICON[p.folder]];
            const active = p.folder === folder;
            return (
              <button
                key={p.folder}
                onClick={() => setFolder(p.folder)}
                aria-pressed={active}
                className={`${pillClass(active)} focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {p.label}
                <span className="opacity-60 text-fluent-xs">({p.versions.length})</span>
              </button>
            );
          })}
        </div>
      }
      idPrefix="oib"
      versions={platform?.versions.map((v) => ({ id: v.tag, label: `v${v.version} · ${v.date}` })) ?? []}
      baseId={baseTag}
      compareId={compareTag}
      onBaseChange={setBaseTag}
      onCompareChange={setCompareTag}
      onExport={downloadExport}
      subject={platform?.label}
      summary={
        diff && {
          heading: `v${versionLabel(baseTag)} → v${versionLabel(compareTag)}`,
          detail: `${versionDate(baseTag)} → ${versionDate(compareTag)} · ${diff.policies.length} changed ${diff.policies.length === 1 ? 'policy' : 'policies'}`,
          counts: diff.counts,
          total: diff.policies.length,
        }
      }
      kinds={KIND_ORDER}
      noun={['policy', 'policies']}
      view={view}
      visibleCount={visibleCount}
      categoryCount={grouped.length}
      onExpandAll={expandAll}
    >
      {grouped.map(({ category, policies }) => (
        <CategorySection key={category} category={category} kinds={KIND_ORDER} items={policies} noun={['policy', 'policies']}>
          {policies.map((p) => {
            const key = `${category}|${p.compareName ?? p.baseName}`;
            return (
              <ChangeCard
                key={key}
                kind={p.kind}
                expandable={p.settingChanges.length > 0}
                open={expanded.has(key)}
                onToggle={() => toggle(key)}
                title={(p.compareName ?? p.baseName ?? '').replace(/\s*-\s*v[\d.]+$/i, '')}
                body={() =>
                  // Expandable ⇒ settingChanges is non-empty.
                  groupByRoot(p.settingChanges, defsMap).map((g) => {
                    // Singletons (and groups with no known root) render flat.
                    if (!g.label) return g.members.map(renderChange);
                    const gkey = `${key}::${g.key}`;
                    const gOpen = expanded.has(gkey);
                    // Prefer the instance's rule name (carried on the change
                    // even when the name field itself didn't change).
                    const label =
                      g.members.find((c) => c.instanceId)?.instanceId ??
                      instanceName(g.rootId, g.members, (c) =>
                        c.kind === 'removed' ? c.baseValue : c.compareValue,
                      ) ??
                      g.label;
                    const added = g.members.filter((m) => m.kind === 'added').length;
                    const removed = g.members.filter((m) => m.kind === 'removed').length;
                    const changed = g.members.filter((m) => m.kind === 'changed').length;
                    return (
                      <div key={gkey} className="border-b border-fluent-border">
                        <button
                          onClick={() => toggle(gkey)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-fluent-bg-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fluent-blue"
                          aria-expanded={gOpen}
                        >
                          <span className="w-3.5 flex items-center justify-center text-fluent-text-secondary shrink-0">
                            <Chevron open={gOpen} />
                          </span>
                          <span className="flex-1 text-fluent-sm font-medium text-fluent-text">{label}</span>
                          <span className="text-fluent-xs text-fluent-text-secondary tabular-nums shrink-0">
                            +{added} −{removed} ~{changed}
                          </span>
                        </button>
                        {gOpen && <div className="pl-3">{g.members.map(renderChange)}</div>}
                      </div>
                    );
                  })
                }
              >
                {p.kind === 'renamed' && (
                  <span className="hidden md:inline text-fluent-xs text-fluent-text-secondary truncate max-w-[40%]">
                    {p.baseName} → {p.compareName}
                    {p.matchedBy === 'fuzzy' && p.similarity != null && (
                      <span className="ml-1 opacity-70">({Math.round(p.similarity * 100)}% match)</span>
                    )}
                  </span>
                )}
                {(p.kind === 'modified' || p.kind === 'renamed') && p.settingChanges.length > 0 && (
                  <span className="text-fluent-xs shrink-0 tabular-nums flex items-center gap-2" aria-label={`${p.addedCount} settings added, ${p.removedCount} removed, ${p.changedCount} changed`}>
                    {p.addedCount > 0 && <span className="text-fluent-success" aria-hidden>+{p.addedCount}</span>}
                    {p.removedCount > 0 && <span className="text-fluent-error" aria-hidden>−{p.removedCount}</span>}
                    {p.changedCount > 0 && <span className="text-fluent-warning" aria-hidden>~{p.changedCount}</span>}
                  </span>
                )}
                {(p.kind === 'added' || p.kind === 'removed') && p.settingChanges.length > 0 && (
                  <span className="text-fluent-xs text-fluent-text-secondary shrink-0 tabular-nums">
                    {p.settingChanges.length} setting{p.settingChanges.length === 1 ? '' : 's'}
                  </span>
                )}
              </ChangeCard>
            );
          })}
        </CategorySection>
      ))}
    </VersionDiffView>
  );
}
