/**
 * Phase 7 — claim policies replace presentationFor(): exhaustive equivalence,
 * eligibility per kind, version changes, and the "no policy is never allowed" rule.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimEligibility, presentationFromClaimPolicies, presentationFor, claimKindForProposalType, LEGACY_PRESENTATION_BASELINE,
  DRAFTABLE_CLAIM_KINDS, CLAIM_KIND_CLASS, EVIDENCE_STATES, resolveActiveConfig, DomainError,
  type ClaimPolicy, type ClaimKind, type ClaimSubject, type ResolvedClaimPolicy, type EvidenceState,
} from './index.js';

const policy = (claimKind: ClaimKind, minEvidenceLevel: EvidenceState, over: Partial<ClaimPolicy> = {}): ClaimPolicy => ({
  id: `${claimKind}-1`, key: 'legacy_presentation', version: 1, reviewStatus: 'draft', activation: 'legacy_baseline', baselineOf: 'presentationFor()', approvedBy: null,
  claimKind, minEvidenceLevel, minEvidenceCount: null, minSourceStrength: null, requiresVerificationDecision: false, requiresUserApproval: true, lockUntilGrounded: true, ...over,
});
const resolved = (p: ClaimPolicy): ResolvedClaimPolicy => ({ policy: p, resolution: 'legacy_baseline' });
const baselineSet: Partial<Record<ClaimKind, ResolvedClaimPolicy | null>> = Object.fromEntries(
  Object.entries(LEGACY_PRESENTATION_BASELINE).map(([k, lvl]) => [k, lvl ? resolved(policy(k as ClaimKind, lvl)) : null]));

const subject = (state: EvidenceState, over: Partial<ClaimSubject> = {}): ClaimSubject => ({
  assertedSkills: [{ skillId: 's1', state }],
  citedEvidence: [{ evidenceId: 'e1', skillId: 's1', state, sourceStrength: 'platform_controlled', standing: true }],
  standingEvidenceCount: { s1: 1 }, skillsWithVerificationDecision: new Set(), ...over,
});

describe('presentationFor() replacement — exact equivalence with the legacy baseline', () => {
  test('for EVERY evidence state, the policy-driven presentation equals presentationFor()', () => {
    for (const s of EVIDENCE_STATES) assert.deepEqual(presentationFromClaimPolicies(baselineSet, s), presentationFor(s), `state ${s}`);
  });
  test('the baseline holds exactly presentationFor()\'s four levels; kinds without pre-existing behaviour have no baseline', () => {
    assert.equal(LEGACY_PRESENTATION_BASELINE.cv_bullet, 'demonstrated');
    assert.equal(LEGACY_PRESENTATION_BASELINE.project_description, 'practiced');
    assert.equal(LEGACY_PRESENTATION_BASELINE.linkedin_skill, 'demonstrated');
    assert.equal(LEGACY_PRESENTATION_BASELINE.linkedin_project, 'practiced');
    assert.equal(LEGACY_PRESENTATION_BASELINE.case_study, null);
  });
  test('the equivalence is sensitive: one changed level breaks it (the test is not vacuous)', () => {
    const changed = { ...baselineSet, cv_bullet: resolved(policy('cv_bullet', 'practiced')) };
    assert.notDeepEqual(presentationFromClaimPolicies(changed, 'practiced'), presentationFor('practiced'));
  });
});

describe('claim eligibility', () => {
  test('no active policy is never "allowed by default"', () => {
    const r = claimEligibility('case_study', null, subject('verified'));
    assert.equal(r.status, 'not_yet_configured');
    assert.match(r.reasons[0]!.ar, /قيد الاعتماد/);
  });
  test('a submitted (practiced) project is not a demonstrated skill: a CV bullet or LinkedIn skill is refused, a project description is not', () => {
    assert.equal(claimEligibility('cv_bullet', baselineSet.cv_bullet!, subject('practiced')).status, 'not_eligible');
    assert.equal(claimEligibility('linkedin_skill', baselineSet.linkedin_skill!, subject('practiced')).status, 'not_eligible');
    assert.equal(claimEligibility('project_description', baselineSet.project_description!, subject('practiced')).status, 'eligible');
    assert.equal(claimEligibility('linkedin_project', baselineSet.linkedin_project!, subject('practiced')).status, 'eligible');
  });
  test('a skill assertion is judged by every skill it asserts, not only the evidence it cites', () => {
    const s = subject('demonstrated', { assertedSkills: [{ skillId: 's1', state: 'demonstrated' }, { skillId: 's2', state: 'self_reported' }] });
    const r = claimEligibility('cv_bullet', baselineSet.cv_bullet!, s);
    assert.equal(r.status, 'not_eligible');
    assert.ok(r.status === 'not_eligible' && r.reasons.some((x) => x.en.includes("'s2' is 'self_reported'")));
  });
  test('withdrawn evidence makes any claim ineligible; a kind that needs evidence refuses an empty citation', () => {
    const withdrawn = subject('demonstrated', { citedEvidence: [{ evidenceId: 'e1', skillId: 's1', state: 'demonstrated', sourceStrength: 'platform_controlled', standing: false }] });
    assert.equal(claimEligibility('cv_bullet', baselineSet.cv_bullet!, withdrawn).status, 'not_eligible');
    assert.equal(claimEligibility('cv_bullet', baselineSet.cv_bullet!, subject('demonstrated', { citedEvidence: [] })).status, 'not_eligible');
    // headline/about/summary may exist without a reference — the existing exemption — but any skill they assert still counts.
    assert.equal(claimEligibility('linkedin_headline', baselineSet.linkedin_headline!, subject('demonstrated', { citedEvidence: [] })).status, 'eligible');
    assert.equal(claimEligibility('linkedin_headline', baselineSet.linkedin_headline!, subject('practiced', { citedEvidence: [] })).status, 'not_eligible');
  });
  test('count, source strength and verification-decision floors apply only when a policy sets them', () => {
    const counted = resolved(policy('cv_bullet', 'demonstrated', { minEvidenceCount: 2 }));
    assert.equal(claimEligibility('cv_bullet', counted, subject('demonstrated')).status, 'not_eligible');
    assert.equal(claimEligibility('cv_bullet', counted, subject('demonstrated', { standingEvidenceCount: { s1: 2 } })).status, 'eligible');
    const strong = resolved(policy('cv_bullet', 'demonstrated', { minSourceStrength: 'platform_observed' }));
    assert.equal(claimEligibility('cv_bullet', strong, subject('demonstrated')).status, 'eligible');
    assert.equal(claimEligibility('cv_bullet', strong, subject('demonstrated', { citedEvidence: [{ evidenceId: 'e1', skillId: 's1', state: 'demonstrated', sourceStrength: 'self_reported', standing: true }] })).status, 'not_eligible');
    const vd = resolved(policy('cv_bullet', 'demonstrated', { requiresVerificationDecision: true }));
    assert.equal(claimEligibility('cv_bullet', vd, subject('demonstrated')).status, 'not_eligible');
    assert.equal(claimEligibility('cv_bullet', vd, subject('demonstrated', { skillsWithVerificationDecision: new Set(['s1']) })).status, 'eligible');
  });
  test('a policy for another kind is a data error, never silently applied', () => {
    assert.throws(() => claimEligibility('cv_bullet', baselineSet.linkedin_skill!, subject('demonstrated')), DomainError);
  });
});

describe('versions — a new policy version changes new decisions only, and only once it is active', () => {
  test('an inactive draft v2 does not replace the baseline; an approved production_active v2 does; deactivating it rolls back', () => {
    const base = policy('cv_bullet', 'demonstrated', { id: 'base' });
    const v2 = policy('cv_bullet', 'verified', { id: 'v2', key: 'default', version: 2, activation: 'inactive', baselineOf: null });
    const pick = (rows: ClaimPolicy[]) => { const r = resolveActiveConfig(rows, { production: true }); return r.row ? { policy: r.row, resolution: r.resolution } as ResolvedClaimPolicy : null; };
    assert.equal(claimEligibility('cv_bullet', pick([base, v2]), subject('demonstrated')).status, 'eligible');
    const v2Active = { ...v2, activation: 'production_active' as const, reviewStatus: 'approved', approvedBy: 'sme-1' };
    const r = claimEligibility('cv_bullet', pick([base, v2Active]), subject('demonstrated'));
    assert.equal(r.status, 'not_eligible'); assert.equal(r.policyRef, 'default@2');
    assert.equal(claimEligibility('cv_bullet', pick([base, { ...v2Active, activation: 'inactive' }]), subject('demonstrated')).status, 'eligible');
  });
  test('production never resolves a development-only draft', () => {
    const dev = policy('case_study', 'demonstrated', { key: 'default', activation: 'development_only', baselineOf: null });
    assert.equal(resolveActiveConfig([dev], { production: true }).row, null);
    assert.equal(resolveActiveConfig([dev], { production: false }).row?.id, dev.id);
  });
});

describe('claim kinds', () => {
  test('every draftable kind maps from a wording proposal type and has a class', () => {
    for (const k of DRAFTABLE_CLAIM_KINDS) { assert.equal(claimKindForProposalType(k), k); assert.ok(CLAIM_KIND_CLASS[k]); }
    assert.equal(claimKindForProposalType('linkedin_featured'), 'case_study');
    assert.equal(claimKindForProposalType('profile_gap'), null);
  });
});

import { assetPresentableNow } from './index.js';

describe('approval vs current standing — fail-closed presentation gate', () => {
  const base = { lifecycleState: 'active', evidenceBacked: true, userApprovedAt: '2026-10-08T00:00:00Z', standingPolicyId: null, claimPolicyId: 'baseline' };
  const baseline = { policyId: 'baseline', resolution: 'legacy_baseline' as const };
  const v2 = { policyId: 'v2', resolution: 'production_active' as const };
  test('an asset approved under the policy in effect is presentable', () => {
    assert.equal(assetPresentableNow(base, baseline).presentable, true);
  });
  test('a newer policy in effect hides it until it is re-checked under that policy', () => {
    assert.deepEqual(assetPresentableNow(base, v2), { presentable: false, reason: 'not_verified_under_policy_in_effect' });
    assert.equal(assetPresentableNow({ ...base, standingPolicyId: 'v2' }, v2).presentable, true);
  });
  test('an asset approved before the policy layer is presentable only while the legacy baseline is in effect', () => {
    const pre = { ...base, claimPolicyId: null };
    assert.equal(assetPresentableNow(pre, baseline).presentable, true);
    assert.equal(assetPresentableNow(pre, v2).presentable, false);
  });
  test('needs_review, not evidence-backed, unapproved, or no policy in effect ⇒ never presentable', () => {
    assert.equal(assetPresentableNow({ ...base, lifecycleState: 'needs_review' }, baseline).presentable, false);
    assert.equal(assetPresentableNow({ ...base, evidenceBacked: false }, baseline).presentable, false);
    assert.equal(assetPresentableNow({ ...base, userApprovedAt: null }, baseline).presentable, false);
    assert.equal(assetPresentableNow(base, null).reason, 'no_policy_in_effect');
  });
});
