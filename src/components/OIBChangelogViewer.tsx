'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { pillClass } from '@/lib/pill';
import { PLATFORM_ICONS } from './PlatformIcons';
import SettingRow from './SettingRow';
import { diffVersions } from '@/lib/oib-diff';
import type { OIBValue } from '@/lib/oib-types';
import type {
  OIBVersionIndex,
  OIBVersionShard,
  PolicyDiff,
  SettingChange,
} from '@/lib/oib-changelog-types';
import type { SettingDefinition } from '@/lib/types';

const basePath =
  (typeof process !== 'undefined' &&
    (process.env as Record<string, string>).__NEXT_ROUTER_BASEPATH) ||
  '';

const selectClass =
  'bg-white dark:bg-[#2c2c2e] text-fluent-text border border-fluent-border dark:border-[#636366] rounded px-2 py-1 text-fluent-sm hover:bg-fluent-bg-alt focus:outline-none focus:ring-2 focus:ring-fluent-blue cursor-pointer';

// OIB folder → home-page platform-icon key.
const FOLDER_ICON: Record<string, string> = {
  WINDOWS: 'windows10',
  MACOS: 'macOS',
  WINDOWS365: 'windows10',
};

// Same chevron element as the home-page setting rows.
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Value formatting (resolve option ids → display names where possible) ──

function fmt(value: OIBValue | undefined, def?: SettingDefinition): string {
  if (!value) return '—';
  const optName = (id: string) =>
    def?.options?.find((o) => o.itemId === id)?.displayName ?? id;
  switch (value.type) {
    case 'choice':
      return optName(value.optionId);
    case 'choiceCollection':
      return value.optionIds.map(optName).join(', ') || '—';
    case 'simple':
      return value.value == null ? '—' : String(value.value);
    case 'simpleCollection':
      return value.values.map((v) => (v == null ? '' : String(v))).join(', ') || '—';
    default:
      return value.type;
  }
}

// ── Kind badge — colour + icon + text (never colour alone, WCAG 1.4.1) ──

const KIND: Record<
  PolicyDiff['kind'],
  { label: string; cls: string; sym: string }
> = {
  added: { label: 'Added', cls: 'text-fluent-success border-fluent-success/40 bg-fluent-success/10', sym: '+' },
  removed: { label: 'Removed', cls: 'text-fluent-error border-fluent-error/40 bg-fluent-error/10', sym: '−' },
  modified: { label: 'Modified', cls: 'text-fluent-warning border-fluent-warning/40 bg-fluent-warning/10', sym: '~' },
  renamed: { label: 'Renamed', cls: 'text-fluent-info border-fluent-info/40 bg-fluent-info/10', sym: '→' },
};

function KindBadge({ kind }: { kind: PolicyDiff['kind'] }) {
  const k = KIND[kind];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-fluent-xs font-semibold border ${k.cls}`}>
      <span aria-hidden className="font-mono">{k.sym}</span>
      {k.label}
    </span>
  );
}

const SETTING_KIND: Record<
  SettingChange['kind'],
  { pill: string; gutter: string; sym: string; label: string }
> = {
  added: { pill: 'text-fluent-success border-fluent-success/40 bg-fluent-success/10', gutter: 'border-l-fluent-success/60', sym: '+', label: 'Added' },
  removed: { pill: 'text-fluent-error border-fluent-error/40 bg-fluent-error/10', gutter: 'border-l-fluent-error/60', sym: '−', label: 'Removed' },
  changed: { pill: 'text-fluent-warning border-fluent-warning/40 bg-fluent-warning/10', gutter: 'border-l-fluent-warning/60', sym: '~', label: 'Changed' },
};

/** Map an OIB value to SettingRow's active-value props (highlights the selection). */
function activeFrom(value?: OIBValue): { activeOptionIds?: string[]; activeSimpleValue?: string } {
  if (!value) return {};
  switch (value.type) {
    case 'choice':
      return { activeOptionIds: [value.optionId] };
    case 'choiceCollection':
      return { activeOptionIds: value.optionIds };
    case 'simple':
      return { activeSimpleValue: value.value == null ? undefined : String(value.value) };
    case 'simpleCollection':
      return { activeSimpleValue: value.values.map((v) => (v == null ? '' : String(v))).join(', ') };
    default:
      return {};
  }
}

/** Change indicator for SettingRow's 10rem badge slot: pill on top, value below. */
function changeBadge(c: SettingChange, def?: SettingDefinition): React.ReactNode {
  const k = SETTING_KIND[c.kind];
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-fluent-xs font-semibold border ${k.pill}`}>
        <span aria-hidden className="font-mono">{k.sym}</span>
        {k.label}
      </span>
      <span className="text-fluent-xs text-fluent-text-secondary break-words leading-snug">
        {c.kind === 'changed' ? (
          <><span className="line-through">{fmt(c.baseValue, def)}</span> → <span className="text-fluent-text">{fmt(c.compareValue, def)}</span></>
        ) : c.kind === 'removed' ? (
          fmt(c.baseValue, def)
        ) : (
          fmt(c.compareValue, def)
        )}
      </span>
    </div>
  );
}

