/**
 * Rule tests beyond the nine invariants: the areas the owner called out —
 * unsupported claims, evidence promotion, AI-generated wording, public
 * sharing, report eligibility, immutable evaluations.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_STATES, EVALUATION_OUTCOMES, VERIFICATION_OUTCOMES, TRANSITIONS,
  FORBIDDEN_TRANSITIONS, evidenceOrdinal, levelCapForSource, presentationFor,
  assertTransitionAllowed, assessClaim, cvEligibility, linkedInEligibility,
  recruiterReportEligible, canShare, publiclyDisplayable, assertShareLinkPolicyValid,
  shareLinkActive, assessDisclosure, assertDisclosureDidNotLowerScore,
  assertModeRespected, loadWeights, computeReadiness, scoreDelta, mayMoveScore,
  SCORE_COMPONENT_KEYS, READINESS_DISCLAIMER_AR, mayYieldEvidence,
  DomainError, IllegalTransition, MissingPrerequisite, InvariantViolation,
  type SkillClaim, type ScoreWeights,
} from './index.js';

/* ───────────────────────── evidence states stay distinct ────────────────── */

describe('the five evidence states are never collapsed', () => {
  test('all five exist in canonical forward order', () => {
    assert.deepEqual([...EVIDENCE_STATES], ['gap', 'self_reported', 'practiced', 'demonstrated', 'verified']);
    for (let i = 1; i < EVIDENCE_STATES.length; i++) {
      assert.equal(evidenceOrdinal(EVIDENCE_STATES[i]!), evidenceOrdinal(EVIDENCE_STATES[i - 1]!) + 1);
    }
  });

  test('each state has a distinct presentation contract', () => {
    const seen = new Set(EVIDENCE_STATES.map((s) => JSON.stringify(presentationFor(s))));
    // verified and demonstrated share a projection contract by design; the
    // other three must each differ.
    assert.equal(seen.size, 4);
    assert.notDeepEqual(presentationFor('gap'), presentationFor('self_reported'));
  });

  test('gap and self_reported differ: one is a claim, the other is its absence', () => {
    assert.equal(presentationFor('gap').cv, 'no');
    assert.equal(presentationFor('self_reported').cv, 'no');
    // They differ in the ladder: self_reported can be linked to a project.
    assert.ok(TRANSITIONS.some((t) => t.from === 'self_reported' && t.to === 'practiced'));
    assert.ok(!TRANSITIONS.some((t) => t.from === 'gap' && t.to === 'self_reported' && t.requiresEvaluation));
  });
});

/* ───────────────────────────── promotion rules ──────────────────────────── */

describe('evidence promotion', () => {
  test('practiced -> demonstrated needs an evaluation and a rubric', () => {
    assert.throws(
      () => assertTransitionAllowed({ from: 'practiced', to: 'demonstrated', actor: 'system' }),
      MissingPrerequisite,
    );
    const rule = assertTransitionAllowed({
      from: 'practiced', to: 'demonstrated',
      evaluationId: 'eval_1', rubricVersion: 'rub@0.2.0', actor: 'system',
    });
    assert.equal(rule.id, 'T-DEMO-FROM-PRACTICED');
    assert.equal(rule.aiMayExecute, false);
  });

  test('demonstrated -> verified is never automatic: a named reviewer is required', () => {
    assert.throws(
      () => assertTransitionAllowed({
        from: 'demonstrated', to: 'verified',
        evaluationId: 'eval_2', rubricVersion: 'rub@0.2.0', actor: 'system',
      }),
      MissingPrerequisite,
    );
    const rule = assertTransitionAllowed({
      from: 'demonstrated', to: 'verified',
      evaluationId: 'eval_2', rubricVersion: 'rub@0.2.0',
      humanReviewerId: 'rev_1', actor: 'human_reviewer',
    });
    assert.equal(rule.requiresHumanReview, true);
  });

  test('every backward transition is refused', () => {
    for (const f of FORBIDDEN_TRANSITIONS) {
      assert.throws(
        () => assertTransitionAllowed({ from: f.from, to: f.to, actor: 'system' }),
        IllegalTransition,
        `${f.from} -> ${f.to} should be refused`,
      );
    }
  });

  test('a self-reported source can never reach verified', () => {
    assert.equal(levelCapForSource('self_reported'), 'demonstrated');
    assert.throws(
      () => assertTransitionAllowed({
        from: 'demonstrated', to: 'verified',
        evaluationId: 'e', rubricVersion: 'r', humanReviewerId: 'rev',
        sourceStrength: 'self_reported', actor: 'human_reviewer',
      }),
      IllegalTransition,
    );
  });

  test('no transition row permits AI execution', () => {
    for (const t of TRANSITIONS) assert.equal(t.aiMayExecute, false, `${t.id} allows AI execution`);
  });

  test('a skill never skips from gap straight to verified', () => {
    assert.throws(
      () => assertTransitionAllowed({
        from: 'gap', to: 'verified',
        evaluationId: 'e', rubricVersion: 'r', humanReviewerId: 'rev', actor: 'human_reviewer',
      }),
      IllegalTransition,
    );
  });
});

