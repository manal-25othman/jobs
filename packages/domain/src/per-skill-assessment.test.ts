import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessSkill, assessSkills, applicableCriteria, sharedPrecondition, decideSkillAssessment, standingEvidenceForSkill, skillAssessmentKey,
  assertSkillAssessmentInvariants, PER_SKILL_MODEL_VERSION, DomainError, InvariantViolation,
  type PublishedRubric, type EvaluationRun, type SkillAssessmentInput, type VerificationPolicy, type EvidenceState, type RubricCriterion,
} from './index.js';

type C = RubricCriterion;
const crit = (key: string, skillId: string | null, o: Partial<C> = {}): C => ({
  key, label: key, maxScore: 2, kind: skillId ? 'skill_evidence' : 'gate', skillId, mandatory: true, evaluatorType: 'human', check: null,
  rationaleWhenMet: '-', rationaleWhenUnmet: '-', thresholdForSkill: skillId ? 0.5 : null, thresholdStatus: skillId ? 'approved' : null, ...o,
});
const rubricOf = (criteria: C[], o: Partial<PublishedRubric> = {}): PublishedRubric => ({
  rubricVersionId: 'rv1', version: 'rub@1', activitySpecId: 'act', activitySpecVersion: '1.0.0', status: 'published', passThreshold: 0.75, proposesState: 'demonstrated', criteria, ...o,
});
const runOf = (scores: Record<string, number>, o: Partial<EvaluationRun> = {}): EvaluationRun => ({
  outcome: 'passed', rubricVersion: 'rub@1', activitySpecVersion: '1.0.0',
  criteria: Object.entries(scores).map(([k, v]) => ({ criterionId: k, score: v, maxScore: 2, rationale: '-', supportingExcerpt: null, skillId: null, confidence: 1 })),
  integrityChecks: [], totalScore: 0, maxScore: 0, proposedState: null, reason: 'r', pendingHumanCriteria: [], deferredChecks: [], ...o,
});
const GATE = crit('gate', null, { maxScore: 1, evaluatorType: 'rule', check: { type: 'artifact_present', artifactKey: 'file.a' } });
const RUBRIC = rubricOf([GATE, crit('html_a', 'html'), crit('html_b', 'html'), crit('css_a', 'css'), crit('api_a', 'api')]);
const ALL_DECIDED = ['html_a', 'html_b', 'css_a', 'api_a'];
const input = (o: Partial<SkillAssessmentInput> = {}): SkillAssessmentInput => ({
  rubric: RUBRIC, run: runOf({ gate: 1, html_a: 2, html_b: 1, css_a: 0, api_a: 2 }), skillIds: ['html', 'css', 'api', 'js'], claimedSkillIds: ['html', 'css', 'api', 'js'],
  currentStates: {}, artifacts: [{ key: 'file.a', kind: 'file', provenance: 'uploaded_file' }], humanDecidedCriteria: ALL_DECIDED,
  rubricValuesApproved: true, rubricIsDemo: false, ...o,
});
const policy = (o: Partial<VerificationPolicy> = {}): VerificationPolicy => ({
  id: 'p', key: 'default', version: 2, reviewStatus: 'draft', appliesOutcomes: ['passed'], acceptRubricProposal: true, maxResultingState: null,
  minAssessmentConfidence: null, minIndependentEvidence: null, escalateOn: {}, blockingRule: 'mandatory_criteria_unmet_blocks', perSkillEvidenceDerivation: false,
  decisionActors: ['policy', 'human'], promotionBasis: 'independently_verified', practicedOnSubmission: false, ...o,
});
const byId = <T extends { skillId: string }>(xs: readonly T[]): Record<string, T> => Object.fromEntries(xs.map((x) => [x.skillId, x]));

describe('ENG-1 P1 — mixed outcomes in one activity: one skill never implies another', () => {
  test('html met, css not met, api met, js unmeasured — each from its own criteria', () => {
    const a = byId(assessSkills(input()));
    assert.equal(a['html']!.outcome, 'met'); assert.equal(a['html']!.proposedState, 'demonstrated');
    assert.equal(a['css']!.outcome, 'not_met'); assert.equal(a['css']!.proposedState, null); assert.match(a['css']!.reason, /css_a/);
    assert.equal(a['api']!.outcome, 'met');
    assert.equal(a['js']!.outcome, 'not_assessed'); assert.equal(a['js']!.proposedState, null);
    assert.deepEqual(a['html']!.criteria.map((c) => c.key), ['html_a', 'html_b'], 'cites only its own criteria');
    assert.doesNotMatch(a['html']!.reason, /css_a|api_a/);
  });
  test('INV-PS4: the activity pass rule is not an input — a below_threshold activity still lets a skill be met, a passed one still lets a skill fail', () => {
    for (const outcome of ['passed', 'below_threshold', 'needs_human_review'] as const) {
      const a = byId(assessSkills(input({ run: { ...input().run, outcome } })));
      assert.equal(a['html']!.outcome, 'met', outcome); assert.equal(a['css']!.outcome, 'not_met', outcome);
    }
  });
  test('the threshold is per skill: 1 of 2 meets an approved 0.5 threshold; full marks are not required', () => {
    assert.equal(assessSkill(input(), 'html').criteria.find((c) => c.key === 'html_b')!.status, 'met');
  });
});

