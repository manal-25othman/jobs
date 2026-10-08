/**
 * Phase 6 — disclosure questionnaire as data; integrity signals as facts; no AI-detection theatre.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDisclosureAnswers, assertQuestionnaireSane, questionVisible, legacyFieldsToAnswers, assertModeRespected, assertDisclosureDidNotLowerScore,
  assertSignalWellFormed, assertObservableSource, assertNoDetectionTheatre, signalFromDisclosure, signalsFromIntegrityChecks, signalFromChallengeResult,
  assertChallengeIssuable, assertChallengeTransition, buildAssessmentContext, CONTEXT_INPUT_KINDS, FORBIDDEN_INFERENCE_METHODS, DISCLOSURE_SCORE_EFFECT,
  DISCLOSURE_REQUIRES_HUMAN_REVIEW, INTEGRITY_SIGNAL_OUTCOME_EFFECT, CHALLENGE_INTRO_AR, DISCLOSURE_INTRO_AR,
  DomainError, InvariantViolation, MissingPrerequisite, IllegalTransition,
  type DisclosureQuestionnaire, type DisclosureQuestion, type IntegritySignalType, type ChallengePolicy, type AssessmentContextPolicy,
} from './index.js';

const Q = (over: Partial<DisclosureQuestion> & { key: string; position: number }): DisclosureQuestion =>
  ({ id: `q-${over.key}`, promptAr: over.key, promptEn: over.key, helpAr: null, answerType: 'free_text', options: [], required: false, showIf: {}, mapsTo: null, ...over });
const OPTS = [{ value: 'explain_concepts', labelAr: 'شرح', labelEn: 'Explain' }, { value: 'generate_code', labelAr: 'توليد', labelEn: 'Generate' }];
const V2: DisclosureQuestionnaire = {
  id: 'qn2', key: 'ai_usage', version: 2, reviewStatus: 'draft', activation: 'development_only', baselineOf: null, approvedBy: null, labelAr: 'x', introAr: DISCLOSURE_INTRO_AR,
  questions: [
    Q({ key: 'used_ai', position: 1, answerType: 'yes_no', required: true, mapsTo: 'ai_use_declared' }),
    Q({ key: 'used_for', position: 2, answerType: 'multi_choice', options: OPTS, required: true, showIf: { used_ai: true }, mapsTo: 'declared_use' }),
    Q({ key: 'changed_myself', position: 3, showIf: { used_ai: true } }),
    Q({ key: 'understood_or_debugged', position: 4, mapsTo: 'explanation' }),
  ],
};
const V1: DisclosureQuestionnaire = { ...V2, version: 1, activation: 'legacy_baseline', baselineOf: 'pre_0016', questions: [
  Q({ key: 'ai_help', position: 1, answerType: 'text_list', mapsTo: 'declared_use' }), Q({ key: 'explanation', position: 2, mapsTo: 'explanation' }) ] };

describe('disclosure questionnaire — configuration, validated per version', () => {
  test('answers map onto the legacy facts; hidden questions are dropped; required visible questions are enforced', () => {
    const yes = validateDisclosureAnswers(V2, { used_ai: true, used_for: ['generate_code', 'generate_code'], changed_myself: '  rewrote the reducer ', understood_or_debugged: 'the race in fetch' });
    assert.deepEqual(yes.declaredUse, ['generate_code']); assert.equal(yes.aiUseDeclared, true); assert.equal(yes.explanation, 'the race in fetch');
    assert.equal(yes.answers.find((a) => a.question.key === 'changed_myself')!.answer, 'rewrote the reducer');
    const no = validateDisclosureAnswers(V2, { used_ai: false, used_for: ['generate_code'], changed_myself: 'x' });
    assert.deepEqual(no.declaredUse, [], 'answers to hidden questions are not taken'); assert.equal(no.aiUseDeclared, false);
    assert.deepEqual(no.answers.map((a) => a.question.key), ['used_ai']);
    assert.throws(() => validateDisclosureAnswers(V2, {}), MissingPrerequisite);
    assert.throws(() => validateDisclosureAnswers(V2, { used_ai: true }), /used_for/);
    assert.throws(() => validateDisclosureAnswers(V2, { used_ai: 'yes' }), DomainError);
    assert.throws(() => validateDisclosureAnswers(V2, { used_ai: true, used_for: ['telepathy'] }), /not options/);
    assert.throws(() => validateDisclosureAnswers(V2, { used_ai: false, mood: 'fine' }), /not a question/);
  });
  test('disclosure has no score effect and never requires human review by itself', () => {
    assert.equal(DISCLOSURE_SCORE_EFFECT, 'none'); assert.equal(DISCLOSURE_REQUIRES_HUMAN_REVIEW, false);
    const v = validateDisclosureAnswers(V2, { used_ai: true, used_for: ['generate_code'] });
    assert.equal(v.scoreEffect, 'none'); assert.equal(v.requiresHumanReview, false);
    assert.doesNotThrow(() => assertDisclosureDidNotLowerScore(4, 4));
  });
  test('the activity mode still governs: declared AI authoring on ai_prohibited is refused (INV-7), via the mapped answers', () => {
    const v = validateDisclosureAnswers(V2, { used_ai: true, used_for: ['generate_code'] });
    assert.throws(() => assertModeRespected({ mode: 'ai_prohibited', userDeclaredUse: v.declaredUse }), InvariantViolation);
    assert.doesNotThrow(() => assertModeRespected({ mode: 'ai_prohibited', userDeclaredUse: validateDisclosureAnswers(V2, { used_ai: false }).declaredUse }));
  });
  test('the legacy API shape is expressed as answers to the baseline questionnaire', () => {
    const a = legacyFieldsToAnswers(V1, { declaredUse: ['explanation'], explanation: 'I read the docs' });
    const v = validateDisclosureAnswers(V1, a);
    assert.deepEqual(v.declaredUse, ['explanation']); assert.equal(v.explanation, 'I read the docs');
    assert.deepEqual(validateDisclosureAnswers(V1, legacyFieldsToAnswers(V1, { declaredUse: [] })).answers, []);
  });
  test('NEGATIVE: malformed questionnaires are refused', () => {
    assert.throws(() => assertQuestionnaireSane({ ...V2, questions: [...V2.questions, Q({ key: 'used_ai', position: 9 })] }), /duplicate question key/);
    assert.throws(() => assertQuestionnaireSane({ ...V2, questions: [Q({ key: 'a', position: 1, showIf: { later: true } }), Q({ key: 'later', position: 2 })] }), /EARLIER/);
    assert.throws(() => assertQuestionnaireSane({ ...V2, questions: [Q({ key: 'a', position: 1, answerType: 'single_choice' })] }), /needs options/);
    assert.throws(() => assertQuestionnaireSane({ ...V2, questions: [Q({ key: 'a', position: 1, mapsTo: 'ai_use_declared' })] }), /yes\/no/);
    assert.equal(questionVisible(V2.questions[1]!, { used_ai: false }), false);
  });
});

describe('integrity signals — observable facts, never verdicts, never detection', () => {
  const TYPE: IntegritySignalType = { code: 'deterministic_check_unmet', allowedSources: ['deterministic_check'], direction: 'neutral_context' };
  test('no AI-detection theatre: detection methods and verdict keys are refused anywhere', () => {
    for (const m of FORBIDDEN_INFERENCE_METHODS) assert.throws(() => assertObservableSource(m), InvariantViolation);
    assert.throws(() => assertObservableSource('vibes'), DomainError);
    assert.throws(() => assertNoDetectionTheatre({ details: { ai_probability: 0.87 } }), /detection score/);
    assert.throws(() => assertNoDetectionTheatre({ fraud: true }), InvariantViolation);
    assert.throws(() => assertNoDetectionTheatre({ x: [{ cheating_score: 3 }] }), InvariantViolation);
    assert.throws(() => assertNoDetectionTheatre({ writing_style_analysis: {} }), /theatre/);
    const ok = signalsFromIntegrityChecks([{ key: 'files_present', passed: false, classification: 'user_facing' }])[0]!;
    assert.doesNotThrow(() => assertSignalWellFormed(TYPE, ok));
    assert.throws(() => assertSignalWellFormed(TYPE, { ...ok, details: { ai_generated_percent: 87 } }), InvariantViolation);
    assert.throws(() => assertSignalWellFormed(TYPE, { ...ok, source: 'disclosure' }), /does not accept/);
    assert.throws(() => assertSignalWellFormed(TYPE, { ...ok, observation: ' ' }), MissingPrerequisite);
    assert.equal(INTEGRITY_SIGNAL_OUTCOME_EFFECT, 'none');
  });
  test('declaring AI use produces a neutral context signal; only failed checks produce check signals', () => {
    const d = signalFromDisclosure({ disclosureId: 'd', questionnaireRef: 'ai_usage@2', aiUseDeclared: true, answeredCount: 3 });
    assert.equal(d.signalType, 'disclosure_recorded'); assert.match(d.observation, /AI use declared: yes/); assert.equal(d.confidence, null);
    const checks = signalsFromIntegrityChecks([{ key: 'a', passed: true, classification: 'user_facing' }, { key: 'b', passed: false, classification: 'assessment_only' }]);
    assert.equal(checks.length, 1); assert.equal(checks[0]!.visibility, 'assessment_only');
  });
  test('a challenge result is an observation about understanding', () => {
    const s = signalFromChallengeResult({ challengeInstanceId: 'c', outcome: 'understanding_not_shown', observations: 'could not say what the reducer returns on error', confidence: 0.6, policyKey: 'default', policyVersion: 1 });
    assert.equal(s.signalType, 'challenge_understanding_not_shown'); assert.equal(s.source, 'challenge_response');
    assert.throws(() => signalFromChallengeResult({ challengeInstanceId: 'c', outcome: 'cheated' as never, observations: 'x', confidence: null, policyKey: null, policyVersion: null }), DomainError);
  });
});

describe('challenges — nothing issuable while nothing is validated and active', () => {
  const policy: ChallengePolicy = { id: 'p', key: 'default', version: 1, reviewStatus: 'draft', activation: 'inactive', baselineOf: null, approvedBy: null, triggerRule: {}, challengeTypes: ['predict_output'], maxChallenges: null };
  const disabled = { code: 'predict_output', enabled: false, reviewStatus: 'draft', approvedBy: null };
  const enabled = { code: 'predict_output', enabled: true, reviewStatus: 'approved', approvedBy: 'sme' };
  test('refused: disabled/draft type; inactive policy; type not listed. Allowed only when both are validated and active', () => {
    assert.throws(() => assertChallengeIssuable({ type: disabled, issuedBy: 'human_reviewer', policy: null, production: false }), /DRAFT \/ NOT VALIDATED/);
    assert.throws(() => assertChallengeIssuable({ type: enabled, issuedBy: 'policy', policy, production: false }), /not active/);
    assert.throws(() => assertChallengeIssuable({ type: enabled, issuedBy: 'policy', policy: { ...policy, activation: 'development_only', challengeTypes: [] }, production: false }), /does not list/);
    assert.throws(() => assertChallengeIssuable({ type: enabled, issuedBy: 'policy', policy: { ...policy, activation: 'development_only' }, production: true }), /not active/);
    assert.doesNotThrow(() => assertChallengeIssuable({ type: enabled, issuedBy: 'policy', policy: { ...policy, activation: 'development_only' }, production: false }));
    assert.doesNotThrow(() => assertChallengeIssuable({ type: enabled, issuedBy: 'human_reviewer', policy: null, production: true }));
  });
  test('lifecycle is forward-only; the user-facing wording is a verification step, not an accusation', () => {
    assert.doesNotThrow(() => assertChallengeTransition('issued', 'answered'));
    assert.throws(() => assertChallengeTransition('reviewed', 'issued'), IllegalTransition);
    assert.throws(() => assertChallengeTransition('issued', 'reviewed'), IllegalTransition);
    assert.equal(CHALLENGE_INTRO_AR, 'خطوة تحقق قصيرة تساعدنا على تأكيد فهمك للعمل');
  });
});

describe('integrity signals reach an assessment only through a context policy', () => {
  test('the baseline context excludes integrity signals; a future policy can include them; identity never passes', () => {
    assert.ok(CONTEXT_INPUT_KINDS.includes('integrity_signals'));
    const baseline: AssessmentContextPolicy = { id: 'c', key: 'default', version: 1, reviewStatus: 'draft', activation: 'legacy_baseline', baselineOf: 'pre', approvedBy: null,
      inputs: { submission_artifacts: 'required', ai_disclosure: 'required', user_identity: 'excluded', user_profile: 'excluded' } };
    const ctx = buildAssessmentContext(baseline, { submission_artifacts: ['a'], ai_disclosure: {}, integrity_signals: ['s1'] });
    assert.ok(ctx.excluded.includes('integrity_signals')); assert.equal('integrity_signals' in ctx.included, false);
    const future = buildAssessmentContext({ ...baseline, inputs: { ...baseline.inputs, integrity_signals: 'optional' } }, { submission_artifacts: ['a'], ai_disclosure: {}, integrity_signals: ['s1'] });
    assert.deepEqual(future.included['integrity_signals'], ['s1']);
  });
});
