/**
 * generate-summaries.ts
 *
 * Generates an AI summary for changelog entries in data/changelog.json using
 * the prompt in scripts/ai-summary-prompt.md (daily) or
 * scripts/ai-summary-monthly-prompt.md (monthly) — in each file, everything
 * after the first `---` is the system prompt. Summaries are stored separately
 * in data/changelog-summaries.json, keyed by date — generate-changelog.ts
 * rebuilds changelog.json from scratch, so summaries must not live inside it.
 *
 * API key: create `.env.local` in the project root (gitignored) with one of
 *   DEEPSEEK_API_KEY=sk-...        (model: deepseek-v4-flash)
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   OPENAI_API_KEY=sk-...
 * Preference order when several are set: Anthropic, DeepSeek, OpenAI.
 * Override the model with ANTHROPIC_MODEL / DEEPSEEK_MODEL / OPENAI_MODEL
 * if the defaults go stale.
 *
 * Usage:
 *   npx tsx scripts/generate-summaries.ts --date 2026-08-18
 *   npx tsx scripts/generate-summaries.ts --all        # every entry missing a summary
 *   npx tsx scripts/generate-summaries.ts --month 2026-08    # monthly recap, keyed "2026-08"
 *   npx tsx scripts/generate-summaries.ts --all-months # every month missing a summary
 *   npx tsx scripts/generate-summaries.ts --date 2026-08-18 --dry-run
 *   add --force to regenerate an existing summary
 *
 * Monthly summaries aggregate every changelog entry in the month into one
 * compacted diff and live in the same file, keyed YYYY-MM (date summaries are
 * keyed YYYY-MM-DD, so the two never collide). They are executive reports
 * (overview + per-OS sections), not bullet lists, so they get looser input
 * caps and a higher output token limit. Only completed months are eligible:
 * a month's summary is generated from the 1st of the next month, so the
 * current month is always skipped.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ChangelogEntry, ChangelogSummary } from '../src/lib/types';

type Summary = ChangelogSummary;

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CHANGELOG_FILE = path.join(DATA_DIR, 'changelog.json');
const SUMMARIES_FILE = path.join(DATA_DIR, 'changelog-summaries.json');
const PROMPT_FILE = path.resolve(__dirname, 'ai-summary-prompt.md');
const MONTHLY_PROMPT_FILE = path.resolve(__dirname, 'ai-summary-monthly-prompt.md');

interface CompactionCaps {
  text: number; // chars of old/new text kept per change
  perField: number; // changed-settings examples kept per field
  examples: number; // added/removed display names kept per group
}
const DAILY_CAPS: CompactionCaps = { text: 400, perField: 10, examples: 12 };
// Monthly reports need more raw material; the monthly token budget covers it.
const MONTHLY_CAPS: CompactionCaps = { text: 600, perField: 25, examples: 25 };

const DAILY_MAX_TOKENS = 4096;
const MONTHLY_MAX_TOKENS = 8192; // reports are longer than bullet lists by design

// ── Compaction (ported from the prototype; keep in sync with the prompt's Input section) ──

function unquote(v: string): string {
  try {
    const p = JSON.parse(v);
    return typeof p === 'string' ? p : JSON.stringify(p);
  } catch {
    return v;
  }
}

// ponytail: naive heuristic — common prefix/suffix length, not a real edit
// distance. Ceiling: can mis-rank moves of large blocks; upgrade path is a
// proper diff library if summaries ever cite the wrong "biggest" change.
function diffScore(oldS: string, newS: string): number {
  const minLen = Math.min(oldS.length, newS.length);
  let pre = 0;
  while (pre < minLen && oldS[pre] === newS[pre]) pre++;
  let suf = 0;
  while (suf < minLen - pre && oldS[oldS.length - 1 - suf] === newS[newS.length - 1 - suf]) suf++;
  return Math.max(oldS.length, newS.length) - pre - suf;
}

function compactEntry(entry: ChangelogEntry, caps: CompactionCaps): unknown {
  const out: Record<string, unknown> = { date: entry.date };

  for (const key of ['added', 'removed'] as const) {
    const groups = new Map<string, string[]>();
    for (const it of entry[key] ?? []) {
      const k = `${it.categoryName ?? 'Unknown category'}|${it.platform ?? '?'}`;
      groups.set(k, [...(groups.get(k) ?? []), it.displayName]);
    }
    out[key] = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, names]) => {
        const [category, platform] = k.split('|');
        return {
          category,
          platform,
          count: names.length,
          examples: names.slice(0, caps.examples),
          ...(names.length > caps.examples && { truncated: names.length - caps.examples }),
        };
      });
  }

  const byField = new Map<string, Array<{ score: number; category: string; platform: string; setting: string; old: string; new: string }>>();
  for (const c of entry.changed ?? []) {
    for (const f of c.fields) {
      const oldV = unquote(f.oldValue);
      const newV = unquote(f.newValue);
      const list = byField.get(f.field) ?? [];
      list.push({
        score: diffScore(oldV, newV),
        category: c.categoryName ?? 'Unknown category',
        platform: c.platform ?? '?',
        setting: c.displayName,
        old: oldV.slice(0, caps.text),
        new: newV.slice(0, caps.text),
      });
      byField.set(f.field, list);
    }
  }
  out.changed = [...byField.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([field, list]) => ({
      field,
      count: list.length,
      examples: list
        .sort((a, b) => b.score - a.score)
        .slice(0, caps.perField)
        .map(({ score: _score, ...rest }) => rest),
      ...(list.length > caps.perField && { truncated: list.length - caps.perField }),
    }));

  for (const key of ['categoriesAdded', 'categoriesRemoved'] as const) {
    const items = entry[key] ?? [];
    if (items.length > 0) {
      const names = items.map((i) => i.displayName);
      out[key] = {
        count: names.length,
        names: names.slice(0, 30),
        ...(names.length > 30 && { truncated: names.length - 30 }),
      };
    }
  }
  const cc = entry.categoriesChanged ?? [];
  if (cc.length > 0) {
    out.categoriesChanged = { count: cc.length, names: cc.map((c) => c.displayName).slice(0, 20) };
  }
  return out;
}

// ── API calls ──

function loadEnv() {
  try {
    process.loadEnvFile(path.resolve(__dirname, '..', '.env.local'));
  } catch {
    // no .env.local; rely on the process environment
  }
}

interface ProviderCfg {
  provider: 'anthropic' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl: string; // OpenAI-compatible base URL; unused for anthropic
  reasoningEffort?: 'low'; // DeepSeek only: thinking defaults to 'high' and can eat the whole token budget
}

function getProvider(): ProviderCfg | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', baseUrl: '', apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001' };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash', reasoningEffort: 'low' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' };
  }
  return null;
}

async function callModel(system: string, user: string, cfg: NonNullable<ReturnType<typeof getProvider>>, maxTokens: number): Promise<string> {
  const res =
    cfg.provider === 'anthropic'
      ? await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        })
      : await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: cfg.model,
            max_tokens: maxTokens, // generous: reasoning models burn tokens on thinking before answering
            response_format: { type: 'json_object' },
            ...(cfg.reasoningEffort && { reasoning_effort: cfg.reasoningEffort }),
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
  if (!res.ok) throw new Error(`${cfg.provider} API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  if (cfg.provider === 'anthropic') return body.content[0].text;

  const choice = body.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (!text) {
    throw new Error(
      `${cfg.model} returned empty content (finish_reason=${choice?.finish_reason ?? '?'}, ` +
        `reasoning_content=${choice?.message?.reasoning_content ? 'present' : 'none'})`,
    );
  }
  return text;
}

function extractJson(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`model returned no JSON object. Raw response:\n${raw.slice(0, 500)}`);
  return JSON.parse(match[0]);
}

function parseSummary(raw: string): Summary {
  const parsed = extractJson(raw);
  if (typeof parsed.headline !== 'string' || !Array.isArray(parsed.highlights)) {
    throw new Error('summary missing headline/highlights');
  }
  return { headline: parsed.headline, highlights: parsed.highlights as string[], watchOut: typeof parsed.watchOut === 'string' ? parsed.watchOut : null };
}

const MONTHLY_OSES = new Set(['windows', 'apple', 'android', 'linux']);

function parseMonthlySummary(raw: string): Summary {
  const parsed = extractJson(raw);
  const sections = (Array.isArray(parsed.sections) ? parsed.sections : []).filter(
    (s): s is { os: 'windows' | 'apple' | 'android' | 'linux'; body: string } =>
      typeof s?.os === 'string' && MONTHLY_OSES.has(s.os) && typeof s?.body === 'string',
  );
  if (typeof parsed.headline !== 'string' || typeof parsed.overview !== 'string' || sections.length === 0) {
    throw new Error('monthly summary missing headline/overview/sections');
  }
  return {
    headline: parsed.headline,
    highlights: [],
    overview: parsed.overview,
    sections,
    watchOut: typeof parsed.watchOut === 'string' ? parsed.watchOut : null,
  };
}

// ── Main ──

// Merge a month's daily entries into one pseudo-entry so compactEntry can
// aggregate it. A setting added and later changed in the same month appears
// in both lists; counts carry the scale and the model is told it's a month.
function mergeEntries(entries: ChangelogEntry[]): ChangelogEntry {
  const flat = <T>(pick: (e: ChangelogEntry) => T[] | undefined): T[] => entries.flatMap((e) => pick(e) ?? []);
  return {
    date: entries[0].date.slice(0, 7),
    added: flat((e) => e.added),
    removed: flat((e) => e.removed),
    changed: flat((e) => e.changed),
    categoriesAdded: flat((e) => e.categoriesAdded),
    categoriesRemoved: flat((e) => e.categoriesRemoved),
    categoriesChanged: flat((e) => e.categoriesChanged),
  };
}

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const date = args.find((a) => a.startsWith('--date='))?.split('=')[1] ?? (args.includes('--date') ? args[args.indexOf('--date') + 1] : undefined);
  const month = args.find((a) => a.startsWith('--month='))?.split('=')[1] ?? (args.includes('--month') ? args[args.indexOf('--month') + 1] : undefined);
  const all = args.includes('--all');
  const allMonths = args.includes('--all-months');
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const monthly = month != null || allMonths;
  if ((!date && !all && !monthly) || (monthly && (date || all)) || (month != null && allMonths)) {
    console.error('Usage: --date YYYY-MM-DD | --all | --month YYYY-MM | --all-months   [--dry-run] [--force]');
    process.exit(1);
  }
  if (month != null && !/^\d{4}-\d{2}$/.test(month)) {
    console.error(`--month expects YYYY-MM, got "${month}"`);
    process.exit(1);
  }

  const changelog: ChangelogEntry[] = JSON.parse(fs.readFileSync(CHANGELOG_FILE, 'utf-8'));
  const summaries: Record<string, Summary> = fs.existsSync(SUMMARIES_FILE)
    ? JSON.parse(fs.readFileSync(SUMMARIES_FILE, 'utf-8'))
    : {};

  let targets: Array<{ key: string; entries: ChangelogEntry[] }>;
  if (monthly) {
    // Only completed months get a summary; the current month is still accumulating.
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (month === currentMonth) {
      console.error(`${month} is still in progress; its summary can be generated from the 1st of next month.`);
      process.exit(1);
    }
    const byMonth = new Map<string, ChangelogEntry[]>();
    for (const e of changelog) {
      const k = e.date.slice(0, 7);
      if (month ? k !== month : k >= currentMonth) continue;
      byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
    }
    targets = [...byMonth.entries()].map(([key, entries]) => ({ key, entries }));
  } else {
    targets = changelog
      .filter((e) => (date ? e.date === date : true))
      .map((e) => ({ key: e.date, entries: [e] }));
  }
  if (!force) targets = targets.filter((t) => !summaries[t.key]);
  if (targets.length === 0) {
    console.log('Nothing to do (all matching entries already summarized). Use --force to regenerate.');
    return;
  }

  const promptMd = fs.readFileSync(monthly ? MONTHLY_PROMPT_FILE : PROMPT_FILE, 'utf-8');
  const system = promptMd.split(/\r?\n---\r?\n/)[1]?.trim();
  if (!system) throw new Error(`${monthly ? MONTHLY_PROMPT_FILE : PROMPT_FILE}: expected a '---' separator before the system prompt`);

  const cfg = getProvider();
  if (!cfg && !dryRun) {
    console.error(
      'No API key found. Create .env.local in the project root (already gitignored) with:\n' +
        '  DEEPSEEK_API_KEY=sk-...   (or ANTHROPIC_API_KEY / OPENAI_API_KEY)\n' +
        'For CI, add it as a GitHub Actions secret and pass it as an env var.',
    );
    process.exit(1);
  }

  for (const target of targets) {
    const compacted = JSON.stringify(
      monthly ? compactEntry(mergeEntries(target.entries), MONTHLY_CAPS) : compactEntry(target.entries[0], DAILY_CAPS),
      null,
      2,
    );
    const user = monthly
      ? `Here is the compacted diff for the whole month of ${target.key}, aggregated across ${target.entries.length} update day(s). Write the monthly roundup report (executive overview plus per-OS sections), not day-by-day bullets:\n\n${compacted}`
      : `Here is the compacted diff for ${target.key}:\n\n${compacted}`;
    if (dryRun) {
      console.log(`── ${target.key} (${cfg?.provider ?? 'no provider'}, ${cfg?.model ?? '-'}), ~${Math.ceil(user.length / 4)} tokens in ──`);
      console.log(user.slice(0, 1500));
      console.log(user.length > 1500 ? '…\n' : '\n');
      continue;
    }
    const raw = await callModel(system!, user, cfg!, monthly ? MONTHLY_MAX_TOKENS : DAILY_MAX_TOKENS);
    const summary = monthly ? parseMonthlySummary(raw) : parseSummary(raw);
    summaries[target.key] = summary;
    console.log(`${target.key}: ${summary.headline}`);
  }

  if (!dryRun) {
    const sorted = Object.fromEntries(Object.entries(summaries).sort((a, b) => b[0].localeCompare(a[0])));
    fs.writeFileSync(SUMMARIES_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`Summaries written: ${SUMMARIES_FILE}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
