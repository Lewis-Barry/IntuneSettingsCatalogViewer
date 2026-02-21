'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import type { SettingDefinition } from '@/lib/types';
import { getSettingScope, getScopeBadgeClass, getSettingTypeLabel } from '@/lib/types';
import SettingDetail from './SettingDetail';

interface SettingRowProps {
  setting: SettingDefinition;
  childSettings?: SettingDefinition[];
  highlightQuery?: string;
  /** All settings in context for resolving dependent children */
  allSettings?: SettingDefinition[];
  /** Sub-category label to disambiguate settings with duplicate display names */
  disambiguationLabel?: string;
}

/** Highlight matching substrings with a subtle background.
 *  Supports comma-separated exact phrases AND individual words from each term.
 *  Exact multi-word phrases are matched first (longer patterns take priority),
 *  then individual words are highlighted wherever they appear separately. */
function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) {
    return <>{text}</>;
  }

  // Split comma-separated terms, escape regex special chars
  const terms = query.split(',').map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) return <>{text}</>;

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Collect all patterns: exact phrases first, then individual words.
  // Use a Set to avoid duplicates (e.g. a single word term would appear twice).
  const patternSet = new Set<string>();

  // 1. Exact comma-separated phrases (may be multi-word)
  for (const term of terms) {
    patternSet.add(escapeRe(term));
  }

  // 2. Individual words from each term (split on whitespace)
  for (const term of terms) {
    const words = term.split(/\s+/).filter(w => w.length > 0);
    for (const word of words) {
      patternSet.add(escapeRe(word));
    }
  }

  // Sort patterns longest-first so multi-word phrases match before individual words
  const sorted = Array.from(patternSet).sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`(${sorted.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        // Reset lastIndex since we reuse the regex
        pattern.lastIndex = 0;
        return pattern.test(part) ? (
          <mark key={i} className="bg-yellow-100 text-inherit rounded-sm">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

/** Collect all dependedOnBy refs from both top-level setting and its options */
function getAllDependedOnBy(setting: SettingDefinition): Array<{ dependedOnBy: string; required: boolean }> {
  const deps: Array<{ dependedOnBy: string; required: boolean }> = [];
  // Top-level dependedOnBy
  if (setting.dependedOnBy) deps.push(...setting.dependedOnBy);
  // Option-level dependedOnBy (e.g. "Enabled" option on toggle settings)
  if (setting.options) {
    for (const opt of setting.options) {
      if (opt.dependedOnBy) deps.push(...opt.dependedOnBy);
    }
  }
  return deps;
}

export default memo(function SettingRow({ setting, childSettings = [], highlightQuery, allSettings, disambiguationLabel }: SettingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const scope = getSettingScope(setting.baseUri);
  const isGroup = setting['@odata.type']?.includes('SettingGroup');
  const isCollectionGroup =
    setting['@odata.type']?.includes('SettingGroupCollectionDefinition') &&
    setting.displayName !== 'Top Level Setting Group Collection' &&
    childSettings.length > 0;

  // Detect toggle + additional input pattern (check both top-level and option-level dependedOnBy)
  const allDeps = getAllDependedOnBy(setting);
  const isTogglePlusInput = setting.uxBehavior === 'toggle' && (allDeps.length > 0 || childSettings.length > 0);

  return (
    <div>
      {/* Main row */}
      <div
        className={`setting-row ${expanded ? 'setting-row-expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
        role="row"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {/* Expand/collapse chevron */}
        <button
          className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-fluent-text-secondary hover:text-fluent-text"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Setting name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-fluent-base truncate">
              <HighlightText text={setting.displayName || setting.name || ''} query={highlightQuery} />
            </span>
            {childSettings.length > 0 && (
              <span className="text-fluent-xs text-fluent-text-secondary flex-shrink-0" title={`${childSettings.length} child setting${childSettings.length === 1 ? '' : 's'}`}>
                ({childSettings.length})
              </span>
            )}
          </div>
          {/* Disambiguation label — shows source sub-category when multiple settings share the same name */}
          {disambiguationLabel && (
            <div className="text-fluent-xs text-fluent-text-tertiary truncate mt-0.5" title={disambiguationLabel}>
              {disambiguationLabel}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Scope badge */}
          {scope !== 'unknown' && (
            <span className={`scope-badge ${getScopeBadgeClass(scope)}`}>
              {scope === 'device' ? 'Device' : 'User'}
            </span>
          )}

          {/* Type badge */}
          {!isGroup && !isCollectionGroup && (
            <span className="scope-badge bg-gray-100 text-gray-600">
              {getSettingTypeLabel(setting['@odata.type'] || '')}
            </span>
          )}

          {/* Collection badge */}
          {isCollectionGroup && (
            <span className="scope-badge bg-purple-100 text-purple-700 border border-purple-200" title="Repeatable collection – items in this group can appear multiple times">
              <svg className="w-3 h-3 mr-0.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Collection
            </span>
          )}

          {/* Input indicator */}
          {isTogglePlusInput && (
            <span className="scope-badge bg-slate-100 text-slate-600 border border-slate-200" title="This toggle requires additional input when enabled">
              Input
            </span>
          )}

          {/* Info icon */}
          <Link
            href={`/setting/${encodeURIComponent(setting.id)}/`}
            className="info-icon"
            title="View setting details"
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
          >
            i
          </Link>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-b border-fluent-border bg-fluent-bg">
          <SettingDetail setting={setting} allSettings={allSettings} />

          {/* Child settings nested under this root */}
          {childSettings.length > 0 && (
            <div className={`ml-4 border-l-[3px] ${isCollectionGroup ? 'border-purple-300 bg-purple-50/30' : 'border-blue-300 bg-slate-50/40'}`}>
              <div className={`px-3 py-1.5 text-fluent-xs font-semibold border-b flex items-center gap-1.5 ${
                isCollectionGroup
                  ? 'text-purple-700 bg-purple-50 border-purple-100'
                  : 'text-blue-600 bg-blue-50 border-blue-100'
              }`}>
                {isCollectionGroup ? (
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 3l4 4-4 4" />
                  </svg>
                )}
                {isCollectionGroup
                  ? `Collection items – repeatable (${childSettings.length})`
                  : `Child settings (${childSettings.length})`
                }
              </div>
              {childSettings.map((child) => (
                <SettingRowInner
                  key={child.id}
                  setting={child}
                  highlightQuery={highlightQuery}
                  allSettings={allSettings}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
})

/** Inner (child) setting row — non-recursive, simpler layout */
function SettingRowInner({
  setting,
  highlightQuery,
  allSettings,
}: {
  setting: SettingDefinition;
  highlightQuery?: string;
  allSettings?: SettingDefinition[];
}) {
  const [expanded, setExpanded] = useState(false);
  const scope = getSettingScope(setting.baseUri);
  const isGroup = setting['@odata.type']?.includes('SettingGroup');

  return (
    <div>
      <div
        className={`setting-row-child ${expanded ? 'setting-row-child-expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
        role="row"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {/* Tree connector icon */}
        <span className="w-4 flex-shrink-0 text-blue-300 select-none text-fluent-sm font-light">↳</span>

        <button
          className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-blue-400 hover:text-blue-600"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-fluent-sm text-fluent-text truncate">
              <HighlightText text={setting.displayName || setting.name || ''} query={highlightQuery} />
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {scope !== 'unknown' && (
            <span className={`scope-badge ${getScopeBadgeClass(scope)}`}>
              {scope === 'device' ? 'Device' : 'User'}
            </span>
          )}
          {!isGroup && (
            <span className="scope-badge bg-blue-50 text-blue-600 border border-blue-100">
              {getSettingTypeLabel(setting['@odata.type'] || '')}
            </span>
          )}
          <Link
            href={`/setting/${encodeURIComponent(setting.id)}/`}
            className="info-icon"
            title="View setting details"
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
          >
            i
          </Link>
        </div>
      </div>

      {expanded && (
        <div className="border-b border-blue-100 bg-blue-50/50">
          <SettingDetail setting={setting} allSettings={allSettings} />
        </div>
      )}
    </div>
  );
}
