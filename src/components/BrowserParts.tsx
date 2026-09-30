'use client';

// Chrome shared by the OIB and MS Security Baseline browsers.

import { memo, useCallback, useRef, useState } from 'react';

// ── Page header (title, intro, load stats; search + filters as children) ─────

interface BrowserHeaderProps {
  title: string;
  intro: React.ReactNode;
  stats: React.ReactNode;
  isLoading: boolean;
  children: React.ReactNode;
}

export function BrowserHeader({ title, intro, stats, isLoading, children }: BrowserHeaderProps) {
  return (
    <div className="px-4 sm:px-6 py-3 md:py-4 border-b border-fluent-border bg-white dark:bg-[#1c1c1e]">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h1 className="text-fluent-2xl font-semibold text-fluent-text">{title}</h1>
          <p className="text-fluent-sm text-fluent-text-secondary mt-0.5">{intro}</p>
          <p className="text-fluent-sm text-fluent-text-secondary mt-1">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
                Loading…
              </span>
            ) : (
              stats
            )}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Search bar ───────────────────────────────────────────────────────────────

interface BrowserSearchBarProps {
  hint: string;
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
}

export function BrowserSearchBar({ hint, value, onChange, pending }: BrowserSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-fluent-sm text-fluent-text-secondary mb-2">{hint}</p>
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
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search for a setting"
            className="w-full pl-10 pr-8 py-2 text-fluent-base bg-white dark:bg-[#2c2c2e] border border-fluent-border-strong rounded
                       focus:outline-none focus:border-fluent-blue focus:ring-1 focus:ring-fluent-blue
                       placeholder:text-fluent-text-disabled"
            aria-label="Search baseline settings"
          />
          {value && (
            <button
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
              className="search-clear-btn absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                         text-fluent-text-secondary hover:text-fluent-text rounded-full"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {pending && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Collapsible section header bar (search results / policy cards) ───────────

interface SectionHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  breadcrumb?: string;
  /** Tailwind max-width for the breadcrumb on md+, e.g. `md:max-w-[220px]`. */
  breadcrumbMaxW: string;
  /** Rendered right after the title (e.g. a version tag). */
  titleSuffix?: React.ReactNode;
  /** Right-hand side of the bar (count, badges, links). */
  children: React.ReactNode;
}

export function SectionHeader({
  collapsed,
  onToggle,
  title,
  breadcrumb,
  breadcrumbMaxW,
  titleSuffix,
  children,
}: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
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
            <span className={`text-fluent-sm text-fluent-text-secondary md:truncate ${breadcrumbMaxW}`}>
              {breadcrumb}
            </span>
            <svg className="w-2.5 h-2.5 text-fluent-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
        <span className="text-fluent-base font-semibold text-fluent-text truncate">{title}</span>
        {titleSuffix}
      </div>
      {children}
    </button>
  );
}

// ── Sidebar: folders → categories ────────────────────────────────────────────

export interface SidebarFolder {
  folder: string;
  label: string;
  categories: Array<{ category: string; count: number }>;
}

interface FolderSidebarTreeProps {
  tree: SidebarFolder[];
  selectedFolder: string | null | undefined;
  selectedCategory: string | null | undefined;
  onSelect: (folder: string, category: string) => void;
}

export const FolderSidebarTree = memo(function FolderSidebarTree({
  tree,
  selectedFolder,
  selectedCategory,
  onSelect,
}: FolderSidebarTreeProps) {
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
          const total = folderNode.categories.reduce((sum, c) => sum + c.count, 0);

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
                aria-selected={false}
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
                <span className="flex-1 truncate text-fluent-base font-semibold">{folderNode.label}</span>
                <span className="text-fluent-xs text-fluent-text-secondary ml-1 flex-shrink-0">{total}</span>
              </button>

              {/* Categories under folder */}
              {!isCollapsed && (
                <div role="group">
                  {folderNode.categories.map((cat) => {
                    const isSelected = selectedFolder === folderNode.folder && selectedCategory === cat.category;
                    return (
                      <button
                        key={`${folderNode.folder}/${cat.category}`}
                        type="button"
                        className={`category-item ${isSelected ? 'category-item-active' : ''}`}
                        style={{ paddingLeft: `${8 + 14}px` }}
                        onClick={() => onSelect(folderNode.folder, cat.category)}
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
          );
        })}
      </div>
    </div>
  );
});

// ── Panel states ─────────────────────────────────────────────────────────────

export function SidebarLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-fluent-text-secondary">
      <div className="w-6 h-6 border-2 border-fluent-blue border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-fluent-sm">Loading…</p>
    </div>
  );
}

export function PanelLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
      <div className="w-8 h-8 border-3 border-fluent-blue border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-fluent-base">Loading baseline data…</p>
    </div>
  );
}

export function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
      <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <p className="text-fluent-lg font-medium mb-1">No results for &ldquo;{query}&rdquo;</p>
      <p className="text-fluent-base">Try a different search term.</p>
    </div>
  );
}

interface LoadErrorProps {
  title: string;
  error: string;
  command: string;
  /** What the command generates, e.g. "data files". */
  output: string;
}

export function LoadError({ title, error, command, output }: LoadErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary px-4">
      <p className="text-fluent-lg font-medium text-fluent-text mb-1">{title}</p>
      <p className="text-fluent-base">{error}</p>
      <p className="text-fluent-sm mt-2">
        Run <code className="font-mono bg-fluent-bg-alt px-1 rounded">{command}</code> to generate the {output}.
      </p>
    </div>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
      <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
      <p className="text-fluent-lg font-medium mb-1">{title}</p>
      <p className="text-fluent-base">
        Or use the search bar above to find specific settings
      </p>
    </div>
  );
}
