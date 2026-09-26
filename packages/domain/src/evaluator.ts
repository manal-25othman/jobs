/**
 * The deterministic evaluator.
 *
 * NO MODEL CALL. Given a published rubric and the facts a submission actually
 * carries, it returns the same result every time. This is the whole evaluator
 * for Vertical Slice 1 — the rubric-reasoning evaluator that needs a model
 * comes after OPEN-023 is resolved, behind the gateway.
 *
 * Why the rules live here rather than in the API: an evaluator that decides
 * what counts as evidence IS the product. In NestJS it would be reachable only
 * by booting a web framework, and a second caller would eventually re-derive
 * it slightly differently.
 */

import { MissingPrerequisite, InvariantViolation } from './errors.js';
import type { EvaluationOutcome, EvaluationCriterionScore } from './evaluation.js';
import { EVIDENCE_STATES, type EvidenceState, evidenceOrdinal } from './evidence-state.js';

/* ──────────────────────────── submitted facts ──────────────────────────── */

/**
 * One structured fact a submission carries.
 *
 * Deliberately NOT a JSON blob: each fact is a row, so a criterion can point
 * at one and a reviewer can see exactly which fact satisfied which criterion.
 */
export interface SubmissionArtifact {
  readonly key: string;
  readonly kind: 'boolean' | 'number' | 'text' | 'file' | 'link';
  readonly valueBool?: boolean;
  readonly valueNumber?: number;
  readonly valueText?: string;
  /** Where in the submission this fact came from — shown as the excerpt. */
  readonly locator?: string;
}

/* ───────────────────────────── rubric shape ────────────────────────────── */

export type CriterionCheck =
  /** The artifact must be present, and true when boolean. */
  | { readonly type: 'artifact_present'; readonly artifactKey: string }
  /** A numeric artifact must be at or above a threshold. */
  | { readonly type: 'artifact_at_least'; readonly artifactKey: string; readonly min: number }
  /** A text artifact must be non-empty and at least `minLength`. */
  | { readonly type: 'artifact_text'; readonly artifactKey: string; readonly minLength: number }
  /** All listed artifacts must be present. */
  | { readonly type: 'all_of'; readonly artifactKeys: readonly string[] };

export interface RubricCriterion {
  readonly key: string;
  readonly label: string;
  readonly maxScore: number;
  /** Which skill this criterion speaks to. */
  readonly skillId: string;
  readonly check: CriterionCheck;
  /** A criterion the submission cannot pass without. */
  readonly mandatory: boolean;
  /** Written when the criterion passes / fails. Never generated at runtime. */
  readonly rationaleWhenMet: string;
  readonly rationaleWhenUnmet: string;
}

export interface PublishedRubric {
  readonly rubricVersionId: string;
  readonly version: string;
  readonly activitySpecId: string;
  readonly activitySpecVersion: string;
  readonly status: 'published';
  readonly criteria: readonly RubricCriterion[];
  /** Fraction of the maximum required to pass. */
  readonly passThreshold: number;
  /** The state a pass proposes. Never above what the ladder allows. */
  readonly proposesState: EvidenceState;
}

/* ──────────────────────────── integrity checks ─────────────────────────── */

export interface IntegrityCheckSpec {
  readonly key: string;
  readonly classification: 'user_facing' | 'assessment_only';
  readonly check: CriterionCheck;
  /** True when failing this check must stop the pipeline. */
  readonly blocking: boolean;
  readonly userFacingMessage: string | null;
}

export interface IntegrityCheckResult {
  readonly key: string;
  readonly classification: 'user_facing' | 'assessment_only';
  readonly passed: boolean;
  readonly blocking: boolean;
  /** Only ever populated for user_facing checks. */
  readonly message: string | null;
}

/* ──────────────────────────────── result ───────────────────────────────── */

export interface EvaluationRun {
  readonly outcome: EvaluationOutcome;
  readonly rubricVersion: string;
  readonly activitySpecVersion: string;
  readonly criteria: readonly EvaluationCriterionScore[];
  readonly integrityChecks: readonly IntegrityCheckResult[];
  readonly totalScore: number;
  readonly maxScore: number;
  /** The state a successful run proposes. `null` when no promotion is earned. */
  readonly proposedState: EvidenceState | null;
  /** Always present: why this outcome, in one sentence, for the audit event. */
  readonly reason: string;
}

export interface EvaluatorInput {
  readonly rubric: PublishedRubric;
  readonly artifacts: readonly SubmissionArtifact[];
  readonly integritySpecs: readonly IntegrityCheckSpec[];
  /** The claim's state before this run. */
  readonly currentState: EvidenceState;
}

function findArtifact(
  artifacts: readonly SubmissionArtifact[],
  key: string,
): SubmissionArtifact | undefined {
  return artifacts.find((a) => a.key === key);
}

function runCheck(
  check: CriterionCheck,
  artifacts: readonly SubmissionArtifact[],
): { readonly met: boolean; readonly locator: string | null } {
  switch (check.type) {
    case 'artifact_present': {
      const a = findArtifact(artifacts, check.artifactKey);
      if (!a) return { met: false, locator: null };
      const met = a.kind === 'boolean' ? a.valueBool === true : true;
      return { met, locator: a.locator ?? null };
    }
    case 'artifact_at_least': {
      const a = findArtifact(artifacts, check.artifactKey);
      if (!a || a.valueNumber === undefined) return { met: false, locator: null };
      return { met: a.valueNumber >= check.min, locator: a.locator ?? null };
    }
    case 'artifact_text': {
      const a = findArtifact(artifacts, check.artifactKey);
      const text = a?.valueText?.trim() ?? '';
      return { met: text.length >= check.minLength, locator: a?.locator ?? null };
    }
    case 'all_of': {
      const found = check.artifactKeys.map((k) => findArtifact(artifacts, k));
      const met = found.every((a) => a !== undefined && (a.kind !== 'boolean' || a.valueBool === true));
      const locator = found.find((a) => a?.locator)?.locator ?? null;
      return { met, locator };
    }
  }
}

