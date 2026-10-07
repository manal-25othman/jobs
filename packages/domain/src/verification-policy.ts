/**
 * Verification policy (Configurable Track Architecture, Phase 3).
 *
 * Three concepts, kept apart:
 *
 *   Assessment             what an evaluator OBSERVED (scores, evidence used or
 *                          missing, confidence, raw result, versions).
 *   Verification decision  what a POLICY — or a named human — DECIDED about an
 *                          assessment: the resulting state and why.
 *   Claim transition       the ladder move the application writes afterwards.
 *
 * What is fixed here (invariants):
 *   - an llm (or any agent) never decides a level; a policy that names one is
 *     refused, and an assessment produced by an llm cannot be decided on
 *     by itself (INV-3).
 *   - verification lowers or holds; it never raises above the proposal and
 *     never demotes (`decideVerification`, INV-9).
 *   - the production ceiling (D-059 / D-102) stays in code.
 *   - every decision names the policy key, version and status it used.
 *
 * What is data (DRAFT / NOT VALIDATED until an expert approves):
 *   - which outcomes a decision applies to, whether the rubric's proposal is
 *     accepted, any cap, a confidence floor, an evidence-count floor,
 *     escalation, the blocking rule, per-skill derivation.
 *
 * `DRAFT_DEFAULT_POLICY_EQUALS_LEGACY` is tested: with the seeded draft
 * values the decision is identical to the pre-Phase-3 behaviour.
 */

import { DomainError, InvariantViolation, MissingPrerequisite } from './errors.js';
import { EVALUATION_OUTCOMES, type EvaluationOutcome, type VerificationOutcome } from './evaluation.js';
import { EVIDENCE_STATES, evidenceOrdinal, type EvidenceState } from './evidence-state.js';
import { decideVerification, verificationApplies } from './verification.js';

export const DECISION_ACTOR_KINDS = ['policy', 'human'] as const;
export type DecisionActorKind = (typeof DECISION_ACTOR_KINDS)[number];

export const ASSESSMENT_EVALUATOR_KINDS = ['rule', 'human', 'llm'] as const;
export type AssessmentEvaluatorKind = (typeof ASSESSMENT_EVALUATOR_KINDS)[number];

export const BLOCKING_RULES = ['mandatory_criteria_unmet_blocks', 'threshold_only'] as const;
export type BlockingRule = (typeof BLOCKING_RULES)[number];

export interface VerificationPolicy {
  id: string;
  key: string;
  version: number;
  reviewStatus: string;
  appliesOutcomes: readonly EvaluationOutcome[];
  acceptRubricProposal: boolean;
  maxResultingState: EvidenceState | null;
  minAssessmentConfidence: number | null;
  minIndependentEvidence: number | null;
  escalateOn: Readonly<Record<string, unknown>>;
  blockingRule: BlockingRule;
  perSkillEvidenceDerivation: boolean;
  decisionActors: readonly DecisionActorKind[];
}

export function assertVerificationPolicySane(p: VerificationPolicy): void {
  if (p.version < 1) throw new DomainError(`policy ${p.key}: version must be >= 1`);
  for (const a of p.decisionActors) {
    if (!(DECISION_ACTOR_KINDS as readonly string[]).includes(a)) {
      throw new InvariantViolation('INV-3', `policy ${p.key}@${p.version} names '${a}' as a decision actor; only a policy or a named human may decide a level — never an llm or an agent`);
    }
  }
  if (p.decisionActors.length === 0) throw new DomainError(`policy ${p.key}@${p.version} names no decision actor`);
  for (const o of p.appliesOutcomes) if (!(EVALUATION_OUTCOMES as readonly string[]).includes(o)) throw new DomainError(`policy ${p.key}: unknown outcome '${o}'`);
  if (p.maxResultingState !== null && !(EVIDENCE_STATES as readonly string[]).includes(p.maxResultingState)) throw new DomainError(`policy ${p.key}: unknown max state '${p.maxResultingState}'`);
  if (p.minAssessmentConfidence !== null && (p.minAssessmentConfidence < 0 || p.minAssessmentConfidence > 1)) throw new DomainError(`policy ${p.key}: confidence floor must be within [0,1]`);
  if (p.minIndependentEvidence !== null && (p.minIndependentEvidence < 1 || !Number.isInteger(p.minIndependentEvidence))) throw new DomainError(`policy ${p.key}: evidence floor must be a positive integer`);
  if (!(BLOCKING_RULES as readonly string[]).includes(p.blockingRule)) throw new DomainError(`policy ${p.key}: unknown blocking rule '${p.blockingRule}'`);
}

