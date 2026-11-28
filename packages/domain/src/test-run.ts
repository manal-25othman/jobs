/**
 * R2 — automated test runs on a submitted code snapshot: the rules that are not the runner.
 *
 * The isolated runner (apps/runner) executes a team-written TEST PACK against the files of ONE submission, pinned to
 * the exact commit SHA (or content hash) the graduate submitted. This module owns what a result may contain and what
 * it may mean:
 *
 *  - Layer 1 only. A test result is an automated OBSERVATION about behaviour. It is never code-quality judgment
 *    (layer 2), never skill proof (layer 3) and never professional readiness (layer 4) — see
 *    docs/evaluation/AUTOMATED-ASSESSMENT-QUALITY-METRICS.md. Nothing here writes evidence, a level or a decision.
 *  - Shadow mode. Until a named calibration decision, results are shown to the reviewer and to A13 as input; they do
 *    not change the evaluation outcome.
 *  - No leakage. A result carries the pack's NEUTRAL labels and outcomes only — never test source, expected values,
 *    hidden fixtures, stdout of the graduate's code or the reference solution.
 *  - Synthetic only. Until the owner approves the security review, only synthetic code may run (PO decision 2,
 *    Phase C round 2). `assertRunnableOrigin` enforces it.
 *  - Calibratable limits, inside hard bounds no configuration may exceed.
 */
import { createHash } from 'node:crypto';
import { DomainError } from './errors.js';

/* ───────────────────────────── layers & modes ───────────────────────────── */

/** What a test looks at. Mirrors the owner's list (round 2, item 3). */
export const TEST_LAYERS = [
  'functional', 'output', 'errors', 'quality', 'usability', 'responsive', 'a11y', 'data_states', 'gaming',
] as const;
export type TestLayer = (typeof TEST_LAYERS)[number];

/**
 * `automated`: the test can decide its observation alone (e.g. "no horizontal scroll at 360px").
 * `supports_human`: the test gathers an observation a PERSON uses to decide a human criterion; it never decides it.
 */
export const TEST_MODES = ['automated', 'supports_human'] as const;
export type TestMode = (typeof TEST_MODES)[number];

/**
 * `skipped`: the test did not observe anything — the attempt's deadline passed, or the state it needs was never reached
 * (not applicable, e.g. no error state so no retry control to try). Never counts toward «met» (see summarizeByCriterion).
 */
export const TEST_OUTCOMES = ['pass', 'fail', 'error', 'timeout', 'skipped'] as const;
export type TestOutcome = (typeof TEST_OUTCOMES)[number];

