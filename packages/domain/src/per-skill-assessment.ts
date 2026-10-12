/**
 * ENG-1 P1 — per-skill assessment (pure, side-effect free, NOT wired into any service).
 *
 * One evaluation may provide evidence to several skills; one skill's success never implies another's.
 * For each skill S this module derives, from S's OWN criteria only:
 *
 *     outcome  ∈ met | not_met | incomplete | not_assessed | blocked
 *     basis    D-118 independent-verification basis restricted to S's criteria
 *     proposal from S's OWN previous state
 *
 * and, separately, the policy decision for S. It never writes, never moves a level, never reads readiness.
 *
 * Invariants (tested):
 *   INV-PS1  S's assessment depends only on S's applicable criteria, the shared precondition and S's own state.
 *   INV-PS2  not_assessed / incomplete / not_met never carry a proposal.
 *   INV-PS3  a failed global integrity gate (blocking check or gate criterion) blocks every skill; nothing at
 *            activity level can RAISE a skill.
 *   INV-PS4  the activity's overall outcome (pass rule, total) is not an input to any skill outcome.
 *   INV-PS5  at most one assessment per (evaluation result, canonical skill).
 *
 * Thresholds: a per-skill threshold is the stored `threshold_for_skill`, read as a FRACTION of the criterion's
 * maximum in (0, 1], and it counts only when its value status is `approved` (a named SME, recorded on the rubric
 * version, which is itself versioned). There is NO fallback to full marks: an unapproved or invalid threshold
 * leaves the criterion undecidable, and the skill `incomplete`.
 */

import { InvariantViolation, DomainError } from './errors.js';
import { evidenceOrdinal, type EvidenceState } from './evidence-state.js';
import type { PublishedRubric, EvaluationRun, SubmissionArtifact } from './evaluator.js';
import { assessmentBasis, type AssessmentBasis, type ArtifactProvenance } from './verification-integrity.js';
import { decideWithPolicy, type VerificationPolicy, type PolicyDecision, type AssessmentEvaluatorKind } from './verification-policy.js';
import { isValidSkillEvidenceCriterion } from './skill-attribution.js';

export const PER_SKILL_MODEL_VERSION = 'per_skill@1';

export const SKILL_ASSESSMENT_OUTCOMES = ['met', 'not_met', 'incomplete', 'not_assessed', 'blocked'] as const;
export type SkillAssessmentOutcome = (typeof SKILL_ASSESSMENT_OUTCOMES)[number];

export const SKILL_CRITERION_STATUSES = ['met', 'not_met', 'pending', 'threshold_unapproved'] as const;
export type SkillCriterionStatus = (typeof SKILL_CRITERION_STATUSES)[number];

export interface SkillCriterionResult {
  readonly key: string;
  readonly evaluatorKind: 'rule' | 'human' | 'llm';
  /** Null while undecided (a pending human criterion, or not scored). */
  readonly score: number | null;
  readonly maxScore: number;
  /** The threshold fraction used, exactly as stored on this rubric version. */
  readonly threshold: number | null;
  readonly thresholdStatus: string | null;
  readonly status: SkillCriterionStatus;
}

export interface SkillAssessmentContext {
  readonly modelVersion: string;
  readonly rubricVersionId: string;
  readonly rubricVersion: string;
  readonly activitySpecId: string;
  readonly activitySpecVersion: string;
}

export interface SkillAssessment {
  readonly skillId: string;
  readonly claimed: boolean;
  readonly outcome: SkillAssessmentOutcome;
  /** Every criterion that measures this skill, in rubric order, with what was observed. */
  readonly criteria: readonly SkillCriterionResult[];
  readonly basis: AssessmentBasis;
  readonly confidence: number | null;
  /** The skill's OWN state before this evaluation. */
  readonly currentState: EvidenceState;
  /** Non-null only when outcome = met and the rubric's proposal is above currentState. */
  readonly proposedState: EvidenceState | null;
  readonly reason: string;
  readonly context: SkillAssessmentContext;
}

export interface SkillAssessmentInput {
  readonly rubric: PublishedRubric;
  /** The final run (or an interim one awaiting human review). */
  readonly run: EvaluationRun;
  /** Canonical skills to assess. Choosing this scope is the caller's (and the Product Owner's) decision. */
  readonly skillIds: readonly string[];
  /** Canonical skills the learner claimed on the submission. */
  readonly claimedSkillIds: readonly string[];
  /** Each skill's own state before this evaluation; absent ⇒ gap. */
  readonly currentStates: Readonly<Record<string, EvidenceState>>;
  /** Maps a criterion's linked skill to its canonical id (identity when omitted). */
  readonly canonicalOf?: (skillId: string) => string;
  readonly artifacts: readonly (SubmissionArtifact & { readonly provenance?: ArtifactProvenance })[];
  /** Criteria a named human reviewer decided for this run. */
  readonly humanDecidedCriteria: readonly string[];
  readonly rubricValuesApproved: boolean;
  readonly rubricIsDemo: boolean;
}

