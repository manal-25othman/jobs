/**
 * Privacy and share eligibility.
 *
 * Default state is private. Public or shared access is explicit, revocable,
 * and never reaches raw private uploads or private companion conversations.
 */

import { DomainError, InvariantViolation } from './errors.js';
import { EvidenceState, evidenceOrdinal } from './evidence-state.js';

export const VISIBILITIES = ['private', 'shared_by_link', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Classification drives what may ever leave the account. */
export const PRIVACY_CLASSES = [
  /** Never leaves the account by any path. */
  'private_never_shareable',
  /** Private by default; the user may share a derived, approved form. */
  'private_shareable_derived',
  /** Private by default; the user may publish it as is, after approval. */
  'private_publishable',
  /** Platform content with no personal data. */
  'non_personal',
] as const;

export type PrivacyClass = (typeof PRIVACY_CLASSES)[number];

export interface ShareableResource {
  readonly kind: string;
  readonly privacyClass: PrivacyClass;
  readonly visibility: Visibility;
  /** Explicit user approval for this exact artefact, when required. */
  readonly userApprovedAt: string | null;
}

/**
 * The hard boundary: these never become reachable through a recruiter report,
 * a public profile or a share link, whatever the user's settings say.
 */
const NEVER_SHAREABLE: ReadonlySet<string> = new Set([
  'raw_upload',
  'submission_file',
  'companion_conversation',
  'ai_prompt_log',
  'audit_event',
  'human_review_note',
  'integrity_check_detail',
]);

export function assertNotExposed(resourceKind: string, via: string): void {
  if (NEVER_SHAREABLE.has(resourceKind)) {
    throw new InvariantViolation(
      'INV-6',
      `'${resourceKind}' must never be reachable through '${via}'`,
      { resourceKind, via },
    );
  }
}

export interface ShareDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly requiresApproval: boolean;
}

export function canShare(resource: ShareableResource, target: Visibility): ShareDecision {
  if (target === 'private') {
    return { allowed: true, reason: 'making something private is always permitted', requiresApproval: false };
  }
  if (resource.privacyClass === 'private_never_shareable') {
    return { allowed: false, reason: `'${resource.kind}' is never shareable`, requiresApproval: false };
  }
  if (resource.privacyClass === 'private_shareable_derived') {
    return {
      allowed: false,
      reason: `'${resource.kind}' may only be shared as an approved derived artefact, not directly`,
      requiresApproval: true,
    };
  }
  if (!resource.userApprovedAt) {
    return {
      allowed: false,
      reason: 'explicit user approval is required before anything becomes visible outside the account',
      requiresApproval: true,
    };
  }
  return { allowed: true, reason: 'approved by the user and publishable', requiresApproval: false };
}

/** A claim below `demonstrated` is never publicly displayable (D-017). */
export function publiclyDisplayable(state: EvidenceState): boolean {
  return evidenceOrdinal(state) >= evidenceOrdinal('practiced');
}

/* ───────────────────────────────── share links ──────────────────────────── */

export interface ShareLinkPolicy {
  /** Null means no expiry was set — which the domain refuses. */
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly indexable: boolean;
}

/**
 * OPEN-016 is still open (public case-study link rules: indexing, expiry,
 * revocation). Until it closes, the domain enforces the conservative reading:
 * every share link expires, and none is indexable.
 */
export function assertShareLinkPolicyValid(p: ShareLinkPolicy): void {
  if (!p.expiresAt) {
    throw new DomainError(
      'a share link must carry an expiry; OPEN-016 is unresolved and the safe reading applies',
    );
  }
  if (p.indexable) {
    throw new DomainError(
      'search-engine indexing of share links is not approved; OPEN-016 is unresolved',
    );
  }
}

export function shareLinkActive(p: ShareLinkPolicy, now: string): boolean {
  if (p.revokedAt) return false;
  if (!p.expiresAt) return false;
  return new Date(p.expiresAt).getTime() > new Date(now).getTime();
}
