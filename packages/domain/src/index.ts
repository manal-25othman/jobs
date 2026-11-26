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
export * from './withdrawal.js';
export * from './career-data.js';
export * from './human-review.js';
export * from './evidence-items.js';
export * from './skill-progress.js';
export * from './verification-policy.js';
export * from './configuration.js';
export * from './readiness.js';
export * from './disclosure-questionnaire.js';
export * from './integrity.js';
export * from './pack-constraints.js';
export * from './verification-integrity.js';
export * from './activity-catalogue.js';
export * from './skill-attribution.js';
export * from './per-skill-assessment.js';
export * from './evidence-path.js';
export * from './text-fingerprint.js';
export * from './integrated-assessment.js';
export * from './professional-classification.js';

/** Version of the rule set. Bumped when a rule changes, via a CHG record. */
export const DOMAIN_RULESET_VERSION = '0.21.0';
export * from './career-claims.js';
export * from './admin-governance.js';
export * from './workspace-draft.js';
export * from './activity-materials.js';
export * from './learning-recommendation.js';
export * from './career-guidance.js';
export * from './self-assessment.js';
export * from './virtual-manager.js';
export * from './test-run.js';
export * from './github-integration.js';
export * from './assessment-suggestion.js';
