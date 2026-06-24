'use client';

import { useEffect, useState, useMemo } from 'react';
import type { ChangelogEntry, ChangelogSettingRef, ChangelogSettingSummary, SettingCategory, SettingDefinition } from '@/lib/types';
import { PLATFORM_ICONS } from './PlatformIcons';
import { settingSlug } from '@/lib/slug';
import SettingDetail from './SettingDetail';

interface ChangelogViewerProps {
  entries: ChangelogEntry[];
  categories: SettingCategory[];
  /** Stripped-down settings (changelog-referenced only). Full setting is
   *  lazy-fetched per row from /changelog-settings/{slug}.json on expand. */
  settings: ChangelogSettingSummary[];
}

// Module-level cache so re-expanding (or expanding the same setting via two
// different changelog entries) doesn't refetch.
const fullSettingCache = new Map<string, SettingDefinition>();
const inFlight = new Map<string, Promise<SettingDefinition | null>>();

function fetchFullSetting(id: string): Promise<SettingDefinition | null> {
  const cached = fullSettingCache.get(id);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(id);
  if (existing) return existing;

  const url = `/changelog-settings/${encodeURIComponent(settingSlug(id))}.json`;
  const promise = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<SettingDefinition>) : null))
    .then((data) => {
      if (data) fullSettingCache.set(id, data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(id);
    });
  inFlight.set(id, promise);
  return promise;
}

type FilterType = 'all' | 'added' | 'removed' | 'changed';

type ActionType = 'added' | 'removed' | 'changed';
type EntityType = 'setting' | 'category';
type FeedFilter = FilterType | 'categories';
type DateFilter = 'latest' | 'all' | `date:${string}`;

interface ChangeFeedItem {
  key: string;
  date: string;
  action: ActionType;
  entity: EntityType;
  title: string;
  categoryId?: string;
  categoryName?: string;
  hotspotCategory?: string;
  contextLabel?: string;
  contextDetail?: string;
  platform?: string;
  href?: string;
  setting?: ChangelogSettingSummary;
  fields?: Array<{ field: string; oldValue: string; newValue: string }>;
}

interface TaxonomySummary {
  total: number;
  added: number;
  changed: number;
  removed: number;
  moved: number;
  settings: number;
  moveGroups: Array<{ label: string; count: number }>;
  addGroups: Array<{ label: string; count: number }>;
}

const FILTERS: Array<{ value: FeedFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'added', label: 'Added' },
  { value: 'changed', label: 'Changed' },
  { value: 'removed', label: 'Removed' },
  { value: 'categories', label: 'Categories' },
];

const PLATFORMS = [
  { value: 'windows10', label: 'Windows' },
  { value: 'macOS', label: 'macOS' },
  { value: 'iOS', label: 'iOS/iPadOS' },
  { value: 'android', label: 'Android' },
  { value: 'linux', label: 'Linux' },
];