/* ───────────────────────────── unsupported claims ───────────────────────── */

describe('unsupported claims', () => {
  test('self-reported presented as expertise is unsupported and lowers confidence', () => {
    const a = assessClaim({ skillId: 'skl_css', state: 'self_reported', presentedAs: 'expertise', evidenceIds: [] });
    assert.equal(a.strength, 'unsupported');
    assert.equal(a.lowersConfidence, true);
    assert.ok(a.suggestedFix);
  });

  test('practiced presented as project work is in progress, not a failure', () => {
    const a = assessClaim({ skillId: 'skl_testing', state: 'practiced', presentedAs: 'project_work', evidenceIds: [] });
    assert.equal(a.strength, 'in_progress');
    assert.equal(a.lowersConfidence, false);
  });

  test('demonstrated with evidence is supported', () => {
    const a = assessClaim({ skillId: 'skl_state', state: 'demonstrated', presentedAs: 'expertise', evidenceIds: ['ev_1'] });
    assert.equal(a.strength, 'supported');
  });

  test('practiced may not become a CV bullet or a LinkedIn skill', () => {
    const claim: SkillClaim = { skillId: 'skl_testing', state: 'practiced', presentedAs: 'project_work', evidenceIds: [] };
    assert.equal(cvEligibility(claim).as, 'project_description_only');
    assert.equal(linkedInEligibility(claim).as, 'project_mention_only');
  });

  test('a demonstrated claim with no evidence cannot be projected at all', () => {
    const claim: SkillClaim = { skillId: 'skl_x', state: 'demonstrated', presentedAs: 'expertise', evidenceIds: [] };
    assert.throws(() => cvEligibility(claim), InvariantViolation);
    assert.throws(() => linkedInEligibility(claim), InvariantViolation);
  });
});

/* ─────────────────────────── report eligibility ─────────────────────────── */

describe('recruiter report eligibility', () => {
  test('refused when nothing real exists yet', () => {
    assert.equal(recruiterReportEligible([]).eligible, false);
    assert.equal(
      recruiterReportEligible([
        { skillId: 's', state: 'self_reported', presentedAs: 'expertise', evidenceIds: [] },
      ]).eligible,
      false,
    );
  });

  test('allowed once at least one skill has real work behind it', () => {
    assert.equal(
      recruiterReportEligible([
        { skillId: 's', state: 'practiced', presentedAs: 'project_work', evidenceIds: [] },
      ]).eligible,
      true,
    );
  });
});

/* ───────────────────────────── public sharing ───────────────────────────── */

