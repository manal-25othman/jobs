/**
 * Skill Status Model (Configurable Track Architecture, Phase 2).
 *
 * A skill has TWO separate dimensions per user:
 *
 *   verification level  — `skill_claim.state` on the evidence ladder
 *                         (gap → self_reported → practiced → demonstrated →
 *                         verified). Moved by the evaluation pipeline only
 *                         (INV-1). Not touched by anything in this module.
 *
 *   journey / progress  — where the user is on the road for this skill
 *                         (not started · in progress · submitted · under
 *                         review · needs more evidence · evidence recorded).
 *                         Moved by EVENTS through transition RULES that come
 *                         in as data.
 *
 * What is fixed here (invariants):
 *   - a progress state code is never an evidence-level code (no conflation).
 *   - a progress transition has no effect on a claim: completing an activity
 *     is not a verification.
 *   - exactly one enabled rule may match (from, trigger, guard); two matching
 *     rules is a data error that throws, never a silent pick.
 *   - in production, draft rules are not applied; the engine says so instead
 *     of pretending.
 *
 * What is data (DRAFT / NOT VALIDATED until an expert approves):
 *   - the states, the triggers, every transition rule and its guard.
 */

import { DomainError, MissingPrerequisite } from './errors.js';
import { EVIDENCE_STATES } from './evidence-state.js';

export interface ProgressStateSpec {
  code: string;
  isInitial: boolean;
  enabled: boolean;
  reviewStatus: string;
}

/** A guard value: equality, negation, or membership. Nothing else is interpreted. */
export type GuardValue = string | number | boolean | null | { not: string | number | boolean | null } | { in: ReadonlyArray<string | number | boolean | null> };
export type ProgressGuard = Readonly<Record<string, GuardValue>>;

export interface ProgressTransitionRule {
  id: string;
  from: string;
  to: string;
  trigger: string;
  guard: ProgressGuard;
  enabled: boolean;
  version: number;
  reviewStatus: string;
}

export type ProgressFacts = Readonly<Record<string, string | number | boolean | null>>;

/** INV-1 restated for the journey: a progress change never moves a claim. */
export const PROGRESS_VERIFICATION_EFFECT = 'none' as const;
export function verificationEffectOfProgress(): typeof PROGRESS_VERIFICATION_EFFECT { return PROGRESS_VERIFICATION_EFFECT; }

export function assertProgressStateCodeDistinct(code: string): void {
  if ((EVIDENCE_STATES as readonly string[]).includes(code)) {
    throw new DomainError(`'${code}' is an evidence level, not a journey state; the two dimensions must stay distinct`);
  }
}

export function initialProgressState(states: readonly ProgressStateSpec[]): ProgressStateSpec {
  const initial = states.filter((s) => s.enabled && s.isInitial);
  if (initial.length !== 1) throw new MissingPrerequisite('skill_progress_state.is_initial', `exactly one enabled initial journey state is required; found ${initial.length}`);
  return initial[0]!;
}

