'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { SettingDefinition } from '@/lib/types';
import { WindowsIcon, MacOSIcon } from './PlatformIcons';
import type { OIBOutput, OIBPolicy, OIBValue, FlatSetting } from '@/lib/oib-types';
import {
  parsePolicy,
  flattenOIBSettings,
  buildSidebarTree,
  type OIBFolderNode,
  type OIBCategoryNode,
} from '@/lib/oib-types';

// ── Value resolution ─────────────────────────────────────────────────────────

function resolveValue(value: OIBValue, def: SettingDefinition | undefined): string {
  switch (value.type) {
    case 'choice': {
      const option = def?.options?.find((o) => o.itemId === value.optionId);
      if (option) return option.displayName;
      // Fallback: strip the definition ID prefix, show the suffix
      const parts = value.optionId.split('_');
      return parts[parts.length - 1] || value.optionId;
    }
    case 'simple':
      return value.value == null ? '' : String(value.value);
    case 'choiceCollection':
      return value.optionIds
        .map((id) => {
          const option = def?.options?.find((o) => o.itemId === id);
          return option?.displayName ?? id;
        })
        .join(', ');
    case 'simpleCollection':
      return value.values.map((v) => (v == null ? '' : String(v))).join(', ');
    default:
      return '';
  }
}

function getValueBadgeClass(resolved: string): string {
  const v = resolved.toLowerCase();
  if (!v) return 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300';
  if (/\benabled?\b|\ballow(ed)?\b|\btrue\b/.test(v))
    return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
  if (/\bdisabled?\b|\bblock(ed)?\b|\bdeny\b|\bnot allow\b|\bfalse\b/.test(v))
    return 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200';
  if (/\baudit\b|\bwarn\b/.test(v))
    return 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200';
  return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
}

// ── Search ───────────────────────────────────────────────────────────────────

interface SearchHit {
  policy: OIBPolicy;
  parsedCategory: string;
  parsedFolder: string;
  matchingSettings: FlatSetting[];
}

function settingMatchesQuery(
  flat: FlatSetting,
  def: SettingDefinition | undefined,
  q: string,
): boolean {
  if (def?.displayName.toLowerCase().includes(q)) return true;
  if (def?.description?.toLowerCase().includes(q)) return true;
  if (flat.definitionId.toLowerCase().includes(q)) return true;
  if (def?.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
  return false;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScopeBadge({ scope }: { scope: 'D' | 'U' }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${
        scope === 'D'
          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
          : 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'
      }`}
      title={scope === 'D' ? 'Device scope' : 'User scope'}
    >
      {scope === 'D' ? 'Device' : 'User'}
    </span>
  );
}

function TierBadge({ tier }: { tier: 'ES' | 'SC' | null }) {
  if (!tier) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${
        tier === 'ES'
          ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
      }`}
      title={tier === 'ES' ? 'Essential Security' : 'Security Configuration'}
    >
      {tier}
    </span>
  );
}

interface PolicySectionProps {
  policy: OIBPolicy;
  defsMap: Map<string, SettingDefinition>;
  highlightSettings?: Set<string>; // definitionIds to highlight in search
}

