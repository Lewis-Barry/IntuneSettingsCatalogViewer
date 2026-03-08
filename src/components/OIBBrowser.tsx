'use client';

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import type { SettingDefinition, MatchSource } from '@/lib/types';
import { detectMatchSources } from '@/lib/types';
import { getAsrRuleInfo } from '@/lib/asr-rules';
import { WindowsIcon, MacOSIcon } from './PlatformIcons';
import SettingRow from './SettingRow';
import { useIsDesktop } from '@/lib/useMediaQuery';
import type { OIBOutput, OIBPolicy, OIBValue, FlatSetting } from '@/lib/oib-types';
import {
  parsePolicy,
  flattenOIBSettings,
  buildSidebarTree,
  type OIBFolderNode,
  type OIBCategoryNode,
} from '@/lib/oib-types';
import CABExportDialog from './CABExportDialog';

// ── (Value resolution removed — OIB selections are now shown in the expanded detail panel) ──

// ── Search ───────────────────────────────────────────────────────────────────

interface SearchHit {
  policy: OIBPolicy;
  parsedCategory: string;
  parsedFolder: string;
  matchingSettings: Array<{ flat: FlatSetting; matchSources: MatchSource[] }>;
}

/** Detect match sources for an OIB setting, returning empty array if no match. */
function getOIBMatchSources(
  flat: FlatSetting,
  def: SettingDefinition | undefined,
  query: string,
): MatchSource[] {
  if (!def) {
    // No definition — fall back to simple ID match
    if (flat.definitionId.toLowerCase().includes(query)) return ['keywords'];
    return [];
  }
  const asrInfo = getAsrRuleInfo(def.id);
  const extraKeywords = asrInfo ? [asrInfo.guid] : undefined;
  const sources = detectMatchSources(def, query, extraKeywords);
  // Also check the raw definitionId (may differ from setting.name)
  if (sources.length === 0 && flat.definitionId.toLowerCase().includes(query)) {
    sources.push('keywords');
  }
  return sources;
}

// ── Policy Scope & Tier Badges ───────────────────────────────────────────────

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

// ── Policy Section (collapsible, matches SettingsList search group style) ────

interface PolicySectionProps {
  policy: OIBPolicy;
  defsMap: Map<string, SettingDefinition>;
  /** Map of definitionId → MatchSource[] for search-result highlighting */
  highlightSettings?: Map<string, MatchSource[]>;
  highlightQuery?: string;
  breadcrumb?: string;
  defaultCollapsed?: boolean;
}

