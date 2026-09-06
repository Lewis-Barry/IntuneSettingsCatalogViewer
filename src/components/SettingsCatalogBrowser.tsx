'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import CategoryTree from './CategoryTree';
import SettingsList from './SettingsList';
import SearchBar from './SearchBar';
import PlatformFilter from './PlatformFilter';
import type { CategoryTreeNode, SettingDefinition, SearchIndexEntry } from '@/lib/types';
import { countVisibleRootSettings, countVisibleSettings, getCspPath } from '@/lib/settings-grouping';
import { matchesWindowsCompatibility, type WindowsCompatibility } from '@/lib/sku-labels';
import { generateProExclusiveCsv, generateProExclusiveHtml } from '@/lib/pro-exclusive-export';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { basePath } from '@/lib/basePath';
import BrowserSidebar, { useBrowserSidebar } from './BrowserSidebar';

interface SettingsCatalogBrowserProps {
  categoryTree: CategoryTreeNode[];
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

/** Check whether a setting matches the deprecated filter. */
function matchesDeprecatedFilter(displayName: string | undefined, deprecatedOnly: boolean): boolean {
  if (!deprecatedOnly) return true;
  return !!displayName?.toLowerCase().includes('deprecated');
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
  const [deprecatedOnly, setDeprecatedOnly] = useState(false);
  const [windowsCompatibility, setWindowsCompatibility] = useState<WindowsCompatibility>('');
  const [compatibilityReports, setCompatibilityReports] = useState<Record<string, SettingDefinition[]>>({});
  const [compatibilityError, setCompatibilityError] = useState(false);
  const [retryCompatibility, setRetryCompatibility] = useState(0);
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();

  // ── Client-side settings loading ──
  // The initial page only needs the category tree. Setting details are loaded
  // from per-category shards when the user selects a category; the full browse
  // payload is kept as a fallback for global filters and search result grouping.
  const [loadedSettingsByCategory, setSettingsByCategory] = useState<Record<string, SettingDefinition[]>>({});
  const [fullBrowseLoaded, setFullBrowseLoaded] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);
  const loadedCategoryIdsRef = useRef<Set<string>>(new Set());
  const categoryLoadPromisesRef = useRef<Map<string, Promise<{ categoryId: string; settings: SettingDefinition[] }>>>(new Map());
  const fullBrowsePromiseRef = useRef<Promise<void> | null>(null);
  const pendingCategoryIdRef = useRef<string | null>(null);

  useEffect(() => {
    const readFilters = () => {
      const compatibility = searchParams.get('compatibility');
      const validCompatibility = compatibility === 'enterprise-only' || compatibility === 'avd-multisession' ? compatibility : '';
      const platforms = (searchParams.get('platform') || '').split(',').filter((platform) => Object.hasOwn(PLATFORM_ALIASES, platform));
      setWindowsCompatibility(validCompatibility);
      setCompatibilityError(false);
      setSelectedPlatforms(validCompatibility && !platforms.includes('windows10') ? [...platforms, 'windows10'] : platforms);
    };
    readFilters();
  }, [searchParams]);

  const updateFilterUrl = (platforms: string[], compatibility: WindowsCompatibility) => {
    const url = new URL(window.location.href);
    if (platforms.length) url.searchParams.set('platform', platforms.join(','));
    else url.searchParams.delete('platform');
    if (compatibility) url.searchParams.set('compatibility', compatibility);
    else url.searchParams.delete('compatibility');
    window.history.replaceState(null, '', url);
  };

  const handlePlatformsChange = (platforms: string[]) => {
    const compatibility = platforms.includes('windows10') ? windowsCompatibility : '';
    setSelectedPlatforms(platforms);
    setWindowsCompatibility(compatibility);
    setCompatibilityError(false);
    updateFilterUrl(platforms, compatibility);
  };

