import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIntegratedAssessmentParams, validateIntegratedCatalog, evaluateIntegratedAssessment, integratedExclusion, integratedPassVerdict,
  evaluateReadiness, SEALED_READINESS_RULE_TYPES, DomainError, type IntegratedResultFact, type IntegratedAssessmentParams, type ReadinessRuleSet,
} from './index.js';

const P: IntegratedAssessmentParams = parseIntegratedAssessmentParams({ activity_code: 'act_int', allowed: [{ activity_version: '1.0.0', rubric_version: 'rub_int@1' }], pass_rule: 'PR-2', require_concluded_review: true });
let n = 0;
const fact = (o: Partial<IntegratedResultFact> = {}): IntegratedResultFact => {
  n += 1;
  return {
    evaluationResultId: `r${String(n).padStart(3, '0')}`, submissionId: `s${n}`, evaluatedAt: `2026-10-${String(10 + (n % 15)).padStart(2, '0')}T10:00:00Z`, activityCode: 'act_int', activityVersion: '1.0.0',
    rubricVersion: 'rub_int@1', activityPublished: true, activityIsDemo: false, rubricPublished: true, rubricIsDemo: false, rubricValuesApproved: true, resultFinal: true,
    evaluationOutcome: 'passed', pendingHumanCriteria: 0, integrityFailed: false,
    criteria: [{ key: 'g1', kind: 'gate', mandatory: true, status: 'met', score: 1, maxScore: 1 }, { key: 'm1', kind: 'skill_evidence', mandatory: true, status: 'met', score: 2, maxScore: 2 },
               { key: 'q1', kind: 'quality', mandatory: false, status: 'not_met', score: 0, maxScore: 2 }],
    passThreshold: 0.75, passThresholdApproved: true, evidenceStanding: 1, evidenceWithdrawn: 0,
    perSkill: [{ skillId: 'html', outcome: 'met', decision: 'accepted' }, { skillId: 'ui', outcome: 'not_met', decision: 'not_applicable' }], claimAnomaly: false, ...o,
  };
};

describe('EXT-1 params — explicit, pinned, no defaults', () => {
  test('a wildcard, an unpinned rubric, an unknown parameter, a missing pass rule or an optional review are refused', () => {
    const base = { activity_code: 'act_int', allowed: [{ activity_version: '1.0.0', rubric_version: 'rub@1' }], pass_rule: 'PR-2', require_concluded_review: true };
    for (const bad of [{ ...base, allowed: [] }, { ...base, allowed: [{ activity_version: '*', rubric_version: 'rub@1' }] }, { ...base, allowed: [{ activity_version: '1.0.0', rubric_version: '*' }] },
      { ...base, allowed: [{ activity_version: '1.0.0' }] }, { ...base, pass_rule: 'PR-3' }, { ...base, pass_rule: undefined }, { ...base, require_concluded_review: false },
      { ...base, min_score: 0.8 }, { ...base, allowed: [base.allowed[0], base.allowed[0]] }, { ...base, activity_code: 'Bad Code' }]) {
      assert.throws(() => parseIntegratedAssessmentParams(bad), DomainError, JSON.stringify(bad));
    }
  });
  test('the rule type is sealed (never approved or production-active before P6)', () => {
    assert.ok(SEALED_READINESS_RULE_TYPES.includes('integrated_assessment_passed'));
  });
  test('catalog: fail closed when the activity, the pinned rubric, its binding, its values or its pass criteria are not approved', () => {
    const ok = { activityVersion: '1.0.0', activityPublished: true, activityIsDemo: false, rubrics: [{ version: 'rub_int@1', published: true, isDemo: false, valuesApproved: true, boundToActivityVersion: true, gateOrMandatoryCriteria: 2 }] };
    assert.doesNotThrow(() => validateIntegratedCatalog(P, [ok]));
    for (const bad of [{ ...ok, activityPublished: false }, { ...ok, activityIsDemo: true }, { ...ok, rubrics: [] }, { ...ok, rubrics: [{ ...ok.rubrics[0]!, valuesApproved: false }] },
      { ...ok, rubrics: [{ ...ok.rubrics[0]!, boundToActivityVersion: false }] }, { ...ok, rubrics: [{ ...ok.rubrics[0]!, isDemo: true }] }, { ...ok, rubrics: [{ ...ok.rubrics[0]!, gateOrMandatoryCriteria: 0 }] }]) {
      assert.throws(() => validateIntegratedCatalog(P, [bad]), DomainError);
    }
    assert.throws(() => validateIntegratedCatalog(P, []), DomainError, 'no such version');
    assert.doesNotThrow(() => validateIntegratedCatalog(P, [{ ...ok, activityIsDemo: true, rubrics: [] }, ok]), 'a demo twin of the same slug@version is ignored, not chosen');
  });
});

