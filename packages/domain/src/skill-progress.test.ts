/**
 * Phase 2 — Skill Status Model. The invariants are fixed here; states, triggers
 * and rules come in as data.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextProgress, evaluateGuard, assertGuardWellFormed, assertProgressRuleSetSane, initialProgressState, progressRulesUsable,
  assertProgressStateCodeDistinct, verificationEffectOfProgress, progressStateFromRow, progressRuleFromRow,
  DomainError, MissingPrerequisite, type ProgressStateSpec, type ProgressTransitionRule,
} from './index.js';

const S = (code: string, isInitial = false): ProgressStateSpec => ({ code, isInitial, enabled: true, reviewStatus: 'draft' });
const STATES = [S('not_started', true), S('in_progress'), S('submitted'), S('under_review'), S('needs_more_evidence'), S('evidence_recorded')];
let n = 0;
const R = (from: string, to: string, trigger: string, guard: ProgressTransitionRule['guard'] = {}, over: Partial<ProgressTransitionRule> = {}): ProgressTransitionRule =>
  ({ id: `r${++n}`, from, to, trigger, guard, enabled: true, version: 1, reviewStatus: 'draft', ...over });
const RULES = [
  R('not_started', 'in_progress', 'project.created'),
  R('not_started', 'submitted', 'submission.created'),
  R('in_progress', 'submitted', 'submission.created'),
  R('submitted', 'under_review', 'evaluation.queued_for_human'),
  R('submitted', 'evidence_recorded', 'evaluation.completed', { produced_evidence: true }),
  R('submitted', 'needs_more_evidence', 'evaluation.completed', { produced_evidence: false }),
  R('evidence_recorded', 'needs_more_evidence', 'evidence.withdrawn', { standing_evidence_count: 0 }),
];

describe('journey transitions are data-driven and unambiguous', () => {
  test('the matching enabled rule moves the state; guards read the facts', () => {
    assert.equal(nextProgress({ rules: RULES, currentState: 'not_started', trigger: 'project.created', facts: {} }).kind, 'transition');
    const d = nextProgress({ rules: RULES, currentState: 'submitted', trigger: 'evaluation.completed', facts: { outcome: 'passed', produced_evidence: true } });
    assert.equal(d.kind === 'transition' && d.to, 'evidence_recorded');
    const f = nextProgress({ rules: RULES, currentState: 'submitted', trigger: 'evaluation.completed', facts: { outcome: 'failed', produced_evidence: false } });
    assert.equal(f.kind === 'transition' && f.to, 'needs_more_evidence');
  });
  test('no rule ⇒ an explicit "none", never a guessed state; a missing fact fails the guard', () => {
    assert.deepEqual(nextProgress({ rules: RULES, currentState: 'in_progress', trigger: 'evaluation.completed', facts: { produced_evidence: true } }), { kind: 'none', reason: 'no_matching_rule' });
    assert.equal(nextProgress({ rules: RULES, currentState: 'submitted', trigger: 'evaluation.completed', facts: {} }).kind, 'none', 'produced_evidence absent ⇒ no guard satisfied');
    assert.equal(nextProgress({ rules: RULES, currentState: 'evidence_recorded', trigger: 'evidence.withdrawn', facts: { standing_evidence_count: 1 } }).kind, 'none');
  });
  test('NEGATIVE: two matching enabled rules is a data error, not a silent pick; a disabled rule does not match', () => {
    const dup = [...RULES, R('not_started', 'submitted', 'project.created')];
    assert.throws(() => nextProgress({ rules: dup, currentState: 'not_started', trigger: 'project.created', facts: {} }), /ambiguous/);
    const off = RULES.map((r) => (r.trigger === 'project.created' ? { ...r, enabled: false } : r));
    assert.equal(nextProgress({ rules: off, currentState: 'not_started', trigger: 'project.created', facts: {} }).kind, 'none');
  });
});

describe('guards', () => {
  test('equality, not, in; unsupported shapes are refused', () => {
    assert.equal(evaluateGuard({ outcome: 'passed' }, { outcome: 'passed' }), true);
    assert.equal(evaluateGuard({ outcome: { not: 'passed' } }, { outcome: 'blocked_by_checks' }), true);
    assert.equal(evaluateGuard({ outcome: { not: 'passed' } }, { outcome: 'passed' }), false);
    assert.equal(evaluateGuard({ depth: { in: ['primary', 'secondary'] } }, { depth: 'primary' }), true);
    assert.equal(evaluateGuard({ depth: { in: ['primary'] } }, { depth: 'secondary' }), false);
    assert.doesNotThrow(() => assertGuardWellFormed({ a: 1, b: { not: null }, c: { in: [true, 'x'] } }));
    assert.throws(() => assertGuardWellFormed({ a: { gte: 3 } }), DomainError);
    assert.throws(() => assertGuardWellFormed([]), DomainError);
    assert.throws(() => assertGuardWellFormed({ a: { not: 1, in: [1] } }), DomainError);
  });
});

describe('two dimensions, one initial state, sane rule sets', () => {
  test('a journey state code can never be an evidence level', () => {
    for (const code of ['gap', 'self_reported', 'practiced', 'demonstrated', 'verified']) assert.throws(() => assertProgressStateCodeDistinct(code), DomainError);
    assert.doesNotThrow(() => assertProgressStateCodeDistinct('evidence_recorded'));
    assert.throws(() => progressStateFromRow({ code: 'demonstrated', is_initial: false, enabled: true, review_status: 'draft' }), DomainError);
  });
  test('a progress change has no verification effect (activity completion ≠ skill verification)', () => {
    assert.equal(verificationEffectOfProgress(), 'none');
  });
  test('exactly one enabled initial state', () => {
    assert.equal(initialProgressState(STATES).code, 'not_started');
    assert.throws(() => initialProgressState(STATES.filter((s) => !s.isInitial)), MissingPrerequisite);
    assert.throws(() => initialProgressState([...STATES, S('also_initial', true)]), MissingPrerequisite);
  });
  test('NEGATIVE: unknown states, self-loops, duplicates and bad guards are refused as data errors', () => {
    assert.doesNotThrow(() => assertProgressRuleSetSane(STATES, RULES));
    assert.throws(() => assertProgressRuleSetSane(STATES, [R('nowhere', 'submitted', 'x')]), /unknown from state/);
    assert.throws(() => assertProgressRuleSetSane(STATES, [R('submitted', 'submitted', 'x')]), /must move/);
    assert.throws(() => assertProgressRuleSetSane(STATES, [R('submitted', 'under_review', 'x'), R('submitted', 'under_review', 'x')]), /duplicate/);
    assert.throws(() => progressRuleFromRow({ id: 'r', from_state: 'a', to_state: 'b', trigger_code: 't', guard: { x: { gte: 1 } }, enabled: true, version: 1, review_status: 'draft' }), DomainError);
  });
});

describe('draft rules apply outside production only, and the engine says why', () => {
  test('usability by environment', () => {
    assert.deepEqual(progressRulesUsable(RULES, { production: false }), { usable: true });
    const prod = progressRulesUsable(RULES, { production: true });
    assert.equal(prod.usable, false);
    assert.match(!prod.usable ? prod.reason : '', /DRAFT \/ NOT VALIDATED/);
    const approved = RULES.map((r) => ({ ...r, reviewStatus: 'approved' }));
    assert.deepEqual(progressRulesUsable(approved, { production: true }), { usable: true });
    assert.equal(progressRulesUsable([], { production: false }).usable, false);
  });
});
