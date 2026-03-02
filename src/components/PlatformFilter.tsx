'use client';

import { PLATFORM_ICONS } from './PlatformIcons';

interface PlatformFilterProps {
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
}

const PLATFORMS = [
  { value: 'windows10', label: 'Windows' },
  { value: 'macOS', label: 'macOS' },
  { value: 'iOS', label: 'iOS/iPadOS' },
  { value: 'android', label: 'Android' },
  { value: 'linux', label: 'Linux' },
];

export default function PlatformFilter({
  selectedPlatforms,
  onPlatformsChange,
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
        className={`platform-filter-btn inline-flex items-center gap-1.5 px-3 py-1 rounded text-fluent-sm border transition-colors ${
          allSelected
            ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
            : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
        }`}
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
            className={`platform-filter-btn inline-flex items-center gap-1.5 px-3 py-1 rounded text-fluent-sm border transition-colors ${
              isActive
                ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
                : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
