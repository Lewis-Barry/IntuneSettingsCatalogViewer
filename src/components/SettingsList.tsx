'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SettingDefinition } from '@/lib/types';
import SettingRow from './SettingRow';

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
}: SettingsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Group settings: root settings at top level, children nested under their root
  const { rootSettings, childMap } = useMemo(() => {
    const childMap = new Map<string, SettingDefinition[]>();
    const rootSettings: SettingDefinition[] = [];
    const rootIds = new Set<string>();

    // Detect synthetic "Top Level Setting Group Collection" containers — these
    // are API-internal wrappers whose children are the real settings.  We skip
    // them as roots and instead promote their children.
    const syntheticGroupIds = new Set<string>();

    // Build a quick id → setting lookup for CSP-path deduplication
    const settingById = new Map<string, SettingDefinition>();
    for (const s of settings) settingById.set(s.id, s);

    const getCspPath = (s: SettingDefinition) =>
      s.baseUri && s.offsetUri
        ? `${s.baseUri}/${s.offsetUri}`
        : s.baseUri || s.offsetUri || '';

    // First pass: identify root settings (skip synthetic group containers)
    for (const s of settings) {
      if (!s.rootDefinitionId || s.rootDefinitionId === s.id) {
        const isSyntheticGroup =
          s['@odata.type']?.includes('SettingGroupCollectionDefinition') &&
          s.displayName === 'Top Level Setting Group Collection';
        if (isSyntheticGroup) {
          syntheticGroupIds.add(s.id);
        } else {
          rootSettings.push(s);
          rootIds.add(s.id);
        }
      }
    }

    // Second pass: group children, but promote orphans whose root is absent
    // or whose root is a synthetic group container.
    // Skip children whose CSP path is identical to their parent's — they add
    // no new information and would appear as duplicate entries.
    for (const s of settings) {
      if (s.rootDefinitionId && s.rootDefinitionId !== s.id) {
        if (syntheticGroupIds.has(s.rootDefinitionId)) {
          // Parent is a synthetic group — promote child to root
          rootSettings.push(s);
          rootIds.add(s.id);
        } else if (rootIds.has(s.rootDefinitionId)) {
          // Skip child if its CSP path is identical to the parent's
          const parent = settingById.get(s.rootDefinitionId);
          if (parent && getCspPath(s) === getCspPath(parent)) continue;
          // Parent is present — attach as child
          const children = childMap.get(s.rootDefinitionId) || [];
          children.push(s);
          childMap.set(s.rootDefinitionId, children);
        } else {
          // Parent is absent (e.g. search didn't match it) — promote to root
          rootSettings.push(s);
          rootIds.add(s.id);
        }
      }
    }

    // Sort root settings alphabetically
    rootSettings.sort((a, b) =>
      (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
    );

    return { rootSettings, childMap };
  }, [settings]);

  const count = totalCount ?? rootSettings.length;

  // Progressive loading for long lists
  const [visibleCount, setVisibleCount] = useState(Math.min(PAGE_SIZE, rootSettings.length));

  // Reset visible count when the underlying data changes (e.g. new category selected)
  const settingsKey = settings.length > 0 ? settings[0].categoryId + ':' + settings.length : '';
  useEffect(() => {
    setVisibleCount(Math.min(PAGE_SIZE, rootSettings.length));
  }, [settingsKey, rootSettings.length]);

  const visibleSettings = rootSettings.slice(0, visibleCount);

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
                      {ancestor}
                    </span>
                    <svg className="w-2.5 h-2.5 text-fluent-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                ))}
              </>
            )}
            <span className="text-fluent-base font-semibold text-fluent-text">
              {categoryName}
            </span>
          </div>
          <span className="text-fluent-sm text-fluent-text-secondary ml-1">
            ({rootSettings.length} {rootSettings.length === 1 ? 'setting' : 'settings'})
          </span>
        </button>

        {/* Settings rows */}
        {!collapsed && (
          <div role="table" aria-label={`Settings from ${categoryName}`}>
            {visibleSettings.map((setting) => (
              <SettingRow
                key={setting.id}
                setting={setting}
                childSettings={childMap.get(setting.id)}
                highlightQuery={highlightQuery}
                allSettings={settings}
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
        <span className="w-32 text-right">Scope</span>
        <span className="w-20 text-right">Type</span>
        <span className="w-5" /> {/* Info icon spacer */}
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
