import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, careerSnapshot, workNextAction, type NextStepInput, type SnapshotSkill } from './career-guidance.js';

const base: NextStepInput = { hasGoal: true, roleAvailable: true, work: [], pendingProposals: [], startableActivityCount: 3 };
const w = (id: string, workStatus: string, updatedAt = '2026-11-25T10:00:00Z', sub: string | null = 's-' + id) => ({ projectId: id, title: `عمل ${id}`, workStatus, latestSubmissionId: sub, updatedAt });

describe('A01 — one next step from the current state (FR-A-009)', () => {
  test('no goal → choose a goal; an unavailable role → review the goal', () => {
    assert.equal(nextStep({ ...base, hasGoal: false }).code, 'choose_goal');
    assert.equal(nextStep({ ...base, roleAvailable: false }).code, 'role_unavailable');
  });
  test('work waiting on the graduate comes first, then work in progress, then a pending proposal', () => {
    const s = nextStep({ ...base, work: [w('a', 'in_progress'), w('b', 'blocked_by_checks')], pendingProposals: [{ id: 'p', textAr: 'x' }] });
    assert.equal(s.code, 'act_on_feedback'); assert.equal(s.sourceRef, 'b'); assert.equal(s.href, '/evaluation?submission=s-b');
    assert.equal(nextStep({ ...base, work: [w('a', 'in_progress')], pendingProposals: [{ id: 'p', textAr: 'x' }] }).code, 'continue_work');
    assert.equal(nextStep({ ...base, work: [w('a', 'under_human_review')], pendingProposals: [{ id: 'p', textAr: 'خطوة' }] }).code, 'review_proposal');
  });
  test('it never assigns an activity: with no work under way it points to the catalogue, where the graduate chooses', () => {
    const s = nextStep(base);
    assert.equal(s.code, 'choose_activity'); assert.equal(s.href, '/activities'); assert.equal(s.sourceRef, null);
    assert.match(s.whyAr, /الاختيار لك/);
    assert.equal(nextStep({ ...base, startableActivityCount: 0 }).code, 'no_activity_available');
  });
  test('a ready result is read before starting more; work under review alone means waiting', () => {
    assert.equal(nextStep({ ...base, work: [w('a', 'feedback_ready')] }).code, 'review_results');
    assert.equal(nextStep({ ...base, work: [w('a', 'under_human_review')] }).code, 'choose_activity');
    assert.equal(nextStep({ ...base, startableActivityCount: 0, work: [w('a', 'under_human_review')] }).code, 'wait_for_review');
  });
  test('deterministic and single: the most recent qualifying work wins; always agent A01 with a source', () => {
    const s = nextStep({ ...base, work: [w('old', 'in_progress', '2026-11-01T00:00:00Z'), w('new', 'in_progress', '2026-11-20T00:00:00Z')] });
    assert.equal(s.sourceRef, 'new'); assert.equal(s.agent, 'A01'); assert.ok(s.source);
  });
  test('workNextAction is the single work rule', () => {
    assert.deepEqual(workNextAction({ projectId: 'p', workStatus: 'in_progress', latestSubmissionId: null }), { labelAr: 'تابعي العمل', href: '/work/p' });
    assert.equal(workNextAction({ projectId: 'p', workStatus: 'level_recorded', latestSubmissionId: 's' }).href, '/evaluation?submission=s');
  });
});

describe('A02 — Career Snapshot (FR-U-014)', () => {
  const sk = (id: string, level: string, n = 0, cls: SnapshotSkill['approvedClass'] = null, order = 0): SnapshotSkill => ({ skillId: id, labelAr: id, level, standingEvaluatedCount: n, approvedClass: cls, roleOrder: order });
  const step = nextStep(base);
  test('every statement carries its source; strengths need evaluated evidence; at most three gaps', () => {
    const s = careerSnapshot({ roleLabelAr: 'دور', roleId: 'r', nextStep: step, skills: [sk('a', 'demonstrated', 1, null, 1), sk('b', 'gap', 0, null, 2), sk('c', 'practiced', 0, null, 3), sk('d', 'gap', 0, null, 4), sk('e', 'gap', 0, null, 5)] });
    assert.deepEqual(s.strengths.map((x) => x.sourceRef), ['a']);
    assert.deepEqual(s.gaps.map((x) => x.sourceRef), ['b', 'c', 'd']);
    for (const x of [s.role!, ...s.strengths, ...s.gaps, s.nextStep]) assert.ok(x.source, JSON.stringify(x));
  });
  test('without an approved classification, gaps follow the role order and say it is no priority', () => {
    const s = careerSnapshot({ roleLabelAr: null, roleId: null, nextStep: step, skills: [sk('z', 'gap', 0, null, 2), sk('y', 'gap', 0, null, 1), sk('x', 'gap', 0, null, 3), sk('w', 'gap', 0, null, 4)] });
    assert.deepEqual(s.gaps.map((x) => x.sourceRef), ['y', 'z', 'x']);
    assert.match(s.gapOrderAr, /لا أولوية معتمدة/); assert.ok(s.limitsAr.some((l) => /ليست أولوية معتمدة/.test(l)));
  });
  test('an approved class orders gaps (must, core, supporting)', () => {
    const s = careerSnapshot({ roleLabelAr: null, roleId: null, nextStep: step, skills: [sk('s', 'gap', 0, 'supporting', 1), sk('m', 'gap', 0, 'must', 3), sk('c', 'gap', 0, 'core', 2)] });
    assert.deepEqual(s.gaps.map((x) => x.sourceRef), ['m', 'c', 's']);
  });
  test('a claimed level without standing evaluated evidence is not a strength; the snapshot grants nothing', () => {
    const s = careerSnapshot({ roleLabelAr: null, roleId: null, nextStep: step, skills: [sk('a', 'demonstrated', 0)] });
    assert.equal(s.strengths.length, 0); assert.ok(s.limitsAr.some((l) => /لا تمنح مستوى/.test(l)));
  });
});
