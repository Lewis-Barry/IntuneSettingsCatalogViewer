// Shared output helpers for every tool: footer, filters, limits, links.
import { z } from 'zod';
import { REPO, REF, source } from './source.ts';
import { lastUpdated } from './data.ts';
import { settingSlug } from '../src/lib/slug.ts';
import type { SettingDefinition } from '../src/lib/types.ts';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const limitArg = z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max results (default ${DEFAULT_LIMIT})`);
export const readOnly = { readOnlyHint: true, openWorldHint: true };

/** Collapse whitespace (some names/descriptions are multi-line) and truncate. */
export const oneLine = (text = '', n = 140) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** Some catalog records have a null displayName — fall back to name / id. */
export const label = (s: Pick<SettingDefinition, 'displayName' | 'name' | 'id'> | undefined, fallback = '') =>
  oneLine(s?.displayName || s?.name || s?.id || fallback, 200);

/** Case-insensitive "contains" platform filter, shared by all tools. */
export function matchesPlatform(value: string | undefined, filter?: string): boolean {
  return !filter || (value ?? '').toLowerCase().includes(filter.toLowerCase());
}

export function capped<T>(items: T[], limit = DEFAULT_LIMIT) {
  const n = Math.min(Math.max(1, limit), MAX_LIMIT);
  return { shown: items.slice(0, n), more: Math.max(0, items.length - n) };
}
export const moreNote = (more: number) => (more ? `\n_…and ${more} more results — narrow the query or raise \`limit\`._` : '');

export const siteUrl = (id: string) => `https://intunesettings.app/setting/${settingSlug(id)}/`;

/** Human default: option display name for choice settings, raw value for simple ones. */
export function fmtDefault(s: SettingDefinition): string | undefined {
  if (s.defaultOptionId) return s.options?.find((o) => o.itemId === s.defaultOptionId)?.displayName ?? s.defaultOptionId;
  const dv = s.defaultValue as { value?: unknown } | null | undefined;
  if (dv && dv.value !== undefined && dv.value !== null && dv.value !== '') return String(dv.value);
  return undefined;
}

export async function reply(markdown: string) {
  let date = 'unknown';
  try { date = (await lastUpdated()).date.slice(0, 10); } catch { /* footer only */ }
  const stale = source.stalePaths.size ? ' · ⚠ stale data (GitHub unreachable, using earlier copy)' : '';
  return { content: [{ type: 'text' as const, text: `${markdown}\n\n---\n_Data as of ${date} · source ${REPO}@${REF}${stale}_` }] };
}

export const errorReply = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] });
