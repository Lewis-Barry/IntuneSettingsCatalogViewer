'use client';

import { useState, useMemo } from 'react';
import type { ChangelogEntry } from '@/lib/types';

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
  const stats = useMemo(() => {
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalChanged = 0;
    for (const e of entries) {
      totalAdded += e.added.length;
      totalRemoved += e.removed.length;
      totalChanged += e.changed.length;
    }

    // Most recent entry with actual changes
    const lastEntry = entries.find(
      (e) => e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0
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
    const latestChanged = lastEntry?.changed.length ?? 0;

    return {
      totalAdded,
      totalRemoved,
      totalChanged,
      totalDays: entries.length,
      lastChangeLabel,
      lastChangeDate,
      latestAdded,
      latestRemoved,
      latestChanged,
    };
  }, [entries]);

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
          subtitle={stats.latestAdded > 0 ? `+${stats.latestAdded} in latest update` : undefined}
          color="text-fluent-success"
        />
        <StatCard
          label="Settings removed"
          value={stats.totalRemoved}
          subtitle={stats.latestRemoved > 0 ? `${stats.latestRemoved} in latest update` : undefined}
          color="text-fluent-error"
        />
        <StatCard
          label="Settings changed"
          value={stats.totalChanged}
          subtitle={stats.latestChanged > 0 ? `${stats.latestChanged} in latest update` : undefined}
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
        {entries.map((entry) => {
          const isExpanded = expandedDates.has(entry.date);
          const hasAdded = entry.added.length > 0 && (filter === 'all' || filter === 'added');
          const hasRemoved = entry.removed.length > 0 && (filter === 'all' || filter === 'removed');
          const hasChanged = entry.changed.length > 0 && (filter === 'all' || filter === 'changed');
          const hasContent = hasAdded || hasRemoved || hasChanged;

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
                <div className="flex items-center gap-3 text-fluent-sm">
                  {entry.added.length > 0 && (
                    <span className="text-fluent-success">+{entry.added.length}</span>
                  )}
                  {entry.removed.length > 0 && (
                    <span className="text-fluent-error">-{entry.removed.length}</span>
                  )}
                  {entry.changed.length > 0 && (
                    <span className="text-fluent-warning">~{entry.changed.length}</span>
                  )}
                </div>
              </button>

              {/* Content */}
              {isExpanded && (
                <div className="border-t border-fluent-border">
                  {/* Added */}
                  {hasAdded && (
                    <div className="px-4 py-3">
                      <h4 className="text-fluent-sm font-semibold text-fluent-success mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Added ({entry.added.length})
                      </h4>
                      <div className="space-y-1">
                        {entry.added.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-fluent-sm">
                            <a
                              href={`/setting/${encodeURIComponent(s.id)}/`}
                              className="text-fluent-blue hover:underline"
                            >
                              {s.displayName}
                            </a>
                            {s.categoryName && (
                              <span className="text-fluent-text-disabled text-fluent-xs">
                                ({s.categoryName})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Removed */}
                  {hasRemoved && (
                    <div className="px-4 py-3 border-t border-fluent-border">
                      <h4 className="text-fluent-sm font-semibold text-fluent-error mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                        Removed ({entry.removed.length})
                      </h4>
                      <div className="space-y-1">
                        {entry.removed.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-fluent-sm text-fluent-text-secondary line-through">
                            {s.displayName}
                            {s.categoryName && (
                              <span className="text-fluent-text-disabled text-fluent-xs no-underline">
                                ({s.categoryName})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Changed */}
                  {hasChanged && (
                    <div className="px-4 py-3 border-t border-fluent-border">
                      <h4 className="text-fluent-sm font-semibold text-fluent-warning mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Changed ({entry.changed.length})
                      </h4>
                      <div className="space-y-2">
                        {entry.changed.map((s) => (
                          <div key={s.id} className="text-fluent-sm">
                            <a
                              href={`/setting/${encodeURIComponent(s.id)}/`}
                              className="text-fluent-blue hover:underline font-medium"
                            >
                              {s.displayName}
                            </a>
                            <div className="ml-4 mt-1 space-y-0.5">
                              {s.fields.map((f, i) => (
                                <div key={i} className="text-fluent-xs text-fluent-text-secondary">
                                  <span className="font-medium">{f.field}</span>:{' '}
                                  <span className="line-through text-fluent-error">{truncate(f.oldValue, 80)}</span>
                                  {' → '}
                                  <span className="text-fluent-success">{truncate(f.newValue, 80)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
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

function truncate(s: string, max: number): string {
  // Remove surrounding quotes from JSON stringification
  const clean = s.replace(/^"|"$/g, '');
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + '…';
}
