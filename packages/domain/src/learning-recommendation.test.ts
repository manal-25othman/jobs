import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recommendLearning, resourceExposure, CANDIDATE_RESOURCE_LABEL_AR, NO_PRACTICE_AR, NO_RESOURCE_AR, type RegistryResource, type PracticeOption } from './learning-recommendation.js';

const base: RegistryResource = {
  id: 'r1', code: 'lr_a', titleAr: 'مورد', titleEn: 'Resource', provider: 'MDN', resourceType: 'tutorial', language: 'en', freeOrPaid: 'free',
  url: 'https://developer.mozilla.org/x', whyRecommendedAr: 'سبب', coversTargetLevel: true, durationMinutes: null, durationBasis: null,
  qualityStatus: 'unverified', reviewStatus: 'draft', linkCheck: 'search_index', lastChecked: null, usageTermsChecked: null, practiceActivitySlug: 'act_b',
};
const verified: RegistryResource = { ...base, id: 'r2', code: 'lr_v', qualityStatus: 'approved', reviewStatus: 'published', linkCheck: 'direct', lastChecked: '2026-11-25', usageTermsChecked: '2026-11-25' };
const PRACTICE: PracticeOption[] = [{ activityId: 'a1', slug: 'act_a', titleAr: 'أ', startable: true }, { activityId: 'a2', slug: 'act_b', titleAr: 'ب', startable: true }];

describe('A07 deterministic learning recommendation (Phase B package 2)', () => {
  test('exposure: only a fully verified, published resource is verified; an unverified draft is candidate only in the preview', () => {
    assert.equal(resourceExposure(verified, { candidatePreview: false }), 'verified');
    assert.equal(resourceExposure(base, { candidatePreview: false }), 'hidden', 'an ordinary graduate never sees an unverified resource');
    assert.equal(resourceExposure(base, { candidatePreview: true }), 'candidate');
    for (const missing of [{ linkCheck: 'search_index' as const }, { usageTermsChecked: null }, { lastChecked: null }, { url: null }, { reviewStatus: 'approved' }]) {
      assert.equal(resourceExposure({ ...verified, ...missing }, { candidatePreview: false }), 'hidden', JSON.stringify(missing));
    }
    assert.equal(resourceExposure({ ...base, reviewStatus: 'rejected' }, { candidatePreview: true }), 'hidden');
    assert.equal(resourceExposure({ ...base, qualityStatus: 'retired' }, { candidatePreview: true }), 'hidden');
  });

  test('without the preview, a graduate with only candidate resources gets the fallback and the practice, never a candidate', () => {
    const p = recommendLearning({ resources: [base], practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: false } });
    assert.equal(p.resource, null); assert.equal(p.fallbackAr, NO_RESOURCE_AR); assert.equal(p.practice?.slug, 'act_a');
    assert.equal(p.alternatives.length, 0);
  });

  test('in the preview, every candidate item carries the unverified label; a verified resource ranks first', () => {
    const p = recommendLearning({ resources: [base, verified, { ...base, id: 'r3', code: 'lr_c' }], practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: true } });
    assert.equal(p.resource?.code, 'lr_v'); assert.equal(p.resource?.labelAr, null);
    assert.deepEqual(p.alternatives.map((a) => a.code), ['lr_a', 'lr_c']);
    for (const a of p.alternatives) assert.equal(a.labelAr, CANDIDATE_RESOURCE_LABEL_AR);
  });

  test('one ranked resource and at most two alternatives, deterministically', () => {
    const many = ['lr_d', 'lr_b', 'lr_e', 'lr_c'].map((code, i) => ({ ...base, id: `x${i}`, code }));
    const a = recommendLearning({ resources: many, practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: true } });
    const b = recommendLearning({ resources: [...many].reverse(), practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: true } });
    assert.deepEqual(a, b); assert.equal(a.resource?.code, 'lr_b'); assert.equal(a.alternatives.length, 2);
  });

  test('a candidate with a link ranks before one without (the registry drafts have no URL)', () => {
    const p = recommendLearning({ resources: [{ ...base, id: 'n', code: 'lr_0nourl', url: null }, base], practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: true } });
    assert.equal(p.resource?.code, 'lr_a');
  });

  test('FR-A-011: no practice activity ⇒ no resource at all', () => {
    const p = recommendLearning({ resources: [verified], practiceOptions: [], context: { level: 'gap', candidatePreview: false } });
    assert.equal(p.resource, null); assert.equal(p.practice, null); assert.equal(p.fallbackAr, NO_PRACTICE_AR);
  });

  test('the practice named by the registry is preferred when startable; a startable one otherwise', () => {
    const p = recommendLearning({ resources: [verified], practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: false } });
    assert.equal(p.practice?.slug, 'act_b');
    const q = recommendLearning({ resources: [verified], practiceOptions: [{ ...PRACTICE[1]!, startable: false }, PRACTICE[0]!], context: { level: 'gap', candidatePreview: false } });
    assert.equal(q.practice?.slug, 'act_a');
  });

  test('a duration is shown only with a stated basis; a recommendation never grants a level', () => {
    const p = recommendLearning({ resources: [{ ...verified, durationMinutes: 60 }], practiceOptions: PRACTICE, context: { level: 'verified', candidatePreview: false } });
    assert.equal(p.resource?.durationMinutes, null); assert.equal(p.resource?.durationAr, 'المدة غير محددة');
    const q = recommendLearning({ resources: [{ ...verified, durationMinutes: 45, durationBasis: 'stated by provider' }], practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: false } });
    assert.equal(q.resource?.durationMinutes, 45);
    assert.equal(p.grantsLevel, false); assert.equal(p.need.code, 'strengthen');
    assert.ok(!('level' in p) && !('skillLevel' in p));
  });

  test('the free preference ranks free resources first only when asked', () => {
    const paid = { ...verified, id: 'p', code: 'lr_0paid', freeOrPaid: 'paid' as const };
    assert.equal(recommendLearning({ resources: [paid, verified], practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: false } }).resource?.code, 'lr_0paid');
    assert.equal(recommendLearning({ resources: [paid, verified], practiceOptions: PRACTICE, context: { level: 'gap', candidatePreview: false, preferFree: true } }).resource?.code, 'lr_v');
  });
});