describe('ENG-1 P1 — missing, pending and unapproved criteria', () => {
  test('a skill with no valid criterion is not_assessed — never promoted (a gate or zero-max criterion does not count)', () => {
    const r = rubricOf([GATE, crit('zero', 'js', { maxScore: 0 }), crit('html_a', 'html')]);
    const a = assessSkill(input({ rubric: r, run: runOf({ gate: 1, zero: 0, html_a: 2 }) }), 'js');
    assert.equal(a.outcome, 'not_assessed'); assert.equal(a.proposedState, null); assert.deepEqual(a.criteria, []);
  });
  test('a pending human criterion (or one with no score) leaves the skill incomplete', () => {
    assert.equal(assessSkill(input({ run: { ...input().run, pendingHumanCriteria: ['html_b'] } }), 'html').outcome, 'incomplete');
    assert.equal(assessSkill(input({ run: runOf({ gate: 1, html_a: 2 }) }), 'html').outcome, 'incomplete', 'html_b was never scored');
  });
  test('no fallback to full marks: an unapproved, missing or invalid threshold leaves the skill incomplete even at full marks', () => {
    for (const o of [{ thresholdStatus: 'proposed' }, { thresholdStatus: 'TBD' }, { thresholdForSkill: null }, { thresholdForSkill: 0 }, { thresholdForSkill: 1.5 }] as Partial<C>[]) {
      const r = rubricOf([GATE, crit('html_a', 'html', o)]);
      const a = assessSkill(input({ rubric: r, run: runOf({ gate: 1, html_a: 2 }) }), 'html');
      assert.equal(a.outcome, 'incomplete', JSON.stringify(o)); assert.equal(a.proposedState, null);
      assert.equal(a.criteria[0]!.status, 'threshold_unapproved');
    }
  });
  test('a definite failure wins over an undecided criterion: not_met', () => {
    assert.equal(assessSkill(input({ run: { ...runOf({ gate: 1, html_a: 0 }), pendingHumanCriteria: ['html_b'] } }), 'html').outcome, 'not_met');
  });
});

describe('ENG-1 P1 — a failed global integrity gate blocks every skill (INV-PS3)', () => {
  test('blocking integrity check ⇒ every skill blocked, no proposal', () => {
    for (const a of assessSkills(input({ run: { ...input().run, outcome: 'blocked_by_checks', criteria: [] } }))) {
      assert.equal(a.outcome, 'blocked'); assert.equal(a.proposedState, null);
    }
  });
  test('a gate criterion not met, or not scored ⇒ every skill blocked', () => {
    for (const run of [runOf({ gate: 0, html_a: 2, html_b: 2, css_a: 2, api_a: 2 }), runOf({ html_a: 2, html_b: 2, css_a: 2, api_a: 2 })]) {
      assert.ok(assessSkills(input({ run })).every((a) => a.outcome === 'blocked'));
    }
    assert.equal(sharedPrecondition(RUBRIC, runOf({ gate: 1 })).holds, true);
  });
});

describe('ENG-1 P1 — proposals come from each skill\'s OWN previous state', () => {
  test('html already demonstrated ⇒ no proposal for html; api at gap ⇒ proposal for api (the legacy F-4 coupling is gone)', () => {
    const a = byId(assessSkills(input({ currentStates: { html: 'demonstrated', api: 'gap' } })));
    assert.equal(a['html']!.outcome, 'met'); assert.equal(a['html']!.proposedState, null); assert.equal(a['html']!.currentState, 'demonstrated');
    assert.equal(a['api']!.proposedState, 'demonstrated'); assert.equal(a['api']!.currentState, 'gap');
  });
  test('a rubric may never propose Verified', () => {
    assert.throws(() => assessSkill(input({ rubric: { ...RUBRIC, proposesState: 'verified' } }), 'html'), InvariantViolation);
  });
});

