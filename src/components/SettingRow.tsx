'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import type { SettingDefinition, MatchSource } from '@/lib/types';
import { getSettingScope, getScopeBadgeClass, getSettingTypeLabel } from '@/lib/types';
import { getAsrRuleInfo } from '@/lib/asr-rules';
import SettingDetail from './SettingDetail';
import HighlightText from './HighlightText';

interface SettingRowProps {
  setting: SettingDefinition;
  childSettings?: SettingDefinition[];
  highlightQuery?: string;
  /** Where the search query matched for this setting (empty when browsing) */
  matchSources?: MatchSource[];
  /** All settings in context for resolving dependent children */
  allSettings?: SettingDefinition[];
  /** Sub-category label to disambiguate settings with duplicate display names */
  disambiguationLabel?: string;
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

export default memo(function SettingRow({ setting, childSettings = [], highlightQuery, matchSources, allSettings, disambiguationLabel }: SettingRowProps) {
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

  // Match-source styling: when we have match info...
  const isSearchResult = matchSources !== undefined && matchSources.length > 0;
  const hasTitleMatch = matchSources?.includes('title') ?? false;
  // Left border: amber for contextual match (desc/csp/keywords only, no title match)
  const borderClass = isSearchResult && !hasTitleMatch
    ? 'border-l-[3px] border-l-amber-400'
    : '';
  // Mute title text when the title itself didn't match (contextual match)
  const titleTextClass = isSearchResult && !hasTitleMatch
    ? 'text-fluent-text-secondary'
    : '';

  return (
    <div>
      {/* Main row */}
      <div
        className={`setting-row ${expanded ? 'setting-row-expanded' : ''} ${borderClass}`}
        onClick={() => setExpanded(!expanded)}
        role="row"
        aria-expanded={expanded}
      >
        {/* Expand/collapse chevron */}
        <button
          type="button"
          className="setting-expand-btn w-5 h-5 flex items-center justify-center flex-shrink-0 text-fluent-text-secondary hover:text-fluent-text"
          aria-label={expanded ? 'Collapse setting' : 'Expand setting'}
          aria-expanded={expanded}
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
            <span className={`text-fluent-base md:truncate ${titleTextClass}`}>
              <HighlightText text={setting.displayName || setting.name || ''} query={highlightQuery} />
            </span>
            {childSettings.length > 0 && (
              <span className="text-fluent-xs text-fluent-text-secondary flex-shrink-0" title={`${childSettings.length} child setting${childSettings.length === 1 ? '' : 's'}`}>
                ({childSettings.length})
              </span>
            )}
          </div>
          {/* ASR rule name — shows the well-known rule name for Defender ASR rules */}
          {(() => {
            const asrInfo = getAsrRuleInfo(setting.id);
            return asrInfo ? (
              <div className="text-fluent-xs text-fluent-text-tertiary md:truncate mt-0.5" title={`ASR Rule: ${asrInfo.ruleName} (${asrInfo.guid})`}>
                {asrInfo.ruleName}
              </div>
            ) : null;
          })()}
          {/* Disambiguation label — shows source sub-category when multiple settings share the same name */}
          {disambiguationLabel && (
            <div className="text-fluent-xs text-fluent-text-tertiary md:truncate mt-0.5" title={disambiguationLabel}>
              {disambiguationLabel}
            </div>
          )}

          {/* Mobile-only inline badges (stacked below name) */}
          <div className="flex md:hidden items-center gap-1.5 mt-1 flex-wrap">
            {scope !== 'unknown' && (
              <span className={`scope-badge whitespace-nowrap ${getScopeBadgeClass(scope)}`}>
                {scope === 'device' ? 'Device' : 'User'}
              </span>
            )}
            {!isGroup && !isCollectionGroup && (
              <span className="scope-badge whitespace-nowrap bg-gray-100 text-gray-600">
                {getSettingTypeLabel(setting['@odata.type'] || '')}
              </span>
            )}
            {isCollectionGroup && (
              <span className="scope-badge whitespace-nowrap bg-purple-100 text-purple-700 border border-purple-200">
                Collection
              </span>
            )}
            {isTogglePlusInput && (
              <span className="scope-badge whitespace-nowrap bg-slate-100 text-slate-600 border border-slate-200">
                Input
              </span>
            )}
          </div>
        </div>

        {/* Badges — hidden on mobile, shown inline on desktop */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
          {/* Scope badge — fixed width to match column header */}
          <div className="w-[4.5rem] flex justify-center">
            {scope !== 'unknown' && (
              <span className={`scope-badge whitespace-nowrap ${getScopeBadgeClass(scope)}`}>
                {scope === 'device' ? 'Device' : 'User'}
              </span>
            )}
          </div>

          {/* Type badge — fixed width to match column header */}
          <div className="w-[6rem] flex justify-center">
            {!isGroup && !isCollectionGroup && (
              <span className="scope-badge whitespace-nowrap bg-gray-100 text-gray-600">
                {getSettingTypeLabel(setting['@odata.type'] || '')}
              </span>
            )}

            {/* Collection badge */}
            {isCollectionGroup && (
              <span className="scope-badge whitespace-nowrap bg-purple-100 text-purple-700 border border-purple-200" title="Repeatable collection \u2013 items in this group can appear multiple times">
                <svg className="w-3 h-3 mr-0.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Collection
              </span>
            )}
          </div>

          {/* Extra badges — fixed width slot */}
          <div className="w-[3.5rem] flex justify-center">
            {/* Input indicator */}
            {isTogglePlusInput && (
              <span className="scope-badge whitespace-nowrap bg-slate-100 text-slate-600 border border-slate-200" title="This toggle requires additional input when enabled">
                Input
              </span>
            )}
          </div>

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

        {/* Mobile info icon — always visible on mobile */}
        <Link
          href={`/setting/${encodeURIComponent(setting.id)}/`}
          className="md:hidden info-icon flex-shrink-0"
          title="View setting details"
          prefetch={false}
          onClick={(e) => e.stopPropagation()}
        >
          i
        </Link>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-b border-fluent-border bg-fluent-bg">
          <SettingDetail setting={setting} allSettings={allSettings} highlightQuery={highlightQuery} matchSources={matchSources} />

          {/* Child settings nested under this root */}
          {childSettings.length > 0 && (
            <div className={`ml-2 md:ml-4 border-l-[3px] ${isCollectionGroup ? 'border-purple-300 bg-purple-50/30' : 'border-blue-300 bg-slate-50/40'}`}>
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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
      >
        {/* Tree connector icon — hidden on mobile where the expand button is enough */}
        <span className="child-tree-connector hidden md:flex w-4 flex-shrink-0 text-blue-300 select-none text-fluent-sm font-light items-center justify-center">↳</span>

        <button
          type="button"
          className="child-expand-btn w-4 h-4 flex items-center justify-center flex-shrink-0 text-blue-400 hover:text-blue-600"
          aria-label={expanded ? 'Collapse setting' : 'Expand setting'}
          aria-expanded={expanded}
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
            <span className="text-fluent-sm text-fluent-text md:truncate">
              <HighlightText text={setting.displayName || setting.name || ''} query={highlightQuery} />
            </span>
          </div>
          {/* ASR rule name for child settings */}
          {(() => {
            const asrInfo = getAsrRuleInfo(setting.id);
            return asrInfo ? (
              <div className="text-fluent-xs text-fluent-text-tertiary md:truncate mt-0.5" title={`ASR Rule: ${asrInfo.ruleName} (${asrInfo.guid})`}>
                {asrInfo.ruleName}
              </div>
            ) : null;
          })()}

          {/* Mobile-only inline badges for child rows */}
          <div className="flex md:hidden items-center gap-1.5 mt-1 flex-wrap">
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
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
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

        {/* Mobile info icon */}
        <Link
          href={`/setting/${encodeURIComponent(setting.id)}/`}
          className="md:hidden info-icon flex-shrink-0"
          title="View setting details"
          prefetch={false}
          onClick={(e) => e.stopPropagation()}
        >
          i
        </Link>
      </div>

      {expanded && (
        <div className="border-b border-blue-100 bg-blue-50/50">
          <SettingDetail setting={setting} allSettings={allSettings} highlightQuery={highlightQuery} />
        </div>
      )}
    </div>
  );
}
