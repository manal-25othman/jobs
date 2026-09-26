/**
 * Deterministic progress (owner decision D-058).
 *
 * Before submission there is no persisted measurement, so progress is a count
 * — "2 of 5 required outputs completed" — never a percentage. A percentage
 * may appear only when it is derived from persisted, measurable state, and
 * this module refuses to produce one from anything else.
 */

import { MissingPrerequisite } from './errors.js';

export interface DeliverableStatus {
  readonly key: string;
  readonly required: boolean;
  readonly completed: boolean;
}

export interface DeliverableProgress {
  readonly completedRequired: number;
  readonly totalRequired: number;
  readonly completedOptional: number;
  readonly totalOptional: number;
  /** Always a count phrase. No percentage exists on this type. */
  readonly labelAr: string;
  readonly labelEn: string;
  readonly allRequiredDone: boolean;
}

export function deliverableProgress(items: readonly DeliverableStatus[]): DeliverableProgress {
  const required = items.filter((i) => i.required);
  const optional = items.filter((i) => !i.required);
  const completedRequired = required.filter((i) => i.completed).length;
  const completedOptional = optional.filter((i) => i.completed).length;
  return {
    completedRequired,
    totalRequired: required.length,
    completedOptional,
    totalOptional: optional.length,
    labelAr: `${completedRequired} من ${required.length} مخرجات إلزامية مكتملة`,
    labelEn: `${completedRequired} of ${required.length} required outputs completed`,
    allRequiredDone: required.length > 0 && completedRequired === required.length,
  };
}

/**
 * A percentage is allowed only from persisted, measurable state. The caller
 * must name where the numbers were persisted; an unnamed source is refused.
 */
export function persistedPercentage(input: {
  readonly numerator: number;
  readonly denominator: number;
  readonly persistedIn: string;
}): number {
  if (!input.persistedIn || input.persistedIn.trim() === '') {
    throw new MissingPrerequisite(
      'persistedIn',
      'a percentage may only be derived from persisted measurable state; name where it is persisted',
    );
  }
  if (input.denominator <= 0) {
    throw new MissingPrerequisite('denominator', 'a percentage needs a positive denominator');
  }
  return Math.round((input.numerator / input.denominator) * 100);
}