describe('ENG-1 P1 — D-118 basis per skill: uploads, declarations and unchecked provenance never verify', () => {
  test('a skill whose criteria a named reviewer decided is independently verified; another skill resting on an uploaded file is not', () => {
    const r = rubricOf([GATE, crit('html_a', 'html'), crit('css_rule', 'css', { evaluatorType: 'rule', check: { type: 'artifact_present', artifactKey: 'file.a' } })]);
    const a = byId(assessSkills(input({ rubric: r, run: runOf({ gate: 1, html_a: 2, css_rule: 2 }), humanDecidedCriteria: ['html_a'] })));
    assert.equal(a['html']!.basis.independentlyVerified, true);
    assert.equal(a['css']!.basis.independentlyVerified, false); assert.match(a['css']!.basis.reasons.join(), /submitted file/);
  });
  test('declared and linked artifacts never verify; a human criterion not decided by a reviewer never verifies', () => {
    for (const provenance of ['declared', 'submitted_link', 'uploaded_file'] as const) {
      const r = rubricOf([GATE, crit('x', 'html', { evaluatorType: 'rule', check: { type: 'artifact_present', artifactKey: 'k' } })]);
      assert.equal(assessSkill(input({ rubric: r, run: runOf({ gate: 1, x: 2 }), artifacts: [{ key: 'file.a', kind: 'file' }, { key: 'k', kind: 'text', provenance }] }), 'html').basis.independentlyVerified, false, provenance);
    }
    assert.equal(assessSkill(input({ humanDecidedCriteria: [] }), 'html').basis.independentlyVerified, false);
  });
  test('demo content or unapproved rubric values ⇒ no skill is verified', () => {
    assert.ok(assessSkills(input({ rubricIsDemo: true })).every((a) => !a.basis.independentlyVerified));
    assert.ok(assessSkills(input({ rubricValuesApproved: false })).every((a) => !a.basis.independentlyVerified));
  });
});

describe('ENG-1 P1 — the decision for a skill reads only that skill\'s assessment', () => {
  const ctx = { independentEvidenceCount: 0, production: false, evaluatorKind: 'human' as const };
  test('met + verified basis ⇒ accepted for that skill alone; not_met ⇒ not_applicable citing its own criteria', () => {
    const a = byId(assessSkills(input()));
    const dh = decideSkillAssessment(policy(), a['html']!, ctx);
    assert.equal(dh.decision, 'accepted'); assert.equal(dh.resultingState, 'demonstrated'); assert.doesNotMatch(dh.reason, /css_a|api_a/);
    const dc = decideSkillAssessment(policy(), a['css']!, ctx);
    assert.equal(dc.decision, 'not_applicable'); assert.equal(dc.resultingState, 'gap'); assert.match(dc.reason, /css_a/);
  });
  test('met but not independently verified ⇒ assessment_pending_validation, level unchanged (D-118)', () => {
    const a = assessSkill(input({ rubricIsDemo: true }), 'html');
    const d = decideSkillAssessment(policy(), a, ctx);
    assert.equal(d.decision, 'assessment_pending_validation'); assert.equal(d.resultingState, 'gap');
  });
  test('an unclaimed skill is assessed for the record but never decided upward', () => {
    const a = assessSkill(input({ claimedSkillIds: ['css'] }), 'html');
    assert.equal(a.claimed, false); assert.equal(decideSkillAssessment(policy(), a, ctx).decision, 'not_applicable');
  });
  test('H6 stays off: a policy with per-skill derivation enabled is refused', () => {
    assert.throws(() => decideSkillAssessment(policy({ perSkillEvidenceDerivation: true }), assessSkill(input(), 'html'), ctx), DomainError);
  });
  test('an llm assessment can never decide a level (INV-3); Verified is never reached', () => {
    assert.throws(() => decideSkillAssessment(policy(), assessSkill(input(), 'html'), { ...ctx, evaluatorKind: 'llm' }), InvariantViolation);
    for (const a of assessSkills(input())) assert.notEqual(decideSkillAssessment(policy(), a, ctx).resultingState, 'verified');
  });
});

