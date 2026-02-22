'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import CategoryTree from './CategoryTree';
import SettingsList from './SettingsList';
import SearchBar from './SearchBar';
import PlatformFilter from './PlatformFilter';
import type { CategoryTreeNode, SettingDefinition, SearchIndexEntry } from '@/lib/types';

interface SettingsCatalogBrowserProps {
  categoryTree: CategoryTreeNode[];
  settingsByCategory: Record<string, SettingDefinition[]>;
  categoryMap: Record<string, string>;
  categoryParentMap: Record<string, string>;
  totalSettings: number;
  lastUpdated: string | null;
}

/** A group of settings from a single category, used when displaying search results */
interface CategorySettingsGroup {
  categoryId: string;
  categoryName: string;
  /** Ancestor path from root → parent (excludes this category itself). Empty for root categories. */
  breadcrumb: string[];
  settings: SettingDefinition[];
}

const ROOT_CATEGORY_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Map from UI filter value to all raw platform strings that should match it.
 * Platform values in the data can be comma-separated (e.g. "android,iOS") and
 * use variants like "androidEnterprise" / "aosp" for Android.
 */
const PLATFORM_ALIASES: Record<string, string[]> = {
  android: ['android', 'androidEnterprise', 'aosp'],
  windows10: ['windows10'],
  macOS: ['macOS'],
  iOS: ['iOS'],
  linux: ['linux'],
};

/** Check whether a setting's platform value matches any of the selected filter platforms. */
function matchesPlatformFilter(platformValue: string | undefined, selectedPlatforms: string[]): boolean {
  if (!platformValue) return false;
  // The platform field can be comma-separated (e.g. "android,iOS,macOS,windows10")
  const parts = platformValue.split(',');
  return selectedPlatforms.some((sel) => {
    const aliases = PLATFORM_ALIASES[sel] || [sel];
    return parts.some((p) => aliases.includes(p));
  });
}

/** Build an ancestor breadcrumb path (root → parent) for a given category. */
function buildBreadcrumb(
  categoryId: string,
  categoryMap: Record<string, string>,
  categoryParentMap: Record<string, string>,
): string[] {
  const crumbs: string[] = [];
  let current = categoryParentMap[categoryId];
  const visited = new Set<string>();
  while (current && current !== ROOT_CATEGORY_ID && !visited.has(current)) {
    visited.add(current);
    crumbs.unshift(categoryMap[current] || 'Unknown Category');
    current = categoryParentMap[current];
  }
  return crumbs;
}