// ── Component ──

export default function OIBChangelogViewer() {
  const [index, setIndex] = useState<OIBVersionIndex | null>(null);
  const [defsMap, setDefsMap] = useState<Map<string, SettingDefinition>>(new Map());
  const [shards, setShards] = useState<Map<string, OIBVersionShard>>(new Map());
  const [folder, setFolder] = useState<string | null>(null);
  const [baseTag, setBaseTag] = useState<string | null>(null);
  const [compareTag, setCompareTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load index + setting definitions.
  useEffect(() => {
    fetch(`${basePath}/oib-versions/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`index.json: ${r.status}`);
        return r.json() as Promise<OIBVersionIndex>;
      })
      .then((idx) => {
        setIndex(idx);
        const first = idx.platforms[0];
        if (first) setFolder(first.folder);
      })
      .catch((e) => setError(String(e)));

    fetch(`${basePath}/settings-browse.json`)
      .then((r) => (r.ok ? (r.json() as Promise<SettingDefinition[]>) : []))
      .then((defs) => {
        const m = new Map<string, SettingDefinition>();
        for (const d of defs) m.set(d.id, d);
        setDefsMap(m);
      })
      .catch(() => {/* names degrade to ids */});
  }, []);

  const platform = useMemo(
    () => index?.platforms.find((p) => p.folder === folder) ?? null,
    [index, folder]
  );

  // Default the two versions when the platform changes: newest vs previous.
  useEffect(() => {
    if (!platform) return;
    const v = platform.versions; // newest first
    setCompareTag(v[0]?.tag ?? null);
    setBaseTag(v[1]?.tag ?? v[0]?.tag ?? null);
  }, [platform]);

  // Lazily fetch the two selected shards.
  const ensureShard = useCallback(
    (tag: string | null) => {
      if (!tag || shards.has(tag)) return;
      fetch(`${basePath}/oib-versions/${tag}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${tag}.json: ${r.status}`);
          return r.json() as Promise<OIBVersionShard>;
        })
        .then((s) => setShards((prev) => new Map(prev).set(tag, s)))
        .catch((e) => setError(String(e)));
    },
    [shards]
  );

  useEffect(() => {
    ensureShard(baseTag);
    ensureShard(compareTag);
  }, [baseTag, compareTag, ensureShard]);

  const baseShard = baseTag ? shards.get(baseTag) : undefined;
  const compareShard = compareTag ? shards.get(compareTag) : undefined;

  const diff = useMemo(() => {
    if (!baseShard || !compareShard || !baseTag || !compareTag) return null;
    return diffVersions(baseTag, baseShard.policies, compareTag, compareShard.policies);
  }, [baseShard, compareShard, baseTag, compareTag]);

  // Group result policies by category, ordered by significance.
  const grouped = useMemo(() => {
    if (!diff) return [];
    const order: Record<PolicyDiff['kind'], number> = { added: 0, modified: 1, renamed: 2, removed: 3 };
    const byCat = new Map<string, PolicyDiff[]>();
    for (const p of diff.policies) {
      const arr = byCat.get(p.category) ?? [];
      arr.push(p);
      byCat.set(p.category, arr);
    }
    return [...byCat.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, policies]) => ({
        category,
        policies: policies.sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label)),
      }));
  }, [diff]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const swap = () => {
    setBaseTag(compareTag);
    setCompareTag(baseTag);
  };

  if (error) {
    return <p className="text-fluent-error text-fluent-base p-4">Failed to load baseline data: {error}</p>;
  }
  if (!index) {
    return <p className="text-fluent-text-secondary text-fluent-base p-4">Loading…</p>;
  }

  const versionLabel = (tag: string | null) =>
    platform?.versions.find((v) => v.tag === tag)?.version ?? '';

  return (
    <div className="p-4 md:p-6">
      {/* ── Header (mirrors the home screen) ── */}
      <h1 className="text-fluent-2xl font-semibold text-fluent-text mb-1">OIB Changelog</h1>
      <p className="text-fluent-base text-fluent-text-secondary mb-5">
        Compare any two OpenIntuneBaseline versions — see which policies and settings changed.
      </p>

      {/* Controls — platform pills + version dropdowns, inline */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap mb-1">
        <span className="text-fluent-sm text-fluent-text-secondary font-medium">Platform:</span>
        {index.platforms.map((p) => {
          const Icon = PLATFORM_ICONS[FOLDER_ICON[p.folder]];
          return (
            <button key={p.folder} onClick={() => setFolder(p.folder)} className={pillClass(p.folder === folder)}>
              {Icon && <Icon className="w-4 h-4" />}
              {p.label}
              <span className="opacity-60 text-fluent-xs">({p.versions.length})</span>
            </button>
          );
        })}

        {platform && platform.versions.length >= 2 && (
          <>
            <span className="w-px h-5 bg-fluent-border self-center mx-1" aria-hidden />

            <label className="text-fluent-sm text-fluent-text-secondary font-medium">Base version:</label>
            <select value={baseTag ?? ''} onChange={(e) => setBaseTag(e.target.value)} className={selectClass}>
              {platform.versions.map((v) => (
                <option key={v.tag} value={v.tag} disabled={v.tag === compareTag}>v{v.version}</option>
              ))}
            </select>

            <label className="text-fluent-sm text-fluent-text-secondary font-medium">Compare with:</label>
            <select value={compareTag ?? ''} onChange={(e) => setCompareTag(e.target.value)} className={selectClass}>
              {platform.versions.map((v) => (
                <option key={v.tag} value={v.tag} disabled={v.tag === baseTag}>v{v.version}</option>
              ))}
            </select>

            <button
              onClick={swap}
              className="px-2 py-1 rounded text-fluent-sm border border-fluent-border dark:border-[#636366] text-fluent-text-secondary hover:bg-fluent-bg-alt transition-colors"
              title="Swap base and compare"
              aria-label="Swap base and compare versions"
            >
              ⇄
            </button>
          </>
        )}
      </div>

      {/* ── Results ── */}
      {platform && platform.versions.length < 2 ? (
        <p className="text-fluent-base text-fluent-text-secondary mt-6">
          Only one version of {platform.label} is published — nothing to compare yet.
        </p>
      ) : !diff ? (
        <p className="text-fluent-text-secondary text-fluent-base mt-6">Loading versions…</p>
      ) : (
        <div className="mt-6">
          {/* Summary band */}
          <div className="flex items-center gap-4 flex-wrap mb-5 text-fluent-sm">
            <span className="text-fluent-text-secondary">
              v{versionLabel(baseTag)} → v{versionLabel(compareTag)}:
            </span>
            <span className="text-fluent-success font-medium">+{diff.counts.added} added</span>
            <span className="text-fluent-error font-medium">−{diff.counts.removed} removed</span>
            <span className="text-fluent-warning font-medium">~{diff.counts.modified} modified</span>
            <span className="text-fluent-info font-medium">→{diff.counts.renamed} renamed</span>
          </div>

          {diff.policies.length === 0 ? (
            <p className="text-fluent-text-secondary text-fluent-base">No differences between these versions.</p>
          ) : (
            grouped.map(({ category, policies }) => (
              <section key={category} className="mb-6">
                <h2 className="text-fluent-lg font-semibold text-fluent-text mb-2">{category}</h2>
                <div>
                  {policies.map((p, idx) => {
                    const key = `${category}|${p.compareName ?? p.baseName}`;
                    const expandable = p.settingChanges.length > 0;
                    const isOpen = expanded.has(key);
                    return (
                      <div key={key} className={`border border-fluent-border ${idx > 0 ? 'mt-2' : ''} rounded`}>
                        <button
                          onClick={() => expandable && toggle(key)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${expandable ? 'hover:bg-fluent-bg-alt cursor-pointer' : 'cursor-default'}`}
                          aria-expanded={expandable ? isOpen : undefined}
                        >
                          {expandable ? (
                            <span className="w-4 flex items-center justify-center text-fluent-text-secondary shrink-0">
                              <Chevron open={isOpen} />
                            </span>
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <KindBadge kind={p.kind} />
                          <span className="flex-1 text-fluent-base text-fluent-text truncate">
                            {(p.compareName ?? p.baseName ?? '').replace(/\s*-\s*v[\d.]+$/i, '')}
                          </span>
                          {p.kind === 'renamed' && (
                            <span className="hidden md:inline text-fluent-xs text-fluent-text-secondary truncate max-w-[40%]">
                              {p.baseName} → {p.compareName}
                              {p.matchedBy === 'fuzzy' && p.similarity != null && (
                                <span className="ml-1 opacity-70">({Math.round(p.similarity * 100)}% match)</span>
                              )}
                            </span>
                          )}
                          {(p.kind === 'modified' || p.kind === 'renamed') && p.settingChanges.length > 0 && (
                            <span className="text-fluent-xs text-fluent-text-secondary shrink-0 tabular-nums">
                              +{p.addedCount} −{p.removedCount} ~{p.changedCount}
                            </span>
                          )}
                          {(p.kind === 'added' || p.kind === 'removed') && p.settingChanges.length > 0 && (
                            <span className="text-fluent-xs text-fluent-text-secondary shrink-0 tabular-nums">
                              {p.settingChanges.length} setting{p.settingChanges.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </button>

                        {isOpen && expandable && (
                          <div className="border-t border-fluent-border/30 [&_.setting-row]:border-fluent-border/30">
                            {p.settingChanges.length === 0 ? (
                              <p className="text-fluent-sm text-fluent-text-secondary px-4 py-3">
                                Renamed; settings unchanged.
                              </p>
                            ) : (
                              p.settingChanges.map((c) => {
                                const def = defsMap.get(c.definitionId);
                                const src = c.kind === 'removed' ? c.baseValue : c.compareValue;
                                if (!def) {
                                  return (
                                    <div key={c.definitionId + c.kind} className={`flex items-center gap-3 px-4 py-2.5 border-b border-fluent-border/50 border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
                                      <span className="flex-1 font-mono text-[12px] text-fluent-text-secondary truncate">{c.definitionId}</span>
                                      {changeBadge(c, def)}
                                    </div>
                                  );
                                }
                                const { activeOptionIds, activeSimpleValue } = activeFrom(src);
                                const srcVersion = c.kind === 'removed' ? versionLabel(baseTag) : versionLabel(compareTag);
                                return (
                                  <div key={c.definitionId + c.kind} className={`border-l-2 ${SETTING_KIND[c.kind].gutter}`}>
                                    <SettingRow
                                      setting={def}
                                      valueBadge={changeBadge(c, def)}
                                      activeOptionIds={activeOptionIds}
                                      activeSimpleValue={activeSimpleValue}
                                      activeLabel={`OIB ${srcVersion}`}
                                      hideScope
                                    />
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
