/**
 * @naqla/domain — the canonical business rules of NAQLA.
 *
 * Framework-independent by contract. This package imports nothing but node:
 * builtins, and `npm run verify:boundaries` fails the build if that changes.
 * Next.js and NestJS CONSUME these rules; neither may redefine them.
 */

export * from './ids.js';
export * from './errors.js';
export * from './evidence-state.js';
export * from './evaluation.js';
export * from './provenance.js';
export * from './ai-disclosure.js';
export * from './claims.js';
export * from './scoring.js';
export * from './sharing.js';
export * from './invariants.js';
export * from './verification.js';
export * from './evaluator.js';
export * from './cv-bullet.js';
export * from './evidence-report.js';
export * from './production-limits.js';
export * from './progress.js';
export * from './uploads.js';

/** Version of the rule set. Bumped when a rule changes, via a CHG record. */
export const DOMAIN_RULESET_VERSION = '0.2.0';
