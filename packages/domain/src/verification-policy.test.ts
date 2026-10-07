/**
 * Phase 3 — the draft default policy reproduces the legacy decision exactly;
 * expert knobs are inert until set; an llm never decides.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideWithPolicy, legacyVerificationDecision, verificationPolicyFromRow, assertVerificationPolicySane, criterionResultStatus, assessmentConfidence,
  verificationPolicyIsValidated, EVALUATION_OUTCOMES, EVIDENCE_STATES, evidenceOrdinal,
  DomainError, InvariantViolation, MissingPrerequisite, type VerificationPolicy, type EvidenceState, type EvaluationOutcome,
} from './index.js';

/** The seeded draft row of 0013, as the domain sees it. */
const DRAFT_DEFAULT: VerificationPolicy = {
  id: 'p1', key: 'default', version: 1, reviewStatus: 'draft', appliesOutcomes: ['passed'], acceptRubricProposal: true, maxResultingState: null,
  minAssessmentConfidence: null, minIndependentEvidence: null, escalateOn: {}, blockingRule: 'mandatory_criteria_unmet_blocks', perSkillEvidenceDerivation: false, decisionActors: ['policy', 'human'],
};

describe('DRAFT default policy == legacy behaviour (exhaustive over outcomes × proposed × current)', () => {
  test('identical applicability and resulting state in every combination', () => {
    let combos = 0;
    for (const outcome of EVALUATION_OUTCOMES) for (const proposed of [null, ...EVIDENCE_STATES] as (EvidenceState | null)[]) for (const current of EVIDENCE_STATES) {
      // The evaluator never proposes a state at or below the current one; those inputs cannot occur, and the legacy rule throws INV-9 on them.
      if (proposed !== null && evidenceOrdinal(proposed) <= evidenceOrdinal(current)) continue;
      const legacy = legacyVerificationDecision({ evaluationOutcome: outcome, proposedState: proposed, currentState: current, reason: 'r' });
      const d = decideWithPolicy(DRAFT_DEFAULT, { evaluationOutcome: outcome, proposedState: proposed, currentState: current, assessmentEvaluatorKind: 'rule', assessmentConfidence: 1, independentEvidenceCount: 0, reason: 'r' });
      assert.equal(d.legacyOutcome !== null, legacy.applies, `${outcome}/${proposed}/${current}: applicability`);
      assert.equal(d.resultingState, legacy.resultingState, `${outcome}/${proposed}/${current}: state`);
      assert.equal(d.decision, legacy.applies ? 'accepted' : 'not_applicable');
      if (legacy.applies) assert.equal(d.reason, 'r', 'the accepted reason is passed through unchanged (the legacy verification row keeps its text)');
      assert.deepEqual(d.policyRef, { id: 'p1', key: 'default', version: 1, status: 'draft' }, 'every decision names its policy');
      combos++;
    }
    assert.ok(combos >= 60);
  });
});

describe('expert knobs are inert until set, and do exactly one thing when set', () => {
  const passed = { evaluationOutcome: 'passed' as EvaluationOutcome, proposedState: 'demonstrated' as EvidenceState, currentState: 'practiced' as EvidenceState, assessmentEvaluatorKind: 'rule' as const, reason: 'r' };
  test('confidence floor → escalated_to_human (hold); evidence floor → downgraded (hold); cap → downgraded or capped', () => {
    const conf = decideWithPolicy({ ...DRAFT_DEFAULT, minAssessmentConfidence: 0.9 }, { ...passed, assessmentConfidence: 0.5, independentEvidenceCount: 0 });
    assert.equal(conf.decision, 'escalated_to_human'); assert.equal(conf.resultingState, 'practiced'); assert.equal(conf.legacyOutcome, null);
    const ev = decideWithPolicy({ ...DRAFT_DEFAULT, minIndependentEvidence: 2 }, { ...passed, assessmentConfidence: 1, independentEvidenceCount: 0 });
    assert.equal(ev.decision, 'downgraded'); assert.equal(ev.resultingState, 'practiced');
    const evOk = decideWithPolicy({ ...DRAFT_DEFAULT, minIndependentEvidence: 2 }, { ...passed, assessmentConfidence: 1, independentEvidenceCount: 1 });
    assert.equal(evOk.decision, 'accepted');
    const cap = decideWithPolicy({ ...DRAFT_DEFAULT, maxResultingState: 'practiced' }, { ...passed, assessmentConfidence: 1, independentEvidenceCount: 0 });
    assert.equal(cap.decision, 'downgraded');
    const capHigh = decideWithPolicy({ ...DRAFT_DEFAULT, maxResultingState: 'demonstrated' }, { ...passed, proposedState: 'verified', assessmentConfidence: 1, independentEvidenceCount: 0 });
    assert.equal(capHigh.resultingState, 'demonstrated');
    const noAuto = decideWithPolicy({ ...DRAFT_DEFAULT, acceptRubricProposal: false }, { ...passed, assessmentConfidence: 1, independentEvidenceCount: 0 });
    assert.equal(noAuto.decision, 'downgraded');
  });
  test('NEGATIVE: an llm never decides; a policy naming an llm/agent actor is refused; a reason is required', () => {
    assert.throws(() => decideWithPolicy(DRAFT_DEFAULT, { ...passed, assessmentEvaluatorKind: 'llm', assessmentConfidence: 1, independentEvidenceCount: 0 }), InvariantViolation);
    assert.throws(() => assertVerificationPolicySane({ ...DRAFT_DEFAULT, decisionActors: ['policy', 'llm' as never] }), InvariantViolation);
    assert.throws(() => assertVerificationPolicySane({ ...DRAFT_DEFAULT, decisionActors: [] }), DomainError);
    assert.throws(() => decideWithPolicy(DRAFT_DEFAULT, { ...passed, assessmentConfidence: 1, independentEvidenceCount: 0, reason: ' ' }), MissingPrerequisite);
    assert.throws(() => verificationPolicyFromRow({ id: 'x', key: 'k', version: 1, review_status: 'draft', applies_outcomes: ['passed'], accept_rubric_proposal: true, max_resulting_state: null, min_assessment_confidence: 2, min_independent_evidence: null, escalate_on: {}, blocking_rule: 'mandatory_criteria_unmet_blocks', per_skill_evidence_derivation: false, decision_actors: ['policy'] }), DomainError);
  });
});

describe('structured assessment helpers', () => {
  test('criterion status from score; pending human wins; confidence is the weakest criterion', () => {
    assert.equal(criterionResultStatus({ score: 1, maxScore: 1, pendingHuman: false }), 'met');
    assert.equal(criterionResultStatus({ score: 0.5, maxScore: 1, pendingHuman: false }), 'partially_met');
    assert.equal(criterionResultStatus({ score: 0, maxScore: 1, pendingHuman: false }), 'not_met');
    assert.equal(criterionResultStatus({ score: 0, maxScore: 1, pendingHuman: true }), 'pending_human');
    assert.equal(assessmentConfidence([1, 0.7, undefined]), 0.7);
    assert.equal(assessmentConfidence([]), null);
    assert.equal(verificationPolicyIsValidated(DRAFT_DEFAULT), false);
  });
});