export function verificationPolicyFromRow(r: {
  id: string; key: string; version: number | string; review_status: string; applies_outcomes: string[]; accept_rubric_proposal: boolean;
  max_resulting_state: string | null; min_assessment_confidence: string | number | null; min_independent_evidence: number | string | null;
  escalate_on: unknown; blocking_rule: string; per_skill_evidence_derivation: boolean; decision_actors: string[];
}): VerificationPolicy {
  const p: VerificationPolicy = {
    id: r.id, key: r.key, version: Number(r.version), reviewStatus: r.review_status,
    appliesOutcomes: r.applies_outcomes as EvaluationOutcome[], acceptRubricProposal: r.accept_rubric_proposal,
    maxResultingState: (r.max_resulting_state as EvidenceState | null) ?? null,
    minAssessmentConfidence: r.min_assessment_confidence === null ? null : Number(r.min_assessment_confidence),
    minIndependentEvidence: r.min_independent_evidence === null ? null : Number(r.min_independent_evidence),
    escalateOn: (r.escalate_on && typeof r.escalate_on === 'object' ? r.escalate_on : {}) as Record<string, unknown>,
    blockingRule: r.blocking_rule as BlockingRule, perSkillEvidenceDerivation: r.per_skill_evidence_derivation,
    decisionActors: r.decision_actors as DecisionActorKind[],
  };
  assertVerificationPolicySane(p);
  return p;
}

export function verificationPolicyIsValidated(p: Pick<VerificationPolicy, 'reviewStatus'>): boolean {
  return p.reviewStatus === 'approved' || p.reviewStatus === 'published';
}

export type PolicyDecisionKind = VerificationOutcome | 'not_applicable';

export interface PolicyDecisionInput {
  readonly evaluationOutcome: EvaluationOutcome;
  /** The state the rubric proposes, or null when the run earned no promotion. */
  readonly proposedState: EvidenceState | null;
  readonly currentState: EvidenceState;
  readonly assessmentEvaluatorKind: AssessmentEvaluatorKind;
  readonly assessmentConfidence: number | null;
  /** Standing independent evidence for the skill before this run, when known. */
  readonly independentEvidenceCount: number | null;
  readonly reason: string;
}

export interface PolicyDecision {
  readonly decision: PolicyDecisionKind;
  readonly resultingState: EvidenceState;
  readonly previousState: EvidenceState;
  readonly proposedState: EvidenceState | null;
  readonly reason: string;
  /** Set when a legacy `verification` row must be written (the decision is a verification outcome). */
  readonly legacyOutcome: VerificationOutcome | null;
  readonly decidedByKind: 'policy';
  readonly policyRef: { id: string; key: string; version: number; status: string };
}

/**
 * Pure: f(policy, assessment facts) → decision. With the seeded draft default
 * this reproduces the pre-Phase-3 behaviour exactly (tested).
 */
