// Export the OIB browse view (a set of policies + their configured settings) as
// CSV or a self-contained styled HTML report. Mirrors the changelog exporters'
// formatting (same fmtValue + HTML styling) but has no before/after change
// columns — just the configured value per setting, plus per-policy scope/tier.

import type { OIBPolicy, FlatSetting } from './oib-types';
import { parsePolicy } from './oib-types';
import type { SettingDefinition } from './types';
import { fmtValue } from './oib-export-shared';
import { STYLE, escapeHtml, formatDefinitionId } from './oib-html-export';

/** A policy plus the (possibly search-filtered) settings to export from it. */
export interface BrowseExportEntry {
  policy: OIBPolicy;
  flats: FlatSetting[];
}

const FOLDER_LABELS: Record<string, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  WINDOWS365: 'Windows 365',
};
const folderLabel = (folder: string) => FOLDER_LABELS[folder] ?? folder;
const scopeWord = (scope: 'D' | 'U') => (scope === 'D' ? 'Device' : 'User');
const settingNameOf = (defId: string, defsMap: Map<string, SettingDefinition>) =>
  defsMap.get(defId)?.name ?? defId;

interface PreparedPolicy {
  label: string;
  version: string;
  scope: string;
  tier: string;
  githubUrl: string;
  rows: { name: string; definitionId: string; value: string }[];
}

interface Section {
  heading: string;
  policies: PreparedPolicy[];
}

/**
 * Group entries into sections by category. When the export spans more than one
 * platform, prefix the heading with the platform so same-named categories don't
 * collide (keeps a single heading level — see the "category only" export choice).
 */
function prepareSections(
  entries: BrowseExportEntry[],
  defsMap: Map<string, SettingDefinition>,
): Section[] {
  const multiPlatform = new Set(entries.map((e) => e.policy.oibFolder)).size > 1;
  const sections = new Map<string, PreparedPolicy[]>();

  for (const { policy, flats } of entries) {
    if (flats.length === 0) continue;
    const parsed = parsePolicy(policy);
    const heading = multiPlatform
      ? `${folderLabel(policy.oibFolder)} › ${parsed.category}`
      : parsed.category;

    const rows = flats
      .map((f) => ({
        name: settingNameOf(f.definitionId, defsMap),
        definitionId: f.definitionId,
        value: fmtValue(f.value, defsMap.get(f.definitionId)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const list = sections.get(heading) ?? [];
    list.push({
      label: parsed.policyLabel,
      version: parsed.version,
      scope: scopeWord(parsed.scope),
      tier: parsed.tier ?? '',
      githubUrl: policy.githubUrl,
      rows,
    });
    sections.set(heading, list);
  }

  return [...sections.entries()]
    .map(([heading, policies]) => ({
      heading,
      policies: policies.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.heading.localeCompare(b.heading));
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function generateOIBBrowseCsv(
  entries: BrowseExportEntry[],
  defsMap: Map<string, SettingDefinition>,
): string {
  const header = [
    'Platform',
    'Category',
    'Policy',
    'Scope',
    'Tier',
    'Setting',
    'Definition ID',
    'Value',
    'Source',
  ];
  const rows: string[][] = [];

  for (const { policy, flats } of entries) {
    if (flats.length === 0) continue;
    const parsed = parsePolicy(policy);
    const platform = folderLabel(policy.oibFolder);
    const sorted = flats
      .map((f) => ({
        name: settingNameOf(f.definitionId, defsMap),
        definitionId: f.definitionId,
        value: fmtValue(f.value, defsMap.get(f.definitionId)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const r of sorted) {
      rows.push([
        platform,
        parsed.category,
        parsed.policyLabel,
        scopeWord(parsed.scope),
        parsed.tier ?? '',
        r.name,
        r.definitionId,
        r.value,
        policy.githubUrl,
      ]);
    }
  }

  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
  // Leading BOM so Excel reads UTF-8 (e.g. "−" / non-ASCII names) correctly.
  return '﻿' + lines.join('\r\n');
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function policyMeta(p: PreparedPolicy): string {
  const bits = [p.version ? `v${escapeHtml(p.version)}` : '', escapeHtml(p.scope), escapeHtml(p.tier)]
    .filter(Boolean)
    .join(' · ');
  const source = p.githubUrl
    ? ` · <a class="anchor-style" href="${escapeHtml(p.githubUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`
    : '';
  return `<span class="meta">${bits}${source}</span>`;
}

function renderPolicy(p: PreparedPolicy): string {
  const rows = p.rows
    .map(
      (r) => `
<tr>
  <td>${escapeHtml(r.name)}<br /><span class="meta mono">${formatDefinitionId(r.definitionId)}</span></td>
  <td>${escapeHtml(r.value)}</td>
</tr>`,
    )
    .join('');

  return `
<div class="policy-block">
<h3 class="header-level3">${escapeHtml(p.label)} &nbsp;${policyMeta(p)}</h3>
<table class="table-settings">
  <colgroup><col style="width:auto" /><col style="width:40%" /></colgroup>
  <tr><th>Setting</th><th>Value</th></tr>
  ${rows}
</table>
</div>`;
}

export function generateOIBBrowseHtml(
  entries: BrowseExportEntry[],
  defsMap: Map<string, SettingDefinition>,
  title: string,
  generatedAt: Date = new Date(),
): string {
  const sections = prepareSections(entries, defsMap);
  const totalSettings = sections.reduce(
    (n, s) => n + s.policies.reduce((m, p) => m + p.rows.length, 0),
    0,
  );
  const totalPolicies = sections.reduce((n, s) => n + s.policies.length, 0);
  const timestamp = `${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`;

  const toc =
    sections.length > 1
      ? `<h2 class="header-level2">Table of Contents</h2>${sections
          .map((s, i) => `<a href="#section-${i + 1}" class="anchor-style">${escapeHtml(s.heading)}</a><br />`)
          .join('')}<br />`
      : '';

  const body = sections
    .map(
      (s, i) => `
<h2 id="section-${i + 1}" class="header-level2">${escapeHtml(s.heading)}</h2>
${s.policies.map(renderPolicy).join('')}`,
    )
    .join('');

  return `<!DOCTYPE html>
<HTML>
<HEAD>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${STYLE}
</HEAD>
<BODY>
<H1 class="header-level1">OpenIntuneBaseline</H1>
<div>${escapeHtml(title)}<br />Generated: ${escapeHtml(timestamp)}</div>
<div class="summary"><strong>${totalPolicies} policies</strong><strong>${totalSettings} settings</strong></div>
${toc}
${body || '<p>No settings to export.</p>'}
</BODY>
</HTML>`;
}
