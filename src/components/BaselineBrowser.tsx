'use client';

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from 'react';
import { basePath } from '@/lib/basePath';
import { selectClass } from '@/lib/pill';
import SettingRow from './SettingRow';
import BrowserSidebar, { useBrowserSidebar } from './BrowserSidebar';
import ExportMenu, { downloadTextFile, Chevron } from './ExportMenu';
import { useIsDesktop } from '@/lib/useMediaQuery';
import type { SettingDefinition } from '@/lib/types';
import {
  defaultVersion,
  type BaselineIndex,
  type BaselineFamily,
  type BaselineSetting,
  type BaselineShard,
} from '@/lib/baseline-types';
import {
  generateBaselineBrowseCsv,
  generateBaselineBrowseHtml,
  type BaselineBrowseEntry,
} from '@/lib/baseline-export';

// ── Flatten the shard's setting tree into display rows (mirrors OIBBrowser:
// choice children follow their parent flat; group/collection containers become
// collapsible labelled groups, one per pre-populated instance) ──

type Row =
  | { type: 'leaf'; s: BaselineSetting }
  | { type: 'group'; key: string; label: string; members: BaselineSetting[] };

/** Group/groupCollection containers carry children but no value of their own. */
const isContainer = (s: BaselineSetting) =>
  !!s.children?.length && s.value === undefined && !s.optionId && !s.optionIds;

function leafList(list: BaselineSetting[]): BaselineSetting[] {
  const out: BaselineSetting[] = [];
  for (const s of list) {
    if (isContainer(s)) {
      out.push(...leafList(s.children!));
    } else {
      out.push(s);
      if (s.children) out.push(...leafList(s.children));
    }
  }
  return out;
}

function buildRows(settings: BaselineSetting[]): Row[] {
  const rows: Row[] = [];
  for (const s of settings) {
    if (isContainer(s)) {
      // Multi-instance collections (synthetic `#n` children) get one group per
      // instance — e.g. each pre-populated firewall rule under its own name.
      if (s.children!.every((c) => c.settingDefinitionId.includes('#'))) {
        for (const inst of s.children!) {
          rows.push({
            type: 'group',
            key: inst.settingDefinitionId,
            label: inst.displayName,
            members: leafList(inst.children ?? []),
          });
        }
      } else {
        rows.push({ type: 'group', key: s.settingDefinitionId, label: s.displayName, members: leafList(s.children!) });
      }
    } else {
      rows.push({ type: 'leaf', s });
      if (s.children) for (const leaf of leafList(s.children)) rows.push({ type: 'leaf', s: leaf });
    }
  }
  return rows;
}

function matches(s: BaselineSetting, q: string): boolean {
  return (
    s.displayName.toLowerCase().includes(q) ||
    s.settingDefinitionId.toLowerCase().includes(q) ||
    (s.value ?? '').toLowerCase().includes(q) ||
    (s.description ?? '').toLowerCase().includes(q)
  );
}

/** Keep only rows whose setting (or a group member) matches the query. */
function filterRows(rows: Row[], q: string): Row[] {
  const out: Row[] = [];
  for (const row of rows) {
    if (row.type === 'leaf') {
      if (matches(row.s, q)) out.push(row);
    } else {
      const members = row.members.filter((m) => matches(m, q));
      if (members.length > 0) out.push({ ...row, members });
      else if (row.label.toLowerCase().includes(q)) out.push(row);
    }
  }
  return out;
}

const rowCount = (rows: Row[]) =>
  rows.reduce((n, r) => n + (r.type === 'leaf' ? 1 : r.members.length), 0);

/** Fallback row for the rare settings without a catalog definition — same
 *  layout as OIB's unresolved rows, plus an expandable description. */
