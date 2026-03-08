import type { SettingDefinition, MatchSource } from '@/lib/types';
import { getPlatformLabel } from '@/lib/types';
import { getAsrRuleInfo, ASR_DOCS_URL } from '@/lib/asr-rules';
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
  /** Option IDs actively selected (e.g. by OIB baseline) — highlighted in the options list */
  activeOptionIds?: string[];
  /** Resolved simple value configured by a baseline (shown when no options list) */
  activeSimpleValue?: string;
}

export default function SettingDetail({ setting, allSettings, highlightQuery, matchSources, activeOptionIds, activeSimpleValue }: SettingDetailProps) {
  const cspPath =
    setting.baseUri && setting.offsetUri
      ? `${setting.baseUri}/${setting.offsetUri}`
      : setting.baseUri || setting.offsetUri || '—';
  const platform = setting.applicability?.platform;
  const platformLabel = getPlatformLabel(platform);
  const PlatformIcon = platform ? PLATFORM_ICONS[platform] : undefined;

  // ASR rule info
  const asrInfo = getAsrRuleInfo(setting.id);

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
    <div className="px-4 md:px-6 py-4 space-y-4">
      {/* Platform pill + technology pill */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Platform pill */}
        {platform && platform !== 'none' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-fluent-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
            {PlatformIcon && <PlatformIcon className="w-3.5 h-3.5" />}
            {platformLabel}
          </span>
        )}

        {/* Technology pill */}
        {setting.applicability?.technologies && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-fluent-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
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

      {/* Configured value for simple (non-choice) settings — same box style as options list */}
      {activeSimpleValue && !(setting.options && setting.options.length > 0) && (
        <div>
          <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-2">
            Configured Value
          </h4>
          <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <div className="px-3 py-2 text-fluent-sm bg-green-50 dark:bg-green-950/30 border-l-[3px] border-l-green-500 dark:border-l-green-400">
              <div className="font-medium">
                {activeSimpleValue}
                <span className="text-green-600 dark:text-green-400 ml-2 text-fluent-xs font-semibold">(OIB)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Choice options */}
      {setting.options && setting.options.length > 0 && (
        <div>
          <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-2">
            Options ({setting.options.length})
          </h4>
          <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
            {setting.options.map((opt) => {
              const isDefault = opt.itemId === setting.defaultOptionId;
              const isOibSelected = activeOptionIds?.includes(opt.itemId) ?? false;

              let bgClass = 'bg-gray-50/50 dark:bg-gray-800/50';
              if (isOibSelected) {
                bgClass = 'bg-green-50 dark:bg-green-950/30';
              } else if (isDefault) {
                bgClass = 'bg-fluent-light-blue';
              }

              return (
                <div
                  key={opt.itemId}
                  className={`px-3 py-2 text-fluent-sm ${bgClass}${isOibSelected ? ' border-l-[3px] border-l-green-500 dark:border-l-green-400' : ''}`}
                >
                  <div className="font-medium">
                    {opt.displayName}
                    {isDefault && (
                      <span className="text-fluent-blue ml-2 text-fluent-xs">(default)</span>
                    )}
                    {isOibSelected && (
                      <span className="text-green-600 dark:text-green-400 ml-2 text-fluent-xs font-semibold">(OIB)</span>
                    )}
                  </div>
                  {opt.description &&
                    opt.description.trim().toLowerCase() !== opt.displayName?.trim().toLowerCase() && (
                    <p className="text-fluent-text-secondary text-fluent-xs mt-1 whitespace-pre-wrap break-words">
                      {opt.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ASR Rule — GUID & docs link */}
      {asrInfo && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-fluent-xs text-fluent-text-secondary">
            <span className="font-medium">ASR Rule GUID:</span>
            <code className="font-mono select-all">{asrInfo.guid}</code>
          </div>
          {asrInfo.note && (
            <p className="text-fluent-xs text-fluent-text-tertiary italic">
              {asrInfo.note}
            </p>
          )}
          <a
            href={ASR_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-fluent-xs text-fluent-blue hover:underline"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            ASR rules reference
          </a>
        </div>
      )}

      {/* CSP Path + MS Learn links */}
      <div className="flex items-end justify-between gap-3 pt-1">
        <span className="text-fluent-xs text-fluent-text-secondary font-mono break-all">
          <HighlightText text={cspPath} query={highlightQuery} variant={cspVariant} />
        </span>
        {setting.infoUrls && setting.infoUrls.length > 0 && (
          <div className="flex gap-2 flex-shrink-0">
            {setting.infoUrls.map((url, i) => {
              // Insert tracking param before any # fragment
              const hashIdx = url.indexOf('#');
              const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
              const fragment = hashIdx >= 0 ? url.slice(hashIdx) : '';
              const separator = base.includes('?') ? '&' : '?';
              const href = `${base}${separator}wt.mc_id=MVP_310915${fragment}`;
              return (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-fluent-xs font-medium text-fluent-blue bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors whitespace-nowrap"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  MS Learn
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}