const PolicySection = memo(function PolicySection({
  policy,
  defsMap,
  highlightSettings,
  highlightQuery,
  breadcrumb,
  defaultCollapsed = false,
}: PolicySectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const parsed = parsePolicy(policy);
  const allFlat = useMemo(() => flattenOIBSettings(policy.settings), [policy.settings]);
  const displayed = highlightSettings
    ? allFlat.filter((s) => highlightSettings.has(s.definitionId))
    : allFlat;

  // Helper to look up match sources for a given setting
  const getMatchSources = (defId: string): MatchSource[] | undefined =>
    highlightSettings?.get(defId);

  if (displayed.length === 0) return null;

  return (
    <div className="border-b border-fluent-border">
      {/* Policy header bar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-4 py-2.5 bg-fluent-bg-alt hover:bg-fluent-border transition-colors text-left"
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
              <span className="text-fluent-sm text-fluent-text-secondary md:truncate md:max-w-[180px]">
                {breadcrumb}
              </span>
              <svg className="w-2.5 h-2.5 text-fluent-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}
          <span className="text-fluent-base font-semibold text-fluent-text truncate">
            {parsed.policyLabel}
          </span>
          <span className="text-fluent-xs text-fluent-text-secondary font-normal flex-shrink-0">
            v{parsed.version}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ScopeBadge scope={parsed.scope} />
          <TierBadge tier={parsed.tier} />
          <span className="text-fluent-sm text-fluent-text-secondary">
            ({displayed.length})
          </span>
        </div>

        <a
          href={policy.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-fluent-text-secondary hover:text-fluent-blue transition-colors ml-1"
          title="View policy on GitHub"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </button>

      {/* Settings rows */}
      {!collapsed && (
        <div role="table" aria-label={`Settings from ${parsed.policyLabel}`}>
          {/* Column header — matches main browser (scope omitted — shown at policy level) */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-fluent-border bg-fluent-bg-alt text-fluent-sm font-semibold text-fluent-text-secondary">
            <span className="w-5" />
            <span className="flex-1">Setting name</span>
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
              <span className="w-[6rem] text-center">Type</span>
              <span className="w-[3.5rem]" />
              <span className="w-5" />
            </div>
          </div>

          {displayed.map((flat, i) => {
            const def = defsMap.get(flat.definitionId);
            if (!def) {
              return (
                <div
                  key={`${flat.definitionId}-${i}`}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-fluent-border/50 hover:bg-fluent-bg-alt/50 transition-colors"
                >
                  <span className="w-5 flex-shrink-0" />
                  <span className="flex-1 text-fluent-base text-fluent-text-secondary truncate font-mono text-[12px]">
                    {flat.definitionId}
                  </span>
                </div>
              );
            }

            // Extract OIB selection info for the expanded detail panel
            const oibValue = flat.value;
            let activeOptionIds: string[] | undefined;
            let activeSimpleValue: string | undefined;
            if (oibValue.type === 'choice') {
              activeOptionIds = [oibValue.optionId];
            } else if (oibValue.type === 'choiceCollection') {
              activeOptionIds = oibValue.optionIds;
            } else if (oibValue.type === 'simple') {
              activeSimpleValue = oibValue.value == null ? undefined : String(oibValue.value);
            } else if (oibValue.type === 'simpleCollection') {
              activeSimpleValue = oibValue.values.map((v) => (v == null ? '' : String(v))).join(', ');
            }

            return (
              <SettingRow
                key={`${flat.definitionId}-${i}`}
                setting={def}
                highlightQuery={highlightQuery}
                matchSources={getMatchSources(flat.definitionId)}
                activeOptionIds={activeOptionIds}
                activeSimpleValue={activeSimpleValue}
                hideScope
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

// ── OIB Sidebar ──────────────────────────────────────────────────────────────

interface OIBSidebarTreeProps {
  tree: OIBFolderNode[];
  selectedNode: { folder: string; category: string } | null;
  onSelect: (node: { folder: string; category: string }) => void;
}

const OIBSidebarTree = memo(function OIBSidebarTree({
  tree,
  selectedNode,
  onSelect,
}: OIBSidebarTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleFolder = useCallback((folder: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  }, []);

  return (
    <div className="fluent-scroll overflow-y-auto">
      <h3 className="px-2 py-2 text-fluent-sm font-semibold text-fluent-text-secondary uppercase tracking-wide">
        Browse by category
      </h3>
      <div className="space-y-0.5">
        {tree.map((folderNode) => {
          const isCollapsed = collapsed.has(folderNode.folder);
          const totalPolicies = folderNode.categories.reduce((sum, c) => sum + c.policyCount, 0);

          return (
            <div key={folderNode.folder}>
              {/* Folder header */}
              <button
                type="button"
                className="category-item"
                style={{ paddingLeft: '8px' }}
                onClick={() => toggleFolder(folderNode.folder)}
                role="treeitem"
                aria-expanded={!isCollapsed}
              >
                <span
                  className="category-chevron w-4 h-4 flex items-center justify-center flex-shrink-0 text-fluent-text-secondary hover:text-fluent-text"
                  aria-hidden="true"
                >
                  <svg
                    className={`w-3 h-3 transition-transform duration-150 ${!isCollapsed ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
                <span className="flex-1 truncate text-fluent-base font-semibold">
                  {folderNode.label}
                </span>
                <span className="text-fluent-xs text-fluent-text-secondary ml-1 flex-shrink-0">
                  {totalPolicies}
                </span>
              </button>

              {/* Categories under folder */}
              {!isCollapsed && (
                <div role="group">
                  {folderNode.categories.map((cat) => {
                    const isSelected =
                      selectedNode?.folder === cat.folder &&
                      selectedNode?.category === cat.category;
                    return (
                      <button
                        key={`${cat.folder}/${cat.category}`}
                        type="button"
                        className={`category-item ${isSelected ? 'category-item-active' : ''}`}
                        style={{ paddingLeft: `${8 + 14}px` }}
                        onClick={() => onSelect({ folder: cat.folder, category: cat.category })}
                        role="treeitem"
                        aria-selected={isSelected}
                      >
                        <span className="category-chevron-spacer w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 truncate text-fluent-base">
                          {cat.category}
                        </span>
                        <span className="text-fluent-xs text-fluent-text-secondary ml-1 flex-shrink-0">
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
      </div>
    </div>
  );
});

// ── Main Component ───────────────────────────────────────────────────────────

export default function OIBBrowser() {
  const [oibData, setOibData] = useState<OIBOutput | null>(null);
  const [defsMap, setDefsMap] = useState<Map<string, SettingDefinition>>(new Map());
  const [oibLoaded, setOibLoaded] = useState(false);
  const [defsLoaded, setDefsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<{ folder: string; category: string } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchPending, setIsSearchPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isDesktop = useIsDesktop();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const MIN_SIDEBAR = 200;
  const MAX_SIDEBAR = 600;

  const [showCABDialog, setShowCABDialog] = useState(false);

  const [fabHidden, setFabHidden] = useState(false);
  const fabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // ── FAB auto-hide (mobile) ──
  const scheduleFabShow = useCallback(() => {
    if (fabTimerRef.current) clearTimeout(fabTimerRef.current);
    fabTimerRef.current = setTimeout(() => setFabHidden(false), 800);
  }, []);

  const hideFab = useCallback(() => {
    setFabHidden(true);
    scheduleFabShow();
  }, [scheduleFabShow]);

  useEffect(() => {
    if (isDesktop) return;
    const onTouchStart = (e: TouchEvent) => {
      if (fabRef.current?.contains(e.target as Node)) return;
      hideFab();
    };
    const onTouchMove = () => hideFab();
    const vv = window.visualViewport;
    let lastHeight = vv?.height ?? window.innerHeight;
    const onViewportResize = () => {
      const currentHeight = vv?.height ?? window.innerHeight;
      if (currentHeight < lastHeight - 50) {
        setFabHidden(true);
        if (fabTimerRef.current) clearTimeout(fabTimerRef.current);
      } else if (currentHeight > lastHeight + 50) {
        scheduleFabShow();
      }
      lastHeight = currentHeight;
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    vv?.addEventListener('resize', onViewportResize);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      vv?.removeEventListener('resize', onViewportResize);
      if (fabTimerRef.current) clearTimeout(fabTimerRef.current);
    };
  }, [isDesktop, hideFab, scheduleFabShow]);

  useEffect(() => {
    const isMobile = !window.matchMedia('(min-width: 768px)').matches;
    if (isMobile) setSidebarOpen(false);
    setSidebarHydrated(true);
  }, []);

  // ── Sidebar resize (desktop) ──
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX;
      setSidebarWidth(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startWidth + delta)));
    };
    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // ── Load data ──
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

  // ── Debounced search ──
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setDebouncedQuery('');
      setIsSearchPending(false);
      return;
    }
    setIsSearchPending(true);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      setIsSearchPending(false);
    }, 200);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setIsSearchPending(false);
    searchInputRef.current?.focus();
  }, []);

  // ── Sidebar tree ──
  const sidebarTree = useMemo(() => {
    if (!oibData) return [];
    const policies = selectedFolder
      ? oibData.policies.filter((p) => p.oibFolder === selectedFolder)
      : oibData.policies;
    return buildSidebarTree(policies);
  }, [oibData, selectedFolder]);

  // ── Category policies ──
  const categoryPolicies = useMemo(() => {
    if (!oibData || !selectedNode) return [];
    return oibData.policies.filter((p) => {
      const parsed = parsePolicy(p);
      return p.oibFolder === selectedNode.folder && parsed.category === selectedNode.category;
    });
  }, [oibData, selectedNode]);

  // ── Search results ──
  const searchHits = useMemo((): SearchHit[] | null => {
    if (!oibData || !debouncedQuery.trim()) return null;
    const q = debouncedQuery.trim().toLowerCase();
    const hits: SearchHit[] = [];
    const policies = selectedFolder
      ? oibData.policies.filter((p) => p.oibFolder === selectedFolder)
      : oibData.policies;
    for (const policy of policies) {
      const flat = flattenOIBSettings(policy.settings);
      const matching: Array<{ flat: FlatSetting; matchSources: MatchSource[] }> = [];
      for (const s of flat) {
        const sources = getOIBMatchSources(s, defsMap.get(s.definitionId), q);
        if (sources.length > 0) matching.push({ flat: s, matchSources: sources });
      }
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
  }, [oibData, defsMap, debouncedQuery, selectedFolder]);

  // ── Handlers ──
  const handleSelectCategory = useCallback(
    (node: { folder: string; category: string }) => {
      setSelectedNode(node);
      setSearchQuery('');
      setDebouncedQuery('');
      mainScrollRef.current?.scrollTo({ top: 0 });
      if (!isDesktop) setSidebarOpen(false);
    },
    [isDesktop],
  );

  const handleFolderFilter = useCallback((folder: string | null) => {
    setSelectedFolder(folder);
    setSelectedNode((prev) => {
      if (folder && prev && prev.folder !== folder) return null;
      return prev;
    });
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  // Clear selected node when folder filter removes it
  useEffect(() => {
    if (!selectedFolder || !selectedNode) return;
    if (selectedNode.folder !== selectedFolder) {
      setSelectedNode(null);
    }
  }, [selectedFolder, selectedNode]);

  // ── Display metadata ──
  const fetchedDate = oibData
    ? new Date(oibData.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const commitSha = oibData?.oibCommitSha?.slice(0, 7) ?? null;
  const totalPolicies = oibData?.policies.length ?? 0;

  const FOLDER_FILTERS = [
    { folder: 'WINDOWS', label: 'Windows', Icon: WindowsIcon },
    { folder: 'MACOS', label: 'macOS', Icon: MacOSIcon },
    { folder: 'WINDOWS365', label: 'Windows 365', Icon: WindowsIcon },
  ];

  const hasSearchResults = searchHits !== null;
  const totalSearchMatches = searchHits?.reduce((n, h) => n + h.matchingSettings.length, 0) ?? 0;
  const FOLDER_LABELS: Record<string, string> = { WINDOWS: 'Windows', MACOS: 'macOS', WINDOWS365: 'Windows 365' };

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-[calc(100dvh-96px)]">
      {/* ── Header ── */}
      <div className="px-4 sm:px-6 py-3 md:py-4 border-b border-fluent-border bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-fluent-2xl font-semibold text-fluent-text">
              OpenIntuneBaseline
            </h1>
            <p className="text-fluent-sm text-fluent-text-secondary mt-0.5">
              The Open Intune Baseline is a popular starting point for Intune admins.{' '}
              <a
                href="https://github.com/SkipToTheEndpoint/OpenIntuneBaseline"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fluent-blue hover:underline"
              >
                View on GitHub →
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
        </div>

        {/* Search bar */}
        <div>
          <p className="text-fluent-sm text-fluent-text-secondary mb-2">
            Search baseline settings by name, description, keywords, or CSP path
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
                onChange={handleSearchChange}
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

        {/* Platform filters + CAB export */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleFolderFilter(null)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-fluent-sm font-medium border transition-colors ${
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-fluent-sm font-medium border transition-colors ${
                selectedFolder === folder
                  ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
                  : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}

          {/* CAB export button — only available once data is loaded */}
          {!isLoading && oibData && (
            <button
              onClick={() => setShowCABDialog(true)}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-fluent-sm font-medium border transition-colors
                         bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt"
              title="Generate a Change Advisory Board document for this baseline"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CAB document
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile FAB ── */}
      {!isDesktop && !sidebarOpen && (
        <button
          ref={fabRef}
          onClick={() => setSidebarOpen(true)}
          className={`fixed bottom-6 left-4 z-50 w-12 h-12 rounded-full bg-fluent-blue text-white dark:text-[#1c1c1e] shadow-lg flex items-center justify-center hover:bg-fluent-blue-hover active:bg-fluent-blue-pressed transition-all duration-200 ${
            fabHidden ? 'opacity-25' : 'opacity-100'
          }`}
          aria-label="Open categories"
          title="Browse categories"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
      )}

      {/* ── Mobile backdrop ── */}
      {!isDesktop && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main content: sidebar + settings ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside
          className={`${!sidebarHydrated ? 'sidebar-mobile-init ' : ''}${
            isDesktop
              ? 'flex-shrink-0 border-r border-fluent-border bg-white dark:bg-[#1c1c1e] overflow-hidden transition-all duration-200'
              : `fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[360px] bg-white dark:bg-[#1c1c1e] shadow-2xl transition-transform duration-300 ease-in-out ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`
          }`}
          style={isDesktop ? { width: sidebarOpen ? sidebarWidth : 0 } : undefined}
        >
          {!isDesktop && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-fluent-border bg-fluent-bg-alt">
              <span className="text-fluent-base font-semibold">Categories</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-fluent-bg text-fluent-text-secondary hover:text-fluent-text transition-colors"
                aria-label="Close categories"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <div className="h-full overflow-y-auto fluent-scroll py-2" style={isDesktop ? { minWidth: MIN_SIDEBAR } : undefined}>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-fluent-text-secondary">
                <div className="w-6 h-6 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-fluent-sm">Loading…</p>
              </div>
            ) : (
              <OIBSidebarTree
                tree={sidebarTree}
                selectedNode={selectedNode}
                onSelect={handleSelectCategory}
              />
            )}
          </div>
        </aside>

        {/* Desktop resize handle + toggle */}
        {isDesktop && (
          <div className={`flex-shrink-0 flex flex-col relative${!sidebarHydrated ? ' sidebar-mobile-init' : ''}`}>
            {sidebarOpen && (
              <div
                className="absolute inset-y-0 -left-1 w-2 cursor-col-resize z-20 group"
                onMouseDown={handleResizeStart}
                title="Drag to resize sidebar"
              >
                <div className="absolute inset-y-0 left-[3px] w-px bg-transparent group-hover:bg-fluent-blue transition-colors" />
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex-shrink-0 w-8 h-full flex items-center justify-center bg-fluent-bg hover:bg-fluent-bg-alt border-r border-fluent-border transition-colors"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <svg
                className={`w-3.5 h-3.5 text-fluent-text-secondary transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Settings panel ── */}
        <div ref={mainScrollRef} className="flex-1 overflow-y-auto fluent-scroll bg-white dark:bg-[#1c1c1e]">
          {hasSearchResults ? (
            searchHits!.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
                <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-fluent-lg font-medium mb-1">No results for &ldquo;{debouncedQuery}&rdquo;</p>
                <p className="text-fluent-base">Try a different search term.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-fluent-border bg-white dark:bg-[#1c1c1e] sticky top-0 z-10">
                  <div className="text-fluent-base font-semibold text-fluent-blue">
                    {totalSearchMatches.toLocaleString()} matching {totalSearchMatches === 1 ? 'setting' : 'settings'} across {searchHits!.length} {searchHits!.length === 1 ? 'policy' : 'policies'}
                  </div>
                </div>
                {searchHits!.map((hit) => {
                  const highlightMap = new Map<string, MatchSource[]>(
                    hit.matchingSettings.map((s) => [s.flat.definitionId, s.matchSources])
                  );
                  const breadcrumb = `${FOLDER_LABELS[hit.parsedFolder] ?? hit.parsedFolder} \u203a ${hit.parsedCategory}`;
                  return (
                    <PolicySection
                      key={hit.policy.name}
                      policy={hit.policy}
                      defsMap={defsMap}
                      highlightSettings={highlightMap}
                      highlightQuery={debouncedQuery}
                      breadcrumb={breadcrumb}
                    />
                  );
                })}
              </div>
            )
          ) : selectedNode ? (
            <div>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-fluent-border bg-fluent-bg-alt sticky top-0 z-10">
                <span className="text-fluent-sm text-fluent-text-secondary">
                  {FOLDER_LABELS[selectedNode.folder] ?? selectedNode.folder} ›
                </span>
                <span className="text-fluent-base font-semibold text-fluent-text">
                  {selectedNode.category}
                </span>
                <span className="text-fluent-sm text-fluent-text-secondary">
                  ({categoryPolicies.length} {categoryPolicies.length === 1 ? 'policy' : 'policies'})
                </span>
              </div>
              {categoryPolicies.map((policy) => (
                <PolicySection
                  key={policy.name}
                  policy={policy}
                  defsMap={defsMap}
                  defaultCollapsed
                />
              ))}
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
              <div className="w-8 h-8 border-3 border-fluent-blue border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-fluent-base">Loading baseline data…</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary px-4">
              <p className="text-fluent-lg font-medium text-fluent-text mb-1">Failed to load OIB data</p>
              <p className="text-fluent-base">{loadError}</p>
              <p className="text-fluent-sm mt-2">
                Run <code className="font-mono bg-fluent-bg-alt px-1 rounded">npm run fetch-oib</code> to generate the data file.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <p className="text-fluent-lg font-medium mb-1">Select a category to view policies</p>
              <p className="text-fluent-base">
                Or use the search bar above to find specific settings
              </p>
            </div>
          )}
        </div>
      </div>

      {/* CAB export dialog */}
      {showCABDialog && oibData && (
        <CABExportDialog
          oibData={oibData}
          defsMap={defsMap}
          initialFolder={selectedFolder}
          onClose={() => setShowCABDialog(false)}
        />
      )}
    </div>
  );
}
