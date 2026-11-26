import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_R2_LIMITS, assertRunnerLimits, calibrateLimits, assertRunnableOrigin, assertSubmittedFiles, snapshotHash,
  assertTestRunResult, summarizeByCriterion, needsHumanEscalation, assertCommitSha, type TestRunResult,
} from './test-run.js';

const base: TestRunResult = {
  activityId: 'act_fe_debug_improve', packVersion: '0.1.0', packStatus: 'candidate', commitSha: 'a'.repeat(40),
  snapshotHash: snapshotHash([{ path: 'index.html', content: '<html></html>' }]), origin: 'synthetic', backend: 'namespace-dev',
  limits: DEFAULT_R2_LIMITS, status: 'completed', durationMs: 1000, blockedRequests: 0, gamingSignals: [],
  tests: [
    { testId: 'responsive.page_width_360', criterionKey: 'responsive_fixed', layer: 'responsive', mode: 'automated', outcome: 'pass', labelAr: 'لا تمرير أفقي على 360', noteAr: null },
    { testId: 'a11y.labels', criterionKey: 'a11y_keyboard_forms', layer: 'a11y', mode: 'automated', outcome: 'fail', labelAr: 'تسميات الحقول', noteAr: null },
    { testId: 'quality.scope', criterionKey: 'scope_discipline', layer: 'quality', mode: 'supports_human', outcome: 'pass', labelAr: 'حجم التغيير', noteAr: null },
  ],
};

test('limits: defaults are valid; calibration stays inside the hard bounds', () => {
  assert.equal(assertRunnerLimits(DEFAULT_R2_LIMITS), DEFAULT_R2_LIMITS);
  assert.equal(calibrateLimits({ memoryMiB: 768 }).memoryMiB, 768);
  assert.throws(() => calibrateLimits({ memoryMiB: 4096 }), /r2_limits/);
  assert.throws(() => calibrateLimits({ wallSeconds: 5 }), /r2_limits/);
  assert.throws(() => calibrateLimits({ perTestSeconds: 60, wallSeconds: 30 }), /r2_limits/);
});

test('origin: only synthetic code may run before the security review is approved', () => {
  assert.doesNotThrow(() => assertRunnableOrigin('synthetic'));
  assert.throws(() => assertRunnableOrigin('graduate'), /r2_real_code_not_approved/);
});

test('input: unsafe paths, hidden files, traversal and oversize input are refused', () => {
  const ok = [{ path: 'index.html', content: 'x' }, { path: 'data/tasks.json', content: '[]' }];
  assert.doesNotThrow(() => assertSubmittedFiles(ok, DEFAULT_R2_LIMITS));
  for (const path of ['../x.js', '/etc/passwd', '.env', 'a/.git/config', 'run.sh', 'x.exe']) {
    assert.throws(() => assertSubmittedFiles([{ path, content: 'x' }], DEFAULT_R2_LIMITS), /r2_input/, path);
  }
  assert.throws(() => assertSubmittedFiles([{ path: 'a.js', content: 'x'.repeat(3 * 1024 * 1024) }], DEFAULT_R2_LIMITS), /r2_input/);
  assert.throws(() => assertSubmittedFiles([], DEFAULT_R2_LIMITS), /r2_input/);
});

test('snapshot hash is order-independent and content-sensitive; commit SHA must be full', () => {
  const a = [{ path: 'a.js', content: '1' }, { path: 'b.js', content: '2' }];
  assert.equal(snapshotHash(a), snapshotHash([...a].reverse()));
  assert.notEqual(snapshotHash(a), snapshotHash([{ path: 'a.js', content: '1' }, { path: 'b.js', content: '3' }]));
  assert.throws(() => assertCommitSha('abc123'), /r2_input/);
  assert.doesNotThrow(() => assertCommitSha(null));
});

test('result: a label or note that would reveal test internals is refused', () => {
  assert.doesNotThrow(() => assertTestRunResult(base));
  const leak = { ...base, tests: [{ ...base.tests[0]!, noteAr: 'expected 3 rows' }] };
  assert.throws(() => assertTestRunResult(leak), /reveal test internals/);
  const planted = { ...base, tests: [{ ...base.tests[0]!, testId: 'planted.overflow' }] };
  assert.throws(() => assertTestRunResult(planted), /reveal test internals/);
});

test('summary describes per criterion and never scores; supports_human never decides', () => {
  const s = summarizeByCriterion(base);
  assert.deepEqual(s.map((x) => [x.criterionKey, x.observation]), [
    ['responsive_fixed', 'all_passed'], ['a11y_keyboard_forms', 'some_failed'], ['scope_discipline', 'human_only'],
  ]);
});

test('escalation: candidate packs, gaming signals and inconclusive runs always go to a person', () => {
  assert.deepEqual(needsHumanEscalation(base).reasons, ['pack_not_approved']);
  const r = needsHumanEscalation({ ...base, packStatus: 'approved', status: 'timeout', gamingSignals: ['webdriver_probe'] });
  assert.deepEqual(r.reasons, ['run_timeout', 'gaming_signals']);
  assert.equal(needsHumanEscalation({ ...base, packStatus: 'approved' }).escalate, false);
});