describe('EXT-1 eligibility — only a legitimate final assessment with standing evidence counts', () => {
  const cases: [string, Partial<IntegratedResultFact>, string][] = [
    ['an interim result (later concluded)', { resultFinal: false }, 'not_final'], ['demo activity', { activityIsDemo: true }, 'demo'], ['demo rubric', { rubricIsDemo: true }, 'demo'],
    ['draft activity', { activityPublished: false }, 'unpublished'], ['draft rubric', { rubricPublished: false }, 'unpublished'], ['unapproved values', { rubricValuesApproved: false }, 'values_unapproved'],
    ['another version', { activityVersion: '2.0.0' }, 'version_not_allowed'], ['another activity', { activityCode: 'act_other' }, 'version_not_allowed'],
    ['another rubric than the pinned one', { rubricVersion: 'rub_int@2' }, 'rubric_not_pinned'], ['an audit anomaly', { claimAnomaly: true }, 'claim_anomaly'],
    ['a legacy result (no per-skill attribution)', { perSkill: [] }, 'legacy_no_per_skill'], ['an incomplete (undetermined) evaluation', { evaluationOutcome: 'undetermined' }, 'incomplete'],
    ['a pending human review', { evaluationOutcome: 'needs_human_review' }, 'review_pending'], ['a pending criterion', { pendingHumanCriteria: 1 }, 'review_pending'],
    ['a failed integrity check', { integrityFailed: true }, 'integrity_failed'], ['blocked by checks', { evaluationOutcome: 'blocked_by_checks' }, 'integrity_failed'],
    ['withdrawn evidence voids the pass', { evidenceWithdrawn: 1 }, 'evidence_withdrawn'], ['no standing evidence', { evidenceStanding: 0 }, 'no_standing_evidence'],
  ];
  for (const [label, o, reason] of cases) test(`${label} ⇒ ${reason}`, () => assert.equal(integratedExclusion(fact(o), P), reason));
  test('an eligible result is not excluded', () => assert.equal(integratedExclusion(fact(), P), null));
});

describe('EXT-1 pass rules — the approved rubric decides; no threshold is invented', () => {
  test('PR-2: every gate and mandatory criterion met ⇒ passed (a non-mandatory quality criterion does not decide)', () => {
    assert.equal(integratedPassVerdict(fact(), 'PR-2').verdict, 'passed');
    assert.equal(integratedPassVerdict(fact({ criteria: [{ key: 'g1', kind: 'gate', mandatory: false, status: 'not_met', score: 0, maxScore: 1 }, { key: 'm1', kind: 'skill_evidence', mandatory: true, status: 'met', score: 2, maxScore: 2 }] }), 'PR-2').verdict, 'failed', 'a gate is always required');
    assert.equal(integratedPassVerdict(fact({ criteria: [{ key: 'm1', kind: 'skill_evidence', mandatory: true, status: 'below_threshold', score: 1, maxScore: 2 }] }), 'PR-2').verdict, 'failed');
    assert.equal(integratedPassVerdict(fact({ criteria: [{ key: 'm1', kind: 'skill_evidence', mandatory: true, status: null, score: null, maxScore: 2 }] }), 'PR-2').verdict, 'indeterminate');
    assert.equal(integratedPassVerdict(fact({ criteria: [{ key: 'q1', kind: 'quality', mandatory: false, status: 'met', score: 2, maxScore: 2 }] }), 'PR-2').verdict, 'indeterminate', 'nothing required ⇒ never a pass over nothing');
  });
  test('PR-1: PR-2 plus the APPROVED pass threshold; an unapproved threshold is indeterminate, never assumed', () => {
    assert.equal(integratedPassVerdict(fact(), 'PR-1').verdict, 'failed', '3/5 = 0.6 < 0.75');
    assert.equal(integratedPassVerdict(fact({ passThreshold: 0.5 }), 'PR-1').verdict, 'passed');
    assert.equal(integratedPassVerdict(fact({ passThreshold: 0.5, passThresholdApproved: false }), 'PR-1').verdict, 'indeterminate');
    assert.equal(integratedPassVerdict(fact({ passThreshold: null }), 'PR-1').verdict, 'indeterminate');
  });
});

