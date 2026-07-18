// CSV + HTML export for the /ent-exclusive page ("I ♥ Windows Pro") — exports
// the settings currently visible on screen (category + search filters applied).
// Reuses the OIB changelog's STYLE/escapeHtml/csvCell so both reports look alike.

import type { SettingDefinition } from './types';
import { getSettingScope, getSettingTypeLabel } from './types';
import { csvCell } from './oib-export-shared';
import { STYLE, escapeHtml, formatDefinitionId } from './oib-html-export';

interface ProExclusiveExportOptions {
  settings: SettingDefinition[];
  /** categoryId → display name */
  categoryMap: Record<string, string>;
  /** Heading shown in the HTML report (e.g. the current filter context). */
  categoryLabel: string;
  generatedAt?: Date;
}

function cspPath(s: SettingDefinition): string {
  if (s.baseUri && s.offsetUri) return `${s.baseUri}/${s.offsetUri}`;
  return s.baseUri || s.offsetUri || '';
}

function categoryName(s: SettingDefinition, categoryMap: Record<string, string>): string {
  return categoryMap[s.categoryId] ?? '';
}

/** Group by category display name (alphabetical), settings by display name. */
function groupByCategory(
  settings: SettingDefinition[],
  categoryMap: Record<string, string>,
): { category: string; settings: SettingDefinition[] }[] {
  const byCat = new Map<string, SettingDefinition[]>();
  for (const s of settings) {
    const cat = categoryName(s, categoryMap);
    const arr = byCat.get(cat) ?? [];
    arr.push(s);
    byCat.set(cat, arr);
  }
  return [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      settings: list.sort((a, b) =>
        (a.displayName || a.name).localeCompare(b.displayName || b.name),
      ),
    }));
}

export function generateProExclusiveCsv({
  settings,
  categoryMap,
}: ProExclusiveExportOptions): string {
  const header = ['Category', 'Setting', 'Type', 'Scope', 'CSP Path', 'Description', 'Definition ID', 'MS Learn'];
  const rows = groupByCategory(settings, categoryMap).flatMap(({ category, settings: list }) =>
    list.map((s) => [
      category,
      s.displayName || s.name,
      getSettingTypeLabel(s['@odata.type']),
      getSettingScope(s.baseUri),
      cspPath(s),
      s.description || '',
      s.id,
      (s.infoUrls ?? []).join('; '),
    ]),
  );
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
  // Leading BOM so Excel reads UTF-8 correctly.
  return '﻿' + lines.join('\r\n');
}

export function generateProExclusiveHtml({
  settings,
  categoryMap,
  categoryLabel,
  generatedAt = new Date(),
}: ProExclusiveExportOptions): string {
  const timestamp = `${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`;
  const grouped = groupByCategory(settings, categoryMap);

  const toc = grouped
    .map(({ category }, i) => `<a href="#section-${i + 1}" class="anchor-style">${escapeHtml(category)}</a><br />`)
    .join('');

  const sections = grouped
    .map(({ category, settings: list }, i) => {
      const rows = list
        .map((s) => {
          const scope = getSettingScope(s.baseUri);
          const learnLinks = (s.infoUrls ?? [])
            .map(
              (url) =>
                `<a class="anchor-style" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">MS Learn</a>`,
            )
            .join('<br />');
          return `
<tr>
  <td>${escapeHtml(s.displayName || s.name)}<br /><span class="meta mono">${formatDefinitionId(s.id)}</span></td>
  <td>${escapeHtml(getSettingTypeLabel(s['@odata.type']))}</td>
  <td>${escapeHtml(scope === 'unknown' ? '' : scope)}</td>
  <td class="mono">${escapeHtml(cspPath(s))}</td>
  <td>${escapeHtml(s.description || '')}</td>
  <td>${learnLinks}</td>
</tr>`;
        })
        .join('');

      return `
<h2 id="section-${i + 1}" class="header-level2">${escapeHtml(category)} (${list.length})</h2>
<table class="table-settings">
  <colgroup>
    <col style="width: 25%" />
    <col style="width: 8%" />
    <col style="width: 6%" />
    <col style="width: 26%" />
    <col />
    <col style="width: 8%" />
  </colgroup>
  <tr>
    <th>Setting</th>
    <th>Type</th>
    <th>Scope</th>
    <th>CSP Path</th>
    <th>Description</th>
    <th>Links</th>
  </tr>
  ${rows}
</table>`;
    })
    .join('');

  return `<!DOCTYPE html>
<HTML>
<HEAD>
<meta charset="utf-8" />
<title>Enterprise-only Settings - ${escapeHtml(categoryLabel)}</title>
${STYLE}
</HEAD>
<BODY>
<H1 class="header-level1">Enterprise-only Settings (not in Windows Pro)</H1>
<div>Scope: ${escapeHtml(categoryLabel)}<br />Settings: ${settings.length}<br />Generated: ${escapeHtml(timestamp)}</div>
<div class="summary">${toc}</div>
${sections || '<p>No settings.</p>'}
</BODY>
</HTML>`;
}
