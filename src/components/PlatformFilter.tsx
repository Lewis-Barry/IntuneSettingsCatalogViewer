'use client';

import { PLATFORM_ICONS, PLATFORM_LABELS } from './PlatformIcons';
import { pillClass } from '@/lib/pill';

interface PlatformFilterProps {
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
  deprecatedOnly?: boolean;
  onDeprecatedChange?: (value: boolean) => void;
}

const PLATFORMS = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }));

export default function PlatformFilter({
  selectedPlatforms,
  onPlatformsChange,
  deprecatedOnly = false,
  onDeprecatedChange,
}: PlatformFilterProps) {
  const togglePlatform = (platform: string) => {
    if (selectedPlatforms.includes(platform)) {
      onPlatformsChange(selectedPlatforms.filter((p) => p !== platform));
    } else {
      onPlatformsChange([...selectedPlatforms, platform]);
    }
  };

  const allSelected = selectedPlatforms.length === 0; // empty = all

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-fluent-sm text-fluent-text-secondary font-medium">Platform:</span>

      {/* All button */}
      <button
        onClick={() => onPlatformsChange([])}
        className={`platform-filter-btn ${pillClass(allSelected)}`}
      >
        All
      </button>

      {PLATFORMS.map((p) => {
        const isActive = selectedPlatforms.includes(p.value);
        const Icon = PLATFORM_ICONS[p.value];
        return (
          <button
            key={p.value}
            onClick={() => togglePlatform(p.value)}
            className={`platform-filter-btn ${pillClass(isActive)}`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {p.label}
          </button>
        );
      })}

      {onDeprecatedChange && (
        <>
          <div className="w-px h-4 bg-fluent-border self-center mx-1" />
          <button
            onClick={() => onDeprecatedChange(!deprecatedOnly)}
            className={`platform-filter-btn inline-flex items-center gap-1.5 px-3 py-1 rounded text-fluent-sm border transition-colors ${
              deprecatedOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Deprecated
          </button>
        </>
      )}
    </div>
  );
}
