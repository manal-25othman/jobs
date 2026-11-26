/**
 * Candidate packs for the three junior-frontend activities, run against SYNTHETIC submissions
 * (data/candidates/trk_frontend_junior_v2/r2/<activity>/<case>/). Each case carries `expected.candidate.json`
 * — a CANDIDATE expectation, not approved by an expert — and this suite checks the pack still produces it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEFAULT_R2_LIMITS, assertTestRunResult, type SubmittedFile, type TestRunResult } from '@naqla/domain';
import { probeBackend } from '../sandbox.js';
import { runAttempt } from '../run.js';
import type { TestPack } from '../pack.js';
import { PACKS } from './index.js';

const ROOT = join(__dirname, '..', '..', '..', '..');
const CAND = join(ROOT, 'data', 'candidates', 'trk_frontend_junior_v2');
const ACTIVITIES = ['act_fe_debug_improve', 'act_fe_change_request', 'act_fe_integrated_leave_requests'] as const;
const CASES = ['reference_like', 'starter_unchanged', 'partial', 'wrong_fix', 'edge_data', 'gaming'] as const;
const LABEL = 'CANDIDATE — not approved by an expert';

const probe = probeBackend();
const skip = probe.available ? false : `development backend unavailable here: ${probe.reasons.join('; ')}`;

interface Expected {
  readonly _label: string;
  readonly tests: Readonly<Record<string, 'pass' | 'fail'>>;
  readonly criteria: Readonly<Record<string, 'met' | 'unmet' | 'human'>>;
  readonly gamingSignalsAtLeast: readonly string[];
}

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const loadCode = (dir: string): SubmittedFile[] => walk(dir)
  .filter((p) => /\.(html|css|js|json)$/.test(p) && !p.endsWith('expected.candidate.json'))
  .map((p) => ({ path: relative(dir, p), content: readFileSync(p, 'utf8') }))
  .sort((a, b) => (a.path < b.path ? -1 : 1));
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

const rubrics = readJson<{ records: { activity: string; criteria: { key: string }[] }[] }>(join(CAND, 'tracks', 'trk_frontend_junior', 'rubrics.json'));
const criteriaOf = (activity: string): string[] => {
  const recs = rubrics.records.filter((r) => r.activity === activity);
  assert.equal(recs.length, 1, `exactly one rubric record for ${activity}`);
  return recs[0]!.criteria.map((c) => c.key);
};
const entries = (pack: TestPack) => [...pack.staticChecks, ...pack.tests];

for (const activity of ACTIVITIES) {
  test(`${activity}: the pack is a well-formed candidate mapped onto its rubric`, () => {
    const pack = PACKS[activity];
    assert.ok(pack, `${activity} is registered`);
    assert.equal(pack.activityId, activity);
    assert.equal(pack.status, 'candidate');
    assert.equal(pack.version, '0.1.0');
    const keys = new Set(criteriaOf(activity));
    const all = entries(pack);
    assert.ok(all.length >= 8 && all.length <= 16, `${all.length} tests`);
    for (const t of all) assert.ok(keys.has(t.criterionKey), `${t.id} maps to ${t.criterionKey}, which is not in the rubric`);
    for (const h of pack.humanOnlyCriteria) {
      assert.ok(keys.has(h.criterionKey), `human-only ${h.criterionKey} is not in the rubric`);
      assert.ok(h.whyAr.trim().length > 0);
      assert.ok(!all.some((t) => t.criterionKey === h.criterionKey), `${h.criterionKey} is both tested and human-only`);
    }
    const covered = new Set([...all.map((t) => t.criterionKey), ...pack.humanOnlyCriteria.map((h) => h.criterionKey)]);
    for (const k of keys) assert.ok(covered.has(k), `rubric criterion ${k} is neither tested nor declared human-only`);

    // Ids and labels pass the domain's leak rules (a synthetic result with every entry, outcome `skipped`).
    const result: TestRunResult = {
      activityId: activity, packVersion: pack.version, packStatus: pack.status, commitSha: null, snapshotHash: `sha256:${'0'.repeat(64)}`,
      origin: 'synthetic', backend: 'contract-check', limits: DEFAULT_R2_LIMITS, status: 'completed', durationMs: 0, blockedRequests: 0, gamingSignals: [],
      tests: all.map((t) => ({ testId: t.id, criterionKey: t.criterionKey, layer: t.layer, mode: t.mode, outcome: 'skipped' as const, labelAr: t.labelAr, noteAr: null })),
    };
    assert.doesNotThrow(() => assertTestRunResult(result));
  });

  test(`${activity}: every synthetic case states a candidate outcome for every pack test`, () => {
    const pack = PACKS[activity]!;
    const ids = entries(pack).map((t) => t.id).sort();
    const keys = criteriaOf(activity).sort();
    for (const c of CASES) {
      const exp = readJson<Expected>(join(CAND, 'r2', activity, c, 'expected.candidate.json'));
      assert.equal(exp._label, LABEL, `${c}: labelled as a candidate`);
      assert.deepEqual(Object.keys(exp.tests).sort(), ids, `${c}: test ids`);
      assert.deepEqual(Object.keys(exp.criteria).sort(), keys, `${c}: criterion keys`);
      for (const k of pack.humanOnlyCriteria) assert.equal(exp.criteria[k.criterionKey], 'human', `${c}: ${k.criterionKey} stays with a person`);
    }
  });

  const starterFiles = loadCode(join(CAND, 'materials', activity, 'graduate'));
  for (const c of CASES) {
    test(`${activity} / ${c}: outcomes match the candidate expectation`, { skip }, async () => {
      const pack = PACKS[activity]!;
      const dir = join(CAND, 'r2', activity, c);
      const exp = readJson<Expected>(join(dir, 'expected.candidate.json'));
      const r = await runAttempt({ pack, files: loadCode(dir), starterFiles, commitSha: null, origin: 'synthetic' });
      assert.equal(r.status, 'completed', `run status ${r.status}`);
      const got = Object.fromEntries(r.tests.map((t) => [t.testId, t.outcome]));
      const notes = r.tests.filter((t) => got[t.testId] !== exp.tests[t.testId]).map((t) => `${t.testId}=${t.outcome} (${t.noteAr ?? ''})`);
      assert.deepEqual(got, exp.tests, `mismatches: ${notes.join('; ')}`);
      for (const s of exp.gamingSignalsAtLeast) assert.ok(r.gamingSignals.includes(s), `gaming signal ${s} missing (got ${r.gamingSignals.join(',')})`);
      if (exp.gamingSignalsAtLeast.length === 0) assert.deepEqual(r.gamingSignals, [], 'no gaming signals on a non-gaming case');
      assert.ok(r.durationMs < 60_000, `attempt took ${r.durationMs} ms`);
      console.log(`# ${activity}/${c}: ${r.durationMs} ms`);
    });
  }
}
