/**
 * Verification — a SEPARATE concept from evaluation (owner decision, D-051).
 *
 *   EvaluationOutcome    answers: what happened during an evaluation attempt?
 *   VerificationOutcome  answers: what did an independent/human verification
 *                                 step decide about that attempt's result?
 *
 * They are never merged into one enum or one database status column. An
 * evaluation that ran perfectly can still be rejected by verification, and a
 * verification can be escalated while the evaluation stays `passed`. Collapsing
 * them would make "the machine finished" indistinguishable from "a person
 * agreed", which is the distinction the whole Verified ladder rests on.
 *
 * Relationship:
 *
 *   Submission ─1:N→ Evaluation ─1:N→ EvaluationResult ─0:1→ Verification
 *                    (attempts)       (immutable history)    (a decision
 *                                                             ABOUT a result)
 *
 * Cardinality reasoning:
 *   - 1:N Evaluation      a submission may be evaluated again (dispute, retry)
 *   - 1:N EvaluationResult a re-evaluation APPENDS, linked by supersedes
 *   - 0:1 Verification    not every result is verified; at most one decision
 *                         per result, because two verdicts on one result is
 *                         an ambiguity with no correct reading
 */

import { InvariantViolation, MissingPrerequisite, IllegalTransition } from './errors.js';
import type { EvaluationOutcome } from './evaluation.js';
import { VERIFICATION_OUTCOMES, type VerificationOutcome } from './evaluation.js';
import { EVIDENCE_STATES, evidenceOrdinal, type EvidenceState } from './evidence-state.js';

export { VERIFICATION_OUTCOMES, type VerificationOutcome };

/* ───────────────────────────── lifecycles ──────────────────────────────── */

/** Evaluation attempt lifecycle (docs/blueprint/21 §4). */
export const EVALUATION_STATES = [
  'queued', 'running', 'completed', 'failed', 'queued_for_human', 'disputed', 'revised',
] as const;
export type EvaluationState = (typeof EVALUATION_STATES)[number];

const EVALUATION_TRANSITIONS: Readonly<Record<EvaluationState, readonly EvaluationState[]>> = {
  queued:           ['running'],
  running:          ['completed', 'failed'],
  completed:        ['disputed'],
  failed:           ['queued_for_human', 'queued'],
  queued_for_human: ['completed'],
  disputed:         ['revised'],
  // `revised` means a NEW evaluation superseded this one. Terminal here: the
  // new attempt is a different row, so this one never moves again.
  revised:          [],
};

/** Verification decision lifecycle (docs/blueprint/21 §5). */
export const VERIFICATION_STATES = [
  'pending', 'evaluating', 'accepted', 'downgraded', 'rejected',
  'escalated_to_human', 'human_resolved', 'exception_granted',
] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

const VERIFICATION_TRANSITIONS: Readonly<Record<VerificationState, readonly VerificationState[]>> = {
  pending:            ['evaluating'],
  evaluating:         ['accepted', 'downgraded', 'rejected', 'escalated_to_human'],
  escalated_to_human: ['human_resolved', 'exception_granted'],
  accepted:           [],
  downgraded:         [],
  rejected:           [],
  human_resolved:     [],
  exception_granted:  [],
};

export function assertEvaluationStateTransition(from: EvaluationState, to: EvaluationState): void {
  if (!EVALUATION_TRANSITIONS[from].includes(to)) {
    throw new IllegalTransition('evaluation', from, to, 'not in the evaluation lifecycle');
  }
}

export function assertVerificationStateTransition(from: VerificationState, to: VerificationState): void {
  if (!VERIFICATION_TRANSITIONS[from].includes(to)) {
    throw new IllegalTransition('verification', from, to, 'not in the verification lifecycle');
  }
}

/* ─────────────────────── the rule verification obeys ───────────────────── */

export interface VerificationInput {
  readonly evaluationOutcome: EvaluationOutcome;
  /** The level the evaluation would support on its own. */
  readonly proposedState: EvidenceState;
  /** The claim's current state. */
  readonly currentState: EvidenceState;
  readonly outcome: VerificationOutcome;
  readonly humanReviewerId?: string;
  readonly reason: string;
}

export interface VerificationDecision {
  readonly outcome: VerificationOutcome;
  /** The state the claim actually lands on after verification. */
  readonly resultingState: EvidenceState;
  readonly reason: string;
  readonly requiresHumanReviewer: boolean;
}

/**
 * Verification lowers or holds. It NEVER raises.
 *
 * doc 11 §7: "absolute constraint: it lowers or holds, and never raises. Its
 * safe mode on failure is reject/downgrade."
 */
export function decideVerification(input: VerificationInput): VerificationDecision {
  if (!input.reason || input.reason.trim() === '') {
    throw new MissingPrerequisite('reason', 'a verification decision with no recorded reason is not a decision');
  }

  const needsHuman: ReadonlySet<VerificationOutcome> = new Set([
    'escalated_to_human', 'exception_granted',
  ]);
  if (needsHuman.has(input.outcome) && !input.humanReviewerId) {
    throw new MissingPrerequisite(
      'humanReviewerId',
      `verification outcome '${input.outcome}' requires a named human reviewer`,
    );
  }

  switch (input.outcome) {
    case 'accepted': {
      if (evidenceOrdinal(input.proposedState) < evidenceOrdinal(input.currentState)) {
        throw new InvariantViolation(
          'INV-9',
          'verification may not accept a state below the current one; it holds or lowers explicitly',
          { proposed: input.proposedState, current: input.currentState },
        );
      }
      return {
        outcome: 'accepted',
        resultingState: input.proposedState,
        reason: input.reason,
        requiresHumanReviewer: false,
      };
    }
    case 'downgraded': {
      // Hold at the current state. Downgrading is refusing the promotion, not
      // demoting the user: v1 models no backward movement at all.
      return {
        outcome: 'downgraded',
        resultingState: input.currentState,
        reason: input.reason,
        requiresHumanReviewer: false,
      };
    }
    case 'rejected': {
      return {
        outcome: 'rejected',
        resultingState: input.currentState,
        reason: input.reason,
        requiresHumanReviewer: false,
      };
    }
    case 'escalated_to_human': {
      return {
        outcome: 'escalated_to_human',
        resultingState: input.currentState,
        reason: input.reason,
        requiresHumanReviewer: true,
      };
    }
    case 'exception_granted': {
      // D-012a: granting Verified from a single activity is an exception that
      // needs a named reviewer and a written exception reason.
      return {
        outcome: 'exception_granted',
        resultingState: input.proposedState,
        reason: input.reason,
        requiresHumanReviewer: true,
      };
    }
  }
}

/** Safe mode: on any verification failure, hold — never promote. */
export function verificationSafeState(currentState: EvidenceState): EvidenceState {
  return currentState;
}

/** Which evaluation outcomes are even eligible for a verification step. */
export function verificationApplies(outcome: EvaluationOutcome): boolean {
  return outcome === 'passed';
}

export const LADDER_TOP: EvidenceState = EVIDENCE_STATES[EVIDENCE_STATES.length - 1]!;
