// CSV + HTML exports for the Microsoft Security Baselines pages (browse and
// changelog). Reuses the OIB exporters' plumbing: csvCell/kindWord from
// oib-export-shared and STYLE/escapeHtml/formatDefinitionId from
// oib-html-export, so all reports look identical.

import type { BaselineSetting, BaselineShard } from './baseline-types';
import type { BaselineDiff, BaselineSettingChange } from './baseline-diff';
import { csvCell, kindWord, kindSymbol } from './oib-export-shared';
import { STYLE, escapeHtml, formatDefinitionId } from './oib-html-export';

/** A baseline version plus the (possibly search-filtered) settings to export. */
export interface BaselineBrowseEntry {
  shard: BaselineShard;
  settings: BaselineSetting[];
}

/** Flatten a setting tree to rows carrying category + parent display path. */
interface FlatRow {
  category: string;
  parent: string;
  setting: BaselineSetting;
}

function flatten(settings: BaselineSetting[], parent = '', category = ''): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const s of settings) {
    const cat = s.category ?? category;
    rows.push({ category: cat, parent, setting: s });
    if (s.children) {
      rows.push(...flatten(s.children, parent ? `${parent} › ${s.displayName}` : s.displayName, cat));
    }
  }
  return rows;
}

/** Setting's default as display text, including nested children ("name: value"). */
export function valueText(s: BaselineSetting | undefined): string {
  if (!s) return '';
  if (!s.children?.length) return s.value ?? '';
  const lines = s.children.map((c) => {
    const v = valueText(c);
    return v ? `${c.displayName}: ${v}` : c.displayName;
  });
  return [s.value, ...lines].filter(Boolean).join('; ');
}

// ── Browse view ──────────────────────────────────────────────────────────────

export function generateBaselineBrowseCsv(entries: BaselineBrowseEntry[]): string {
  const header = ['Baseline', 'Version', 'Category', 'Parent', 'Setting', 'Definition ID', 'Default Value'];
  const rows: string[][] = [];
  for (const { shard, settings } of entries) {
    for (const { category, parent, setting } of flatten(settings)) {
      rows.push([
        shard.displayName,
        shard.displayVersion,
        category,
        parent,
        setting.displayName,
        setting.settingDefinitionId,
        setting.value ?? '',
      ]);
    }
  }
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
  // Leading BOM so Excel reads UTF-8 correctly.
  return '﻿' + lines.join('\r\n');
}

export function generateBaselineBrowseHtml(
  entries: BaselineBrowseEntry[],
  title: string,
  generatedAt: Date = new Date(),
): string {
  const sections = entries
    .filter((e) => e.settings.length > 0)
    .map((e) => ({ ...e, rows: flatten(e.settings) }));
  const totalSettings = sections.reduce((n, s) => n + s.rows.length, 0);
  const timestamp = `${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`;

  const toc =
    sections.length > 1
      ? `<h2 class="header-level2">Table of Contents</h2>${sections
          .map(
            (s, i) =>
              `<a href="#section-${i + 1}" class="anchor-style">${escapeHtml(`${s.shard.displayName} — ${s.shard.displayVersion}`)}</a><br />`,
          )
          .join('')}<br />`
      : '';

  const body = sections
    .map((s, i) => {
      const rows = s.rows
        .map(({ category, parent, setting }) => {
          const crumb = parent ? `<span class="meta">${escapeHtml(parent)} › </span>` : '';
          return `
<tr>
  <td>${escapeHtml(category)}</td>
  <td>${crumb}${escapeHtml(setting.displayName)}<br /><span class="meta mono">${formatDefinitionId(setting.settingDefinitionId)}</span></td>
  <td>${escapeHtml(setting.value ?? '')}</td>
</tr>`;
        })
        .join('');
      return `
<h2 id="section-${i + 1}" class="header-level2">${escapeHtml(`${s.shard.displayName} — ${s.shard.displayVersion}`)}</h2>
<table class="table-settings">
  <colgroup><col style="width:18%" /><col style="width:auto" /><col style="width:32%" /></colgroup>
  <tr><th>Category</th><th>Setting</th><th>Default value</th></tr>
  ${rows}
</table>`;
    })
    .join('');

  return `<!DOCTYPE html>
<HTML>
<HEAD>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${STYLE}
</HEAD>
<BODY>
<H1 class="header-level1">Microsoft Security Baselines</H1>
<div>${escapeHtml(title)}<br />Generated: ${escapeHtml(timestamp)}</div>
<div class="summary"><strong>${totalSettings} settings</strong></div>
${toc}
${body || '<p>No settings to export.</p>'}
</BODY>
</HTML>`;
}

