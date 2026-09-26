/**
 * Provenance — INV-5: every fact carries where it came from.
 *
 * A fact with no provenance is not a fact the product may display, project into
 * a CV, or put in front of a recruiter.
 */

import { InvariantViolation } from './errors.js';

export const PROVENANCE_CLASSES = [
  /** From a named, citable authority (a standard, a published taxonomy). */
  'authoritative',
  /** Reviewed and approved by a subject-matter expert before publication. */
  'curated',
  /** Produced by a model. Never displayable as a user claim on its own. */
  'ai_generated',
  /** Stated by the user about themselves. */
  'user_generated',
  /** Computed deterministically by the platform from other facts. */
  'system_derived',
] as const;

export type ProvenanceClass = (typeof PROVENANCE_CLASSES)[number];

export interface Provenance {
  readonly class: ProvenanceClass;
  /** Human-readable origin: a rubric id, a URL, an evaluation id, a user id. */
  readonly source: string;
  readonly recordedAt: string;
  /**
   * True when a model helped *phrase* something whose substance came from
   * elsewhere. A drafting aid is not the same as an AI-generated fact:
   * wording assistance never changes the provenance class of the substance.
   */
  readonly draftingAid?: 'ai_assisted';
  /** Version of the policy or spec that produced it, when applicable. */
  readonly policyVersion?: string;
}

export function assertHasProvenance(
  fact: { readonly provenance?: Provenance | null },
  what: string,
): asserts fact is { readonly provenance: Provenance } {
  if (!fact.provenance || !fact.provenance.class || !fact.provenance.source) {
    throw new InvariantViolation('INV-5', `${what} carries no provenance`, { what });
  }
}

/**
 * INV-4 — no market information without a tagged source.
 * "7 of 10 job ads require this" is a market fact and needs a citable origin.
 */
export interface MarketFact {
  readonly statement: string;
  readonly provenance?: Provenance | null;
  readonly observedAt?: string;
  readonly sampleSize?: number;
}

export function assertMarketFactSourced(fact: MarketFact): void {
  if (!fact.provenance) {
    throw new InvariantViolation(
      'INV-4', 'market information must carry a tagged source', { statement: fact.statement },
    );
  }
  if (fact.provenance.class === 'ai_generated') {
    throw new InvariantViolation(
      'INV-4',
      'a market claim may not rest on model output alone; it needs an authoritative or curated source',
      { statement: fact.statement, class: fact.provenance.class },
    );
  }
  if (!fact.observedAt) {
    throw new InvariantViolation(
      'INV-4', 'market information must carry the date it was observed', { statement: fact.statement },
    );
  }
}