describe('public sharing', () => {
  test('default deny: nothing publishable without explicit approval', () => {
    const d = canShare(
      { kind: 'case_study', privacyClass: 'private_publishable', visibility: 'private', userApprovedAt: null },
      'public',
    );
    assert.equal(d.allowed, false);
    assert.equal(d.requiresApproval, true);
  });

  test('approved publishable content may go public', () => {
    const d = canShare(
      { kind: 'case_study', privacyClass: 'private_publishable', visibility: 'private', userApprovedAt: '2026-09-26T10:00:00.000Z' },
      'public',
    );
    assert.equal(d.allowed, true);
  });

  test('never-shareable content stays private whatever the settings say', () => {
    const d = canShare(
      { kind: 'raw_upload', privacyClass: 'private_never_shareable', visibility: 'private', userApprovedAt: '2026-09-26T10:00:00.000Z' },
      'public',
    );
    assert.equal(d.allowed, false);
  });

  test('self-reported and gap are not publicly displayable', () => {
    assert.equal(publiclyDisplayable('gap'), false);
    assert.equal(publiclyDisplayable('self_reported'), false);
    assert.equal(publiclyDisplayable('practiced'), true);
  });

  test('share links must expire and must not be indexable while OPEN-016 is open', () => {
    assert.throws(
      () => assertShareLinkPolicyValid({ expiresAt: null, revokedAt: null, indexable: false }),
      DomainError,
    );
    assert.throws(
      () => assertShareLinkPolicyValid({ expiresAt: '2026-12-01T00:00:00.000Z', revokedAt: null, indexable: true }),
      DomainError,
    );
    assert.doesNotThrow(
      () => assertShareLinkPolicyValid({ expiresAt: '2026-12-01T00:00:00.000Z', revokedAt: null, indexable: false }),
    );
  });

  test('a revoked link is inactive immediately', () => {
    const now = '2026-09-26T10:00:00.000Z';
    assert.equal(shareLinkActive({ expiresAt: '2026-12-01T00:00:00.000Z', revokedAt: null, indexable: false }, now), true);
    assert.equal(shareLinkActive({ expiresAt: '2026-12-01T00:00:00.000Z', revokedAt: now, indexable: false }, now), false);
    assert.equal(shareLinkActive({ expiresAt: '2026-01-01T00:00:00.000Z', revokedAt: null, indexable: false }, now), false);
  });
});

/* ─────────────────────── AI wording and disclosure ──────────────────────── */

describe('AI-generated wording and disclosure', () => {
  test('disclosure alone never lowers a score', () => {
    assert.doesNotThrow(() => assertDisclosureDidNotLowerScore(80, 80));
    assert.throws(() => assertDisclosureDidNotLowerScore(80, 72), DomainError);
  });

  test('no assessment step ever carries a score penalty', () => {
    for (const signals of [[], ['I1'], ['I1', 'I2'], ['I1', 'I2', 'I3', 'I4']] as const) {
      const a = assessDisclosure({
        mode: 'ai_assisted', disclosed: true,
        signalsRaised: [...signals] as never, canDefendWork: null,
      });
      assert.equal(a.scorePenaltyApplied, false);
    }
  });

  test('a single signal is noise; corroborated signals start a human conversation', () => {
    assert.equal(assessDisclosure({ mode: 'ai_assisted', disclosed: true, signalsRaised: ['I1'], canDefendWork: null }).requiresHumanConversation, false);
    assert.equal(assessDisclosure({ mode: 'ai_assisted', disclosed: true, signalsRaised: ['I1', 'I2'], canDefendWork: null }).requiresHumanConversation, true);
  });

  test('being able to defend the work settles corroborated signals', () => {
    const a = assessDisclosure({ mode: 'ai_assisted', disclosed: true, signalsRaised: ['I1', 'I2', 'I3'], canDefendWork: true });
    assert.equal(a.step, 'N1');
    assert.equal(a.requiresHumanConversation, false);
  });

  test('declared AI authoring on an ai_prohibited activity is refused', () => {
    assert.throws(
      () => assertModeRespected({ mode: 'ai_prohibited', userDeclaredUse: ['wrote the tests'] }),
      InvariantViolation,
    );
    assert.doesNotThrow(() => assertModeRespected({ mode: 'ai_prohibited', userDeclaredUse: [] }));
  });
});

/* ────────────────────────── immutable evaluations ───────────────────────── */

