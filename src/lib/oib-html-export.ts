import type { PolicyDiff, SettingChange, VersionDiff } from './oib-changelog-types';
import type { SettingDefinition } from './types';
import {
  fmtValue,
  settingName,
  kindWord,
  kindSymbol,
  policyDisplayName,
  type GroupedPolicyDiff,
} from './oib-export-shared';

interface GenerateOIBChangelogHtmlOptions {
  diff: VersionDiff;
  grouped: GroupedPolicyDiff[];
  defsMap: Map<string, SettingDefinition>;
  platformLabel: string;
  baseVersionLabel: string;
  compareVersionLabel: string;
  generatedAt?: Date;
}

export const STYLE = `<style type="text/css">
html, body {
  margin: 0;
  padding: 8px;
  position: relative;
  color: #1f1f1f;
  background: #ffffff;
  font-family: Arial, sans-serif;
  font-size: 11px;
  line-height: 1.45;
}

.header-level1 {
  font-size: 18px;
  margin: 0 0 6px;
}

.header-level2 {
  font-size: 16px;
  margin: 18px 0 6px;
}

.header-level3 {
  font-size: 14px;
  margin: 14px 0 6px;
}

.summary {
  margin: 8px 0 16px;
}

.summary strong {
  margin-right: 10px;
}

.anchor-style {
  color: #0f6cbd;
  text-decoration: none;
}

.anchor-style:hover {
  text-decoration: underline;
}

.table-settings {
  border: 1px solid #999999;
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
  margin-bottom: 14px;
  font-family: Arial, sans-serif;
  font-size: 11px;
}

/* Each policy and its settings read as one block. */
.policy-block {
  margin-bottom: 24px;
}
.policy-block .header-level3 {
  margin-bottom: 4px;
}
/* Summary table butts directly against the details table below it. */
.policy-block .table-summary {
  margin-bottom: 0;
}

.table-summary col.col-status {
  width: 15%;
}

.table-summary col.col-policy {
  width: 55%;
}

.table-summary col.col-summary {
  width: 30%;
}

.table-details col.col-setting {
  width: auto;
}

.table-details col.col-change {
  width: 84px;
}

.table-details col.col-before,
.table-details col.col-after {
  width: 220px;
}

.table-settings tr:nth-child(even) {
  background-color: #fafafa;
}

.table-settings th {
  background-color: #d0d0d0;
  text-align: left;
  font-size: 12px;
  font-weight: bold;
  padding: 5px;
  border: none;
}

.table-settings td {
  text-align: left;
  padding: 5px;
  border: none;
  border-bottom: 1px solid #dddddd;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.table-details th:nth-child(2),
.table-details td:nth-child(2) {
  white-space: nowrap;
}

.category-level1 {
  background-color: #e0e0e0 !important;
  font-size: 11px;
  font-weight: bold;
}

.kind-badge {
  display: inline-block;
  border: 1px solid #999999;
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10px;
  font-weight: bold;
  white-space: nowrap;
}

.kind-added {
  background: #e8f5e9;
  color: #1b5e20;
  border-color: #81c784;
}

.kind-removed {
  background: #fdecea;
  color: #8a1c1c;
  border-color: #e57373;
}

.kind-modified {
  background: #fff7e0;
  color: #8a5a00;
  border-color: #e0b84f;
}

.kind-renamed {
  background: #e8f1fb;
  color: #0f548c;
  border-color: #7fb3e8;
}

.mono {
  font-family: Consolas, 'Courier New', monospace;
}

.meta {
  color: #555555;
}

.meta.mono {
  overflow-wrap: break-word;
  word-break: normal;
}
</style>`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDefinitionId(value: string): string {
  return escapeHtml(value).replace(/([_./\\-])/g, '$1<wbr />');
}

function kindBadge(kind: PolicyDiff['kind'] | SettingChange['kind']): string {
  const cls = `kind-badge kind-${kind === 'changed' ? 'modified' : kind}`;
  return `<span class="${cls}">${kindSymbol(kind)} ${kindWord(kind)}</span>`;
}

function tableOfContents(grouped: GroupedPolicyDiff[]): string {
  const links = grouped
    .map(({ category }, index) => `<a href="#section-${index + 1}" class="anchor-style">${escapeHtml(category)}</a><br />`)
    .join('');

  if (!links) return '';

  return `<h2 class="header-level2">Table of Contents</h2>${links}<br />`;
}

