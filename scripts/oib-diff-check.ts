/**
 * Self-check for src/lib/oib-diff.ts — run: npx tsx scripts/oib-diff-check.ts
 * No test framework; throws on first failed assertion.
 */
import assert from 'assert';
import { diffVersions } from '../src/lib/oib-diff';
import type { OIBPolicy } from '../src/lib/oib-types';

function pol(name: string, settings: Record<string, string>, oibId?: string): OIBPolicy {
  return {
    name,
    platform: 'windows10',
    technologies: 'mdm',
    oibFolder: 'WINDOWS',
    githubUrl: '',
    ...(oibId ? { oibId } : {}),
    settings: Object.entries(settings).map(([definitionId, optionId]) => ({
      definitionId,
      value: { type: 'choice', optionId },
    })),
  };
}

const N = (cat: string, label: string, v: string) => `Win - OIB - ES - ${cat} - D - ${label} - v${v}`;

// ── added / removed / modified via title match (no oibId) ──
{
  const base = [pol(N('Defender', 'Antivirus', '3.5'), { a: 'a_on', b: 'b_on' })];
  const compare = [
    pol(N('Defender', 'Antivirus', '3.6'), { a: 'a_off', c: 'c_on' }), // a changed, b removed, c added
    pol(N('Firewall', 'Profile', '3.6'), { x: 'x_on' }), // added policy
  ];
  const d = diffVersions('v3.5', base, 'v3.6', compare);
  assert.equal(d.counts.added, 1, 'one added policy');
  assert.equal(d.counts.modified, 1, 'one modified policy');
  const mod = d.policies.find((p) => p.kind === 'modified')!;
  assert.equal(mod.matchedBy, 'title', 'matched by version-stripped title');
  assert.equal(mod.changedCount, 1, 'a changed');
  assert.equal(mod.addedCount, 1, 'c added');
  assert.equal(mod.removedCount, 1, 'b removed');
}

// ── removed policy ──
{
  const base = [pol(N('Legacy', 'Thing', '3.2'), { a: 'a_on' })];
  const d = diffVersions('v3.2', base, 'v3.3', []);
  assert.equal(d.counts.removed, 1, 'one removed policy');
}

// ── oibId beats title (rename detected, settings identical) ──
{
  const base = [pol(N('Defender', 'Old Name', '3.6'), { a: 'a_on' }, 'GUID-1')];
  const compare = [pol(N('Defender', 'New Name', '3.7'), { a: 'a_on' }, 'GUID-1')];
  const d = diffVersions('v3.6', base, 'v3.7', compare);
  assert.equal(d.counts.renamed, 1, 'rename detected via oibId');
  assert.equal(d.policies[0].matchedBy, 'oibId');
}

// ── fuzzy: title changed, no oibId, but settings mostly overlap ──
{
  // 4/5 ids shared → Jaccard 4/6 ≈ 0.67 ≥ 0.6, and "asr" token shared.
  const base = [pol(N('ASR', 'Rules Audit', '3.3'), { a: '1', b: '1', c: '1', d: '1', e: '1' })];
  const compare = [pol(N('ASR', 'Rules Block', '3.4'), { a: '1', b: '1', c: '1', d: '1', f: '1' })];
  const d = diffVersions('v3.3', base, 'v3.4', compare);
  assert.equal(d.counts.renamed, 1, 'fuzzy rename detected');
  assert.equal(d.policies[0].matchedBy, 'fuzzy');
  assert.ok((d.policies[0].similarity ?? 0) >= 0.6, 'similarity above threshold');
}

// ── fuzzy rejects when settings too different (becomes add + remove) ──
{
  const base = [pol(N('ASR', 'Rules Audit', '3.3'), { a: '1', b: '1', c: '1' })];
  const compare = [pol(N('ASR', 'Totally Different', '3.4'), { x: '1', y: '1', z: '1' })];
  const d = diffVersions('v3.3', base, 'v3.4', compare);
  assert.equal(d.counts.renamed, 0, 'no fuzzy match below threshold');
  assert.equal(d.counts.added, 1);
  assert.equal(d.counts.removed, 1);
}

// ── unchanged policy is omitted ──
{
  const base = [pol(N('Stable', 'Policy', '3.5'), { a: 'a_on' })];
  const compare = [pol(N('Stable', 'Policy', '3.5'), { a: 'a_on' })];
  const d = diffVersions('v3.5', base, 'v3.6', compare);
  assert.equal(d.policies.length, 0, 'unchanged policies omitted');
}

console.log('✓ oib-diff self-check passed');
