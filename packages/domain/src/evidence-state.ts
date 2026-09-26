/**
 * Evidence / skill states and their permitted transitions.
 *
 * Two vocabularies exist in the approved records and BOTH are preserved here,
 * because collapsing them would lose meaning:
 *
 *   Product records (docs/model/10, docs/blueprint/21):
 *     Observed -> Practiced -> Demonstrated -> Verified (+ Aging, Historical)
 *   Frozen design (docs/design/NAQLA-DESIGN-HANDOFF-FOR-CODE.md §8):
 *     Gap -> Self-reported -> Practiced -> Demonstrated -> Verified
 *
 * The design splits the records' `Observed` into two user-visible states:
 * `gap` (the role needs it, the user has done nothing) and `self_reported`
 * (the user claimed it, no project). Both map to `Observed` internally: neither
 * is publicly displayable (D-017), and neither may reach `demonstrated` without
 * an evaluated submission.
 *
 * `gap` is the ABSENCE of a claim, so it is an ordinal for display, never a
 * stored claim row. See DOMAIN-MODEL.md §Evidence State.
 */

import { IllegalTransition, InvariantViolation, MissingPrerequisite } from './errors.js';

/** User-facing states, in canonical forward order. Ordinal = array index. */
export const EVIDENCE_STATES = [
  'gap',
  'self_reported',
  'practiced',
  'demonstrated',
  'verified',
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** Internal claim level as named in the product records (docs/model/10 §2). */
export type ClaimLevel = 'observed' | 'practiced' | 'demonstrated' | 'verified';

/** Recency qualifier on a verified claim. Never a separate ladder step. */
export type RecencyStatus = 'current' | 'aging' | 'historical';

/** Non-ladder claim states. They suspend or hide; they never delete. */
export type ClaimSideState =
  | 'under_review'
  | 'withdrawn'
  | 'suspended'
  | 'superseded';

export function evidenceOrdinal(state: EvidenceState): number {
  return EVIDENCE_STATES.indexOf(state);
}

export function toClaimLevel(state: EvidenceState): ClaimLevel | null {
  switch (state) {
    case 'gap':
    case 'self_reported':
      return state === 'gap' ? null : 'observed';
    case 'practiced':
      return 'practiced';
    case 'demonstrated':
      return 'demonstrated';
    case 'verified':
      return 'verified';
  }
}

/* ────────────────────────── evidence source strength ────────────────────── */

/**
 * Source strength caps the level a claim can reach (docs/model/10).
 * Self-reported and third-party-asserted sources cap at `demonstrated`;
 * only platform-controlled or platform-observed work can reach `verified`.
 */
export const SOURCE_STRENGTHS = [
  'platform_controlled',
  'platform_observed',
  'third_party_asserted',
  'self_reported',
] as const;

export type EvidenceSourceStrength = (typeof SOURCE_STRENGTHS)[number];

export function levelCapForSource(strength: EvidenceSourceStrength): EvidenceState {
  switch (strength) {
    case 'platform_controlled':
    case 'platform_observed':
      return 'verified';
    case 'third_party_asserted':
    case 'self_reported':
      return 'demonstrated';
  }
}

/* ───────────────────────────── transition table ─────────────────────────── */

/** Who may cause a transition. AI is never on this list — see requiresHuman. */
export type TransitionActor = 'system' | 'human_reviewer' | 'user';

export interface TransitionRule {
  readonly id: string;
  readonly from: EvidenceState;
  readonly to: EvidenceState;
  /** What must have happened for this transition to be legal. */
  readonly trigger: string;
  /** Must an evaluated submission back this transition? */
  readonly requiresEvaluation: boolean;
  /** Must a named human reviewer sign the transition? */
  readonly requiresHumanReview: boolean;
  /** May an LLM *recommend* this transition to a user or reviewer? */
  readonly aiMayRecommend: boolean;
  /**
   * May an LLM *execute* this transition?
   * Permanently false for every row. Kept explicit so the answer is data,
   * not an unwritten assumption (INV-3).
   */
  readonly aiMayExecute: false;
  readonly actor: TransitionActor;
  /** Which approved record defines it. */
  readonly source: string;
}

export const TRANSITIONS: readonly TransitionRule[] = [
  {
    id: 'T-SELF',
    from: 'gap', to: 'self_reported',
    trigger: 'user adds a skill manually',
    requiresEvaluation: false, requiresHumanReview: false,
    aiMayRecommend: true, aiMayExecute: false,
    actor: 'user', source: 'handoff §8 · doc 10 T01',
  },
  {
    id: 'T-LINK',
    from: 'self_reported', to: 'practiced',
    trigger: 'user links a project that uses the skill',
    requiresEvaluation: false, requiresHumanReview: false,
    aiMayRecommend: true, aiMayExecute: false,
    actor: 'user', source: 'handoff §8',
  },
  {
    id: 'T-PRACTICE',
    from: 'gap', to: 'practiced',
    trigger: 'evaluated work below the skill threshold',
    requiresEvaluation: true, requiresHumanReview: false,
    aiMayRecommend: false, aiMayExecute: false,
    actor: 'system', source: 'doc 10 T02',
  },
  {
    id: 'T-DEMO-FROM-PRACTICED',
    from: 'practiced', to: 'demonstrated',
    trigger: 'short check / validation activity passed (V1·V2·V3)',
    requiresEvaluation: true, requiresHumanReview: false,
    aiMayRecommend: false, aiMayExecute: false,
    actor: 'system', source: 'doc 10 T03 · handoff §8',
  },
  {
    id: 'T-DEMO-FROM-SELF',
    from: 'self_reported', to: 'demonstrated',
    trigger: 'evaluated platform activity passed',
    requiresEvaluation: true, requiresHumanReview: false,
    aiMayRecommend: false, aiMayExecute: false,
    actor: 'system', source: 'doc 10 T03 · handoff §8',
  },
  {
    id: 'T-DEMO-FROM-GAP',
    from: 'gap', to: 'demonstrated',
    trigger: 'evaluated platform activity passed with no prior claim',
    requiresEvaluation: true, requiresHumanReview: false,
    aiMayRecommend: false, aiMayExecute: false,
    actor: 'system', source: 'handoff §8 — "(any <= 2) -> demonstrated"',
  },
  {
    id: 'T-VERIFY',
    from: 'demonstrated', to: 'verified',
    trigger: 'second-project technical review, V1–V8 complete',
    requiresEvaluation: true, requiresHumanReview: true,
    aiMayRecommend: false, aiMayExecute: false,
    actor: 'human_reviewer', source: 'doc 10 · standard 07 V1–V8 · handoff §8',
  },
];

/** Transitions the records name explicitly as NOT in v1. Kept as data. */
export const FORBIDDEN_TRANSITIONS: readonly {
  readonly from: EvidenceState; readonly to: EvidenceState; readonly reason: string;
}[] = [
  { from: 'verified', to: 'demonstrated', reason: 'backward movement is not modelled in v1 (handoff §8)' },
  { from: 'demonstrated', to: 'practiced', reason: 'backward movement is not modelled in v1 (handoff §8)' },
  { from: 'practiced', to: 'self_reported', reason: 'backward movement is not modelled in v1 (handoff §8)' },
  { from: 'self_reported', to: 'gap', reason: 'backward movement is not modelled in v1 (handoff §8)' },
  { from: 'practiced', to: 'verified', reason: 'verified requires a demonstrated claim first (V1–V8)' },
  { from: 'self_reported', to: 'verified', reason: 'verified requires a demonstrated claim first (V1–V8)' },
  { from: 'gap', to: 'verified', reason: 'verified requires a demonstrated claim first (V1–V8)' },
];

export function findTransition(
  from: EvidenceState,
  to: EvidenceState,
): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/* ───────────────────────────── transition guard ─────────────────────────── */

export interface TransitionRequest {
  readonly from: EvidenceState;
  readonly to: EvidenceState;
  /** Id of the evaluation backing this transition, when one exists. */
  readonly evaluationId?: string;
  /** Frozen rubric version the evaluation ran against (INV-2). */
  readonly rubricVersion?: string;
  /** Strength of the source the evidence came from. */
  readonly sourceStrength?: EvidenceSourceStrength;
  /** Id of the human reviewer who signed the decision, when required. */
  readonly humanReviewerId?: string;
  /** Who is attempting the transition. */
  readonly actor: TransitionActor | 'ai_agent';
}

/**
 * The single place an evidence state may change.
 *
 * It is deterministic: same request, same answer, no model call, no I/O.
 * Callers in NestJS or Next.js must route every promotion through this and
 * are forbidden from re-deriving the rules (see verify-boundaries.mjs).
 */
export function assertTransitionAllowed(req: TransitionRequest): TransitionRule {
  if (req.actor === 'ai_agent') {
    throw new InvariantViolation(
      'INV-3',
      'an AI agent may recommend an evidence transition but never execute one',
      { from: req.from, to: req.to },
    );
  }

  const forbidden = FORBIDDEN_TRANSITIONS.find(
    (f) => f.from === req.from && f.to === req.to,
  );
  if (forbidden) {
    throw new IllegalTransition('evidence', req.from, req.to, forbidden.reason);
  }

  if (evidenceOrdinal(req.to) <= evidenceOrdinal(req.from)) {
    throw new IllegalTransition(
      'evidence', req.from, req.to,
      'evidence moves forward or stays; v1 models no backward movement',
    );
  }

  const rule = findTransition(req.from, req.to);
  if (!rule) {
    throw new IllegalTransition(
      'evidence', req.from, req.to, 'no transition rule defines this pair',
    );
  }

  if (rule.requiresEvaluation) {
    if (!req.evaluationId) {
      throw new MissingPrerequisite(
        'evaluationId',
        `${rule.id} requires an evaluated submission; none was supplied`,
      );
    }
    // INV-2: no evaluation without a frozen, published rubric version.
    if (!req.rubricVersion) {
      throw new InvariantViolation(
        'INV-2',
        `${rule.id} relies on an evaluation, and no evaluation exists without a published rubric_version`,
        { evaluationId: req.evaluationId },
      );
    }
  }

  if (rule.requiresHumanReview && !req.humanReviewerId) {
    throw new MissingPrerequisite(
      'humanReviewerId',
      `${rule.id} requires a named human reviewer; verified is never granted automatically`,
    );
  }

  if (req.sourceStrength) {
    const cap = levelCapForSource(req.sourceStrength);
    if (evidenceOrdinal(req.to) > evidenceOrdinal(cap)) {
      throw new IllegalTransition(
        'evidence', req.from, req.to,
        `source strength '${req.sourceStrength}' caps this claim at '${cap}'`,
      );
    }
  }

  return rule;
}

/* ─────────────────────────── presentation eligibility ───────────────────── */

/** Where a claim at a given state may appear. Derived from handoff §8. */
export interface PresentationEligibility {
  readonly publiclyDisplayable: boolean;
  readonly cv: 'no' | 'project_description_only' | 'bullet';
  readonly linkedIn: 'no' | 'project_mention_only' | 'skill';
  /** True when listing it as expertise would be an unsupported claim. */
  readonly unsupportedIfClaimedAsExpertise: boolean;
  /**
   * The §8 table's "no (flag if present)" column. `gap` and `self_reported`
   * are both absent from a CV, but they are not the same thing: a
   * self-reported skill the user HAS put in their CV must be surfaced as an
   * unsupported claim, whereas a gap is simply a skill they never claimed.
   * Collapsing the two would lose the recruiter-facing flag.
   */
  readonly flagIfPresentInCv: boolean;
}

export function presentationFor(state: EvidenceState): PresentationEligibility {
  switch (state) {
    case 'gap':
      return {
        publiclyDisplayable: false, cv: 'no', linkedIn: 'no',
        unsupportedIfClaimedAsExpertise: true, flagIfPresentInCv: false,
      };
    case 'self_reported':
      return {
        publiclyDisplayable: false, cv: 'no', linkedIn: 'no',
        unsupportedIfClaimedAsExpertise: true, flagIfPresentInCv: true,
      };
    case 'practiced':
      return {
        publiclyDisplayable: true, cv: 'project_description_only', linkedIn: 'project_mention_only',
        unsupportedIfClaimedAsExpertise: true, flagIfPresentInCv: false,
      };
    case 'demonstrated':
      return {
        publiclyDisplayable: true, cv: 'bullet', linkedIn: 'skill',
        unsupportedIfClaimedAsExpertise: false, flagIfPresentInCv: false,
      };
    case 'verified':
      return {
        publiclyDisplayable: true, cv: 'bullet', linkedIn: 'skill',
        unsupportedIfClaimedAsExpertise: false, flagIfPresentInCv: false,
      };
  }
}
