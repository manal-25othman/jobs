/**
 * @naqla/contracts — the wire contracts.
 *
 * Depends only on @naqla/domain, so a contract can never drift from a rule
 * without a type error. It knows nothing about HTTP frameworks.
 */
export * from './envelope.js';
export * from './slice-1.js';
