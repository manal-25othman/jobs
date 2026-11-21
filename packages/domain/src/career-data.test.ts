import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertReviewTransition, assertSynonymWellFormed, normalizeMatchKey, matchKeySimilarity, nearDuplicateCandidates, isExactDuplicate,
  evidencePathStatus, minimumEvidenceCount, verifiedPathStatus, assertPresentationRuleSane, assertLearningResourceHonest, layerOf, consumableByProduct,
  demoContentAllowedInProduction, integrityClassificationOf, DomainError, MissingPrerequisite, IllegalTransition, pilotDemoPublicationRefusal,
} from './index.js';

const base = { decidedBy: 'sme-1', rolePerformed: 'sme' as const, reason: 'checked', isDemoFixture: false, draftingAid: 'none' as const, production: false };

describe('review workflow — draft → curated → sme_reviewed → approved → published → superseded', () => {
  test('the happy path with the right roles', () => {
    assert.doesNotThrow(() => assertReviewTransition({ ...base, from: 'draft', to: 'curated', rolePerformed: 'content_author' }));
    assert.doesNotThrow(() => assertReviewTransition({ ...base, from: 'curated', to: 'sme_reviewed' }));
    assert.doesNotThrow(() => assertReviewTransition({ ...base, from: 'sme_reviewed', to: 'approved' }));
    assert.doesNotThrow(() => assertReviewTransition({ ...base, from: 'approved', to: 'published', rolePerformed: 'product_owner' }));
    assert.doesNotThrow(() => assertReviewTransition({ ...base, from: 'published', to: 'superseded', rolePerformed: 'system' }));
    assert.doesNotThrow(() => assertReviewTransition({ ...base, from: 'needs_revision', to: 'curated', rolePerformed: 'content_author' }));
  });
  test('NEGATIVE: no skipping, no wrong role, no nameless SME, no publishing the unapproved', () => {
    assert.throws(() => assertReviewTransition({ ...base, from: 'draft', to: 'approved' }), IllegalTransition);
    assert.throws(() => assertReviewTransition({ ...base, from: 'curated', to: 'published', rolePerformed: 'product_owner' }), IllegalTransition);
    assert.throws(() => assertReviewTransition({ ...base, from: 'sme_reviewed', to: 'approved', rolePerformed: 'content_author' }), DomainError);
    assert.throws(() => assertReviewTransition({ ...base, from: 'curated', to: 'sme_reviewed', decidedBy: null }), MissingPrerequisite);
    assert.throws(() => assertReviewTransition({ ...base, from: 'curated', to: 'sme_reviewed', reason: ' ' }), MissingPrerequisite);
    assert.throws(() => assertReviewTransition({ ...base, from: 'approved', to: 'published', rolePerformed: 'sme' }), DomainError, 'publishing is the product owner\'s act');
  });
  test('a DEMO fixture is never SME reviewed or approved, and never published in production', () => {
    assert.throws(() => assertReviewTransition({ ...base, from: 'curated', to: 'sme_reviewed', isDemoFixture: true }), DomainError);
    assert.throws(() => assertReviewTransition({ ...base, from: 'curated', to: 'approved', isDemoFixture: true }), /never SME reviewed|not a permitted/);
    assert.throws(() => assertReviewTransition({ ...base, from: 'approved', to: 'published', rolePerformed: 'product_owner', isDemoFixture: true, production: true }), DomainError);
    assert.doesNotThrow(() => assertReviewTransition({ ...base, from: 'approved', to: 'published', rolePerformed: 'product_owner', isDemoFixture: true, production: false }));
    assert.equal(demoContentAllowedInProduction('published'), false); assert.equal(demoContentAllowedInProduction('draft'), true);
  });
  test('AI-assisted drafting needs a named reviewer before approval (DF-10)', () => {
    assert.throws(() => assertReviewTransition({ ...base, from: 'sme_reviewed', to: 'approved', decidedBy: null, draftingAid: 'ai_assisted' }), MissingPrerequisite);
  });
  test('layers and consumption', () => {
    assert.equal(layerOf('draft'), 'curated'); assert.equal(layerOf('approved'), 'approved'); assert.equal(layerOf('published'), 'published');
    assert.equal(consumableByProduct('approved'), false); assert.equal(consumableByProduct('published'), true);
  });
});

