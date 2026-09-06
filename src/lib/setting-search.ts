import { detectMatchSources, type MatchSource, type SettingDefinition } from './types';
import { getCspPath } from './settings-grouping';
import { getAsrRuleInfo } from './asr-rules';

const normalizedFields = new WeakMap<SettingDefinition, string[]>();

export function matchesCompatibilitySearch(setting: SettingDefinition, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  let fields = normalizedFields.get(setting);
  if (!fields) {
    fields = [setting.displayName, setting.name, setting.description, setting.helpText, getCspPath(setting), ...(setting.keywords || [])]
      .map((field) => field?.toLowerCase() || '');
    normalizedFields.set(setting, fields);
  }
  return terms.some((term) => fields.some((field) => field.includes(term)));
}

export function createMatchSourceMatcher(query?: string) {
  const matches = new WeakMap<SettingDefinition, MatchSource[]>();
  return (setting: SettingDefinition): MatchSource[] | undefined => {
    if (!query) return undefined;
    let sources = matches.get(setting);
    if (!sources) {
      const asr = getAsrRuleInfo(setting.id);
      sources = detectMatchSources(setting, query, asr ? [asr.guid] : undefined);
      matches.set(setting, sources);
    }
    return sources;
  };
}