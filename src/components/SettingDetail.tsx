import type { SettingDefinition, MatchSource } from '@/lib/types';
import { getPlatformLabel } from '@/lib/types';
import { PLATFORM_ICONS } from './PlatformIcons';
import HighlightText from './HighlightText';

interface SettingDetailProps {
  setting: SettingDefinition;
  /** Pass all sibling settings so we can resolve dependedOnBy child details */
  allSettings?: SettingDefinition[];
  /** The raw search query to highlight matched words in the description */
  highlightQuery?: string;
  /** Where the search query matched for this setting */
  matchSources?: MatchSource[];
}

export default function SettingDetail({ setting, allSettings, highlightQuery, matchSources }: SettingDetailProps) {
  const cspPath =
    setting.baseUri && setting.offsetUri
      ? `${setting.baseUri}/${setting.offsetUri}`
      : setting.baseUri || setting.offsetUri || '—';
  const platform = setting.applicability?.platform;
  const platformLabel = getPlatformLabel(platform);
  const PlatformIcon = platform ? PLATFORM_ICONS[platform] : undefined;

  // Highlight variant logic:
  //   - If title matched: description & CSP use secondary (blue) highlight
  //   - If only description/CSP matched (no title match): that field uses primary (yellow)
  const hasTitleMatch = matchSources?.includes('title') ?? false;
  const descVariant: 'title' | 'secondary' = hasTitleMatch ? 'secondary' : 'title';
  const cspVariant: 'title' | 'secondary' = hasTitleMatch
    ? 'secondary'
    : matchSources?.includes('csp') && !matchSources?.includes('description')
      ? 'title'
      : 'secondary';

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Platform pill + toggle indicator bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Platform pill */}
        {platform && platform !== 'none' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-fluent-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {PlatformIcon && <PlatformIcon className="w-3.5 h-3.5" />}
            {platformLabel}
          </span>
        )}

        {/* Technology pill */}
        {setting.applicability?.technologies && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-fluent-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
            {setting.applicability.technologies.toUpperCase()}
          </span>
        )}
      </div>

      {/* Description */}
      {setting.description && (
        <div>
          <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-1">
            Description
          </h4>
          <p className="text-fluent-base text-fluent-text whitespace-pre-wrap">
            <HighlightText text={setting.description} query={highlightQuery} variant={descVariant} />
          </p>
        </div>
      )}

      {/* Choice options */}
      {setting.options && setting.options.length > 0 && (
        <div>
          <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-2">
            Options ({setting.options.length})
          </h4>
          <div className="border border-gray-200 rounded-md overflow-hidden divide-y divide-gray-200">
            {setting.options.map((opt) => (
              <div
                key={opt.itemId}
                className={`px-3 py-2 text-fluent-sm ${
                  opt.itemId === setting.defaultOptionId ? 'bg-fluent-light-blue' : 'bg-gray-50/50'
                }`}
              >
                <div className="font-medium">
                  {opt.displayName}
                  {opt.itemId === setting.defaultOptionId && (
                    <span className="text-fluent-blue ml-2 text-fluent-xs">(default)</span>
                  )}
                </div>
                {opt.description &&
                  opt.description.trim().toLowerCase() !== opt.displayName?.trim().toLowerCase() && (
                  <p className="text-fluent-text-secondary text-fluent-xs mt-1 whitespace-pre-wrap break-words">
                    {opt.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSP Path — subtle and small */}
      <div className="pt-1">
        <span className="text-fluent-xs text-fluent-text-disabled font-mono">
          <HighlightText text={cspPath} query={highlightQuery} variant={cspVariant} />
        </span>
      </div>
    </div>
  );
}