'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SettingDefinition, MatchSource } from '@/lib/types';
import { detectMatchSources } from '@/lib/types';
import { groupSettings } from '@/lib/settings-grouping';
import SettingRow from './SettingRow';
import HighlightText from './HighlightText';

interface SettingsListProps {
  settings: SettingDefinition[];
  categoryName: string;
  /** Total count (may differ from settings.length if paginated) */
  totalCount?: number;
  /** If true, this is a search result group — show the category as a styled header */
  isSearchResult?: boolean;
  /** The raw search query to highlight matched characters */
  highlightQuery?: string;
  /** Ref to the scroll container (for virtualization in category view) */
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  /** Ancestor breadcrumb path (root → parent). Only shown for search results with a parent category. */
  breadcrumb?: string[];
  /** Map of categoryId → displayName, used to disambiguate same-named settings from different sub-categories */
  categoryMap?: Record<string, string>;
}

const PAGE_SIZE = 500;

export default function SettingsList({
  settings,
  categoryName,
  totalCount,
  isSearchResult = false,
  highlightQuery,
  scrollContainerRef,
  breadcrumb,
  categoryMap,
}: SettingsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Group settings: root settings at top level, children nested under their root,
  // and collection items grouped under their SettingGroupCollectionDefinition header.
  // Uses shared utility so the same logic drives both rendering and result counts.
  const { rootSettings, childMap } = useMemo(() => groupSettings(settings), [settings]);

  // Build a disambiguation map: settingId → sub-category label for settings
  // that share the same displayName.  This lets the UI show which sub-category
  // a setting comes from when multiple settings share a name (e.g. IE zone
  // policies under Administrative Templates).
  const disambiguationMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!categoryMap) return map;

    // Group root settings by displayName
    const byName = new Map<string, SettingDefinition[]>();
    for (const s of rootSettings) {
      const name = s.displayName || s.name || '';
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(s);
    }

    for (const [, arr] of byName) {
      if (arr.length <= 1) continue;
      // Multiple settings share the same displayName — disambiguate by category
      for (const s of arr) {
        const catName = categoryMap[s.categoryId];
        if (catName && catName !== categoryName) {
          map.set(s.id, catName);
        }
      }
    }
    return map;
  }, [rootSettings, categoryMap, categoryName]);

  // Compute visible settings count: root settings + all non-duplicate children
  // that survived the CSP-path deduplication and grouping logic.  This is more
  // accurate than the raw `totalCount` prop which includes hidden duplicates.
  const count = useMemo(() => {
    let total = rootSettings.length;
    for (const [, children] of childMap) {
      total += children.length;
    }
    return total;
  }, [rootSettings, childMap]);

  // Progressive loading for long lists
  const [visibleCount, setVisibleCount] = useState(Math.min(PAGE_SIZE, rootSettings.length));

  // Reset visible count when the underlying data changes (e.g. new category selected)
  const settingsKey = settings.length > 0 ? settings[0].categoryId + ':' + settings.length : '';
  useEffect(() => {
    setVisibleCount(Math.min(PAGE_SIZE, rootSettings.length));
  }, [settingsKey, rootSettings.length]);

  const visibleSettings = rootSettings.slice(0, visibleCount);

  // Compute match sources for each setting when in search mode
  const matchSourcesMap = useMemo(() => {
    if (!isSearchResult || !highlightQuery) return new Map<string, MatchSource[]>();
    const map = new Map<string, MatchSource[]>();
    for (const s of rootSettings) {
      map.set(s.id, detectMatchSources(s, highlightQuery));
    }
    return map;
  }, [isSearchResult, highlightQuery, rootSettings]);

  // Virtualizer for the standard (non-search) category view
  const virtualizer = useVirtualizer({
    count: visibleSettings.length,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: () => 48,
    overscan: 15,
    enabled: !isSearchResult && !!scrollContainerRef?.current,
  });

  if (isSearchResult) {
    // Search result group: category header with collapsible settings underneath
    return (
      <div ref={containerRef} className="border-b border-fluent-border">
        {/* Category header bar */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 w-full px-4 py-2.5 bg-fluent-bg-alt hover:bg-gray-100 transition-colors text-left"
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
          <div className="flex items-center gap-1.5 min-w-0">
            {breadcrumb && breadcrumb.length > 0 && (
              <>
                {breadcrumb.map((ancestor, i) => (
                  <span key={i} className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-fluent-sm text-fluent-text-secondary truncate max-w-[180px]">
                      <HighlightText text={ancestor} query={highlightQuery} />
                    </span>
                    <svg className="w-2.5 h-2.5 text-fluent-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                ))}
              </>
            )}
            <span className="text-fluent-base font-semibold text-fluent-text">
              <HighlightText text={categoryName} query={highlightQuery} />
            </span>
          </div>
          <span className="text-fluent-sm text-fluent-text-secondary ml-1">
            ({rootSettings.length} {rootSettings.length === 1 ? 'setting' : 'settings'})
          </span>
        </button>

        {/* Settings rows */}
        {!collapsed && (
          <div role="table" aria-label={`Settings from ${categoryName}`}>
            {/* Column header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-fluent-border bg-fluent-bg-alt text-fluent-sm font-semibold text-fluent-text-secondary">
              <span className="w-5" /> {/* Chevron spacer */}
              <span className="flex-1">Setting name</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="w-[4.5rem] text-center">Scope</span>
                <span className="w-[6rem] text-center">Type</span>
                <span className="w-[3.5rem]" /> {/* Extra badge spacer */}
                <span className="w-5" /> {/* Info icon spacer */}
              </div>
            </div>
            {visibleSettings.map((setting) => (
              <SettingRow
                key={setting.id}
                setting={setting}
                childSettings={childMap.get(setting.id)}
                highlightQuery={highlightQuery}
                matchSources={matchSourcesMap.get(setting.id)}
                allSettings={settings}
                disambiguationLabel={disambiguationMap.get(setting.id)}
              />
            ))}

            {/* Load more */}
            {visibleCount < rootSettings.length && (
              <div className="flex justify-center py-3">
                <button
                  onClick={() => setVisibleCount((v) => Math.min(v + PAGE_SIZE, rootSettings.length))}
                  className="fluent-btn-secondary text-fluent-sm"
                >
                  Show more ({(rootSettings.length - visibleCount).toLocaleString()} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Standard category view (non-search)
  return (
    <div ref={containerRef}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-fluent-border bg-fluent-bg-alt sticky top-0 z-10">
        <span className="text-fluent-base font-semibold text-fluent-text">
          {categoryName}
        </span>
        <span className="text-fluent-sm text-fluent-text-secondary">
          ({count.toLocaleString()} {count === 1 ? 'setting' : 'settings'})
        </span>
      </div>

      {/* Column header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-fluent-border bg-fluent-bg-alt text-fluent-sm font-semibold text-fluent-text-secondary">
        <span className="w-5" /> {/* Chevron spacer */}
        <span className="flex-1">Setting name</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-[4.5rem] text-center">Scope</span>
          <span className="w-[6rem] text-center">Type</span>
          <span className="w-[3.5rem]" /> {/* Extra badge spacer */}
          <span className="w-5" /> {/* Info icon spacer */}
        </div>
      </div>

      {/* Settings list (virtualized) */}
      <div
        role="table"
        aria-label={`Settings in ${categoryName}`}
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const setting = visibleSettings[virtualRow.index];
          return (
            <div
              key={setting.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <SettingRow
                setting={setting}
                childSettings={childMap.get(setting.id)}
                allSettings={settings}
                disambiguationLabel={disambiguationMap.get(setting.id)}
              />
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {visibleCount < rootSettings.length && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => setVisibleCount((v) => Math.min(v + PAGE_SIZE, rootSettings.length))}
            className="fluent-btn-secondary"
          >
            Show more ({(rootSettings.length - visibleCount).toLocaleString()} remaining)
          </button>
        </div>
      )}

      {/* Empty state */}
      {rootSettings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-fluent-text-secondary">
          <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-fluent-base">No settings match the current filters.</p>
        </div>
      )}
    </div>
  );
}
