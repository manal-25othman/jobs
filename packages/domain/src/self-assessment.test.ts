import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelfAssessment, changedSelfAssessments, SELF_ASSESSMENT_CONFIDENCE, SELF_ASSESSMENT_NOTE_MAX } from './self-assessment.js';
import { careerSnapshot, nextStep } from './career-guidance.js';

const ctx = { skillIds: ['s1', 's2'], levelKeys: ['foundation', 'working', 'independent', 'advanced'] };

describe('FR-U-013 self-assessment (Observed only)', () => {
  test('ratings are the scale levels plus «not tried» and «unsure»; only the role\'s skills', () => {
    assert.deepEqual(normalizeSelfAssessment([{ skillId: 's1', rating: 'working', note: ' في مشروع التخرج ' }, { skillId: 's2', rating: 'unsure' }], ctx),
      [{ skillId: 's1', rating: 'working', note: 'في مشروع التخرج' }, { skillId: 's2', rating: 'unsure', note: null }]);
    assert.throws(() => normalizeSelfAssessment([{ skillId: 'x', rating: 'working' }], ctx), /unknown_skill/);
    assert.throws(() => normalizeSelfAssessment([{ skillId: 's1', rating: 'expert' }], ctx), /bad_rating/);
    assert.throws(() => normalizeSelfAssessment([{ skillId: 's1', rating: 'working' }, { skillId: 's1', rating: 'unsure' }], ctx), /twice/);
    assert.throws(() => normalizeSelfAssessment([{ skillId: 's1', rating: 'working', note: 'x'.repeat(SELF_ASSESSMENT_NOTE_MAX + 1) }], ctx), /too_long/);
    assert.throws(() => normalizeSelfAssessment([], ctx), /malformed/);
  });
  test('it is always and only Observed', () => assert.equal(SELF_ASSESSMENT_CONFIDENCE, 'observed'));
  test('only a change is recorded', () => {
    const latest = new Map([['s1', { rating: 'working', note: null }]]);
    assert.deepEqual(changedSelfAssessments([{ skillId: 's1', rating: 'working', note: null }, { skillId: 's2', rating: 'foundation', note: null }], latest).map((x) => x.skillId), ['s2']);
  });
  test('the snapshot shows a self-assessment apart from strengths: a high self-rating is never a strength', () => {
    const step = nextStep({ hasGoal: true, roleAvailable: true, work: [], pendingProposals: [], startableActivityCount: 1 });
    const s = careerSnapshot({ roleLabelAr: null, roleId: null, nextStep: step,
      skills: [{ skillId: 's1', labelAr: 'أ', level: 'gap', standingEvaluatedCount: 0, approvedClass: null, roleOrder: 1, selfRatingAr: 'متقدم' }] });
    assert.equal(s.strengths.length, 0);
    assert.equal(s.selfAssessed.length, 1); assert.equal(s.selfAssessed[0]!.source, 'self_assessment');
    assert.equal(s.gaps.length, 1, 'still a gap');
  });
});
