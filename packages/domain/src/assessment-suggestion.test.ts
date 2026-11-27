import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCriterion, assertSuggestionGrounded, calibrationMetrics, type CriterionSuggestionInput, type SuggestionContext } from './assessment-suggestion.js';

const shadow: SuggestionContext = { packApproved: false, calibrationApproved: false, gamingSignals: [], injectionSuspected: false };
const tests = (observation: 'all_passed' | 'some_failed' | 'inconclusive' | 'human_only') =>
  ({ criterionKey: 'c', automatedPassed: 1, automatedFailed: observation === 'some_failed' ? 1 : 0, automatedInconclusive: 0, supportsHuman: 0, observation });
const base: CriterionSuggestionInput = { criterionKey: 'responsive_fixed', mandatory: true, evaluatorType: 'rule', ruleMet: null, ruleExcerpt: null, tests: tests('all_passed'),
  testLabels: [{ labelAr: 'لا تمرير أفقي على عرض 360', outcome: 'pass', mode: 'automated' }] };

test('shadow stage: every suggestion escalates, whatever the confidence', () => {
  const s = suggestCriterion(base, shadow);
  assert.equal(s.suggestion, 'met'); assert.equal(s.escalate, true);
  assert.ok(s.escalationReasons.includes('calibration_not_approved'));
  assert.ok(s.confidence <= 0.65, 'a mandatory criterion met on tests alone is capped (Q3 is the costly error)');
  assert.doesNotThrow(() => assertSuggestionGrounded(s, base));
});

test('failed tests suggest unmet and cite the failed test; a human criterion gets a capped suggestion only where tests observe it', () => {
  const failing = { ...base, tests: tests('some_failed'), testLabels: [...base.testLabels, { labelAr: 'العمود الجانبي على 1024', outcome: 'fail', mode: 'automated' }] };
  const s = suggestCriterion(failing, shadow);
  assert.equal(s.suggestion, 'unmet'); assert.equal(s.excerptAr, 'العمود الجانبي على 1024');
  const h = suggestCriterion({ ...base, evaluatorType: 'human' }, shadow);
  assert.equal(h.suggestion, 'met', 'tests observe it, so a suggestion is offered'); assert.ok(h.confidence <= 0.4, 'capped for a mandatory human criterion');
  assert.ok(h.escalationReasons.includes('human_criterion'));
  const hNone = suggestCriterion({ ...base, evaluatorType: 'human', tests: null, testLabels: [] }, shadow);
  assert.equal(hNone.suggestion, 'uncertain'); assert.equal(hNone.confidence, 0);
});

test('conflicting signals and gaming lower confidence and escalate', () => {
  const c = suggestCriterion({ ...base, ruleMet: false, ruleExcerpt: 'notes.md' }, shadow);
  assert.equal(c.suggestion, 'uncertain'); assert.ok(c.escalationReasons.includes('signals_conflict'));
  const g = suggestCriterion({ ...base, ruleMet: true, ruleExcerpt: 'notes.md' }, { ...shadow, gamingSignals: ['automation_probe'] });
  assert.ok(g.confidence <= 0.3); assert.ok(g.escalationReasons.includes('gaming_signals'));
});

test('an invented excerpt or an unescalated suggestion is refused', () => {
  const s = suggestCriterion(base, shadow);
  assert.throws(() => assertSuggestionGrounded({ ...s, excerptAr: 'اختبار مخترع' }, base), /a13_ungrounded/);
  assert.throws(() => assertSuggestionGrounded({ ...s, escalate: false }, base), /a13_not_escalated/);
});

test('calibration metrics: agreement, kappa, false accept on mandatory, rejection sensitivity, escalation', () => {
  const r = calibrationMetrics([
    { criterionKey: 'a', suggested: 'met', reference: 'met', mandatory: true, escalated: true },
    { criterionKey: 'b', suggested: 'unmet', reference: 'unmet', mandatory: true, escalated: true },
    { criterionKey: 'c', suggested: 'met', reference: 'unmet', mandatory: true, escalated: true },
    { criterionKey: 'd', suggested: 'uncertain', reference: 'met', mandatory: false, escalated: true },
  ]);
  assert.equal(r.n, 4); assert.equal(r.decidedShare, 0.75); assert.equal(r.rawAgreement, 0.667);
  assert.equal(r.falseAcceptMandatory, 0.5); assert.equal(r.trueRejectRate, 0.5); assert.equal(r.falseRejectRate, 0);
  assert.equal(r.unescalatedErrorRate, 0); assert.equal(r.escalationRate, 1);
  assert.match(r.noticeAr, /لا تمنح اعتمادًا آليًا/);
});

test('integrity signals block a «met» built on passing tests; a failed reviewer signal suggests a weak «unmet»', () => {
  const tampered = suggestCriterion(base, { ...shadow, gamingSignals: ['provided_service_modified'] });
  assert.equal(tampered.suggestion, 'uncertain'); assert.ok(tampered.escalationReasons.includes('integrity_blocks_met'));
  const dataOnly = suggestCriterion(base, { ...shadow, gamingSignals: ['provided_data_changed'] });
  assert.equal(dataOnly.suggestion, 'met', 'a changed data file only escalates');
  const weak = suggestCriterion({ ...base, evaluatorType: 'human', tests: tests('human_only'), testLabels: [{ labelAr: 'حجم التغيير مقارنة بمواد البداية', outcome: 'fail', mode: 'supports_human' }] }, shadow);
  assert.equal(weak.suggestion, 'unmet'); assert.ok(weak.confidence <= 0.35); assert.ok(weak.escalationReasons.includes('reviewer_signal_failed'));
  assert.doesNotThrow(() => assertSuggestionGrounded(weak, { ...base, evaluatorType: 'human', tests: tests('human_only'), testLabels: [{ labelAr: 'حجم التغيير مقارنة بمواد البداية', outcome: 'fail', mode: 'supports_human' }] }));
  const conflict = suggestCriterion({ ...base, testLabels: [...base.testLabels, { labelAr: 'إشارة للمراجِع', outcome: 'fail', mode: 'supports_human' }] }, shadow);
  assert.equal(conflict.suggestion, 'uncertain');
});
