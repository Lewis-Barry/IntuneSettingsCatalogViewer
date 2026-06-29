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

// ── collection instances: rules matched per-instance, name-only change ──
{
  // A firewall-style groupCollection with two rules. In compare, rule "A" only
  // changes its name → matched by similarity, reported as one changed setting.
  // Rule "B" changes a real setting. A third rule "C" is added.
  const root = 'fw_{firewallrulename}';
  const rule = (name: string, action: string, dir: string) => ({
    definitionId: root,
    value: {
      type: 'groupCollection' as const,
      groups: [[
        { definitionId: `${root}_name`, value: { type: 'simple' as const, value: name } },
        { definitionId: `${root}_action`, value: { type: 'simple' as const, value: action } },
        { definitionId: `${root}_dir`, value: { type: 'simple' as const, value: dir } },
      ]],
    },
  });
  const mk = (v: string, rules: ReturnType<typeof rule>[]): OIBPolicy => ({
    name: N('Firewall', 'Security Rules', v), platform: 'windows10', technologies: 'mdm',
    oibFolder: 'WINDOWS', githubUrl: '',
    // Merge all rule instances into one groupCollection setting.
    settings: [{ definitionId: root, value: { type: 'groupCollection', groups: rules.flatMap((r: any) => r.value.groups) } }],
  });

  const base = [mk('3.7', [rule('Block calc', 'block', 'out'), rule('Allow ping', 'allow', 'in')])];
  const compare = [mk('3.8', [
    rule('Block calc.exe', 'block', 'out'),   // name-only change
    rule('Allow ping', 'block', 'in'),        // action changed
    rule('New rule', 'allow', 'out'),         // added
  ])];
  const d = diffVersions('v3.7', base, 'v3.8', compare);
  const mod = d.policies.find((p) => p.kind === 'modified')!;
  assert.ok(mod, 'firewall policy modified');

  const byInstance = new Map<string, typeof mod.settingChanges>();
  for (const c of mod.settingChanges) {
    const k = c.instanceId ?? '(none)';
    byInstance.set(k, [...(byInstance.get(k) ?? []), c]);
  }
  // Name-only rule: matched, exactly one changed setting (the name), nothing else.
  const renamed = byInstance.get('Block calc.exe')!;
  assert.equal(renamed.length, 1, 'name-only change → single setting change');
  assert.equal(renamed[0].kind, 'changed');
  assert.ok(renamed[0].definitionId.endsWith('_name'), 'the changed setting is the name');
  // Action-changed rule: matched by name, one changed setting.
  const actioned = byInstance.get('Allow ping')!;
  assert.equal(actioned.length, 1, 'action change → single setting change');
  assert.ok(actioned[0].definitionId.endsWith('_action'));
  // Added rule: all three settings as added.
  const added = byInstance.get('New rule')!;
  assert.equal(added.length, 3, 'added rule → all its settings');
  assert.ok(added.every((c) => c.kind === 'added'));
}

console.log('✓ oib-diff self-check passed');
