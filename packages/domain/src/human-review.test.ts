import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDeterministicEvaluation, aggregateWithHumanDecisions, assertQueueTransition, assertReviewerAction, assertBlindPayload, validateDecision,
  finalizationAllowed, assertValuesPublishable, assertPromotionAllowed, conflictOfInterest, DomainError, MissingPrerequisite, InvariantViolation, IllegalTransition,
  type PublishedRubric,
} from './index.js';

const rubric: PublishedRubric = {
  rubricVersionId: 'rv', version: 'rub@0.1.0', activitySpecId: 'act', activitySpecVersion: '0.1.0', status: 'published', passThreshold: 0.75, proposesState: 'demonstrated',
  criteria: [
    { key: 'files', label: 'الملفات', maxScore: 1, skillId: 's1', mandatory: true, evaluatorType: 'rule', check: { type: 'all_of', artifactKeys: ['file.a', 'file.b'] }, rationaleWhenMet: 'موجودة', rationaleWhenUnmet: 'ناقصة' },
    { key: 'structure', label: 'البنية', maxScore: 2, skillId: 's1', mandatory: true, evaluatorType: 'human', check: null, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
    { key: 'clarity', label: 'الوضوح', maxScore: 2, skillId: 's2', mandatory: false, evaluatorType: 'human', check: null, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
  ],
};
const arts = [{ key: 'file.a', kind: 'file' as const }, { key: 'file.b', kind: 'file' as const }];
const blockingSpec = { key: 'files_present', classification: 'user_facing' as const, blocking: true, check: { type: 'all_of' as const, artifactKeys: ['file.a', 'file.b'] }, userFacingMessage: 'أرفقي الملفين' };

describe('deterministic stage leaves human criteria pending', () => {
  test('rule criteria are scored, human ones listed; outcome needs_human_review; nothing proposed', () => {
    const run = runDeterministicEvaluation({ rubric, artifacts: arts, integritySpecs: [blockingSpec], currentState: 'practiced' });
    assert.equal(run.outcome, 'needs_human_review'); assert.deepEqual(run.pendingHumanCriteria, ['structure', 'clarity']);
    assert.equal(run.criteria.length, 1); assert.equal(run.proposedState, null); assert.equal(run.maxScore, 5);
  });
  test('a blocking integrity failure is final: no queue, no human review', () => {
    const run = runDeterministicEvaluation({ rubric, artifacts: [arts[0]!], integritySpecs: [blockingSpec], currentState: 'practiced' });
    assert.equal(run.outcome, 'blocked_by_checks'); assert.deepEqual(run.pendingHumanCriteria, []);
    assert.throws(() => aggregateWithHumanDecisions({ rubric, deterministic: run, decisions: [], currentState: 'practiced' }), InvariantViolation);
  });
  test('a rule-only rubric still concludes deterministically (unchanged behaviour)', () => {
    const r2 = { ...rubric, criteria: [rubric.criteria[0]!] };
    const run = runDeterministicEvaluation({ rubric: r2, artifacts: arts, integritySpecs: [], currentState: 'practiced' });
    assert.equal(run.outcome, 'passed'); assert.equal(run.proposedState, 'demonstrated'); assert.deepEqual(run.pendingHumanCriteria, []);
  });
});

describe('aggregation — reproducible, human decides judgement only', () => {
  const det = runDeterministicEvaluation({ rubric, artifacts: arts, integritySpecs: [blockingSpec], currentState: 'practiced' });
  test('cannot finalise before every pending criterion is decided', () => {
    assert.throws(() => aggregateWithHumanDecisions({ rubric, deterministic: det, decisions: [{ criterionKey: 'structure', score: 2, rationale: 'landmarks and ordered headings' }], currentState: 'practiced' }), MissingPrerequisite);
  });
  test('a decision on a rule criterion is refused', () => {
    assert.throws(() => aggregateWithHumanDecisions({ rubric, deterministic: det, decisions: [{ criterionKey: 'files', score: 1, rationale: 'looks fine' }, { criterionKey: 'structure', score: 2, rationale: 'x' }, { criterionKey: 'clarity', score: 2, rationale: 'x' }], currentState: 'practiced' }), /decided by a rule/);
  });
  test('complete decisions → passed and demonstrated; same inputs twice → identical result', () => {
    const decisions = [{ criterionKey: 'structure', score: 2, rationale: 'landmarks, ordered headings, labelled form' }, { criterionKey: 'clarity', score: 1, rationale: 'flow explained, state location missing' }];
    const a = aggregateWithHumanDecisions({ rubric, deterministic: det, decisions, currentState: 'practiced' });
    const b = aggregateWithHumanDecisions({ rubric, deterministic: det, decisions: [...decisions].reverse(), currentState: 'practiced' });
    assert.deepEqual(a, b); assert.equal(a.outcome, 'passed'); assert.equal(a.proposedState, 'demonstrated'); assert.equal(a.totalScore, 4); assert.equal(a.maxScore, 5);
    assert.deepEqual(a.criteria.map((c) => c.criterionId), ['files', 'structure', 'clarity'], 'rubric order');
  });
  test('a missed mandatory human criterion cannot be compensated; never proposes verified', () => {
    const a = aggregateWithHumanDecisions({ rubric, deterministic: det, decisions: [{ criterionKey: 'structure', score: 0, rationale: 'div for everything, no landmarks' }, { criterionKey: 'clarity', score: 2, rationale: 'clear' }], currentState: 'practiced' });
    assert.equal(a.outcome, 'below_threshold'); assert.equal(a.proposedState, null);
    assert.notEqual(rubric.proposesState, 'verified');
  });
  test('a score outside the criterion range, an empty rationale, or two decisions for one criterion are refused', () => {
    assert.throws(() => aggregateWithHumanDecisions({ rubric, deterministic: det, decisions: [{ criterionKey: 'structure', score: 3, rationale: 'x' }, { criterionKey: 'clarity', score: 2, rationale: 'x' }], currentState: 'practiced' }), InvariantViolation);
    assert.throws(() => aggregateWithHumanDecisions({ rubric, deterministic: det, decisions: [{ criterionKey: 'structure', score: 2, rationale: ' ' }, { criterionKey: 'clarity', score: 2, rationale: 'x' }], currentState: 'practiced' }), MissingPrerequisite);
    assert.throws(() => aggregateWithHumanDecisions({ rubric, deterministic: det, decisions: [{ criterionKey: 'structure', score: 2, rationale: 'x' }, { criterionKey: 'structure', score: 1, rationale: 'y' }, { criterionKey: 'clarity', score: 2, rationale: 'x' }], currentState: 'practiced' }), /supersedes/);
  });
});

describe('queue, permissions, blind payload, decisions, values, promotion', () => {
  test('queue transitions', () => {
    assert.doesNotThrow(() => { assertQueueTransition('pending', 'assigned'); assertQueueTransition('assigned', 'in_review'); assertQueueTransition('in_review', 'completed'); assertQueueTransition('completed', 'in_review'); assertQueueTransition('in_review', 'returned'); assertQueueTransition('returned', 'pending'); });
    assert.throws(() => assertQueueTransition('pending', 'completed'), IllegalTransition);
  });
  test('reviewer permissions: may mark/rationalise/re-review; may not touch submission, profile, claims, rubrics, states', () => {
    assert.doesNotThrow(() => { assertReviewerAction('mark_criterion_result'); assertReviewerAction('request_re_review'); });
    for (const a of ['edit_submission', 'edit_user_profile', 'publish_cv_or_linkedin_claim', 'change_role_requirements', 'change_rubric_definition', 'bypass_deterministic_failure', 'set_evidence_state', 'grant_verified', 'invent_evidence'] as const) assert.throws(() => assertReviewerAction(a), DomainError, a);
  });
  test('blind payload refuses identity keys at any depth; accepts task/submission/criterion data', () => {
    assert.doesNotThrow(() => assertBlindPayload({ activity: { title: 'x' }, criterion: { key: 'k', levels: [] }, artifacts: [{ key: 'file.a', locator: 'a.js:1' }], userExplanation: 'I did …' }));
    assert.throws(() => assertBlindPayload({ submission: { owner: { display_name: 'Sara' } } }), /display_name/);
    assert.throws(() => assertBlindPayload([{ email: 'x@y' }]), /email/);
    assert.throws(() => assertBlindPayload({ cv: {} }), /cv/);
  });
  test('a decision names a level and carries a rationale; rule criteria are refused', () => {
    const levels = [{ levelKey: 'missing', score: 0 }, { levelKey: 'solid', score: 2 }];
    assert.deepEqual(validateDecision({ criterionKey: 'k', evaluatorType: 'human', levels, levelKey: 'solid', rationale: 'landmarks present and ordered' }), { score: 2 });
    assert.throws(() => validateDecision({ criterionKey: 'k', evaluatorType: 'human', levels, levelKey: 'great', rationale: 'landmarks present and ordered' }), DomainError);
    assert.throws(() => validateDecision({ criterionKey: 'k', evaluatorType: 'human', levels, levelKey: 'solid', rationale: 'ok' }), MissingPrerequisite);
    assert.throws(() => validateDecision({ criterionKey: 'k', evaluatorType: 'rule', levels, levelKey: 'solid', rationale: 'landmarks present and ordered' }), DomainError);
    assert.equal(conflictOfInterest('u1', 'u1', false), true); assert.equal(conflictOfInterest('u1', 'u2', false), false); assert.equal(conflictOfInterest('u1', 'u2', true), true);
  });
  test('finalisation needs every queue item completed', () => {
    assert.deepEqual(finalizationAllowed([{ state: 'completed' }, { state: 'in_review' }]), { allowed: false, pending: 1 });
    assert.deepEqual(finalizationAllowed([{ state: 'completed' }]), { allowed: true, pending: 0 });
    assert.equal(finalizationAllowed([]).allowed, false);
  });
  test('values: real content publishes only with approved weights and thresholds; demo may carry proposals', () => {
    assert.throws(() => assertValuesPublishable({ isDemoFixture: false, passThresholdStatus: 'proposed', criterionStatuses: [{ key: 'a', weight: 'approved', threshold: 'TBD' }] }), /pass_threshold \(proposed\), a.threshold \(TBD\)/);
    assert.doesNotThrow(() => assertValuesPublishable({ isDemoFixture: true, passThresholdStatus: 'proposed', criterionStatuses: [{ key: 'a', weight: 'TBD', threshold: 'TBD' }] }));
    assert.doesNotThrow(() => assertValuesPublishable({ isDemoFixture: false, passThresholdStatus: 'approved', criterionStatuses: [{ key: 'a', weight: 'approved', threshold: 'approved' }] }));
  });
  test('promotion: demo only, not superseded, not twice', () => {
    assert.doesNotThrow(() => assertPromotionAllowed({ sourceIsDemo: true, sourceStatus: 'draft', alreadyPromoted: false }));
    assert.throws(() => assertPromotionAllowed({ sourceIsDemo: false, sourceStatus: 'draft', alreadyPromoted: false }), DomainError);
    assert.throws(() => assertPromotionAllowed({ sourceIsDemo: true, sourceStatus: 'superseded', alreadyPromoted: false }), DomainError);
    assert.throws(() => assertPromotionAllowed({ sourceIsDemo: true, sourceStatus: 'draft', alreadyPromoted: true }), DomainError);
  });
});
