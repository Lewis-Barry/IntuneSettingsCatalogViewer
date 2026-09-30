'use client';

// Shared shell for the OIB and MS-baseline changelog screens: version-pair
// picker + swap, stat-tile filters, search toolbar, sticky category sections
// and collapsible change cards. Each viewer owns its data loading, diffing and
// value formatting, and passes rows in through slots.

import { useState, type ReactNode } from 'react';
import { selectClass } from '@/lib/pill';
import ExportMenu, { Chevron, KindIcon, KIND, SETTING_KIND, type ChangeKind, type ExportFormat } from './ExportMenu';

/** Singular/plural name for the listed items, e.g. ['setting', 'settings']. */
type Noun = [string, string];
const plural = (n: number, [one, many]: Noun) => (n === 1 ? one : many);

const flip = <V,>(set: Set<V>, v: V) => {
  const next = new Set(set);
  next.has(v) ? next.delete(v) : next.add(v);
  return next;
};

/** Expand/filter/search state; resets whenever `resetKey` (the comparison) changes. */
export function useDiffView<K extends ChangeKind>(resetKey: string) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<Set<K>>(new Set());
  const [query, setQuery] = useState('');
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    // Reset during render rather than in an effect, so no stale-filter frame.
    setKey(resetKey);
    setExpanded(new Set());
    setKindFilter(new Set());
    setQuery('');
  }
  return {
    expanded,
    setExpanded,
    kindFilter,
    query,
    setQuery,
    toggle: (k: string) => setExpanded((prev) => flip(prev, k)),
    toggleKind: (k: K) => setKindFilter((prev) => flip(prev, k)),
    clearFilters: () => { setKindFilter(new Set()); setQuery(''); },
    filtering: kindFilter.size > 0 || query.trim() !== '',
  };
}

export type DiffView<K extends ChangeKind> = ReturnType<typeof useDiffView<K>>;

/** Error / initial-loading placeholder. */
export function LoadStatus({ error }: { error: string | null }) {
  if (error) {
    return <p className="text-fluent-error text-fluent-base p-4">Failed to load baseline data: {error}</p>;
  }
  return (
    <div className="p-4 md:p-6" role="status" aria-live="polite">
      <p className="text-fluent-text-secondary text-fluent-base">Loading…</p>
    </div>
  );
}

function KindBadge({ kind }: { kind: ChangeKind }) {
  const k = KIND[kind];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-fluent-xs font-semibold border ${k.tint} ${k.text}`}>
      <KindIcon kind={kind} className="w-3 h-3" />
      {k.label}
    </span>
  );
}

/** Change indicator for SettingRow's 10rem badge slot: pill on top, value below. */
export function ChangeBadge({ kind, base, compare, note }: { kind: keyof typeof SETTING_KIND; base: string; compare: string; note?: ReactNode }) {
  const k = SETTING_KIND[kind];
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-fluent-xs font-semibold border ${k.pill}`}>
        <span aria-hidden className="font-mono">{k.sym}</span>
        {k.label}
      </span>
      {note && <span className="text-fluent-xs text-fluent-info break-words leading-snug">{note}</span>}
      <span className="text-fluent-xs text-fluent-text-secondary break-words leading-snug">
        {kind === 'changed' ? (
          <><span className="line-through">{base}</span> → <span className="text-fluent-text">{compare}</span></>
        ) : kind === 'removed' ? (
          base
        ) : (
          compare
        )}
      </span>
    </div>
  );
}

