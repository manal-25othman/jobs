/**
 * AI usage disclosure — docs/standards/08-ai-usage-policy.md.
 *
 * The governing rule: disclosure never lowers a score by itself. What matters
 * is what the user did, what AI helped with, and whether the user can explain
 * and defend the work.
 */

import { DomainError, InvariantViolation } from './errors.js';

/** Declared on the activity spec, not chosen per submission. */
export const AI_USAGE_MODES = ['ai_prohibited', 'ai_assisted', 'ai_expected'] as const;
export type AiUsageMode = (typeof AI_USAGE_MODES)[number];

/** What the user says AI helped with. Free of penalty by itself. */
export interface AiDisclosureRecord {
  readonly id: string;
  readonly submissionId: string;
  readonly mode: AiUsageMode;
  readonly userDeclaredUse: readonly string[];
  readonly declaredAt: string;
  /** The user's own account of what they understood and decided. */
  readonly userExplanation: string | null;
}

/**
 * Triangulation signals (I1–I6). They are inputs to a human conversation,
 * never an automatic verdict, and never a score penalty on their own.
 */
export const TRIANGULATION_SIGNALS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6'] as const;
export type TriangulationSignal = (typeof TRIANGULATION_SIGNALS)[number];

/** Non-punitive ladder N0–N4. Escalation is a response, not a punishment. */
export const DISCLOSURE_LADDER = ['N0', 'N1', 'N2', 'N3', 'N4'] as const;
export type DisclosureLadderStep = (typeof DISCLOSURE_LADDER)[number];

export interface DisclosureAssessmentInput {
  readonly mode: AiUsageMode;
  readonly disclosed: boolean;
  readonly signalsRaised: readonly TriangulationSignal[];
  /** Did the user demonstrate they can explain and defend the work? */
  readonly canDefendWork: boolean | null;
}

export interface DisclosureAssessment {
  readonly step: DisclosureLadderStep;
  readonly scorePenaltyApplied: false;
  readonly reason: string;
  readonly requiresHumanConversation: boolean;
}

/**
 * Maps signals to a ladder step. Deterministic, and it never returns a score
 * adjustment — the return type forbids one.
 */
export function assessDisclosure(input: DisclosureAssessmentInput): DisclosureAssessment {
  if (input.mode === 'ai_prohibited' && input.signalsRaised.length > 0) {
    return {
      step: input.canDefendWork === false ? 'N4' : 'N3',
      scorePenaltyApplied: false,
      reason: 'signals raised on an activity where AI use is prohibited',
      requiresHumanConversation: true,
    };
  }

  const n = input.signalsRaised.length;
  if (n === 0) {
    return {
      step: 'N0', scorePenaltyApplied: false,
      reason: 'no triangulation signal raised',
      requiresHumanConversation: false,
    };
  }
  if (n === 1) {
    return {
      step: 'N1', scorePenaltyApplied: false,
      reason: 'a single signal is noise until corroborated',
      requiresHumanConversation: false,
    };
  }
  if (input.canDefendWork === true) {
    return {
      step: 'N1', scorePenaltyApplied: false,
      reason: 'signals raised, and the user explained and defended the work',
      requiresHumanConversation: false,
    };
  }
  return {
    step: n >= 4 ? 'N3' : 'N2',
    scorePenaltyApplied: false,
    reason: `${n} corroborating signals; a human conversation decides, not the model`,
    requiresHumanConversation: true,
  };
}

/** Disclosing AI use must never, by itself, reduce an evaluation score. */
export function assertDisclosureDidNotLowerScore(
  scoreWithoutDisclosure: number,
  scoreWithDisclosure: number,
): void {
  if (scoreWithDisclosure < scoreWithoutDisclosure) {
    throw new DomainError(
      'disclosing AI use lowered the score, which the AI usage policy forbids',
      { scoreWithoutDisclosure, scoreWithDisclosure },
    );
  }
}

/** An `ai_prohibited` activity may not be submitted with declared AI authoring. */
export function assertModeRespected(rec: Pick<AiDisclosureRecord, 'mode' | 'userDeclaredUse'>): void {
  if (rec.mode === 'ai_prohibited' && rec.userDeclaredUse.length > 0) {
    throw new InvariantViolation(
      'INV-7',
      'the activity spec declares ai_prohibited; declared AI authoring contradicts the spec it was assigned under',
      { declared: rec.userDeclaredUse },
    );
  }
}
