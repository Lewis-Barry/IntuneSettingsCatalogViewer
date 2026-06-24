'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { CategoryTreeNode, SettingDefinition } from '@/lib/types';
import CategoryTree from './CategoryTree';
import SettingsList from './SettingsList';
import BrowserSidebar, { useBrowserSidebar } from './BrowserSidebar';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { countVisibleSettings } from '@/lib/settings-grouping';

interface ProExclusiveBrowserProps {
  categoryTree: CategoryTreeNode[];
  categoryMap: Record<string, string>;
}

function getBasePath(): string {
  return (typeof process !== 'undefined' && (process.env as Record<string, string>).__NEXT_ROUTER_BASEPATH) || '';
}

export default function ProExclusiveBrowser({
  categoryTree,
  categoryMap,
}: ProExclusiveBrowserProps) {
  const [allSettings, setAllSettings] = useState<SettingDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCategoryId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const { sidebarOpen, setSidebarOpen, sidebarWidth, sidebarHydrated, handleResizeStart } = useBrowserSidebar();
  const settingsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const basePath = getBasePath();
    fetch(`${basePath}/pro-exclusive.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ settings: SettingDefinition[] }>;
      })
      .then((data) => {
        setAllSettings(data.settings || []);
        setLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoading(false);
      });
  }, []);

  // Flat map of categoryId → settings (all enterprise-only settings)
  const settingsByCategory = useMemo(() => {
    const map: Record<string, SettingDefinition[]> = {};
    for (const s of allSettings) {
      if (!map[s.categoryId]) map[s.categoryId] = [];
      map[s.categoryId].push(s);
    }
    return map;
  }, [allSettings]);

  // Category tree filtered to only categories that contain enterprise-only settings
  const filteredCategoryTree = useMemo(() => {
    if (!allSettings.length) return [];

    function filterNode(node: CategoryTreeNode): CategoryTreeNode | null {
      const filteredChildren = node.children
        .map(filterNode)
        .filter((c): c is CategoryTreeNode => c !== null);

      const ownCount = countVisibleSettings(settingsByCategory[node.id] || []);
      const descendantCount = filteredChildren.reduce((sum, c) => sum + c.settingCount, 0);
      const total = ownCount + descendantCount;

      if (total === 0) return null;
      return { ...node, children: filteredChildren, settingCount: total };
    }

    return categoryTree.map(filterNode).filter((c): c is CategoryTreeNode => c !== null);
  }, [allSettings, categoryTree, settingsByCategory]);

  // Settings in the selected category subtree (or all settings when nothing selected)
  const baseSettings = useMemo(() => {
    if (!selectedCategoryId) return allSettings;
    const ids = collectCategoryIds(filteredCategoryTree, selectedCategoryId);
    const out: SettingDefinition[] = [];
    for (const id of ids) out.push(...(settingsByCategory[id] || []));
    return out;
  }, [selectedCategoryId, filteredCategoryTree, settingsByCategory, allSettings]);

  // Apply text search on top of category selection
  const visibleSettings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return baseSettings;
    return baseSettings.filter(
      (s) =>
        (s.displayName || s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.helpText || '').toLowerCase().includes(q),
    );
  }, [baseSettings, searchQuery]);

  const visibleCount = useMemo(() => countVisibleSettings(visibleSettings), [visibleSettings]);
  const totalCount = useMemo(() => countVisibleSettings(allSettings), [allSettings]);

  const handleSelectCategory = useCallback(
    (categoryId: string, categoryName: string) => {
      if (categoryId === selectedCategoryId) {
        setSelectedCategoryId(null);
        setSelectedCategoryName('');
      } else {
        setSelectedCategoryId(categoryId);
        setSelectedCategoryName(categoryName);
        setSearchQuery('');
      }
    },
    [selectedCategoryId],
  );

  const handleSelectCategoryMobile = useCallback(
    (categoryId: string, categoryName: string) => {
      handleSelectCategory(categoryId, categoryName);
      if (!isDesktop) setSidebarOpen(false);
    },
    [handleSelectCategory, isDesktop, setSidebarOpen],
  );

  const categoryLabel = selectedCategoryId
    ? selectedCategoryName
    : searchQuery.trim()
      ? 'Search results'
      : 'All Enterprise-only settings';

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-[calc(100dvh-96px)]">
      {/* ── Top bar ── */}
      <div className="flex-none px-4 sm:px-6 py-3 md:py-4 border-b border-fluent-border bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-fluent-2xl font-semibold text-fluent-text">
              I{' '}
              <span className="text-red-500" aria-hidden="true">♥</span>
              {' '}Windows Pro
            </h1>
            <p className="text-fluent-sm text-fluent-text-secondary mt-1">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
                  Loading…
                </span>
              ) : fetchError ? (
                <span className="text-fluent-error">Failed to load. Run <code>npm run build-search-index</code> to generate the data file.</span>
              ) : (
                <>
                  <span className="font-semibold text-fluent-warning">{totalCount.toLocaleString()} settings</span>
                  {' '}available on Enterprise but <span className="font-semibold text-fluent-error">not</span> on Professional
                  {selectedCategoryId && (
                    <> &middot; showing <span className="font-semibold text-fluent-text">{visibleCount.toLocaleString()}</span> in {selectedCategoryName}</>
                  )}
                </>
              )}
            </p>
          </div>

        </div>

        {/* Search input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fluent-text-secondary pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim()) setSelectedCategoryId(null);
            }}
            placeholder="Filter settings by name or description…"
            className="w-full rounded border border-fluent-border bg-white dark:bg-[#2c2c2e] py-2 pl-9 pr-3 text-fluent-base text-fluent-text outline-none transition-colors focus:border-fluent-blue dark:border-[#636366]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fluent-text-secondary hover:text-fluent-text"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Browser layout ── */}
      <BrowserSidebar
        isDesktop={isDesktop}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarWidth={sidebarWidth}
        sidebarHydrated={sidebarHydrated}
        handleResizeStart={handleResizeStart}
        sidebarBody={
          loading ? (
            <div className="flex items-center justify-center h-full text-fluent-text-secondary text-fluent-sm">
              Loading categories…
            </div>
          ) : (
            <CategoryTree
              categories={filteredCategoryTree}
              selectedCategoryId={selectedCategoryId}
              loadingCategoryId={loadingCategoryId}
              onSelectCategory={handleSelectCategoryMobile}
            />
          )
        }
      >
        <div ref={settingsScrollRef} className="flex-1 overflow-y-auto fluent-scroll bg-white dark:bg-[#1c1c1e]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-fluent-text-secondary">
              <span className="w-8 h-8 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
              <p className="text-fluent-base">Loading Enterprise-only settings…</p>
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-fluent-text-secondary px-8 text-center">
              <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-fluent-lg font-medium">Data not found</p>
              <p className="text-fluent-sm">
                Run <code className="rounded bg-fluent-bg-alt px-1.5 py-0.5 font-mono text-fluent-xs dark:bg-[#2c2c2e]">npm run build-search-index</code> to generate{' '}
                <code className="font-mono text-fluent-xs">public/pro-exclusive.json</code>.
              </p>
            </div>
          ) : allSettings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
              <p className="text-fluent-base">No Enterprise-only settings found.</p>
            </div>
          ) : visibleSettings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary px-8 text-center">
              <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35m1.35-5.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
              <p className="text-fluent-lg font-medium mb-1">No matching settings</p>
              <p className="text-fluent-base">
                Try a different search term
                {selectedCategoryId && ' or select a different category'}.
              </p>
            </div>
          ) : (
            <SettingsList
              settings={visibleSettings}
              categoryName={categoryLabel}
              scrollContainerRef={settingsScrollRef}
              categoryMap={categoryMap}
            />
          )}
        </div>
      </BrowserSidebar>
    </div>
  );
}

/** Recursively collect a category ID and all its descendant IDs from a filtered tree */
function collectCategoryIds(tree: CategoryTreeNode[], targetId: string): string[] {
  const ids: string[] = [];

  function find(nodes: CategoryTreeNode[]): CategoryTreeNode | null {
    for (const node of nodes) {
      if (node.id === targetId) return node;
      const found = find(node.children);
      if (found) return found;
    }
    return null;
  }

  function collect(node: CategoryTreeNode) {
    ids.push(node.id);
    for (const child of node.children) collect(child);
  }

  const target = find(tree);
  if (target) collect(target);
  return ids;
}
