/**
 * D-118 — critical verification-integrity remediation (pure rules).
 * A declaration or an upload never earns a level; client-supplied platform
 * facts are refused; the legacy basis never decides in production.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertClientArtifactAllowed, assessmentBasis, decideWithPolicy, verificationPolicyFromRow, CLIENT_FORBIDDEN_ARTIFACT_PREFIXES,
  DomainError, type VerificationPolicy, type PublishedRubric, type SubmissionArtifact, type ArtifactProvenance,
} from './index.js';

const SAFETY: VerificationPolicy = {
  id: 'p2', key: 'default', version: 2, reviewStatus: 'draft', appliesOutcomes: ['passed'], acceptRubricProposal: true, maxResultingState: null,
  minAssessmentConfidence: null, minIndependentEvidence: null, escalateOn: {}, blockingRule: 'mandatory_criteria_unmet_blocks', perSkillEvidenceDerivation: false,
  decisionActors: ['policy', 'human'], promotionBasis: 'independently_verified', practicedOnSubmission: false,
};
const LEGACY: VerificationPolicy = { ...SAFETY, id: 'p1', version: 1, promotionBasis: 'legacy_any_pass', practicedOnSubmission: true };
const passed = { evaluationOutcome: 'passed' as const, proposedState: 'demonstrated' as const, currentState: 'gap' as const, assessmentEvaluatorKind: 'rule' as const,
  assessmentConfidence: 1, independentEvidenceCount: 0, reason: 'r' };

/** The slice-1 demo rubric: every skill criterion is a rule over a user checkbox / note. */
const DEMO: Pick<PublishedRubric, 'criteria'> = { criteria: [
  { key: 'empty_state_test', label: 'x', maxScore: 1, skillId: 's', mandatory: true, check: { type: 'artifact_present', artifactKey: 'test.empty_state' }, rationaleWhenMet: '', rationaleWhenUnmet: '' },
  { key: 'loading_state_test', label: 'x', maxScore: 1, skillId: 's', mandatory: true, check: { type: 'artifact_present', artifactKey: 'test.loading_state' }, rationaleWhenMet: '', rationaleWhenUnmet: '' },
  { key: 'coverage_note', label: 'x', maxScore: 1, skillId: 's', mandatory: false, check: { type: 'artifact_text', artifactKey: 'note.coverage', minLength: 20 }, rationaleWhenMet: '', rationaleWhenUnmet: '' },
] } as unknown as Pick<PublishedRubric, 'criteria'>;
/** A pack activity: human skill criteria + a rule gate. */
const HUMAN: Pick<PublishedRubric, 'criteria'> = { criteria: [
  { key: 'semantic_structure', label: 'x', maxScore: 3, skillId: 's', mandatory: true, evaluatorType: 'human', check: null, rationaleWhenMet: '', rationaleWhenUnmet: '' },
  { key: 'deliverables_complete', label: 'x', maxScore: 1, kind: 'gate', skillId: null, mandatory: true, check: { type: 'all_of', artifactKeys: ['file.index_html'] }, rationaleWhenMet: '', rationaleWhenUnmet: '' },
] } as unknown as Pick<PublishedRubric, 'criteria'>;
type A = SubmissionArtifact & { provenance?: ArtifactProvenance };
const ticked: A[] = [{ key: 'test.empty_state', kind: 'boolean', valueBool: true }, { key: 'test.loading_state', kind: 'boolean', valueBool: true },
  { key: 'note.coverage', kind: 'text', valueText: 'covers empty and loading states thoroughly' }];

describe('client-supplied artifacts', () => {
  test('platform-owned namespaces are refused: forged signals, verified facts, follow-ups, file and link impersonation', () => {
    for (const key of ['signal.tests_reference_component', 'verified.tests_pass', 'followup.answer', 'file.component', 'link.repository']) {
      assert.throws(() => assertClientArtifactAllowed({ key }), DomainError, key);
    }
    assert.deepEqual([...CLIENT_FORBIDDEN_ARTIFACT_PREFIXES].sort(), ['file.', 'followup.', 'link.', 'signal.', 'verified.']);
  });
  test('declarations stay allowed (they are recorded as declarations, formative only)', () => {
    for (const key of ['test.empty_state', 'note.coverage', 'answer.clarification']) assert.doesNotThrow(() => assertClientArtifactAllowed({ key }));
  });
});

