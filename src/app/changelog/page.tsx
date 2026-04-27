import { loadCategories, loadChangelog, loadSettings } from '@/lib/data';
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
  const settings = loadSettings();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-fluent-2xl font-semibold text-fluent-text">
          Settings Catalog Changelog
        </h1>
        <p className="text-fluent-base text-fluent-text-secondary mt-1">
          Review additions, removals, field-level updates, and category changes across tracked Settings Catalog snapshots.
        </p>
      </div>

      {/* Tracking start notice */}
      <div className="fluent-card px-4 py-3 mb-6 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-fluent-blue flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-fluent-base font-medium text-fluent-text">
              Change tracking started on February 21, 2026
            </p>
            <p className="text-fluent-sm text-fluent-text-secondary mt-0.5">
              The Settings Catalog is checked periodically by comparing each snapshot against the previous one. Version-only setting updates are hidden from the main review so the feed stays focused on meaningful catalog changes.
            </p>
          </div>
        </div>
      </div>

      <ChangelogViewer entries={changelog} categories={categories} settings={settings} />
    </div>
  );
}
