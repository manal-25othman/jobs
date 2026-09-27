import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDeterministicEvaluation, aggregateWithHumanDecisions, skillsEvidencedByRun, resolveCanonicalSkillId, canonicalEvidenceStates, nearDuplicateCandidates,
  assertDuplicateResolutionWellFormed, criterionMayProduceEvidence, assertCriterionKindShape, artifactHasProducer, assertActiveChecksHaveProducers,
  integrityClassificationOf, DomainError, type PublishedRubric, type IntegrityCheckSpec,
} from './index.js';

/* ───────────── OPEN-039: canonical skill + alias, ids preserved ───────────── */
const skills = [
  { id: 'alias-1', status: 'merged_into' as const, mergedIntoId: 'canon-1' },
  { id: 'canon-1', status: 'active' as const, mergedIntoId: null },
  { id: 'other', status: 'active' as const, mergedIntoId: null },
];
describe('OPEN-039 — alias resolves to canonical; nothing is renamed or deleted', () => {
  test('1 — the alias keeps its id; lookups resolve to the canonical; an active skill resolves to itself', () => {
    assert.equal(resolveCanonicalSkillId(skills, 'alias-1'), 'canon-1');
    assert.equal(resolveCanonicalSkillId(skills, 'canon-1'), 'canon-1');
    assert.equal(resolveCanonicalSkillId(skills, 'other'), 'other');
    assert.equal(resolveCanonicalSkillId(skills, 'unknown'), 'unknown', 'an unknown id is returned unchanged — never invented');
    assert.equal(skills[0]!.id, 'alias-1', 'the alias row still exists under its original id');
  });
  test('a cycle or an over-long chain is a data error, not a guess', () => {
    assert.throws(() => resolveCanonicalSkillId([{ id: 'a', status: 'merged_into', mergedIntoId: 'b' }, { id: 'b', status: 'merged_into', mergedIntoId: 'a' }], 'a'), DomainError);
  });
  test('claim states on the alias count for the canonical skill; the higher state wins', () => {
    const st = canonicalEvidenceStates(skills, [{ skillId: 'alias-1', state: 'demonstrated' }, { skillId: 'canon-1', state: 'practiced' }, { skillId: 'other', state: 'gap' }]);
    assert.deepEqual(st, { 'canon-1': 'demonstrated', other: 'gap' });
  });
  test('2 — a merged alias is no longer an unresolved near-duplicate', () => {
    const pair = [
      { code: 'ui-state-management', nameEn: 'UI state management', nameAr: 'إدارة حالة الواجهة', status: 'active' as const },
      { code: 'skl_ui_state_interaction', nameEn: 'UI state & interaction handling', nameAr: 'إدارة حالة الواجهة والتفاعل', status: 'active' as const },
    ];
    assert.equal(nearDuplicateCandidates(pair).length, 1, 'before the decision the pair is proposed');
    assert.equal(nearDuplicateCandidates([{ ...pair[0]!, status: 'merged_into' }, pair[1]!]).length, 0, 'after the decision it is resolved');
  });
  test('a resolution is a documented human decision and only for equivalent pairs', () => {
    const known = new Set(['skl_ui_state_interaction']);
    assert.doesNotThrow(() => assertDuplicateResolutionWellFormed({ alias: 'ui-state-management', canonical: 'skl_ui_state_interaction', relation: 'equivalent', decided_by: 'R-1', decided_at: '2026-09-27', decision_ref: 'D-097', reason: 'same concept' }, known));
    assert.throws(() => assertDuplicateResolutionWellFormed({ alias: 'x', canonical: 'skl_ui_state_interaction', relation: 'related' as never, decided_by: 'R-1', decided_at: 'd', decision_ref: 'D', reason: 'r' }, known), /only an 'equivalent'/);
    assert.throws(() => assertDuplicateResolutionWellFormed({ alias: 'x', canonical: 'skl_ui_state_interaction', relation: 'equivalent', decided_by: '', decided_at: 'd', decision_ref: 'D', reason: 'r' }, known), /decided_by/);
    assert.throws(() => assertDuplicateResolutionWellFormed({ alias: 'x', canonical: 'nope', relation: 'equivalent', decided_by: 'R-1', decided_at: 'd', decision_ref: 'D', reason: 'r' }, known), /must be in the pack/);
  });
});

