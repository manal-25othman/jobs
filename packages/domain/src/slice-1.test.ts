/**
 * Vertical Slice 1 domain rules: evaluator, verification, CV bullet, report.
 * Negative cases carry as much weight as positive ones.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  runDeterministicEvaluation, assertRubricProposalSane, generateCvBullet,
  assertAssetTransition, buildCareerEvidenceReport, toPublicReport,
  assertReportLeaksNothing, NO_AI_DISCLOSURE, REPORT_ALLOWED_FIELDS,
  decideVerification, verificationApplies, verificationSafeState,
  assertEvaluationStateTransition, assertVerificationStateTransition,
  assertTransitionAllowed, InvariantViolation, MissingPrerequisite, IllegalTransition,
  type PublishedRubric, type SubmissionArtifact, type IntegrityCheckSpec,
  type CvBulletSource, type ReportSkillEntry,
} from './index.js';

/* ──────────────────────────────── fixtures ─────────────────────────────── */

const SKILL = 'skl_ui_state';

const rubric: PublishedRubric = {
  rubricVersionId: 'rv_1',
  version: 'rub_fe_003@0.2.0',
  activitySpecId: 'as_1',
  activitySpecVersion: 'act_fe_003@0.2.0',
  status: 'published',
  passThreshold: 1,
  proposesState: 'demonstrated',
  criteria: [
    { key: 'empty_state_test', label: 'Empty-state test', maxScore: 1, skillId: SKILL, mandatory: true,
      check: { type: 'artifact_present', artifactKey: 'test.empty_state' },
      rationaleWhenMet: 'A test covers the empty state.',
      rationaleWhenUnmet: 'No test covers the empty state.' },
    { key: 'loading_state_test', label: 'Loading-state test', maxScore: 1, skillId: SKILL, mandatory: true,
      check: { type: 'artifact_present', artifactKey: 'test.loading_state' },
      rationaleWhenMet: 'A test covers the loading state.',
      rationaleWhenUnmet: 'No test covers the loading state.' },
    { key: 'error_message_visible', label: 'Error message shown to the user', maxScore: 1, skillId: SKILL, mandatory: true,
      check: { type: 'artifact_present', artifactKey: 'test.error_message' },
      rationaleWhenMet: 'The error path shows the user a message.',
      rationaleWhenUnmet: 'The error path does not show the user a message.' },
    { key: 'coverage_note', label: 'Coverage note', maxScore: 1, skillId: SKILL, mandatory: false,
      check: { type: 'artifact_text', artifactKey: 'note.coverage', minLength: 20 },
      rationaleWhenMet: 'A note states what the tests cover and what they do not.',
      rationaleWhenUnmet: 'No coverage note was provided.' },
  ],
};

const integritySpecs: readonly IntegrityCheckSpec[] = [
  { key: 'files_present', classification: 'user_facing', blocking: true,
    check: { type: 'all_of', artifactKeys: ['file.component', 'file.test'] },
    userFacingMessage: 'Both the component and its test file must be attached.' },
  { key: 'tests_reference_component', classification: 'assessment_only', blocking: false,
    check: { type: 'artifact_present', artifactKey: 'signal.tests_reference_component' },
    userFacingMessage: null },
];

const fullArtifacts: readonly SubmissionArtifact[] = [
  { key: 'file.component', kind: 'file', valueText: 'HabitList.jsx', locator: 'HabitList.jsx' },
  { key: 'file.test', kind: 'file', valueText: 'HabitList.test.jsx', locator: 'HabitList.test.jsx' },
  { key: 'test.empty_state', kind: 'boolean', valueBool: true, locator: 'HabitList.test.jsx:12' },
  { key: 'test.loading_state', kind: 'boolean', valueBool: true, locator: 'HabitList.test.jsx:28' },
  { key: 'test.error_message', kind: 'boolean', valueBool: true, locator: 'HabitList.test.jsx:44' },
  { key: 'note.coverage', kind: 'text', valueText: 'Covers empty, loading and error; does not cover pagination.', locator: 'notes.md' },
  { key: 'signal.tests_reference_component', kind: 'boolean', valueBool: true },
];

/* ─────────────────────────── the evaluator ─────────────────────────────── */

