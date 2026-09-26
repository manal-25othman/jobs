/**
 * Supported vs unsupported claims.
 *
 * A claim the user makes about themselves is "supported" only when evidence at
 * `demonstrated` or above backs it. Anything below that, presented as
 * expertise, is an unsupported claim — an attention state with a recruiter
 * note, never a silent pass (frozen design §8).
 */

import { InvariantViolation } from './errors.js';
import { EvidenceState, evidenceOrdinal, presentationFor } from './evidence-state.js';

export type ClaimStrength = 'supported' | 'in_progress' | 'unsupported';

export interface SkillClaim {
  readonly skillId: string;
  readonly state: EvidenceState;
  /** How the user presents it in their own words. */
  readonly presentedAs: 'expertise' | 'project_work' | 'learning' | 'not_presented';
  /** Ids of evidence rows backing it. Length 0 means nothing backs it. */
  readonly evidenceIds: readonly string[];
}

export interface ClaimAssessment {
  readonly skillId: string;
  readonly strength: ClaimStrength;
  readonly reason: string;
  /** True when it lowers recruiter confidence and should be flagged. */
  readonly lowersConfidence: boolean;
  readonly suggestedFix: string | null;
}

export function assessClaim(claim: SkillClaim): ClaimAssessment {
  const presentation = presentationFor(claim.state);
  const isProven = evidenceOrdinal(claim.state) >= evidenceOrdinal('demonstrated');

  if (claim.presentedAs === 'expertise' && presentation.unsupportedIfClaimedAsExpertise) {
    return {
      skillId: claim.skillId,
      strength: 'unsupported',
      reason: `presented as expertise while the evidence state is '${claim.state}'`,
      lowersConfidence: true,
      suggestedFix: 'remove it, or move it to "working on it"',
    };
  }

  if (isProven) {
    return {
      skillId: claim.skillId,
      strength: 'supported',
      reason: `backed by ${claim.evidenceIds.length} evidence record(s) at '${claim.state}'`,
      lowersConfidence: false,
      suggestedFix: null,
    };
  }

  if (claim.state === 'practiced') {
    return {
      skillId: claim.skillId,
      strength: 'in_progress',
      reason: 'appears in the user’s own project; not evaluated yet',
      lowersConfidence: false,
      suggestedFix: 'a short check turns this into evidence',
    };
  }

  return {
    skillId: claim.skillId,
    strength: 'unsupported',
    reason: `no project or evaluation supports it (state '${claim.state}')`,
    lowersConfidence: claim.presentedAs !== 'not_presented',
    suggestedFix: 'link a project that shows it',
  };
}

/**
 * INV-1 — no Claim without Evidence.
 *
 * At `demonstrated` and above a claim must reference at least one evidence
 * record. In the database this is a foreign key plus a check constraint; this
 * function is the same rule for callers that build a claim in memory first.
 */
export function assertClaimHasEvidence(claim: SkillClaim): void {
  const needsEvidence = evidenceOrdinal(claim.state) >= evidenceOrdinal('demonstrated');
  if (needsEvidence && claim.evidenceIds.length === 0) {
    throw new InvariantViolation(
      'INV-1',
      `a claim at '${claim.state}' cannot exist without at least one evidence record`,
      { skillId: claim.skillId, state: claim.state },
    );
  }
}

/* ───────────────────── projection eligibility (CV / LinkedIn) ───────────── */

export interface ProjectionEligibility {
  readonly eligible: boolean;
  readonly as: 'bullet' | 'skill' | 'project_description_only' | 'project_mention_only' | null;
  readonly reason: string;
}

export function cvEligibility(claim: SkillClaim): ProjectionEligibility {
  const p = presentationFor(claim.state);
  if (p.cv === 'no') {
    return { eligible: false, as: null, reason: `state '${claim.state}' is not presentable in a CV` };
  }
  if (p.cv === 'bullet') {
    assertClaimHasEvidence(claim);
    return { eligible: true, as: 'bullet', reason: 'evidence-backed, may appear as an achievement bullet' };
  }
  return {
    eligible: true, as: 'project_description_only',
    reason: 'may be mentioned inside a project description, never as a skill claim',
  };
}

export function linkedInEligibility(claim: SkillClaim): ProjectionEligibility {
  const p = presentationFor(claim.state);
  if (p.linkedIn === 'no') {
    return { eligible: false, as: null, reason: `state '${claim.state}' is not presentable on LinkedIn` };
  }
  if (p.linkedIn === 'skill') {
    assertClaimHasEvidence(claim);
    return { eligible: true, as: 'skill', reason: 'evidence-backed, may be added as a LinkedIn skill' };
  }
  return {
    eligible: true, as: 'project_mention_only',
    reason: 'may be mentioned within a project entry, never added as a skill',
  };
}

/* ───────────────────────── recruiter report eligibility ─────────────────── */

export interface RecruiterReportItem {
  readonly observation: string;
  /** Every item must point at a concrete field or evidence row in the account. */
  readonly tracesTo: { readonly kind: 'field' | 'evidence'; readonly ref: string } | null;
  readonly movesScore: 'cv' | 'linkedin' | 'profile' | null;
  readonly expectedDelta: number | null;
}

/**
 * Frozen design §9: "every recommendation points at a piece of information or
 * evidence in the user's account, not at a general estimate."
 */
export function assertRecruiterItemTraceable(item: RecruiterReportItem): void {
  if (!item.tracesTo) {
    throw new InvariantViolation(
      'INV-5',
      'a recruiter-report item must trace to a concrete field or evidence record',
      { observation: item.observation },
    );
  }
}

/** A report may be generated only from claims that are already assessable. */
export function recruiterReportEligible(claims: readonly SkillClaim[]): {
  readonly eligible: boolean;
  readonly reason: string;
} {
  if (claims.length === 0) {
    return { eligible: false, reason: 'no skills recorded yet; there is nothing to review' };
  }
  const anyEvidence = claims.some(
    (c) => evidenceOrdinal(c.state) >= evidenceOrdinal('practiced'),
  );
  if (!anyEvidence) {
    return {
      eligible: false,
      reason: 'no project or evaluation exists yet; a review would be generic advice, not a review',
    };
  }
  return { eligible: true, reason: 'at least one skill has real work behind it' };
}