/* ───────────── OPEN-044: completeness is a gate, never skill evidence ───────────── */
const rubric: PublishedRubric = {
  rubricVersionId: 'rv', version: 'rub@0.2.0', activitySpecId: 'act', activitySpecVersion: '0.1.0', status: 'published', passThreshold: 0.75, proposesState: 'demonstrated',
  criteria: [
    { key: 'deliverables_complete', label: 'اكتمال المخرجات', maxScore: 1, kind: 'gate', skillId: null, mandatory: true, evaluatorType: 'rule', check: { type: 'all_of', artifactKeys: ['file.a', 'file.b'] }, rationaleWhenMet: 'مكتملة', rationaleWhenUnmet: 'ناقصة' },
    { key: 'structure', label: 'البنية', maxScore: 2, skillId: 's1', mandatory: true, evaluatorType: 'human', check: null, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
    { key: 'clarity', label: 'الوضوح', maxScore: 2, skillId: 's2', mandatory: false, evaluatorType: 'human', check: null, rationaleWhenMet: '-', rationaleWhenUnmet: '-' },
  ],
};
const arts = [{ key: 'file.a', kind: 'file' as const }, { key: 'file.b', kind: 'file' as const }];
const gate: IntegrityCheckSpec = { key: 'files_present', classification: 'user_facing', blocking: true, check: { type: 'all_of', artifactKeys: ['file.a', 'file.b'] }, userFacingMessage: 'أرفقي الملفين', mode: 'deterministic', active: true };

describe('OPEN-044 — the completeness criterion cannot produce skill evidence', () => {
  test('3 — a gate criterion names no skill, so it never appears among evidenced skills, even at full score', () => {
    assert.equal(criterionMayProduceEvidence(rubric.criteria[0]!), false);
    assert.equal(criterionMayProduceEvidence(rubric.criteria[1]!), true);
    const det = runDeterministicEvaluation({ rubric, artifacts: arts, integritySpecs: [gate], currentState: 'practiced' });
    assert.equal(det.criteria[0]!.score, 1, 'the gate is scored (it counts toward completeness)');
    assert.equal(det.criteria[0]!.skillId, null, 'but it is mapped to no skill');
    const fin = aggregateWithHumanDecisions({ rubric, deterministic: det, currentState: 'practiced', decisions: [
      { criterionKey: 'structure', score: 2, rationale: 'landmarks and ordered headings observed' }, { criterionKey: 'clarity', score: 2, rationale: 'a peer could follow the note' }] });
    assert.equal(fin.outcome, 'passed');
    assert.deepEqual([...skillsEvidencedByRun(rubric, fin)].sort(), ['s1', 's2'], 'only skill-evidence criteria speak for skills');
  });
  test('4 — a missing mandatory deliverable still blocks before any scoring or reviewer', () => {
    const det = runDeterministicEvaluation({ rubric, artifacts: [arts[0]!], integritySpecs: [gate], currentState: 'practiced' });
    assert.equal(det.outcome, 'blocked_by_checks'); assert.deepEqual(det.pendingHumanCriteria, []); assert.equal(det.criteria.length, 0);
    assert.throws(() => aggregateWithHumanDecisions({ rubric, deterministic: det, currentState: 'practiced', decisions: [] }), /cannot lift/);
  });
  test('the shape is enforced: a gate with a skill, or a skill criterion without one, is refused', () => {
    assert.throws(() => assertCriterionKindShape({ key: 'x', kind: 'gate', skillId: 's1', thresholdForSkill: null }), /must not be mapped to a skill/);
    assert.throws(() => assertCriterionKindShape({ key: 'x', kind: 'gate', skillId: null, thresholdForSkill: 0.5 }), /threshold does not apply/);
    assert.throws(() => assertCriterionKindShape({ key: 'x', skillId: null, thresholdForSkill: null }), /names none/);
    assert.doesNotThrow(() => assertCriterionKindShape({ key: 'x', kind: 'gate', skillId: null, thresholdForSkill: null }));
  });
});

/* ───────────── OPEN-045: no active check on a signal nothing produces ───────────── */
describe('OPEN-045 — integrity check evaluation modes', () => {
  test('5 — an active deterministic check on a producer-less artifact is refused; user artifacts have producers', () => {
    assert.equal(artifactHasProducer('file.app_js'), true); assert.equal(artifactHasProducer('note.decision'), true); assert.equal(artifactHasProducer('answer.explanation'), true);
    assert.equal(artifactHasProducer('signal.planted_field_count'), false); assert.equal(artifactHasProducer('followup.breakpoint_900'), false);
    assert.throws(() => assertActiveChecksHaveProducers([{ key: 'planted', check: { type: 'artifact_present', artifactKey: 'signal.x' } }]), /no producer/);
    assert.doesNotThrow(() => assertActiveChecksHaveProducers([
      { key: 'files', check: { type: 'all_of', artifactKeys: ['file.a'] } },
      { key: 'future', mode: 'future_deterministic', active: false, check: { type: 'artifact_present', artifactKey: 'signal.x' } },
      { key: 'human', mode: 'human_observable', check: { type: 'human_observation' } },
    ]));
  });
  test('6, 7, 8 — human-observable checks are handed to review, inactive checks never block, unregistered checks are simply not there', () => {
    const specs: IntegrityCheckSpec[] = [
      gate,
      { key: 'empty_response_edge', classification: 'assessment_only', blocking: false, mode: 'human_observable', userFacingMessage: null,
        check: { type: 'human_observation', criterionKey: 'structure', reviewerPromptAr: 'هل تُعرض حالة فارغة؟', reviewerPromptEn: 'Is an empty state rendered for []?', passWhenEn: 'an explicit empty state', failWhenEn: 'blank or error', affectsEvidence: true } },
      { key: 'output_consistency_layout', classification: 'assessment_only', blocking: true, mode: 'future_deterministic', active: false, userFacingMessage: null, check: { type: 'artifact_present', artifactKey: 'signal.output_consistency_layout' } },
    ];
    const det = runDeterministicEvaluation({ rubric, artifacts: arts, integritySpecs: specs, currentState: 'practiced' });
    assert.equal(det.outcome, 'needs_human_review', '7 — an inactive check, even marked blocking, cannot block');
    assert.deepEqual(det.integrityChecks.map((c) => c.key), ['files_present'], 'only the active deterministic check was evaluated');
    assert.deepEqual(det.deferredChecks, [{ key: 'empty_response_edge', reason: 'human_review' }, { key: 'output_consistency_layout', reason: 'inactive_no_producer' }]);
    assert.ok(!det.integrityChecks.some((c) => c.key === 'planted_field_count'), '8 — a removed check is not evaluated because it no longer exists');
  });
  test('the mandatory-deliverables gate is a user-facing check type (the user is told what to attach)', () => {
    assert.equal(integrityClassificationOf('mandatory_deliverables'), 'user_facing');
  });
});
