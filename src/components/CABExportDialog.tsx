'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { OIBOutput, OIBPolicy } from '@/lib/oib-types';
import { parsePolicy, flattenOIBSettings } from '@/lib/oib-types';
import type { SettingDefinition } from '@/lib/types';
import { generateAndDownloadCAB, defaultCABFilename } from '@/lib/cab-export';

const FOLDER_LABELS: Record<string, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  WINDOWS365: 'Windows 365',
};
const FOLDER_ORDER = ['WINDOWS', 'MACOS', 'WINDOWS365'];

interface Props {
  oibData: OIBOutput;
  defsMap: Map<string, SettingDefinition>;
  /** Pre-select this folder filter (null = all) */
  initialFolder: string | null;
  onClose: () => void;
}

export default function CABExportDialog({ oibData, defsMap, initialFolder, onClose }: Props) {
  // ── Available platforms derived from data ──
  const availableFolders = useMemo(
    () => FOLDER_ORDER.filter((f) => oibData.policies.some((p) => p.oibFolder === f)),
    [oibData],
  );

  // ── Platform selection ──
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(() => {
    if (initialFolder && availableFolders.includes(initialFolder)) {
      return new Set([initialFolder]);
    }
    return new Set(availableFolders);
  });

  // ── Categories derived from selected platforms ──
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of oibData.policies) {
      if (selectedFolders.has(p.oibFolder)) {
        cats.add(parsePolicy(p).category);
      }
    }
    return Array.from(cats).sort();
  }, [oibData, selectedFolders]);

  // ── Category selection ──
  const [allCategories, setAllCategories] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(availableCategories),
  );

  // Sync selectedCategories when available set changes
  useEffect(() => {
    if (allCategories) {
      setSelectedCategories(new Set(availableCategories));
    } else {
      // Remove categories no longer available
      setSelectedCategories((prev) => {
        const next = new Set(Array.from(prev).filter((c) => availableCategories.includes(c)));
        return next;
      });
    }
  }, [availableCategories, allCategories]);

  // ── Filename ──
  const [filename, setFilename] = useState(defaultCABFilename);

  // ── Generating state ──
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filtered policies (live count) ──
  const filteredPolicies = useMemo<OIBPolicy[]>(() => {
    return oibData.policies.filter((p) => {
      if (!selectedFolders.has(p.oibFolder)) return false;
      if (!allCategories && !selectedCategories.has(parsePolicy(p).category)) return false;
      return true;
    });
  }, [oibData, selectedFolders, allCategories, selectedCategories]);

  const filteredSettingCount = useMemo(
    () => filteredPolicies.reduce((n, p) => n + flattenOIBSettings(p.settings).length, 0),
    [filteredPolicies],
  );

  // ── Handlers ──
  const toggleFolder = useCallback((folder: string) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setAllCategories(false);
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const toggleAllCategories = useCallback(
    (checked: boolean) => {
      setAllCategories(checked);
      if (checked) {
        setSelectedCategories(new Set(availableCategories));
      } else {
        setSelectedCategories(new Set());
      }
    },
    [availableCategories],
  );

  const handleGenerate = useCallback(async () => {
    if (filteredPolicies.length === 0) return;
    setError(null);
    setGenerating(true);
    try {
      await generateAndDownloadCAB({
        policies: filteredPolicies,
        defsMap,
        oibData,
        selectedFolders: Array.from(selectedFolders),
        filename: filename.endsWith('.docx') ? filename : `${filename}.docx`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [filteredPolicies, defsMap, oibData, selectedFolders, filename, onClose]);

  const noPoliciesSelected = filteredPolicies.length === 0;
  const noFoldersSelected = selectedFolders.size === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Dialog */}
        <div
          className="relative bg-white dark:bg-[#1c1c1e] rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Generate CAB document"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-fluent-border">
            <div>
              <h2 className="text-fluent-lg font-semibold text-fluent-text">Generate CAB document</h2>
              <p className="text-fluent-sm text-fluent-text-secondary mt-0.5">
                Exports a Word (.docx) file for Change Advisory Board submission
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-fluent-bg-alt text-fluent-text-secondary hover:text-fluent-text transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body (scrollable) */}
          <div className="flex-1 overflow-y-auto fluent-scroll px-5 py-4 space-y-5">

            {/* Platforms */}
            <section>
              <h3 className="text-fluent-sm font-semibold text-fluent-text-secondary uppercase tracking-wide mb-2">
                Platforms
              </h3>
              <div className="flex flex-wrap gap-2">
                {availableFolders.map((folder) => (
                  <label
                    key={folder}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFolders.has(folder)}
                      onChange={() => toggleFolder(folder)}
                      className="rounded border-fluent-border-strong accent-fluent-blue"
                    />
                    <span className="text-fluent-base text-fluent-text">
                      {FOLDER_LABELS[folder] ?? folder}
                    </span>
                  </label>
                ))}
              </div>
              {noFoldersSelected && (
                <p className="text-fluent-sm text-red-500 mt-1.5">
                  Select at least one platform.
                </p>
              )}
            </section>

            {/* Categories */}
            <section>
              <h3 className="text-fluent-sm font-semibold text-fluent-text-secondary uppercase tracking-wide mb-2">
                Categories
              </h3>

              {availableCategories.length === 0 ? (
                <p className="text-fluent-sm text-fluent-text-secondary">
                  No categories available for the selected platform(s).
                </p>
              ) : (
                <>
                  {/* All categories toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                    <input
                      type="checkbox"
                      checked={allCategories}
                      onChange={(e) => toggleAllCategories(e.target.checked)}
                      className="rounded border-fluent-border-strong accent-fluent-blue"
                    />
                    <span className="text-fluent-base font-medium text-fluent-text">
                      All categories
                    </span>
                  </label>

                  {/* Individual categories */}
                  <div className="max-h-44 overflow-y-auto fluent-scroll pl-2 space-y-1.5 border-l-2 border-fluent-border ml-1">
                    {availableCategories.map((cat) => (
                      <label
                        key={cat}
                        className="flex items-center gap-2 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={allCategories || selectedCategories.has(cat)}
                          onChange={() => toggleCategory(cat)}
                          className="rounded border-fluent-border-strong accent-fluent-blue"
                        />
                        <span className="text-fluent-base text-fluent-text">{cat}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Filename */}
            <section>
              <h3 className="text-fluent-sm font-semibold text-fluent-text-secondary uppercase tracking-wide mb-2">
                Filename
              </h3>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full px-3 py-2 text-fluent-base bg-white dark:bg-[#2c2c2e] border border-fluent-border-strong rounded
                           focus:outline-none focus:border-fluent-blue focus:ring-1 focus:ring-fluent-blue
                           font-mono text-sm"
                spellCheck={false}
              />
            </section>

            {/* Error */}
            {error && (
              <p className="text-fluent-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-fluent-border">
            {/* Live count */}
            <span className="text-fluent-sm text-fluent-text-secondary">
              {noPoliciesSelected ? (
                <span className="text-red-500">No policies selected</span>
              ) : (
                <>
                  <span className="font-semibold text-fluent-text">{filteredPolicies.length}</span>{' '}
                  {filteredPolicies.length === 1 ? 'policy' : 'policies'} ·{' '}
                  <span className="font-semibold text-fluent-text">
                    {filteredSettingCount.toLocaleString()}
                  </span>{' '}
                  settings
                </>
              )}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={generating}
                className="px-4 py-2 text-fluent-sm font-medium rounded border border-fluent-border
                           bg-white dark:bg-[#2c2c2e] text-fluent-text hover:bg-fluent-bg-alt
                           transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating || noPoliciesSelected || noFoldersSelected || !filename.trim()}
                className="px-4 py-2 text-fluent-sm font-medium rounded
                           bg-fluent-blue text-white dark:text-[#1c1c1e]
                           hover:bg-fluent-blue-hover active:bg-fluent-blue-pressed
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center gap-2"
              >
                {generating && (
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