function isPlainGuardValue(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

export function assertGuardWellFormed(guard: unknown): asserts guard is ProgressGuard {
  if (!guard || typeof guard !== 'object' || Array.isArray(guard)) throw new DomainError('a progress guard must be an object');
  for (const [k, v] of Object.entries(guard as Record<string, unknown>)) {
    if (isPlainGuardValue(v)) continue;
    if (v && typeof v === 'object' && 'not' in v && isPlainGuardValue((v as { not: unknown }).not) && Object.keys(v).length === 1) continue;
    if (v && typeof v === 'object' && 'in' in v && Array.isArray((v as { in: unknown }).in) && ((v as { in: unknown[] }).in).every(isPlainGuardValue) && Object.keys(v).length === 1) continue;
    throw new DomainError(`guard key '${k}' has an unsupported shape; allowed: value, {"not": value}, {"in": [values]}`);
  }
}

/** True when every guard key is satisfied by the facts. A key missing from the facts fails the guard (nothing is assumed). */
export function evaluateGuard(guard: ProgressGuard, facts: ProgressFacts): boolean {
  for (const [k, expected] of Object.entries(guard)) {
    if (!(k in facts)) return false;
    const actual = facts[k];
    if (isPlainGuardValue(expected)) { if (actual !== expected) return false; continue; }
    if ('not' in expected) { if (actual === expected.not) return false; continue; }
    if (!expected.in.includes(actual as string | number | boolean | null)) return false;
  }
  return true;
}

/** Structural sanity of a rule set against its states. Throws a named error; never patches the data. */
export function assertProgressRuleSetSane(states: readonly ProgressStateSpec[], rules: readonly ProgressTransitionRule[]): void {
  const codes = new Set(states.map((s) => s.code));
  for (const s of states) assertProgressStateCodeDistinct(s.code);
  initialProgressState(states);
  const seen = new Set<string>();
  for (const r of rules) {
    if (!codes.has(r.from)) throw new DomainError(`rule ${r.id}: unknown from state '${r.from}'`);
    if (!codes.has(r.to)) throw new DomainError(`rule ${r.id}: unknown to state '${r.to}'`);
    if (r.from === r.to) throw new DomainError(`rule ${r.id}: a transition must move (${r.from} → ${r.to})`);
    assertGuardWellFormed(r.guard);
    const key = `${r.from}|${r.to}|${r.trigger}|${r.version}`;
    if (seen.has(key)) throw new DomainError(`rule ${r.id}: duplicate of (${r.from}, ${r.to}, ${r.trigger}, v${r.version})`);
    seen.add(key);
  }
}

export type ProgressDecision =
  | { kind: 'transition'; rule: ProgressTransitionRule; to: string }
  | { kind: 'none'; reason: 'no_matching_rule' };

/**
 * Pure: f(rules, current state, event) → decision. Exactly one enabled rule may
 * match; several matching rules is a data error and throws.
 */
export function nextProgress(p: {
  rules: readonly ProgressTransitionRule[]; currentState: string; trigger: string; facts: ProgressFacts;
}): ProgressDecision {
  const matching = p.rules.filter((r) => r.enabled && r.from === p.currentState && r.trigger === p.trigger && evaluateGuard(r.guard, p.facts));
  if (matching.length > 1) {
    throw new DomainError(`ambiguous journey rules: ${matching.length} enabled rules match (${p.currentState}, ${p.trigger}); fix the rule set (ids ${matching.map((r) => r.id).join(', ')})`);
  }
  const rule = matching[0];
  return rule ? { kind: 'transition', rule, to: rule.to } : { kind: 'none', reason: 'no_matching_rule' };
}

export function progressRuleIsValidated(rule: Pick<ProgressTransitionRule, 'reviewStatus'>): boolean {
  return rule.reviewStatus === 'approved' || rule.reviewStatus === 'published';
}

/**
 * Whether the engine may APPLY the rule set. Outside production a draft rule
 * set runs (like DEMO content); in production only validated rules apply, and
 * the reason is stated so a client never mistakes silence for progress.
 */
export function progressRulesUsable(rules: readonly ProgressTransitionRule[], env: { production: boolean }): { usable: true } | { usable: false; reason: string } {
  const enabled = rules.filter((r) => r.enabled);
  if (enabled.length === 0) return { usable: false, reason: 'no enabled journey transition rules exist' };
  if (!env.production) return { usable: true };
  const draft = enabled.filter((r) => !progressRuleIsValidated(r));
  if (draft.length > 0) return { usable: false, reason: `${draft.length} enabled journey rule(s) are DRAFT / NOT VALIDATED; draft rules are not applied in production` };
  return { usable: true };
}

/** Maps registry rows (snake_case) to specs. Pure; no DB. */
export function progressStateFromRow(r: { code: string; is_initial: boolean; enabled: boolean; review_status: string }): ProgressStateSpec {
  assertProgressStateCodeDistinct(r.code);
  return { code: r.code, isInitial: r.is_initial, enabled: r.enabled, reviewStatus: r.review_status };
}
export function progressRuleFromRow(r: { id: string; from_state: string; to_state: string; trigger_code: string; guard: unknown; enabled: boolean; version: number | string; review_status: string }): ProgressTransitionRule {
  assertGuardWellFormed(r.guard);
  return { id: r.id, from: r.from_state, to: r.to_state, trigger: r.trigger_code, guard: r.guard, enabled: r.enabled, version: Number(r.version), reviewStatus: r.review_status };
}