export const RUN_STATUSES = ['completed', 'timeout', 'crashed', 'refused'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Where the code came from. Only `synthetic` may run before the security review is approved. */
export const CODE_ORIGINS = ['synthetic', 'graduate'] as const;
export type CodeOrigin = (typeof CODE_ORIGINS)[number];

export const TESTS_ARE_NOT_SKILL_PROOF_AR =
  'نتائج الاختبارات الآلية ملاحظات عن سلوك العمل في هذه النسخة فقط. لا تُثبت المهارة وحدها، ولا تغيّر مستوى ولا جاهزية.';
export const TEST_RUN_SHADOW_AR = 'وضع الظل: تظهر النتائج للمراجِع، ولا تغيّر نتيجة التقييم حتى تُعتمد المعايرة.';

/* ───────────────────────────────── limits ───────────────────────────────── */

export interface RunnerLimits {
  /** CPU share of one core, in percent (cgroup quota). */
  readonly cpuPercent: number;
  readonly memoryMiB: number;
  /** Tasks (processes AND threads — the pids cgroup counts both). A headless browser needs a few hundred. */
  readonly maxProcesses: number;
  /** Writable scratch space inside the sandbox (tmpfs size). */
  readonly diskMiB: number;
  /** The whole attempt, sandbox start to teardown. */
  readonly wallSeconds: number;
  readonly perTestSeconds: number;
  /** Total submitted bytes the runner accepts. */
  readonly maxInputBytes: number;
}

/** Proposed starting values (R2 design §2). Calibrated by measurement, inside R2_LIMIT_BOUNDS. */
export const DEFAULT_R2_LIMITS: RunnerLimits = {
  cpuPercent: 100, memoryMiB: 512, maxProcesses: 512, diskMiB: 256, wallSeconds: 90, perTestSeconds: 10, maxInputBytes: 2 * 1024 * 1024,
};

/** Hard bounds. Calibration may move a limit within these, never outside. */
export const R2_LIMIT_BOUNDS: { readonly [K in keyof RunnerLimits]: readonly [number, number] } = {
  cpuPercent: [10, 200], memoryMiB: [128, 2048], maxProcesses: [16, 2048], diskMiB: [16, 1024],
  wallSeconds: [10, 300], perTestSeconds: [1, 60], maxInputBytes: [1024, 10 * 1024 * 1024],
};

export function assertRunnerLimits(l: RunnerLimits): RunnerLimits {
  for (const k of Object.keys(R2_LIMIT_BOUNDS) as (keyof RunnerLimits)[]) {
    const v = l[k]; const [lo, hi] = R2_LIMIT_BOUNDS[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
      throw new DomainError(`[r2_limits] ${k}=${String(v)} is outside the calibration bounds [${lo}, ${hi}].`, { k, v });
    }
  }
  if (l.perTestSeconds >= l.wallSeconds) throw new DomainError('[r2_limits] perTestSeconds must be below wallSeconds.');
  return l;
}

/** A calibration override, applied over the defaults and re-checked against the bounds. */
export function calibrateLimits(override: Partial<RunnerLimits>, base: RunnerLimits = DEFAULT_R2_LIMITS): RunnerLimits {
  return assertRunnerLimits({ ...base, ...override });
}

/* ───────────────────────────── origin & input ───────────────────────────── */

export function assertRunnableOrigin(origin: string): asserts origin is 'synthetic' {
  if (origin !== 'synthetic') {
    throw new DomainError(
      '[r2_real_code_not_approved] Only synthetic code may run until the security review of R2 is approved by the product owner.',
      { origin },
    );
  }
}

export interface SubmittedFile { readonly path: string; readonly content: string }

/** Safe relative paths only: no absolute paths, no `..`, no hidden files, a short allow-listed extension set. */
const SAFE_PATH = /^(?!.*\.\.)(?!\/)(?!.*(^|\/)\.)[A-Za-z0-9_\-./]{1,160}$/;
const SAFE_EXT = /\.(html|css|js|mjs|json|md|txt|svg)$/i;

export function assertSubmittedFiles(files: readonly SubmittedFile[], limits: RunnerLimits): void {
  if (files.length === 0) throw new DomainError('[r2_input] No files submitted.');
  if (files.length > 200) throw new DomainError('[r2_input] Too many files.');
  let total = 0;
  const seen = new Set<string>();
  for (const f of files) {
    if (!SAFE_PATH.test(f.path) || !SAFE_EXT.test(f.path)) throw new DomainError(`[r2_input] Unsafe or unsupported path: ${f.path}`);
    if (seen.has(f.path)) throw new DomainError(`[r2_input] Duplicate path: ${f.path}`);
    seen.add(f.path);
    total += Buffer.byteLength(f.content, 'utf8');
  }
  if (total > limits.maxInputBytes) throw new DomainError(`[r2_input] Submission is ${total} bytes; the limit is ${limits.maxInputBytes}.`);
}

/** Order-independent hash of the snapshot, so a result is bound to the exact content that ran. */
export function snapshotHash(files: readonly SubmittedFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    h.update(f.path); h.update('\0'); h.update(f.content); h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

const SHA_RE = /^[0-9a-f]{40}$/;
export function assertCommitSha(sha: string | null): void {
  if (sha !== null && !SHA_RE.test(sha)) throw new DomainError('[r2_input] A commit SHA must be the full 40-character hex id.', { sha });
}

/* ───────────────────────────────── result ───────────────────────────────── */

export interface TestResultEntry {
  /** Neutral id from the pack, e.g. `responsive.no_page_scroll_360`. Never names a planted defect. */
  readonly testId: string;
  readonly criterionKey: string;
  readonly layer: TestLayer;
  readonly mode: TestMode;
  readonly outcome: TestOutcome;
  /** Neutral Arabic label from the pack. */
  readonly labelAr: string;
  /** Optional short neutral note from the pack (e.g. "عرض الصفحة 742 بكسل على شاشة 360"). Never test source. */
  readonly noteAr: string | null;
}

export interface TestRunResult {
  readonly activityId: string;
  readonly packVersion: string;
  readonly packStatus: 'candidate' | 'approved';
  readonly commitSha: string | null;
  readonly snapshotHash: string;
  readonly origin: CodeOrigin;
  readonly backend: string;
  readonly limits: RunnerLimits;
  readonly status: RunStatus;
  readonly durationMs: number;
  readonly tests: readonly TestResultEntry[];
  /** Requests the page tried to make outside the submission (counted, never followed). */
  readonly blockedRequests: number;
  /** Static signals that the code may be targeting the test environment. For a person to look at, never a verdict. */
  readonly gamingSignals: readonly string[];
  /** Seed the pack derived its varied inputs from (viewport widths, names, data records): reproduces the run. */
  readonly inputSeed?: number;
}

const MAX_NOTE = 200;
const LEAK_RE = /(expected|assert|solution|reference|planted|hidden|fixture|\bspec\b|REFERENCE\.md)/i;

/** Rejects a result that would leak test internals or claim more than an observation. */
export function assertTestRunResult(r: TestRunResult): TestRunResult {
  if (!RUN_STATUSES.includes(r.status)) throw new DomainError(`[r2_result] Unknown status ${r.status}.`);
  if (!CODE_ORIGINS.includes(r.origin)) throw new DomainError(`[r2_result] Unknown origin ${r.origin}.`);
  assertCommitSha(r.commitSha);
  if (!/^sha256:[0-9a-f]{64}$/.test(r.snapshotHash)) throw new DomainError('[r2_result] A result must name the snapshot hash it ran on.');
  assertRunnerLimits(r.limits);
  if (r.inputSeed !== undefined && (!Number.isInteger(r.inputSeed) || r.inputSeed <= 0)) throw new DomainError('[r2_result] The input seed must be a positive integer.');
  const ids = new Set<string>();
  for (const t of r.tests) {
    if (ids.has(t.testId)) throw new DomainError(`[r2_result] Duplicate test id ${t.testId}.`);
    ids.add(t.testId);
    if (!TEST_LAYERS.includes(t.layer) || !TEST_MODES.includes(t.mode) || !TEST_OUTCOMES.includes(t.outcome)) {
      throw new DomainError(`[r2_result] Malformed entry ${t.testId}.`);
    }
    for (const text of [t.labelAr, t.noteAr ?? '', t.testId]) {
      if (LEAK_RE.test(text)) throw new DomainError(`[r2_result] Entry ${t.testId} would reveal test internals.`);
    }
    if ((t.noteAr ?? '').length > MAX_NOTE) throw new DomainError(`[r2_result] Note on ${t.testId} is too long.`);
  }
  return r;
}

/** Per criterion: what the automated tests observed. Input for the reviewer and A13; never a score. */
export interface CriterionTestSummary {
  readonly criterionKey: string;
  readonly automatedPassed: number;
  readonly automatedFailed: number;
  readonly automatedInconclusive: number;
  readonly supportsHuman: number;
  /** `all_passed` | `some_failed` | `inconclusive` | `human_only` — a description, not a decision. */
  readonly observation: 'all_passed' | 'some_failed' | 'inconclusive' | 'human_only';
}

export function summarizeByCriterion(r: TestRunResult): CriterionTestSummary[] {
  const by = new Map<string, TestResultEntry[]>();
  for (const t of r.tests) by.set(t.criterionKey, [...(by.get(t.criterionKey) ?? []), t]);
  return [...by.entries()].map(([criterionKey, ts]) => {
    const auto = ts.filter((t) => t.mode === 'automated');
    const automatedPassed = auto.filter((t) => t.outcome === 'pass').length;
    const automatedFailed = auto.filter((t) => t.outcome === 'fail').length;
    const automatedInconclusive = auto.length - automatedPassed - automatedFailed;
    const supportsHuman = ts.length - auto.length;
    const observation = auto.length === 0 ? 'human_only'
      : automatedFailed > 0 ? 'some_failed'
      : automatedInconclusive > 0 ? 'inconclusive' : 'all_passed';
    return { criterionKey, automatedPassed, automatedFailed, automatedInconclusive, supportsHuman, observation };
  });
}

/**
 * Whether a run must go to a person before anyone relies on it (human escalation, metrics Q6–Q7).
 * Any non-completed run, any inconclusive automated test, or any gaming signal escalates.
 */
export function needsHumanEscalation(r: TestRunResult): { escalate: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.status !== 'completed') reasons.push(`run_${r.status}`);
  if (r.tests.some((t) => t.mode === 'automated' && (t.outcome === 'error' || t.outcome === 'timeout'))) reasons.push('inconclusive_tests');
  if (r.gamingSignals.length > 0) reasons.push('gaming_signals');
  if (r.packStatus !== 'approved') reasons.push('pack_not_approved');
  return { escalate: reasons.length > 0, reasons };
}