/**
 * Runs a published rubric against a submission's facts.
 *
 * Pure and total: no I/O, no clock, no randomness. Same inputs, same result,
 * which is what makes an evaluation defensible when a user disputes it.
 */
export function runDeterministicEvaluation(input: EvaluatorInput): EvaluationRun {
  const { rubric, artifacts, integritySpecs, currentState } = input;

  if (rubric.status !== 'published') {
    // INV-2: evaluating against a draft rubric would make the result
    // unreproducible the moment the draft changed.
    throw new InvariantViolation(
      'INV-2', 'an evaluation may only run against a published rubric version',
      { rubricVersion: rubric.version },
    );
  }
  if (rubric.criteria.length === 0) {
    throw new MissingPrerequisite('rubric.criteria', 'a rubric with no criteria cannot evaluate anything');
  }

  /* 1. Integrity checks run BEFORE scoring (doc 11: checks precede the
        evaluator, and a blocking failure stops the pipeline). */
  const integrityChecks: IntegrityCheckResult[] = integritySpecs.map((spec) => {
    const { met } = runCheck(spec.check, artifacts);
    return {
      key: spec.key,
      classification: spec.classification,
      passed: met,
      blocking: spec.blocking,
      // assessment_only detail never carries a message outward.
      message: spec.classification === 'user_facing' ? spec.userFacingMessage : null,
    };
  });

  const blockingFailure = integrityChecks.find((c) => c.blocking && !c.passed);
  if (blockingFailure) {
    return {
      outcome: 'blocked_by_checks',
      rubricVersion: rubric.version,
      activitySpecVersion: rubric.activitySpecVersion,
      criteria: [],
      integrityChecks,
      totalScore: 0,
      maxScore: rubric.criteria.reduce((s, c) => s + c.maxScore, 0),
      proposedState: null,
      reason: `a mandatory integrity check did not pass: ${blockingFailure.key}`,
    };
  }

  /* 2. Score each criterion. Every score carries its written rationale. */
  const criteria: EvaluationCriterionScore[] = rubric.criteria.map((c) => {
    const { met, locator } = runCheck(c.check, artifacts);
    return {
      criterionId: c.key,
      score: met ? c.maxScore : 0,
      maxScore: c.maxScore,
      rationale: met ? c.rationaleWhenMet : c.rationaleWhenUnmet,
      supportingExcerpt: met ? locator : null,
      skillId: c.skillId,
      // Deterministic: a check either matched or it did not.
      confidence: 1,
    };
  });

  const totalScore = criteria.reduce((s, c) => s + c.score, 0);
  const maxScore = criteria.reduce((s, c) => s + c.maxScore, 0);

  /* 3. A missed mandatory criterion cannot be compensated by the others. */
  const missedMandatory = rubric.criteria.filter((c) => {
    const scored = criteria.find((s) => s.criterionId === c.key);
    return c.mandatory && scored !== undefined && scored.score < c.maxScore;
  });

  const ratio = maxScore === 0 ? 0 : totalScore / maxScore;
  const passed = missedMandatory.length === 0 && ratio >= rubric.passThreshold;

  if (!passed) {
    const why = missedMandatory.length > 0
      ? `mandatory criteria not met: ${missedMandatory.map((c) => c.key).join(', ')}`
      : `score ${totalScore}/${maxScore} is below the ${Math.round(rubric.passThreshold * 100)}% threshold`;
    return {
      outcome: 'below_threshold',
      rubricVersion: rubric.version,
      activitySpecVersion: rubric.activitySpecVersion,
      criteria,
      integrityChecks,
      totalScore,
      maxScore,
      // Real work was evaluated. "No evidence" is a legitimate result, and the
      // claim may still legitimately sit at `practiced`.
      proposedState: null,
      reason: why,
    };
  }

  /* 4. A pass PROPOSES a state. It does not grant one — INV-9. The proposal
        still has to clear assertTransitionAllowed at the application layer. */
  const proposed = rubric.proposesState;
  if (evidenceOrdinal(proposed) <= evidenceOrdinal(currentState)) {
    return {
      outcome: 'passed',
      rubricVersion: rubric.version,
      activitySpecVersion: rubric.activitySpecVersion,
      criteria,
      integrityChecks,
      totalScore,
      maxScore,
      proposedState: null,
      reason: `passed, and the claim is already at '${currentState}'; no promotion is earned`,
    };
  }

  return {
    outcome: 'passed',
    rubricVersion: rubric.version,
    activitySpecVersion: rubric.activitySpecVersion,
    criteria,
    integrityChecks,
    totalScore,
    maxScore,
    proposedState: proposed,
    reason: `all mandatory criteria met, ${totalScore}/${maxScore}`,
  };
}

/** Guard: a rubric may not propose a state the ladder forbids reaching directly. */
export function assertRubricProposalSane(rubric: PublishedRubric): void {
  if (rubric.proposesState === 'verified') {
    throw new InvariantViolation(
      'INV-9',
      'a rubric may not propose Verified: Verified needs an independent verification step and a named human reviewer',
      { rubricVersion: rubric.version },
    );
  }
  if (!EVIDENCE_STATES.includes(rubric.proposesState)) {
    throw new MissingPrerequisite('rubric.proposesState', 'unknown evidence state');
  }
}
