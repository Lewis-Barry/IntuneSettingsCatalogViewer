// CSV + HTML export for the /changelog page — exports the changes currently
// visible on screen (date range + type/platform/category/search filters applied).
// Reuses the OIB exporters' csvCell/STYLE/escapeHtml so all reports look alike.

import { csvCell } from './oib-export-shared';
import { STYLE, escapeHtml } from './oib-html-export';

/** Minimal shape the changelog viewer's feed items already satisfy. */
export interface ChangelogExportItem {
  date: string; // ISO date
  action: 'added' | 'removed' | 'changed';
  entity: 'setting' | 'category';
  title: string;
  categoryName?: string;
  platform?: string;
  fields?: Array<{ field: string; oldValue: string; newValue: string }>;
}

interface ChangelogExportOptions {
  items: ChangelogExportItem[];
  /** Heading shown in the report (e.g. "All updates" or a date range). */
  scopeLabel: string;
  generatedAt?: Date;
}

/** Strip surrounding JSON quotes so values read cleanly (same as the viewer). */
function cleanValue(s: string): string {
  return s.replace(/^"|"$/g, '');
}

const ACTION_LABELS = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

/** One row per item; changed items with field diffs expand to one row per field. */
function toRows(items: ChangelogExportItem[]): string[][] {
  return items.flatMap((item) => {
    const base = [
      item.date,
      ACTION_LABELS[item.action],
      item.entity === 'setting' ? 'Setting' : 'Category',
      item.title,
      item.categoryName ?? '',
      item.platform ?? '',
    ];
    if (item.action === 'changed' && item.fields && item.fields.length > 0) {
      return item.fields.map((f) => [...base, f.field, cleanValue(f.oldValue), cleanValue(f.newValue)]);
    }
    return [[...base, '', '', '']];
  });
}

export function generateChangelogCsv({ items }: ChangelogExportOptions): string {
  const header = ['Date', 'Change', 'Entity', 'Name', 'Category', 'Platform', 'Field', 'Previous value', 'New value'];
  const lines = [header, ...toRows(items)].map((cells) => cells.map(csvCell).join(','));
  // Leading BOM so Excel reads UTF-8 correctly.
  return '﻿' + lines.join('\r\n');
}

export function generateChangelogHtml({
  items,
  scopeLabel,
  generatedAt = new Date(),
}: ChangelogExportOptions): string {
  const timestamp = `${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`;

  // Group by date, newest first.
  const byDate = new Map<string, ChangelogExportItem[]>();
  for (const item of items) {
    const arr = byDate.get(item.date) ?? [];
    arr.push(item);
    byDate.set(item.date, arr);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  const toc = dates
    .map((date) => `<a href="#date-${date}" class="anchor-style">${escapeHtml(date)}</a> (${byDate.get(date)!.length})<br />`)
    .join('');

  const sections = dates
    .map((date) => {
      const rows = toRows(byDate.get(date)!)
        .map(([, change, entity, name, category, platform, field, oldValue, newValue]) => {
          const kindCls = change === 'Added' ? 'kind-added' : change === 'Removed' ? 'kind-removed' : 'kind-modified';
          return `
<tr>
  <td><span class="kind-badge ${kindCls}">${change}</span></td>
  <td>${entity}</td>
  <td>${escapeHtml(name)}</td>
  <td>${escapeHtml(category)}</td>
  <td>${escapeHtml(platform)}</td>
  <td>${escapeHtml(field)}</td>
  <td class="mono">${escapeHtml(oldValue)}</td>
  <td class="mono">${escapeHtml(newValue)}</td>
</tr>`;
        })
        .join('');

      return `
<h2 id="date-${date}" class="header-level2">${escapeHtml(date)} (${byDate.get(date)!.length})</h2>
<table class="table-settings">
  <colgroup>
    <col style="width: 7%" />
    <col style="width: 6%" />
    <col style="width: 20%" />
    <col style="width: 12%" />
    <col style="width: 10%" />
    <col style="width: 12%" />
    <col />
    <col />
  </colgroup>
  <tr>
    <th>Change</th>
    <th>Entity</th>
    <th>Name</th>
    <th>Category</th>
    <th>Platform</th>
    <th>Field</th>
    <th>Previous value</th>
    <th>New value</th>
  </tr>
  ${rows}
</table>`;
    })
    .join('');

  return `<!DOCTYPE html>
<HTML>
<HEAD>
<meta charset="utf-8" />
<title>Settings Catalog Changelog - ${escapeHtml(scopeLabel)}</title>
${STYLE}
</HEAD>
<BODY>
<H1 class="header-level1">Settings Catalog Changelog</H1>
<div>Scope: ${escapeHtml(scopeLabel)}<br />Changes: ${items.length}<br />Generated: ${escapeHtml(timestamp)}</div>
<div class="summary">${toc}</div>
${sections || '<p>No changes.</p>'}
</BODY>
</HTML>`;
}