export default function ChangelogViewer({ entries, categories, settings }: ChangelogViewerProps) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [selectedDate, setSelectedDate] = useState<DateFilter>('latest');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const settingsById = useMemo(() => new Map(settings.map((setting) => [setting.id, setting])), [settings]);
  const cleanedEntries = useMemo(() => entries.map((e) => ({
    ...e,
    added: dedupeSettingRefs(e.added, settingsById),
    removed: dedupeSettingRefs(e.removed, settingsById),
    changed: dedupeSettingRefs(
      e.changed
      .map((c) => ({ ...c, fields: c.fields.filter((f) => f.field !== 'version') }))
      .filter((c) => c.fields.length > 0),
      settingsById,
    ),
  })), [entries, settingsById]);

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const categoryRollups = useMemo(() => buildCategoryRollupMap(categoriesById), [categoriesById]);

  const feedItems = useMemo<ChangeFeedItem[]>(() => {
    const items: ChangeFeedItem[] = [];

    for (const entry of cleanedEntries) {
      entry.added.forEach((setting, index) => {
        const currentSetting = settingsById.get(setting.id);
        items.push({
          key: `${entry.date}:added:setting:${setting.id}:${index}`,
          date: entry.date,
          action: 'added',
          entity: 'setting',
          title: setting.displayName,
          categoryId: setting.categoryId,
          categoryName: setting.categoryName,
          hotspotCategory: getHotspotCategory(setting.categoryId, setting.categoryName, categoryRollups),
          platform: setting.platform,
          href: `/setting/${encodeURIComponent(settingSlug(setting.id))}/`,
          setting: currentSetting,
        });
      });

      entry.removed.forEach((setting, index) => {
        items.push({
          key: `${entry.date}:removed:setting:${setting.id}:${index}`,
          date: entry.date,
          action: 'removed',
          entity: 'setting',
          title: setting.displayName,
          categoryId: setting.categoryId,
          categoryName: setting.categoryName,
          hotspotCategory: getHotspotCategory(setting.categoryId, setting.categoryName, categoryRollups),
          platform: setting.platform,
        });
      });

      entry.changed.forEach((setting, index) => {
        const currentSetting = settingsById.get(setting.id);
        items.push({
          key: `${entry.date}:changed:setting:${setting.id}:${index}`,
          date: entry.date,
          action: 'changed',
          entity: 'setting',
          title: setting.displayName,
          categoryId: setting.categoryId,
          categoryName: setting.categoryName,
          hotspotCategory: getHotspotCategory(setting.categoryId, setting.categoryName, categoryRollups),
          platform: setting.platform,
          href: `/setting/${encodeURIComponent(settingSlug(setting.id))}/`,
          setting: currentSetting,
          fields: setting.fields,
        });
      });

      entry.categoriesAdded?.forEach((category, index) => {
        const parentLabel = formatCategoryReference(category.parentCategoryId, categoriesById);
        items.push({
          key: `${entry.date}:added:category:${category.id}:${index}`,
          date: entry.date,
          action: 'added',
          entity: 'category',
          title: category.displayName,
          categoryId: category.id,
          contextLabel: parentLabel ? `Added under ${parentLabel}` : 'Added at top level',
          contextDetail: getCategoryPath(category.id, categoriesById),
        });
      });

      entry.categoriesRemoved?.forEach((category, index) => {
        const parentLabel = formatCategoryReference(category.parentCategoryId, categoriesById);
        items.push({
          key: `${entry.date}:removed:category:${category.id}:${index}`,
          date: entry.date,
          action: 'removed',
          entity: 'category',
          title: category.displayName,
          categoryId: category.id,
          contextLabel: parentLabel ? `Removed from ${parentLabel}` : 'Removed from top level',
          contextDetail: getCategoryPath(category.id, categoriesById),
        });
      });

      entry.categoriesChanged?.forEach((category, index) => {
        const fields = enrichCategoryFields(category.fields, categoriesById);
        items.push({
          key: `${entry.date}:changed:category:${category.id}:${index}`,
          date: entry.date,
          action: 'changed',
          entity: 'category',
          title: category.displayName,
          categoryId: category.id,
          contextLabel: getCategoryChangeSummary(category.fields, categoriesById),
          contextDetail: getCategoryPath(category.id, categoriesById),
          fields,
        });
      });
    }

    return items;
  }, [categoriesById, categoryRollups, cleanedEntries, settingsById]);

  const dateOptions = useMemo(() => {
    return Array.from(new Set(feedItems.map((item) => item.date))).sort((a, b) => b.localeCompare(a));
  }, [feedItems]);

  const latestDate = dateOptions[0] ?? null;
  const activeDate = selectedDate === 'all'
    ? null
    : selectedDate === 'latest'
      ? latestDate
      : selectedDate.replace(/^date:/, '');

  const dateScopedItems = useMemo(() => {
    if (!activeDate) return feedItems;
    return feedItems.filter((item) => item.date === activeDate);
  }, [activeDate, feedItems]);

  const stats = useMemo(() => {
    // Most recent entry with actual changes (version-only entries excluded via cleanedEntries)
    const lastEntry = cleanedEntries.find(
      (e) =>
        e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0 ||
        (e.categoriesAdded?.length ?? 0) > 0 ||
        (e.categoriesRemoved?.length ?? 0) > 0 ||
        (e.categoriesChanged?.length ?? 0) > 0
    );
    const lastChangeDate = lastEntry?.date ?? null;

    // Platform breakdown for the latest update only. Each setting that targets
    // multiple platforms increments each platform's counter, so the sum of
    // counts represents total platform-mentions across changed settings.
    const platformCounts = new Map<string, number>();
    let platformTotal = 0;
    if (lastEntry) {
      const trackPlatform = (platform?: string) => {
        getPlatformKeys(platform).forEach((p) => {
          platformCounts.set(p, (platformCounts.get(p) ?? 0) + 1);
          platformTotal += 1;
        });
      };
      lastEntry.added.forEach((s) => trackPlatform(s.platform));
      lastEntry.removed.forEach((s) => trackPlatform(s.platform));
      lastEntry.changed.forEach((s) => trackPlatform(s.platform));
    }

    // Relative description of last change
    let lastChangeLabel = 'No changes yet';
    if (lastChangeDate) {
      const diffMs = Date.now() - new Date(lastChangeDate + 'T00:00:00').getTime();
      const diffDays = Math.floor(diffMs / 86_400_000);
      if (diffDays === 0) lastChangeLabel = 'Today';
      else if (diffDays === 1) lastChangeLabel = 'Yesterday';
      else if (diffDays < 7) lastChangeLabel = `${diffDays} days ago`;
      else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        lastChangeLabel = weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
      } else {
        const months = Math.floor(diffDays / 30);
        lastChangeLabel = months === 1 ? '1 month ago' : `${months} months ago`;
      }
    }

    // Counts from the latest entry (delta since previous snapshot)
    const latestAdded = lastEntry?.added.length ?? 0;
    const latestRemoved = lastEntry?.removed.length ?? 0;
    const latestChanged = lastEntry?.changed.length ?? 0;
    const latestSettingTotal = latestAdded + latestRemoved + latestChanged;
    const latestCatChanges =
      (lastEntry?.categoriesAdded?.length ?? 0) +
      (lastEntry?.categoriesRemoved?.length ?? 0) +
      (lastEntry?.categoriesChanged?.length ?? 0);

    // Settings newly marked deprecated in the latest update — detect by a
    // displayName change where the new value contains "deprecated" but the old
    // one didn't.
    const latestNewlyDeprecated = lastEntry?.changed.filter((c) =>
      c.fields.some(
        (f) =>
          f.field === 'displayName' &&
          f.newValue.toLowerCase().includes('deprecated') &&
          !f.oldValue.toLowerCase().includes('deprecated'),
      ),
    ).length ?? 0;

    return {
      lastChangeLabel,
      lastChangeDate,
      latestAdded,
      latestChanged,
      latestSettingTotal,
      latestCatChanges,
      latestNewlyDeprecated,
      platformCounts: Array.from(platformCounts.entries()).sort((a, b) => b[1] - a[1]),
      platformTotal,
    };
  }, [cleanedEntries]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return dateScopedItems.filter((item) => {
      if (filter === 'categories' && item.entity !== 'category') return false;
      if (filter !== 'all' && filter !== 'categories' && item.action !== filter) return false;
      if (selectedCategory && item.hotspotCategory !== selectedCategory) return false;
      if (selectedPlatforms.length > 0) {
        const platformKeys = getPlatformKeys(item.platform);
        if (item.entity !== 'setting' || !selectedPlatforms.some((p) => platformKeys.includes(p))) return false;
      }
      if (!normalizedQuery) return true;

      return buildHaystack(item).includes(normalizedQuery);
    });
  }, [dateScopedItems, filter, query, selectedCategory, selectedPlatforms]);

  const scopedHotspots = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const counts = new Map<string, number>();
    let total = 0;

    dateScopedItems.forEach((item) => {
      if (item.entity !== 'setting' || !item.hotspotCategory) return;
      if (filter !== 'all' && filter !== 'categories' && item.action !== filter) return;
      if (filter === 'categories') return;
      if (selectedPlatforms.length > 0) {
        const platformKeys = getPlatformKeys(item.platform);
        if (!selectedPlatforms.some((p) => platformKeys.includes(p))) return;
      }
      if (normalizedQuery && !buildHaystack(item).includes(normalizedQuery)) return;

      counts.set(item.hotspotCategory, (counts.get(item.hotspotCategory) ?? 0) + 1);
      total += 1;
    });

    const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 8);
    const otherCount = ranked.slice(8).reduce((s, [, c]) => s + c, 0);
    return { top, otherCount, total };
  }, [dateScopedItems, filter, query, selectedPlatforms]);

  const taxonomySummary = useMemo(() => buildTaxonomySummary(filteredItems), [filteredItems]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-fluent-text-secondary">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-fluent-base">No changes detected yet.</p>
        <p className="text-fluent-sm mt-1">
          The daily data refresh will compare each snapshot against the previous one. Any additions, removals, or changes will be logged here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="fluent-card p-4 sm:p-5">
          <div className="flex h-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-fluent-sm font-semibold text-fluent-text-secondary">Latest update</div>
              <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                <div className="text-fluent-3xl font-semibold text-fluent-text">{stats.lastChangeLabel}</div>
                {stats.lastChangeDate && (
                  <div className="pb-1 text-fluent-sm text-fluent-text-secondary">
                    {formatDate(stats.lastChangeDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:min-w-[26rem]">
              <StatCard label="Setting additions" value={stats.latestAdded} color="text-fluent-success" />
              <StatCard label="Setting changes" value={stats.latestChanged} color="text-fluent-warning" />
              <StatCard label="Category changes" value={stats.latestCatChanges} color="text-fluent-blue" />
              <StatCard label="Deprecated" value={stats.latestNewlyDeprecated} color="text-fluent-text-secondary" />
            </div>
          </div>
        </div>

        <div className="fluent-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-fluent-base font-semibold text-fluent-text">Platform impact</h2>
            <span className="text-fluent-xs text-fluent-text-secondary">
              {stats.latestSettingTotal.toLocaleString()} settings
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {stats.platformCounts.slice(0, 5).map(([platform, count]) => (
              <ImpactBar key={platform} label={PLATFORM_LABELS[platform] ?? platform} value={count} total={stats.platformTotal} iconKey={platform} />
            ))}
          </div>
        </div>
      </section>

      <section className="fluent-card p-3 sm:p-4 lg:sticky lg:top-0 lg:z-10">
        <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_auto] xl:items-center">
          <label className="relative block">
            <span className="sr-only">Search changes</span>
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fluent-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search changes"
              className="w-full rounded border border-fluent-border bg-white py-2 pl-9 pr-3 text-fluent-base text-fluent-text outline-none transition-colors focus:border-fluent-blue dark:bg-[#1c1c1e]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Change date</span>
              <select
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value as DateFilter);
                  setSelectedCategory(null);
                  setExpandedItems(new Set());
                }}
                className="h-[34px] rounded border border-fluent-border bg-white px-3 pr-8 text-fluent-sm text-fluent-text outline-none transition-colors focus:border-fluent-blue dark:bg-[#2c2c2e] dark:border-[#636366]"
              >
                {latestDate && (
                  <option value="latest">
                    Latest update ({formatDate(latestDate, { month: 'short', day: 'numeric', year: 'numeric' })})
                  </option>
                )}
                <option value="all">All updates</option>
                {dateOptions.slice(1).map((date) => (
                  <option key={date} value={`date:${date}`}>
                    {formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </label>
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded text-fluent-sm border transition-colors ${
                  filter === f.value
                    ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
                    : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-fluent-border pt-3">
          <button
            onClick={() => setSelectedPlatforms([])}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-fluent-sm transition-colors ${
              selectedPlatforms.length === 0
                ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
                : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
            }`}
          >
            All platforms
          </button>
          {PLATFORMS.map((platform) => {
            const Icon = PLATFORM_ICONS[platform.value];
            const isActive = selectedPlatforms.includes(platform.value);
            return (
              <button
                key={platform.value}
                onClick={() => togglePlatform(platform.value)}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-fluent-sm transition-colors ${
                  isActive
                    ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
                    : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
                }`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {platform.label}
              </button>
            );
          })}
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="ml-auto inline-flex items-center gap-1.5 rounded border border-fluent-border bg-fluent-bg-alt px-3 py-1 text-fluent-sm text-fluent-text hover:bg-fluent-border dark:hover:bg-[#3a3a3c]"
            >
              {selectedCategory}
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-36 lg:self-start">
          <div>
            <h2 className="text-fluent-base font-semibold text-fluent-text">Hotspots</h2>
            <p className="mt-1 text-fluent-sm text-fluent-text-secondary">
              {activeDate
                ? `${dateScopedItems.length.toLocaleString()} changes on ${formatDate(activeDate, { month: 'short', day: 'numeric', year: 'numeric' })}`
                : `${feedItems.length.toLocaleString()} tracked changes`}
            </p>
          </div>
          <div className="space-y-2">
            {scopedHotspots.top.length === 0 ? (
              taxonomySummary.total > 0 ? (
                <TaxonomySummaryPanel summary={taxonomySummary} />
              ) : (
                <div className="rounded border border-fluent-border bg-fluent-bg-alt px-3 py-4 text-fluent-sm text-fluent-text-secondary dark:bg-[#2c2c2e]">
                  No setting hotspots.
                </div>
              )
            ) : (
              <>
                {scopedHotspots.top.map(([category, count]) => {
                  const share = scopedHotspots.total > 0 ? (count / scopedHotspots.total) * 100 : 0;
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                      className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                        selectedCategory === category
                          ? 'border-fluent-blue bg-fluent-light-blue text-fluent-blue'
                          : 'border-fluent-border bg-white text-fluent-text hover:bg-fluent-bg-alt dark:bg-[#2c2c2e]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-fluent-sm font-semibold">
                        <span className="truncate">{category}</span>
                        <span>
                          {count}
                          <span className="ml-1 font-normal text-fluent-text-secondary">({share.toFixed(share < 1 ? 1 : 0)}%)</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fluent-bg-alt dark:bg-[#1c1c1e]">
                        <div
                          className="h-full rounded-full bg-fluent-blue"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
                {scopedHotspots.otherCount > 0 && (() => {
                  const share = scopedHotspots.total > 0 ? (scopedHotspots.otherCount / scopedHotspots.total) * 100 : 0;
                  return (
                    <div className="w-full rounded border border-fluent-border bg-fluent-bg-alt px-3 py-2 dark:bg-[#2c2c2e]">
                      <div className="flex items-center justify-between gap-3 text-fluent-sm font-semibold text-fluent-text-secondary">
                        <span className="truncate">Other categories</span>
                        <span>
                          {scopedHotspots.otherCount}
                          <span className="ml-1 font-normal">({share.toFixed(share < 1 ? 1 : 0)}%)</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white dark:bg-[#1c1c1e]">
                        <div
                          className="h-full rounded-full bg-fluent-text-secondary/50"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </aside>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-fluent-base font-semibold text-fluent-text">Change feed</h2>
            <span className="text-fluent-sm text-fluent-text-secondary">{filteredItems.length.toLocaleString()} results</span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="fluent-card px-4 py-10 text-center text-fluent-text-secondary">
              <p className="text-fluent-base">No matching changes.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <ChangeFeedRow
                  key={item.key}
                  item={item}
                  expanded={expandedItems.has(item.key)}
                  onToggle={() => toggleItem(item.key)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, color }: {
  label: string;
  value?: number;
  color: string;
}) {
  return (
    <div className="rounded border border-fluent-border bg-fluent-bg-alt px-3 py-2 dark:bg-[#1c1c1e]">
      <div className={`text-fluent-xl font-bold ${color}`}>
        {value?.toLocaleString() ?? '—'}
      </div>
      <div className="text-fluent-xs text-fluent-text-secondary">{label}</div>
    </div>
  );
}

function ImpactBar({ label, value, total, iconKey }: { label: string; value: number; total: number; iconKey: string }) {
  const Icon = PLATFORM_ICONS[iconKey];
  const share = total > 0 ? (value / total) * 100 : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-fluent-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fluent-text">
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-fluent-text-secondary">
          {value.toLocaleString()}
          <span className="ml-1">({share.toFixed(share < 1 ? 1 : 0)}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-fluent-bg-alt dark:bg-[#1c1c1e]">
        <div className="h-full rounded-full bg-fluent-blue" style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function TaxonomySummaryPanel({ summary }: { summary: TaxonomySummary }) {
  return (
    <div className="rounded border border-fluent-border bg-fluent-bg-alt px-3 py-3 dark:bg-[#2c2c2e]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-fluent-sm font-semibold text-fluent-text">Taxonomy update</div>
          <div className="mt-0.5 text-fluent-xs text-fluent-text-secondary">
            {summary.settings === 0 ? 'No setting definitions changed.' : `${summary.settings.toLocaleString()} setting changes included.`}
          </div>
        </div>
        <span className="rounded bg-white px-2 py-0.5 text-fluent-xs font-semibold text-fluent-blue dark:bg-[#1c1c1e]">
          {summary.total.toLocaleString()}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <MiniCount label="Added" value={summary.added} tone="text-fluent-success" />
        <MiniCount label="Moved" value={summary.moved} tone="text-fluent-warning" />
        <MiniCount label="Removed" value={summary.removed} tone="text-fluent-error" />
      </div>

      {summary.moveGroups.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-fluent-xs font-semibold uppercase tracking-wide text-fluent-text-secondary">Parent moves</div>
          {summary.moveGroups.slice(0, 3).map((group) => (
            <div key={group.label} className="rounded bg-white px-2 py-1.5 text-fluent-xs text-fluent-text-secondary dark:bg-[#1c1c1e]">
              <span className="font-semibold text-fluent-text">{group.count}</span> {group.label}
            </div>
          ))}
        </div>
      )}

      {summary.moveGroups.length === 0 && summary.addGroups.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-fluent-xs font-semibold uppercase tracking-wide text-fluent-text-secondary">Added under</div>
          {summary.addGroups.slice(0, 3).map((group) => (
            <div key={group.label} className="rounded bg-white px-2 py-1.5 text-fluent-xs text-fluent-text-secondary dark:bg-[#1c1c1e]">
              <span className="font-semibold text-fluent-text">{group.count}</span> {group.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniCount({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded bg-white px-2 py-1.5 dark:bg-[#1c1c1e]">
      <div className={`text-fluent-base font-semibold ${tone}`}>{value.toLocaleString()}</div>
      <div className="text-fluent-xs text-fluent-text-secondary">{label}</div>
    </div>
  );
}

function ChangeFeedRow({ item, expanded, onToggle }: { item: ChangeFeedItem; expanded: boolean; onToggle: () => void }) {
  const actionStyles = getActionStyles(item.action);
  const hasDetails = (item.fields?.length ?? 0) > 0;
  const showSettingDetail = item.action === 'added' && Boolean(item.setting);

  const [fullSetting, setFullSetting] = useState<SettingDefinition | null>(() =>
    item.setting ? fullSettingCache.get(item.setting.id) ?? null : null,
  );

  useEffect(() => {
    if (!expanded || !showSettingDetail || fullSetting || !item.setting) return;
    let cancelled = false;
    fetchFullSetting(item.setting.id).then((data) => {
      if (!cancelled && data) setFullSetting(data);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, showSettingDetail, fullSetting, item.setting]);

  return (
    <div className={`fluent-card overflow-hidden border-l-4 ${actionStyles.border}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-fluent-bg"
        aria-expanded={expanded}
      >
        <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${actionStyles.badge}`}>
          <ActionIcon action={item.action} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-fluent-base font-semibold text-fluent-text">{item.title}</span>
            <span className="rounded bg-fluent-bg-alt px-1.5 py-0.5 text-fluent-xs capitalize text-fluent-text-secondary dark:bg-[#1c1c1e]">
              {item.entity}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-fluent-sm text-fluent-text-secondary">
            <ActionLabel action={item.action} />
            {item.categoryName && <span>{item.categoryName}</span>}
            {item.contextLabel && <span>{item.contextLabel}</span>}
            <PlatformBadges platform={item.platform} />
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-fluent-sm text-fluent-text-secondary">{formatDate(item.date, { month: 'short', day: 'numeric' })}</span>
          <svg className={`h-4 w-4 text-fluent-text-secondary transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-fluent-border px-4 py-3">
          <div className="mb-3 text-fluent-sm text-fluent-text-secondary">
            {formatDate(item.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          {item.contextDetail && (
            <div className="mb-3 rounded border border-fluent-border bg-fluent-bg-alt px-3 py-2 text-fluent-sm text-fluent-text-secondary dark:bg-[#1c1c1e]">
              <span className="font-semibold text-fluent-text">Path:</span> {item.contextDetail}
            </div>
          )}
          {showSettingDetail ? (
            <div className="rounded border border-fluent-border bg-fluent-bg dark:bg-[#1c1c1e]">
              {fullSetting ? (
                <SettingDetail setting={fullSetting} />
              ) : (
                <div className="px-4 md:px-6 py-6 text-fluent-sm text-fluent-text-secondary flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M7.757 16.243l-2.121 2.121m12.728 0l-2.121-2.121M7.757 7.757L5.636 5.636" />
                  </svg>
                  Loading details…
                </div>
              )}
            </div>
          ) : hasDetails ? (
            <DiffBlock title={item.title} badge={item.categoryName} platform={item.platform} fields={item.fields!} />
          ) : (
            <div className="rounded border border-fluent-border bg-fluent-bg-alt px-3 py-2 text-fluent-sm text-fluent-text-secondary dark:bg-[#1c1c1e]">
              {item.action === 'added' ? 'New item in this snapshot.' : item.action === 'removed' ? 'Item no longer appears in this snapshot.' : 'No field-level details available.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionIcon({ action }: { action: ActionType }) {
  const path =
    action === 'added'
      ? 'M12 5v14M5 12h14' // plus
      : action === 'removed'
        ? 'M5 12h14' // minus
        : 'M4 13c2.25-3.5 5-3.5 8 0s5.75 3.5 8 0'; // tilde / change

  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function ActionLabel({ action }: { action: ActionType }) {
  const label = action === 'added' ? 'Added' : action === 'removed' ? 'Removed' : 'Changed';
  const className = action === 'added'
    ? 'text-fluent-success'
    : action === 'removed'
      ? 'text-fluent-error'
      : 'text-fluent-warning';

  return <span className={`font-semibold ${className}`}>{label}</span>;
}

function getActionStyles(action: ActionType) {
  if (action === 'added') {
    return { border: 'border-l-fluent-success/60', badge: 'bg-fluent-success/10 text-fluent-success' };
  }
  if (action === 'removed') {
    return { border: 'border-l-fluent-error/60', badge: 'bg-fluent-error/10 text-fluent-error' };
  }
  return { border: 'border-l-fluent-warning/70', badge: 'bg-fluent-warning/10 text-fluent-warning' };
}

function buildHaystack(item: ChangeFeedItem): string {
  return [
    item.title,
    item.hotspotCategory,
    item.categoryName,
    item.contextLabel,
    item.contextDetail,
    item.platform,
    item.date,
    getSettingSearchText(item.setting),
    item.fields?.map((f) => `${f.field} ${f.oldValue} ${f.newValue}`).join(' '),
  ].filter(Boolean).join(' ').toLowerCase();
}

function getSettingSearchText(setting?: ChangelogSettingSummary): string {
  if (!setting) return '';

  // Note: option-level text isn't searchable on the changelog page since
  // options are excluded from the initial payload (lazy-fetched on expand).
  const cspPath = setting.baseUri && setting.offsetUri
    ? `${setting.baseUri}/${setting.offsetUri}`
    : setting.baseUri || setting.offsetUri;

  return [
    setting.displayName,
    setting.name,
    setting.description,
    setting.helpText,
    setting.applicability?.technologies,
    setting.defaultValue === undefined ? undefined : String(setting.defaultValue),
    cspPath,
  ].filter(Boolean).join(' ');
}

function dedupeSettingRefs<T extends ChangelogSettingRef>(
  refs: T[],
  settingsById: Map<string, ChangelogSettingSummary>,
): T[] {
  const refsById = new Map(refs.map((ref) => [ref.id, ref]));
  const withoutChildren = refs.filter((ref) => {
    const parent = getDuplicateParentRef(ref, refsById, settingsById);
    return !parent || !hasSameFeedIdentity(ref, parent);
  });

  const merged = new Map<string, T>();
  for (const ref of withoutChildren) {
    const key = getEquivalentSettingKey(ref, settingsById);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...ref });
      continue;
    }

    existing.platform = mergePlatformLists(existing.platform, ref.platform);
  }

  return Array.from(merged.values());
}

function getDuplicateParentRef<T extends ChangelogSettingRef>(
  ref: T,
  refsById: Map<string, T>,
  settingsById: Map<string, ChangelogSettingSummary>,
): T | undefined {
  const rootDefinitionId = settingsById.get(ref.id)?.rootDefinitionId;
  if (rootDefinitionId && rootDefinitionId !== ref.id) {
    const parent = refsById.get(rootDefinitionId);
    if (parent) return parent;
  }

  let bestParent: T | undefined;
  for (const candidate of refsById.values()) {
    if (
      candidate.id !== ref.id &&
      ref.id.startsWith(`${candidate.id}_`) &&
      (!bestParent || candidate.id.length > bestParent.id.length)
    ) {
      bestParent = candidate;
    }
  }
  return bestParent;
}

function hasSameFeedIdentity(a: ChangelogSettingRef, b: ChangelogSettingRef): boolean {
  return (
    a.displayName === b.displayName &&
    a.categoryId === b.categoryId &&
    (a.categoryName ?? '') === (b.categoryName ?? '')
  );
}

function getEquivalentSettingKey(
  ref: ChangelogSettingRef,
  settingsById: Map<string, ChangelogSettingSummary>,
): string {
  const setting = settingsById.get(ref.id);
  const fields = 'fields' in ref && Array.isArray(ref.fields)
    ? ref.fields
        .map((field) => [
          normalizeIdentityText(field.field),
          normalizeIdentityText(field.oldValue),
          normalizeIdentityText(field.newValue),
        ].join('\u001f'))
        .sort()
        .join('\u001e')
    : '';

  return [
    normalizeIdentityText(ref.displayName),
    ref.categoryId,
    normalizeIdentityText(ref.categoryName),
    normalizeIdentityText(setting?.name),
    normalizeIdentityDescription(setting?.description),
    normalizeIdentityText(setting?.helpText),
    fields,
  ].join('\u001f');
}

function normalizeIdentityText(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeIdentityDescription(value?: string | null): string {
  return normalizeIdentityText(value).replace(/\s*Example value:\s*.*$/i, '').trim();
}

function mergePlatformLists(a?: string, b?: string): string | undefined {
  const raw = [a, b]
    .filter(Boolean)
    .flatMap((platform) => platform!.split(',').map((p) => p.trim()).filter(Boolean));
  if (raw.length === 0) return undefined;

  const byKey = new Map<string, string>();
  for (const platform of raw) {
    const key = normalizePlatformKey(platform) ?? platform;
    if (!byKey.has(key)) byKey.set(key, platform);
  }

  return Array.from(byKey.entries())
    .map(([key, label]) => PLATFORM_LABELS[key] ? key : label)
    .join(',');
}

/** Strip surrounding JSON quotes so values display cleanly */
function cleanValue(s: string): string {
  return s.replace(/^"|"$/g, '');
}

/** Platform key → display label (matches PlatformFilter) */
const PLATFORM_LABELS: Record<string, string> = {
  windows10: 'Windows',
  macOS: 'macOS',
  iOS: 'iOS/iPadOS',
  android: 'Android',
  linux: 'Linux',
};

/** Normalize a raw platform string to its canonical icon key */
function normalizePlatformKey(p: string): string | null {
  if (p === 'iOS') return 'iOS';
  if (p === 'macOS') return 'macOS';
  if (p.startsWith('windows')) return 'windows10';
  if (p.startsWith('android') || p === 'aosp' || p === 'androidEnterprise') return 'android';
  if (p === 'linux') return 'linux';
  return null;
}

function getPlatformKeys(platform?: string): string[] {
  if (!platform) return [];

  const seen = new Set<string>();
  const keys: string[] = [];
  platform.split(',').map((p) => p.trim()).filter(Boolean).forEach((p) => {
    const key = normalizePlatformKey(p);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  });

  return keys;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', options);
}

function buildCategoryRollupMap(categoriesById: Map<string, SettingCategory>): Map<string, string> {
  const rollups = new Map<string, string>();

  for (const category of categoriesById.values()) {
    const root = category.rootCategoryId ? categoriesById.get(category.rootCategoryId) : undefined;
    if (root?.displayName) {
      rollups.set(category.id, root.displayName);
      continue;
    }

    let current = category;
    const seen = new Set<string>();
    while (current.parentCategoryId && current.parentCategoryId !== current.id && !seen.has(current.parentCategoryId)) {
      seen.add(current.id);
      const parent = categoriesById.get(current.parentCategoryId);
      if (!parent) break;
      current = parent;
    }

    rollups.set(category.id, current.displayName || category.displayName);
  }

  return rollups;
}

function getHotspotCategory(categoryId: string | undefined, categoryName: string | undefined, rollups: Map<string, string>): string | undefined {
  if (!categoryId) return categoryName;
  return rollups.get(categoryId) ?? categoryName;
}

function buildTaxonomySummary(items: ChangeFeedItem[]): TaxonomySummary {
  const moveCounts = new Map<string, number>();
  const addCounts = new Map<string, number>();
  let added = 0;
  let changed = 0;
  let removed = 0;
  let moved = 0;
  let settings = 0;

  for (const item of items) {
    if (item.entity === 'setting') {
      settings += 1;
      continue;
    }

    if (item.action === 'added') {
      added += 1;
      const label = item.contextLabel?.replace(/^Added under\s+/i, '');
      if (label) addCounts.set(label, (addCounts.get(label) ?? 0) + 1);
    } else if (item.action === 'removed') {
      removed += 1;
    } else {
      changed += 1;
      if (item.contextLabel?.startsWith('Moved from ')) {
        moved += 1;
        const label = item.contextLabel.replace(/^Moved from\s+/i, '').replace(/\s+to\s+/i, ' to ');
        moveCounts.set(label, (moveCounts.get(label) ?? 0) + 1);
      }
    }
  }

  const toSortedGroups = (counts: Map<string, number>) => Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    total: added + changed + removed,
    added,
    changed,
    removed,
    moved,
    settings,
    moveGroups: toSortedGroups(moveCounts),
    addGroups: toSortedGroups(addCounts),
  };
}

function getCategoryPath(categoryId: string | undefined, categoriesById: Map<string, SettingCategory>): string | undefined {
  if (!categoryId) return undefined;
  const category = categoriesById.get(categoryId);
  if (!category) return undefined;

  const chain: string[] = [];
  const seen = new Set<string>();
  let current: SettingCategory | undefined = category;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.displayName) chain.unshift(current.displayName);
    if (!current.parentCategoryId || current.parentCategoryId === current.id || isEmptyCategoryId(current.parentCategoryId)) break;
    current = categoriesById.get(current.parentCategoryId);
  }

  return chain.length > 0 ? chain.join(' > ') : undefined;
}

function enrichCategoryFields(fields: Array<{ field: string; oldValue: string; newValue: string }>, categoriesById: Map<string, SettingCategory>) {
  return fields.map((field) => {
    if (field.field !== 'parentCategoryId') return field;

    return {
      ...field,
      field: 'Parent category',
      oldValue: formatCategoryReference(field.oldValue, categoriesById) ?? cleanValue(field.oldValue),
      newValue: formatCategoryReference(field.newValue, categoriesById) ?? cleanValue(field.newValue),
    };
  });
}

function getCategoryChangeSummary(fields: Array<{ field: string; oldValue: string; newValue: string }>, categoriesById: Map<string, SettingCategory>): string | undefined {
  const parentChange = fields.find((field) => field.field === 'parentCategoryId');
  if (!parentChange) return undefined;

  const oldParent = formatCategoryReference(parentChange.oldValue, categoriesById) ?? cleanValue(parentChange.oldValue);
  const newParent = formatCategoryReference(parentChange.newValue, categoriesById) ?? cleanValue(parentChange.newValue);
  return `Moved from ${oldParent} to ${newParent}`;
}

function formatCategoryReference(value: string | undefined, categoriesById: Map<string, SettingCategory>): string | undefined {
  if (!value) return undefined;
  const id = cleanValue(value);
  if (isEmptyCategoryId(id)) return 'Top level';
  const category = categoriesById.get(id);
  if (category?.displayName) return category.displayName;
  if (/^[0-9a-f-]{36}$/i.test(id)) return `Unknown category (${id.slice(0, 8)})`;
  return id;
}

function isEmptyCategoryId(value: string): boolean {
  return value === '00000000-0000-0000-0000-000000000000';
}

/** Render platform indicators from a comma-separated platform string — styled like the platform filter buttons */
function PlatformBadges({ platform }: { platform?: string }) {
  if (!platform) return null;
  const platforms = platform.split(',').map((p) => p.trim()).filter(Boolean);
  if (platforms.length === 0) return null;

  // Deduplicate by normalized key
  const seen = new Set<string>();
  const unique: Array<{ key: string; label: string }> = [];
  for (const p of platforms) {
    const key = normalizePlatformKey(p);
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push({ key, label: PLATFORM_LABELS[key] ?? p });
    } else if (!key) {
      unique.push({ key: p, label: p });
    }
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {unique.map(({ key, label }) => {
        const Icon = PLATFORM_ICONS[key];
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-fluent-border dark:border-[#636366] bg-white dark:bg-[#2c2c2e] text-fluent-text text-[11px] leading-tight font-medium"
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
          </span>
        );
      })}
    </span>
  );
}

/** GitHub-style unified diff box for a single changed item */
function DiffBlock({ title, badge, platform, fields }: {
  title: string;
  badge?: string;
  platform?: string;
  fields: Array<{ field: string; oldValue: string; newValue: string }>;
}) {
  return (
    <div className="rounded-md border border-[#d0d7de] dark:border-[#30363d] overflow-hidden text-fluent-sm">
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f6f8fa] dark:bg-[#161b22] border-b border-[#d0d7de] dark:border-[#30363d]">
        <svg className="w-4 h-4 text-[#656d76] dark:text-[#8b949e] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span className="font-semibold text-fluent-sm text-fluent-text truncate">{title}</span>
        <span className="shrink-0 ml-auto inline-flex items-center gap-1.5">
          <span className="text-[11px] text-[#57606a] dark:text-[#8b949e] rounded-full bg-white dark:bg-[#0d1117] border border-[#d0d7de] dark:border-[#30363d] px-2 py-0.5 font-medium">
            {fields.length} {fields.length === 1 ? 'field changed' : 'fields changed'}
          </span>
          {badge && (
            <span className="text-[11px] text-[#0550ae] dark:text-[#79c0ff] bg-[#ddf4ff] dark:bg-[#1f4173] rounded-full px-2 py-0.5 font-medium">
              {badge}
            </span>
          )}
          <PlatformBadges platform={platform} />
        </span>
      </div>
      <div className="divide-y divide-[#d0d7de] dark:divide-[#30363d]">
        {fields.map((f, i) => {
          const diff = getInlineChange(cleanValue(f.oldValue), cleanValue(f.newValue));
          return (
            <div key={i}>
              <div className="px-3 py-1.5 bg-[#f6f8fa] dark:bg-[#161b22] text-[#57606a] dark:text-[#8b949e] font-semibold text-[11px] tracking-wide uppercase">
                {f.field}
              </div>

              <div className="grid gap-2 px-3 py-2 bg-white dark:bg-[#0d1117]">
                <DiffValueBox
                  label="Previous"
                  tone="old"
                  value={diff.before}
                  changed={diff.changedOld}
                  trailing={diff.after}
                />
                <DiffValueBox
                  label="Current"
                  tone="new"
                  value={diff.before}
                  changed={diff.changedNew}
                  trailing={diff.after}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffValueBox({
  label,
  tone,
  value,
  changed,
  trailing,
}: {
  label: string;
  tone: 'old' | 'new';
  value: string;
  changed: string;
  trailing: string;
}) {
  const toneClasses = tone === 'old'
    ? {
      wrapper: 'border-[#ffcecb] dark:border-[#6e1f1f] bg-[#fff8f8] dark:bg-[#2d1416]',
      label: 'text-[#cf222e] dark:text-[#ff7b72]',
      highlight: 'bg-[#ffcecb]/70 dark:bg-[#6e1f1f]/80 text-[#82071e] dark:text-[#ffa198]',
    }
    : {
      wrapper: 'border-[#aceebb] dark:border-[#1e6436] bg-[#f0fff4] dark:bg-[#10281a]',
      label: 'text-[#1a7f37] dark:text-[#3fb950]',
      highlight: 'bg-[#aceebb]/70 dark:bg-[#1e6436]/80 text-[#116329] dark:text-[#56d364]',
    };

  return (
    <div className={`rounded border px-2.5 py-2 ${toneClasses.wrapper}`}>
      <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${toneClasses.label}`}>{label}</div>
      <div className="font-mono text-[12px] leading-[1.5] break-words whitespace-pre-wrap [overflow-wrap:anywhere] text-fluent-text">
        {value}
        {changed ? <mark className={`rounded px-0.5 break-words whitespace-pre-wrap [overflow-wrap:anywhere] ${toneClasses.highlight}`}>{changed}</mark> : null}
        {trailing}
      </div>
    </div>
  );
}

function getInlineChange(oldValue: string, newValue: string) {
  if (oldValue === newValue) {
    return {
      before: oldValue,
      changedOld: '',
      changedNew: '',
      after: '',
    };
  }

  let start = 0;
  const minLength = Math.min(oldValue.length, newValue.length);
  while (start < minLength && oldValue[start] === newValue[start]) {
    start += 1;
  }

  let oldEnd = oldValue.length - 1;
  let newEnd = newValue.length - 1;
  while (oldEnd >= start && newEnd >= start && oldValue[oldEnd] === newValue[newEnd]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const before = oldValue.slice(0, start);
  const changedOld = oldValue.slice(start, oldEnd + 1);
  const changedNew = newValue.slice(start, newEnd + 1);
  const after = oldValue.slice(oldEnd + 1);

  // Keep long unchanged context concise so the changed region stands out.
  const contextLimit = 120;
  const beforeClipped = before.length > contextLimit ? `...${before.slice(before.length - contextLimit)}` : before;
  const afterClipped = after.length > contextLimit ? `${after.slice(0, contextLimit)}...` : after;

  return {
    before: beforeClipped,
    changedOld,
    changedNew,
    after: afterClipped,
  };
}
