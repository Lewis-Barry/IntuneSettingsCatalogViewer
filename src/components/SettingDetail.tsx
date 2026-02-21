import type { SettingDefinition } from '@/lib/types';
import { getPlatformLabel } from '@/lib/types';
import { PLATFORM_ICONS } from './PlatformIcons';

interface SettingDetailProps {
  setting: SettingDefinition;
  /** Pass all sibling settings so we can resolve dependedOnBy child details */
  allSettings?: SettingDefinition[];
}

export default function SettingDetail({ setting, allSettings }: SettingDetailProps) {
  const cspPath =
    setting.baseUri && setting.offsetUri
      ? `${setting.baseUri}/${setting.offsetUri}`
      : setting.baseUri || setting.offsetUri || '—';

  const platform = setting.applicability?.platform;
  const platformLabel = getPlatformLabel(platform);
  const PlatformIcon = platform ? PLATFORM_ICONS[platform] : undefined;

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Platform pill + toggle indicator bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Platform pill */}
        {platform && platform !== 'none' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-fluent-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {PlatformIcon && <PlatformIcon className="w-3.5 h-3.5" />}
            {platformLabel}
          </span>
        )}

        {/* Technology pill */}
        {setting.applicability?.technologies && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-fluent-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
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
            {setting.description}
          </p>
        </div>
      )}

      {/* Choice options */}
      {setting.options && setting.options.length > 0 && (
        <div>
          <h4 className="text-fluent-sm font-semibold text-fluent-text-secondary mb-2">
            Options ({setting.options.length})
          </h4>
          <div className="space-y-1">
            {setting.options.map((opt) => (
              <div
                key={opt.itemId}
                className={`flex items-start gap-2 px-3 py-1.5 rounded text-fluent-sm ${
                  opt.itemId === setting.defaultOptionId ? 'bg-fluent-light-blue' : 'bg-gray-50'
                }`}
              >
                <span className="font-medium min-w-0 flex-1">
                  {opt.displayName}
                  {opt.itemId === setting.defaultOptionId && (
                    <span className="text-fluent-blue ml-2">(default)</span>
                  )}
                </span>
                {opt.description && (
                  <span className="text-fluent-text-secondary text-fluent-xs max-w-xs truncate">
                    {opt.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSP Path — subtle and small */}
      <div className="pt-1">
        <span className="text-fluent-xs text-fluent-text-disabled font-mono">
          {cspPath}
        </span>
      </div>
    </div>
  );
}