function FallbackRow({ s }: { s: BaselineSetting }) {
  const [open, setOpen] = useState(false);
  const expandable = !!s.description;
  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-2.5 border-b border-fluent-border/50 ${expandable ? 'cursor-pointer hover:bg-fluent-bg-alt/50' : ''} transition-colors`}
        onClick={() => expandable && setOpen(!open)}
        role="row"
        aria-expanded={expandable ? open : undefined}
      >
        <span className="w-5 flex items-center justify-center text-fluent-text-secondary flex-shrink-0">
          {expandable && <Chevron open={open} />}
        </span>
        <span className="flex-1 min-w-0 text-fluent-base text-fluent-text truncate">{s.displayName}</span>
        <div className="hidden md:flex w-[10rem] justify-end">
          <span className="text-fluent-xs text-fluent-text-secondary break-words leading-snug text-right">
            {s.value ?? ''}
          </span>
        </div>
      </div>
      {open && (
        <div className="border-b border-fluent-border bg-fluent-bg px-4 py-3 pl-12">
          {s.description && (
            <p className="text-fluent-sm text-fluent-text-secondary whitespace-pre-line mb-2">{s.description}</p>
          )}
          <p className="font-mono text-[12px] text-fluent-text-secondary break-all">{s.settingDefinitionId}</p>
        </div>
      )}
    </div>
  );
}

// ── Setting rows list (column header + groups + SettingRows) ─────────────────

interface SettingRowsProps {
  rows: Row[];
  defsMap: Map<string, SettingDefinition>;
  versionLabel: string;
  highlightQuery?: string;
}

function SettingRows({ rows, defsMap, versionLabel, highlightQuery }: SettingRowsProps) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const renderLeaf = (s: BaselineSetting, i: number) => {
    const def = defsMap.get(s.settingDefinitionId);
    if (!def) return <FallbackRow key={`${s.settingDefinitionId}-${i}`} s={s} />;
    const valueBadge = s.value ? (
      <span className="text-fluent-xs text-fluent-text-secondary break-words leading-snug text-right">
        {s.value}
      </span>
    ) : undefined;
    return (
      <SettingRow
        key={`${s.settingDefinitionId}-${i}`}
        setting={def}
        highlightQuery={highlightQuery}
        valueBadge={valueBadge}
        activeOptionIds={s.optionId ? [s.optionId] : s.optionIds}
        activeSimpleValue={s.optionId || s.optionIds ? undefined : s.value}
        activeLabel={`Baseline ${versionLabel}`}
        hideScope
      />
    );
  };

  return (
    <div role="table" aria-label="Baseline settings">
      {/* Column header — matches main browser (scope omitted) */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-fluent-border bg-fluent-bg-alt text-fluent-sm font-semibold text-fluent-text-secondary">
        <span className="w-5" />
        <span className="flex-1">Setting name</span>
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
          <span className="w-[10rem] text-right">Default value</span>
          <span className="w-[6rem] text-center">Type</span>
          <span className="w-[3.5rem]" />
          <span className="w-5" />
        </div>
      </div>

      {rows.map((row, i) => {
        if (row.type === 'leaf') return renderLeaf(row.s, i);
        // ponytail: during search, matched rows must be visible, so groups
        // default open — invert the toggle set (membership = collapsed).
        const inSet = openGroups.has(row.key);
        const isOpen = highlightQuery ? !inSet : inSet;
        return (
          <div key={row.key} className="border-b border-fluent-border">
            <button
              onClick={() => toggleGroup(row.key)}
              className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-fluent-bg-alt/50 transition-colors"
              aria-expanded={isOpen}
            >
              <Chevron open={isOpen} />
              <span className="flex-1 text-fluent-base font-medium text-fluent-text truncate">{row.label}</span>
              <span className="text-fluent-sm text-fluent-text-secondary flex-shrink-0">({row.members.length})</span>
            </button>
            {isOpen && <div className="pl-3">{row.members.map(renderLeaf)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Collapsible section for search results (mirrors OIB's PolicySection) ─────

interface SectionProps {
  title: string;
  breadcrumb?: string;
  count: number;
  children: React.ReactNode;
}

function Section({ title, breadcrumb, count, children }: SectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="border-b border-fluent-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-4 py-2.5 bg-fluent-bg-alt hover:bg-fluent-border transition-colors text-left"
        aria-expanded={!collapsed}
      >
        <svg
          className={`w-3.5 h-3.5 text-fluent-text-secondary transition-transform duration-150 flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap flex-1">
          {breadcrumb && (
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-fluent-sm text-fluent-text-secondary md:truncate md:max-w-[220px]">
                {breadcrumb}
              </span>
              <svg className="w-2.5 h-2.5 text-fluent-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}
          <span className="text-fluent-base font-semibold text-fluent-text truncate">{title}</span>
        </div>
        <span className="text-fluent-sm text-fluent-text-secondary flex-shrink-0">({count})</span>
      </button>
      {!collapsed && children}
    </div>
  );
}

// ── Sidebar: categories of the selected version (mirrors OIBSidebarTree) ─────

interface SidebarTreeProps {
  familyName: string;
  categories: Array<{ category: string; count: number }>;
  selectedCategory: string | null;
  onSelect: (category: string) => void;
}

const BaselineSidebarTree = memo(function BaselineSidebarTree({
  familyName,
  categories,
  selectedCategory,
  onSelect,
}: SidebarTreeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const total = categories.reduce((n, c) => n + c.count, 0);

  return (
    <div className="fluent-scroll overflow-y-auto">
      <h3 className="px-2 py-2 text-fluent-sm font-semibold text-fluent-text-secondary uppercase tracking-wide">
        Browse by category
      </h3>
      <div className="space-y-0.5">
        {/* Baseline header (folder level) */}
        <button
          type="button"
          className="category-item"
          style={{ paddingLeft: '8px' }}
          onClick={() => setCollapsed(!collapsed)}
          role="treeitem"
          aria-expanded={!collapsed}
          aria-selected={false}
        >
          <span
            className="category-chevron w-4 h-4 flex items-center justify-center flex-shrink-0 text-fluent-text-secondary hover:text-fluent-text"
            aria-hidden="true"
          >
            <svg
              className={`w-3 h-3 transition-transform duration-150 ${!collapsed ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
          <span className="flex-1 truncate text-fluent-base font-semibold">{familyName}</span>
          <span className="text-fluent-xs text-fluent-text-secondary ml-1 flex-shrink-0">{total}</span>
        </button>

        {/* Categories under the baseline */}
        {!collapsed && (
          <div role="group">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  type="button"
                  className={`category-item ${isSelected ? 'category-item-active' : ''}`}
                  style={{ paddingLeft: `${8 + 14}px` }}
                  onClick={() => onSelect(cat.category)}
                  role="treeitem"
                  aria-selected={isSelected}
                >
                  <span className="category-chevron-spacer w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate text-fluent-base">{cat.category}</span>
                  <span className="text-fluent-xs text-fluent-text-secondary ml-1 flex-shrink-0">{cat.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Main Component ───────────────────────────────────────────────────────────

export default function BaselineBrowser() {
  const [index, setIndex] = useState<BaselineIndex | null>(null);
  const [defsMap, setDefsMap] = useState<Map<string, SettingDefinition>>(new Map());
  const [shards, setShards] = useState<Map<string, BaselineShard>>(new Map());
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [defsLoaded, setDefsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [baseId, setBaseId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);
  const isSearchPending = searchQuery !== deferredQuery;
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isDesktop = useIsDesktop();
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const { sidebarOpen, setSidebarOpen, sidebarWidth, sidebarHydrated, handleResizeStart } = useBrowserSidebar();

  // ── Load data ──
  useEffect(() => {
    const loadIndex = fetch(`${basePath}/baselines/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`baselines/index.json: ${r.status}`);
        return r.json() as Promise<BaselineIndex>;
      })
      .then((idx) => {
        setIndex(idx);
        setIndexLoaded(true);
        const first = idx.families[0];
        if (first) {
          setBaseId(first.baseId);
          setVersionId(defaultVersion(first)?.id ?? null);
        }
      });

    const loadDefs = fetch(`${basePath}/settings-browse.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`settings-browse.json: ${r.status}`);
        return r.json() as Promise<SettingDefinition[]>;
      })
      .then((defs) => {
        const map = new Map<string, SettingDefinition>();
        for (const d of defs) map.set(d.id, d);
        setDefsMap(map);
        setDefsLoaded(true);
      });

    Promise.all([loadIndex, loadDefs]).catch((err) => {
      console.error('Baselines load error:', err);
      setLoadError(String(err));
      setIndexLoaded(true);
      setDefsLoaded(true);
    });
  }, []);

  const isLoading = !indexLoaded || !defsLoaded;

  const ensureShard = useCallback(
    (id: string | null | undefined) => {
      if (!id || shards.has(id)) return;
      fetch(`${basePath}/baselines/${id}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${id}.json: ${r.status}`);
          return r.json() as Promise<BaselineShard>;
        })
        .then((s) => setShards((prev) => new Map(prev).set(s.id, s)))
        .catch((e) => setLoadError(String(e)));
    },
    [shards]
  );

  // Fetch the selected version's shard.
  useEffect(() => {
    ensureShard(versionId);
  }, [versionId, ensureShard]);

  // Search spans the active version of every family — fetch those lazily on
  // first search (OIB has all data in one file; baselines are sharded).
  const hasQuery = deferredQuery.trim() !== '';
  useEffect(() => {
    if (!hasQuery || !index) return;
    for (const f of index.families) ensureShard(defaultVersion(f)?.id);
  }, [hasQuery, index, ensureShard]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  const family: BaselineFamily | null = useMemo(
    () => index?.families.find((f) => f.baseId === baseId) ?? null,
    [index, baseId]
  );
  const version = family?.versions.find((v) => v.id === versionId) ?? null;
  const shard = versionId ? shards.get(versionId) : undefined;

  const selectFamily = useCallback(
    (id: string) => {
      setBaseId(id);
      const fam = index?.families.find((f) => f.baseId === id);
      setVersionId(fam ? (defaultVersion(fam)?.id ?? null) : null);
      setSelectedCategory(null);
      mainScrollRef.current?.scrollTo({ top: 0 });
    },
    [index]
  );

  const selectVersion = useCallback((id: string) => {
    setVersionId(id);
    setSelectedCategory(null);
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const handleSelectCategory = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      setSearchQuery('');
      mainScrollRef.current?.scrollTo({ top: 0 });
      if (!isDesktop) setSidebarOpen(false);
    },
    [isDesktop, setSidebarOpen]
  );

  // ── Selected version's settings grouped by settings-catalog category ──
  const categoryMap = useMemo(() => {
    const byCat = new Map<string, BaselineSetting[]>();
    if (!shard) return byCat;
    for (const s of shard.settings) {
      const cat = s.category ?? 'Other';
      const arr = byCat.get(cat) ?? [];
      arr.push(s);
      byCat.set(cat, arr);
    }
    return byCat;
  }, [shard]);

  const sidebarCategories = useMemo(
    () =>
      [...categoryMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, settings]) => ({ category, count: settings.length })),
    [categoryMap]
  );

  const categorySettings = useMemo(
    () => (selectedCategory ? categoryMap.get(selectedCategory) ?? [] : []),
    [categoryMap, selectedCategory]
  );
  const categoryRows = useMemo(() => buildRows(categorySettings), [categorySettings]);

  // ── Search results: matching settings per family (active version) ──
  const searchHits = useMemo(() => {
    if (!hasQuery || !index) return null;
    const q = deferredQuery.trim().toLowerCase();
    const hits: Array<{ family: BaselineFamily; shard: BaselineShard; rows: Row[] }> = [];
    for (const f of index.families) {
      const active = defaultVersion(f);
      const activeShard = active ? shards.get(active.id) : undefined;
      if (!activeShard) continue; // still loading — appears when fetched
      const rows = filterRows(buildRows(activeShard.settings), q);
      if (rows.length > 0) hits.push({ family: f, shard: activeShard, rows });
    }
    return hits;
  }, [hasQuery, index, shards, deferredQuery]);

  const totalSearchMatches = searchHits?.reduce((n, h) => n + rowCount(h.rows), 0) ?? 0;

  // ── Export ── (reflects what's on screen: search hits → matching settings;
  // a selected category → its settings; otherwise the whole version)
  const exportEntries = useMemo((): BaselineBrowseEntry[] => {
    if (searchHits) {
      return searchHits.map((h) => ({
        shard: h.shard,
        settings: h.rows.flatMap((r) => (r.type === 'leaf' ? [r.s] : r.members)),
      }));
    }
    if (shard && selectedCategory) return [{ shard, settings: categorySettings }];
    if (shard) return [{ shard, settings: shard.settings }];
    return [];
  }, [searchHits, shard, selectedCategory, categorySettings]);

  const downloadExport = useCallback(
    (format: 'csv' | 'html') => {
      if (exportEntries.length === 0) return;
      const scope = searchHits
        ? `search ${deferredQuery}`
        : `${shard?.displayName} ${shard?.displayVersion}${selectedCategory ? ` ${selectedCategory}` : ''}`;
      const title = searchHits
        ? `Microsoft Security Baselines — search "${deferredQuery}"`
        : `${shard?.displayName} — ${shard?.displayVersion}${selectedCategory ? ` › ${selectedCategory}` : ''}`;
      const content =
        format === 'csv'
          ? generateBaselineBrowseCsv(exportEntries)
          : generateBaselineBrowseHtml(exportEntries, title);
      downloadTextFile(`ms-baseline-${scope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`, content, format);
    },
    [exportEntries, searchHits, deferredQuery, shard, selectedCategory]
  );

  // ── Display metadata ──
  const fetchedDate = index
    ? new Date(index.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const totalVersions = index?.families.reduce((n, f) => n + f.versions.length, 0) ?? 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-[calc(100dvh-96px)]">
      {/* ── Header ── */}
      <div className="px-4 sm:px-6 py-3 md:py-4 border-b border-fluent-border bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-fluent-2xl font-semibold text-fluent-text">
              Microsoft Security Baselines
            </h1>
            <p className="text-fluent-sm text-fluent-text-secondary mt-0.5">
              Microsoft&apos;s recommended security defaults for Intune-managed devices, straight from the Graph API.{' '}
              <a
                href="https://learn.microsoft.com/en-us/intune/intune-service/protect/security-baselines"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fluent-blue hover:underline"
              >
                Learn more →
              </a>
            </p>
            <p className="text-fluent-sm text-fluent-text-secondary mt-1">
              {isLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
                  Loading…
                </span>
              ) : (
                <>
                  {index?.families.length} baselines · {totalVersions} versions
                  {fetchedDate && <>{' · '}fetched {fetchedDate}</>}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div>
          <p className="text-fluent-sm text-fluent-text-secondary mb-2">
            Search baseline settings by name, description, value, or definition ID
          </p>
          <div className="flex">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fluent-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a setting"
                className="w-full pl-10 pr-8 py-2 text-fluent-base bg-white dark:bg-[#2c2c2e] border border-fluent-border-strong rounded
                           focus:outline-none focus:border-fluent-blue focus:ring-1 focus:ring-fluent-blue
                           placeholder:text-fluent-text-disabled"
                aria-label="Search baseline settings"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="search-clear-btn absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                             text-fluent-text-secondary hover:text-fluent-text rounded-full"
                  aria-label="Clear search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {isSearchPending && (
                <div className="absolute right-8 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter row: baseline + version pickers (OIB's platform-pill slot) */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <label htmlFor="baseline-family" className="sr-only">Baseline</label>
          <select
            id="baseline-family"
            value={baseId ?? ''}
            onChange={(e) => selectFamily(e.target.value)}
            className={`${selectClass} max-w-full`}
            disabled={isLoading}
          >
            {(index?.families ?? []).map((f) => (
              <option key={f.baseId} value={f.baseId}>
                {f.displayName}
              </option>
            ))}
          </select>

          <label htmlFor="baseline-version" className="sr-only">Version</label>
          <select
            id="baseline-version"
            value={versionId ?? ''}
            onChange={(e) => selectVersion(e.target.value)}
            className={`${selectClass} max-w-full`}
            disabled={isLoading || !family}
          >
            {(family?.versions ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayVersion}
              </option>
            ))}
          </select>

          {/* Export — click dropdown (native <details>), mirrors the OIB browser */}
          <ExportMenu
            className="relative group/export ml-auto"
            disabled={isLoading || exportEntries.length === 0}
            onExport={downloadExport}
          />
        </div>
      </div>

      <BrowserSidebar
        isDesktop={isDesktop}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarWidth={sidebarWidth}
        sidebarHydrated={sidebarHydrated}
        handleResizeStart={handleResizeStart}
        sidebarBody={
          isLoading || (versionId && !shard) ? (
            <div className="flex flex-col items-center justify-center py-8 text-fluent-text-secondary">
              <div className="w-6 h-6 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-fluent-sm">Loading…</p>
            </div>
          ) : (
            <BaselineSidebarTree
              familyName={family?.displayName ?? ''}
              categories={sidebarCategories}
              selectedCategory={selectedCategory}
              onSelect={handleSelectCategory}
            />
          )
        }
      >
        {/* ── Settings panel ── */}
        <div ref={mainScrollRef} className="flex-1 overflow-y-auto fluent-scroll bg-white dark:bg-[#1c1c1e]">
          {searchHits ? (
            searchHits.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
                <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-fluent-lg font-medium mb-1">No results for &ldquo;{deferredQuery}&rdquo;</p>
                <p className="text-fluent-base">Try a different search term.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-fluent-border bg-white dark:bg-[#1c1c1e] sticky top-0 z-10">
                  <div className="text-fluent-base font-semibold text-fluent-blue">
                    {totalSearchMatches.toLocaleString()} matching {totalSearchMatches === 1 ? 'setting' : 'settings'} across {searchHits.length} {searchHits.length === 1 ? 'baseline' : 'baselines'}
                  </div>
                </div>
                {searchHits.map((hit) => (
                  <Section
                    key={hit.shard.id}
                    title={hit.family.displayName}
                    breadcrumb={hit.shard.displayVersion}
                    count={rowCount(hit.rows)}
                  >
                    <SettingRows
                      rows={hit.rows}
                      defsMap={defsMap}
                      versionLabel={hit.shard.displayVersion}
                      highlightQuery={deferredQuery}
                    />
                  </Section>
                ))}
              </div>
            )
          ) : selectedCategory && shard ? (
            <div>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-fluent-border bg-fluent-bg-alt sticky top-0 z-10">
                <span className="text-fluent-sm text-fluent-text-secondary">
                  {family?.displayName} › {version?.displayVersion} ›
                </span>
                <span className="text-fluent-base font-semibold text-fluent-text">
                  {selectedCategory}
                </span>
                <span className="text-fluent-sm text-fluent-text-secondary">
                  ({rowCount(categoryRows)} {rowCount(categoryRows) === 1 ? 'setting' : 'settings'})
                </span>
              </div>
              <SettingRows
                rows={categoryRows}
                defsMap={defsMap}
                versionLabel={shard.displayVersion}
              />
            </div>
          ) : isLoading || (versionId && !shard) ? (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
              <div className="w-8 h-8 border-3 border-fluent-blue border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-fluent-base">Loading baseline data…</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary px-4">
              <p className="text-fluent-lg font-medium text-fluent-text mb-1">Failed to load baseline data</p>
              <p className="text-fluent-base">{loadError}</p>
              <p className="text-fluent-sm mt-2">
                Run <code className="font-mono bg-fluent-bg-alt px-1 rounded">npm run fetch-baselines</code> to generate the data files.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <p className="text-fluent-lg font-medium mb-1">Select a category to view settings</p>
              <p className="text-fluent-base">
                Or use the search bar above to find specific settings
              </p>
            </div>
          )}
        </div>
      </BrowserSidebar>
    </div>
  );
}
