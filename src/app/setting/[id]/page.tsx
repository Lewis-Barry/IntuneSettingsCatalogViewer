import { loadSettings, loadCategories } from '@/lib/data';
import SettingDetail from '@/components/SettingDetail';
import { getPlatformLabel } from '@/lib/types';
import { getAsrRuleInfo, ASR_DOCS_URL } from '@/lib/asr-rules';
import { PLATFORM_ICONS } from '@/components/PlatformIcons';
import Link from 'next/link';
import type { Metadata } from 'next';

interface SettingPageProps {
  params: { id: string };
}

// Generate all setting pages at build time
export async function generateStaticParams() {
  const settings = loadSettings();
  return settings.map((s) => ({
    id: s.id,
  }));
}

// Dynamic metadata for SEO
export async function generateMetadata({ params }: SettingPageProps): Promise<Metadata> {
  const settings = loadSettings();
  const setting = settings.find((s) => s.id === decodeURIComponent(params.id));

  if (!setting) {
    return { title: 'Setting Not Found' };
  }

  return {
    title: `${setting.displayName} — Intune Settings Catalog`,
    description: setting.description || `Intune setting: ${setting.displayName}`,
  };
}

export default function SettingPage({ params }: SettingPageProps) {
  const decodedId = decodeURIComponent(params.id);
  const settings = loadSettings();
  const categories = loadCategories();
  const setting = settings.find((s) => s.id === decodedId);

  if (!setting) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center">
          <h1 className="text-fluent-2xl font-semibold text-fluent-text mb-2">
            Setting Not Found
          </h1>
          <p className="text-fluent-base text-fluent-text-secondary mb-6">
            The setting with ID &ldquo;{decodedId}&rdquo; was not found in the catalog.
          </p>
          <Link href="/" className="fluent-btn-primary">
            Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  const category = categories.find((c) => c.id === setting.categoryId);
  const childSettings = settings.filter(
    (s) => s.rootDefinitionId === setting.id && s.id !== setting.id
  );

  // Platform info
  const platform = setting.applicability?.platform;
  const platformLabel = getPlatformLabel(platform);
  const PlatformIcon = platform ? PLATFORM_ICONS[platform] : undefined;

  // Build breadcrumbs
  const breadcrumbs: Array<{ name: string; id: string }> = [];
  if (category) {
    // Walk up the category hierarchy
    let current = category;
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      breadcrumbs.unshift({ name: current.displayName, id: current.id });
      if (current.parentCategoryId && current.parentCategoryId !== current.id) {
        const parent = catMap.get(current.parentCategoryId);
        if (parent) {
          current = parent;
        } else break;
      } else break;
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-fluent-sm text-fluent-text-secondary mb-4 flex-wrap">
        <Link href="/" className="hover:text-fluent-blue hover:underline">
          Home
        </Link>
        {breadcrumbs.map((bc, i) => (
          <span key={bc.id} className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>{bc.name}</span>
          </span>
        ))}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-fluent-text font-medium">{setting.displayName}</span>
      </nav>

      {/* Setting title */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-fluent-2xl font-semibold text-fluent-text">
            {setting.displayName}
          </h1>
          {platform && platform !== 'none' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-fluent-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {PlatformIcon && <PlatformIcon className="w-3.5 h-3.5" />}
              {platformLabel}
            </span>
          )}
        </div>
        {category && (
          <p className="text-fluent-base text-fluent-text-secondary mt-1">
            Category: {category.displayName}
          </p>
        )}
        {/* ASR Rule info on full page */}
        {(() => {
          const asrInfo = getAsrRuleInfo(setting.id);
          return asrInfo ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-fluent-sm text-fluent-text-secondary">
                <span className="font-medium">ASR Rule GUID:</span>
                <code className="font-mono select-all">{asrInfo.guid}</code>
              </div>
              {asrInfo.note && (
                <p className="text-fluent-xs text-fluent-text-tertiary italic">
                  {asrInfo.note}
                </p>
              )}
              <a
                href={`${ASR_DOCS_URL}#${asrInfo.guid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-fluent-sm text-fluent-blue hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Microsoft Learn
              </a>
            </div>
          ) : null;
        })()}
      </div>

      {/* Setting detail card */}
      <div className="fluent-card">
        <SettingDetail setting={setting} allSettings={settings} />
      </div>

      {/* Child settings */}
      {childSettings.length > 0 && (
        <div className="mt-6">
          <h2 className="text-fluent-lg font-semibold text-fluent-text mb-3">
            Child Settings ({childSettings.length})
          </h2>
          <div className="space-y-3">
            {childSettings.map((child) => (
              <div key={child.id} className="fluent-card">
                <div className="px-4 py-3">
                  <Link
                    href={`/setting/${encodeURIComponent(child.id)}/`}
                    className="text-fluent-base font-medium text-fluent-blue hover:underline"
                    prefetch={false}
                  >
                    {child.displayName || child.name}
                  </Link>
                  {child.description && (
                    <p className="text-fluent-sm text-fluent-text-secondary mt-1 line-clamp-2">
                      {child.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link href="/" className="fluent-btn-secondary inline-flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Browse
        </Link>
      </div>
    </div>
  );
}
