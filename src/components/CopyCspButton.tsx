'use client';

import { useEffect, useRef, useState } from 'react';

// Icons: Font Awesome Free 6.7.2 (solid/copy, solid/check) — CC BY 4.0
export default function CopyCspButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — leave icon unchanged
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'CSP path copied' : 'Copy CSP path'}
      title="Copy CSP path"
      className="inline-flex items-center justify-center p-0.5 rounded text-fluent-text-secondary hover:text-fluent-text hover:bg-fluent-bg-alt transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-fluent-success" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
          <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
          <path d="M208 0L332.1 0c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9L448 336c0 26.5-21.5 48-48 48l-192 0c-26.5 0-48-21.5-48-48l0-288c0-26.5 21.5-48 48-48zM48 128l80 0 0 64-64 0 0 256 192 0 0-32 64 0 0 48c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 176c0-26.5 21.5-48 48-48z" />
        </svg>
      )}
      <span aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
    </button>
  );
}
