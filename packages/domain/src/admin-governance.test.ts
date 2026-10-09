/**
 * Phase 8 — Admin Track Builder governance: authority separation, four eyes,
 * stages derived from real states, track-skill proposals, diffs, pending decisions.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAdminAction, assertFourEyes, governedStage, contentStage, trackChangeStage, assertTrackSkillProposal, diffFields, diffChildren,
  RULE_CATALOG, PENDING_EXPERT_DECISIONS, assetPresentableNow, InvariantViolation, DomainError,
} from './index.js';

describe('authority is separated; editing is not professional validation', () => {
  test('an administrator drafts but cannot validate, publish or activate', () => {
    assert.equal(assertAdminAction('draft', ['track_admin']), 'track_admin');
    for (const a of ['validate', 'activate', 'publish'] as const) assert.throws(() => assertAdminAction(a, ['track_admin']), InvariantViolation);
  });
  test('an SME validates but does not activate; a product owner activates but does not validate', () => {
    assert.equal(assertAdminAction('validate', ['sme']), 'sme');
    assert.throws(() => assertAdminAction('activate', ['sme']), InvariantViolation);
    assert.equal(assertAdminAction('activate', ['product_owner']), 'product_owner');
    assert.throws(() => assertAdminAction('validate', ['product_owner']), InvariantViolation);
    assert.throws(() => assertAdminAction('read', []), InvariantViolation);
  });
  test('four eyes', () => {
    assert.throws(() => assertFourEyes('u1', 'u1'), InvariantViolation);
    assert.doesNotThrow(() => assertFourEyes('u1', 'u2'));
    assert.doesNotThrow(() => assertFourEyes(null, 'u2'));
  });
});

describe('the four stages are derived from existing states, never a second lifecycle', () => {
  test('governed configuration', () => {
    assert.deepEqual(governedStage({ reviewStatus: 'draft', activation: 'inactive' }), { stage: 'draft', annotation: null });
    assert.deepEqual(governedStage({ reviewStatus: 'curated', activation: 'inactive' }), { stage: 'pending_review', annotation: null });
    assert.deepEqual(governedStage({ reviewStatus: 'approved', activation: 'inactive' }), { stage: 'approved', annotation: null });
    assert.deepEqual(governedStage({ reviewStatus: 'approved', activation: 'production_active' }), { stage: 'production_active', annotation: null });
    // A legacy baseline is in effect but NOT validated: never shown as approved or production-validated.
    assert.deepEqual(governedStage({ reviewStatus: 'draft', activation: 'legacy_baseline' }), { stage: 'draft', annotation: 'legacy_baseline_in_effect' });
    assert.deepEqual(governedStage({ reviewStatus: 'draft', activation: 'development_only' }), { stage: 'draft', annotation: 'development_only' });
  });
  test('career data and track-skill changes', () => {
    assert.equal(contentStage('published').stage, 'production_active');
    assert.equal(contentStage('sme_reviewed').stage, 'pending_review');
    assert.deepEqual(contentStage('needs_revision'), { stage: 'draft', annotation: 'needs_revision' });
    assert.equal(trackChangeStage('included').stage, 'approved');
    assert.equal(trackChangeStage('applied').stage, 'production_active');
  });
});

describe('track-skill proposals', () => {
  test('professional fields are flagged; unknown fields and bad values are refused', () => {
    assert.deepEqual(assertTrackSkillProposal({ is_core: true }), { professional: true });
    assert.deepEqual(assertTrackSkillProposal({ display_order: 3, category: 'ui' }), { professional: false });
    assert.throws(() => assertTrackSkillProposal({ review_status: 'published' }), DomainError);
    assert.throws(() => assertTrackSkillProposal({ classification_status: 'approved' }), DomainError, 'an admin cannot mark a classification approved');
    assert.throws(() => assertTrackSkillProposal({ importance: 'mandatory!' }), DomainError);
    assert.throws(() => assertTrackSkillProposal({ minimum_evidence_count: 0 }), DomainError);
    assert.throws(() => assertTrackSkillProposal({}), DomainError);
  });
});

describe('diffs for preview', () => {
  test('fields and children', () => {
    const d = diffFields({ a: 1, b: 'x' }, { a: 2, b: 'x' }, ['a', 'b']);
    assert.deepEqual(d.map((x) => x.changed), [true, false]);
    const c = diffChildren([{ k: 'q1', v: 1 }, { k: 'q2', v: 1 }], [{ k: 'q2', v: 2 }, { k: 'q3', v: 1 }], (x) => x.k);
    assert.deepEqual([c.added.length, c.removed.length, c.changed.length], [1, 1, 1]);
  });
});

describe('catalogue and pending decisions', () => {
  test('every catalogue entry explains meaning and impact in Arabic', () => {
    for (const [k, v] of Object.entries(RULE_CATALOG)) assert.ok(v.labelAr && v.meaningAr && v.impactAr, k);
    assert.equal(RULE_CATALOG['role_requirement.display_order']!.expertDependent, false);
    assert.equal(RULE_CATALOG['role_requirement.is_core']!.expertDependent, true);
  });
  test('the owner\'s nine pending expert decisions are listed, plus the Phase 9 pack constraints', () => {
    assert.deepEqual(PENDING_EXPERT_DECISIONS.map((d) => d.key), ['mandatory_skills', 'core_classification', 'readiness_thresholds', 'rubric_weights', 'evidence_counts_strengths',
      'verification_thresholds', 'cv_bullet_at_practiced', 'challenge_triggers', 'grounding_vocabulary', 'pack_structure_constraints']);
  });
});

describe('grounding-version gate (fail closed)', () => {
  const a = { lifecycleState: 'active', evidenceBacked: true, userApprovedAt: 'x', standingPolicyId: null, claimPolicyId: 'p' };
  const p = { policyId: 'p', resolution: 'legacy_baseline' as const };
  test('an asset grounded under another vocabulary/engine version is hidden until re-grounded', () => {
    assert.equal(assetPresentableNow(a, p, { assetVersion: 'claim-grounding@1+default@1', currentVersion: 'claim-grounding@1+default@1' }).presentable, true);
    assert.equal(assetPresentableNow(a, p, { assetVersion: 'claim-grounding@1+default@1', currentVersion: 'claim-grounding@1+default@2' }).reason, 'not_grounded_under_current_version');
    assert.equal(assetPresentableNow(a, p, { assetVersion: null, currentVersion: 'claim-grounding@1+default@1' }).presentable, false);
    assert.equal(assetPresentableNow(a, p).presentable, true, 'without a grounding check the 7b behaviour is unchanged');
  });
});
