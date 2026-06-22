// Shared plain-text helpers for the OIB changelog exporters (HTML + CSV), so
// both render setting names, values, and change labels identically.

import type { PolicyDiff, SettingChange } from './oib-changelog-types';
import type { OIBValue } from './oib-types';
import type { SettingDefinition } from './types';

export interface GroupedPolicyDiff {
  category: string;
  policies: PolicyDiff[];
}

/** Strip OIB's trailing per-policy "- vX.Y" revision stamp from a policy name. */
export function policyDisplayName(policy: PolicyDiff): string {
  return (policy.compareName ?? policy.baseName ?? '').replace(/\s*-\s*v[\d.]+$/i, '');
}

/** Human-readable value for a setting, resolving option ids to display names. */
export function fmtValue(value: OIBValue | undefined, def?: SettingDefinition): string {
  if (!value) return '';
  const optName = (id: string) =>
    def?.options?.find((option) => option.itemId === id)?.displayName ?? id;

  switch (value.type) {
    case 'choice':
      return optName(value.optionId);
    case 'choiceCollection':
      return value.optionIds.map(optName).join(', ');
    case 'simple':
      return value.value == null ? '' : String(value.value);
    case 'simpleCollection':
      return value.values.map((entry) => (entry == null ? '' : String(entry))).join(', ');
    case 'group':
      return 'Group';
    case 'groupCollection':
      return 'Group collection';
    default:
      return value.type;
  }
}

export function settingName(change: SettingChange, defsMap: Map<string, SettingDefinition>): string {
  return defsMap.get(change.definitionId)?.name ?? change.definitionId;
}

/** Plain word for a change kind ("Added", "Modified", …). */
export function kindWord(kind: PolicyDiff['kind'] | SettingChange['kind']): string {
  switch (kind) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'renamed':
      return 'Renamed';
    case 'changed':
      return 'Changed';
    default:
      return 'Modified';
  }
}

export function kindSymbol(kind: PolicyDiff['kind'] | SettingChange['kind']): string {
  switch (kind) {
    case 'added':
      return '+';
    case 'removed':
      return '−';
    case 'renamed':
      return '→';
    default:
      return '~';
  }
}
