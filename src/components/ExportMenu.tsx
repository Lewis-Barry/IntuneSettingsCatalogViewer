'use client';

// Shared atoms that keep the OIB and MS-baseline browse/changelog screens
// visually identical: the Export dropdown + download helper, the row chevron,
// and the change-kind colour language (icons + class maps).

export type ChangeKind = 'added' | 'removed' | 'modified' | 'renamed' | 'changed';
export type ExportFormat = 'csv' | 'html';

/** Trigger a browser download of generated CSV/HTML content. */
export function downloadTextFile(filename: string, content: string, format: ExportFormat) {
  const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'text/html;charset=utf-8';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Export click-dropdown (native <details>) used by all browse/changelog screens. */
export default function ExportMenu({
  onExport,
  disabled,
  ariaLabel = 'Export the current view',
  className = 'relative',
}: {
  onExport: (format: ExportFormat) => void;
  disabled: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <details className={className}>
      <summary
        className="fluent-btn-secondary text-fluent-sm cursor-pointer list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden"
        aria-label={ariaLabel}
      >
        Export
        <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="absolute right-0 mt-1 z-50 min-w-[8rem] bg-fluent-bg border border-fluent-border rounded-md shadow-lg py-1">
        {(['csv', 'html'] as const).map((fmt) => (
          <button
            key={fmt}
            onClick={(e) => {
              onExport(fmt);
              e.currentTarget.closest('details')?.removeAttribute('open');
            }}
            disabled={disabled}
            className="block w-full text-left px-3 py-2 text-fluent-sm text-fluent-text hover:bg-fluent-bg-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>
    </details>
  );
}

/** Same chevron element as the home-page setting rows. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Kind metadata — icon + text + colour (never colour alone, WCAG 1.4.1) ──

export function KindIcon({ kind, className = 'w-4 h-4' }: { kind: ChangeKind; className?: string }) {
  const common = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;
  switch (kind) {
    case 'added':
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'removed':
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      );
    case 'renamed':
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    default: // modified / changed — pencil
      return (
        <svg {...common} className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
  }
}

export const KIND: Record<
  ChangeKind,
  { label: string; text: string; tint: string; gutter: string; iconBg: string }
> = {
  added: {
    label: 'Added',
    text: 'text-fluent-success',
    tint: 'border-fluent-success/40 bg-fluent-success/10',
    gutter: 'border-l-fluent-success',
    iconBg: 'bg-fluent-success/15 text-fluent-success',
  },
  removed: {
    label: 'Removed',
    text: 'text-fluent-error',
    tint: 'border-fluent-error/40 bg-fluent-error/10',
    gutter: 'border-l-fluent-error',
    iconBg: 'bg-fluent-error/15 text-fluent-error',
  },
  modified: {
    label: 'Modified',
    text: 'text-fluent-warning',
    tint: 'border-fluent-warning/40 bg-fluent-warning/10',
    gutter: 'border-l-fluent-warning',
    iconBg: 'bg-fluent-warning/15 text-fluent-warning',
  },
  renamed: {
    label: 'Renamed',
    text: 'text-fluent-info',
    tint: 'border-fluent-info/40 bg-fluent-info/10',
    gutter: 'border-l-fluent-info',
    iconBg: 'bg-fluent-info/15 text-fluent-info',
  },
  changed: {
    label: 'Modified',
    text: 'text-fluent-warning',
    tint: 'border-fluent-warning/40 bg-fluent-warning/10',
    gutter: 'border-l-fluent-warning',
    iconBg: 'bg-fluent-warning/15 text-fluent-warning',
  },
};

/** Per-setting change pill/gutter styling (added/removed/changed rows). */
export const SETTING_KIND: Record<
  'added' | 'removed' | 'changed',
  { pill: string; gutter: string; sym: string; label: string }
> = {
  added: { pill: 'text-fluent-success border-fluent-success/40 bg-fluent-success/10', gutter: 'border-l-fluent-success/60', sym: '+', label: 'Added' },
  removed: { pill: 'text-fluent-error border-fluent-error/40 bg-fluent-error/10', gutter: 'border-l-fluent-error/60', sym: '−', label: 'Removed' },
  changed: { pill: 'text-fluent-warning border-fluent-warning/40 bg-fluent-warning/10', gutter: 'border-l-fluent-warning/60', sym: '~', label: 'Modified' },
};