const EPS = 1e-9;

/** The criteria that measure `skillId` (canonical): valid skill-evidence criteria only, in rubric order. */
export function applicableCriteria(rubric: Pick<PublishedRubric, 'criteria'>, skillId: string, canonicalOf: (s: string) => string = (s) => s): PublishedRubric['criteria'] {
  return rubric.criteria.filter((c) => isValidSkillEvidenceCriterion(c) && canonicalOf(c.skillId!) === skillId);
}

/** The shared, activity-level precondition: no blocking integrity failure and every gate criterion met. */
export function sharedPrecondition(rubric: Pick<PublishedRubric, 'criteria'>, run: Pick<EvaluationRun, 'outcome' | 'criteria'>): { readonly holds: boolean; readonly reason: string } {
  if (run.outcome === 'blocked_by_checks') return { holds: false, reason: 'a blocking integrity check did not pass' };
  for (const g of rubric.criteria.filter((c) => (c.kind ?? 'skill_evidence') === 'gate')) {
    const s = run.criteria.find((x) => x.criterionId === g.key);
    if (!s || s.score < g.maxScore - EPS) return { holds: false, reason: `the gate '${g.key}' is not met` };
  }
  return { holds: true, reason: 'gates and blocking checks passed' };
}

/**
 * ENG-1 P3 (O-3): a threshold fraction t is usable only when t × max is a score the criterion can actually be given —
 * an integer (scores are integers) and, when the rubric defines scoring levels, the score of one of them.
 */
export function thresholdRepresentable(threshold: number, maxScore: number, levelScores?: readonly number[] | null): boolean {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1 || !(maxScore > 0)) return false;
  const required = threshold * maxScore;
  if (Math.abs(required - Math.round(required)) > EPS) return false;
  return !levelScores || levelScores.length === 0 || levelScores.some((l) => Math.abs(l - required) <= EPS);
}

function criterionResult(c: PublishedRubric['criteria'][number], run: EvaluationRun): SkillCriterionResult {
  const scored = run.criteria.find((x) => x.criterionId === c.key);
  const pending = run.pendingHumanCriteria.includes(c.key) || scored === undefined;
  const threshold = c.thresholdForSkill ?? null;
  const thresholdStatus = c.thresholdStatus ?? null;
  const base = { key: c.key, evaluatorKind: (c.evaluatorType ?? 'rule'), score: pending ? null : scored!.score, maxScore: c.maxScore, threshold, thresholdStatus };
  if (pending) return { ...base, status: 'pending' };
  const usable = thresholdStatus === 'approved' && threshold !== null && thresholdRepresentable(threshold, c.maxScore, c.levelScores);
  if (!usable) return { ...base, status: 'threshold_unapproved' };
  return { ...base, status: scored!.score + EPS >= threshold! * c.maxScore ? 'met' : 'not_met' };
}

/** One skill's assessment. Pure. */
export function assessSkill(input: SkillAssessmentInput, skillId: string): SkillAssessment {
  const canon = input.canonicalOf ?? ((s: string) => s);
  const { rubric, run } = input;
  if (rubric.proposesState === 'verified') throw new InvariantViolation('INV-9', 'a rubric may not propose Verified');
  const context: SkillAssessmentContext = { modelVersion: PER_SKILL_MODEL_VERSION, rubricVersionId: rubric.rubricVersionId, rubricVersion: rubric.version, activitySpecId: rubric.activitySpecId, activitySpecVersion: rubric.activitySpecVersion };
  const currentState = input.currentStates[skillId] ?? 'gap';
  const claimed = input.claimedSkillIds.map(canon).includes(skillId);
  const applicable = applicableCriteria(rubric, skillId, canon);
  const criteria = applicable.map((c) => criterionResult(c, run));
  const basis = assessmentBasis({ rubric: { criteria: applicable }, artifacts: input.artifacts, humanDecidedCriteria: input.humanDecidedCriteria,
    rubricValuesApproved: input.rubricValuesApproved, rubricIsDemo: input.rubricIsDemo });
  const confs = applicable.map((c) => run.criteria.find((x) => x.criterionId === c.key)?.confidence).filter((x): x is number => typeof x === 'number');
  const confidence = confs.length ? Math.min(...confs) : null;
  const done = (outcome: SkillAssessmentOutcome, reason: string): SkillAssessment => {
    const proposedState = outcome === 'met' && evidenceOrdinal(rubric.proposesState) > evidenceOrdinal(currentState) ? rubric.proposesState : null;
    return { skillId, claimed, outcome, criteria, basis, confidence, currentState, proposedState, reason: `${reason} (${PER_SKILL_MODEL_VERSION})`, context };
  };

  const pre = sharedPrecondition(rubric, run);
  if (!pre.holds) return done('blocked', `blocked: ${pre.reason}`);
  if (applicable.length === 0) return done('not_assessed', 'no valid criterion of this rubric measures this skill');
  const by = (s: SkillCriterionStatus) => criteria.filter((c) => c.status === s).map((c) => c.key);
  if (by('not_met').length) return done('not_met', `criteria of this skill not met: ${by('not_met').join(', ')}`);
  if (by('pending').length) return done('incomplete', `criteria of this skill still undecided: ${by('pending').join(', ')}`);
  if (by('threshold_unapproved').length) return done('incomplete', `no approved, representable per-skill threshold for: ${by('threshold_unapproved').join(', ')}`);
  return done('met', `every criterion of this skill met its approved threshold: ${by('met').join(', ')}`);
}