function PolicySection({ policy, defsMap, highlightSettings }: PolicySectionProps) {
  const parsed = parsePolicy(policy);
  const allFlat = flattenOIBSettings(policy.settings);
  const displayed = highlightSettings
    ? allFlat.filter((s) => highlightSettings.has(s.definitionId))
    : allFlat;

  if (displayed.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Policy header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-fluent-bg-alt border-b border-fluent-border sticky top-0 z-10">
        <ScopeBadge scope={parsed.scope} />
        <TierBadge tier={parsed.tier} />
        <span className="text-[13px] font-medium text-fluent-text flex-1 min-w-0 truncate">
          {parsed.policyLabel}
          <span className="text-fluent-text-secondary font-normal ml-1">v{parsed.version}</span>
        </span>
        <a
          href={policy.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-fluent-text-secondary hover:text-fluent-blue transition-colors"
          title="View policy on GitHub"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </div>

      {/* Settings rows */}
      <div>
        {displayed.map((flat, i) => {
          const def = defsMap.get(flat.definitionId);
          const resolved = resolveValue(flat.value, def);
          const displayName = def?.displayName ?? flat.definitionId;

          return (
            <div
              key={`${flat.definitionId}-${i}`}
              className="flex items-start gap-3 px-4 py-2.5 border-b border-fluent-border/50 hover:bg-fluent-bg-alt/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-fluent-text leading-snug">{displayName}</p>
                {def?.description && (
                  <p className="text-[11px] text-fluent-text-secondary mt-0.5 leading-snug line-clamp-2">
                    {def.description}
                  </p>
                )}
              </div>
              {resolved && (
                <span
                  className={`flex-shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium leading-snug max-w-[240px] text-right ${getValueBadgeClass(resolved)}`}
                >
                  {resolved}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  tree: OIBFolderNode[];
  selectedNode: { folder: string; category: string } | null;
  onSelect: (node: { folder: string; category: string }) => void;
}

function Sidebar({ tree, selectedNode, onSelect }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleFolder = (folder: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  };

  return (
    <nav className="py-2" aria-label="OIB category tree">
      {tree.map((folderNode) => {
        const isCollapsed = collapsed.has(folderNode.folder);
        return (
          <div key={folderNode.folder}>
            {/* Folder header */}
            <button
              onClick={() => toggleFolder(folderNode.folder)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-fluent-text-secondary hover:text-fluent-text hover:bg-fluent-bg-alt transition-colors"
            >
              <svg
                className={`w-3 h-3 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {folderNode.label}
            </button>

            {/* Categories */}
            {!isCollapsed && (
              <div className="mb-1">
                {folderNode.categories.map((cat) => {
                  const isSelected =
                    selectedNode?.folder === cat.folder &&
                    selectedNode?.category === cat.category;
                  return (
                    <button
                      key={`${cat.folder}/${cat.category}`}
                      onClick={() => onSelect({ folder: cat.folder, category: cat.category })}
                      className={`w-full flex items-center justify-between gap-2 pl-6 pr-3 py-1.5 text-left text-[13px] transition-colors ${
                        isSelected
                          ? 'bg-fluent-blue/10 text-fluent-blue font-medium'
                          : 'text-fluent-text hover:bg-fluent-bg-alt hover:text-fluent-text'
                      }`}
                    >
                      <span className="truncate">{cat.category}</span>
                      <span className="flex-shrink-0 text-[11px] text-fluent-text-secondary tabular-nums">
                        {cat.policyCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OIBBrowser() {
  const [oibData, setOibData] = useState<OIBOutput | null>(null);
  const [defsMap, setDefsMap] = useState<Map<string, SettingDefinition>>(new Map());
  const [oibLoaded, setOibLoaded] = useState(false);
  const [defsLoaded, setDefsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<{ folder: string; category: string } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // ── Load both data files in parallel ──
  useEffect(() => {
    const basePath =
      (typeof process !== 'undefined' &&
        (process.env as Record<string, string>).__NEXT_ROUTER_BASEPATH) ||
      '';

    const loadOib = fetch(`${basePath}/oib-data.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`oib-data.json: ${r.status}`);
        return r.json() as Promise<OIBOutput>;
      })
      .then((data) => {
        setOibData(data);
        setOibLoaded(true);
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

    Promise.all([loadOib, loadDefs]).catch((err) => {
      console.error('OIB load error:', err);
      setLoadError(String(err));
      setOibLoaded(true);
      setDefsLoaded(true);
    });
  }, []);

  const isLoading = !oibLoaded || !defsLoaded;

  // ── Sidebar tree (filtered by folder) ──
  const sidebarTree = useMemo(() => {
    if (!oibData) return [];
    const policies = selectedFolder
      ? oibData.policies.filter((p) => p.oibFolder === selectedFolder)
      : oibData.policies;
    return buildSidebarTree(policies);
  }, [oibData, selectedFolder]);

  // ── Policies for selected category ──
  const categoryPolicies = useMemo(() => {
    if (!oibData || !selectedNode) return [];
    return oibData.policies.filter((p) => {
      const parsed = parsePolicy(p);
      return p.oibFolder === selectedNode.folder && parsed.category === selectedNode.category;
    });
  }, [oibData, selectedNode]);

  // ── Search results ──
  const searchHits = useMemo((): SearchHit[] | null => {
    if (!oibData || !searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const hits: SearchHit[] = [];

    const policies = selectedFolder
      ? oibData.policies.filter((p) => p.oibFolder === selectedFolder)
      : oibData.policies;

    for (const policy of policies) {
      const flat = flattenOIBSettings(policy.settings);
      const matching = flat.filter((s) => settingMatchesQuery(s, defsMap.get(s.definitionId), q));
      if (matching.length > 0) {
        const parsed = parsePolicy(policy);
        hits.push({
          policy,
          parsedCategory: parsed.category,
          parsedFolder: policy.oibFolder,
          matchingSettings: matching,
        });
      }
    }

    return hits;
  }, [oibData, defsMap, searchQuery, selectedFolder]);

  const handleSelect = useCallback(
    (node: { folder: string; category: string }) => {
      setSelectedNode(node);
      setSearchQuery('');
      mainScrollRef.current?.scrollTo({ top: 0 });
    },
    [],
  );

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const handleFolderFilter = useCallback((folder: string | null) => {
    setSelectedFolder(folder);
    // Clear selected node if it no longer belongs to the active folder
    if (folder && selectedNode && selectedNode.folder !== folder) {
      setSelectedNode(null);
    }
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedNode]);

  // ── Fetch metadata for display ──
  const fetchedDate = oibData
    ? new Date(oibData.fetchedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const commitSha = oibData?.oibCommitSha?.slice(0, 7) ?? null;
  const totalPolicies = oibData?.policies.length ?? 0;

  const FOLDER_FILTERS = [
    { folder: 'WINDOWS',    label: 'Windows',     Icon: WindowsIcon },
    { folder: 'MACOS',      label: 'macOS',       Icon: MacOSIcon },
    { folder: 'WINDOWS365', label: 'Windows 365', Icon: WindowsIcon },
  ];

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-[calc(100dvh-96px)]">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3 md:py-4 border-b border-fluent-border bg-white dark:bg-[#1c1c1e]">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-fluent-2xl font-semibold text-fluent-text">
              OpenIntuneBaseline
            </h1>
            <p className="text-fluent-sm text-fluent-text-secondary mt-1">
              {isLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
                  Loading…
                </span>
              ) : (
                <>
                  {totalPolicies} policies
                  {fetchedDate && (
                    <>
                      {' · '}commit{' '}
                      <a
                        href={`https://github.com/SkipToTheEndpoint/OpenIntuneBaseline/commit/${oibData?.oibCommitSha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-fluent-blue hover:underline font-mono"
                      >
                        {commitSha}
                      </a>
                      {' · '}fetched {fetchedDate}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex-shrink-0 p-1.5 rounded text-fluent-text-secondary hover:text-fluent-text hover:bg-fluent-bg-alt transition-colors"
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fluent-text-secondary pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search configured settings by name, description, or CSP path…"
            className="w-full pl-9 pr-8 py-2 text-[13px] rounded-md border border-fluent-border bg-fluent-bg-alt text-fluent-text placeholder-fluent-text-secondary focus:outline-none focus:ring-2 focus:ring-fluent-blue/40 focus:border-fluent-blue transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fluent-text-secondary hover:text-fluent-text"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Platform / folder filters */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-fluent-sm text-fluent-text-secondary font-medium">Platform:</span>
          <button
            onClick={() => handleFolderFilter(null)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-fluent-sm border transition-colors ${
              selectedFolder === null
                ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
                : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
            }`}
          >
            All
          </button>
          {FOLDER_FILTERS.map(({ folder, label, Icon }) => (
            <button
              key={folder}
              onClick={() => handleFolderFilter(folder)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-fluent-sm border transition-colors ${
                selectedFolder === folder
                  ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
                  : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-64 flex-shrink-0 border-r border-fluent-border bg-fluent-bg overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-6 text-[13px] text-fluent-text-secondary">Loading…</div>
            ) : (
              <Sidebar tree={sidebarTree} selectedNode={selectedNode} onSelect={handleSelect} />
            )}
          </aside>
        )}

        {/* Main panel */}
        <main ref={mainScrollRef} className="flex-1 min-w-0 overflow-y-auto bg-fluent-bg">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-fluent-text-secondary text-[14px]">
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto mb-3 animate-spin text-fluent-blue" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading baseline data…
              </div>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm px-4">
                <p className="text-fluent-text font-medium mb-1">Failed to load OIB data</p>
                <p className="text-[12px] text-fluent-text-secondary">{loadError}</p>
                <p className="text-[12px] text-fluent-text-secondary mt-2">
                  Run <code className="font-mono bg-fluent-bg-alt px-1 rounded">npm run fetch-oib</code> to generate the data file.
                </p>
              </div>
            </div>
          ) : searchQuery.trim() ? (
            // ── Search results ──
            <SearchResultsPanel hits={searchHits ?? []} defsMap={defsMap} query={searchQuery} />
          ) : selectedNode ? (
            // ── Category view ──
            <CategoryPanel
              folder={selectedNode.folder}
              category={selectedNode.category}
              policies={categoryPolicies}
              defsMap={defsMap}
            />
          ) : (
            // ── Empty state ──
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Panel components ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
      <svg className="w-10 h-10 text-fluent-text-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div>
        <p className="text-[14px] font-medium text-fluent-text">Select a category</p>
        <p className="text-[12px] text-fluent-text-secondary mt-1">
          Choose a category from the sidebar, or search to find a specific setting.
        </p>
      </div>
    </div>
  );
}

interface CategoryPanelProps {
  folder: string;
  category: string;
  policies: OIBPolicy[];
  defsMap: Map<string, SettingDefinition>;
}

function CategoryPanel({ folder, category, policies, defsMap }: CategoryPanelProps) {
  const totalSettings = useMemo(
    () => policies.reduce((n, p) => n + flattenOIBSettings(p.settings).length, 0),
    [policies],
  );

  const folderLabel: Record<string, string> = { WINDOWS: 'Windows', MACOS: 'macOS', WINDOWS365: 'Windows 365' };

  return (
    <div>
      {/* Category header */}
      <div className="px-4 py-4 border-b border-fluent-border">
        <p className="text-[11px] text-fluent-text-secondary uppercase tracking-wider mb-0.5">
          {folderLabel[folder] ?? folder}
        </p>
        <h2 className="text-[18px] font-semibold text-fluent-text">{category}</h2>
        <p className="text-[12px] text-fluent-text-secondary mt-0.5">
          {policies.length} {policies.length === 1 ? 'policy' : 'policies'} · {totalSettings} configured settings
        </p>
      </div>

      {/* Policies */}
      <div className="py-4 px-0">
        {policies.map((policy) => (
          <PolicySection key={policy.name} policy={policy} defsMap={defsMap} />
        ))}
      </div>
    </div>
  );
}

interface SearchResultsPanelProps {
  hits: SearchHit[];
  defsMap: Map<string, SettingDefinition>;
  query: string;
}

function SearchResultsPanel({ hits, defsMap, query }: SearchResultsPanelProps) {
  const totalMatches = hits.reduce((n, h) => n + h.matchingSettings.length, 0);
  const folderLabel: Record<string, string> = { WINDOWS: 'Windows', MACOS: 'macOS', WINDOWS365: 'Windows 365' };

  if (hits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
        <p className="text-[14px] font-medium text-fluent-text">No results for &ldquo;{query}&rdquo;</p>
        <p className="text-[12px] text-fluent-text-secondary">Try a different search term.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-4 border-b border-fluent-border">
        <h2 className="text-[15px] font-semibold text-fluent-text">
          Search results for &ldquo;{query}&rdquo;
        </h2>
        <p className="text-[12px] text-fluent-text-secondary mt-0.5">
          {totalMatches} configured {totalMatches === 1 ? 'setting' : 'settings'} across {hits.length}{' '}
          {hits.length === 1 ? 'policy' : 'policies'}
        </p>
      </div>

      <div className="py-4">
        {hits.map((hit) => {
          const highlightIds = new Set(hit.matchingSettings.map((s) => s.definitionId));
          const parsed = parsePolicy(hit.policy);
          return (
            <div key={hit.policy.name} className="mb-2">
              {/* Folder / category breadcrumb above policy */}
              <p className="px-4 pb-1 text-[11px] text-fluent-text-secondary">
                {folderLabel[hit.parsedFolder] ?? hit.parsedFolder} › {hit.parsedCategory}
              </p>
              <PolicySection policy={hit.policy} defsMap={defsMap} highlightSettings={highlightIds} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
