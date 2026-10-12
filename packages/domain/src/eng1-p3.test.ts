import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessSkill, decideSkillAssessment, thresholdRepresentable, assertVerificationPolicySane, verificationPolicyFromRow, assessmentScopeOf, DomainError,
  type PublishedRubric, type EvaluationRun, type SkillAssessmentInput, type VerificationPolicy, type RubricCriterion,
} from './index.js';

const crit = (key: string, skillId: string, o: Partial<RubricCriterion> = {}): RubricCriterion => ({
  key, label: key, maxScore: 2, kind: 'skill_evidence', skillId, mandatory: true, evaluatorType: 'human', check: null,
  rationaleWhenMet: '-', rationaleWhenUnmet: '-', thresholdForSkill: 0.5, thresholdStatus: 'approved', levelScores: [0, 1, 2], ...o,
});
const rubric = (criteria: RubricCriterion[]): PublishedRubric => ({
  rubricVersionId: 'rv1', version: 'rub@1', activitySpecId: 'act', activitySpecVersion: '1.0.0', status: 'published', passThreshold: 0.75, proposesState: 'demonstrated', criteria,
});
const run = (scores: Record<string, number>): EvaluationRun => ({
  outcome: 'passed', rubricVersion: 'rub@1', activitySpecVersion: '1.0.0',
  criteria: Object.entries(scores).map(([k, v]) => ({ criterionId: k, score: v, maxScore: 2, rationale: '-', supportingExcerpt: null, skillId: null, confidence: 1 })),
  integrityChecks: [], totalScore: 0, maxScore: 0, proposedState: null, reason: 'r', pendingHumanCriteria: [], deferredChecks: [],
});
const input = (r: PublishedRubric, scores: Record<string, number>): SkillAssessmentInput => ({
  rubric: r, run: run(scores), skillIds: ['html'], claimedSkillIds: ['html'], currentStates: {}, artifacts: [], humanDecidedCriteria: r.criteria.map((c) => c.key),
  rubricValuesApproved: true, rubricIsDemo: false,
});
const policy = (o: Partial<VerificationPolicy> = {}): VerificationPolicy => ({
  id: 'p', key: 'default', version: 950, reviewStatus: 'draft', appliesOutcomes: ['passed'], acceptRubricProposal: true, maxResultingState: null,
  minAssessmentConfidence: null, minIndependentEvidence: null, escalateOn: {}, blockingRule: 'mandatory_criteria_unmet_blocks', perSkillEvidenceDerivation: false,
  decisionActors: ['policy', 'human'], promotionBasis: 'independently_verified', practicedOnSubmission: false, assessmentScope: 'per_skill', ...o,
});

describe('ENG-1 P3 — threshold semantics: a fraction of the criterion maximum that the scoring scale can represent', () => {
  test('representable: t × max is an integer score and, with levels, one of the level scores', () => {
    assert.equal(thresholdRepresentable(0.5, 2, [0, 1, 2]), true);
    assert.equal(thresholdRepresentable(1, 1, [0, 1]), true);
    assert.equal(thresholdRepresentable(1, 2), true);
    assert.equal(thresholdRepresentable(0.75, 2, [0, 1, 2]), false, '1.5 is not a score a reviewer can give');
    assert.equal(thresholdRepresentable(0.333, 3), false);
    assert.equal(thresholdRepresentable(0.5, 4, [0, 1, 4]), false, '2 is an integer but not a level of this criterion');
    for (const t of [0, -0.5, 1.2, Number.NaN]) assert.equal(thresholdRepresentable(t, 2), false, String(t));
  });
  test('an approved but unrepresentable threshold leaves the skill incomplete — never met, never a full-marks fallback', () => {
    const r = rubric([crit('h1', 'html', { thresholdForSkill: 0.75 })]);
    const a = assessSkill(input(r, { h1: 2 }), 'html');
    assert.equal(a.outcome, 'incomplete'); assert.equal(a.proposedState, null);
    assert.equal(a.criteria[0]!.status, 'threshold_unapproved'); assert.match(a.reason, /representable/);
  });
  test('a proposed (unapproved) threshold leaves the skill incomplete: test-only outcome, no level', () => {
    const r = rubric([crit('h1', 'html', { thresholdStatus: 'proposed' })]);
    const a = assessSkill(input(r, { h1: 2 }), 'html');
    assert.equal(a.outcome, 'incomplete');
    const d = decideSkillAssessment(policy(), a, { independentEvidenceCount: 0, production: false, evaluatorKind: 'human' });
    assert.equal(d.decision, 'not_applicable'); assert.equal(d.resultingState, 'gap');
  });
  test('without approved rubric values (evidence requirements) a met skill earns no level', () => {
    const r = rubric([crit('h1', 'html')]);
    const a = assessSkill({ ...input(r, { h1: 2 }), rubricValuesApproved: false }, 'html');
    assert.equal(a.outcome, 'met'); assert.equal(a.basis.independentlyVerified, false);
    const d = decideSkillAssessment(policy(), a, { independentEvidenceCount: 0, production: false, evaluatorKind: 'human' });
    assert.equal(d.decision, 'assessment_pending_validation'); assert.equal(d.resultingState, 'gap');
  });
});

describe('ENG-1 P3 — the per-skill scope is a development-only pathway', () => {
  test('the per-skill decision refuses to run in production, whatever the policy', () => {
    const a = assessSkill(input(rubric([crit('h1', 'html')]), { h1: 2 }), 'html');
    assert.throws(() => decideSkillAssessment(policy(), a, { independentEvidenceCount: 0, production: true, evaluatorKind: 'human' }), DomainError);
    assert.equal(decideSkillAssessment(policy(), a, { independentEvidenceCount: 0, production: false, evaluatorKind: 'human' }).decision, 'accepted');
  });
  test('a per-skill policy never combines with H6, the legacy basis, or submission-based promotion', () => {
    assert.throws(() => assertVerificationPolicySane(policy({ perSkillEvidenceDerivation: true })), /mutually exclusive/);
    assert.throws(() => assertVerificationPolicySane(policy({ promotionBasis: 'legacy_any_pass' })), /independently_verified/);
    assert.throws(() => assertVerificationPolicySane(policy({ practicedOnSubmission: true })), /on submission/);
    assert.doesNotThrow(() => assertVerificationPolicySane(policy()));
  });
  test('a row without the column (history) reads as the legacy scope', () => {
    const base = { id: 'x', key: 'default', version: 2, review_status: 'draft', applies_outcomes: ['passed'], accept_rubric_proposal: true, max_resulting_state: null,
      min_assessment_confidence: null, min_independent_evidence: null, escalate_on: {}, blocking_rule: 'mandatory_criteria_unmet_blocks', per_skill_evidence_derivation: false,
      decision_actors: ['policy'] };
    assert.equal(assessmentScopeOf(verificationPolicyFromRow(base)), 'primary_claimed_skill');
    assert.equal(assessmentScopeOf(verificationPolicyFromRow({ ...base, assessment_scope: 'per_skill' })), 'per_skill');
  });
});