describe('deterministic evaluator', () => {
  test('a complete submission passes and proposes demonstrated', () => {
    const run = runDeterministicEvaluation({
      rubric, artifacts: fullArtifacts, integritySpecs, currentState: 'practiced',
    });
    assert.equal(run.outcome, 'passed');
    assert.equal(run.proposedState, 'demonstrated');
    assert.equal(run.totalScore, 4);
    assert.equal(run.criteria.length, 4);
    for (const c of run.criteria) assert.ok(c.rationale.length > 0, 'every score carries a rationale');
  });

  test('it is deterministic: the same input gives the same result', () => {
    const a = runDeterministicEvaluation({ rubric, artifacts: fullArtifacts, integritySpecs, currentState: 'practiced' });
    const b = runDeterministicEvaluation({ rubric, artifacts: fullArtifacts, integritySpecs, currentState: 'practiced' });
    assert.deepEqual(a, b);
  });

  test('a missed mandatory criterion cannot be compensated by the others', () => {
    const artifacts = fullArtifacts.filter((a) => a.key !== 'test.error_message');
    const run = runDeterministicEvaluation({ rubric, artifacts, integritySpecs, currentState: 'practiced' });
    assert.equal(run.outcome, 'below_threshold');
    assert.equal(run.proposedState, null, 'a failed run proposes no promotion');
    assert.match(run.reason, /mandatory criteria not met/);
  });

  test('a blocking integrity failure stops the pipeline before scoring', () => {
    const artifacts = fullArtifacts.filter((a) => a.key !== 'file.test');
    const run = runDeterministicEvaluation({ rubric, artifacts, integritySpecs, currentState: 'practiced' });
    assert.equal(run.outcome, 'blocked_by_checks');
    assert.equal(run.criteria.length, 0, 'nothing is scored once a blocking check fails');
    assert.equal(run.proposedState, null);
  });

  test('assessment-only integrity detail never carries a user-facing message', () => {
    const run = runDeterministicEvaluation({ rubric, artifacts: fullArtifacts, integritySpecs, currentState: 'practiced' });
    const assessmentOnly = run.integrityChecks.filter((c) => c.classification === 'assessment_only');
    assert.ok(assessmentOnly.length > 0);
    for (const c of assessmentOnly) assert.equal(c.message, null);
  });

  test('a pass proposes nothing when the claim is already at or above that state', () => {
    const run = runDeterministicEvaluation({
      rubric, artifacts: fullArtifacts, integritySpecs, currentState: 'demonstrated',
    });
    assert.equal(run.outcome, 'passed');
    assert.equal(run.proposedState, null);
  });

  test('a draft rubric is refused', () => {
    const draft = { ...rubric, status: 'draft' } as unknown as PublishedRubric;
    assert.throws(
      () => runDeterministicEvaluation({ rubric: draft, artifacts: fullArtifacts, integritySpecs, currentState: 'practiced' }),
      InvariantViolation,
    );
  });

  test('a rubric may not propose Verified', () => {
    assert.doesNotThrow(() => assertRubricProposalSane(rubric));
    assert.throws(
      () => assertRubricProposalSane({ ...rubric, proposesState: 'verified' }),
      InvariantViolation,
    );
  });

  test('a pass PROPOSES; the transition guard still decides', () => {
    const run = runDeterministicEvaluation({ rubric, artifacts: fullArtifacts, integritySpecs, currentState: 'practiced' });
    assert.equal(run.proposedState, 'demonstrated');
    // Without a rubric version on the transition request, INV-2 still refuses.
    assert.throws(
      () => assertTransitionAllowed({ from: 'practiced', to: 'demonstrated', evaluationId: 'e1', actor: 'system' }),
      InvariantViolation,
    );
    // With it, the promotion is allowed.
    const rule = assertTransitionAllowed({
      from: 'practiced', to: 'demonstrated',
      evaluationId: 'e1', rubricVersion: run.rubricVersion, actor: 'system',
    });
    assert.equal(rule.id, 'T-DEMO-FROM-PRACTICED');
  });
});

/* ───────────────────────────── verification ────────────────────────────── */

describe('verification is a separate concept from evaluation', () => {
  test('it applies only to a passing evaluation', () => {
    assert.equal(verificationApplies('passed'), true);
    assert.equal(verificationApplies('below_threshold'), false);
    assert.equal(verificationApplies('blocked_by_checks'), false);
  });

  test('accepted holds the proposed state', () => {
    const d = decideVerification({
      evaluationOutcome: 'passed', proposedState: 'demonstrated', currentState: 'practiced',
      outcome: 'accepted', reason: 'criteria and evidence line up',
    });
    assert.equal(d.resultingState, 'demonstrated');
  });

  test('downgraded refuses the promotion without demoting the user', () => {
    const d = decideVerification({
      evaluationOutcome: 'passed', proposedState: 'demonstrated', currentState: 'practiced',
      outcome: 'downgraded', reason: 'the error test asserts the wrong thing',
    });
    assert.equal(d.resultingState, 'practiced', 'holds; v1 models no backward movement');
  });

  test('escalation and exceptions require a named human reviewer', () => {
    assert.throws(
      () => decideVerification({
        evaluationOutcome: 'passed', proposedState: 'demonstrated', currentState: 'practiced',
        outcome: 'escalated_to_human', reason: 'ambiguous',
      }),
      MissingPrerequisite,
    );
    assert.throws(
      () => decideVerification({
        evaluationOutcome: 'passed', proposedState: 'verified', currentState: 'demonstrated',
        outcome: 'exception_granted', reason: 'single-activity exception',
      }),
      MissingPrerequisite,
    );
  });

  test('a decision with no reason is not a decision', () => {
    assert.throws(
      () => decideVerification({
        evaluationOutcome: 'passed', proposedState: 'demonstrated', currentState: 'practiced',
        outcome: 'accepted', reason: '   ',
      }),
      MissingPrerequisite,
    );
  });

  test('safe mode on failure holds the current state', () => {
    assert.equal(verificationSafeState('practiced'), 'practiced');
  });

  test('the two lifecycles are distinct state machines', () => {
    assert.doesNotThrow(() => assertEvaluationStateTransition('queued', 'running'));
    assert.throws(() => assertEvaluationStateTransition('queued', 'completed'), IllegalTransition);
    assert.doesNotThrow(() => assertVerificationStateTransition('evaluating', 'downgraded'));
    assert.throws(() => assertVerificationStateTransition('pending', 'accepted'), IllegalTransition);
  });
});