function renderPolicySummaryRow(policy: PolicyDiff): string {
  const countSummary =
    policy.kind === 'modified' || policy.kind === 'renamed'
      ? `+${policy.addedCount} −${policy.removedCount} ~${policy.changedCount}`
      : `${policy.settingChanges.length} setting${policy.settingChanges.length === 1 ? '' : 's'}`;

  const matchNote =
    policy.matchedBy === 'fuzzy' && policy.similarity != null
      ? ` <span class="meta">(${Math.round(policy.similarity * 100)}% fuzzy match)</span>`
      : '';

  const renamedNote =
    policy.kind === 'renamed' && policy.baseName && policy.compareName
      ? `<br /><span class="meta">${escapeHtml(policy.baseName)} → ${escapeHtml(policy.compareName)}</span>`
      : '';

  const sourceLink = policy.githubUrl
    ? ` <a class="anchor-style" href="${escapeHtml(policy.githubUrl)}" target="_blank" rel="noopener noreferrer">(Source)</a>`
    : '';

  return `
<tr>
  <td>${kindBadge(policy.kind)}</td>
  <td>
    <strong>${escapeHtml(policyDisplayName(policy))}</strong>${sourceLink}${renamedNote}${matchNote}
  </td>
  <td>${escapeHtml(countSummary)}</td>
</tr>`;
}

function renderPolicyDetailsTable(
  policy: PolicyDiff,
  defsMap: Map<string, SettingDefinition>,
  baseVersionLabel: string,
  compareVersionLabel: string
): string {
  if (policy.settingChanges.length === 0) {
    return '<p class="meta">No setting-level changes.</p>';
  }

  const rows = policy.settingChanges
    .slice()
    .sort((left, right) => settingName(left, defsMap).localeCompare(settingName(right, defsMap)))
    .map((change) => {
      const def = defsMap.get(change.definitionId);
      const before = change.kind === 'added' ? '' : fmtValue(change.baseValue, def);
      const after = change.kind === 'removed' ? '' : fmtValue(change.compareValue, def);
      return `
<tr>
  <td>${escapeHtml(settingName(change, defsMap))}<br /><span class="meta mono">${formatDefinitionId(change.definitionId)}</span></td>
  <td>${kindBadge(change.kind)}</td>
  <td>${escapeHtml(before)}</td>
  <td>${escapeHtml(after)}</td>
</tr>`;
    })
    .join('');

  return `
<table class="table-settings table-details">
  <colgroup>
    <col class="col-setting" />
    <col class="col-change" />
    <col class="col-before" />
    <col class="col-after" />
  </colgroup>
  <tr>
    <th>Setting</th>
    <th>Change</th>
    <th>Before (v${escapeHtml(baseVersionLabel)})</th>
    <th>After (v${escapeHtml(compareVersionLabel)})</th>
  </tr>
  ${rows}
</table>`;
}

export function generateOIBChangelogHtml({
  diff,
  grouped,
  defsMap,
  platformLabel,
  baseVersionLabel,
  compareVersionLabel,
  generatedAt = new Date(),
}: GenerateOIBChangelogHtmlOptions): string {
  const timestamp = `${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`;

  const sections = grouped
    .map(({ category, policies }, index) => {
      const policyBlocks = policies
        .map((policy) => {
          return `
<div class="policy-block">
<h3 class="header-level3">${escapeHtml(policy.label)}</h3>
<table class="table-settings table-summary">
  <colgroup>
    <col class="col-status" />
    <col class="col-policy" />
    <col class="col-summary" />
  </colgroup>
  <tr>
    <th>Status</th>
    <th>Policy</th>
    <th>Summary</th>
  </tr>
  ${renderPolicySummaryRow(policy)}
</table>
${renderPolicyDetailsTable(policy, defsMap, baseVersionLabel, compareVersionLabel)}
</div>`;
        })
        .join('');

      return `
<h2 id="section-${index + 1}" class="header-level2">${escapeHtml(category)}</h2>
${policyBlocks}`;
    })
    .join('');

  return `<!DOCTYPE html>
<HTML>
<HEAD>
<meta charset="utf-8" />
<title>OIB Changelog - ${escapeHtml(platformLabel)} - v${escapeHtml(baseVersionLabel)} to v${escapeHtml(compareVersionLabel)}</title>
${STYLE}
</HEAD>
<BODY>
<H1 class="header-level1">OpenIntuneBaseline Changelog</H1>
<div>Platform: ${escapeHtml(platformLabel)}<br />Base version: v${escapeHtml(baseVersionLabel)}<br />Compare version: v${escapeHtml(compareVersionLabel)}<br />Generated: ${escapeHtml(timestamp)}</div>
<div class="summary">
  <strong>+${diff.counts.added} added</strong>
  <strong>−${diff.counts.removed} removed</strong>
  <strong>~${diff.counts.modified} modified</strong>
  <strong>→${diff.counts.renamed} renamed</strong>
</div>
${tableOfContents(grouped)}
${sections || '<p>No differences between these versions.</p>'}
</BODY>
</HTML>`;
}