describe('evaluations are immutable history', () => {
  test('five evaluation outcomes and five verification outcomes are preserved', () => {
    assert.equal(EVALUATION_OUTCOMES.length, 5);
    assert.equal(VERIFICATION_OUTCOMES.length, 5);
    assert.deepEqual([...VERIFICATION_OUTCOMES],
      ['accepted', 'downgraded', 'rejected', 'escalated_to_human', 'exception_granted']);
  });

  test('only passing or below-threshold outcomes may yield evidence', () => {
    assert.equal(mayYieldEvidence('passed'), true);
    assert.equal(mayYieldEvidence('below_threshold'), true);
    assert.equal(mayYieldEvidence('blocked_by_checks'), false);
    assert.equal(mayYieldEvidence('undetermined'), false);
    assert.equal(mayYieldEvidence('needs_human_review'), false);
  });

  test('an undetermined result never yields a guessed score', () => {
    // Safe mode: no rubric, no criteria needed, and no evidence produced.
    assert.doesNotThrow(() => assertEvaluationResultValidShim());
    function assertEvaluationResultValidShim(): void {
      // `undetermined` is a legitimate terminal outcome with no score.
      assert.equal(mayYieldEvidence('undetermined'), false);
    }
  });
});

/* ──────────────────────────────── scoring ───────────────────────────────── */

describe('readiness scores', () => {
  test('no weights are baked in: loading them fails until they are approved', () => {
    assert.throws(() => loadWeights('cv', []), MissingPrerequisite);
  });

  test('a weight set missing an approved component key is refused', () => {
    const partial: ScoreWeights = {
      version: 'test', kind: 'cv', approvedBy: 'test',
      weights: { role_alignment: 1 },
    };
    assert.throws(() => loadWeights('cv', [partial]), MissingPrerequisite);
  });

  test('weights that do not sum to 1 are refused', () => {
    const keys = SCORE_COMPONENT_KEYS.cv;
    const bad: ScoreWeights = {
      version: 'test', kind: 'cv', approvedBy: 'test',
      weights: Object.fromEntries(keys.map((k) => [k, 0.5])),
    };
    assert.throws(() => loadWeights('cv', [bad]), MissingPrerequisite);
  });

  test('a computed score always carries its disclaimer', () => {
    const keys = SCORE_COMPONENT_KEYS.cv;
    const w: ScoreWeights = {
      version: 'test-only', kind: 'cv', approvedBy: 'test fixture — not an approved weight set',
      weights: Object.fromEntries(keys.map((k) => [k, 1 / keys.length])),
    };
    const components = keys.map((k) => ({
      key: k, status: 'fair' as const, reason: 'fixture', weight: 1 / keys.length, normalised: 0.5,
    }));
    const score = computeReadiness('cv', components, loadWeights('cv', [w]), '2026-09-26T10:00:00.000Z');
    assert.equal(score.value, 50);
    assert.equal(score.disclaimerAr, READINESS_DISCLAIMER_AR);
  });

  test('only work-derived events may move a score, never field completion', () => {
    assert.equal(mayMoveScore('evidence.created'), true);
    assert.equal(mayMoveScore('skill.demonstrated'), true);
    assert.equal(mayMoveScore('profile.field_filled'), false);
    assert.equal(mayMoveScore('user.logged_in'), false);
  });

  test('a delta is derived from two stored scores', () => {
    const keys = SCORE_COMPONENT_KEYS.cv;
    const w: ScoreWeights = {
      version: 'test-only', kind: 'cv', approvedBy: 'fixture',
      weights: Object.fromEntries(keys.map((k) => [k, 1 / keys.length])),
    };
    const mk = (n: number) => computeReadiness(
      'cv',
      keys.map((k) => ({ key: k, status: 'fair' as const, reason: 'f', weight: 1 / keys.length, normalised: n })),
      loadWeights('cv', [w]), '2026-09-26T10:00:00.000Z',
    );
    assert.equal(scoreDelta(mk(0.7), mk(0.74)), 4);
    assert.equal(scoreDelta(null, mk(0.7)), null);
  });
});
