import { loadChangelog } from '@/lib/data';
import ChangelogViewer from '@/components/ChangelogViewer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog — Intune Settings Catalog Viewer',
  description: 'Changelog of additions, removals, and changes to the Intune Settings Catalog.',
};

export default function ChangelogPage() {
  const changelog = loadChangelog();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-fluent-2xl font-semibold text-fluent-text">
          Settings Catalog Changelog
        </h1>
        <p className="text-fluent-base text-fluent-text-secondary mt-1">
          Log of additions, removals, and changes to the Intune Settings Catalog. Each entry represents an update where changes were detected.
        </p>
      </div>

      {/* Tracking start notice */}
      <div className="fluent-card px-4 py-3 mb-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-fluent-blue flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-fluent-base font-medium text-fluent-text">
              Change tracking started on February 21, 2026
            </p>
            <p className="text-fluent-sm text-fluent-text-secondary mt-0.5">
              The Settings Catalog is checked periodically for changes by comparing each snapshot against the previous one. Entries only appear here when additions, removals, or modifications are actually detected &mdash; not every check results in an update.
            </p>
          </div>
        </div>
      </div>

      <ChangelogViewer entries={changelog} />
    </div>
  );
}
