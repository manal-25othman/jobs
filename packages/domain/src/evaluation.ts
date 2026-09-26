/**
 * Evaluation as an immutable historical event.
 *
 * An evaluation is never a mutable `status` column on a project. Re-evaluation
 * appends a new result that supersedes the previous one by reference; it never
 * rewrites it (docs/blueprint/21 §4: `disputed -> revised` is "a new review
 * evaluation, not a replacement").
 */

import { InvariantViolation, MissingPrerequisite } from './errors.js';

/* ───────────────────────────── evaluation outcome ───────────────────────── */

/**
 * The five terminal outcomes of the evaluation pipeline.
 *
 * DERIVED, not quoted: docs/evaluation/11 enumerates these outcomes across its
 * stages but never presents them as a numbered set of five. The derivation is
 * recorded per member below and flagged for owner confirmation in
 * PHASE-0-READINESS.md — see OPEN-EVAL-01.
 */
export const EVALUATION_OUTCOMES = [
  /** Thresholds met; evidence may be derived. (doc 11 §5–§6) */
  'passed',
  /** Evaluated real work, below the skill threshold. "No evidence" is a
   *  legitimate result and is shown plainly. (doc 11 §6) */
  'below_threshold',
  /** A mandatory deterministic check failed; the pipeline stops and one
   *  correction opportunity is offered. (doc 11 §3) */
  'blocked_by_checks',
  /** Integrity model outage. Safe mode: lowest level, human review available.
   *  Never a guessed score. (doc 11 §4) */
  'undetermined',
  /** Evaluator failed after one retry, or the case was escalated. Queued for
   *  human review. (doc 11 §5 · §9) */
  'needs_human_review',
] as const;

export type EvaluationOutcome = (typeof EVALUATION_OUTCOMES)[number];

/**
 * Verification outcomes, enumerated explicitly in the approved records
 * (docs/blueprint/21 §5 · docs/evaluation/11 §7). Also exactly five.
 * Verification lowers or holds a level; it never raises one.
 */
export const VERIFICATION_OUTCOMES = [
  'accepted',
  'downgraded',
  'rejected',
  'escalated_to_human',
  'exception_granted',
] as const;

export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

/** Outcomes that may produce evidence. Everything else produces none. */
const OUTCOMES_THAT_MAY_YIELD_EVIDENCE: ReadonlySet<EvaluationOutcome> = new Set([
  'passed',
  'below_threshold', // may yield a `practiced` claim, never `demonstrated`
]);

export function mayYieldEvidence(outcome: EvaluationOutcome): boolean {
  return OUTCOMES_THAT_MAY_YIELD_EVIDENCE.has(outcome);
}

/* ─────────────────────────── criterion and result ───────────────────────── */

export interface EvaluationCriterionScore {
  readonly criterionId: string;
  readonly score: number;
  readonly maxScore: number;
  /** Written justification. A score with no reason is not a result. */
  readonly rationale: string;
  /** Supporting excerpt from the submission (doc 11 §5). */
  readonly supportingExcerpt: string | null;
  readonly skillId: string | null;
  readonly confidence: number;
}

/**
 * One immutable evaluation result.
 *
 * `supersedesResultId` links a re-evaluation to what it replaces in the user's
 * view. Both rows stay in the table forever.
 */
export interface EvaluationResultRecord {
  readonly id: string;
  readonly evaluationId: string;
  readonly submissionId: string;
  readonly outcome: EvaluationOutcome;
  /** INV-2: the frozen rubric this ran against. */
  readonly rubricVersion: string;
  /** INV-7: the frozen activity spec the work was assigned under. */
  readonly activitySpecVersion: string;
  readonly criteria: readonly EvaluationCriterionScore[];
  readonly evaluatedAt: string;
  readonly supersedesResultId: string | null;
  /** Set when a human reviewer produced or revised this result. */
  readonly humanReviewerId: string | null;
  /** FR-P-037: which role the reviewer acted in, recorded separately from who
   *  they are, because in Phase 0 the SME and the reviewer may be one person. */
  readonly rolePerformed: 'sme' | 'human_reviewer' | null;
}

export interface NewEvaluationResult {
  readonly outcome: EvaluationOutcome;
  readonly rubricVersion?: string;
  readonly activitySpecVersion?: string;
  readonly criteria?: readonly EvaluationCriterionScore[];
  readonly humanReviewerId?: string;
}

/**
 * Validates an evaluation result before it is written.
 *
 * INV-2 — no evaluation without a published rubric version.
 * INV-7 — every activity references a published spec version.
 * doc 11 §5 — no overall score without per-criterion results, and never a
 * guessed one.
 */
export function assertEvaluationResultValid(r: NewEvaluationResult): void {
  const producesScore = r.outcome === 'passed' || r.outcome === 'below_threshold';

  if (producesScore && !r.rubricVersion) {
    throw new InvariantViolation(
      'INV-2',
      'an evaluation that produces a score requires a published rubric_version',
      { outcome: r.outcome },
    );
  }

  if (producesScore && !r.activitySpecVersion) {
    throw new InvariantViolation(
      'INV-7',
      'an evaluated activity must reference a published activity spec version',
      { outcome: r.outcome },
    );
  }

  if (producesScore && (!r.criteria || r.criteria.length === 0)) {
    throw new MissingPrerequisite(
      'criteria',
      'no overall result without per-criterion scores; a guessed result is never written',
    );
  }

  for (const c of r.criteria ?? []) {
    if (!c.rationale || c.rationale.trim() === '') {
      throw new MissingPrerequisite(
        'criteria[].rationale',
        `criterion ${c.criterionId} has a score with no written justification`,
      );
    }
    if (c.score < 0 || c.score > c.maxScore) {
      throw new MissingPrerequisite(
        'criteria[].score',
        `criterion ${c.criterionId} scored ${c.score} outside 0..${c.maxScore}`,
      );
    }
  }
}

/**
 * INV-9 — an activity score is not a skill level.
 *
 * Passing an activity makes a skill promotion *eligible*; it never performs it.
 * The promotion still has to clear assertTransitionAllowed.
 */
export function activityScoreGrantsLevel(): never {
  throw new InvariantViolation(
    'INV-9',
    'Activity Score is not a Skill Verification Level: a score never grants a level directly',
  );
}

/** Whether a passing evaluation makes a promotion eligible. Eligible != done. */
export function promotionEligibleFrom(outcome: EvaluationOutcome): boolean {
  return outcome === 'passed';
}
