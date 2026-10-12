import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPositiveVerificationDecision, skillsWithPositiveVerificationDecision, claimEligibility, assertSubmissionPromotionNotEnabled, submissionPromotionInEffect,
  DomainError, type RecordedVerificationDecisionFact, type ClaimPolicy, type ClaimSubject,
} from './index.js';

const fact = (over: Partial<RecordedVerificationDecisionFact> = {}): RecordedVerificationDecisionFact => ({
  skillId: 's1', decision: 'accepted', resultingState: 'demonstrated', evidenceId: 'e1', evidenceSkillId: 's1', evidenceStanding: true, overridden: false, ...over,
});

describe('CLM-1 — only a positive verification decision supports a claim', () => {
  test('an accepted decision that produced standing evidence for the same skill qualifies; so does a re-establishment', () => {
    assert.equal(isPositiveVerificationDecision(fact()), true);
    assert.equal(isPositiveVerificationDecision(fact({ decision: 'evidence_reestablished' })), true);
  });
  for (const decision of ['not_applicable', 'assessment_pending_validation', 'rejected', 'downgraded', 'escalated_to_human', 'exception_granted', 'blocked', 'pending']) {
    test(`'${decision}' never qualifies, even with an evidence id`, () => {
      assert.equal(isPositiveVerificationDecision(fact({ decision })), false);
    });
  }
  test('withdrawn evidence, missing evidence, evidence of another skill, a human override, or a gap result never qualify', () => {
    assert.equal(isPositiveVerificationDecision(fact({ evidenceStanding: false })), false);
    assert.equal(isPositiveVerificationDecision(fact({ evidenceId: null, evidenceSkillId: null })), false);
    assert.equal(isPositiveVerificationDecision(fact({ evidenceSkillId: 's2' })), false);
    assert.equal(isPositiveVerificationDecision(fact({ overridden: true })), false);
    assert.equal(isPositiveVerificationDecision(fact({ resultingState: 'gap' })), false);
  });
  test('the set keeps only positive skills', () => {
    const set = skillsWithPositiveVerificationDecision([fact(), fact({ skillId: 's2', evidenceSkillId: 's2', decision: 'not_applicable' }), fact({ skillId: 's3', evidenceSkillId: 's3', decision: 'rejected' })]);
    assert.deepEqual([...set], ['s1']);
  });
  test('a policy requiring a verification decision is NOT satisfied by a not_applicable decision (the CLM-1 reproduction)', () => {
    const policy: ClaimPolicy = { id: 'p', key: 'k', version: 1, reviewStatus: 'approved', activation: 'production_active', baselineOf: null, approvedBy: 'x',
      claimKind: 'cv_bullet', minEvidenceLevel: 'demonstrated', minEvidenceCount: null, minSourceStrength: null, requiresVerificationDecision: true, requiresUserApproval: true, lockUntilGrounded: true } as ClaimPolicy;
    const subject = (decided: Set<string>): ClaimSubject => ({
      assertedSkills: [{ skillId: 's1', state: 'demonstrated' }], citedEvidence: [{ evidenceId: 'e1', skillId: 's1', state: 'demonstrated', sourceStrength: 'platform_controlled', standing: true }],
      standingEvidenceCount: { s1: 1 }, skillsWithVerificationDecision: decided,
    });
    const onlyNotApplicable = skillsWithPositiveVerificationDecision([fact({ decision: 'not_applicable', evidenceId: null, evidenceSkillId: null })]);
    const r = claimEligibility('cv_bullet', { policy, resolution: 'production_active' }, subject(onlyNotApplicable));
    assert.equal(r.status, 'not_eligible');
    assert.ok(r.status === 'not_eligible' && r.reasons.some((x) => x.code === 'verification_decision_missing'));
    assert.equal(claimEligibility('cv_bullet', { policy, resolution: 'production_active' }, subject(skillsWithPositiveVerificationDecision([fact()]))).status, 'eligible');
  });
});

describe('Phase A — submission-based promotion is never validated or active', () => {
  const p = { key: 'default', version: 9, practicedOnSubmission: true };
  test('approval, publication, production activation and the baseline are refused', () => {
    for (const t of [{ reviewStatus: 'approved' }, { reviewStatus: 'published' }, { activation: 'production_active' }, { activation: 'legacy_baseline' }]) {
      assert.throws(() => assertSubmissionPromotionNotEnabled(p, t), DomainError, JSON.stringify(t));
    }
  });
  test('an inactive or development-only draft is allowed (history, e2e harness); a policy without the switch is always allowed', () => {
    assert.doesNotThrow(() => assertSubmissionPromotionNotEnabled(p, { reviewStatus: 'draft', activation: 'development_only' }));
    assert.doesNotThrow(() => assertSubmissionPromotionNotEnabled(p, { activation: 'inactive' }));
    assert.doesNotThrow(() => assertSubmissionPromotionNotEnabled({ ...p, practicedOnSubmission: false }, { reviewStatus: 'approved', activation: 'production_active' }));
  });
  test('in effect only outside production, under an unvalidated policy that enables it', () => {
    assert.equal(submissionPromotionInEffect({ practicedOnSubmission: true, reviewStatus: 'draft' }, { production: false }), true);
    assert.equal(submissionPromotionInEffect({ practicedOnSubmission: true, reviewStatus: 'draft' }, { production: true }), false);
    assert.equal(submissionPromotionInEffect({ practicedOnSubmission: true, reviewStatus: 'approved' }, { production: false }), false);
    assert.equal(submissionPromotionInEffect({ practicedOnSubmission: false, reviewStatus: 'draft' }, { production: false }), false);
  });
});
