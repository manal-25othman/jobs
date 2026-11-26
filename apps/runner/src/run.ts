/**
 * One R2 attempt: static checks (text only, trusted side) → fresh sandbox → browser tests → teardown.
 * Returns a result bound to the snapshot hash (and commit SHA when the code came from a repository).
 */
import {
  DEFAULT_R2_LIMITS, DomainError, assertCommitSha, assertRunnableOrigin, assertRunnerLimits, assertSubmittedFiles,
  assertTestRunResult, snapshotHash, type CodeOrigin, type RunnerLimits, type SubmittedFile, type TestResultEntry, type TestRunResult,
} from '@naqla/domain';
import { BACKEND_NAME, chromiumEntry, cleanupAttempt, prepareAttempt, type Attempt } from './sandbox.js';
import { Driver, launchSandboxedBrowser } from './harness.js';
import type { TestPack } from './pack.js';
import { gamingSignals } from './gaming.js';

export interface AttemptInput {
  readonly pack: TestPack;
  readonly files: readonly SubmittedFile[];
  readonly starterFiles?: readonly SubmittedFile[];
  readonly commitSha: string | null;
  readonly origin: CodeOrigin;
  readonly limits?: RunnerLimits;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let t: NodeJS.Timeout;
  return Promise.race([p, new Promise<'timeout'>((r) => { t = setTimeout(() => r('timeout'), ms); })]).finally(() => clearTimeout(t));
}

export async function runAttempt(input: AttemptInput): Promise<TestRunResult> {
  const started = Date.now();
  const limits = assertRunnerLimits(input.limits ?? DEFAULT_R2_LIMITS);
  assertRunnableOrigin(input.origin);
  assertCommitSha(input.commitSha);
  assertSubmittedFiles(input.files, limits);
  const { pack } = input;
  if (!input.files.some((f) => f.path === pack.entry)) throw new DomainError(`[r2_input] The submission has no ${pack.entry}.`);

  const tests: TestResultEntry[] = [];
  for (const c of pack.staticChecks) {
    let outcome: TestResultEntry['outcome'] = 'error'; let noteAr: string | null = null;
    try { const r = c.run(input.files, input.starterFiles ?? []); outcome = r.pass ? 'pass' : 'fail'; noteAr = r.noteAr ?? null; } catch { outcome = 'error'; }
    tests.push({ testId: c.id, criterionKey: c.criterionKey, layer: c.layer, mode: c.mode, outcome, labelAr: c.labelAr, noteAr });
  }

  let status: TestRunResult['status'] = 'completed';
  let blocked = 0;
  let attempt: Attempt | null = null;
  const deadline = started + limits.wallSeconds * 1000;
  try {
    attempt = prepareAttempt(input.files, limits, 'browser');
    const browser = await launchSandboxedBrowser(chromiumEntry(attempt), Math.min(30_000, limits.wallSeconds * 1000));
    const driver = new Driver(browser, input.files, pack.entry, limits.perTestSeconds * 1000);
    try {
      for (const t of pack.tests) {
        const left = deadline - Date.now();
        if (left <= 0) { status = 'timeout'; tests.push({ testId: t.id, criterionKey: t.criterionKey, layer: t.layer, mode: t.mode, outcome: 'skipped', labelAr: t.labelAr, noteAr: null }); continue; }
        let outcome: TestResultEntry['outcome']; let noteAr: string | null = null;
        try {
          const r = await withTimeout(t.run(driver), Math.min(left, limits.perTestSeconds * 1000));
          if (r === 'timeout') outcome = 'timeout';
          else { outcome = r.pass ? 'pass' : 'fail'; noteAr = r.noteAr ?? null; }
        } catch { outcome = 'error'; }
        await driver.close();
        driver.resetDataModes();
        tests.push({ testId: t.id, criterionKey: t.criterionKey, layer: t.layer, mode: t.mode, outcome, labelAr: t.labelAr, noteAr });
      }
    } finally {
      blocked = driver.blocked;
      await withTimeout(browser.close().catch(() => undefined), 5000);
    }
  } catch (e) {
    if (e instanceof DomainError) throw e;
    if (process.env.R2_DEBUG) console.error('[r2_debug]', e);
    status = 'crashed';
  } finally {
    if (attempt) cleanupAttempt(attempt);
  }

  return assertTestRunResult({
    activityId: pack.activityId, packVersion: pack.version, packStatus: pack.status, commitSha: input.commitSha,
    snapshotHash: snapshotHash(input.files), origin: input.origin, backend: BACKEND_NAME, limits, status,
    durationMs: Date.now() - started, tests, blockedRequests: blocked, gamingSignals: gamingSignals(input.files),
  });
}
