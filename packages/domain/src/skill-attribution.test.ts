import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  attributeLegacyPrimarySkill, skillsCoveredByRubric, isValidSkillEvidenceCriterion, withheldPromotion, resolveRubricVersion,
  unattributedDecision, runDeterministicEvaluation, MissingPrerequisite,
  type PublishedRubric, type VerificationPolicy, type SubmissionArtifact,
} from './index.js';

const rubric: PublishedRubric = {
  rubricVersionId: 'rv', version: 'rub@1', activitySpecId: 'act', activitySpecVersion: '1.0.0', status: 'published', passThreshold: 0.75, proposesState: 'demonstrated',
  criteria: [
    { key: 'gate', label: 'g', maxScore: 1, kind: 'gate', skillId: null, mandatory: true, evaluatorType: 'rule', check: { type: 'artifact_present', artifactKey: 'file.a' }, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
    { key: 'html', label: 'h', maxScore: 1, skillId: 'html', mandatory: true, evaluatorType: 'rule', check: { type: 'artifact_present', artifactKey: 'file.a' }, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
    { key: 'css', label: 'c', maxScore: 1, skillId: 'css', mandatory: false, evaluatorType: 'rule', check: { type: 'artifact_present', artifactKey: 'file.b' }, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
    { key: 'zero', label: 'z', maxScore: 0, skillId: 'zero_skill', mandatory: false, evaluatorType: 'rule', check: { type: 'artifact_present', artifactKey: 'file.a' }, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
  ],
};

const policy: VerificationPolicy = {
  id: 'p', key: 'default', version: 2, reviewStatus: 'draft', appliesOutcomes: ['passed'], acceptRubricProposal: true, maxResultingState: null,
  minAssessmentConfidence: null, minIndependentEvidence: null, escalateOn: {}, blockingRule: 'mandatory_criteria_unmet_blocks', perSkillEvidenceDerivation: false,
  decisionActors: ['policy'], promotionBasis: 'independently_verified', practicedOnSubmission: false,
};

const permutations = <T>(xs: readonly T[]): T[][] => xs.length <= 1 ? [[...xs]] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

describe('ENG-1 P0 — coverage: only valid skill-evidence criteria cover a skill', () => {
  test('gates, unlinked and zero-maximum criteria cover nothing', () => {
    assert.deepEqual(skillsCoveredByRubric(rubric), ['css', 'html']);
    assert.equal(isValidSkillEvidenceCriterion({ kind: 'gate', skillId: null, maxScore: 1 }), false);
    assert.equal(isValidSkillEvidenceCriterion({ kind: 'skill_evidence', skillId: 'x', maxScore: 0 }), false);
    assert.equal(isValidSkillEvidenceCriterion({ kind: 'quality', skillId: 'x', maxScore: 1 }), false);
  });
  test('coverage is reported on canonical ids (an alias-linked criterion covers the canonical skill)', () => {
    assert.deepEqual(skillsCoveredByRubric(rubric, (s) => (s === 'css' ? 'css_canonical' : s)), ['css_canonical', 'html']);
  });
});

describe('ENG-1 P0 — attribution: explicit mapping, never row or uuid order', () => {
  const base = { activityPrimarySkillIds: ['html', 'api'], coveredSkillIds: ['html', 'css'] };
  test('exactly one claimed skill that is primary AND covered ⇒ attributed to it', () => {
    const a = attributeLegacyPrimarySkill({ ...base, claimedSkillIds: ['css', 'html', 'secondary'] });
    assert.equal(a.kind, 'attributed'); assert.equal(a.kind === 'attributed' && a.skillId, 'html');
  });
  test('the result is independent of the order of every input', () => {
    const claimed = ['css', 'html', 'secondary', 'api'];
    const first = attributeLegacyPrimarySkill({ ...base, claimedSkillIds: claimed });
    for (const p of permutations(claimed)) for (const q of permutations(base.activityPrimarySkillIds)) {
      assert.deepEqual(attributeLegacyPrimarySkill({ claimedSkillIds: p, activityPrimarySkillIds: q, coveredSkillIds: [...base.coveredSkillIds].reverse() }), first);
    }
  });
  test('a claimed skill the rubric does not measure is never attributed, even when the activity calls it primary (F-9)', () => {
    const a = attributeLegacyPrimarySkill({ ...base, claimedSkillIds: ['api'] });
    assert.equal(a.kind, 'unattributed'); assert.equal(a.kind === 'unattributed' && a.cause, 'no_candidate');
  });
  test('a covered skill the activity declares only secondary is not attributed', () => {
    const a = attributeLegacyPrimarySkill({ ...base, claimedSkillIds: ['css'] });
    assert.equal(a.kind, 'unattributed');
  });
  test('two qualifying claimed skills ⇒ ambiguous ⇒ fail closed', () => {
    const a = attributeLegacyPrimarySkill({ activityPrimarySkillIds: ['html', 'css'], coveredSkillIds: ['html', 'css'], claimedSkillIds: ['css', 'html'] });
    assert.equal(a.kind, 'unattributed'); assert.equal(a.kind === 'unattributed' && a.cause, 'ambiguous');
    assert.deepEqual(a.kind === 'unattributed' && a.candidates, ['css', 'html']);
  });
  test('duplicates in the claim list do not create ambiguity', () => {
    assert.equal(attributeLegacyPrimarySkill({ ...base, claimedSkillIds: ['html', 'html'] }).kind, 'attributed');
  });
});

describe('ENG-1 P0 — an unattributed result proposes nothing and decides nothing', () => {
  const arts: SubmissionArtifact[] = [{ key: 'file.a', kind: 'file' }, { key: 'file.b', kind: 'file' }];
  test('withheldPromotion clears the proposal and keeps the outcome and scores', () => {
    const run = runDeterministicEvaluation({ rubric, artifacts: arts, integritySpecs: [], currentState: 'gap' });
    assert.equal(run.outcome, 'passed'); assert.equal(run.proposedState, 'demonstrated');
    const held = withheldPromotion(run, 'ambiguous');
    assert.equal(held.proposedState, null); assert.equal(held.outcome, 'passed'); assert.deepEqual(held.criteria, run.criteria);
    assert.match(held.reason, /promotion withheld: ambiguous/);
    assert.equal(withheldPromotion({ ...run, proposedState: null }, 'x').proposedState, null);
  });
  test('unattributedDecision holds the state, proposes nothing, writes no legacy verification, and needs a reason', () => {
    const d = unattributedDecision(policy, { currentState: 'practiced', reason: 'ambiguous' });
    assert.equal(d.decision, 'not_applicable'); assert.equal(d.resultingState, 'practiced'); assert.equal(d.previousState, 'practiced');
    assert.equal(d.proposedState, null); assert.equal(d.legacyOutcome, null); assert.match(d.reason, /default@2/);
    assert.throws(() => unattributedDecision(policy, { currentState: 'gap', reason: ' ' }), MissingPrerequisite);
  });
});

describe('ENG-1 P0 — rubric version pinned to the submission\'s activity version (F-8)', () => {
  const pub = (id: string, v: string | null) => ({ id, status: 'published', activitySpecVersion: v });
  test('a bound version wins, whatever was published later', () => {
    assert.deepEqual(resolveRubricVersion({ candidates: [pub('r1', '1.0.0'), pub('r2', '2.0.0')], submissionActivityVersion: '1.0.0', currentActivityVersion: '2.0.0' }), { kind: 'bound', rubricVersionId: 'r1' });
  });
  test('drafts and other statuses are never evaluable', () => {
    assert.equal(resolveRubricVersion({ candidates: [{ id: 'd', status: 'draft', activitySpecVersion: '1.0.0' }], submissionActivityVersion: '1.0.0', currentActivityVersion: '1.0.0' }).kind, 'unresolved');
  });
  test('two versions bound to the same activity version ⇒ unresolved, never "the latest"', () => {
    assert.equal(resolveRubricVersion({ candidates: [pub('r1', '1.0.0'), pub('r2', '1.0.0')], submissionActivityVersion: '1.0.0', currentActivityVersion: '1.0.0' }).kind, 'unresolved');
  });
  test('legacy fallback: one published, unbound, and the submission is on the current activity version', () => {
    assert.deepEqual(resolveRubricVersion({ candidates: [pub('legacy', null)], submissionActivityVersion: '1.0.0', currentActivityVersion: '1.0.0' }), { kind: 'legacy_unbound_single', rubricVersionId: 'legacy' });
  });
  test('legacy fallback refused when the submission is on an older activity version', () => {
    assert.equal(resolveRubricVersion({ candidates: [pub('legacy', null)], submissionActivityVersion: '0.9.0', currentActivityVersion: '1.0.0' }).kind, 'unresolved');
  });
  test('legacy fallback refused when several versions are published', () => {
    assert.equal(resolveRubricVersion({ candidates: [pub('a', null), pub('b', null)], submissionActivityVersion: '1.0.0', currentActivityVersion: '1.0.0' }).kind, 'unresolved');
    assert.equal(resolveRubricVersion({ candidates: [pub('a', null), pub('b', '2.0.0')], submissionActivityVersion: '1.0.0', currentActivityVersion: '1.0.0' }).kind, 'unresolved');
  });
  test('no published version, or no recorded activity version ⇒ unresolved', () => {
    assert.equal(resolveRubricVersion({ candidates: [], submissionActivityVersion: '1.0.0', currentActivityVersion: '1.0.0' }).kind, 'unresolved');
    assert.equal(resolveRubricVersion({ candidates: [pub('a', '1.0.0')], submissionActivityVersion: null, currentActivityVersion: '1.0.0' }).kind, 'unresolved');
  });
});

describe('ENG-1 P0 — threshold_for_skill audit: legacy grading does not read it', () => {
  test('any per-skill threshold value or status leaves the legacy run identical', () => {
    const arts: SubmissionArtifact[] = [{ key: 'file.a', kind: 'file' }];
    const plain = runDeterministicEvaluation({ rubric, artifacts: arts, integritySpecs: [], currentState: 'gap' });
    for (const t of [null, 0, 0.5, 1, 99]) for (const st of [null, 'TBD', 'proposed', 'approved']) {
      const withT: PublishedRubric = { ...rubric, criteria: rubric.criteria.map((c) => ({ ...c, thresholdForSkill: t, thresholdStatus: st })) };
      assert.deepEqual(runDeterministicEvaluation({ rubric: withT, artifacts: arts, integritySpecs: [], currentState: 'gap' }), plain);
    }
  });
});