/* ────────────────────────────── CV bullet ──────────────────────────────── */

const bulletSource: CvBulletSource = {
  evidenceId: 'ev_1',
  skillId: SKILL,
  skillLabelAr: 'اختبار الواجهات',
  skillLabelEn: 'UI testing',
  evidenceState: 'demonstrated',
  projectTitle: 'متتبّع عادات',
  evaluationResultId: 'er_1',
  rubricVersion: rubric.version,
  criteria: [
    { criterionId: 'empty_state_test', score: 1, maxScore: 1, rationale: 'r', supportingExcerpt: null, skillId: SKILL, confidence: 1 },
    { criterionId: 'loading_state_test', score: 1, maxScore: 1, rationale: 'r', supportingExcerpt: null, skillId: SKILL, confidence: 1 },
  ],
  declaredTechnologies: [],
};

describe('CV bullet is generated only from supported evidence', () => {
  test('a demonstrated claim produces a traced bullet', () => {
    const b = generateCvBullet(bulletSource);
    assert.equal(b.status, 'draft');
    assert.equal(b.draftingAidUsed, false);
    assert.deepEqual([...b.derivedFromEvidenceIds], ['ev_1']);
    assert.ok(b.traces.length >= 4, 'every clause traces to something');
    assert.ok(b.bodyAr.includes('متتبّع عادات'));
    assert.ok(b.bodyEn.includes('UI testing'));
  });

  test('a practiced claim cannot produce a bullet', () => {
    assert.throws(
      () => generateCvBullet({ ...bulletSource, evidenceState: 'practiced' }),
      InvariantViolation,
    );
  });

  test('a self-reported claim cannot produce a bullet', () => {
    assert.throws(
      () => generateCvBullet({ ...bulletSource, evidenceState: 'self_reported' }),
      InvariantViolation,
    );
  });

  test('no bullet without an evidence record', () => {
    assert.throws(() => generateCvBullet({ ...bulletSource, evidenceId: '' }), InvariantViolation);
  });

  test('no bullet when no criterion was actually met', () => {
    assert.throws(
      () => generateCvBullet({
        ...bulletSource,
        criteria: [{ criterionId: 'x', score: 0, maxScore: 1, rationale: 'r', supportingExcerpt: null, skillId: SKILL, confidence: 1 }],
      }),
      MissingPrerequisite,
    );
  });

  test('no framework is inferred: technologies appear only when declared', () => {
    const without = generateCvBullet(bulletSource);
    assert.ok(!/React|JavaScript|Next\.js|TypeScript/i.test(without.bodyEn),
      'the platform is built with React; that says nothing about the user');
    const withTech = generateCvBullet({ ...bulletSource, declaredTechnologies: ['React'] });
    assert.ok(withTech.bodyEn.includes('React'));
    assert.ok(withTech.traces.some((t) => t.ref === 'user_declared_technologies'));
  });

  test('no invented metric: the template never emits a percentage', () => {
    const b = generateCvBullet(bulletSource);
    assert.ok(!/\d\s*%/.test(b.bodyAr) && !/\d\s*%/.test(b.bodyEn));
  });

  test('mastery language is refused', () => {
    // The template cannot produce it; the guard proves the rule holds anyway.
    const { assertNoUnsupportedLanguage } = require('./cv-bullet.js') as typeof import('./cv-bullet.js');
    assert.throws(() => assertNoUnsupportedLanguage('أتقنت اختبار الواجهات', 'ok'), InvariantViolation);
    assert.throws(() => assertNoUnsupportedLanguage('ok', 'Expert in UI testing'), InvariantViolation);
  });
});

