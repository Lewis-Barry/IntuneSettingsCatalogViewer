'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { pillClass } from '@/lib/pill';
import { basePath } from '@/lib/basePath';
import { PLATFORM_ICONS } from './PlatformIcons';
import SettingRow from './SettingRow';
import { diffVersions } from '@/lib/oib-diff';
import { generateOIBChangelogHtml } from '@/lib/oib-html-export';
import { generateOIBChangelogCsv } from '@/lib/oib-csv-export';
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

const selectClass =
  'bg-white dark:bg-[#2c2c2e] text-fluent-text border border-fluent-border dark:border-[#636366] rounded px-2 py-1.5 text-fluent-sm hover:bg-fluent-bg-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue cursor-pointer';

// OIB folder → home-page platform-icon key.
const FOLDER_ICON: Record<string, string> = {
  WINDOWS: 'windows10',
  MACOS: 'macOS',
  WINDOWS365: 'windows10',
};

// Same chevron element as the home-page setting rows.
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Value formatting (resolve option ids → display names where possible) ──

function fmt(value: OIBValue | undefined, def?: SettingDefinition): string {
  if (!value) return '—';
  const optName = (id: string) =>
    def?.options?.find((o) => o.itemId === id)?.displayName ?? id;
  switch (value.type) {
    case 'choice':
      return optName(value.optionId);
    case 'choiceCollection':
      return value.optionIds.map(optName).join(', ') || '—';
    case 'simple':
      return value.value == null ? '—' : String(value.value);
    case 'simpleCollection':
      return value.values.map((v) => (v == null ? '' : String(v))).join(', ') || '—';
    default:
      return value.type;
  }
}

// ── Kind metadata — icon + text + colour (never colour alone, WCAG 1.4.1) ──

function KindIcon({ kind, className = 'w-4 h-4' }: { kind: PolicyChangeKind; className?: string }) {
  const common = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;
  switch (kind) {
    case 'added':
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'removed':
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      );
    case 'modified':
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    case 'renamed':
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
  }
}

const KIND_ORDER: PolicyChangeKind[] = ['added', 'removed', 'modified', 'renamed'];

const KIND: Record<
  PolicyChangeKind,
  { label: string; text: string; tint: string; gutter: string; iconBg: string }
> = {
  added: {
    label: 'Added',
    text: 'text-fluent-success',
    tint: 'border-fluent-success/40 bg-fluent-success/10',
    gutter: 'border-l-fluent-success',
    iconBg: 'bg-fluent-success/15 text-fluent-success',
  },
  removed: {
    label: 'Removed',
    text: 'text-fluent-error',
    tint: 'border-fluent-error/40 bg-fluent-error/10',
    gutter: 'border-l-fluent-error',
    iconBg: 'bg-fluent-error/15 text-fluent-error',
  },
  modified: {
    label: 'Modified',
    text: 'text-fluent-warning',
    tint: 'border-fluent-warning/40 bg-fluent-warning/10',
    gutter: 'border-l-fluent-warning',
    iconBg: 'bg-fluent-warning/15 text-fluent-warning',
  },
  renamed: {
    label: 'Renamed',
    text: 'text-fluent-info',
    tint: 'border-fluent-info/40 bg-fluent-info/10',
    gutter: 'border-l-fluent-info',
    iconBg: 'bg-fluent-info/15 text-fluent-info',
  },
};