describe('skill registry — synonyms, match keys, near-duplicates', () => {
  test('surface-form relations name text; linking relations name another skill; never both', () => {
    assert.doesNotThrow(() => assertSynonymWellFormed({ skillId: 'a', relation: 'equivalent', surfaceForm: 'Structured Query Language', relatedSkillId: null }));
    assert.doesNotThrow(() => assertSynonymWellFormed({ skillId: 'a', relation: 'tool_of', surfaceForm: null, relatedSkillId: 'b' }));
    assert.throws(() => assertSynonymWellFormed({ skillId: 'a', relation: 'broader', surfaceForm: null, relatedSkillId: 'a' }), DomainError);
    assert.throws(() => assertSynonymWellFormed({ skillId: 'a', relation: 'equivalent', surfaceForm: 'x', relatedSkillId: 'b' }), DomainError, 'an equivalent pointing at another skill is a merge');
    assert.throws(() => assertSynonymWellFormed({ skillId: 'a', relation: 'narrower', surfaceForm: 'x', relatedSkillId: null }), MissingPrerequisite);
  });
  test('Arabic normalisation happens in the match key only', () => {
    assert.equal(normalizeMatchKey('إدارةُ الحالةِ'), normalizeMatchKey('ادارة الحاله'));
    assert.equal(normalizeMatchKey('  JavaScript — Fundamentals! '), 'javascript fundamentals');
    assert.notEqual('إدارةُ الحالةِ', 'ادارة الحاله', 'the displayed text is untouched');
  });
  test('near-duplicates are proposed, ranked, and never merged', () => {
    const c = nearDuplicateCandidates([
      { code: 'a', nameEn: 'CSS layout and responsive design', nameAr: 'تنسيق CSS' },
      { code: 'b', nameEn: 'CSS responsive layout', nameAr: 'تخطيط CSS متجاوب' },
      { code: 'c', nameEn: 'JavaScript fundamentals', nameAr: 'أساسيات JavaScript' },
    ]);
    assert.equal(c.length, 1); assert.equal(c[0]!.aCode, 'a'); assert.equal(c[0]!.bCode, 'b');
    assert.ok(matchKeySimilarity('JavaScript fundamentals', 'JavaScript basics') > 0.3);
    assert.equal(isExactDuplicate({ nameEn: 'UI Testing', nameAr: 'x' }, { nameEn: 'ui testing', nameAr: 'y' }), true);
  });
});

