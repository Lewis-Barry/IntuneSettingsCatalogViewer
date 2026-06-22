// CSV export for the OIB changelog — same content as the HTML report, flattened
// to one row per setting change (one summary row for policies with none).

import type { SettingDefinition } from './types';
import {
  fmtValue,
  settingName,
  kindWord,
  policyDisplayName,
  type GroupedPolicyDiff,
} from './oib-export-shared';

interface GenerateOIBChangelogCsvOptions {
  grouped: GroupedPolicyDiff[];
  defsMap: Map<string, SettingDefinition>;
  baseVersionLabel: string;
  compareVersionLabel: string;
}

/** Quote a field if it contains comma, quote, or newline; escape inner quotes. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function generateOIBChangelogCsv({
  grouped,
  defsMap,
  baseVersionLabel,
  compareVersionLabel,
}: GenerateOIBChangelogCsvOptions): string {
  const header = [
    'Category',
    'Policy',
    'Policy Change',
    'Setting',
    'Definition ID',
    'Setting Change',
    `Before (v${baseVersionLabel})`,
    `After (v${compareVersionLabel})`,
    'Source',
  ];

  const rows: string[][] = [];

  for (const { category, policies } of grouped) {
    for (const policy of policies) {
      const policyName = policyDisplayName(policy);
      const policyChange = kindWord(policy.kind);
      const source = policy.githubUrl ?? '';

      if (policy.settingChanges.length === 0) {
        rows.push([category, policyName, policyChange, '', '', '', '', '', source]);
        continue;
      }

      const sorted = policy.settingChanges
        .slice()
        .sort((a, b) => settingName(a, defsMap).localeCompare(settingName(b, defsMap)));

      for (const change of sorted) {
        const def = defsMap.get(change.definitionId);
        const before = change.kind === 'added' ? '' : fmtValue(change.baseValue, def);
        const after = change.kind === 'removed' ? '' : fmtValue(change.compareValue, def);
        rows.push([
          category,
          policyName,
          policyChange,
          settingName(change, defsMap),
          change.definitionId,
          kindWord(change.kind),
          before,
          after,
          source,
        ]);
      }
    }
  }

  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
  // Leading BOM so Excel reads UTF-8 (e.g. the "−" in values) correctly.
  return '﻿' + lines.join('\r\n');
}