/** One assessment per distinct canonical skill (INV-PS5), sorted by skill id. Pure. */
export function assessSkills(input: SkillAssessmentInput): readonly SkillAssessment[] {
  const canon = input.canonicalOf ?? ((s: string) => s);
  return [...new Set(input.skillIds.map(canon))].sort().map((s) => assessSkill(input, s));
}

/** Runtime check of the invariants a single assessment must satisfy (INV-PS2, INV-9, criterion ownership). */
export function assertSkillAssessmentInvariants(a: SkillAssessment, rubric: Pick<PublishedRubric, 'criteria'>, canonicalOf: (s: string) => string = (s) => s): void {
  if (a.proposedState !== null && a.outcome !== 'met') throw new DomainError(`INV-PS2: skill ${a.skillId}: a ${a.outcome} assessment carries a proposal`);
  if (a.proposedState === 'verified') throw new InvariantViolation('INV-9', 'a per-skill assessment may not propose Verified');
  if (a.outcome === 'met' && (a.criteria.length === 0 || a.criteria.some((c) => c.status !== 'met'))) throw new DomainError(`INV-PS1: skill ${a.skillId}: met without every own criterion met`);
  const own = new Set(applicableCriteria(rubric, a.skillId, canonicalOf).map((c) => c.key));
  for (const c of a.criteria) if (!own.has(c.key)) throw new DomainError(`INV-PS1: skill ${a.skillId}: cites criterion '${c.key}' that does not measure it`);
}

/** Idempotency key: one per (evaluation result, canonical skill). */
export function skillAssessmentKey(evaluationResultId: string, skillId: string): string { return `${evaluationResultId}:${skillId}`; }

/**
 * Standing evidence for a skill, for the decision's evidence-count input: distinct evaluation results with
 * non-withdrawn evidence. A duplicate row from the same result counts once; withdrawn (revoked) evidence never counts.
 */
export function standingEvidenceForSkill(rows: readonly { readonly skillId: string; readonly evaluationResultId: string | null; readonly withdrawnAt: string | null }[], skillId: string): number {
  return new Set(rows.filter((r) => r.skillId === skillId && r.withdrawnAt === null && r.evaluationResultId !== null).map((r) => r.evaluationResultId)).size;
}

/**
 * The policy decision for ONE skill, from that skill's assessment only.
 * H6 must stay off: a policy with per-skill derivation enabled is refused (the two are mutually exclusive).
 * Unclaimed skills, and every outcome but `met` with a proposal, are recorded as not_applicable with the reason.
 */
export function decideSkillAssessment(policy: VerificationPolicy, a: SkillAssessment, ctx: {
  readonly independentEvidenceCount: number | null; readonly production: boolean; readonly evaluatorKind: AssessmentEvaluatorKind;
}): PolicyDecision {
  if (policy.perSkillEvidenceDerivation) {
    throw new DomainError(`ENG-1: policy ${policy.key}@${policy.version} enables H6 per-skill derivation; per-skill assessment refuses to run beside it`);
  }
  // ENG-1 P3: the per-skill pathway is development-only. In production it never decides a level, whatever the policy says.
  if (ctx.production) {
    throw new DomainError(`ENG-1 P3: the per-skill assessment pathway is not available in production (policy ${policy.key}@${policy.version})`);
  }
  const policyRef = { id: policy.id, key: policy.key, version: policy.version, status: policy.reviewStatus };
  const hold = (reason: string): PolicyDecision => ({ decision: 'not_applicable', resultingState: a.currentState, previousState: a.currentState, proposedState: a.proposedState,
    reason: `skill ${a.skillId}: ${reason} (policy ${policy.key}@${policy.version})`, legacyOutcome: null, decidedByKind: 'policy', policyRef });
  if (!a.claimed) return hold('not claimed on this submission; assessed for the record only');
  if (a.outcome !== 'met') return hold(a.reason);
  if (a.proposedState === null) return hold(`met, and already at '${a.currentState}'; no promotion is earned`);
  return decideWithPolicy(policy, {
    evaluationOutcome: 'passed', proposedState: a.proposedState, currentState: a.currentState, assessmentEvaluatorKind: ctx.evaluatorKind,
    assessmentConfidence: a.confidence, independentEvidenceCount: ctx.independentEvidenceCount, basis: a.basis, production: ctx.production,
    reason: `skill ${a.skillId}: ${a.reason}`,
  });
}
