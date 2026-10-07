/**
 * Phase 4 — activation model, assessment context, claim/challenge policies, TrackSkill badges.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveActiveConfig, assertActivationAllowed, configIsValidated, buildAssessmentContext, assertContextPolicySane, assertClaimPolicySane,
  challengePolicyWouldTrigger, trackSkillBadge, trackSkillConfigFromSnapshot, CLAIM_POLICY_CONSUMED, CHALLENGE_RUNNER_EXISTS, READINESS_RULES_EXIST,
  DomainError, InvariantViolation, MissingPrerequisite, type GovernedConfig, type AssessmentContextPolicy, type ClaimPolicy,
} from './index.js';

const row = (over: Partial<GovernedConfig>): GovernedConfig => ({ id: 'x', key: 'default', version: 1, reviewStatus: 'draft', activation: 'inactive', baselineOf: null, approvedBy: null, ...over });
const baseline = row({ id: 'b', version: 1, activation: 'legacy_baseline', baselineOf: 'pre_0013' });
const draftDev = row({ id: 'd', version: 2, activation: 'development_only' });
const approvedProd = row({ id: 'p', version: 3, activation: 'production_active', reviewStatus: 'approved', approvedBy: 'sme-1' });

describe('activation resolution — production never runs an ordinary draft', () => {
  test('production: production_active, else the legacy baseline, never development_only or inactive', () => {
    assert.equal(resolveActiveConfig([baseline, draftDev, row({ id: 'i' })], { production: true }).row?.id, 'b');
    assert.equal(resolveActiveConfig([baseline, draftDev, approvedProd], { production: true }).row?.id, 'p');
    const none = resolveActiveConfig([draftDev, row({ id: 'i' })], { production: true });
    assert.equal(none.row, null); assert.match(none.resolution === 'none' ? none.reason : '', /no validated production configuration/);
  });
  test('outside production: production_active, then development_only, then the baseline', () => {
    assert.equal(resolveActiveConfig([baseline, draftDev], { production: false }).row?.id, 'd');
    assert.equal(resolveActiveConfig([baseline], { production: false }).resolution, 'legacy_baseline');
    assert.equal(resolveActiveConfig([baseline, draftDev, approvedProd], { production: false }).row?.id, 'p');
  });
  test('NEGATIVE: a production_active row that is not validated, or a baseline without baseline_of, is refused; two of a rank is a data error', () => {
    assert.throws(() => resolveActiveConfig([row({ activation: 'production_active' })], { production: true }), InvariantViolation);
    assert.throws(() => resolveActiveConfig([row({ activation: 'legacy_baseline' })], { production: true }), InvariantViolation);
    assert.throws(() => resolveActiveConfig([baseline, { ...baseline, id: 'b2' }], { production: true }), DomainError);
  });
  test('activation changes: production_active needs approval; a draft can never become a baseline; development_only is refused in production', () => {
    assert.throws(() => assertActivationAllowed({ from: 'inactive', to: 'production_active', reviewStatus: 'draft', approvedBy: null, baselineOf: null, production: false }), MissingPrerequisite);
    assert.throws(() => assertActivationAllowed({ from: 'inactive', to: 'production_active', reviewStatus: 'approved', approvedBy: null, baselineOf: null, production: false }), MissingPrerequisite);
    assert.doesNotThrow(() => assertActivationAllowed({ from: 'inactive', to: 'production_active', reviewStatus: 'approved', approvedBy: 'sme', baselineOf: null, production: true }));
    assert.throws(() => assertActivationAllowed({ from: 'inactive', to: 'legacy_baseline', reviewStatus: 'draft', approvedBy: null, baselineOf: null, production: false }), InvariantViolation);
    assert.throws(() => assertActivationAllowed({ from: 'inactive', to: 'development_only', reviewStatus: 'draft', approvedBy: null, baselineOf: null, production: true }), DomainError);
    assert.doesNotThrow(() => assertActivationAllowed({ from: 'inactive', to: 'development_only', reviewStatus: 'draft', approvedBy: null, baselineOf: null, production: false }));
    assert.equal(configIsValidated(baseline), false, 'a baseline is NOT validated; it is merely pre-existing');
  });
});

describe('assessment context — identity never passes', () => {
  const policy: AssessmentContextPolicy = { ...row({ activation: 'legacy_baseline', baselineOf: 'pre_0014' }), inputs: { submission_artifacts: 'required', evidence_items: 'optional', ai_disclosure: 'required', previous_attempts: 'optional', human_review_decisions: 'optional', user_identity: 'excluded', user_profile: 'excluded' } };
  test('required present, optional omitted when absent, identity excluded even if offered', () => {
    const ctx = buildAssessmentContext(policy, { submission_artifacts: ['a'], ai_disclosure: { mode: 'ai_assisted' }, user_identity: { email: 'x' } as unknown, evidence_items: null });
    assert.deepEqual(Object.keys(ctx.included).sort(), ['ai_disclosure', 'submission_artifacts']);
    assert.ok(ctx.excluded.includes('user_identity') && ctx.excluded.includes('user_profile'));
    assert.deepEqual(ctx.omittedOptional.sort(), ['evidence_items', 'human_review_decisions', 'previous_attempts']);
    assert.equal(ctx.policyRef, 'default@1');
  });
  test('NEGATIVE: a missing required input is a named error; a policy that includes identity is unrepresentable', () => {
    assert.throws(() => buildAssessmentContext(policy, { ai_disclosure: {} }), MissingPrerequisite);
    assert.throws(() => assertContextPolicySane({ ...policy.inputs, user_identity: 'optional' }), InvariantViolation);
    assert.throws(() => assertContextPolicySane({ ...policy.inputs, telepathy: 'required' }), DomainError);
    assert.throws(() => assertContextPolicySane({ ...policy.inputs, evidence_items: 'maybe' }), DomainError);
  });
});

describe('claim and challenge policies are recorded, not consumed', () => {
  test('a claim policy can never waive user approval; constants state the gaps', () => {
    const cp: ClaimPolicy = { ...row({}), claimKind: 'cv_bullet', minEvidenceLevel: 'demonstrated', minEvidenceCount: null, requiresVerificationDecision: false, requiresUserApproval: true, lockUntilGrounded: true };
    assert.doesNotThrow(() => assertClaimPolicySane(cp));
    assert.throws(() => assertClaimPolicySane({ ...cp, requiresUserApproval: false as unknown as true }), InvariantViolation);
    assert.throws(() => assertClaimPolicySane({ ...cp, minEvidenceCount: 0 }), DomainError);
    assert.equal(CLAIM_POLICY_CONSUMED, false); assert.equal(CHALLENGE_RUNNER_EXISTS, false); assert.equal(READINESS_RULES_EXIST, false);
  });
  test('a challenge policy is inert while inactive or without a trigger', () => {
    const base = { ...row({ activation: 'development_only' }), triggerRule: {}, challengeTypes: ['explanation_question'], maxChallenges: null };
    assert.equal(challengePolicyWouldTrigger(base, { production: false }), false);
    assert.equal(challengePolicyWouldTrigger({ ...base, triggerRule: { on: 'low_confidence' } }, { production: true }), false, 'development_only never triggers in production');
    assert.equal(challengePolicyWouldTrigger({ ...base, triggerRule: { on: 'low_confidence' } }, { production: false }), true);
  });
});

describe('TrackSkill classification is shown only once approved', () => {
  test('badges', () => {
    assert.equal(trackSkillBadge({ isCore: true, classificationStatus: 'pending_expert_validation', enabled: true }), 'pending_expert_validation');
    assert.equal(trackSkillBadge({ isCore: true, classificationStatus: 'proposed', enabled: true }), 'pending_expert_validation');
    assert.equal(trackSkillBadge({ isCore: true, classificationStatus: 'approved', enabled: true }), 'core');
    assert.equal(trackSkillBadge({ isCore: false, classificationStatus: 'approved', enabled: true }), 'supporting');
    assert.equal(trackSkillBadge({ isCore: true, classificationStatus: 'approved', enabled: false }), 'disabled');
  });
  test('snapshot elements are typed and unknown values refused', () => {
    const c = trackSkillConfigFromSnapshot({ role_requirement_id: 'r', skill_id: 's', is_core: true, importance: 'high', category: null, display_order: 2, expected_level: null, readiness_contribution: null, enabled: true, classification_status: 'pending_expert_validation', minimum_evidence_count: 2, review_status: 'draft', version: 1 });
    assert.equal(c.displayOrder, 2); assert.equal(c.minimumEvidenceCount, 2); assert.equal(c.classificationStatus, 'pending_expert_validation');
    assert.throws(() => trackSkillConfigFromSnapshot({ ...c, classification_status: 'core' }), DomainError);
    assert.throws(() => trackSkillConfigFromSnapshot({ role_requirement_id: 'r', skill_id: 's', classification_status: 'approved', readiness_contribution: 'weight', review_status: 'draft' }), DomainError);
  });
});
