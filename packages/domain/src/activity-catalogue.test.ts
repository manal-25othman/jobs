/**
 * Graduate activity journey, Phase 1 — pure rules: visibility, assessment mode,
 * explicit deliverable mapping, work status.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentVisibleToGraduate, activityVisibleToGraduate, activityAssessmentMode, resolveDeliverableFileMapping, explicitFileMappingRequired,
  workStatus, assessmentBasis, DeliverableMappingRefused, DomainError, AUTOMATED_VERIFICATION_ENABLED,
  type PublishedRubric, type DeliverableSpec,
} from './index.js';

const REVIEW_STATES = ['draft', 'curated', 'sme_reviewed', 'approved', 'published', 'superseded', 'rejected', 'needs_revision'];

describe('content visibility', () => {
  test('non-demo content is visible only when published, wherever demo content is visible or not', () => {
    for (const demoContentVisible of [true, false]) {
      for (const s of REVIEW_STATES) {
        assert.equal(contentVisibleToGraduate({ reviewStatus: s, isDemo: false, demoContentVisible }), s === 'published', `${s} demoVisible=${demoContentVisible}`);
      }
    }
  });
  test('demo content is never visible where demo content is off (production), and never when retired', () => {
    for (const s of REVIEW_STATES) assert.equal(contentVisibleToGraduate({ reviewStatus: s, isDemo: true, demoContentVisible: false }), false, s);
    for (const s of REVIEW_STATES) {
      assert.equal(contentVisibleToGraduate({ reviewStatus: s, isDemo: true, demoContentVisible: true }), !['superseded', 'rejected'].includes(s), s);
    }
  });
  test('an activity must be published; a demo one needs demo visibility', () => {
    assert.equal(activityVisibleToGraduate({ status: 'published', isDemo: false, demoContentVisible: false }), true);
    assert.equal(activityVisibleToGraduate({ status: 'published', isDemo: true, demoContentVisible: false }), false);
    assert.equal(activityVisibleToGraduate({ status: 'published', isDemo: true, demoContentVisible: true }), true);
    for (const s of REVIEW_STATES.filter((x) => x !== 'published')) {
      assert.equal(activityVisibleToGraduate({ status: s, isDemo: false, demoContentVisible: true }), false, s);
      assert.equal(activityVisibleToGraduate({ status: s, isDemo: true, demoContentVisible: true }), false, s);
    }
  });
});

const crit = (key: string, o: Record<string, unknown> = {}) => ({ key, label: key, maxScore: 1, skillId: 's', mandatory: true, check: null, rationaleWhenMet: '', rationaleWhenUnmet: '', ...o });
const rubric = (...criteria: unknown[]) => ({ criteria }) as unknown as Pick<PublishedRubric, 'criteria'>;
const HUMAN = rubric(crit('a', { evaluatorType: 'human' }), crit('b', { evaluatorType: 'human' }),
  crit('gate', { kind: 'gate', skillId: null, check: { type: 'all_of', artifactKeys: ['file.index_html'] } }));
const DECLARED = rubric(crit('t', { check: { type: 'artifact_present', artifactKey: 'test.empty_state' } }), crit('n', { check: { type: 'artifact_text', artifactKey: 'note.coverage', minLength: 20 } }));
const MIXED = rubric(crit('a', { evaluatorType: 'human' }), crit('t', { check: { type: 'artifact_present', artifactKey: 'test.empty_state' } }));
const VERIFIED_ONLY = rubric(crit('v', { check: { type: 'artifact_present', artifactKey: 'verified.tests_pass' } }));
const ok = { rubricValuesApproved: true, rubricIsDemo: false, activityIsDemo: false, canYieldDemonstrated: true };

describe('activity assessment mode (derived, never chosen)', () => {
  test('human_reviewed only when every skill criterion is human, values SME-approved, nothing demo, and the activity may yield Demonstrated', () => {
    const r = activityAssessmentMode({ rubric: HUMAN, ...ok });
    assert.deepEqual([r.mode, r.evaluable, r.canSupportLevel, r.reasons.length], ['human_reviewed', true, true, 0]);
    for (const [k, v] of [['rubricValuesApproved', false], ['rubricIsDemo', true], ['activityIsDemo', true], ['canYieldDemonstrated', false]] as const) {
      const x = activityAssessmentMode({ rubric: HUMAN, ...ok, [k]: v });
      assert.equal(x.mode, 'formative_only', k); assert.equal(x.canSupportLevel, false, k); assert.ok(x.reasons.length > 0, k);
    }
  });
  test('declaration-based and mixed rubrics are formative only, with reasons naming the criteria', () => {
    for (const r of [DECLARED, MIXED]) {
      const x = activityAssessmentMode({ rubric: r, ...ok });
      assert.equal(x.mode, 'formative_only'); assert.ok(x.reasons.some((m) => m.includes("'t'")));
    }
  });
  test('no published rubric: not evaluable, formative only', () => {
    const x = activityAssessmentMode({ rubric: null, ...ok });
    assert.deepEqual([x.mode, x.evaluable, x.canSupportLevel], ['formative_only', false, false]);
  });
  test('automated_verified is reserved and never returned, even for a rubric over verified.* facts only', () => {
    assert.equal(AUTOMATED_VERIFICATION_ENABLED, false);
    const x = activityAssessmentMode({ rubric: VERIFIED_ONLY, ...ok });
    assert.equal(x.mode, 'formative_only');
    assert.ok(x.reasons.some((m) => m.includes('automated verification is not enabled')));
    for (const r of [HUMAN, DECLARED, MIXED, VERIFIED_ONLY]) for (const v of [true, false]) {
      assert.notEqual(activityAssessmentMode({ rubric: r, ...ok, rubricValuesApproved: v }).mode, 'automated_verified');
    }
  });
  test('equivalence with the evaluation-time rule: human_reviewed ⇔ assessmentBasis passes once every human criterion is decided', () => {
    for (const r of [HUMAN, DECLARED, MIXED, VERIFIED_ONLY]) for (const approved of [true, false]) for (const demo of [true, false]) {
      const mode = activityAssessmentMode({ rubric: r, rubricValuesApproved: approved, rubricIsDemo: demo, activityIsDemo: false, canYieldDemonstrated: true });
      const humans = r.criteria.filter((c) => (c.kind ?? 'skill_evidence') === 'skill_evidence' && c.evaluatorType === 'human').map((c) => c.key);
      const basis = assessmentBasis({ rubric: r, artifacts: [], humanDecidedCriteria: humans, rubricValuesApproved: approved, rubricIsDemo: demo });
      assert.equal(mode.mode === 'human_reviewed', basis.independentlyVerified, JSON.stringify({ approved, demo }));
    }
  });
});

const D: DeliverableSpec[] = [
  { key: 'file.index_html', format: 'source file', mandatory: true, position: 0 },
  { key: 'file.styles_css', format: 'source file', mandatory: true, position: 1 },
  { key: 'file.extra_js', format: 'source file', mandatory: false, position: 2 },
  { key: 'note.data_flow', format: 'text', mandatory: true, position: 3 },
];
const reason = (fn: () => unknown): string => { try { fn(); } catch (e) { assert.ok(e instanceof DeliverableMappingRefused && e instanceof DomainError); return e.reason; } return 'no error'; };

describe('explicit deliverable mapping', () => {
  test('files map to the keys named, whatever order they arrive in', () => {
    const a = resolveDeliverableFileMapping(D, [{ uploadId: 'u1', deliverableKey: 'file.index_html' }, { uploadId: 'u2', deliverableKey: 'file.styles_css' }]);
    const b = resolveDeliverableFileMapping(D, [{ uploadId: 'u2', deliverableKey: 'file.styles_css' }, { uploadId: 'u1', deliverableKey: 'file.index_html' }]);
    const byUpload = (xs: { uploadId: string; key: string }[]) => Object.fromEntries(xs.map((x) => [x.uploadId, x.key]));
    assert.deepEqual(byUpload(a), { u1: 'file.index_html', u2: 'file.styles_css' });
    assert.deepEqual(byUpload(b), byUpload(a));
    assert.ok(a.every((x) => x.resolvedFrom === 'explicit_mapping'));
    assert.equal(resolveDeliverableFileMapping(D, [{ uploadId: 'u1', deliverableKey: 'file.index_html' }, { uploadId: 'u2', deliverableKey: 'file.styles_css' }, { uploadId: 'u3', deliverableKey: 'file.extra_js' }]).length, 3);
  });
  test('refusals are named: missing, duplicate, unexpected, mismatched, malformed', () => {
    assert.equal(reason(() => resolveDeliverableFileMapping(D, [{ uploadId: 'u1', deliverableKey: 'file.index_html' }])), 'missing_mandatory_deliverable');
    assert.equal(reason(() => resolveDeliverableFileMapping(D, [{ uploadId: 'u1', deliverableKey: 'file.index_html' }, { uploadId: 'u2', deliverableKey: 'file.index_html' }])), 'duplicate_deliverable');
    assert.equal(reason(() => resolveDeliverableFileMapping(D, [{ uploadId: 'u1', deliverableKey: 'file.index_html' }, { uploadId: 'u1', deliverableKey: 'file.styles_css' }])), 'duplicate_upload');
    assert.equal(reason(() => resolveDeliverableFileMapping(D, [{ uploadId: 'u1', deliverableKey: 'file.made_up' }])), 'unexpected_deliverable');
    assert.equal(reason(() => resolveDeliverableFileMapping(D, [{ uploadId: 'u1', deliverableKey: 'note.data_flow' }])), 'deliverable_format_mismatch');
    for (const bad of [[{ uploadId: 'u1' }], [{ deliverableKey: 'file.index_html' }], [null], [{ uploadId: 1, deliverableKey: 'file.index_html' }], [{ uploadId: '', deliverableKey: 'file.index_html' }]]) {
      assert.equal(reason(() => resolveDeliverableFileMapping(D, bad as never)), 'malformed_file_mapping', JSON.stringify(bad));
    }
    assert.equal(reason(() => resolveDeliverableFileMapping(D, 'u1' as never)), 'malformed_file_mapping');
    assert.equal(reason(() => resolveDeliverableFileMapping(D.filter((d) => d.format === 'text'), [{ uploadId: 'u1', deliverableKey: 'note.data_flow' }])), 'no_file_deliverables');
  });
  test('explicit mapping is required whenever the activity declares a file deliverable', () => {
    assert.equal(explicitFileMappingRequired(D), true);
    assert.equal(explicitFileMappingRequired(D.filter((d) => d.format === 'text')), false);
    assert.equal(explicitFileMappingRequired([]), false);
  });
});

describe('work status (authoritative records only)', () => {
  const base = { hasSubmission: true, evaluationState: 'completed', outcome: 'passed', decision: 'accepted', levelChanged: true };
  test('each state', () => {
    assert.equal(workStatus({ ...base, hasSubmission: false }), 'in_progress');
    assert.equal(workStatus({ ...base, evaluationState: null }), 'submitted');
    assert.equal(workStatus({ ...base, evaluationState: 'queued_for_human' }), 'under_human_review');
    assert.equal(workStatus({ ...base, evaluationState: 'running' }), 'evaluation_running');
    assert.equal(workStatus({ ...base, evaluationState: 'failed' }), 'evaluation_failed');
    assert.equal(workStatus({ ...base, outcome: 'blocked_by_checks', decision: null, levelChanged: false }), 'blocked_by_checks');
    assert.equal(workStatus({ ...base, decision: 'assessment_pending_validation', levelChanged: false }), 'pending_validation');
    assert.equal(workStatus(base), 'level_recorded');
    assert.equal(workStatus({ ...base, outcome: 'below_threshold', decision: 'not_applicable', levelChanged: false }), 'feedback_ready');
  });
  test('a pending-validation decision never reads as a level change', () => {
    assert.equal(workStatus({ ...base, decision: 'assessment_pending_validation', levelChanged: true }), 'pending_validation');
  });
});
