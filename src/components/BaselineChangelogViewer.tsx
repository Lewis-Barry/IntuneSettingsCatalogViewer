'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { basePath } from '@/lib/basePath';
import { selectClass } from '@/lib/pill';
import SettingRow from './SettingRow';
import ExportMenu, { downloadTextFile, Chevron, KindIcon, KIND, SETTING_KIND } from './ExportMenu';
import {
  defaultVersion,
  type BaselineIndex,
  type BaselineFamily,
  type BaselineSetting,
  type BaselineShard,
} from '@/lib/baseline-types';
import { diffBaselineVersions, type BaselineChangeKind, type BaselineSettingChange } from '@/lib/baseline-diff';
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

/** Change indicator for SettingRow's badge slot: pill on top, value below. */
function changeBadge(c: BaselineSettingChange): React.ReactNode {
  const k = SETTING_KIND[c.kind];
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-fluent-xs font-semibold border ${k.pill}`}>
        <span aria-hidden className="font-mono">{k.sym}</span>
        {k.label}
      </span>
      <span className="text-fluent-xs text-fluent-text-secondary break-words leading-snug">
        {c.kind === 'changed' ? (
          <><span className="line-through">{valueText(c.base)}</span> → <span className="text-fluent-text">{valueText(c.compare)}</span></>
        ) : c.kind === 'removed' ? (
          valueText(c.base)
        ) : (
          valueText(c.compare)
        )}
      </span>
    </div>
  );
}

/** Fallback row for the rare settings without a catalog definition — same
 *  layout as OIB's unresolved rows, plus an expandable description. */
function FallbackChangeRow({ c }: { c: BaselineSettingChange }) {
  const [open, setOpen] = useState(false);
  const s = (c.compare ?? c.base)!;
  const expandable = !!s.description;
  return (
    <div className={`border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
      <div
        className={`flex items-center gap-3 px-4 py-2.5 border-b border-fluent-border ${expandable ? 'cursor-pointer hover:bg-fluent-bg-alt/50' : ''} transition-colors`}
        onClick={() => expandable && setOpen(!open)}
        role="row"
        aria-expanded={expandable ? open : undefined}
      >
        <span className="w-5 flex items-center justify-center text-fluent-text-secondary flex-shrink-0">
          {expandable && <Chevron open={open} />}
        </span>
        <div className="flex-1 min-w-0">
          <span className="block text-fluent-base text-fluent-text truncate">{s.displayName}</span>
          {c.parent && (
            <span className="block text-fluent-xs text-fluent-text-tertiary truncate mt-0.5" title={c.parent}>
              {c.parent}
            </span>
          )}
        </div>
        <div className="hidden md:flex w-[24rem] justify-end">{changeBadge(c)}</div>
      </div>
      {open && (
        <div className="border-b border-fluent-border bg-fluent-bg px-4 py-3 pl-12">
          {s.description && (
            <p className="text-fluent-sm text-fluent-text-secondary whitespace-pre-line mb-2">{s.description}</p>
          )}
          <p className="font-mono text-[12px] text-fluent-text-secondary break-all">{c.settingDefinitionId}</p>
        </div>
      )}
    </div>
  );
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
  const [kindFilter, setKindFilter] = useState<Set<BaselineChangeKind>>(new Set());
  const [query, setQuery] = useState('');

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

    fetch(`${basePath}/settings-browse.json`)
      .then((r) => (r.ok ? (r.json() as Promise<SettingDefinition[]>) : []))
      .then((defs) => {
        const m = new Map<string, SettingDefinition>();
        for (const d of defs) m.set(d.id, d);
        setDefsMap(m);
      })
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

  // Reset view state whenever the comparison changes.
  useEffect(() => {
    setKindFilter(new Set());
    setQuery('');
  }, [baseId, baseVersionId, compareVersionId]);

  // Lazily fetch the two selected shards.
  const ensureShard = useCallback(
    (id: string | null) => {
      if (!id || shards.has(id)) return;
      fetch(`${basePath}/baselines/${id}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${id}.json: ${r.status}`);
          return r.json() as Promise<BaselineShard>;
        })
        .then((s) => setShards((prev) => new Map(prev).set(s.id, s)))
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
  const grouped = useMemo(() => {
    const order: Record<BaselineChangeKind, number> = { added: 0, removed: 1, changed: 2 };
    const byCat = new Map<string, BaselineSettingChange[]>();
    for (const c of visibleChanges) {
      const cat = c.category ?? 'Other';
      const arr = byCat.get(cat) ?? [];
      arr.push(c);
      byCat.set(cat, arr);
    }
    return [...byCat.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, changes]) => {
        const sorted = changes.slice().sort((a, b) => order[a.kind] - order[b.kind]);
        const kindCounts = {} as Record<BaselineChangeKind, number>;
        for (const c of sorted) kindCounts[c.kind] = (kindCounts[c.kind] ?? 0) + 1;
        return { category, changes: sorted, kindCounts };
      });
  }, [visibleChanges]);

  const toggleKind = (kind: BaselineChangeKind) =>
    setKindFilter((prev) => {
      const next = new Set(prev);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });

  const swap = () => {
    setBaseVersionId(compareVersionId);
    setCompareVersionId(baseVersionId);
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

  if (error) {
    return <p className="text-fluent-error text-fluent-base p-4">Failed to load baseline data: {error}</p>;
  }
  if (!index) {
    return (
      <div className="p-4 md:p-6" role="status" aria-live="polite">
        <p className="text-fluent-text-secondary text-fluent-base">Loading…</p>
      </div>
    );
  }

  // Render a single setting change row — SettingRow when the definition
  // resolves in the catalog, otherwise the fallback row.
  const renderChange = (c: BaselineSettingChange) => {
    const def = defsMap.get(c.settingDefinitionId);
    const src = c.kind === 'removed' ? c.base : c.compare;
    if (!def) {
      return <FallbackChangeRow key={c.settingDefinitionId + c.kind} c={c} />;
    }
    const { activeOptionIds, activeSimpleValue } = activeFrom(src);
    const srcVersion = c.kind === 'removed' ? versionLabel(baseVersionId) : versionLabel(compareVersionId);
    return (
      <div key={c.settingDefinitionId + c.kind} className={`border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
        <SettingRow
          setting={def}
          valueBadge={changeBadge(c)}
          wideValueBadge
          activeOptionIds={activeOptionIds}
          activeSimpleValue={activeSimpleValue}
          activeLabel={`Baseline ${srcVersion}`}
          disambiguationLabel={c.parent}
          hideScope
        />
      </div>
    );
  };

  const canCompare = family != null && family.versions.length >= 2;
  const filtering = kindFilter.size > 0 || query.trim() !== '';

  return (
    <div className="p-4 md:p-6">
      {/* ── Header ── */}
      <h1 className="text-fluent-2xl font-semibold text-fluent-text mb-1">Security Baseline Changelog</h1>
      <p className="text-fluent-base text-fluent-text-secondary mb-5">
        Compare any two versions of a Microsoft security baseline — see which setting defaults were
        added, removed, or changed.
      </p>

      {/* ── Controls: one card, two zones (baseline · versions+export) ── */}
      <div className="fluent-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* Baseline picker */}
          <fieldset className="min-w-0">
            <legend className="text-fluent-xs font-semibold uppercase tracking-wide text-fluent-text-secondary mb-1.5">
              Baseline
            </legend>
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
          </fieldset>

          {canCompare && (
            <>
              <div className="hidden sm:block w-px self-stretch bg-fluent-border" aria-hidden />

              {/* Version pair — reads left → right as a timeline */}
              <fieldset className="min-w-0">
                <legend className="text-fluent-xs font-semibold uppercase tracking-wide text-fluent-text-secondary mb-1.5">
                  Versions
                </legend>
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="baseline-base" className="sr-only">Base version (changes from)</label>
                  <select id="baseline-base" value={baseVersionId ?? ''} onChange={(e) => setBaseVersionId(e.target.value)} className={selectClass}>
                    {family.versions.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.id === compareVersionId}>
                        {v.displayVersion}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={swap}
                    className="p-1.5 rounded border border-fluent-border dark:border-[#636366] text-fluent-text-secondary hover:bg-fluent-bg-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue"
                    title="Swap base and compare versions"
                    aria-label="Swap base and compare versions"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>

                  <label htmlFor="baseline-compare" className="sr-only">Compare version (changes to)</label>
                  <select id="baseline-compare" value={compareVersionId ?? ''} onChange={(e) => setCompareVersionId(e.target.value)} className={selectClass}>
                    {family.versions.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.id === baseVersionId}>
                        {v.displayVersion}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>

              {/* Export — pushed to the far right (visual closure of the row) */}
              <div className="sm:ml-auto self-end">
                <ExportMenu ariaLabel="Export the current comparison" disabled={!diff} onExport={downloadExport} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Results ── */}
      {!canCompare ? (
        <p className="text-fluent-base text-fluent-text-secondary mt-6">
          Only one version of {family?.displayName} is published — nothing to compare yet.
        </p>
      ) : !diff ? (
        <p className="text-fluent-text-secondary text-fluent-base mt-6" role="status">Loading versions…</p>
      ) : (
        <div>
          {/* ── Summary: headline comparison + clickable stat tiles (also filters) ── */}
          <div className="mb-2 flex items-baseline gap-2 flex-wrap">
            <h2 className="text-fluent-lg font-semibold text-fluent-text">
              {versionLabel(baseVersionId)} → {versionLabel(compareVersionId)}
            </h2>
            <span className="text-fluent-sm text-fluent-text-secondary">
              {family.displayName} · {diff.changes.length} changed {diff.changes.length === 1 ? 'setting' : 'settings'}
            </span>
          </div>
          <p className="text-fluent-xs text-fluent-text-secondary mb-3">
            Select a tile to filter the list below.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-6" role="group" aria-label="Filter by change type">
            {KIND_ORDER.map((kind) => {
              const k = KIND[kind];
              const count = diff.counts[kind];
              const active = kindFilter.has(kind);
              return (
                <button
                  key={kind}
                  onClick={() => toggleKind(kind)}
                  aria-pressed={active}
                  className={`text-left rounded-lg border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue ${
                    active
                      ? `${k.tint} border-current`
                      : 'bg-white dark:bg-[#2c2c2e] border-fluent-border hover:bg-fluent-bg-alt'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${k.iconBg}`}>
                      <KindIcon kind={kind} />
                    </span>
                    <span className={`text-fluent-2xl font-semibold tabular-nums ${active ? k.text : 'text-fluent-text'}`}>
                      {count}
                    </span>
                  </div>
                  <div className={`mt-1.5 text-fluent-xs font-semibold ${active ? k.text : 'text-fluent-text-secondary'}`}>
                    {k.label} {count === 1 ? 'setting' : 'settings'}
                  </div>
                </button>
              );
            })}
          </div>

          {diff.changes.length === 0 ? (
            <p className="text-fluent-text-secondary text-fluent-base">No differences between these versions.</p>
          ) : (
            <>
              {/* ── Filter toolbar ── */}
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fluent-text-secondary pointer-events-none"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by setting name…"
                    aria-label="Filter settings by name"
                    className="w-full bg-white dark:bg-[#2c2c2e] text-fluent-text border border-fluent-border dark:border-[#636366] rounded pl-8 pr-3 py-1.5 text-fluent-sm placeholder:text-fluent-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue"
                  />
                </div>

                <span className="text-fluent-sm text-fluent-text-secondary" role="status">
                  {filtering
                    ? `${visibleChanges.length} of ${diff.changes.length} settings · ${grouped.length} ${grouped.length === 1 ? 'category' : 'categories'}`
                    : `${grouped.length} ${grouped.length === 1 ? 'category' : 'categories'}`}
                </span>

                {filtering && (
                  <button
                    onClick={() => { setKindFilter(new Set()); setQuery(''); }}
                    className="text-fluent-sm text-fluent-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue rounded"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {visibleChanges.length === 0 ? (
                <div className="fluent-card p-8 text-center">
                  <p className="text-fluent-base text-fluent-text mb-1">No settings match the current filters.</p>
                  <p className="text-fluent-sm text-fluent-text-secondary mb-4">
                    Try a different search term or change type.
                  </p>
                  <button
                    onClick={() => { setKindFilter(new Set()); setQuery(''); }}
                    className="fluent-btn-secondary text-fluent-sm"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                grouped.map(({ category, changes, kindCounts }) => (
                  <section key={category} className="mb-8" aria-labelledby={`cat-${category}`}>
                    {/* Category header — sticky so context persists while scanning long lists */}
                    <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-[var(--fluent-page-bg)]">
                      <div className="flex items-center gap-3 flex-wrap border-b border-fluent-border pb-2">
                        <h2 id={`cat-${category}`} className="text-fluent-lg font-semibold text-fluent-text">
                          {category}
                        </h2>
                        <span
                          className="flex items-center gap-2 text-fluent-xs font-medium"
                          aria-label={KIND_ORDER.filter((k) => kindCounts[k]).map((k) => `${kindCounts[k]} ${KIND[k].label.toLowerCase()}`).join(', ')}
                        >
                          {KIND_ORDER.filter((k) => kindCounts[k]).map((k) => (
                            <span key={k} className={`inline-flex items-center gap-1 tabular-nums ${KIND[k].text}`} aria-hidden>
                              <KindIcon kind={k} className="w-3 h-3" />
                              {kindCounts[k]}
                            </span>
                          ))}
                        </span>
                        <span className="text-fluent-xs text-fluent-text-secondary ml-auto tabular-nums">
                          {changes.length} {changes.length === 1 ? 'setting' : 'settings'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 bg-white dark:bg-[#2c2c2e] border border-fluent-border rounded-md overflow-hidden">
                      {changes.map(renderChange)}
                    </div>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
