/**
 * Withdrawn evidence (owner decision D-077).
 *
 * When evidence is withdrawn, what was derived from it stops being presented
 * as evidence-backed — immediately — but nothing is deleted. The asset moves
 * to `needs_review`, and may return to `active` only through an explicit
 * re-link to other evidence that qualifies on its own.
 */
import { DomainError, MissingPrerequisite } from './errors.js';
import { evidenceOrdinal, type EvidenceState } from './evidence-state.js';

export interface WithdrawalEffect {
  readonly assetId: string;
  readonly from: 'active';
  readonly to: 'needs_review';
  readonly evidenceBacked: false;
  readonly explanationAr: string;
}

export function effectOfWithdrawal(input: { readonly assetId: string; readonly evidenceId: string; readonly reason: string }): WithdrawalEffect {
  if (!input.reason?.trim()) throw new MissingPrerequisite('reason', 'withdrawing evidence needs a recorded reason');
  return {
    assetId: input.assetId, from: 'active', to: 'needs_review', evidenceBacked: false,
    // Non-punitive: the user did nothing wrong; the support behind a line changed.
    explanationAr: 'سُحب الدليل الذي كان يدعم هذا البند، فلم يعد يُعرض بوصفه مدعومًا بدليل. البند محفوظ كما هو، ويمكن إعادة ربطه بدليل آخر مؤهَّل.',
  };
}

export interface RelinkCandidate {
  readonly evidenceId: string;
  readonly skillId: string;
  readonly state: EvidenceState;
  readonly withdrawn: boolean;
  readonly ownerId: string;
}

/** Re-linking is allowed only to evidence that qualifies independently. */
export function assertRelinkAllowed(asset: { readonly skillId: string; readonly ownerId: string }, candidate: RelinkCandidate): void {
  if (candidate.ownerId !== asset.ownerId) throw new DomainError('re-link evidence must belong to the asset owner');
  if (candidate.withdrawn) throw new DomainError('withdrawn evidence cannot back an asset');
  if (candidate.skillId !== asset.skillId) throw new DomainError('re-link evidence must be for the same skill the asset claims');
  if (evidenceOrdinal(candidate.state) < evidenceOrdinal('demonstrated')) throw new DomainError(`evidence at '${candidate.state}' does not qualify on its own`);
}

/**
 * After a withdrawal the claim keeps its state (the ladder is forward-only,
 * D-052) but has no standing evidence behind it. A later evaluation that
 * would earn at least that state again RE-ESTABLISHES evidence: a new
 * evidence row, no transition row, no state change. Nothing is inferred; the
 * user did the work again and the rubric said so.
 */
export function reestablishmentAllowed(input: {
  readonly currentState: EvidenceState;
  readonly proposedState: EvidenceState | null;
  readonly primaryEvidenceStanding: boolean;
}): boolean {
  if (input.primaryEvidenceStanding) return false;
  if (!input.proposedState) return false;
  if (evidenceOrdinal(input.currentState) < evidenceOrdinal('demonstrated')) return false;
  return evidenceOrdinal(input.proposedState) >= evidenceOrdinal(input.currentState);
}