export default function SettingsCatalogBrowser({
  categoryTree,
  settingsByCategory,
  categoryMap,
  categoryParentMap,
  totalSettings,
  lastUpdated,
}: SettingsCatalogBrowserProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchIndexEntry[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const MIN_SIDEBAR = 200;
  const MAX_SIDEBAR = 600;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX;
      const newWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startWidth + delta));
      setSidebarWidth(newWidth);
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

  const handleSelectCategory = useCallback(
    (categoryId: string, categoryName: string) => {
      setSelectedCategoryId(categoryId);
      setSelectedCategoryName(categoryName);
      setSearchResults(null); // Clear search when selecting a category
    },
    []
  );

  const handleSearchResults = useCallback((results: SearchIndexEntry[]) => {
    if (results.length > 0) {
      setSearchResults(results);
      setSelectedCategoryId(null);
      setSelectedCategoryName('');
    } else {
      setSearchResults(null);
    }
  }, []);

  // Filter the category tree so only categories with settings matching the
  // selected platform(s) are shown.  When no platform filter is active the
  // full tree is returned unchanged.
  const filteredCategoryTree = useMemo(() => {
    if (selectedPlatforms.length === 0) return categoryTree;

    function filterNode(node: CategoryTreeNode): CategoryTreeNode | null {
      // Recursively filter children first
      const filteredChildren = node.children
        .map(filterNode)
        .filter((c): c is CategoryTreeNode => c !== null);

      // Count settings in *this* category that match the platform filter
      // Only count root-level settings (not children nested under a parent)
      // to stay consistent with the pre-built settingCount values.
      const catSettings = settingsByCategory[node.id] || [];
      const matchingCount = catSettings.filter(
        (s) =>
          (!s.rootDefinitionId || s.rootDefinitionId === s.id) &&
          matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)
      ).length;

      // Total = own matching + all descendants' matching
      const descendantCount = filteredChildren.reduce((sum, c) => sum + c.settingCount, 0);
      const totalCount = matchingCount + descendantCount;

      // Drop the node entirely when it has nothing relevant
      if (totalCount === 0 && filteredChildren.length === 0) return null;

      return {
        ...node,
        children: filteredChildren,
        settingCount: totalCount,
      };
    }

    return categoryTree
      .map(filterNode)
      .filter((c): c is CategoryTreeNode => c !== null);
  }, [categoryTree, selectedPlatforms, settingsByCategory]);

  // Clear selected category when it's removed by a platform filter change
  useEffect(() => {
    if (!selectedCategoryId || selectedPlatforms.length === 0) return;
    const exists = collectCategoryIds(filteredCategoryTree, selectedCategoryId).length > 0;
    if (!exists) {
      setSelectedCategoryId(null);
      setSelectedCategoryName('');
    }
  }, [filteredCategoryTree, selectedCategoryId, selectedPlatforms]);

  // When browsing a category: flat list of settings
  const categorySettings = useMemo(() => {
    if (searchResults || !selectedCategoryId) return [];

    let settings: SettingDefinition[] = [];
    const categoryIds = collectCategoryIds(filteredCategoryTree, selectedCategoryId);
    for (const catId of categoryIds) {
      const catSettings = settingsByCategory[catId];
      if (catSettings) {
        settings.push(...catSettings);
      }
    }

    // Apply platform filter
    if (selectedPlatforms.length > 0) {
      settings = settings.filter(
        (s) => matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)
      );
    }

    return settings;
  }, [selectedCategoryId, searchResults, settingsByCategory, selectedPlatforms, filteredCategoryTree]);

  // When searching: group matched settings by their source category,
  // preserving the relevance order from the search engine so that groups
  // containing the best-matching settings appear first.
  const searchGroups = useMemo((): CategorySettingsGroup[] => {
    if (!searchResults) return [];

    // Build a rank map: setting id → position in search results (lower = better match)
    const rankMap = new Map<string, number>();
    searchResults.forEach((r, i) => rankMap.set(r.id, i));

    const resultIds = new Set(searchResults.map((r) => r.id));

    // Build a map of categoryId → matched SettingDefinition[]
    const groupMap = new Map<string, SettingDefinition[]>();
    for (const catSettings of Object.values(settingsByCategory)) {
      for (const s of catSettings) {
        if (resultIds.has(s.id)) {
          const list = groupMap.get(s.categoryId) || [];
          list.push(s);
          groupMap.set(s.categoryId, list);
        }
      }
    }

    // Apply platform filter
    const groups: CategorySettingsGroup[] = [];
    for (const [catId, settings] of groupMap) {
      let filtered = settings;
      if (selectedPlatforms.length > 0) {
        filtered = filtered.filter(
          (s) => matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)
        );
      }
      if (filtered.length > 0) {
        // Sort settings within each group by search relevance rank
        filtered.sort((a, b) => (rankMap.get(a.id) ?? Infinity) - (rankMap.get(b.id) ?? Infinity));
        groups.push({
          categoryId: catId,
          categoryName: categoryMap[catId] || 'Unknown Category',
          breadcrumb: buildBreadcrumb(catId, categoryMap, categoryParentMap),
          settings: filtered,
        });
      }
    }

    // Sort groups by the best (lowest) search rank of any setting within the group,
    // so categories containing exact name matches appear first.
    groups.sort((a, b) => {
      const aBest = Math.min(...a.settings.map((s) => rankMap.get(s.id) ?? Infinity));
      const bBest = Math.min(...b.settings.map((s) => rankMap.get(s.id) ?? Infinity));
      if (aBest !== bBest) return aBest - bBest;
      // Tiebreak: alphabetical by category name
      return a.categoryName.localeCompare(b.categoryName);
    });
    return groups;
  }, [searchResults, settingsByCategory, selectedPlatforms, categoryMap]);

  // Total matched settings count for display (all settings shown in results)
  const searchResultCount = useMemo(() => {
    let count = 0;
    for (const group of searchGroups) {
      count += group.settings.length;
    }
    return count;
  }, [searchGroups]);

  // Compute the displayed settings count based on active platform filter
  const displayedSettingsCount = useMemo(() => {
    if (selectedPlatforms.length === 0) return totalSettings;
    let count = 0;
    for (const catSettings of Object.values(settingsByCategory)) {
      for (const s of catSettings) {
        if (matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)) {
          count++;
        }
      }
    }
    return count;
  }, [selectedPlatforms, settingsByCategory, totalSettings]);

  const isSearching = searchResults !== null && searchResults.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-96px)]">
      {/* Top section: title + search + filters */}
      <div className="px-4 sm:px-6 py-4 border-b border-fluent-border bg-white">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-fluent-2xl font-semibold text-fluent-text">
              Settings Catalog
            </h1>
            <p className="text-fluent-sm text-fluent-text-secondary mt-1">
              {displayedSettingsCount.toLocaleString()} settings available
              {lastUpdated && (
                <span> · Last updated: {new Date(lastUpdated).toLocaleDateString()}</span>
              )}
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div>
          <SearchBar
            onSearchResults={handleSearchResults}
            onQueryChange={setSearchQuery}
          />
        </div>

        {/* Platform filters */}
        <div className="mt-3">
          <PlatformFilter
            selectedPlatforms={selectedPlatforms}
            onPlatformsChange={setSelectedPlatforms}
          />
        </div>

      </div>

      {/* Main content: sidebar + settings list */}
      <div className="flex flex-1 overflow-hidden">
        {/* Category sidebar */}
        <aside
          className={`flex-shrink-0 border-r border-fluent-border bg-white overflow-hidden transition-all duration-200`}
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        >
          <div className="h-full overflow-y-auto fluent-scroll py-2" style={{ minWidth: MIN_SIDEBAR }}>
            <CategoryTree
              categories={filteredCategoryTree}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={handleSelectCategory}
            />
          </div>
        </aside>

        {/* Resize handle + toggle */}
        <div className="flex-shrink-0 flex flex-col relative">
          {/* Drag handle */}
          {sidebarOpen && (
            <div
              className="absolute inset-y-0 -left-1 w-2 cursor-col-resize z-20 group"
              onMouseDown={handleResizeStart}
              title="Drag to resize sidebar"
            >
              <div className="absolute inset-y-0 left-[3px] w-px bg-transparent group-hover:bg-fluent-blue transition-colors" />
            </div>
          )}

          {/* Toggle button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex-shrink-0 w-6 h-full flex items-center justify-center bg-fluent-bg hover:bg-fluent-bg-alt border-r border-fluent-border transition-colors"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg
              className={`w-3 h-3 text-fluent-text-secondary transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Settings list */}
        <div ref={settingsScrollRef} className="flex-1 overflow-y-auto fluent-scroll bg-white">
          {isSearching ? (
            /* Search results: grouped by category */
            <div>
              {/* Search results header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-fluent-border bg-white sticky top-0 z-10">
                <div className="text-fluent-base font-semibold text-fluent-blue">
                  {searchResultCount.toLocaleString()} matching {searchResultCount === 1 ? 'setting' : 'settings'} across {searchGroups.length} {searchGroups.length === 1 ? 'category' : 'categories'}
                </div>
              </div>

              {searchGroups.map((group) => (
                <SettingsList
                  key={group.categoryId}
                  settings={group.settings}
                  categoryName={group.categoryName}
                  breadcrumb={group.breadcrumb}
                  isSearchResult
                  highlightQuery={searchQuery}
                  categoryMap={categoryMap}
                />
              ))}
            </div>
          ) : selectedCategoryId ? (
            <SettingsList
              settings={categorySettings}
              categoryName={selectedCategoryName}
              totalCount={categorySettings.length}
              scrollContainerRef={settingsScrollRef}
              categoryMap={categoryMap}
            />
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
      </div>
    </div>
  );
}

/** Recursively collect a category ID and all its descendant IDs */
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
    for (const child of node.children) {
      collect(child);
    }
  }

  const target = find(tree);
  if (target) {
    collect(target);
  }

  return ids;
}
