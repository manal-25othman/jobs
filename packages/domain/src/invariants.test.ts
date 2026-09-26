/**
 * Every approved invariant has two tests: a passing case and a violating case
 * that fails explicitly with the right invariant code.
 *
 * A violating case that merely returns false would not prove the rule — the
 * point is that breaking it is loud.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  INVARIANTS, invariant, assertNotAiActor, assertMeteredModelCall, assertEmitsEvent,
  assertClaimHasEvidence, assertTransitionAllowed, assertEvaluationResultValid,
  activityScoreGrantsLevel, promotionEligibleFrom, assertHasProvenance,
  assertMarketFactSourced, assertRecruiterItemTraceable, assertNotExposed,
  InvariantViolation, IllegalTransition, MissingPrerequisite,
  type Actor, type SkillClaim, type Provenance,
} from './index.js';

function expectViolation(code: string, fn: () => unknown): InvariantViolation {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof InvariantViolation, `expected InvariantViolation, got ${String(e)}`);
    assert.equal(e.invariant, code);
    return e;
  }
  assert.fail(`expected ${code} to be violated, but nothing was thrown`);
}

const provenance: Provenance = {
  class: 'system_derived',
  source: 'evaluation:9f1c',
  recordedAt: '2026-09-26T10:00:00.000Z',
};

/* ─────────────────────────────── INV-1 ──────────────────────────────────── */

describe('INV-1 — no Claim without Evidence', () => {
  test('passes: a demonstrated claim backed by evidence', () => {
    const claim: SkillClaim = {
      skillId: 'skl_state', state: 'demonstrated',
      presentedAs: 'expertise', evidenceIds: ['ev_1'],
    };
    assert.doesNotThrow(() => assertClaimHasEvidence(claim));
  });

  test('fails: a demonstrated claim with no evidence', () => {
    const claim: SkillClaim = {
      skillId: 'skl_state', state: 'demonstrated',
      presentedAs: 'expertise', evidenceIds: [],
    };
    const e = expectViolation('INV-1', () => assertClaimHasEvidence(claim));
    assert.match(e.message, /cannot exist without at least one evidence record/);
  });
});

/* ─────────────────────────────── INV-2 ──────────────────────────────────── */

describe('INV-2 — no Evaluation without a published rubric_version', () => {
  test('passes: a scored result carrying a rubric and spec version', () => {
    assert.doesNotThrow(() =>
      assertEvaluationResultValid({
        outcome: 'passed',
        rubricVersion: 'rub_fe_003@0.2.0',
        activitySpecVersion: 'act_fe_003@0.2.0',
        criteria: [{
          criterionId: 'c1', score: 4, maxScore: 4,
          rationale: 'all three states covered by tests',
          supportingExcerpt: 'expect(screen.getByRole(...))',
          skillId: 'skl_testing', confidence: 0.9,
        }],
      }),
    );
  });

  test('fails: a scored result with no rubric version', () => {
    expectViolation('INV-2', () =>
      assertEvaluationResultValid({
        outcome: 'passed',
        activitySpecVersion: 'act_fe_003@0.2.0',
        criteria: [{
          criterionId: 'c1', score: 4, maxScore: 4,
          rationale: 'x', supportingExcerpt: null, skillId: null, confidence: 1,
        }],
      }),
    );
  });

  test('fails: a promotion relying on an evaluation with no rubric version', () => {
    expectViolation('INV-2', () =>
      assertTransitionAllowed({
        from: 'practiced', to: 'demonstrated',
        evaluationId: 'eval_1', actor: 'system',
      }),
    );
  });
});

/* ─────────────────────────────── INV-3 ──────────────────────────────────── */

describe('INV-3 — agents propose, they never write', () => {
  test('passes: a human reviewer performs the write', () => {
    const actor: Actor = { kind: 'human_reviewer', id: 'rev_1', rolePerformed: 'human_reviewer' };
    assert.doesNotThrow(() => assertNotAiActor(actor, 'claim.promote'));
  });

  test('fails: an agent attempts the write', () => {
    const actor: Actor = { kind: 'ai_agent', agentId: 'A14' };
    const e = expectViolation('INV-3', () => assertNotAiActor(actor, 'claim.promote'));
    assert.match(e.message, /may propose but not perform/);
  });

  test('fails: an agent attempts an evidence transition directly', () => {
    expectViolation('INV-3', () =>
      assertTransitionAllowed({
        from: 'practiced', to: 'demonstrated',
        evaluationId: 'eval_1', rubricVersion: 'rub@1.0.0', actor: 'ai_agent',
      }),
    );
  });
});

/* ─────────────────────────────── INV-4 ──────────────────────────────────── */

describe('INV-4 — no market information without a tagged source', () => {
  test('passes: a sourced, dated market fact', () => {
    assert.doesNotThrow(() =>
      assertMarketFactSourced({
        statement: 'required in 7 of 10 job ads',
        observedAt: '2026-09-01',
        provenance: { class: 'curated', source: 'job-ad sample 2026-09', recordedAt: '2026-09-01T00:00:00.000Z' },
      }),
    );
  });

  test('fails: an unsourced market claim', () => {
    expectViolation('INV-4', () =>
      assertMarketFactSourced({ statement: 'required in 7 of 10 job ads' }),
    );
  });

  test('fails: a market claim resting on model output alone', () => {
    expectViolation('INV-4', () =>
      assertMarketFactSourced({
        statement: 'most employers want this',
        observedAt: '2026-09-01',
        provenance: { class: 'ai_generated', source: 'model', recordedAt: '2026-09-01T00:00:00.000Z' },
      }),
    );
  });
});

