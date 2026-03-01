'use client';

import { useState, useMemo } from 'react';
import type { ChangelogEntry } from '@/lib/types';
import { PLATFORM_ICONS } from './PlatformIcons';
import { settingSlug } from '@/lib/slug';

interface ChangelogViewerProps {
  entries: ChangelogEntry[];
}

type FilterType = 'all' | 'added' | 'removed' | 'changed';

export default function ChangelogViewer({ entries }: ChangelogViewerProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    new Set(entries.slice(0, 3).map((e) => e.date))
  );

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  // Summary stats
  // Strip version-only noise: remove `version` field diffs and drop entries with no remaining fields
  const cleanedEntries = useMemo(() => entries.map((e) => ({
    ...e,
    changed: e.changed
      .map((c) => ({ ...c, fields: c.fields.filter((f) => f.field !== 'version') }))
      .filter((c) => c.fields.length > 0),
  })), [entries]);

  const stats = useMemo(() => {
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalChanged = 0;
    let totalCatAdded = 0;
    let totalCatRemoved = 0;
    let totalCatChanged = 0;
    for (const e of cleanedEntries) {
      totalAdded += e.added.length;
      totalRemoved += e.removed.length;
      totalChanged += e.changed.length;
      totalCatAdded += e.categoriesAdded?.length ?? 0;
      totalCatRemoved += e.categoriesRemoved?.length ?? 0;
      totalCatChanged += e.categoriesChanged?.length ?? 0;
    }

    // Most recent entry with actual changes (version-only entries excluded via cleanedEntries)
    const lastEntry = cleanedEntries.find(
      (e) =>
        e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0 ||
        (e.categoriesAdded?.length ?? 0) > 0 ||
        (e.categoriesRemoved?.length ?? 0) > 0 ||
        (e.categoriesChanged?.length ?? 0) > 0
    );
    const lastChangeDate = lastEntry?.date ?? null;

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

    // Counts from the latest entry (for "since last update" context)
    const latestAdded = lastEntry?.added.length ?? 0;
    const latestRemoved = lastEntry?.removed.length ?? 0;
    const latestChanged = lastEntry?.changed.length ?? 0;  // already version-filtered via cleanedEntries
    const latestCatAdded = lastEntry?.categoriesAdded?.length ?? 0;
    const latestCatRemoved = lastEntry?.categoriesRemoved?.length ?? 0;
    const latestCatChanged = lastEntry?.categoriesChanged?.length ?? 0;

    return {
      totalAdded,
      totalRemoved,
      totalChanged,
      totalCatAdded,
      totalCatRemoved,
      totalCatChanged,
      totalDays: entries.length,
      lastChangeLabel,
      lastChangeDate,
      latestAdded,
      latestRemoved,
      latestChanged,
      latestCatAdded,
      latestCatRemoved,
      latestCatChanged,
    };
  }, [cleanedEntries]);

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
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Last change detected"
          displayValue={stats.lastChangeLabel}
          subtitle={stats.lastChangeDate
            ? new Date(stats.lastChangeDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : undefined}
          color="text-fluent-text"
        />
        <StatCard
          label="Settings added"
          value={stats.totalAdded}
          subtitle={[
            stats.latestAdded > 0 ? `+${stats.latestAdded} settings` : '',
            stats.latestCatAdded > 0 ? `+${stats.latestCatAdded} categories` : '',
          ].filter(Boolean).join(', ') || undefined}
          color="text-fluent-success"
        />
        <StatCard
          label="Settings removed"
          value={stats.totalRemoved}
          subtitle={[
            stats.latestRemoved > 0 ? `${stats.latestRemoved} settings` : '',
            stats.latestCatRemoved > 0 ? `${stats.latestCatRemoved} categories` : '',
          ].filter(Boolean).join(', ') || undefined}
          color="text-fluent-error"
        />
        <StatCard
          label="Settings changed"
          value={stats.totalChanged}
          subtitle={[
            stats.latestChanged > 0 ? `${stats.latestChanged} settings` : '',
            stats.latestCatChanged > 0 ? `${stats.latestCatChanged} categories` : '',
          ].filter(Boolean).join(', ') || undefined}
          color="text-fluent-warning"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-fluent-border pb-3">
        {(['all', 'added', 'removed', 'changed'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-fluent-sm capitalize transition-colors ${
              filter === f
                ? 'bg-fluent-blue text-white'
                : 'bg-fluent-bg-alt text-fluent-text hover:bg-fluent-border'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="space-y-3">
        {cleanedEntries.map((entry) => {
          const isExpanded = expandedDates.has(entry.date);
          const hasAdded = entry.added.length > 0 && (filter === 'all' || filter === 'added');
          const hasRemoved = entry.removed.length > 0 && (filter === 'all' || filter === 'removed');
          const hasChanged = entry.changed.length > 0 && (filter === 'all' || filter === 'changed');
          const hasCatAdded = (entry.categoriesAdded?.length ?? 0) > 0 && (filter === 'all' || filter === 'added');
          const hasCatRemoved = (entry.categoriesRemoved?.length ?? 0) > 0 && (filter === 'all' || filter === 'removed');
          const hasCatChanged = (entry.categoriesChanged?.length ?? 0) > 0 && (filter === 'all' || filter === 'changed');
          const hasContent = hasAdded || hasRemoved || hasChanged || hasCatAdded || hasCatRemoved || hasCatChanged;

          if (!hasContent && filter !== 'all') return null;

          const dateStr = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });

          return (
            <div key={entry.date} className="fluent-card">
              {/* Date header */}
              <button
                onClick={() => toggleDate(entry.date)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-fluent-bg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`w-4 h-4 text-fluent-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-fluent-base font-semibold">{dateStr}</span>
                </div>
                <div className="flex items-center gap-2 text-fluent-xs">
                  {entry.added.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-fluent-success bg-fluent-success/10 rounded-full px-2 py-0.5 font-medium">+{entry.added.length}</span>
                  )}
                  {entry.removed.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-fluent-error bg-fluent-error/10 rounded-full px-2 py-0.5 font-medium">−{entry.removed.length}</span>
                  )}
                  {entry.changed.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-fluent-warning bg-fluent-warning/10 rounded-full px-2 py-0.5 font-medium">~{entry.changed.length}</span>
                  )}
                  {((entry.categoriesAdded?.length ?? 0) + (entry.categoriesRemoved?.length ?? 0) + (entry.categoriesChanged?.length ?? 0)) > 0 && (
                    <span className="text-fluent-text-secondary text-fluent-xs border border-fluent-border rounded px-1">
                      {(entry.categoriesAdded?.length ?? 0) + (entry.categoriesRemoved?.length ?? 0) + (entry.categoriesChanged?.length ?? 0)} cat
                    </span>
                  )}
                </div>
              </button>

              {/* Content */}
              {isExpanded && (
                <div className="border-t border-fluent-border">
                  {/* Added */}
                  {hasAdded && (
                    <div className="px-4 py-3 border-l-2 border-l-fluent-success/30 ml-px">
                      <h4 className="text-fluent-sm font-semibold text-fluent-success mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Added ({entry.added.length})
                      </h4>
                      <div className="space-y-1">
                        {entry.added.map((s) => (
                          <div key={s.id} className="flex items-start gap-2 text-fluent-sm py-0.5">
                            <a
                              href={`/setting/${encodeURIComponent(settingSlug(s.id))}/`}
                              className="text-fluent-blue hover:underline"
                            >
                              {s.displayName}
                            </a>
                            <span className="ml-auto inline-flex items-center gap-1.5 shrink-0">
                              {s.categoryName && (
                                <span className="text-fluent-text-disabled text-fluent-xs bg-fluent-bg-alt rounded px-1.5 py-0.5">
                                  {s.categoryName}
                                </span>
                              )}
                              <PlatformBadges platform={s.platform} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Removed */}
                  {hasRemoved && (
                    <div className="px-4 py-3 border-t border-fluent-border border-l-2 border-l-fluent-error/30 ml-px">
                      <h4 className="text-fluent-sm font-semibold text-fluent-error mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                        Removed ({entry.removed.length})
                      </h4>
                      <div className="space-y-1">
                        {entry.removed.map((s) => (
                          <div key={s.id} className="flex items-start gap-2 text-fluent-sm py-0.5">
                            <span className="text-fluent-text-secondary line-through">{s.displayName}</span>
                            <span className="ml-auto inline-flex items-center gap-1.5 shrink-0">
                              {s.categoryName && (
                                <span className="text-fluent-text-disabled text-fluent-xs bg-fluent-bg-alt rounded px-1.5 py-0.5 no-underline">
                                  {s.categoryName}
                                </span>
                              )}
                              <PlatformBadges platform={s.platform} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Changed */}
                  {hasChanged && (
                    <div className="px-4 py-3 border-t border-fluent-border border-l-2 border-l-fluent-warning/30 ml-px">
                      <h4 className="text-fluent-sm font-semibold text-fluent-warning mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Changed ({entry.changed.length})
                      </h4>
                      <div className="space-y-3">
                        {entry.changed.map((s) => (
                          <DiffBlock
                            key={s.id}
                            title={s.displayName}
                            href={`/setting/${encodeURIComponent(settingSlug(s.id))}/`}
                            badge={s.categoryName}
                            platform={s.platform}
                            fields={s.fields}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Categories Added */}
                  {hasCatAdded && (
                    <div className="px-4 py-3 border-t border-fluent-border border-l-2 border-l-fluent-success/30 ml-px">
                      <h4 className="text-fluent-sm font-semibold text-fluent-success mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Categories Added ({entry.categoriesAdded!.length})
                      </h4>
                      <div className="space-y-1">
                        {entry.categoriesAdded!.map((c) => (
                          <div key={c.id} className="text-fluent-sm text-fluent-text">
                            {c.displayName}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Categories Removed */}
                  {hasCatRemoved && (
                    <div className="px-4 py-3 border-t border-fluent-border border-l-2 border-l-fluent-error/30 ml-px">
                      <h4 className="text-fluent-sm font-semibold text-fluent-error mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                        Categories Removed ({entry.categoriesRemoved!.length})
                      </h4>
                      <div className="space-y-1">
                        {entry.categoriesRemoved!.map((c) => (
                          <div key={c.id} className="text-fluent-sm text-fluent-text-secondary line-through">
                            {c.displayName}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Categories Changed */}
                  {hasCatChanged && (
                    <div className="px-4 py-3 border-t border-fluent-border border-l-2 border-l-fluent-warning/30 ml-px">
                      <h4 className="text-fluent-sm font-semibold text-fluent-warning mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Categories Changed ({entry.categoriesChanged!.length})
                      </h4>
                      <div className="space-y-3">
                        {entry.categoriesChanged!.map((c) => (
                          <DiffBlock
                            key={c.id}
                            title={c.displayName}
                            fields={c.fields}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, displayValue, subtitle, color }: {
  label: string;
  value?: number;
  displayValue?: string;
  subtitle?: string;
  color: string;
}) {
  return (
    <div className="fluent-card px-4 py-3">
      <div className={`text-fluent-xl font-bold ${color}`}>
        {displayValue ?? value?.toLocaleString() ?? '—'}
      </div>
      <div className="text-fluent-xs text-fluent-text-secondary">{label}</div>
      {subtitle && (
        <div className="text-fluent-xs text-fluent-text-disabled mt-0.5">{subtitle}</div>
      )}
    </div>
  );
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
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-fluent-border bg-white text-fluent-text text-[11px] leading-tight font-medium"
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
function DiffBlock({ title, href, badge, platform, fields }: {
  title: string;
  href?: string;
  badge?: string;
  platform?: string;
  fields: Array<{ field: string; oldValue: string; newValue: string }>;
}) {
  return (
    <div className="rounded-md border border-[#d0d7de] overflow-hidden text-fluent-sm">
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f6f8fa] border-b border-[#d0d7de]">
        <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        {href ? (
          <a href={href} className="font-semibold text-fluent-sm text-fluent-blue hover:underline truncate">
            {title}
          </a>
        ) : (
          <span className="font-semibold text-fluent-sm text-fluent-text truncate">{title}</span>
        )}
        <span className="shrink-0 ml-auto inline-flex items-center gap-1.5">
          {badge && (
            <span className="text-[11px] text-[#656d76] bg-[#ddf4ff] rounded-full px-2 py-0.5 font-medium">
              {badge}
            </span>
          )}
          <PlatformBadges platform={platform} />
        </span>
      </div>
      {/* Diff lines */}
      <div className="font-mono text-fluent-xs leading-[20px] divide-y divide-[#d0d7de]">
        {fields.map((f, i) => (
          <div key={i}>
            {/* Hunk header — field name */}
            <div className="px-3 py-1 bg-[#ddf4ff] text-[#0550ae] font-semibold select-none text-[11px]">
              @@ {f.field} @@
            </div>
            {/* Removed line */}
            <div className="flex bg-[#ffebe9]">
              <span className="select-none shrink-0 w-8 text-center text-[#cf222e] bg-[#ffcecb]/40 border-r border-[#ffcecb]">
                −
              </span>
              <span className="px-2 py-0.5 break-words whitespace-pre-wrap text-[#82071e] min-w-0 flex-1">
                {cleanValue(f.oldValue)}
              </span>
            </div>
            {/* Added line */}
            <div className="flex bg-[#e6ffec]">
              <span className="select-none shrink-0 w-8 text-center text-[#1a7f37] bg-[#aceebb]/40 border-r border-[#aceebb]">
                +
              </span>
              <span className="px-2 py-0.5 break-words whitespace-pre-wrap text-[#116329] min-w-0 flex-1">
                {cleanValue(f.newValue)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