// ── Changelog view ───────────────────────────────────────────────────────────

interface BaselineChangelogOptions {
  diff: BaselineDiff;
  familyName: string;
  baseVersionLabel: string;
  compareVersionLabel: string;
}

const changeName = (c: BaselineSettingChange) =>
  (c.compare ?? c.base)?.displayName ?? c.settingDefinitionId;

const changeCategory = (c: BaselineSettingChange) => c.category ?? '';

export function generateBaselineChangelogCsv({
  diff,
  familyName,
  baseVersionLabel,
  compareVersionLabel,
}: BaselineChangelogOptions): string {
  const header = [
    'Baseline',
    'Category',
    'Change',
    'Setting',
    'Definition ID',
    `Before (${baseVersionLabel})`,
    `After (${compareVersionLabel})`,
  ];
  const rows = diff.changes.map((c) => [
    familyName,
    changeCategory(c),
    kindWord(c.kind),
    changeName(c),
    c.settingDefinitionId,
    c.kind === 'added' ? '' : valueText(c.base),
    c.kind === 'removed' ? '' : valueText(c.compare),
  ]);
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n');
}

export function generateBaselineChangelogHtml(
  { diff, familyName, baseVersionLabel, compareVersionLabel }: BaselineChangelogOptions,
  generatedAt: Date = new Date(),
): string {
  const kindBadge = (kind: BaselineSettingChange['kind']) =>
    `<span class="kind-badge kind-${kind === 'changed' ? 'modified' : kind}">${kindSymbol(kind)} ${kindWord(kind)}</span>`;

  const rows = diff.changes
    .map((c) => {
      return `
<tr>
  <td>${escapeHtml(changeCategory(c))}</td>
  <td>${escapeHtml(changeName(c))}<br /><span class="meta mono">${formatDefinitionId(c.settingDefinitionId)}</span></td>
  <td>${kindBadge(c.kind)}</td>
  <td>${escapeHtml(c.kind === 'added' ? '' : valueText(c.base))}</td>
  <td>${escapeHtml(c.kind === 'removed' ? '' : valueText(c.compare))}</td>
</tr>`;
    })
    .join('');

  const timestamp = `${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`;

  return `<!DOCTYPE html>
<HTML>
<HEAD>
<meta charset="utf-8" />
<title>${escapeHtml(familyName)} - ${escapeHtml(baseVersionLabel)} to ${escapeHtml(compareVersionLabel)}</title>
${STYLE}
</HEAD>
<BODY>
<H1 class="header-level1">Microsoft Security Baseline Changelog</H1>
<div>Baseline: ${escapeHtml(familyName)}<br />Base version: ${escapeHtml(baseVersionLabel)}<br />Compare version: ${escapeHtml(compareVersionLabel)}<br />Generated: ${escapeHtml(timestamp)}</div>
<div class="summary">
  <strong>+${diff.counts.added} added</strong>
  <strong>−${diff.counts.removed} removed</strong>
  <strong>~${diff.counts.changed} changed</strong>
</div>
<table class="table-settings table-details">
  <colgroup>
    <col style="width:14%" />
    <col class="col-setting" />
    <col class="col-change" />
    <col class="col-before" />
    <col class="col-after" />
  </colgroup>
  <tr>
    <th>Category</th>
    <th>Setting</th>
    <th>Change</th>
    <th>Before (${escapeHtml(baseVersionLabel)})</th>
    <th>After (${escapeHtml(compareVersionLabel)})</th>
  </tr>
  ${rows || '<tr><td colspan="5">No differences between these versions.</td></tr>'}
</table>
</BODY>
</HTML>`;
}