describe('EXT-1 outcome — completion ≠ assessment success ≠ readiness; per-skill attribution kept', () => {
  test('not attempted ⇒ not_satisfied; attempted but only excluded results ⇒ not_satisfied; review pending ⇒ indeterminate', () => {
    assert.deepEqual([evaluateIntegratedAssessment({ params: P, results: [], submissions: 0 }).outcome, evaluateIntegratedAssessment({ params: P, results: [], submissions: 0 }).completion],
      ['not_satisfied', { submitted: 0, finalResults: 0, passed: false }]);
    const done = evaluateIntegratedAssessment({ params: P, results: [fact({ activityIsDemo: true })], submissions: 1 });
    assert.equal(done.outcome, 'not_satisfied'); assert.equal(done.completion.submitted, 1, 'completed the activity'); assert.equal(done.completion.passed, false, 'but no assessment success');
    assert.equal(evaluateIntegratedAssessment({ params: P, results: [fact({ pendingHumanCriteria: 2 })], submissions: 1 }).outcome, 'indeterminate');
  });
  test('a passed, eligible result ⇒ satisfied; the audit lists each skill\'s own result, unmerged (one met, one not met)', () => {
    const a = evaluateIntegratedAssessment({ params: P, results: [fact({ evaluationOutcome: 'below_threshold', criteria: [{ key: 'g1', kind: 'gate', mandatory: true, status: 'not_met', score: 0, maxScore: 1 }] }), fact()], submissions: 2 });
    assert.equal(a.outcome, 'satisfied'); assert.equal(a.completion.passed, true);
    assert.deepEqual(a.counted!.perSkill, [{ skillId: 'html', outcome: 'met', decision: 'accepted' }, { skillId: 'ui', outcome: 'not_met', decision: 'not_applicable' }]);
    assert.ok(a.judged.some((j) => j.verdict === 'failed'), 'the earlier failed attempt is recorded, not hidden');
  });
  test('failed only ⇒ not_satisfied; the same result can pass PR-2 and fail PR-1', () => {
    const r = fact();
    assert.equal(evaluateIntegratedAssessment({ params: P, results: [r], submissions: 1 }).outcome, 'satisfied');
    assert.equal(evaluateIntegratedAssessment({ params: { ...P, pass_rule: 'PR-1' }, results: [r], submissions: 1 }).outcome, 'not_satisfied');
  });
  test('in a rule set the EXT-1 rule keeps the set pending_validation and never yields a verdict; missing facts ⇒ indeterminate', () => {
    const set = { id: 's', key: 'k', version: 1, reviewStatus: 'approved', activation: 'production_active', baselineOf: null, approvedBy: 'x', label: 'x', targetRoleId: null,
      rules: [{ id: 'r1', type: 'integrated_assessment_passed', params: { activity_code: 'act_int', allowed: [{ activity_version: '1.0.0', rubric_version: 'rub_int@1' }], pass_rule: 'PR-2', require_concluded_review: true },
        skillId: null, labelAr: 'x', labelEn: 'EXT-1', enabled: true, position: 1 }] } as unknown as ReadinessRuleSet;
    const rep = evaluateReadiness({ ruleSet: set, resolution: 'production_active', facts: [], evidence: { tasks: {}, understanding: {}, production: true, integrated: { act_int: { results: [fact()], submissions: 1 } } } });
    assert.equal(rep.status, 'pending_validation'); assert.equal(rep.overall, null); assert.equal(rep.rules[0]!.outcome, 'satisfied');
    assert.equal(evaluateReadiness({ ruleSet: set, resolution: 'production_active', facts: [] }).rules[0]!.outcome, 'indeterminate');
    const withSkill = { ...set, rules: [{ ...set.rules[0]!, skillId: 'html' }] } as ReadinessRuleSet;
    assert.throws(() => evaluateReadiness({ ruleSet: withSkill, resolution: 'production_active', facts: [] }), DomainError);
  });
});
