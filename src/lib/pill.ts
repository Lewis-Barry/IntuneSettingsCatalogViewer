// Shared segmented-pill styling used by the platform filter and the baseline
// diff version picker, so they stay visually identical.
export function pillClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 px-3 py-1 rounded text-fluent-sm border transition-colors ${
    active
      ? 'bg-fluent-blue text-white dark:text-[#1c1c1e] border-fluent-blue'
      : 'bg-white dark:bg-[#2c2c2e] text-fluent-text border-fluent-border dark:border-[#636366] hover:bg-fluent-bg-alt'
  }`;
}