describe('evidence paths, verified path, presentation rules, resources', () => {
  test('a core skill needs two activities for Verified, one for Demonstrated, none means no exit', () => {
    // Phase 9 (H3): the count comes from configuration; the legacy numbers reproduce the old answers.
    assert.equal(evidencePathStatus({ minimumEvidenceCount: minimumEvidenceCount(true), activitiesWithLinkedCriterion: 0 }), 'none');
    assert.equal(evidencePathStatus({ minimumEvidenceCount: minimumEvidenceCount(true), activitiesWithLinkedCriterion: 1 }), 'demonstrated_possible');
    assert.equal(evidencePathStatus({ minimumEvidenceCount: minimumEvidenceCount(true), activitiesWithLinkedCriterion: 2 }), 'verified_possible');
    assert.equal(evidencePathStatus({ minimumEvidenceCount: minimumEvidenceCount(false), activitiesWithLinkedCriterion: 1 }), 'verified_possible');
    assert.equal(evidencePathStatus({ minimumEvidenceCount: 3, activitiesWithLinkedCriterion: 2 }), 'demonstrated_possible', 'an expert-raised count is honoured');
    assert.equal(evidencePathStatus({ minimumEvidenceCount: null, activitiesWithLinkedCriterion: 2 }), 'evidence_count_not_configured', 'missing configuration is said, not assumed');
    assert.equal(evidencePathStatus({ minimumEvidenceCount: null, activitiesWithLinkedCriterion: 0 }), 'none');
  });
  test('Verified is not available in Phase 1 whatever an activity carries; what is missing is named', () => {
    const r = verifiedPathStatus({ hasPrivateInput: true, assessmentOnlyChecks: 2, explanationQuestions: 1, smeApprovedBy: null, verificationPolicyApproved: false });
    assert.equal(r.canYieldVerified, false);
    assert.deepEqual(r.missing, ['SME approval (D-030)', 'approved verification policy (OPEN: SME accreditation)']);
  });
  test('integrity check types classify themselves', () => {
    assert.equal(integrityClassificationOf('clarification_question'), 'user_facing');
    assert.equal(integrityClassificationOf('planted_inconsistency'), 'assessment_only');
  });
  test('presentation rules respect the minimum level and always cite evidence', () => {
    assert.doesNotThrow(() => assertPresentationRuleSane({ assetType: 'cv_bullet', evidenceLevel: 'practiced', allowed: true, mustCiteEvidence: true, allowedVerbsEn: ['worked on'], forbiddenPhrasesEn: ['expert'] }));
    assert.throws(() => assertPresentationRuleSane({ assetType: 'linkedin_skill', evidenceLevel: 'practiced', allowed: true, mustCiteEvidence: true, allowedVerbsEn: ['x'], forbiddenPhrasesEn: [] }), DomainError);
    assert.throws(() => assertPresentationRuleSane({ assetType: 'cv_bullet', evidenceLevel: 'demonstrated', allowed: true, mustCiteEvidence: false, allowedVerbsEn: ['built'], forbiddenPhrasesEn: [] }), DomainError);
    assert.throws(() => assertPresentationRuleSane({ assetType: 'cv_bullet', evidenceLevel: 'demonstrated', allowed: true, mustCiteEvidence: true, allowedVerbsEn: ['mastered'], forbiddenPhrasesEn: ['mastered'] }), DomainError);
  });
  test('a learning resource without a URL is unverified; without a practice link it is refused', () => {
    assert.doesNotThrow(() => assertLearningResourceHonest({ url: null, qualityStatus: 'unverified', practiceActivityRef: 'act' }));
    assert.throws(() => assertLearningResourceHonest({ url: null, qualityStatus: 'approved', practiceActivityRef: 'act' }), DomainError);
    assert.throws(() => assertLearningResourceHonest({ url: null, qualityStatus: 'unverified', practiceActivityRef: null }), MissingPrerequisite);
  });
});

describe('D-136 — development-only DEMO publication of pilot content (a separate rule)', () => {
  const ok = { nodeEnv: 'development', databaseHost: '127.0.0.1', isDemoFixture: true, isPilotContent: true, from: 'curated' as const, reason: 'internal pilot' };
  test('accepted only for curated DEMO pilot content, in local development, with a reason', () => {
    assert.equal(pilotDemoPublicationRefusal(ok), null);
    assert.equal(pilotDemoPublicationRefusal({ ...ok, nodeEnv: 'test', databaseHost: 'localhost' }), null);
  });
  test('production and staging are refused: NODE_ENV production/unset, or any non-local database host', () => {
    assert.match(pilotDemoPublicationRefusal({ ...ok, nodeEnv: 'production' })!, /outside local development/);
    assert.match(pilotDemoPublicationRefusal({ ...ok, nodeEnv: undefined })!, /outside local development/);
    for (const h of ['db.abcd.supabase.co', 'staging.internal', '10.0.0.5', null]) assert.match(pilotDemoPublicationRefusal({ ...ok, databaseHost: h })!, /not a local development database/);
  });
  test('real content, non-pilot demo content, other states and an empty reason are refused', () => {
    assert.match(pilotDemoPublicationRefusal({ ...ok, isDemoFixture: false })!, /only DEMO-fixture/);
    assert.match(pilotDemoPublicationRefusal({ ...ok, isPilotContent: false })!, /only DEMO-fixture/);
    assert.match(pilotDemoPublicationRefusal({ ...ok, from: 'draft' })!, /from curated/);
    assert.match(pilotDemoPublicationRefusal({ ...ok, reason: ' ' })!, /states why/);
  });
  test('the real SME workflow is unchanged: curated → published is still refused for every record', () => {
    for (const isDemoFixture of [true, false]) {
      assert.throws(() => assertReviewTransition({ from: 'curated', to: 'published', decidedBy: null, rolePerformed: 'product_owner', reason: 'r', isDemoFixture, draftingAid: 'none', production: false }), IllegalTransition);
    }
  });
});
