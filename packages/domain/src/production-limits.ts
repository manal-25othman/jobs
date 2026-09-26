/**
 * Production limits — what the product may claim today, as data.
 *
 * Owner decision (D-059): `Verified` stays blocked. `Demonstrated` is the
 * highest evidence state a production path may reach until SME approval and
 * the independent verification workflow exist. The rules for `verified` stay
 * in the ladder (they are tested), but no production write may land on it.
 */

import { InvariantViolation } from './errors.js';
import { evidenceOrdinal, type EvidenceState } from './evidence-state.js';

export const HIGHEST_AVAILABLE_EVIDENCE_STATE: EvidenceState = 'demonstrated';

/** Refuses any production transition above the currently available ceiling. */
export function assertStateAvailableInProduction(to: EvidenceState): void {
  if (evidenceOrdinal(to) > evidenceOrdinal(HIGHEST_AVAILABLE_EVIDENCE_STATE)) {
    throw new InvariantViolation(
      'INV-9',
      `'${to}' is not available in production yet: SME approval and the independent ` +
        `verification workflow are not implemented (D-059). Highest available state is ` +
        `'${HIGHEST_AVAILABLE_EVIDENCE_STATE}'.`,
      { to, ceiling: HIGHEST_AVAILABLE_EVIDENCE_STATE },
    );
  }
}