function KindBadge({ kind }: { kind: PolicyChangeKind }) {
  const k = KIND[kind];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-fluent-xs font-semibold border ${k.tint} ${k.text}`}>
      <KindIcon kind={kind} className="w-3 h-3" />
      {k.label}
    </span>
  );
}

const SETTING_KIND: Record<
  SettingChange['kind'],
  { pill: string; gutter: string; sym: string; label: string }
> = {
  added: { pill: 'text-fluent-success border-fluent-success/40 bg-fluent-success/10', gutter: 'border-l-fluent-success/60', sym: '+', label: 'Added' },
  removed: { pill: 'text-fluent-error border-fluent-error/40 bg-fluent-error/10', gutter: 'border-l-fluent-error/60', sym: '−', label: 'Removed' },
  changed: { pill: 'text-fluent-warning border-fluent-warning/40 bg-fluent-warning/10', gutter: 'border-l-fluent-warning/60', sym: '~', label: 'Changed' },
};

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

/** Change indicator for SettingRow's 10rem badge slot: pill on top, value below. */
function changeBadge(c: SettingChange, def?: SettingDefinition): React.ReactNode {
  const k = SETTING_KIND[c.kind];
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-fluent-xs font-semibold border ${k.pill}`}>
        <span aria-hidden className="font-mono">{k.sym}</span>
        {k.label}
      </span>
      <span className="text-fluent-xs text-fluent-text-secondary break-words leading-snug">
        {c.kind === 'changed' ? (
          <><span className="line-through">{fmt(c.baseValue, def)}</span> → <span className="text-fluent-text">{fmt(c.compareValue, def)}</span></>
        ) : c.kind === 'removed' ? (
          fmt(c.baseValue, def)
        ) : (
          fmt(c.compareValue, def)
        )}
      </span>
    </div>
  );
}