  useEffect(() => {
    if (!windowsCompatibility || compatibilityReports[windowsCompatibility]) return;
    const controller = new AbortController();
    const dataFile = windowsCompatibility === 'enterprise-only' ? 'pro-exclusive' : 'avd-multisession';
    fetch(`${basePath}/${dataFile}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load compatibility settings: ${response.status}`);
        return response.json() as Promise<{ settings: SettingDefinition[] }>;
      })
      .then(({ settings }) => {
        if (!controller.signal.aborted) {
          setCompatibilityReports((previous) => ({ ...previous, [windowsCompatibility]: settings }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCompatibilityError(true);
      });
    return () => controller.abort();
  }, [windowsCompatibility, compatibilityReports, retryCompatibility]);

  const settingsByCategory = useMemo(() => {
    if (!windowsCompatibility) return loadedSettingsByCategory;
    const byCategory: Record<string, SettingDefinition[]> = {};
    for (const setting of compatibilityReports[windowsCompatibility] || []) {
      if (!matchesWindowsCompatibility(setting.applicability?.windowsSkus, windowsCompatibility)) continue;
      (byCategory[setting.categoryId] ??= []).push(setting);
    }
    return byCategory;
  }, [windowsCompatibility, compatibilityReports, loadedSettingsByCategory]);
  const filterDataLoaded = windowsCompatibility ? !!compatibilityReports[windowsCompatibility] : fullBrowseLoaded;
  const compatibilityLoading = !!windowsCompatibility && !filterDataLoaded && !compatibilityError;
  const compatibilityLabel = windowsCompatibility === 'enterprise-only' ? 'Enterprise-only settings' : 'AVD multi-session settings';

  const mergeSettingsByCategory = useCallback((byCat: Record<string, SettingDefinition[]>) => {
    setSettingsByCategory((prev) => ({ ...prev, ...byCat }));
  }, []);

  const loadSettingsForCategories = useCallback(async (categoryIds: string[]) => {
    const missingIds = Array.from(new Set(categoryIds)).filter((categoryId) => !loadedCategoryIdsRef.current.has(categoryId));
    if (missingIds.length === 0) return;

    setSettingsLoading(true);
    try {
      const loads = missingIds.map((categoryId) => {
        const existing = categoryLoadPromisesRef.current.get(categoryId);
        if (existing) return existing;

        const promise = fetch(`${basePath}/settings-by-category/${encodeURIComponent(categoryId)}.json`)
          .then((res) => {
            if (res.status === 404) return [] as SettingDefinition[];
            if (!res.ok) throw new Error(`Failed to load category ${categoryId}: ${res.status}`);
            return res.json() as Promise<SettingDefinition[]>;
          })
          .then((settings) => ({ categoryId, settings }))
          .finally(() => {
            categoryLoadPromisesRef.current.delete(categoryId);
          });

        categoryLoadPromisesRef.current.set(categoryId, promise);
        return promise;
      });

      const results = await Promise.all(loads);
      const byCat: Record<string, SettingDefinition[]> = {};
      for (const { categoryId, settings } of results) {
        byCat[categoryId] = settings;
        loadedCategoryIdsRef.current.add(categoryId);
      }
      mergeSettingsByCategory(byCat);
    } catch (err) {
      console.error('Failed to load category settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  }, [mergeSettingsByCategory]);

  const loadFullBrowseSettings = useCallback(async () => {
    if (fullBrowseLoaded) return;
    if (fullBrowsePromiseRef.current) return fullBrowsePromiseRef.current;

    setSettingsLoading(true);
    fullBrowsePromiseRef.current = (async () => {
      const settings = await fetch(`${basePath}/settings-browse.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`);
        return res.json();
      })
      .then((data) => data as SettingDefinition[]);

      const byCat: Record<string, SettingDefinition[]> = {};
      for (const s of settings) {
        if (!byCat[s.categoryId]) byCat[s.categoryId] = [];
        byCat[s.categoryId].push(s);
      }
      for (const catId of Object.keys(byCat)) {
        loadedCategoryIdsRef.current.add(catId);
      }
      mergeSettingsByCategory(byCat);
      setFullBrowseLoaded(true);
    })()
      .catch((err) => {
        fullBrowsePromiseRef.current = null;
        console.error('Failed to load browse settings:', err);
      })
      .finally(() => {
        setSettingsLoading(false);
      });

    return fullBrowsePromiseRef.current;
  }, [fullBrowseLoaded, mergeSettingsByCategory]);
  const { sidebarOpen, setSidebarOpen, sidebarWidth, sidebarHydrated, handleResizeStart } = useBrowserSidebar();
  const settingsScrollRef = useRef<HTMLDivElement>(null);

  const handleSelectCategory = useCallback(
    (categoryId: string, categoryName: string) => {
      // Click the selected category again to deselect it.
      if (categoryId === selectedCategoryId) {
        pendingCategoryIdRef.current = null;
        setSelectedCategoryId(null);
        setSelectedCategoryName('');
        setLoadingCategoryId(null);
        return;
      }
      const categoryIds = collectCategoryIds(categoryTree, categoryId);
      const hasMissingSettings = categoryIds.some((id) => !loadedCategoryIdsRef.current.has(id));

      // If data is already cached, swap immediately — no flash possible.
      if (windowsCompatibility || !hasMissingSettings) {
        pendingCategoryIdRef.current = categoryId;
        setSelectedCategoryId(categoryId);
        setSelectedCategoryName(categoryName);
        setSearchResults(null);
        setLoadingCategoryId(null);
        return;
      }

      // Data needs fetching: keep the current right-pane content and only
      // show the spinner on the clicked item in the sidebar. Commit the
      // selection swap once the fetch resolves, so the new content appears
      // in one go with no empty-state flash.
      pendingCategoryIdRef.current = categoryId;
      setLoadingCategoryId(categoryId);
      void loadSettingsForCategories(categoryIds).finally(() => {
        // Ignore stale loads if the user has since clicked a different category.
        if (pendingCategoryIdRef.current !== categoryId) return;
        setSelectedCategoryId(categoryId);
        setSelectedCategoryName(categoryName);
        setSearchResults(null);
        setLoadingCategoryId(null);
      });
    },
    [categoryTree, loadSettingsForCategories, selectedCategoryId, windowsCompatibility]
  );

  const handleSearchResults = useCallback((results: SearchIndexEntry[]) => {
    if (windowsCompatibility) return;
    if (results.length > 0) {
      setSearchResults(results);
      setSelectedCategoryId(null);
      setSelectedCategoryName('');
      void loadSettingsForCategories(results.map((result) => result.categoryId));
    } else {
      setSearchResults(null);
    }
  }, [loadSettingsForCategories, windowsCompatibility]);

  useEffect(() => {
    if (!windowsCompatibility && (selectedPlatforms.length > 0 || deprecatedOnly) && !fullBrowseLoaded) {
      void loadFullBrowseSettings();
    }
  }, [deprecatedOnly, fullBrowseLoaded, loadFullBrowseSettings, selectedPlatforms.length, windowsCompatibility]);

  // Filter the category tree so only categories with settings matching the
  // selected platform(s) are shown.  When no platform filter is active the
  // full tree is returned unchanged.
  const filteredCategoryTree = useMemo(() => {
    if (selectedPlatforms.length === 0 && !deprecatedOnly && !windowsCompatibility) return categoryTree;
    if (!filterDataLoaded) return windowsCompatibility ? [] : categoryTree;

    // Build a lookup map for CSP-path deduplication (same logic as SettingsList)
    const settingById = new Map<string, SettingDefinition>();
    for (const catSettings of Object.values(settingsByCategory)) {
      for (const s of catSettings) settingById.set(s.id, s);
    }

    function isVisibleSetting(s: SettingDefinition): boolean {
      const isRoot = !s.rootDefinitionId || s.rootDefinitionId === s.id;
      if (isRoot) return true;
      // Child: only visible if CSP path differs from parent
      const parent = settingById.get(s.rootDefinitionId!);
      return !parent || getCspPath(s) !== getCspPath(parent);
    }

    function filterNode(node: CategoryTreeNode): CategoryTreeNode | null {
      // Recursively filter children first
      const filteredChildren = node.children
        .map(filterNode)
        .filter((c): c is CategoryTreeNode => c !== null);

      // Count visible settings in *this* category that match the platform filter.
      // Excludes child settings whose CSP path is identical to their parent
      // (these are hidden duplicates in the UI).
      const catSettings = settingsByCategory[node.id] || [];
      const matchingSettings = catSettings.filter(
        (s) =>
          (windowsCompatibility || isVisibleSetting(s)) &&
          (selectedPlatforms.length === 0 || matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)) &&
          matchesDeprecatedFilter(s.displayName, deprecatedOnly)
      );
      const matchingCount = windowsCompatibility ? countVisibleSettings(matchingSettings) : matchingSettings.length;

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
  }, [categoryTree, selectedPlatforms, deprecatedOnly, settingsByCategory, filterDataLoaded, windowsCompatibility]);

  // Clear selected category when it's removed by a platform filter change
  if (selectedCategoryId && (selectedPlatforms.length > 0 || deprecatedOnly || windowsCompatibility) && filterDataLoaded) {
    const exists = collectCategoryIds(filteredCategoryTree, selectedCategoryId).length > 0;
    if (!exists) {
      setSelectedCategoryId(null);
      setSelectedCategoryName('');
    }
  }

  // When browsing a category: flat list of settings
  const categorySettings = useMemo(() => {
    if (!windowsCompatibility && (searchResults || !selectedCategoryId)) return [];

    let settings: SettingDefinition[] = [];
    const categoryIds = selectedCategoryId ? collectCategoryIds(filteredCategoryTree, selectedCategoryId) : Object.keys(settingsByCategory);
    for (const catId of categoryIds) {
      const catSettings = settingsByCategory[catId];
      if (catSettings) {
        settings.push(...catSettings);
      }
    }

    // Apply platform + deprecated filters
    if (selectedPlatforms.length > 0) {
      settings = settings.filter(
        (s) => matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)
      );
    }
    if (deprecatedOnly) {
      settings = settings.filter((s) => matchesDeprecatedFilter(s.displayName, deprecatedOnly));
    }

    if (windowsCompatibility && searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().split(',').map((term) => term.trim()).filter(Boolean);
      settings = settings.filter((setting) => {
        const fields = [setting.displayName, setting.name, setting.description, setting.helpText, getCspPath(setting), ...(setting.keywords || [])];
        return terms.some((term) => fields.some((field) => field?.toLowerCase().includes(term)));
      });
    }

    return settings;
  }, [selectedCategoryId, searchResults, settingsByCategory, selectedPlatforms, deprecatedOnly, filteredCategoryTree, windowsCompatibility, searchQuery]);

  // When searching: group matched settings by their source category,
  // preserving the relevance order from the search engine so that groups
  // containing the best-matching settings appear first.
  const searchGroups = useMemo((): CategorySettingsGroup[] => {
    if (!searchResults || windowsCompatibility) return [];

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

    // Apply platform + deprecated filters
    const groups: CategorySettingsGroup[] = [];
    for (const [catId, settings] of groupMap) {
      let filtered = settings;
      if (selectedPlatforms.length > 0) {
        filtered = filtered.filter(
          (s) => matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)
        );
      }
      if (deprecatedOnly) {
        filtered = filtered.filter((s) => matchesDeprecatedFilter(s.displayName, deprecatedOnly));
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
  }, [searchResults, settingsByCategory, selectedPlatforms, deprecatedOnly, categoryMap, categoryParentMap, windowsCompatibility]);

  // Total matched settings count for display — uses the same grouping logic
  // as SettingsList so the banner count matches the actual visible rows.
  const searchResultCount = useMemo(() => {
    let count = 0;
    for (const group of searchGroups) {
      count += countVisibleRootSettings(group.settings);
    }
    return count;
  }, [searchGroups]);

  // Compute the displayed settings count based on active platform filter
  const displayedSettingsCount = useMemo(() => {
    if (windowsCompatibility) return filteredCategoryTree.reduce((count, category) => count + category.settingCount, 0);
    if (selectedPlatforms.length === 0 && !deprecatedOnly) return totalSettings;
    if (!fullBrowseLoaded) return totalSettings;
    let count = 0;
    for (const catSettings of Object.values(settingsByCategory)) {
      for (const s of catSettings) {
        if (
          (selectedPlatforms.length === 0 || matchesPlatformFilter(s.applicability?.platform, selectedPlatforms)) &&
          matchesDeprecatedFilter(s.displayName, deprecatedOnly)
        ) {
          count++;
        }
      }
    }
    return count;
  }, [selectedPlatforms, deprecatedOnly, settingsByCategory, totalSettings, fullBrowseLoaded, windowsCompatibility, filteredCategoryTree]);

  const isSearching = !windowsCompatibility && searchResults !== null && searchResults.length > 0;

  const downloadExport = (format: 'csv' | 'html') => {
    if (!categorySettings.length) return;
    const options = {
      settings: categorySettings,
      categoryMap,
      categoryLabel: [selectedCategoryName || compatibilityLabel, searchQuery.trim(), deprecatedOnly ? 'Deprecated' : ''].filter(Boolean).join(' - '),
      reportTitle: windowsCompatibility === 'enterprise-only' ? 'Enterprise-only Settings (not in Windows Pro)' : 'Settings available on Windows AVD Multi-Session',
    };
    const content = format === 'csv' ? generateProExclusiveCsv(options) : generateProExclusiveHtml(options);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${windowsCompatibility}-settings.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  // Close mobile drawer when a category is selected
  const handleSelectCategoryMobile = useCallback(
    (categoryId: string, categoryName: string) => {
      handleSelectCategory(categoryId, categoryName);
      if (!isDesktop) {
        setSidebarOpen(false);
      }
    },
    [handleSelectCategory, isDesktop, setSidebarOpen]
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-[calc(100dvh-96px)]">
      {/* Top section: title + search + filters */}
      <div className="flex-none px-4 sm:px-6 py-3 md:py-4 border-b border-fluent-border bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-fluent-2xl font-semibold text-fluent-text">
              Settings Catalog
            </h1>
            <p className="text-fluent-sm text-fluent-text-secondary mt-1">
              {compatibilityLoading || (!windowsCompatibility && settingsLoading && (selectedPlatforms.length > 0 || deprecatedOnly || isSearching))
                ? <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
                    Loading settings…
                  </span>
                : compatibilityError && windowsCompatibility && !filterDataLoaded
                  ? <span className="text-fluent-error">Compatibility settings unavailable</span>
                  : <>{displayedSettingsCount.toLocaleString()} settings available</>
              }
              {lastUpdated && (
                <span> · Last updated: {new Date(lastUpdated).toLocaleDateString('en-US')}</span>
              )}
            </p>
          </div>
          {windowsCompatibility && filterDataLoaded && (
            <details className="relative flex-none">
              <summary className="fluent-btn-secondary text-fluent-sm cursor-pointer" aria-label="Export filtered settings">Export</summary>
              <div className="absolute right-0 mt-1 z-50 min-w-[8rem] bg-fluent-bg border border-fluent-border rounded-md shadow-lg py-1">
                {(['csv', 'html'] as const).map((format) => (
                  <button key={format} disabled={!categorySettings.length} className="block w-full text-left px-3 py-2 text-fluent-sm text-fluent-text hover:bg-fluent-bg-alt disabled:opacity-50 disabled:cursor-not-allowed" onClick={(event) => {
                    downloadExport(format);
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}>{format.toUpperCase()}</button>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Search bar */}
        <div>
          <SearchBar
            onSearchResults={handleSearchResults}
            onQueryChange={setSearchQuery}
            localSearch={!!windowsCompatibility}
          />
        </div>

        {/* Platform filters */}
        <div className="mt-3">
          <PlatformFilter
            selectedPlatforms={selectedPlatforms}
            onPlatformsChange={handlePlatformsChange}
            deprecatedOnly={deprecatedOnly}
            onDeprecatedChange={setDeprecatedOnly}
          />
          {selectedPlatforms.includes('windows10') && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 pt-3 border-t border-fluent-border">
              <label htmlFor="windows-compatibility" className="text-fluent-sm text-fluent-text-secondary font-medium">Windows compatibility:</label>
              <select
                id="windows-compatibility"
                value={windowsCompatibility}
                onChange={(event) => {
                  const compatibility = event.target.value as WindowsCompatibility;
                  pendingCategoryIdRef.current = null;
                  setLoadingCategoryId(null);
                  setSearchResults(null);
                  setWindowsCompatibility(compatibility);
                  setCompatibilityError(false);
                  updateFilterUrl(selectedPlatforms, compatibility);
                }}
                className="max-w-full min-w-0 rounded border border-fluent-border-strong bg-white dark:bg-[#2c2c2e] px-2 py-1.5 text-fluent-sm text-fluent-text focus:outline-none focus:border-fluent-blue focus:ring-1 focus:ring-fluent-blue"
              >
                <option value="">All Windows settings</option>
                <option value="enterprise-only">Enterprise-only (not in Pro)</option>
                <option value="avd-multisession">AVD multi-session</option>
              </select>
            </div>
          )}
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
          <CategoryTree
            categories={filteredCategoryTree}
            selectedCategoryId={selectedCategoryId}
            loadingCategoryId={loadingCategoryId}
            onSelectCategory={handleSelectCategoryMobile}
          />
        }
      >
        {/* Settings list */}
        <div ref={settingsScrollRef} className="flex-1 overflow-y-auto fluent-scroll bg-white dark:bg-[#1c1c1e]">
          {windowsCompatibility ? (
            compatibilityLoading ? (
              <div role="status" className="p-6 text-fluent-sm text-fluent-text-secondary">Loading compatibility settings...</div>
            ) : compatibilityError && !filterDataLoaded ? (
              <div role="alert" className="p-6 text-fluent-sm text-fluent-text-secondary">
                <p className="mb-3">Could not load compatibility settings.</p>
                <button className="fluent-btn-secondary" onClick={() => {
                  setCompatibilityError(false);
                  setRetryCompatibility((value) => value + 1);
                }}>Retry</button>
              </div>
            ) : (
              <SettingsList
                settings={categorySettings}
                categoryName={selectedCategoryName || compatibilityLabel}
                scrollContainerRef={settingsScrollRef}
                highlightQuery={searchQuery}
                categoryMap={categoryMap}
              />
            )
          ) : isSearching ? (
            /* Search results: grouped by category */
            <div>
              {/* Search results header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-fluent-border bg-white dark:bg-[#1c1c1e] sticky top-0 z-10">
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
      </BrowserSidebar>
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