describe('asset approval lifecycle', () => {
  test('draft → preview → approved → active, with approval required', () => {
    assert.doesNotThrow(() => assertAssetTransition('draft', 'preview', {}));
    assert.throws(() => assertAssetTransition('preview', 'approved', { userApprovedAt: null }), MissingPrerequisite);
    assert.doesNotThrow(() => assertAssetTransition('preview', 'approved', { userApprovedAt: '2026-09-26T10:00:00Z' }));
    assert.doesNotThrow(() => assertAssetTransition('approved', 'active', { userApprovedAt: '2026-09-26T10:00:00Z' }));
  });

  test('a draft cannot jump straight to active', () => {
    assert.throws(
      () => assertAssetTransition('draft', 'active', { userApprovedAt: '2026-09-26T10:00:00Z' }),
      MissingPrerequisite,
    );
  });
});

/* ──────────────────────── career evidence report ───────────────────────── */

const skillEntry: ReportSkillEntry = {
  skillLabel: 'UI testing',
  evidenceState: 'demonstrated',
  stateReason: 'a short check passed on all mandatory criteria',
  source: { projectTitle: 'Habit tracker', kind: 'platform_activity' },
  evaluationSummary: {
    outcome: 'passed', score: 4, maxScore: 4, rubricVersion: rubric.version,
    evaluatedAt: '2026-09-26T10:00:00.000Z',
    criteria: [{ label: 'Empty-state test', met: true, rationale: 'A test covers the empty state.' }],
  },
  integrityResult: { allPassed: true, userFacingChecks: [{ label: 'files_present', passed: true }] },
};

describe('career evidence report', () => {
  test('it is built from allowed fields only', () => {
    const r = buildCareerEvidenceReport({
      targetRole: { label: 'Frontend Developer', reviewStatus: 'reviewed' },
      skills: [skillEntry],
      approvedAssets: [{ kind: 'cv_bullet', body: 'Worked on ...', approvedAt: '2026-09-26T11:00:00.000Z' }],
      generatedAt: '2026-09-26T12:00:00.000Z',
    });
    for (const key of Object.keys(r)) {
      assert.ok(
        [...REPORT_ALLOWED_FIELDS, 'skills', 'professionalAssets', 'scopeNote'].includes(key),
        `unexpected report field '${key}'`,
      );
    }
    assert.equal(r.aiDisclosure, NO_AI_DISCLOSURE);
  });

  test('an unapproved asset never appears', () => {
    assert.throws(
      () => buildCareerEvidenceReport({
        targetRole: { label: 'x', reviewStatus: 'reviewed' },
        skills: [skillEntry],
        approvedAssets: [{ kind: 'cv_bullet', body: 'b', approvedAt: '' }],
        generatedAt: 'now',
      }),
      InvariantViolation,
    );
  });

  test('a gap or self-reported skill never appears in an evidence report', () => {
    for (const state of ['gap', 'self_reported'] as const) {
      assert.throws(
        () => buildCareerEvidenceReport({
          targetRole: { label: 'x', reviewStatus: 'reviewed' },
          skills: [{ ...skillEntry, evidenceState: state }],
          approvedAssets: [], generatedAt: 'now',
        }),
        InvariantViolation,
        `${state} should be refused`,
      );
    }
  });

  test('a forbidden key anywhere in the object is refused', () => {
    assert.throws(
      () => assertReportLeaksNothing({ skills: [{ nested: { objectPath: 'submissions/a/b.zip' } }] }),
      InvariantViolation,
    );
    assert.throws(
      () => assertReportLeaksNothing({ reviewerNote: 'private' }),
      InvariantViolation,
    );
  });

  test('the public projection is strictly narrower than the private report', () => {
    const r = buildCareerEvidenceReport({
      targetRole: { label: 'Frontend Developer', reviewStatus: 'reviewed' },
      skills: [skillEntry, { ...skillEntry, skillLabel: 'Component building', evidenceState: 'practiced' }],
      approvedAssets: [{ kind: 'cv_bullet', body: 'b', approvedAt: '2026-09-26T11:00:00.000Z' }],
      generatedAt: '2026-09-26T12:00:00.000Z',
    });
    const pub = toPublicReport(r);
    assert.equal(pub.skills.length, 1, 'practiced is work in progress and is not shown publicly');
    assert.equal(pub.skills[0]!.evidenceState, 'demonstrated');
    // Evaluation detail, integrity results and state reasons stay private.
    const serialised = JSON.stringify(pub);
    assert.ok(!serialised.includes('evaluationSummary'));
    assert.ok(!serialised.includes('integrityResult'));
    assert.ok(!serialised.includes('stateReason'));
    assert.ok(!serialised.includes('rubricVersion'));
  });
});
