'use client';

import { useState, useMemo, useRef } from 'react';
import { pillClass } from '@/lib/pill';
import { PLATFORM_ICONS, PLATFORM_LABELS } from './PlatformIcons';
import BrowserSidebar, { useBrowserSidebar } from './BrowserSidebar';
import { useIsDesktop } from '@/lib/useMediaQuery';
import HighlightText from './HighlightText';
import { getScopeBadgeClass } from '@/lib/types';
import {
  allRows,
  humanise,
  matchesQuery,
  typeLabel,
  type ComplianceRow,
  type ComplianceTemplate,
} from '@/lib/compliance-types';

const PLATFORMS = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }));

interface ComplianceBrowserProps {
  templates: ComplianceTemplate[];
}

export default function ComplianceBrowser({ templates }: ComplianceBrowserProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const isDesktop = useIsDesktop();
  const { sidebarOpen, setSidebarOpen, sidebarWidth, sidebarHydrated, handleResizeStart } = useBrowserSidebar();
  const scrollRef = useRef<HTMLDivElement>(null);

  const terms = useMemo(
    () => query.toLowerCase().split(',').map((t) => t.trim()).filter(Boolean),
    [query],
  );

  /** Platforms that actually have a template — the rest would filter to nothing. */
  const availableFamilies = useMemo(() => new Set(templates.map((t) => t.family)), [templates]);

  const visibleTemplates = useMemo(
    () => templates.filter((t) => selectedFamilies.length === 0 || selectedFamilies.includes(t.family)),
    [templates, selectedFamilies],
  );

  /** Rows after the platform + search filters, grouped by policy type. */
  const groups = useMemo(() => {
    const rows = allRows(visibleTemplates).filter((row) => matchesQuery(row, terms));
    const byType = new Map<string, { template: ComplianceTemplate; rows: ComplianceRow[] }>();
    for (const row of rows) {
      const group = byType.get(row.template.type) ?? { template: row.template, rows: [] };
      group.rows.push(row);
      byType.set(row.template.type, group);
    }
    return [...byType.values()];
  }, [visibleTemplates, terms]);

  // A platform filter can hide the selected type. Derive the effective selection
  // rather than syncing it back in an effect — the stored choice is kept, so
  // clearing the platform filter restores it.
  const effectiveType = useMemo(
    () => (selectedType && visibleTemplates.some((t) => t.type === selectedType) ? selectedType : null),
    [selectedType, visibleTemplates],
  );

  const shownGroups = useMemo(
    () => (effectiveType ? groups.filter((g) => g.template.type === effectiveType) : groups),
    [groups, effectiveType],
  );
  const totalShown = shownGroups.reduce((n, g) => n + g.rows.length, 0);
  const totalAvailable = visibleTemplates.reduce((n, t) => n + t.properties.length, 0);

  const toggleFamily = (family: string) => {
    setSelectedFamilies((current) =>
      current.includes(family) ? current.filter((f) => f !== family) : [...current, family],
    );
  };

  if (templates.length === 0) {
    return (
      <div role="alert" className="p-6 text-fluent-sm text-fluent-text-secondary">
        <p className="mb-2 text-fluent-error">No compliance catalog found.</p>
        <p>Run <code className="font-mono">npm run fetch-compliance-templates</code> to generate it.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-[calc(100dvh-96px)]">
      {/* Top section: title + search + filters — mirrors SettingsCatalogBrowser */}
      <div className="flex-none px-4 sm:px-6 py-3 md:py-4 border-b border-fluent-border bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-fluent-2xl font-semibold text-fluent-text">Compliance Settings</h1>
            <p className="text-fluent-sm text-fluent-text-secondary mt-1">
              {totalShown.toLocaleString()} settings available
              <span> · {visibleTemplates.length} policy {visibleTemplates.length === 1 ? 'type' : 'types'}</span>
              {totalShown !== totalAvailable && <span> · filtered from {totalAvailable.toLocaleString()}</span>}
            </p>
          </div>
        </div>

        {/* Search */}
        <div>
          <p className="text-fluent-sm text-fluent-text-secondary mb-2">
            Search by setting name, description, or possible value; separate multiple terms with commas
          </p>
          <div className="flex">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fluent-text-secondary"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a setting"
                aria-label="Search compliance settings"
                className="w-full pl-10 pr-8 py-2 text-fluent-base bg-white dark:bg-[#2c2c2e] border border-fluent-border-strong rounded
                           focus:outline-none focus:border-fluent-blue focus:ring-1 focus:ring-fluent-blue
                           placeholder:text-fluent-text-disabled"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="search-clear-btn absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                             text-fluent-text-secondary hover:text-fluent-text rounded-full"
                  aria-label="Clear search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Platform filters */}
        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-fluent-sm text-fluent-text-secondary font-medium">Platform:</span>
            <button
              onClick={() => setSelectedFamilies([])}
              className={`platform-filter-btn ${pillClass(selectedFamilies.length === 0)}`}
            >
              All
            </button>
            {PLATFORMS.filter((p) => availableFamilies.has(p.value)).map((p) => {
              const Icon = PLATFORM_ICONS[p.value];
              return (
                <button
                  key={p.value}
                  onClick={() => toggleFamily(p.value)}
                  className={`platform-filter-btn ${pillClass(selectedFamilies.includes(p.value))}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {p.label}
                </button>
              );
            })}
          </div>
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
          <div className="fluent-scroll overflow-y-auto">
            <h3 className="px-2 py-2 text-fluent-sm font-semibold text-fluent-text-secondary uppercase tracking-wide">
              Browse by policy type
            </h3>
            <div className="space-y-0.5">
              {visibleTemplates.map((t) => {
                const count = groups.find((g) => g.template.type === t.type)?.rows.length ?? 0;
                const isSelected = t.type === effectiveType;
                return (
                  <button
                    key={t.type}
                    type="button"
                    className={`category-item ${isSelected ? 'category-item-active' : ''}`}
                    style={{ paddingLeft: '8px' }}
                    role="treeitem"
                    aria-selected={isSelected}
                    onClick={() => {
                      setSelectedType(isSelected ? null : t.type);
                      if (!isDesktop) setSidebarOpen(false);
                      scrollRef.current?.scrollTo({ top: 0 });
                    }}
                  >
                    <span className="category-chevron-spacer w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate text-fluent-base">{t.platform}</span>
                    {count > 0 && (
                      <span className="text-fluent-xs text-fluent-text-secondary ml-1 flex-shrink-0">
                        {count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        }
      >
        {/* Settings list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto fluent-scroll bg-white dark:bg-[#1c1c1e]">
          {totalShown === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fluent-text-secondary">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <p className="text-fluent-lg font-medium mb-1">No settings match</p>
              <p className="text-fluent-base">Try a different search term or platform</p>
            </div>
          ) : (
            shownGroups.map((group) => (
              <section key={group.template.type}>
                {/* Group header — same as the settings list category header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-fluent-border bg-fluent-bg-alt sticky top-0 z-10">
                  <span className="text-fluent-base font-semibold text-fluent-text">
                    <HighlightText text={group.template.platform} query={query} />
                  </span>
                  <span className="text-fluent-sm text-fluent-text-secondary ml-1">
                    ({group.rows.length} {group.rows.length === 1 ? 'setting' : 'settings'})
                  </span>
                </div>

                {/* Column header — identical widths to SettingsList */}
                <div
                  role="table"
                  aria-label={`Compliance settings for ${group.template.platform}`}
                >
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-fluent-border bg-fluent-bg-alt text-fluent-sm font-semibold text-fluent-text-secondary">
                    <span className="w-5" /> {/* Chevron spacer */}
                    <span className="flex-1">Setting name</span>
                    <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                      <span className="w-[4.5rem] text-center">Scope</span>
                      <span className="w-[6rem] text-center">Type</span>
                      <span className="w-[3.5rem]" /> {/* Extra badge spacer */}
                      <span className="w-5" /> {/* Info icon spacer */}
                    </div>
                  </div>

                  {group.rows.map((row) => (
                    <ComplianceSettingRow
                      key={`${group.template.type}:${row.property.name}`}
                      row={row}
                      query={query}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </BrowserSidebar>
    </div>
  );
}

function ComplianceSettingRow({ row, query }: { row: ComplianceRow; query: string }) {
  const [expanded, setExpanded] = useState(false);
  const { property, template } = row;
  const label = humanise(property.name);
  const docsUrl = `https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-${template.type.toLowerCase()}?view=graph-rest-beta`;
  const PlatformIcon = PLATFORM_ICONS[template.family];

  return (
    <div>
      {/* Main row */}
      <div
        className={`setting-row ${expanded ? 'setting-row-expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
        role="row"
        aria-expanded={expanded}
      >
        <button
          type="button"
          className="setting-expand-btn w-5 h-5 flex items-center justify-center flex-shrink-0 text-fluent-text-secondary hover:text-fluent-text"
          aria-label={expanded ? 'Collapse setting' : 'Expand setting'}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Setting name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-fluent-base md:truncate">
              <HighlightText text={label} query={query} />
            </span>
            {property.options && (
              <span
                className="text-fluent-xs text-fluent-text-secondary flex-shrink-0"
                title={`${property.options.length} possible values`}
              >
                ({property.options.length})
              </span>
            )}
          </div>

          {/* Mobile-only inline badges (stacked below name) */}
          <div className="flex md:hidden items-center gap-1.5 mt-1 flex-wrap">
            <span className={`scope-badge whitespace-nowrap ${getScopeBadgeClass('device')}`}>Device</span>
            <span className="scope-badge whitespace-nowrap bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {typeLabel(property.type)}
            </span>
          </div>
        </div>

        {/* Desktop badges — fixed widths match the column header */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
          {/* Compliance policies assess device state, so every setting is device-scoped. */}
          <div className="w-[4.5rem] flex justify-center">
            <span className={`scope-badge whitespace-nowrap ${getScopeBadgeClass('device')}`}>Device</span>
          </div>
          <div className="w-[6rem] flex justify-center">
            <span className="scope-badge whitespace-nowrap bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {typeLabel(property.type)}
            </span>
          </div>
          <div className="w-[3.5rem] flex justify-center">
            {property.type.startsWith('[]') && (
              <span
                className="scope-badge whitespace-nowrap bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700"
                title="Collection – this setting holds a list of items"
              >
                List
              </span>
            )}
          </div>
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="info-icon flex-shrink-0"
            title="View this policy type on Microsoft Learn"
            onClick={(e) => e.stopPropagation()}
          >
            i
          </a>
        </div>

        {/* Mobile info icon */}
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="md:hidden info-icon flex-shrink-0"
          title="View this policy type on Microsoft Learn"
          onClick={(e) => e.stopPropagation()}
        >
          i
        </a>
      </div>

      {/* Expanded detail panel — same shell as SettingRow/SettingDetail */}
      {expanded && (
        <div className="border-b border-fluent-border bg-fluent-bg">
          <div className="px-4 md:px-6 py-4 space-y-4">
            {/* Platform pill + policy-type pill */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-fluent-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                {PlatformIcon && <PlatformIcon className="w-3.5 h-3.5" />}
                {template.platform}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-fluent-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                MDM
              </span>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-1">Description</h4>
              <p className="text-fluent-base text-fluent-text whitespace-pre-wrap">
                {property.description ? (
                  <HighlightText text={property.description} query={query} />
                ) : (
                  <em className="text-fluent-text-secondary">No description published by Microsoft.</em>
                )}
              </p>
            </div>

            {/* Possible values — same box style as the settings catalog options list */}
            {property.options && property.options.length > 0 && (
              <div>
                <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-2">
                  Possible values ({property.options.length})
                </h4>
                <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
                  {property.options.map((option) => (
                    <div
                      key={option.value}
                      className={`px-3 py-2 text-fluent-sm ${option.isDefault ? 'bg-fluent-light-blue' : 'bg-gray-50/50 dark:bg-gray-800/50'}`}
                    >
                      <div className="font-medium">
                        {option.value}
                        {option.isDefault && <span className="text-fluent-blue ml-2 text-fluent-xs">(default)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Graph property — the compliance equivalent of the CSP path row */}
            <div>
              <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-1.5">Graph property</h4>
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-fluent-sm text-fluent-text bg-fluent-bg-alt border border-fluent-border rounded px-2 py-1">
                  {template.type}.{property.name}
                </code>
                <span className="text-fluent-xs text-fluent-text-secondary">{property.type}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
