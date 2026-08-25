import { loadCategories, loadChangelog, loadChangelogSettingSummaries, loadChangelogSummaries } from '@/lib/data';
import ChangelogViewer from '@/components/ChangelogViewer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog — Intune Settings Catalog Viewer',
  description: 'Changelog of additions, removals, and changes to the Intune Settings Catalog.',
};

export const dynamic = 'force-static';

export default function ChangelogPage() {
  const changelog = loadChangelog();
  const categories = loadCategories();
  // Pass only the changelog-referenced settings, with heavy fields (options,
  // helpText for options, dependency arrays) stripped. Full setting JSON is
  // lazy-fetched per row from /changelog-settings/{slug}.json on expand.
  const settings = loadChangelogSettingSummaries();
  const summaries = loadChangelogSummaries();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-fluent-2xl font-semibold text-fluent-text">
            Settings Catalog Changelog
          </h1>
          <p className="text-fluent-base text-fluent-text-secondary mt-1">
            Review additions, removals, field-level updates, and category changes across tracked Settings Catalog snapshots.
          </p>
        </div>
        <span
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-fluent-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-fluent-text-secondary"
          title="Snapshots are compared periodically; version-only updates are hidden."
        >
          <svg className="w-3.5 h-3.5 text-fluent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Tracked since Feb 21, 2026
        </span>
      </div>

      <ChangelogViewer entries={changelog} categories={categories} settings={settings} summaries={summaries} />
    </div>
  );
}
