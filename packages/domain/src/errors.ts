/**
 * Domain errors.
 *
 * A violated invariant throws. It never returns a falsy value that a caller can
 * ignore, and it never degrades silently — INV-8 requires every meaningful act
 * to be observable, and a silent rule failure is the opposite of that.
 */

export type InvariantCode =
  | 'INV-1' | 'INV-2' | 'INV-3' | 'INV-4' | 'INV-5'
  | 'INV-6' | 'INV-7' | 'INV-8' | 'INV-9';

export class DomainError extends Error {
  override readonly name: string = 'DomainError';
  constructor(message: string, readonly details?: Readonly<Record<string, unknown>>) {
    super(message);
  }
}

/** Thrown when one of the nine architectural invariants would be broken. */
export class InvariantViolation extends DomainError {
  override readonly name = 'InvariantViolation';
  constructor(
    readonly invariant: InvariantCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(`[${invariant}] ${message}`, details);
  }
}

/** Thrown when a state machine is asked for a transition it does not define. */
export class IllegalTransition extends DomainError {
  override readonly name = 'IllegalTransition';
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
    reason: string,
  ) {
    super(`[${machine}] ${from} -> ${to} is not permitted: ${reason}`, {
      machine, from, to,
    });
  }
}

/** Thrown when a rule needs a value the caller has not supplied or approved. */
export class MissingPrerequisite extends DomainError {
  override readonly name = 'MissingPrerequisite';
  constructor(readonly prerequisite: string, message: string) {
    super(message, { prerequisite });
  }
}