/** Category section with a sticky header (kind counts + item count). */
export function CategorySection<K extends ChangeKind>({
  category,
  kinds,
  items,
  noun,
  children,
}: {
  category: string;
  kinds: K[];
  items: { kind: K }[];
  noun: Noun;
  children: ReactNode;
}) {
  const kindCounts = {} as Record<K, number>;
  for (const i of items) kindCounts[i.kind] = (kindCounts[i.kind] ?? 0) + 1;
  const present = kinds.filter((k) => kindCounts[k]);
  return (
    <section className="mb-8" aria-labelledby={`cat-${category}`}>
      {/* Category header — sticky so context persists while scanning long lists */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-[var(--fluent-page-bg)]">
        <div className="flex items-center gap-3 flex-wrap border-b border-fluent-border pb-2">
          <h2 id={`cat-${category}`} className="text-fluent-lg font-semibold text-fluent-text">
            {category}
          </h2>
          <span
            className="flex items-center gap-2 text-fluent-xs font-medium"
            aria-label={present.map((k) => `${kindCounts[k]} ${KIND[k].label.toLowerCase()}`).join(', ')}
          >
            {present.map((k) => (
              <span key={k} className={`inline-flex items-center gap-1 tabular-nums ${KIND[k].text}`} aria-hidden>
                <KindIcon kind={k} className="w-3 h-3" />
                {kindCounts[k]}
              </span>
            ))}
          </span>
          <span className="text-fluent-xs text-fluent-text-secondary ml-auto tabular-nums">
            {items.length} {plural(items.length, noun)}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

/** Collapsible change card with the coloured kind gutter. `children` sit right of the title;
 *  `note` is a line under the header, outside the toggle button, so it may hold links. */
export function ChangeCard({
  id,
  note,
  kind,
  expandable,
  open,
  onToggle,
  title,
  body,
  children,
}: {
  id?: string;
  note?: ReactNode;
  kind: ChangeKind;
  expandable: boolean;
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  body: () => ReactNode;
  children?: ReactNode;
}) {
  return (
    <div id={id} className={`scroll-mt-16 bg-white dark:bg-[#2c2c2e] border border-fluent-border border-l-4 ${KIND[kind].gutter} rounded-md overflow-hidden`}>
      <button
        onClick={() => expandable && onToggle()}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fluent-blue ${
          expandable ? 'hover:bg-fluent-bg-alt cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={expandable ? open : undefined}
      >
        {expandable ? (
          <span className="w-4 flex items-center justify-center text-fluent-text-secondary shrink-0">
            <Chevron open={open} />
          </span>
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        <KindBadge kind={kind} />
        <span className="flex-1 min-w-0 text-fluent-base font-medium text-fluent-text break-words">{title}</span>
        {children}
      </button>
      {note && <div className="pl-11 pr-4 pb-3 -mt-1 text-fluent-sm text-fluent-text-secondary">{note}</div>}

      {open && expandable && <div className="border-t border-fluent-border bg-fluent-bg">{body()}</div>}
    </div>
  );
}

const linkBtn =
  'text-fluent-sm text-fluent-text-secondary hover:text-fluent-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue rounded';

/** Page shell: header, controls card, summary tiles, toolbar and the (slotted) category sections. */
export default function VersionDiffView<K extends ChangeKind>({
  title,
  intro,
  pickerLabel,
  picker,
  idPrefix,
  versions,
  baseId,
  compareId,
  onBaseChange,
  onCompareChange,
  onExport,
  subject,
  summary,
  kinds,
  noun,
  view,
  visibleCount,
  categoryCount,
  onExpandAll,
  children,
}: {
  title: string;
  intro: string;
  pickerLabel: string;
  picker: ReactNode;
  /** Prefix for the version <select> ids. */
  idPrefix: string;
  versions: { id: string; label: string }[];
  baseId: string | null;
  compareId: string | null;
  onBaseChange: (id: string | null) => void;
  onCompareChange: (id: string | null) => void;
  onExport: (format: ExportFormat) => void;
  /** Family/platform name for the "only one version" message. */
  subject?: string;
  /** Null while the two versions are still loading. */
  summary: { heading: ReactNode; detail: ReactNode; counts: Record<K, number>; total: number } | null;
  kinds: K[];
  noun: Noun;
  view: DiffView<K>;
  visibleCount: number;
  categoryCount: number;
  onExpandAll: () => void;
  children: ReactNode;
}) {
  const canCompare = versions.length >= 2;
  const cats = `${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}`;

  const versionSelect = (id: string, label: string, value: string | null, other: string | null, onChange: (id: string) => void) => (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {versions.map((v) => (
          <option key={v.id} value={v.id} disabled={v.id === other}>
            {v.label}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <div className="p-4 md:p-6">
      {/* ── Header ── */}
      <h1 className="text-fluent-2xl font-semibold text-fluent-text mb-1">{title}</h1>
      <p className="text-fluent-base text-fluent-text-secondary mb-5">{intro}</p>

      {/* ── Controls: one card, two zones (picker · versions+export) ── */}
      <div className="fluent-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <fieldset className="min-w-0">
            <legend className="text-fluent-xs font-semibold uppercase tracking-wide text-fluent-text-secondary mb-1.5">
              {pickerLabel}
            </legend>
            {picker}
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
                  {versionSelect(`${idPrefix}-base`, 'Base version (changes from)', baseId, compareId, onBaseChange)}

                  <button
                    onClick={() => { onBaseChange(compareId); onCompareChange(baseId); }}
                    className="p-1.5 rounded border border-fluent-border dark:border-[#636366] text-fluent-text-secondary hover:bg-fluent-bg-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue"
                    title="Swap base and compare versions"
                    aria-label="Swap base and compare versions"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>

                  {versionSelect(`${idPrefix}-compare`, 'Compare version (changes to)', compareId, baseId, onCompareChange)}
                </div>
              </fieldset>

              {/* Export — pushed to the far right (visual closure of the row) */}
              <div className="sm:ml-auto self-end">
                <ExportMenu ariaLabel="Export the current comparison" disabled={!summary} onExport={onExport} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Results ── */}
      {!canCompare ? (
        <p className="text-fluent-base text-fluent-text-secondary mt-6">
          Only one version of {subject} is published — nothing to compare yet.
        </p>
      ) : !summary ? (
        <p className="text-fluent-text-secondary text-fluent-base mt-6" role="status">Loading versions…</p>
      ) : (
        <div>
          {/* ── Summary: headline comparison + clickable stat tiles (also filters) ── */}
          <div className="mb-2 flex items-baseline gap-2 flex-wrap">
            <h2 className="text-fluent-lg font-semibold text-fluent-text">{summary.heading}</h2>
            <span className="text-fluent-sm text-fluent-text-secondary">{summary.detail}</span>
          </div>
          <p className="text-fluent-xs text-fluent-text-secondary mb-3">
            Select a tile to filter the list below.
          </p>

          <div
            className={`grid grid-cols-2 ${kinds.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3 mb-6`}
            role="group"
            aria-label="Filter by change type"
          >
            {kinds.map((kind) => {
              const k = KIND[kind];
              const count = summary.counts[kind];
              const active = view.kindFilter.has(kind);
              return (
                <button
                  key={kind}
                  onClick={() => view.toggleKind(kind)}
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
                    {k.label} {plural(count, noun)}
                  </div>
                </button>
              );
            })}
          </div>

          {summary.total === 0 ? (
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
                    value={view.query}
                    onChange={(e) => view.setQuery(e.target.value)}
                    placeholder={`Filter by ${noun[0]} name…`}
                    aria-label={`Filter ${noun[1]} by name`}
                    className="w-full bg-white dark:bg-[#2c2c2e] text-fluent-text border border-fluent-border dark:border-[#636366] rounded pl-8 pr-3 py-1.5 text-fluent-sm placeholder:text-fluent-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue"
                  />
                </div>

                <span className="text-fluent-sm text-fluent-text-secondary" role="status">
                  {view.filtering ? `${visibleCount} of ${summary.total} ${noun[1]} · ${cats}` : cats}
                </span>

                {view.filtering && (
                  <button
                    onClick={view.clearFilters}
                    className="text-fluent-sm text-fluent-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue rounded"
                  >
                    Clear filters
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <button onClick={onExpandAll} className={linkBtn}>
                    Expand all
                  </button>
                  <span className="text-fluent-text-disabled" aria-hidden>·</span>
                  <button onClick={() => view.setExpanded(new Set())} className={linkBtn}>
                    Collapse all
                  </button>
                </div>
              </div>

              {visibleCount === 0 ? (
                <div className="fluent-card p-8 text-center">
                  <p className="text-fluent-base text-fluent-text mb-1">No {noun[1]} match the current filters.</p>
                  <p className="text-fluent-sm text-fluent-text-secondary mb-4">
                    Try a different search term or change type.
                  </p>
                  <button onClick={view.clearFilters} className="fluent-btn-secondary text-fluent-sm">
                    Clear filters
                  </button>
                </div>
              ) : (
                children
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