describe('assessment basis: what independently verifies a criterion', () => {
  test('three ticked checkboxes and a note never verify anything', () => {
    const b = assessmentBasis({ rubric: DEMO, artifacts: ticked, humanDecidedCriteria: [], rubricValuesApproved: true, rubricIsDemo: false });
    assert.equal(b.independentlyVerified, false);
    assert.ok(b.reasons.some((r) => /declaration by the submitter/.test(r)));
  });
  test('uploaded files and links prove submission, not content', () => {
    const files: A[] = ticked.map((a) => ({ ...a, provenance: 'uploaded_file' as const }));
    assert.equal(assessmentBasis({ rubric: DEMO, artifacts: files, humanDecidedCriteria: [], rubricValuesApproved: true, rubricIsDemo: false }).independentlyVerified, false);
    const links: A[] = ticked.map((a) => ({ ...a, provenance: 'submitted_link' as const }));
    assert.equal(assessmentBasis({ rubric: DEMO, artifacts: links, humanDecidedCriteria: [], rubricValuesApproved: true, rubricIsDemo: false }).independentlyVerified, false);
  });
  test('missing artifacts are named, never assumed', () => {
    const b = assessmentBasis({ rubric: DEMO, artifacts: [], humanDecidedCriteria: [], rubricValuesApproved: true, rubricIsDemo: false });
    assert.ok(b.reasons.some((r) => /is missing/.test(r)));
  });
  test('platform-verified artifacts verify a rule criterion (the namespace a future test runner writes)', () => {
    const verified: A[] = ticked.map((a) => ({ ...a, provenance: 'platform_verified' as const }));
    assert.equal(assessmentBasis({ rubric: DEMO, artifacts: verified, humanDecidedCriteria: [], rubricValuesApproved: true, rubricIsDemo: false }).independentlyVerified, true);
  });
  test('human criteria verify only once a reviewer decided them; a gate may rest on submitted material', () => {
    const files: A[] = [{ key: 'file.index_html', kind: 'file', provenance: 'uploaded_file' }];
    assert.equal(assessmentBasis({ rubric: HUMAN, artifacts: files, humanDecidedCriteria: [], rubricValuesApproved: true, rubricIsDemo: false }).independentlyVerified, false);
    assert.equal(assessmentBasis({ rubric: HUMAN, artifacts: files, humanDecidedCriteria: ['semantic_structure'], rubricValuesApproved: true, rubricIsDemo: false }).independentlyVerified, true);
  });
  test('unapproved rubric values or demo content never support a level, even when reviewed', () => {
    const files: A[] = [{ key: 'file.index_html', kind: 'file', provenance: 'uploaded_file' }];
    const b1 = assessmentBasis({ rubric: HUMAN, artifacts: files, humanDecidedCriteria: ['semantic_structure'], rubricValuesApproved: false, rubricIsDemo: false });
    assert.equal(b1.independentlyVerified, false); assert.ok(b1.reasons.some((r) => /not approved by a named SME/.test(r)));
    const b2 = assessmentBasis({ rubric: HUMAN, artifacts: files, humanDecidedCriteria: ['semantic_structure'], rubricValuesApproved: true, rubricIsDemo: true });
    assert.equal(b2.independentlyVerified, false); assert.ok(b2.reasons.some((r) => /DEMO/.test(r)));
  });
});

describe('the decision', () => {
  const declared = assessmentBasis({ rubric: DEMO, artifacts: ticked, humanDecidedCriteria: [], rubricValuesApproved: false, rubricIsDemo: true });
  test('safety basis: a declared pass is assessment_pending_validation — no level, no legacy verification row', () => {
    const d = decideWithPolicy(SAFETY, { ...passed, basis: declared });
    assert.equal(d.decision, 'assessment_pending_validation'); assert.equal(d.resultingState, 'gap'); assert.equal(d.legacyOutcome, null);
    assert.match(d.reason, /declaration by the submitter/);
  });
  test('safety basis with no basis supplied fails closed', () => {
    assert.equal(decideWithPolicy(SAFETY, passed).decision, 'assessment_pending_validation');
  });
  test('safety basis with an independently verified assessment accepts the proposal', () => {
    const d = decideWithPolicy(SAFETY, { ...passed, basis: { independentlyVerified: true, reasons: [] } });
    assert.deepEqual([d.decision, d.resultingState], ['accepted', 'demonstrated']);
  });
  test('the current level is preserved when pending (practiced stays practiced)', () => {
    const d = decideWithPolicy(SAFETY, { ...passed, currentState: 'practiced', basis: declared });
    assert.deepEqual([d.decision, d.previousState, d.resultingState], ['assessment_pending_validation', 'practiced', 'practiced']);
  });
  test('a below-threshold run is not_applicable as before (never pending, never promoted)', () => {
    assert.equal(decideWithPolicy(SAFETY, { ...passed, evaluationOutcome: 'below_threshold', proposedState: null, basis: declared }).decision, 'not_applicable');
  });
  test('legacy basis never decides a level in production', () => {
    const d = decideWithPolicy(LEGACY, { ...passed, production: true, basis: { independentlyVerified: true, reasons: [] } });
    assert.equal(d.decision, 'assessment_pending_validation'); assert.equal(d.resultingState, 'gap');
  });
  test('legacy basis outside production keeps the pre-remediation behaviour (development/test compatibility)', () => {
    assert.equal(decideWithPolicy(LEGACY, { ...passed, basis: declared }).decision, 'accepted');
  });
  test('a row read without the new columns is the safety basis (fail closed)', () => {
    const p = verificationPolicyFromRow({ id: 'x', key: 'default', version: 9, review_status: 'draft', applies_outcomes: ['passed'], accept_rubric_proposal: true, max_resulting_state: null,
      min_assessment_confidence: null, min_independent_evidence: null, escalate_on: {}, blocking_rule: 'mandatory_criteria_unmet_blocks', per_skill_evidence_derivation: false, decision_actors: ['policy'] });
    assert.deepEqual([p.promotionBasis, p.practicedOnSubmission], ['independently_verified', false]);
    assert.throws(() => verificationPolicyFromRow({ ...{ id: 'x', key: 'default', version: 9, review_status: 'draft', applies_outcomes: ['passed'], accept_rubric_proposal: true, max_resulting_state: null,
      min_assessment_confidence: null, min_independent_evidence: null, escalate_on: {}, blocking_rule: 'mandatory_criteria_unmet_blocks', per_skill_evidence_derivation: false, decision_actors: ['policy'] }, promotion_basis: 'trust_me' }), /unknown promotion basis/);
  });
});