describe('ENG-1 P1 — revoked evidence and repeat evaluations', () => {
  test('standing evidence: withdrawn never counts; two rows from one result count once; other skills never count', () => {
    const rows = [
      { skillId: 'html', evaluationResultId: 'r1', withdrawnAt: null }, { skillId: 'html', evaluationResultId: 'r1', withdrawnAt: null },
      { skillId: 'html', evaluationResultId: 'r2', withdrawnAt: '2026-10-01' }, { skillId: 'html', evaluationResultId: 'r3', withdrawnAt: null },
      { skillId: 'css', evaluationResultId: 'r4', withdrawnAt: null }, { skillId: 'html', evaluationResultId: null, withdrawnAt: null },
    ];
    assert.equal(standingEvidenceForSkill(rows, 'html'), 2); assert.equal(standingEvidenceForSkill(rows, 'css'), 1); assert.equal(standingEvidenceForSkill(rows, 'api'), 0);
  });
  test('repeating an assessment on the same inputs gives the same result; one assessment per canonical skill (INV-PS5)', () => {
    assert.deepEqual(assessSkills(input()), assessSkills(input()));
    const withAlias = assessSkills(input({ skillIds: ['html', 'html_alias', 'css'], canonicalOf: (s) => (s === 'html_alias' ? 'html' : s) }));
    assert.deepEqual(withAlias.map((a) => a.skillId), ['css', 'html']);
    assert.equal(skillAssessmentKey('r1', 'html'), 'r1:html');
  });
  test('a criterion linked to an alias skill counts for the canonical skill', () => {
    const r = rubricOf([GATE, crit('h', 'html_alias')]);
    const a = assessSkill(input({ rubric: r, run: runOf({ gate: 1, h: 2 }), canonicalOf: (s) => (s === 'html_alias' ? 'html' : s) }), 'html');
    assert.equal(a.outcome, 'met'); assert.equal(applicableCriteria(r, 'html', (s) => (s === 'html_alias' ? 'html' : s)).length, 1);
  });
  test('every assessment records its versioned evaluation context', () => {
    const a = assessSkill(input(), 'html');
    assert.deepEqual(a.context, { modelVersion: PER_SKILL_MODEL_VERSION, rubricVersionId: 'rv1', rubricVersion: 'rub@1', activitySpecId: 'act', activitySpecVersion: '1.0.0' });
  });
});

describe('ENG-1 P1 — INV-PS1 property: another skill\'s criteria never change this skill\'s assessment', () => {
  // Deterministic PRNG (mulberry32): reproducible, no clock, no Math.random.
  const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  test('600 random rubrics × score mutations outside applicable(S)', () => {
    const r = rng(20261012); const skills = ['s1', 's2', 's3', 's4'];
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
    for (let i = 0; i < 600; i++) {
      const criteria: C[] = [GATE];
      const n = 1 + Math.floor(r() * 7);
      for (let k = 0; k < n; k++) criteria.push(crit(`c${k}`, pick(skills), { thresholdForSkill: pick([0.25, 0.5, 1, null]), thresholdStatus: pick(['approved', 'approved', 'proposed']) }));
      const rubric = rubricOf(criteria);
      const scores: Record<string, number> = { gate: 1 }; for (const c of criteria.slice(1)) scores[c.key] = pick([0, 1, 2]);
      const pending = criteria.slice(1).filter(() => r() < 0.1).map((c) => c.key);
      const states: Record<string, EvidenceState> = Object.fromEntries(skills.map((s) => [s, pick(['gap', 'practiced', 'demonstrated'] as const)]));
      const base = input({ rubric, run: { ...runOf(scores), outcome: pick(['passed', 'below_threshold'] as const), pendingHumanCriteria: pending }, skillIds: skills, claimedSkillIds: skills, currentStates: states, humanDecidedCriteria: criteria.map((c) => c.key) });
      for (const s of skills) {
        const before = assessSkill(base, s);
        assertSkillAssessmentInvariants(before, rubric);
        const others = criteria.slice(1).filter((c) => c.skillId !== s);
        const mutated: Record<string, number> = { ...scores }; for (const c of others) mutated[c.key] = pick([0, 1, 2]);
        const otherStates = { ...states }; for (const o of skills) if (o !== s) otherStates[o] = pick(['gap', 'demonstrated'] as const);
        const after = assessSkill({ ...base, run: { ...base.run, criteria: runOf(mutated).criteria, outcome: pick(['passed', 'below_threshold'] as const),
          pendingHumanCriteria: pending.filter((k) => !others.some((c) => c.key === k)) }, currentStates: otherStates }, s);
        assert.deepEqual(after, before, `seed iteration ${i}, skill ${s}`);
      }
    }
  });
  test('the invariant check catches a tampered assessment', () => {
    const a = assessSkill(input(), 'css');
    assert.throws(() => assertSkillAssessmentInvariants({ ...a, proposedState: 'demonstrated' }, RUBRIC), /INV-PS2/);
    const h = assessSkill(input(), 'html');
    assert.throws(() => assertSkillAssessmentInvariants({ ...h, criteria: [...h.criteria, { ...h.criteria[0]!, key: 'css_a' }] }, RUBRIC), /INV-PS1/);
  });
});