export function decideWithPolicy(policy: VerificationPolicy, input: PolicyDecisionInput): PolicyDecision {
  assertVerificationPolicySane(policy);
  if (!input.reason || input.reason.trim() === '') throw new MissingPrerequisite('reason', 'a verification decision with no recorded reason is not a decision');
  if (input.assessmentEvaluatorKind === 'llm') {
    throw new InvariantViolation('INV-3', 'an assessment produced by an llm cannot decide a verification level by itself; a policy over rule/human facts or a named human must decide');
  }
  const policyRef = { id: policy.id, key: policy.key, version: policy.version, status: policy.reviewStatus };
  const hold = (decision: PolicyDecisionKind, reason: string, legacy: VerificationOutcome | null): PolicyDecision => ({
    decision, resultingState: input.currentState, previousState: input.currentState, proposedState: input.proposedState, reason, legacyOutcome: legacy, decidedByKind: 'policy', policyRef,
  });

  // 1. Does a verification step apply at all? (legacy: verificationApplies ∧ proposedState)
  if (!policy.appliesOutcomes.includes(input.evaluationOutcome) || input.proposedState === null) {
    return hold('not_applicable', `no verification step: outcome '${input.evaluationOutcome}'${input.proposedState === null ? ', no promotion proposed' : ''} (policy ${policy.key}@${policy.version})`, null);
  }
  // 2. Expert knobs — all null/off in the draft default, so none of these fire today.
  if (policy.minAssessmentConfidence !== null && (input.assessmentConfidence === null || input.assessmentConfidence < policy.minAssessmentConfidence)) {
    return hold('escalated_to_human', `assessment confidence ${input.assessmentConfidence ?? 'unknown'} is below the policy floor ${policy.minAssessmentConfidence}; held for a human (policy ${policy.key}@${policy.version})`, null);
  }
  if (policy.minIndependentEvidence !== null && (input.independentEvidenceCount === null || input.independentEvidenceCount + 1 < policy.minIndependentEvidence)) {
    return hold('downgraded', `evidence sufficiency not met: policy ${policy.key}@${policy.version} requires ${policy.minIndependentEvidence} independent evidence(s)`, 'downgraded');
  }
  if (!policy.acceptRubricProposal) {
    return hold('downgraded', `policy ${policy.key}@${policy.version} does not accept rubric proposals automatically`, 'downgraded');
  }
  // 3. Accept the proposal (legacy path), capped by the policy when it declares a cap.
  let target = input.proposedState;
  if (policy.maxResultingState !== null && evidenceOrdinal(target) > evidenceOrdinal(policy.maxResultingState)) target = policy.maxResultingState;
  if (evidenceOrdinal(target) <= evidenceOrdinal(input.currentState)) {
    return hold('downgraded', `policy cap '${policy.maxResultingState}' leaves no promotion above '${input.currentState}'`, 'downgraded');
  }
  const legacy = decideVerification({ evaluationOutcome: input.evaluationOutcome, proposedState: target, currentState: input.currentState, outcome: 'accepted', reason: input.reason });
  return {
    decision: 'accepted', resultingState: legacy.resultingState, previousState: input.currentState, proposedState: input.proposedState,
    reason: legacy.reason, legacyOutcome: 'accepted', decidedByKind: 'policy', policyRef,
  };
}

/** The pre-Phase-3 rule, as one function, for the equivalence test and for readers. */
export function legacyVerificationDecision(input: Pick<PolicyDecisionInput, 'evaluationOutcome' | 'proposedState' | 'currentState' | 'reason'>): { applies: boolean; resultingState: EvidenceState } {
  if (input.proposedState && verificationApplies(input.evaluationOutcome)) {
    const d = decideVerification({ evaluationOutcome: input.evaluationOutcome, proposedState: input.proposedState, currentState: input.currentState, outcome: 'accepted', reason: input.reason });
    return { applies: true, resultingState: d.resultingState };
  }
  return { applies: false, resultingState: input.currentState };
}

/** Status of a criterion in a structured assessment, from its score. A human criterion not yet decided is pending. */
export const CRITERION_RESULT_STATUSES = ['met', 'partially_met', 'not_met', 'pending_human', 'not_applicable'] as const;
export type CriterionResultStatus = (typeof CRITERION_RESULT_STATUSES)[number];
export function criterionResultStatus(p: { score: number; maxScore: number; pendingHuman: boolean }): CriterionResultStatus {
  if (p.pendingHuman) return 'pending_human';
  if (p.maxScore <= 0) return 'not_applicable';
  if (p.score >= p.maxScore) return 'met';
  return p.score > 0 ? 'partially_met' : 'not_met';
}

/** Assessment confidence is the weakest criterion confidence: a fact aggregation, not a threshold. */
export function assessmentConfidence(confidences: readonly (number | null | undefined)[]): number | null {
  const known = confidences.filter((c): c is number => typeof c === 'number');
  return known.length === 0 ? null : Math.min(...known);
}