/* ─────────────────────────────── INV-5 ──────────────────────────────────── */

describe('INV-5 — every fact carries provenance', () => {
  test('passes: a fact with a provenance record', () => {
    assert.doesNotThrow(() => assertHasProvenance({ provenance }, 'cv bullet'));
  });

  test('fails: a fact with none', () => {
    expectViolation('INV-5', () => assertHasProvenance({ provenance: null }, 'cv bullet'));
  });

  test('fails: a recruiter-report item that traces to nothing', () => {
    expectViolation('INV-5', () =>
      assertRecruiterItemTraceable({
        observation: 'your headline is generic',
        tracesTo: null, movesScore: 'linkedin', expectedDelta: 4,
      }),
    );
  });
});

/* ─────────────────────────────── INV-6 ──────────────────────────────────── */

describe('INV-6 — every model call is metered through the gateway', () => {
  test('passes: a fully metered call', () => {
    assert.doesNotThrow(() =>
      assertMeteredModelCall({
        gatewayCallId: 'gw_1', provider: 'p', model: 'm',
        inputTokens: 100, outputTokens: 50, costUnits: 3, purpose: 'cv_bullet_wording',
      }),
    );
  });

  test('fails: a call with no metering', () => {
    const e = expectViolation('INV-6', () => assertMeteredModelCall({ provider: 'p', model: 'm' }));
    assert.match(e.message, /not metered/);
  });

  test('fails: a private upload reachable through a public report', () => {
    expectViolation('INV-6', () => assertNotExposed('raw_upload', 'recruiter_report'));
  });
});

/* ─────────────────────────────── INV-7 ──────────────────────────────────── */

describe('INV-7 — every Activity references a published Spec version', () => {
  test('passes: a result carrying its activity spec version', () => {
    assert.doesNotThrow(() =>
      assertEvaluationResultValid({
        outcome: 'below_threshold',
        rubricVersion: 'rub@0.2.0',
        activitySpecVersion: 'act@0.2.0',
        criteria: [{
          criterionId: 'c1', score: 1, maxScore: 4,
          rationale: 'empty state only', supportingExcerpt: null,
          skillId: 'skl_testing', confidence: 0.7,
        }],
      }),
    );
  });

  test('fails: a scored result with no activity spec version', () => {
    expectViolation('INV-7', () =>
      assertEvaluationResultValid({
        outcome: 'passed',
        rubricVersion: 'rub@0.2.0',
        criteria: [{
          criterionId: 'c1', score: 4, maxScore: 4,
          rationale: 'x', supportingExcerpt: null, skillId: null, confidence: 1,
        }],
      }),
    );
  });
});

/* ─────────────────────────────── INV-8 ──────────────────────────────────── */

describe('INV-8 — every meaningful act emits an event', () => {
  test('passes: an act with an event carrying a reason', () => {
    assert.doesNotThrow(() =>
      assertEmitsEvent({
        name: 'claim.promoted',
        emittedEvent: {
          type: 'claim.promoted',
          actor: { kind: 'system', component: 'evaluation-pipeline' },
          occurredAt: '2026-09-26T10:00:00.000Z',
          reason: 'short check passed, V1-V3 satisfied',
        },
      }),
    );
  });

  test('fails: a silent act', () => {
    expectViolation('INV-8', () => assertEmitsEvent({ name: 'claim.promoted', emittedEvent: null }));
  });

  test('fails: an event with no recorded reason', () => {
    expectViolation('INV-8', () =>
      assertEmitsEvent({
        name: 'claim.promoted',
        emittedEvent: {
          type: 'claim.promoted',
          actor: { kind: 'system', component: 'x' },
          occurredAt: '2026-09-26T10:00:00.000Z',
          reason: '   ',
        },
      }),
    );
  });
});

/* ─────────────────────────────── INV-9 ──────────────────────────────────── */

describe('INV-9 — Activity Score is not a Skill Verification Level', () => {
  test('passes: a pass makes a promotion eligible, nothing more', () => {
    assert.equal(promotionEligibleFrom('passed'), true);
    assert.equal(promotionEligibleFrom('below_threshold'), false);
    // Eligible still has to clear the transition guard, with a rubric.
    assert.throws(
      () => assertTransitionAllowed({ from: 'practiced', to: 'demonstrated', actor: 'system' }),
      MissingPrerequisite,
    );
  });

  test('fails: asking a score to grant a level', () => {
    const e = expectViolation('INV-9', () => activityScoreGrantsLevel());
    assert.match(e.message, /never grants a level directly/);
  });
});

/* ───────────────────────── registry completeness ────────────────────────── */

describe('invariant registry', () => {
  test('all nine are registered, each with an enforcement site', () => {
    assert.equal(INVARIANTS.length, 9);
    for (const spec of INVARIANTS) {
      assert.ok(spec.enforcedIn.length > 0, `${spec.code} names no enforcement site`);
      assert.equal(invariant(spec.code).code, spec.code);
    }
  });

  test('every invariant code INV-1..INV-9 is present exactly once', () => {
    const codes = INVARIANTS.map((i) => i.code).sort();
    assert.deepEqual(codes, ['INV-1','INV-2','INV-3','INV-4','INV-5','INV-6','INV-7','INV-8','INV-9']);
  });
});

/* ────────────────── guard against accidental error-type drift ───────────── */

describe('error types stay distinguishable', () => {
  test('an illegal transition is not reported as an invariant violation', () => {
    assert.throws(
      () => assertTransitionAllowed({ from: 'verified', to: 'demonstrated', actor: 'system' }),
      IllegalTransition,
    );
  });
});