/** Group policies by category (alphabetical), kinds first within each category. */
function groupByCategory(policies: PolicyDiff[]): { category: string; policies: PolicyDiff[] }[] {
  const order: Record<PolicyChangeKind, number> = { added: 0, removed: 1, modified: 2, renamed: 3 };
  const byCat = new Map<string, PolicyDiff[]>();
  for (const p of policies) {
    const arr = byCat.get(p.category) ?? [];
    arr.push(p);
    byCat.set(p.category, arr);
  }
  return [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, ps]) => ({
      category,
      policies: ps.sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label)),
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<Set<PolicyChangeKind>>(new Set());
  const [query, setQuery] = useState('');

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

    fetch(`${basePath}/settings-browse.json`)
      .then((r) => (r.ok ? (r.json() as Promise<SettingDefinition[]>) : []))
      .then((defs) => {
        const m = new Map<string, SettingDefinition>();
        for (const d of defs) m.set(d.id, d);
        setDefsMap(m);
      })
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

  // Reset view state whenever the comparison changes.
  useEffect(() => {
    setExpanded(new Set());
    setKindFilter(new Set());
    setQuery('');
  }, [folder, baseTag, compareTag]);

  // Lazily fetch the two selected shards.
  const ensureShard = useCallback(
    (tag: string | null) => {
      if (!tag || shards.has(tag)) return;
      fetch(`${basePath}/oib-versions/${tag}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${tag}.json: ${r.status}`);
          return r.json() as Promise<OIBVersionShard>;
        })
        .then((s) => setShards((prev) => new Map(prev).set(tag, s)))
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
    const visible = diff.policies.filter((p) => {
      if (kindFilter.size > 0 && !kindFilter.has(p.kind)) return false;
      if (q) {
        const hay = `${p.label} ${p.baseName ?? ''} ${p.compareName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const order: Record<PolicyChangeKind, number> = { added: 0, removed: 1, modified: 2, renamed: 3 };
    const byCat = new Map<string, PolicyDiff[]>();
    for (const p of visible) {
      const arr = byCat.get(p.category) ?? [];
      arr.push(p);
      byCat.set(p.category, arr);
    }
    return [...byCat.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, policies]) => {
        const sorted = policies.sort(
          (a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label)
        );
        const kindCounts = {} as Record<PolicyChangeKind, number>;
        for (const p of sorted) kindCounts[p.kind] = (kindCounts[p.kind] ?? 0) + 1;
        return { category, policies: sorted, kindCounts };
      });
  }, [diff, kindFilter, query]);

  const visibleCount = useMemo(
    () => grouped.reduce((n, g) => n + g.policies.length, 0),
    [grouped]
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleKind = (kind: PolicyChangeKind) =>
    setKindFilter((prev) => {
      const next = new Set(prev);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });

  const setAllExpanded = (open: boolean) =>
    setExpanded(() => {
      if (!open) return new Set();
      const next = new Set<string>();
      for (const { category, policies } of grouped) {
        for (const p of policies) {
          if (p.settingChanges.length > 0) next.add(`${category}|${p.compareName ?? p.baseName}`);
        }
      }
      return next;
    });

  const swap = () => {
    setBaseTag(compareTag);
    setCompareTag(baseTag);
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

    const mime = format === 'html' ? 'text/html;charset=utf-8' : 'text/csv;charset=utf-8';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safePlatform = platform.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    anchor.href = url;
    anchor.download = `oib-changelog-${safePlatform}-v${baseVersionLabel}-to-v${compareVersionLabel}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
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

  // Render a single setting change row (reused for grouped + ungrouped).
  const renderChange = (c: SettingChange) => {
    const def = defsMap.get(c.definitionId);
    const src = c.kind === 'removed' ? c.baseValue : c.compareValue;
    if (!def) {
      return (
        <div key={c.definitionId + c.kind} className={`flex items-center gap-3 px-4 py-2.5 border-b border-fluent-border border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
          <span className="flex-1 font-mono text-[12px] text-fluent-text-secondary truncate">{c.definitionId}</span>
          {changeBadge(c, def)}
        </div>
      );
    }
    const { activeOptionIds, activeSimpleValue } = activeFrom(src);
    const srcVersion = c.kind === 'removed' ? versionLabel(baseTag) : versionLabel(compareTag);
    return (
      <div key={c.definitionId + c.kind} className={`border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
        <SettingRow
          setting={def}
          valueBadge={changeBadge(c, def)}
          activeOptionIds={activeOptionIds}
          activeSimpleValue={activeSimpleValue}
          activeLabel={`OIB ${srcVersion}`}
          hideScope
        />
      </div>
    );
  };

  const canCompare = platform != null && platform.versions.length >= 2;
  const filtering = kindFilter.size > 0 || query.trim() !== '';

  return (
    <div className="p-4 md:p-6">
      {/* ── Header ── */}
      <h1 className="text-fluent-2xl font-semibold text-fluent-text mb-1">OIB Changelog</h1>
      <p className="text-fluent-base text-fluent-text-secondary mb-5">
        Compare any two OpenIntuneBaseline versions — see which policies and settings changed.
      </p>

      {/* ── Controls: one card, two zones (platform · versions+export) ── */}
      <div className="fluent-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* Platform picker */}
          <fieldset className="min-w-0">
            <legend className="text-fluent-xs font-semibold uppercase tracking-wide text-fluent-text-secondary mb-1.5">
              Platform
            </legend>
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
                  <label htmlFor="oib-base" className="sr-only">Base version (changes from)</label>
                  <select id="oib-base" value={baseTag ?? ''} onChange={(e) => setBaseTag(e.target.value)} className={selectClass}>
                    {platform.versions.map((v) => (
                      <option key={v.tag} value={v.tag} disabled={v.tag === compareTag}>
                        v{v.version} · {v.date}
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

                  <label htmlFor="oib-compare" className="sr-only">Compare version (changes to)</label>
                  <select id="oib-compare" value={compareTag ?? ''} onChange={(e) => setCompareTag(e.target.value)} className={selectClass}>
                    {platform.versions.map((v) => (
                      <option key={v.tag} value={v.tag} disabled={v.tag === baseTag}>
                        v{v.version} · {v.date}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>

              {/* Export — pushed to the far right (visual closure of the row) */}
              <div className="sm:ml-auto self-end">
                <details className="relative">
                  <summary
                    className="fluent-btn-secondary text-fluent-sm cursor-pointer list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden"
                    aria-label="Export the current comparison"
                  >
                    Export
                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="absolute right-0 mt-1 z-50 min-w-[8rem] bg-fluent-bg border border-fluent-border rounded-md shadow-lg py-1">
                    {(['csv', 'html'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={(e) => {
                          downloadExport(fmt);
                          e.currentTarget.closest('details')?.removeAttribute('open');
                        }}
                        disabled={!diff}
                        className="block w-full text-left px-3 py-2 text-fluent-sm text-fluent-text hover:bg-fluent-bg-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Results ── */}
      {!canCompare ? (
        <p className="text-fluent-base text-fluent-text-secondary mt-6">
          Only one version of {platform?.label} is published — nothing to compare yet.
        </p>
      ) : !diff ? (
        <p className="text-fluent-text-secondary text-fluent-base mt-6" role="status">Loading versions…</p>
      ) : (
        <div>
          {/* ── Summary: headline comparison + clickable stat tiles (also filters) ── */}
          <div className="mb-2 flex items-baseline gap-2 flex-wrap">
            <h2 className="text-fluent-lg font-semibold text-fluent-text">
              v{versionLabel(baseTag)} → v{versionLabel(compareTag)}
            </h2>
            <span className="text-fluent-sm text-fluent-text-secondary">
              {versionDate(baseTag)} → {versionDate(compareTag)} · {diff.policies.length} changed {diff.policies.length === 1 ? 'policy' : 'policies'}
            </span>
          </div>
          <p className="text-fluent-xs text-fluent-text-secondary mb-3">
            Select a tile to filter the list below.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" role="group" aria-label="Filter by change type">
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
                    {k.label} {count === 1 ? 'policy' : 'policies'}
                  </div>
                </button>
              );
            })}
          </div>

          {diff.policies.length === 0 ? (
            <p className="text-fluent-text-secondary text-fluent-base">No differences between these versions.</p>
          ) : (
            <>
              {/* ── Filter / view toolbar ── */}
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
                    placeholder="Filter by policy name…"
                    aria-label="Filter policies by name"
                    className="w-full bg-white dark:bg-[#2c2c2e] text-fluent-text border border-fluent-border dark:border-[#636366] rounded pl-8 pr-3 py-1.5 text-fluent-sm placeholder:text-fluent-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue"
                  />
                </div>

                <span className="text-fluent-sm text-fluent-text-secondary" role="status">
                  {filtering
                    ? `${visibleCount} of ${diff.policies.length} policies · ${grouped.length} ${grouped.length === 1 ? 'category' : 'categories'}`
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

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setAllExpanded(true)}
                    className="text-fluent-sm text-fluent-text-secondary hover:text-fluent-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue rounded"
                  >
                    Expand all
                  </button>
                  <span className="text-fluent-text-disabled" aria-hidden>·</span>
                  <button
                    onClick={() => setAllExpanded(false)}
                    className="text-fluent-sm text-fluent-text-secondary hover:text-fluent-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue rounded"
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              {visibleCount === 0 ? (
                <div className="fluent-card p-8 text-center">
                  <p className="text-fluent-base text-fluent-text mb-1">No policies match the current filters.</p>
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
                grouped.map(({ category, policies, kindCounts }) => (
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
                          {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {policies.map((p) => {
                        const key = `${category}|${p.compareName ?? p.baseName}`;
                        const expandable = p.settingChanges.length > 0;
                        const isOpen = expanded.has(key);
                        const k = KIND[p.kind];
                        return (
                          <div
                            key={key}
                            className={`bg-white dark:bg-[#2c2c2e] border border-fluent-border border-l-4 ${k.gutter} rounded-md overflow-hidden`}
                          >
                            <button
                              onClick={() => expandable && toggle(key)}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fluent-blue ${
                                expandable ? 'hover:bg-fluent-bg-alt cursor-pointer' : 'cursor-default'
                              }`}
                              aria-expanded={expandable ? isOpen : undefined}
                            >
                              {expandable ? (
                                <span className="w-4 flex items-center justify-center text-fluent-text-secondary shrink-0">
                                  <Chevron open={isOpen} />
                                </span>
                              ) : (
                                <span className="w-4 shrink-0" aria-hidden />
                              )}
                              <KindBadge kind={p.kind} />
                              <span className="flex-1 min-w-0 text-fluent-base font-medium text-fluent-text truncate">
                                {(p.compareName ?? p.baseName ?? '').replace(/\s*-\s*v[\d.]+$/i, '')}
                              </span>
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
                            </button>

                            {isOpen && expandable && (
                              <div className="border-t border-fluent-border bg-fluent-bg">
                                {p.settingChanges.length === 0 ? (
                                  <p className="text-fluent-sm text-fluent-text-secondary px-4 py-3">
                                    Renamed; settings unchanged.
                                  </p>
                                ) : (
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
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
